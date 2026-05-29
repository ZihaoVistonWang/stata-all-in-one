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
const { isWindows, isMacOS, showInfo, showWarn, showError, stripSurroundingQuotes, msg } = require('../../../utils/common');
const config = require('../../../utils/config');

// External App 执行函数导入
const { runOnMac } = require('../externalApp/mac');
const { runOnWindows } = require('../externalApp/windows');

// Embedded Console 执行函数导入
const { runOnMacWebview } = require('../embeddedConsole/mac');
const { runOnWindowsEmbeddedConsole } = require('../embeddedConsole/windows');

// 临时文件处理
const { cleanupTempFile } = require('./tempfile');

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
        const endLine = selection.end.line;
        
        const startPos = new vscode.Position(startLine, 0);
        const endLineText = document.lineAt(endLine);
        const endPos = new vscode.Position(endLine, endLineText.text.length);
        
        return document.getText(new vscode.Range(startPos, endPos));
    } else {
        // 未选中：检查当前行是否是标题行
        const currentLine = editor.selection.active.line;
        const lineText = document.lineAt(currentLine).text;
        const headerRegex = /^\*{1,2}\s*#+/;
        
        if (headerRegex.test(lineText)) {
            // 当前行是标题：运行当前节
            const regex = /^\*{1,2}\s*(#+)\s?(.*)$/;
            
            let sectionStart = -1;
            let sectionLevel = -1;
            
            // 找到当前节的标题
            for (let i = currentLine; i >= 0; i--) {
                const line = document.lineAt(i).text;
                const match = regex.exec(line);
                if (match) {
                    sectionStart = i;
                    sectionLevel = match[1].length;
                    break;
                }
            }
            
            if (sectionStart === -1) {
                sectionStart = 0;
                sectionLevel = 0;
            }
            
            // 找到下一个同级或更高级的节
            let sectionEnd = document.lineCount - 1;
            
            for (let i = sectionStart + 1; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                const match = regex.exec(line);
                if (match) {
                    const currentLevel = match[1].length;
                    if (currentLevel <= sectionLevel && sectionLevel > 0) {
                        sectionEnd = i - 1;
                        break;
                    }
                    if (sectionLevel === 0) {
                        sectionEnd = i - 1;
                        break;
                    }
                }
            }
            
            const startPos = new vscode.Position(sectionStart, 0);
            const endLine = document.lineAt(sectionEnd);
            const endPos = new vscode.Position(sectionEnd, endLine.text.length);
            
            return document.getText(new vscode.Range(startPos, endPos));
        } else {
            // 当前行不是标题：只运行当前行
            const lineObj = document.lineAt(currentLine);
            const startPos = new vscode.Position(currentLine, 0);
            const endPos = new vscode.Position(currentLine, lineObj.text.length);
            
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

    // 平台检查
    const onWindows = isWindows();
    const onMac = isMacOS();

    if (!onWindows && !onMac) {
        showError(msg('unsupportedPlatform'));
        return;
    }

    const stataPathOnWindows = await ensurePlatformExecutionReady({ onWindows, onMac });
    if (onWindows && !stataPathOnWindows) {
        return;
    }

    // 获取要运行的代码
    const codeToRun = getCodeToRun(activeEditor);
    const runMode = config.getRunMode();
    
    // 获取文档目录
    const docDir = path.dirname(document.fileName);
    
    // 创建临时文件路径（用于 External App 模式）
    const tmpFilePath = path.join(docDir, 'stata_all_in_one_temp.do');
    
    try {
        // === 调度逻辑 ===
        
        if (onWindows) {
            if (runMode === config.RUN_MODES.externalApp) {
                runOnWindows(codeToRun, tmpFilePath, stataPathOnWindows, docDir);
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
            } else {
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                const consoleResult = await runOnWindowsEmbeddedConsole(codeToRun, tmpFilePath, docDir, context);
                if (consoleResult.success) {
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                    await refreshMemoryVarsAfterRun(context, consoleResult);
                } else if (consoleResult.shouldOfferGuiFallback) {
                    await maybeOfferGuiFallback(codeToRun, tmpFilePath, docDir, context, consoleResult.message || 'Embedded Console 执行失败');
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
                const consoleResult = await runOnMacWebview(codeToRun, tmpFilePath, docDir, context);
                if (consoleResult.success) {
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                    await refreshMemoryVarsAfterRun(context, consoleResult);
                } else if (consoleResult.shouldOfferGuiFallback) {
                    await maybeOfferGuiFallback(codeToRun, tmpFilePath, docDir, context, consoleResult.message || 'Embedded Console 执行失败');
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
                } else {
                    vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                }
            }
        }
        
    } catch (error) {
        showError(msg('tmpFileFailed', { message: error.message }));
        console.error('[execute] 执行异常:', error.message);
        vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
    }
}

async function ensurePlatformExecutionReady({ onWindows, onMac }) {
    if (onWindows) {
        const rawPath = config.getStataPathOnWindows();
        let stataPathOnWindows = stripSurroundingQuotes(rawPath.trim());
        if (!stataPathOnWindows) {
            const userPath = await vscode.window.showInputBox({
                prompt: msg('promptWinPath'),
                placeHolder: msg('promptWinPathPlaceholder'),
                ignoreFocusOut: true
            });

            if (!userPath) {
                return null;
            }

            await vscode.workspace.getConfiguration('stata-all-in-one').update(
                'stataPathOnWindows',
                userPath.trim(),
                vscode.ConfigurationTarget.Global
            );

            stataPathOnWindows = stripSurroundingQuotes(userPath.trim());
            showInfo(msg('configSaved'));
        }
        return stataPathOnWindows;
    }

    if (onMac) {
        const stataVersion = config.getStataVersion();
        if (!stataVersion || stataVersion.trim() === '') {
            const selectedVersion = await vscode.window.showQuickPick(
                ['StataMP', 'StataIC', 'StataSE'],
                {
                    placeHolder: msg('promptMacVersion'),
                    ignoreFocusOut: true
                }
            );

            if (!selectedVersion) {
                return null;
            }

            await vscode.workspace.getConfiguration('stata-all-in-one').update(
                'stataVersionOnMacOS',
                selectedVersion,
                vscode.ConfigurationTarget.Global
            );

            showInfo(msg('configSaved'));
        }
    }

    return '';
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

    const onWindows = isWindows();
    const onMac = isMacOS();
    if (!onWindows && !onMac) {
        showError(msg('unsupportedPlatform'));
        return { success: false };
    }

    const stataPathOnWindows = await ensurePlatformExecutionReady({ onWindows, onMac });
    if (onWindows && !stataPathOnWindows) {
        return { success: false };
    }

    const runMode = options.outputMode || config.getRunMode();
    const docDir = options.docDir || resolveExecutionDirectory();
    const tmpFilePath = path.join(docDir, 'stata_all_in_one_temp.do');

    try {
        let result = null;
        if (onWindows) {
            if (runMode === config.RUN_MODES.externalApp) {
                runOnWindows(normalizedCode, tmpFilePath, stataPathOnWindows, docDir);
                await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
                result = { success: true };
                await refreshMemoryVarsAfterRun(context, result);
                return result;
            }

            await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
            const consoleResult = await runOnWindowsEmbeddedConsole(normalizedCode, tmpFilePath, docDir, context);
            if (consoleResult.success) {
                await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
                await refreshMemoryVarsAfterRun(context, consoleResult);
                return consoleResult;
            }
            if (consoleResult.shouldOfferGuiFallback) {
                await maybeOfferGuiFallback(normalizedCode, tmpFilePath, docDir, context, consoleResult.message || 'Embedded Console 执行失败');
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
        const consoleResult = await runOnMacWebview(normalizedCode, tmpFilePath, docDir, context);
        if (consoleResult.success) {
            await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', true);
            await refreshMemoryVarsAfterRun(context, consoleResult);
            return consoleResult;
        }
        if (consoleResult.shouldOfferGuiFallback) {
            await maybeOfferGuiFallback(normalizedCode, tmpFilePath, docDir, context, consoleResult.message || 'Embedded Console 执行失败');
            await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
        }
        return consoleResult;
    } catch (error) {
        showError(msg('tmpFileFailed', { message: error.message }));
        console.error('[execute] 任意代码执行异常:', error.message);
        await vscode.commands.executeCommand('setContext', 'stata-all-in-one.consoleSessionActive', false);
        return { success: false, error };
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
            runOnWindows(codeToRun, tmpFilePath, stataPath, docDir);
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
 * 将 'stata-all-in-one.runSection' 命令绑定到调度函数
 * 
 * @param {vscode.ExtensionContext} context - VS Code 扩展上下文
 */
function registerExecuteCommand(context) {
    const disposable = vscode.commands.registerCommand(
        'stata-all-in-one.runSection',
        async () => {
            await runCurrentSection(context);
        }
    );
    context.subscriptions.push(disposable);
}

// 导出接口
module.exports = {
    runCurrentSection,
    runArbitraryCode,
    registerExecuteCommand,
    getCodeToRun  // 导出供测试或其他模块使用
};
