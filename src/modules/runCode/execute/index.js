/**
 * Execute Dispatcher Module
 * 代码执行调度层 - 在 Embedded Console 和 External App 之间路由
 * 
 * Wave 2 实现：创建统一接口，检查 Embedded Console 可用性并路由
 */

const vscode = require('vscode');
const os = require('os');
const path = require('path');
const variableSuggestions = require('../../variableSuggestionService');

// 工具函数导入
const { isWindows, isMacOS, isLinux, showInfo, showWarn, showError, showConsoleUnavailableToast, stripSurroundingQuotes, msg } = require('../../../utils/common');
const capability = require('../../capability');
const config = require('../../../utils/config');
const completionSound = require('../embeddedConsole/completionSound');
const { ensureStataConfigured } = require('../stataInstallationResolver');

// External App 执行函数导入
const { runOnMac } = require('../externalApp/mac');
const { runOnWindows } = require('../externalApp/windows');

// Embedded Console 执行函数导入
const { runOnMacWebview } = require('../embeddedConsole/mac');
const { runOnWindowsEmbeddedConsole } = require('../embeddedConsole/windows');
const { runOnLinuxEmbeddedConsole } = require('../embeddedConsole/linux');
const { routeBrowseCommand, shouldRouteBrowseCommand, splitBrowseCommandSegments } = require('../browseCommand');
const { routeConsoleUnsupportedCommand } = require('../consoleCompatibility');
const { containsSaioCommand } = require('../saioCommandGuard');

// 临时文件处理
const { cleanupTempFile, getTempFilePath } = require('./tempfile');
const {
    getAttachedCommentRunRange,
    getSectionRunRange,
    getInclusiveSelectionEndLine,
    getRunTarget,
    isCursorOnHeading,
    isSectionHeaderLine
} = require('./runTarget');

const RUN_TARGET_CONTEXT_KEY = 'stata-all-in-one.runTarget';
const CURSOR_ON_HEADING_CONTEXT_KEY = 'stata-all-in-one.cursorOnHeading';
const RUN_COMMANDS = [
    'stata-all-in-one.runSection',
    'stata-all-in-one.runLine',
    'stata-all-in-one.runSelection',
    'stata-all-in-one.runSectionWithShiftShortcut',
    'stata-all-in-one.runLineWithShiftShortcut',
    'stata-all-in-one.runSelectionWithShiftShortcut'
];

async function invalidateConsoleDataViewer() {
    try {
        const viewer = require('../embeddedConsole/dataViewer/panel');
        if (viewer.updateDataViewerData) await viewer.updateDataViewerData();
    } catch (_) {}
}

/**
 * 获取要运行的代码
 * 基于当前选择或节来确定要执行的代码范围
 * 
 * @param {vscode.TextEditor} editor - VS Code 文本编辑器
 * @returns {string} - 要执行的代码内容
 */
function getCodeToRun(editor) {
    const document = editor.document;
    const selection = editor.selection;

    if (!selection.isEmpty) {
        // 运行选中的代码（完整行）
        const startLine = selection.start.line;
        const endLine = getInclusiveSelectionEndLine(selection);
        
        const startPos = new vscode.Position(startLine, 0);
        const endLineText = document.lineAt(endLine);
        const endPos = new vscode.Position(endLine, endLineText.text.length);
        
        return document.getText(new vscode.Range(startPos, endPos));
    } else {
        // 未选中：检查当前行是否是标题行
        const currentLine = editor.selection.active.line;
        const lineText = document.lineAt(currentLine).text;
        if (isSectionHeaderLine(lineText)) {
            // 标题与紧邻的装饰分隔线一起运行，下一节的上边框归下一节。
            const { startLine, endLine } = getSectionRunRange(document, currentLine);
            const startPos = new vscode.Position(startLine, 0);
            const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);
            
            return document.getText(new vscode.Range(startPos, endPos));
        } else {
            // 普通注释与紧随其后的代码共享一个 run；代码行也携带紧邻的前置注释。
            const { startLine, endLine } = getAttachedCommentRunRange(document, currentLine);
            const endLineObj = document.lineAt(endLine);
            const startPos = new vscode.Position(startLine, 0);
            const endPos = new vscode.Position(endLine, endLineObj.text.length);
            
            return document.getText(new vscode.Range(startPos, endPos));
        }
    }
}

/**
 * 主调度函数：运行当前节/行/选区
 * 检查 Embedded Console 可用性，路由到 Embedded Console 或 External App 执行路径
 * 
 * @param {vscode.ExtensionContext} context - VS Code 扩展上下文
 * @param {vscode.TextEditor} editor - VS Code 文本编辑器（可选，默认使用 activeTextEditor）
 * @returns {Promise<void>}
 */
async function runCurrentSection(context, editor = null) {
    // 获取编辑器
    const activeEditor = editor || vscode.window.activeTextEditor;
    if (!activeEditor) {
        showError(msg('noEditor'));
        return;
    }

    const document = activeEditor.document;
    if (document.languageId !== 'stata') {
        return;
    }

    // 平台检查
    const onWindows = isWindows();
    const onMac = isMacOS();
    const onLinux = isLinux();

    if (!onWindows && !onMac && !onLinux) {
        showError(msg('unsupportedPlatform'));
        return;
    }

    // 获取要运行的代码
    const originalCode = getCodeToRun(activeEditor);

    const codeToRun = originalCode;
    const runMode = config.getRunMode();
    const completionSoundSettings = config.getConsoleCompletionSound();

    if (runMode === config.RUN_MODES.embeddedConsole) {
        const terminal = require('../embeddedConsole/panel');
        if (terminal.isWebviewTerminalRunning && terminal.isWebviewTerminalRunning()) {
            showWarn(msg('consoleBusyAction'));
            return;
        }
    }

    if (containsSaioCommand(codeToRun)) {
        showWarn(msg('saioCommandUnavailableInVscode'));
        return;
    }

    completionSound.getService().stop();

    if (shouldRouteBrowseCommand(runMode)) {
        const compatibilityResult = await routeConsoleUnsupportedCommand(codeToRun);
        if (compatibilityResult) {
            return;
        }
    }

    if (shouldRouteBrowseCommand(runMode)) {
        const segments = splitBrowseCommandSegments(codeToRun);
        if (segments.some(segment => segment.type === 'browse')) {
            await runBrowseExecutionPlan(context, segments, {
                docDir: path.dirname(document.fileName),
                outputMode: runMode,
                completionSoundSettings
            });
            return;
        }
    }

    const stataPathOnWindows = await ensurePlatformExecutionReady(context, { onWindows, onMac, onLinux });
    if (onWindows && !stataPathOnWindows) {
        return;
    }

    // 获取文档目录
    const docDir = path.dirname(document.fileName);

    // 创建临时文件路径（用于 External App 模式）
    const tmpFilePath = getTempFilePath();

    try {
        // === 调度逻辑 ===
        
        if (onWindows) {
            if (runMode === config.RUN_MODES.externalApp) {
                await runOnWindows(codeToRun, tmpFilePath, stataPathOnWindows, docDir, context);
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
            } else {
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                const consoleResult = await runOnWindowsEmbeddedConsole(codeToRun, tmpFilePath, docDir, context, { completionSoundSettings });
                if (consoleResult.success) {
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                    capability.setCapabilityState(context, 'console');
                    await refreshMemoryVarsAfterRun(context, consoleResult);
                    await invalidateConsoleDataViewer();
                } else if (consoleResult.shouldOfferGuiFallback) {
                    showConsoleUnavailableToast(consoleResult);
                    capability.setCapabilityState(context, 'external');
                    if (consoleResult.noLicense) {
                        const { showConsoleLicenseDialog } = require('../embeddedConsole/windows');
                        await showConsoleLicenseDialog(context);
                        await runOnWindows(codeToRun, tmpFilePath, stataPathOnWindows, docDir, context);
                    } else {
                        await maybeOfferGuiFallback(codeToRun, tmpFilePath, docDir, context, consoleResult.message || 'Embedded Console 执行失败');
                    }
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
                } else {
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                }
            }
        } else if (onMac) {
            if (runMode === config.RUN_MODES.externalApp) {
                runOnMac(codeToRun, tmpFilePath, false, docDir, context);
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
            } else {
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                const consoleResult = await runOnMacWebview(codeToRun, tmpFilePath, docDir, context, { completionSoundSettings });
                if (consoleResult.success) {
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                    capability.setCapabilityState(context, 'console');
                    await refreshMemoryVarsAfterRun(context, consoleResult);
                    await invalidateConsoleDataViewer();
                } else if (consoleResult.shouldOfferGuiFallback) {
                    showConsoleUnavailableToast(consoleResult);
                    capability.setCapabilityState(context, 'external');
                    if (consoleResult.noLicense) {
                        const { showConsoleLicenseDialog } = require('../embeddedConsole/mac');
                        await showConsoleLicenseDialog(context);
                        runOnMac(codeToRun, tmpFilePath, false, docDir, context);
                    } else {
                        await maybeOfferGuiFallback(codeToRun, tmpFilePath, docDir, context, consoleResult.message || 'Embedded Console 执行失败');
                    }
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
                } else {
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                }
            }
        } else if (onLinux) {
            if (runMode === config.RUN_MODES.externalApp) {
                // There is no Stata GUI to send code to on a (headless) Linux host.
                showError(msg('externalAppUnsupportedOnLinux'));
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
            } else {
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                const consoleResult = await runOnLinuxEmbeddedConsole(codeToRun, tmpFilePath, docDir, context, { completionSoundSettings });
                if (consoleResult.success) {
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                    capability.setCapabilityState(context, 'console');
                    await refreshMemoryVarsAfterRun(context, consoleResult);
                    await invalidateConsoleDataViewer();
                } else if (consoleResult.shouldOfferGuiFallback) {
                    await reportLinuxConsoleFailure(context, consoleResult);
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
                } else {
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                }
            }
        }

    } catch (error) {
        showError(msg('tmpFileFailed', { message: error.message }));
        console.error('Stata All in One: 执行异常:', error.message);
        vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
    }
}

async function ensurePlatformExecutionReady(context, { onWindows, onMac, onLinux }) {
    const resolved = await ensureStataConfigured(context, { promptOnFailure: true });
    if (!resolved) return null;
    if (onWindows) return resolved.executablePath || null;
    if (onMac || onLinux) return '';
    return null;
}

/**
 * Linux has no external Stata application to fall back to: report the Console
 * failure (and the licence dialog when that is the cause) and stop there.
 */
async function reportLinuxConsoleFailure(context, consoleResult) {
    showConsoleUnavailableToast(consoleResult);
    capability.setCapabilityState(context, 'external');
    if (consoleResult.noLicense) {
        const { showConsoleLicenseDialog } = require('../embeddedConsole/linux');
        await showConsoleLicenseDialog(context);
    }
}

function resolveExecutionDirectory() {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document && !activeEditor.document.isUntitled) {
        return path.dirname(activeEditor.document.fileName);
    }

    const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    if (workspaceFolder) {
        return workspaceFolder.uri.fsPath;
    }

    return os.tmpdir();
}

async function runArbitraryCode(context, code, options = {}) {
    const normalizedCode = String(code || '');
    if (!normalizedCode.trim()) {
        return { success: false, skipped: true };
    }
    if (containsSaioCommand(normalizedCode)) {
        showWarn(msg('saioCommandUnavailableInVscode'));
        return { success: false, skipped: true, blockedSaioCommand: true };
    }

    const runMode = options.outputMode || config.getRunMode();
    options = { ...options, completionSoundSettings: options.completionSoundSettings || config.getConsoleCompletionSound() };
    if (runMode === config.RUN_MODES.embeddedConsole && !options.allowWhileRunning) {
        const terminal = require('../embeddedConsole/panel');
        if (terminal.isWebviewTerminalRunning && terminal.isWebviewTerminalRunning()) {
            showWarn(msg('consoleBusyAction'));
            return { success: false, skipped: true, blockedWhileRunning: true };
        }
    }

    const onWindows = isWindows();
    const onMac = isMacOS();
    const onLinux = isLinux();
    if (!onWindows && !onMac && !onLinux) {
        showError(msg('unsupportedPlatform'));
        return { success: false };
    }

    if (!options.completionSound) completionSound.getService().stop();

    if (shouldRouteBrowseCommand(runMode) && !options.skipCompatibilityRouting) {
        const compatibilityResult = await routeConsoleUnsupportedCommand(normalizedCode);
        if (compatibilityResult) {
            return compatibilityResult;
        }
    }
    if (shouldRouteBrowseCommand(runMode) && !options.skipBrowseRouting) {
        const segments = splitBrowseCommandSegments(normalizedCode);
        if (segments.some(segment => segment.type === 'browse')) {
            return runBrowseExecutionPlan(context, segments, {
                ...options,
                outputMode: runMode
            });
        }
    }

    const stataPathOnWindows = await ensurePlatformExecutionReady(context, { onWindows, onMac, onLinux });
    if (onWindows && !stataPathOnWindows) {
        return { success: false };
    }

    const docDir = options.docDir || resolveExecutionDirectory();
    const tmpFilePath = getTempFilePath();

    try {
        let result = null;
        if (onWindows) {
            if (runMode === config.RUN_MODES.externalApp) {
                await runOnWindows(normalizedCode, tmpFilePath, stataPathOnWindows, docDir, context);
                await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
                result = { success: true };
                await refreshMemoryVarsAfterRun(context, result);
                return result;
            }

            await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
            const consoleResult = await runOnWindowsEmbeddedConsole(normalizedCode, tmpFilePath, docDir, context, {
                completionSound: options.completionSound,
                completionSoundSettings: options.completionSoundSettings,
                suppressRunFooter: Boolean(options.suppressRunFooter)
            });
            if (consoleResult.success) {
                await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                capability.setCapabilityState(context, 'console');
                await refreshMemoryVarsAfterRun(context, consoleResult);
                await invalidateConsoleDataViewer();
                return consoleResult;
            }
            if (consoleResult.shouldOfferGuiFallback) {
                showConsoleUnavailableToast(consoleResult);
                capability.setCapabilityState(context, 'external');
                if (consoleResult.noLicense) {
                    const { showConsoleLicenseDialog } = require('../embeddedConsole/windows');
                    await showConsoleLicenseDialog(context);
                    await runOnWindows(normalizedCode, tmpFilePath, stataPathOnWindows, docDir, context);
                } else {
                    await maybeOfferGuiFallback(normalizedCode, tmpFilePath, docDir, context, consoleResult.message || 'Embedded Console 执行失败');
                }
                await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
            }
            return consoleResult;
        }

        if (onLinux) {
            if (runMode === config.RUN_MODES.externalApp) {
                showError(msg('externalAppUnsupportedOnLinux'));
                await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
                return { success: false };
            }

            await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
            const consoleResult = await runOnLinuxEmbeddedConsole(normalizedCode, tmpFilePath, docDir, context, {
                completionSound: options.completionSound,
                completionSoundSettings: options.completionSoundSettings,
                suppressRunFooter: Boolean(options.suppressRunFooter)
            });
            if (consoleResult.success) {
                await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                capability.setCapabilityState(context, 'console');
                await refreshMemoryVarsAfterRun(context, consoleResult);
                await invalidateConsoleDataViewer();
                return consoleResult;
            }
            if (consoleResult.shouldOfferGuiFallback) {
                await reportLinuxConsoleFailure(context, consoleResult);
                await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
            }
            return consoleResult;
        }

        if (runMode === config.RUN_MODES.externalApp) {
            runOnMac(normalizedCode, tmpFilePath, false, docDir, context);
            await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
            result = { success: true };
            await refreshMemoryVarsAfterRun(context, result);
            return result;
        }

        await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
        const consoleResult = await runOnMacWebview(normalizedCode, tmpFilePath, docDir, context, {
            completionSound: options.completionSound,
            completionSoundSettings: options.completionSoundSettings,
            suppressRunFooter: Boolean(options.suppressRunFooter)
        });
        if (consoleResult.success) {
            await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
            capability.setCapabilityState(context, 'console');
            await refreshMemoryVarsAfterRun(context, consoleResult);
            await invalidateConsoleDataViewer();
            return consoleResult;
        }
        if (consoleResult.shouldOfferGuiFallback) {
            showConsoleUnavailableToast(consoleResult);
            capability.setCapabilityState(context, 'external');
            if (consoleResult.noLicense) {
                const { showConsoleLicenseDialog } = require('../embeddedConsole/mac');
                await showConsoleLicenseDialog(context);
                runOnMac(normalizedCode, tmpFilePath, false, docDir, context);
            } else {
                await maybeOfferGuiFallback(normalizedCode, tmpFilePath, docDir, context, consoleResult.message || 'Embedded Console 执行失败');
            }
            await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
        }
        return consoleResult;
    } catch (error) {
        showError(msg('tmpFileFailed', { message: error.message }));
        console.error('Stata All in One: 任意代码执行异常:', error.message);
        await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
        return { success: false, error };
    }
}

async function runBrowseExecutionPlan(context, segments, options = {}) {
    let result = { success: true, routedToDataViewer: false };
    const completion = completionSound.getService().begin(options.completionSoundSettings);
    const runStartTime = Date.now();
    const sink = require('../embeddedConsole/panel').getWebviewTerminalSink();
    const finishPlan = (finalResult) => {
        sink.writeRunFooter(Date.now() - runStartTime);
        return finalResult;
    };

    try {
        for (const segment of segments) {
            if (segment.type === 'browse') {
                const browseResult = await routeBrowseCommand(segment.commandText, { keepRunning: true });
                if (!browseResult || !browseResult.success) {
                    completion.abort();
                    return finishPlan(browseResult || { success: false });
                }
                result = {
                    ...result,
                    ...browseResult,
                    routedToDataViewer: true
                };
                continue;
            }

            const codeResult = await runArbitraryCode(context, segment.code, {
                ...options,
                skipBrowseRouting: true,
                allowWhileRunning: true,
                completionSound: completion,
                suppressRunFooter: true
            });
            if (!codeResult || !codeResult.success) {
                if (!codeResult || codeResult.errorType !== 'stata') completion.abort();
                return finishPlan(codeResult || { success: false });
            }
            result = {
                ...result,
                ...codeResult,
                routedToDataViewer: result.routedToDataViewer
            };
        }

        const finished = finishPlan(result);
        if (result.routedToDataViewer) {
            // A later command in the same selection can reveal the Console again.
            // Put the Data Viewer tab in front after the whole selection finishes.
            require('../embeddedConsole/dataViewer/panel').activateDataViewerTab();
        }
        return finished;
    } catch (error) {
        completion.abort();
        throw error;
    } finally {
        completion.finish();
    }
}

async function refreshMemoryVarsAfterRun(context, result) {
    if (!result || !result.success) {
        return;
    }
    try {
        let vars = await variableSuggestions.refreshMemoryVars(context);
        if (!vars.length) {
            await new Promise(resolve => setTimeout(resolve, 150));
            vars = await variableSuggestions.refreshMemoryVars(context);
        }
    } catch (_e) {}
}

async function maybeOfferGuiFallback(codeToRun, tmpFilePath, docDir, context, reason) {
    // Auto-fallback: execute via external app immediately (no blocking modal)
    if (isWindows()) {
        const rawPath = config.getStataPathOnWindows();
        const stataPath = stripSurroundingQuotes(rawPath.trim());
        if (stataPath) {
            await runOnWindows(codeToRun, tmpFilePath, stataPath, docDir, context);
        }
    } else {
        runOnMac(codeToRun, tmpFilePath, false, docDir, context);
    }

    // Show non-blocking notification with action buttons
    const switchLabel = msg('consoleFallbackSwitchPermanently');
    const dismissLabel = msg('consoleFallbackDismiss');

    const choice = await showWarn(
        msg('consoleFallbackAutoSwitched', { reason }),
        switchLabel,
        dismissLabel
    );

    if (choice === switchLabel) {
        await vscode.workspace.getConfiguration('stata-all-in-one').update(
            'runMode',
            'externalApp',
            vscode.ConfigurationTarget.Global
        );
        showInfo(msg('consoleFallbackPermanentlySet'));
    }
}

/**
 * 注册执行命令
 * 将两种快捷键对应的运行命令绑定到同一调度函数
 * 
 * @param {vscode.ExtensionContext} context - VS Code 扩展上下文
 */
function registerExecuteCommand(context) {
    const runHandler = async () => {
        await runCurrentSection(context);
    };
    const updateRunTarget = (editor = vscode.window.activeTextEditor) => {
        Promise.all([
            vscode.commands.executeCommand(
                'setContext',
                RUN_TARGET_CONTEXT_KEY,
                getRunTarget(editor)
            ),
            vscode.commands.executeCommand(
                'setContext',
                CURSOR_ON_HEADING_CONTEXT_KEY,
                isCursorOnHeading(editor)
            )
        ]).catch(() => {});
    };

    context.subscriptions.push(
        ...RUN_COMMANDS.map(command => vscode.commands.registerCommand(command, runHandler)),
        vscode.window.onDidChangeActiveTextEditor(editor => updateRunTarget(editor)),
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === vscode.window.activeTextEditor) {
                updateRunTarget(event.textEditor);
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && event.document === activeEditor.document) {
                updateRunTarget(activeEditor);
            }
        })
    );
    updateRunTarget();
}

// 导出接口
module.exports = {
    runCurrentSection,
    runArbitraryCode,
    registerExecuteCommand,
    getCodeToRun  // 导出供测试或其他模块使用
};
