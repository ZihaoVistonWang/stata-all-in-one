/**
 * macOS Embedded Console Runner
 * 使用 Stata 会话执行代码，并通过 Stata All in One Console 显示输出
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const session = require('./session');
const { getTempFilePath, cleanupTempFile } = require('../execute/tempfile');
const config = require('../../../utils/config');
const { getWebviewTerminalSink } = require('./panel');

let _statusBarItem = null;
let _statusBarAlignment = null;
let _activeOutputSink = null;
const SYNTHETIC_PROGRESS_LINE_WIDTH = 72;

function getOrCreateStatusBarItem() {
    const desiredAlignment = vscode.StatusBarAlignment.Right;

    if (_statusBarItem && _statusBarAlignment !== desiredAlignment) {
        _statusBarItem.dispose();
        _statusBarItem = null;
        _statusBarAlignment = null;
    }

    if (!_statusBarItem) {
        _statusBarItem = vscode.window.createStatusBarItem(desiredAlignment, 100);
        _statusBarItem.name = 'Stata All in One Console Status';
        _statusBarItem.command = 'workbench.action.focusSecondEditorGroup';
        _statusBarAlignment = desiredAlignment;
    }

    return _statusBarItem;
}

function showCliRunningStatus() {
    const item = getOrCreateStatusBarItem();
    item.text = '$(loading~spin) Stata All in One Console is running';
    item.tooltip = 'Stata is executing code in Stata All in One Console';
    item.command = 'workbench.action.focusSecondEditorGroup';
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    item.show();
}

function hideCliRunningStatus() {
    if (_statusBarItem) {
        _statusBarItem.backgroundColor = undefined;
        _statusBarItem.color = undefined;
        _statusBarItem.hide();
    }
}

function isNativeProgressOnlyChunk(chunk) {
    const normalized = String(chunk || '').replace(/\r/g, '');
    if (!normalized) {
        return false;
    }

    return /^[.\s>\n]+$/.test(normalized);
}

function hasResultPhaseOutput(chunk) {
    return /\n\s*-Bootstrap|\n\s*Variables \||\n\s*Over Time:|end of do-file/i.test(String(chunk || ''));
}

function computeIncrementalChunk(emittedOutput, currentOutput) {
    if (!currentOutput) {
        return '';
    }

    if (!emittedOutput) {
        return currentOutput;
    }

    if (currentOutput.startsWith(emittedOutput)) {
        return currentOutput.slice(emittedOutput.length);
    }

    const maxOverlap = Math.min(emittedOutput.length, currentOutput.length);
    for (let overlap = maxOverlap; overlap > 0; overlap--) {
        if (emittedOutput.slice(-overlap) === currentOutput.slice(0, overlap)) {
            return currentOutput.slice(overlap);
        }
    }

    return currentOutput;
}

function getOutputSink() {
    return getWebviewTerminalSink();
}

/**
 * Find Stata dylib on macOS
 * Scans /Applications for Stata MP/SE/BE editions and returns the dylib path
 * @param {string|null} preferredEdition - Preferred edition: 'mp', 'se', 'be', or null for auto
 * @returns {{
 *   path: string|null,
 *   edition: 'mp'|'se'|'be'|null,
 *   installed: string[],
 *   fromCache: boolean
 * }}
 */
function findStataDylib(preferredEdition = null, savedPath = null) {
    if (savedPath && fs.existsSync(savedPath)) {
        const editionMatch = savedPath.match(/libstata-(mp|se|be)\.dylib$/);
        return {
            path: savedPath,
            edition: editionMatch ? editionMatch[1] : null,
            installed: [],
            fromCache: true
        };
    }

    const editions = ['mp', 'se', 'be'];
    const appNames = {
        mp: 'StataMP',
        se: 'StataSE',
        be: 'StataBE'
    };

    const installed = [];
    let targetEdition = null;
    let targetPath = null;

    const baseDir = '/Applications';
    if (!fs.existsSync(baseDir)) {
        return { path: null, edition: null, installed: [], fromCache: false };
    }

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
        const subDirPath = path.join(baseDir, entry.name);

        for (const edition of editions) {
            const appPath = path.join(subDirPath, `${appNames[edition]}.app`);
            if (!fs.existsSync(appPath)) {
                continue;
            }

            installed.push(edition);

            const dylibPath = path.join(
                appPath,
                'Contents',
                'MacOS',
                `libstata-${edition}.dylib`
            );

            if (fs.existsSync(dylibPath) && !targetPath) {
                targetEdition = edition;
                targetPath = dylibPath;
            }
        }
    }

    if (preferredEdition && installed.includes(preferredEdition)) {
        for (const entry of entries) {
            const appPath = path.join(baseDir, entry.name, `${appNames[preferredEdition]}.app`);
            const dylibPath = path.join(
                appPath,
                'Contents',
                'MacOS',
                `libstata-${preferredEdition}.dylib`
            );

            if (fs.existsSync(dylibPath)) {
                targetEdition = preferredEdition;
                targetPath = dylibPath;
                break;
            }
        }
    }

    return {
        path: targetPath,
        edition: targetEdition,
        installed,
        fromCache: false
    };
}

async function ensureCliSession(context) {
    if (session.hasActiveCliSession()) {
        return {
            success: true,
            fromExisting: true
        };
    }

    const savedPath = context ? context.globalState.get('stataCliDylibPath') : null;
    const dylibInfo = findStataDylib(null, savedPath);

    if (!dylibInfo.path) {
        console.error('[mac.js] 未找到 Stata dylib，已安装版本:', dylibInfo.installed);
        return {
            success: false,
            reason: '无法找到 Stata。请确保 Stata MP/SE/BE 已安装在 /Applications 目录下。'
        };
    }

    if (context && !dylibInfo.fromCache) {
        await context.globalState.update('stataCliDylibPath', dylibInfo.path);
        console.log('[mac.js] 已保存 dylib 路径:', dylibInfo.path);
    }

    const success = await session.initCliSession(context, dylibInfo.path);
    if (!success) {
        console.error('[runtime] 会话初始化失败');
        return {
            success: false,
            reason: `Stata 会话初始化失败。请检查 Stata ${dylibInfo.edition ? dylibInfo.edition.toUpperCase() : ''} 是否正确安装。`
        };
    }

    return {
        success: true,
        fromExisting: false,
        edition: dylibInfo.edition
    };
}

/**
 * Run code on macOS via Embedded Console-backed session
 * @param {string} codeToRun - The code to execute
 * @param {string} tmpFilePath - Path to temporary file (unused in webview mode)
 * @param {string|null} docDir - Directory of the do file
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {Promise<boolean>} - 执行成功返回 true，失败返回 false
 */
async function runOnMacWebview(codeToRun, tmpFilePath, docDir = null, context = null, options = {}) {
    let executionPlan = null;
    let streamedOutput = '';
    let progressTimer = null;
    let lastRealChunkAt = 0;
    let syntheticProgressActive = false;
    let syntheticProgressColumn = 0;
    let runStartTime = null;
    const outputSink = getOutputSink();

    try {
        const initResult = await ensureCliSession(context);
        if (!initResult.success) {
            return {
                success: false,
                shouldOfferGuiFallback: true,
                errorType: 'extension',
                message: initResult.reason
            };
        }

        const cliSession = session.getCliSession(context);
        if (!cliSession || !cliSession.isInitialized()) {
            console.error('[runtime] 无法获取有效的 Stata 会话');
            return {
                success: false,
                shouldOfferGuiFallback: true,
                errorType: 'extension',
                message: '无法获取有效的 Stata 会话。'
            };
        }

        _activeOutputSink = outputSink;
        await outputSink.prepareForExecution();

        const normalizedCode = normalizeCodeToRun(codeToRun);
        await ensureWebviewBootstrap(cliSession);
        await ensureInitialWorkingDirectory(cliSession, docDir);
        executionPlan = createExecutionPlan(normalizedCode, cliSession.getWorkingDirectory());
        lastRealChunkAt = Date.now();
        runStartTime = lastRealChunkAt;
        showCliRunningStatus();
        progressTimer = setInterval(() => {
            if (!syntheticProgressActive) {
                return;
            }

            if (Date.now() - lastRealChunkAt < 600) {
                return;
            }

            if (syntheticProgressColumn >= SYNTHETIC_PROGRESS_LINE_WIDTH) {
                outputSink.writeRawChunk('\n> ');
                syntheticProgressColumn = 0;
            }

            outputSink.writeRawChunk('.');
            syntheticProgressColumn += 1;
        }, 300);

        const result = await cliSession.execute(executionPlan.command, true, (chunk) => {
            if (!chunk) {
                return;
            }

            streamedOutput += chunk;
            lastRealChunkAt = Date.now();

            if (chunk.includes('Begin Time:')) {
                syntheticProgressActive = true;
                syntheticProgressColumn = 0;
            }

            if (hasResultPhaseOutput(chunk)) {
                if (syntheticProgressActive && syntheticProgressColumn > 0) {
                    outputSink.writeRawChunk('\n');
                }
                syntheticProgressActive = false;
                syntheticProgressColumn = 0;
            }

            if (syntheticProgressActive && isNativeProgressOnlyChunk(chunk)) {
                return;
            }

            outputSink.writeOutputChunk(chunk);
        });

        if (result.output) {
            const tailChunk = computeIncrementalChunk(streamedOutput, result.output);
            if (tailChunk) {
                outputSink.writeOutputChunk(tailChunk);
                streamedOutput += tailChunk;
            }
        }

        outputSink.flushOutput();

        if (!result.success) {
            console.error('[mac.js] 执行失败:', result.error);
            if (!result.output) {
                outputSink.writeError(result.error || `Execution failed (${result.returnCode})`);
            }
            return {
                success: false,
                shouldOfferGuiFallback: false,
                errorType: 'stata',
                message: result.error || '',
                returnCode: result.returnCode
            };
        }

        updateWorkingDirectoryFromCode(cliSession, normalizedCode);
        return {
            success: true,
            shouldOfferGuiFallback: false
        };
    } catch (error) {
        console.error('[runtime] runOnMacWebview 异常:', error.message);

        _activeOutputSink = outputSink;
        await outputSink.prepareForExecution();
        outputSink.writeError(error.message);
        return {
            success: false,
            shouldOfferGuiFallback: true,
            errorType: 'extension',
            message: `Stata 执行错误: ${error.message}`
        };
    } finally {
        if (progressTimer) {
            clearInterval(progressTimer);
        }
        hideCliRunningStatus();

        outputSink.flushOutput();
        if (runStartTime !== null) {
            outputSink.writeRunFooter(Date.now() - runStartTime);
        }

        if (executionPlan && executionPlan.tempFilePath) {
            cleanupTempFile(executionPlan.tempFilePath).catch(() => {});
        }
    }
}

function normalizeCodeToRun(code) {
    return String(code || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.replace(/^\s*\.\s?/, ''))
        .join('\n')
        .trim();
}

async function ensureInitialWorkingDirectory(cliSession, docDir) {
    if (cliSession.getWorkingDirectory() || !docDir || !config.getCdToDoFileDir()) {
        return;
    }

    const escapedDir = String(docDir).replace(/"/g, '""');
    const cdResult = await cliSession.execute(`quietly cd "${escapedDir}"`, false);
    if (!cdResult.success) {
        throw new Error(cdResult.error || 'Failed to initialize working directory.');
    }

    cliSession.setWorkingDirectory(docDir);
}

async function ensureWebviewBootstrap(cliSession) {
    if (cliSession.isBootstrapped()) {
        return;
    }

    const bootstrapCommands = [
        'quietly set more off',
        'quietly set linesize 255'
    ];

    for (const command of bootstrapCommands) {
        const result = await cliSession.execute(command, false);
        if (!result.success) {
            throw new Error(result.error || `Failed to run bootstrap command: ${command}`);
        }
    }

    cliSession.setBootstrapped(true);
}

function updateWorkingDirectoryFromCode(cliSession, codeToRun) {
    const nextWorkingDirectory = extractLastCdTarget(codeToRun, cliSession.getWorkingDirectory());
    if (nextWorkingDirectory) {
        cliSession.setWorkingDirectory(nextWorkingDirectory);
    }
}

function extractLastCdTarget(codeToRun, currentWorkingDirectory) {
    const lines = String(codeToRun || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    let workingDirectory = currentWorkingDirectory || null;
    for (const line of lines) {
        const cdTarget = parseCdCommand(line);
        if (!cdTarget) {
            continue;
        }

        workingDirectory = resolveWorkingDirectory(cdTarget, workingDirectory);
    }

    return workingDirectory;
}

function parseCdCommand(line) {
    const quotedMatch = line.match(/^cd\s+"((?:[^"]|"")*)"$/i);
    if (quotedMatch) {
        return quotedMatch[1].replace(/""/g, '"');
    }

    const bareMatch = line.match(/^cd\s+(.+)$/i);
    if (bareMatch) {
        return bareMatch[1].trim();
    }

    return null;
}

function resolveWorkingDirectory(targetPath, currentWorkingDirectory) {
    if (!targetPath) {
        return currentWorkingDirectory || null;
    }

    if (path.isAbsolute(targetPath)) {
        return path.normalize(targetPath);
    }

    if (currentWorkingDirectory) {
        return path.resolve(currentWorkingDirectory, targetPath);
    }

    return path.resolve(targetPath);
}

function createExecutionPlan(codeToRun, workingDirectory) {
    const lines = String(codeToRun || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter(line => line.trim().length > 0);

    if (lines.length === 0) {
        return {
            command: '',
            displayCode: '',
            tempFilePath: null
        };
    }

    if (lines.length === 1 && isStandaloneCdCommand(lines[0])) {
        return {
            command: lines[0],
            tempFilePath: null
        };
    }

    if (lines.length === 1 && !shouldUseDoFileForSingleLine(lines[0])) {
        return {
            command: lines[0],
            tempFilePath: null
        };
    }

    const tempFilePath = getTempFilePath(workingDirectory);
    fs.writeFileSync(tempFilePath, lines.join('\n'), 'utf8');

    return {
        command: `do "${tempFilePath.replace(/"/g, '""')}"`,
        tempFilePath
    };
}

function isStandaloneCdCommand(line) {
    return parseCdCommand(String(line || '').trim()) !== null;
}

function shouldUseDoFileForSingleLine(line) {
    const trimmed = String(line || '').trim();
    return trimmed.includes('//') || trimmed.includes('/*') || trimmed.startsWith('*');
}

/**
 * Initialize Stata session
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {Promise<boolean>} - 初始化成功返回 true，失败返回 false
 */
async function initCliSession(context) {
    try {
        const result = await ensureCliSession(context);
        if (!result.success) {
            vscode.window.showErrorMessage(result.reason);
            return false;
        }

        if (!result.fromExisting) {
            vscode.window.showInformationMessage(
                `Stata ${result.edition ? result.edition.toUpperCase() : ''} 会话已初始化成功。`
            );
        }

        return true;
    } catch (error) {
        console.error('[runtime] initCliSession 异常:', error.message);
        vscode.window.showErrorMessage(`Stata 初始化错误: ${error.message}`);
        return false;
    }
}

/**
 * Stop Stata execution
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {boolean} - 成功返回 true
 */
function stopCliExecution(context) {
    try {
        if (session.hasActiveCliSession()) {
            const cliSession = session.getCliSession(context);
            cliSession.stop();
        }

        if (_activeOutputSink) {
            _activeOutputSink.reveal();
            _activeOutputSink.writeBreak();
        }

        return true;
    } catch (error) {
        console.error('[mac.js] stopCliExecution 异常:', error.message);
        return false;
    }
}

/**
 * Get current Stata session
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {StataCliSession|null} - 会话实例或 null
 */
function getCliSession(context) {
    return session.getCliSession(context);
}

/**
 * 强制关闭 Stata 会话
 * @returns {boolean} - 成功返回 true
 */
function forceShutdownCliSession() {
    try {
        _activeOutputSink = null;
        return session.forceShutdownCliSession();
    } catch (error) {
        console.error('[mac.js] forceShutdownCliSession 异常:', error.message);
        return false;
    }
}

module.exports = {
    findStataDylib,
    runOnMacWebview,
    initCliSession,
    stopCliExecution,
    getCliSession,
    forceShutdownCliSession
};
