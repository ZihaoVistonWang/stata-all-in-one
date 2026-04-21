/**
 * macOS CLI Stata Runner
 * 使用 Stata CLI Session 执行代码，并通过 Pseudoterminal 显示输出
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const session = require('./session');
const { StataPseudoTerminal } = require('./terminal');
const { getTempFilePath, cleanupTempFile } = require('../execute/tempfile');
const config = require('../../../utils/config');

let _stataTerminal = null;
let _cliStatusBarItem = null;
let _cliStatusBarAlignment = null;
const SYNTHETIC_PROGRESS_LINE_WIDTH = 72;

function getCliStatusBarAlignment() {
    const location = config.getCliTerminalLocation();
    return location === 'left'
        ? vscode.StatusBarAlignment.Left
        : vscode.StatusBarAlignment.Right;
}

function getOrCreateCliStatusBarItem() {
    const desiredAlignment = getCliStatusBarAlignment();

    if (_cliStatusBarItem && _cliStatusBarAlignment !== desiredAlignment) {
        _cliStatusBarItem.dispose();
        _cliStatusBarItem = null;
        _cliStatusBarAlignment = null;
    }

    if (!_cliStatusBarItem) {
        _cliStatusBarItem = vscode.window.createStatusBarItem(desiredAlignment, 100);
        _cliStatusBarItem.name = 'Stata CLI Status';
        _cliStatusBarItem.command = 'workbench.action.terminal.focus';
        _cliStatusBarAlignment = desiredAlignment;
    }

    return _cliStatusBarItem;
}

function showCliRunningStatus() {
    const item = getOrCreateCliStatusBarItem();
    item.text = '$(loading~spin) Stata CLI running';
    item.tooltip = 'Stata CLI is executing code';
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    item.show();
}

function hideCliRunningStatus() {
    if (_cliStatusBarItem) {
        _cliStatusBarItem.backgroundColor = undefined;
        _cliStatusBarItem.color = undefined;
        _cliStatusBarItem.hide();
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

function getOrCreateTerminal() {
    if (!_stataTerminal) {
        _stataTerminal = new StataPseudoTerminal();
    }

    return _stataTerminal;
}

async function ensureCliPreviewForEditor(editor) {
    if (!editor || editor.document.languageId !== 'stata') {
        return;
    }

    const terminal = getOrCreateTerminal();
    await terminal.showPreviewOnFileOpen();
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
        console.error('[mac.js] CLI 会话初始化失败');
        return {
            success: false,
            reason: `Stata CLI 会话初始化失败。请检查 Stata ${dylibInfo.edition ? dylibInfo.edition.toUpperCase() : ''} 是否正确安装。`
        };
    }

    return {
        success: true,
        fromExisting: false,
        edition: dylibInfo.edition
    };
}

/**
 * Run code on macOS via CLI
 * @param {string} codeToRun - The code to execute
 * @param {string} tmpFilePath - Path to temporary file (unused in CLI mode)
 * @param {string|null} docDir - Directory of the do file
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {Promise<boolean>} - 执行成功返回 true，失败返回 false
 */
async function runOnMacCLI(codeToRun, tmpFilePath, docDir = null, context = null) {
    let executionPlan = null;
    let streamedOutput = '';
    let progressTimer = null;
    let lastRealChunkAt = 0;
    let syntheticProgressActive = false;
    let syntheticProgressColumn = 0;
    let runStartTime = null;
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
            console.error('[mac.js] 无法获取有效的 CLI 会话');
            return {
                success: false,
                shouldOfferGuiFallback: true,
                errorType: 'extension',
                message: '无法获取有效的 CLI 会话。'
            };
        }

        const terminal = getOrCreateTerminal();
        await terminal.prepareForExecution();

        const normalizedCode = normalizeCodeToRun(codeToRun);
        await ensureCliBootstrap(cliSession);
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
                terminal.writeRawChunk('\n> ');
                syntheticProgressColumn = 0;
            }

            terminal.writeRawChunk('.');
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
                    terminal.writeRawChunk('\n');
                }
                syntheticProgressActive = false;
                syntheticProgressColumn = 0;
            }

            if (syntheticProgressActive && isNativeProgressOnlyChunk(chunk)) {
                return;
            }

            terminal.writeOutputChunk(chunk);
        });

        if (result.output) {
            const tailChunk = computeIncrementalChunk(streamedOutput, result.output);
            if (tailChunk) {
                terminal.writeOutputChunk(tailChunk);
                streamedOutput += tailChunk;
            }
        }

        terminal.flushOutput();

        if (!result.success) {
            console.error('[mac.js] 执行失败:', result.error);
            if (!result.output) {
                terminal.writeError(result.error || `Execution failed (${result.returnCode})`);
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
        console.error('[mac.js] runOnMacCLI 异常:', error.message);

        const terminal = getOrCreateTerminal();
        await terminal.prepareForExecution();
        terminal.writeError(error.message);
        return {
            success: false,
            shouldOfferGuiFallback: true,
            errorType: 'extension',
            message: `Stata CLI 执行错误: ${error.message}`
        };
    } finally {
        if (progressTimer) {
            clearInterval(progressTimer);
        }
        hideCliRunningStatus();

        const terminal = getOrCreateTerminal();
        terminal.flushOutput();
        if (runStartTime !== null) {
            terminal.writeRunFooter(Date.now() - runStartTime);
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

async function ensureCliBootstrap(cliSession) {
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
 * Initialize CLI session for Stata
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
                `Stata CLI (${result.edition ? result.edition.toUpperCase() : 'CLI'}) 已初始化成功。`
            );
        }

        return true;
    } catch (error) {
        console.error('[mac.js] initCliSession 异常:', error.message);
        vscode.window.showErrorMessage(`Stata CLI 初始化错误: ${error.message}`);
        return false;
    }
}

/**
 * Stop CLI execution
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {boolean} - 成功返回 true
 */
function stopCliExecution(context) {
    try {
        if (session.hasActiveCliSession()) {
            const cliSession = session.getCliSession(context);
            cliSession.stop();
        }

        if (_stataTerminal) {
            _stataTerminal.show();
            _stataTerminal.writeBreak();
        }

        return true;
    } catch (error) {
        console.error('[mac.js] stopCliExecution 异常:', error.message);
        return false;
    }
}

/**
 * Get current CLI session
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {StataCliSession|null} - CLI 会话实例或 null
 */
function getCliSession(context) {
    return session.getCliSession(context);
}

/**
 * 强制关闭 CLI 会话
 * @returns {boolean} - 成功返回 true
 */
function forceShutdownCliSession() {
    try {
        if (_stataTerminal) {
            _stataTerminal.dispose();
            _stataTerminal = null;
        }

        return session.forceShutdownCliSession();
    } catch (error) {
        console.error('[mac.js] forceShutdownCliSession 异常:', error.message);
        return false;
    }
}

module.exports = {
    findStataDylib,
    runOnMacCLI,
    ensureCliPreviewForEditor,
    initCliSession,
    stopCliExecution,
    getCliSession,
    forceShutdownCliSession
};
