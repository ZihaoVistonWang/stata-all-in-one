/**
 * macOS Embedded Console Runner
 * 使用 Stata 会话执行代码，并通过 Stata All in One Console 显示输出
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const session = require('./session');
const { getTempFilePath, cleanupTempFile } = require('../execute/tempfile');
const config = require('../../../utils/config');
const { ensureSessionWorkingDirectory } = require('./workingDirectory');
const { showInfo, showError, msg } = require('../../../utils/common');
const { ensureStataConfigured } = require('../stataInstallationResolver');
const { getWebviewTerminalSink, setGraphResourceRoot, convertGraphSvgToBitmap } = require('./panel');
const { beginGraphCapture, endGraphCapture, executeBitmapGraphExport, exportCapturedGraphs, getGraphCacheDir } = require('./graphs');

let _activeOutputSink = null;

const LICENSE_DIALOG_SUPPRESSED_KEY = 'stata-all-in-one.consoleLicenseDialogSuppressed';
const LICENSE_DIALOG_REMIND_KEY = 'stata-all-in-one.consoleLicenseDialogNextReminder';
const LICENSE_DIALOG_REMIND_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function showConsoleLicenseDialog(context) {
    if (!context) return;
    if (context.globalState.get(LICENSE_DIALOG_SUPPRESSED_KEY)) return;
    const nextReminder = context.globalState.get(LICENSE_DIALOG_REMIND_KEY, 0);
    if (Date.now() < nextReminder) return;

    const reminder = msg('consoleLicenseMissingRemind');
    const never = msg('consoleLicenseMissingNever');

    const choice = await vscode.window.showWarningMessage(
        `Stata All in One: ${msg('consoleLicenseMissing')}`,
        { modal: true },
        reminder,
        never
    );

    if (choice === never) {
        await context.globalState.update(LICENSE_DIALOG_SUPPRESSED_KEY, true);
    } else if (choice === reminder) {
        await context.globalState.update(LICENSE_DIALOG_REMIND_KEY, Date.now() + LICENSE_DIALOG_REMIND_MS);
    }
}

function normalizeChunk(chunk) {
    return String(chunk || '').replace(/\r/g, '');
}

function isProgressPayload(text) {
    const normalized = String(text || '').replace(/\bdone\b/gi, '').trim();
    const dotCount = (normalized.match(/\./g) || []).length;
    if (dotCount < 2) {
        return false;
    }
    if (!/\.{2,}/.test(normalized)) {
        return false;
    }

    // Allow '+' for commands like xthreg that use ".......... +  50" markers
    return /^[>\s.,\d+]+$/.test(normalized);
}

function getProgressPayloadFromLine(line, allowContinuation = false) {
    const normalized = String(line || '').trim();
    if (!normalized) {
        return null;
    }

    const withoutPrompt = normalized.replace(/^>\s*/, '');
    const bareDotCount = (withoutPrompt.match(/\./g) || []).length;
    if (/^[.\s]+$/.test(withoutPrompt) && bareDotCount >= (allowContinuation ? 1 : 2)) {
        return withoutPrompt || normalized;
    }
    if (allowContinuation && /^[\s.,\d+]+(?:\s+done)?$/i.test(withoutPrompt) && /[.\d]/.test(withoutPrompt)) {
        return withoutPrompt;
    }
    if (allowContinuation && /^>\s*$/.test(normalized)) {
        return normalized;
    }
    if (/^[\s\d,]+done$/i.test(withoutPrompt)) {
        return withoutPrompt;
    }

    if (/\breplications?\s*\(\s*[\d,]+\s*\)\s*:\s*$/i.test(withoutPrompt)) {
        return withoutPrompt;
    }

    const colonIndex = withoutPrompt.lastIndexOf(':');
    if (colonIndex !== -1) {
        const suffix = withoutPrompt.slice(colonIndex + 1).trim();
        if (isProgressPayload(suffix)) {
            return suffix;
        }
    }

    if (isProgressPayload(withoutPrompt)) {
        return withoutPrompt;
    }

    const markerMatch = withoutPrompt.match(/(?:\.{2,}\s*\d|\.\d)/);
    if (!markerMatch) {
        return null;
    }

    const progressTail = withoutPrompt.slice(markerMatch.index);
    if (isProgressPayload(progressTail)) {
        return progressTail;
    }

    const alphaAfterMarker = progressTail.search(/[A-Za-z]/);
    if (alphaAfterMarker > 0) {
        const progressPrefix = progressTail.slice(0, alphaAfterMarker).trim();
        if (isProgressPayload(progressPrefix)) {
            return progressPrefix;
        }
    }

    return null;
}

function extractProgressDetailFromPayload(payload) {
    const matches = [...String(payload || '').matchAll(/(\d[\d,]*)(?=(?:\.+|\s|done|$))/gi)];
    if (!matches.length) {
        return null;
    }

    return matches[matches.length - 1][1];
}

function extractProgressDetail(chunk) {
    const lines = normalizeChunk(chunk).split('\n');
    for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
        const payload = getProgressPayloadFromLine(lines[lineIndex], true);
        const detail = extractProgressDetailFromPayload(payload);
        if (detail) {
            return detail;
        }
    }

    return null;
}

function parseIntegerWithCommas(value) {
    const normalized = String(value || '').replace(/,/g, '').trim();
    if (!/^\d+$/.test(normalized)) {
        return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function extractProgressTotalFromCode(code) {
    // bootstrap: reps(2000), xthreg: bs(300) / bootstrap(300)
    const matches = [...String(code || '').matchAll(/\b(?:reps|bs|bootstrap)\s*\(\s*(\d[\d,]*)\s*\)/gi)];
    if (!matches.length) {
        return null;
    }

    return parseIntegerWithCommas(matches[matches.length - 1][1]);
}

function hasProgressLine(chunk, allowContinuation = false) {
    return normalizeChunk(chunk)
        .split('\n')
        .some((line) => getProgressPayloadFromLine(line, allowContinuation) !== null);
}

function stripProgressFromLine(line, allowContinuation = false) {
    const normalized = String(line || '').trim();
    if (!normalized) {
        return null;
    }

    const withoutPrompt = normalized.replace(/^>\s*/, '');
    const bareDotCount = (withoutPrompt.match(/\./g) || []).length;

    if (/^[.\s]+$/.test(withoutPrompt) && bareDotCount >= (allowContinuation ? 1 : 2)) {
        return null;
    }
    if (allowContinuation && /^[\s.,\d+]+(?:\s+done)?$/i.test(withoutPrompt) && /[.\d]/.test(withoutPrompt)) {
        return null;
    }
    if (allowContinuation && /^>\s*$/.test(normalized)) {
        return null;
    }
    if (/^[\s\d,]+done$/i.test(withoutPrompt)) {
        return null;
    }

    if (/\breplications?\s*\(\s*[\d,]+\s*\)\s*:\s*$/i.test(withoutPrompt)) {
        return null;
    }

    const colonIndex = withoutPrompt.lastIndexOf(':');
    if (colonIndex !== -1) {
        const suffix = withoutPrompt.slice(colonIndex + 1).trim();
        if (isProgressPayload(suffix)) {
            return null;
        }
    }

    if (isProgressPayload(withoutPrompt)) {
        return null;
    }

    const markerMatch = withoutPrompt.match(/(?:\.{2,}\s*\d|\.\d)/);
    if (!markerMatch) {
        return line;
    }

    const progressTail = withoutPrompt.slice(markerMatch.index);
    if (isProgressPayload(progressTail)) {
        return null;
    }

    const alphaAfterMarker = progressTail.search(/[A-Za-z]/);
    if (alphaAfterMarker > 0) {
        const progressPrefix = progressTail.slice(0, alphaAfterMarker).trim();
        if (isProgressPayload(progressPrefix)) {
            const remainder = progressTail.slice(alphaAfterMarker).trim();
            return remainder || null;
        }
    }

    return line;
}

function stripProgressFromChunk(chunk, allowContinuation = false) {
    const normalized = normalizeChunk(chunk);
    if (!normalized) {
        return '';
    }

    const endsWithNewline = normalized.endsWith('\n');
    const retainedLines = normalized
        .split('\n')
        .map((line) => stripProgressFromLine(line, allowContinuation))
        .filter((line) => line !== null && line !== '');

    if (!retainedLines.length) {
        return '';
    }

    return retainedLines.join('\n') + (endsWithNewline ? '\n' : '');
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

function escapeStataQuotedString(value) {
    return String(value || '').replace(/"/g, '""');
}

function readMacStataPythonExec() {
    const domains = [
        'com.stata.stata19',
        'com.stata.stata18',
        'com.stata.stata17',
        'com.stata.stata16'
    ];

    for (const domain of domains) {
        try {
            const pythonExec = childProcess.execFileSync(
                '/usr/bin/defaults',
                ['read', domain, 'python.pyexec_64'],
                {
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'ignore']
                }
            ).trim();
            if (pythonExec) {
                return pythonExec;
            }
        } catch (_) {
            // Try the next installed Stata version.
        }
    }

    return '';
}

async function syncMacStataPythonConfig(consoleSession) {
    const pythonExec = readMacStataPythonExec();
    if (!pythonExec) {
        return;
    }

    const command = `python set exec "${escapeStataQuotedString(pythonExec)}"`;
    const result = await consoleSession.execute(command, false);
    if (!result.success) {
        console.warn(
            'Stata All in One: Failed to apply Stata Python configuration:',
            result.error || result.output || result.returnCode
        );
    }
}

async function ensureConsoleSession(context) {
    // If session was marked stale (console panel closed), shut it down first.
    // This deferred shutdown is safe because no execution is running right now.
    if (session.isSessionStale()) {
        session.clearStaleSession();
    }

    if (session.hasActiveConsoleSession()) {
        return {
            success: true,
            fromExisting: true
        };
    }

    const resolvedInstallation = await ensureStataConfigured(context, { promptOnFailure: true });
    if (!resolvedInstallation) {
        return {
            success: false,
            failCode: 'INSTALLATION_NOT_CONFIGURED',
            reason: msg('noStataInstalled', { installedList: 'none detected' })
        };
    }

    let savedPath = context ? context.globalState.get('stataConsoleDylibPath') : null;
    const detectedAppPath = context ? context.globalState.get('stataGuiAppPath') : null;
    if (!savedPath && detectedAppPath && fs.existsSync(detectedAppPath)) {
        const configuredEditionMatch = String(config.getStataVersion() || '').match(/^Stata(MP|SE|BE|IC)$/i);
        if (configuredEditionMatch) {
            const edition = configuredEditionMatch[1].toLowerCase();
            const detectedDylibPath = path.join(
                detectedAppPath,
                'Contents',
                'MacOS',
                `libstata-${edition}.dylib`
            );
            if (fs.existsSync(detectedDylibPath)) {
                savedPath = detectedDylibPath;
            } else {
                return {
                    success: false,
                    failCode: 'LIBRARY_NOT_FOUND',
                    reason: msg('consoleLibraryMissingInSelected', {
                        libraryName: path.basename(detectedDylibPath)
                    })
                };
            }
        }
    }
    const dylibInfo = findStataDylib(null, savedPath);

    if (!dylibInfo.path) {
        console.error('Stata All in One: 未找到 Stata dylib，已安装版本:', dylibInfo.installed);
        return {
            success: false,
            failCode: 'LIBRARY_NOT_FOUND',
            reason: '无法找到 Stata。请确保 Stata MP/SE/BE 已安装在 /Applications 目录下。'
        };
    }

    if (context && !dylibInfo.fromCache) {
        await context.globalState.update('stataConsoleDylibPath', dylibInfo.path);
        console.log('Stata All in One: 已保存 dylib 路径:', dylibInfo.path);
    }

    // Derive the Stata install directory to check for license file
    // macOS: /Applications/StataMP.app/Contents/MacOS/libstata-mp.dylib → /Applications
    const stHomeDir = dylibInfo.path
        ? path.dirname(path.dirname(path.dirname(path.dirname(dylibInfo.path))))
        : null;
    const licPath = stHomeDir ? path.join(stHomeDir, 'stata.lic') : null;

    // Pre-check: no license file → bail out early, let caller show dialog
    if (!licPath || !fs.existsSync(licPath)) {
        console.log('Stata All in One: No stata.lic found in', stHomeDir);
        return { success: false, noLicense: true, failCode: 'LICENSE_NOT_FOUND', reason: '' };
    }

    process.env.STATA_LICENSE = licPath;
    console.log('Stata All in One: License file found:', licPath);

    const initResult = await session.initConsoleSession(context, dylibInfo.path);
    if (!initResult.success) {
        console.error('Stata All in One: 会话初始化失败:', initResult.error);
        const detail = initResult.error ? `：${initResult.error}` : '';
        return {
            success: false,
            failCode: initResult.failCode || 'SESSION_INIT_FAILED',
            reason: `Stata 会话初始化失败${detail}。请检查 Stata ${dylibInfo.edition ? dylibInfo.edition.toUpperCase() : ''} 是否正确安装。`
        };
    }

    const consoleSession = session.getConsoleSession(context);
    if (consoleSession) {
        await syncMacStataPythonConfig(consoleSession);
    }

    // License was found and session initialized — clear any suppression preference
    if (context && context.globalState.get(LICENSE_DIALOG_SUPPRESSED_KEY)) {
        await context.globalState.update(LICENSE_DIALOG_SUPPRESSED_KEY, false);
        await context.globalState.update(LICENSE_DIALOG_REMIND_KEY, 0);
        showInfo(`Stata All in One: ${msg('consoleLicenseFound')}`);
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
    let lastRealChunkAt = 0;
    let progressOutputActive = false;
    let lastProgressState = '';
    let runStartTime = null;
    let graphCaptureState = null;
    let graphDir = null;
    const outputSink = getOutputSink();

    try {
        const initResult = await ensureConsoleSession(context);
        if (!initResult.success) {
            return {
                success: false,
                shouldOfferGuiFallback: true,
                errorType: 'extension',
                message: initResult.reason,
                noLicense: initResult.noLicense || false,
                failCode: initResult.failCode || 'UNKNOWN_ERROR'
            };
        }

        const consoleSession = session.getConsoleSession(context);
        if (!consoleSession || !consoleSession.isInitialized()) {
            console.error('Stata All in One: 无法获取有效的 Stata 会话');
            return {
                success: false,
                shouldOfferGuiFallback: true,
                errorType: 'extension',
                message: '无法获取有效的 Stata 会话。'
            };
        }

        _activeOutputSink = outputSink;
        try {
            graphDir = getGraphCacheDir(context);
            setGraphResourceRoot(graphDir);
        } catch (error) {
            console.error('Stata All in One: Failed to initialize graph cache:', error.message);
        }
        await outputSink.prepareForExecution();

        const normalizedCode = normalizeCodeToRun(codeToRun);
        const hasExecOverride = options && options.execCode !== undefined;
        const execCode = hasExecOverride
            ? normalizeCodeToRun(options.execCode)
            : normalizedCode;
        const progressTotal = extractProgressTotalFromCode(execCode);
        await ensureWebviewBootstrap(consoleSession);
        await ensureInitialWorkingDirectory(consoleSession, docDir);
        if (typeof outputSink.setWorkingDirectory === 'function') {
            outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
        }
        graphCaptureState = await beginGraphCapture(consoleSession);
        executionPlan = createExecutionPlan(execCode, consoleSession.getWorkingDirectory());
        lastRealChunkAt = Date.now();
        runStartTime = lastRealChunkAt;
        const onExecutionChunk = (chunk) => {
            if (!chunk) {
                return;
            }

            streamedOutput += chunk;
            lastRealChunkAt = Date.now();

            const hasProgressOutput = hasProgressLine(chunk, progressOutputActive);

            if (hasProgressOutput) {
                progressOutputActive = true;
            }

            if (progressOutputActive && typeof outputSink.setWorkingDetail === 'function') {
                const progressDetail = extractProgressDetail(chunk);
                let nextState = '';
                if (progressDetail) {
                    const current = parseIntegerWithCommas(progressDetail);
                    if (progressTotal && current !== null) {
                        nextState = current + '/' + progressTotal;
                        outputSink.setWorkingDetail({ kind: 'progress', current, total: progressTotal });
                    } else {
                        nextState = String(progressDetail);
                        outputSink.setWorkingDetail(progressDetail);
                    }
                } else if (progressTotal && hasProgressOutput && !lastProgressState) {
                    nextState = '?' + '/' + progressTotal;
                    outputSink.setWorkingDetail({ kind: 'progress', total: progressTotal });
                }
                if (nextState) lastProgressState = nextState;
            }

            const visibleChunk = progressOutputActive || hasProgressOutput
                ? stripProgressFromChunk(chunk, progressOutputActive)
                : chunk;
            if (visibleChunk) {
                outputSink.writeOutputChunk(visibleChunk);
            } else if (progressOutputActive && typeof outputSink.discardBufferedOutput === 'function') {
                outputSink.discardBufferedOutput();
            }

            if (progressOutputActive && !hasProgressOutput && visibleChunk) {
                progressOutputActive = false;
                if (typeof outputSink.setWorkingDetail === 'function') {
                    outputSink.setWorkingDetail(null);
                }
            }
        };

        if (typeof outputSink.writeCommand === 'function') {
            outputSink.writeCommand(executionPlan.displayCode || normalizedCode);
        }

        let result = null;
        if (!execCode.trim()) {
            console.log('[mac.js] No executable Stata code to run');
            result = { success: true, returnCode: 0, output: '' };
        } else if (Array.isArray(executionPlan.commands) && executionPlan.commands.length) {
            for (const command of executionPlan.commands) {
                if (typeof outputSink.setWorkingDirectory === 'function') {
                    outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
                }
                result = await executeConsoleCommand(consoleSession, graphDir, command, onExecutionChunk);
                await writeChangedGraphs(consoleSession, graphDir, graphCaptureState, outputSink, true);
                if (!result.success) {
                    break;
                }
                updateWorkingDirectoryFromCode(consoleSession, command);
                if (typeof outputSink.setWorkingDirectory === 'function') {
                    outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
                }
            }
        } else {
            // writeCommand already shows the code; echo:false avoids duplicate
            result = await executeConsoleCommand(consoleSession, graphDir, executionPlan.command, onExecutionChunk);
            if (result.success && !executionPlan.tempFilePath) {
                updateWorkingDirectoryFromCode(consoleSession, executionPlan.command);
                if (typeof outputSink.setWorkingDirectory === 'function') {
                    outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
                }
            }
        }

        if (!executionPlan.commands && result.output) {
            const tailChunk = computeIncrementalChunk(streamedOutput, result.output);
            if (tailChunk) {
                const hasTailProgressOutput = hasProgressLine(tailChunk, progressOutputActive);
                const visibleTailChunk = hasTailProgressOutput || progressOutputActive
                    ? stripProgressFromChunk(tailChunk, progressOutputActive || hasTailProgressOutput)
                    : tailChunk;
                if (visibleTailChunk) {
                    outputSink.writeOutputChunk(visibleTailChunk);
                } else if ((hasTailProgressOutput || progressOutputActive) && typeof outputSink.discardBufferedOutput === 'function') {
                    outputSink.discardBufferedOutput();
                }
                streamedOutput += tailChunk;
            }
        }

        outputSink.flushOutput();
        await writeChangedGraphs(consoleSession, graphDir, graphCaptureState, outputSink);

        if (!result.success) {
            console.error('Stata All in One: 执行失败:', result.error);
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

        updateWorkingDirectoryFromCode(consoleSession, normalizedCode);
        if (typeof outputSink.setWorkingDirectory === 'function') {
            outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
        }
        return {
            success: true,
            shouldOfferGuiFallback: false
        };
    } catch (error) {
        console.error('Stata All in One: runOnMacWebview 异常:', error.message);

        _activeOutputSink = outputSink;
        await outputSink.prepareForExecution();
        outputSink.writeError(error.message);
        return {
            success: false,
            shouldOfferGuiFallback: true,
            errorType: 'extension',
            message: `Stata 执行错误: ${error.message}`,
            failCode: 'UNKNOWN_ERROR'
        };
    } finally {
        outputSink.flushOutput();
        const activeSession = session.getActiveSession();
        if (activeSession) {
            await endGraphCapture(activeSession, graphCaptureState);
        }
        if (runStartTime !== null && !options.suppressRunFooter) {
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

async function executeConsoleCommand(consoleSession, graphDir, command, onExecutionChunk) {
    const graphExportResult = await executeBitmapGraphExport(
        consoleSession,
        graphDir,
        command,
        consoleSession.getWorkingDirectory(),
        convertGraphSvgToBitmap
    );

    if (graphExportResult) {
        if (graphExportResult.output && typeof onExecutionChunk === 'function') {
            onExecutionChunk(graphExportResult.output);
        }
        return graphExportResult;
    }

    return await consoleSession.execute(command, false, onExecutionChunk);
}

async function writeChangedGraphs(consoleSession, graphDir, captureState, outputSink, resetAfterExport = false) {
    if (!captureState || !captureState.enabled || !graphDir || typeof outputSink.writeGraphEntries !== 'function') {
        return;
    }

    const exportedGraphs = await exportCapturedGraphs(
        consoleSession,
        graphDir,
        captureState,
        { resetAfterExport }
    );
    if (!exportedGraphs.length) {
        return;
    }

    outputSink.flushOutput();
    outputSink.writeGraphEntries(exportedGraphs);
}

async function ensureInitialWorkingDirectory(consoleSession, docDir) {
    await ensureSessionWorkingDirectory(
        consoleSession,
        docDir,
        config.getCdToDoFileDir()
    );
}

async function ensureWebviewBootstrap(consoleSession) {
    if (consoleSession.isBootstrapped()) {
        return;
    }

    const bootstrapCommands = [
        'quietly clear all',
        'quietly set more off',
        'quietly set linesize 255'
    ];

    for (const command of bootstrapCommands) {
        const result = await consoleSession.execute(command, false);
        if (!result.success) {
            throw new Error(result.error || `Failed to run bootstrap command: ${command}`);
        }
    }

    consoleSession.setBootstrapped(true);
}

function updateWorkingDirectoryFromCode(consoleSession, codeToRun) {
    const nextWorkingDirectory = extractLastCdTarget(codeToRun, consoleSession.getWorkingDirectory());
    if (nextWorkingDirectory) {
        consoleSession.setWorkingDirectory(nextWorkingDirectory);
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
            commands: null,
            displayCode: lines.join('\n'),
            tempFilePath: null
        };
    }

    if (lines.length === 1 && isStandaloneCdCommand(lines[0])) {
        return {
            command: lines[0],
            commands: null,
            displayCode: lines.join('\n'),
            tempFilePath: null
        };
    }

    const directLines = buildDirectExecutionLines(lines);

    if (directLines.length === 1 && lines.length === 1 && canExecuteLineByLine(directLines)) {
        return {
            command: directLines[0],
            commands: null,
            displayCode: lines.join('\n'),
            tempFilePath: null
        };
    }

    if (directLines.length > 0 && canExecuteLineByLine(directLines)) {
        return {
            command: directLines.join('\n'),
            commands: directLines,
            displayCode: lines.join('\n'),
            tempFilePath: null
        };
    }

    const tempFilePath = getTempFilePath(workingDirectory);
    fs.writeFileSync(tempFilePath, lines.join('\n'), 'utf8');

    return {
        command: `do "${tempFilePath.replace(/"/g, '""')}"`,
        commands: null,
        displayCode: lines.join('\n'),
        tempFilePath
    };
}

function canExecuteLineByLine(lines) {
    return lines.every(line => {
        const trimmed = String(line || '').trim();
        if (!trimmed || shouldUseDoFileForSingleLine(trimmed)) {
            return false;
        }
        if (/[{}]/.test(trimmed) || /;\s*$/.test(trimmed) || /\/\/\/\s*$/.test(trimmed)) {
            return false;
        }
        if (/^#delimit\b/i.test(trimmed)) {
            return false;
        }
        if (/^(program|mata|python)\b/i.test(trimmed)) {
            return false;
        }
        return true;
    });
}

function buildDirectExecutionLines(lines) {
    const directLines = [];
    let continuation = '';

    for (const line of lines) {
        const trimmed = String(line || '').trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
            continue;
        }
        if (trimmed.includes('/*')) {
            return [];
        }

        const continuationIndex = findLineContinuationIndex(trimmed);
        if (continuationIndex !== -1) {
            const segment = trimmed.slice(0, continuationIndex).trimEnd();
            continuation = appendCommandSegment(continuation, segment);
            continue;
        }

        const normalized = stripTrailingLineComment(trimmed).trim();
        if (!normalized) {
            continue;
        }

        if (continuation) {
            directLines.push(appendCommandSegment(continuation, normalized));
            continuation = '';
        } else {
            directLines.push(normalized);
        }
    }

    if (continuation) {
        directLines.push(continuation);
    }

    return directLines;
}

function appendCommandSegment(current, segment) {
    const cleanSegment = String(segment || '').trim();
    if (!cleanSegment) {
        return current;
    }
    return current ? `${current} ${cleanSegment}` : cleanSegment;
}

function findLineContinuationIndex(line) {
    let inDoubleQuote = false;
    for (let index = 0; index < line.length - 2; index += 1) {
        const char = line[index];
        if (char === '"') {
            if (inDoubleQuote && line[index + 1] === '"') {
                index += 1;
                continue;
            }
            inDoubleQuote = !inDoubleQuote;
            continue;
        }
        if (!inDoubleQuote && line[index] === '/' && line[index + 1] === '/' && line[index + 2] === '/') {
            return index;
        }
    }
    return -1;
}

function stripTrailingLineComment(line) {
    let inDoubleQuote = false;
    for (let index = 0; index < line.length - 1; index += 1) {
        const char = line[index];
        if (char === '"') {
            if (inDoubleQuote && line[index + 1] === '"') {
                index += 1;
                continue;
            }
            inDoubleQuote = !inDoubleQuote;
            continue;
        }
        if (!inDoubleQuote && char === '/' && line[index + 1] === '/') {
            return line.slice(0, index);
        }
    }
    return line;
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
async function initConsoleSession(context) {
    try {
        const result = await ensureConsoleSession(context);
        if (!result.success) {
            showError(result.reason);
            return false;
        }

        if (!result.fromExisting) {
            showInfo(
                `Stata ${result.edition ? result.edition.toUpperCase() : ''} 会话已初始化成功。`
            );
        }

        return true;
    } catch (error) {
        console.error('Stata All in One: initConsoleSession 异常:', error.message);
        showError(`Stata 初始化错误: ${error.message}`);
        return false;
    }
}

/**
 * Stop Stata execution in embedded console
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {boolean} - 成功返回 true
 */
async function stopConsoleExecution(context) {
    try {
        if (session.hasActiveConsoleSession()) {
            const consoleSession = session.getConsoleSession(context);
            consoleSession.stop();
        }

        if (_activeOutputSink) {
            if (typeof _activeOutputSink.setStatus === 'function') {
                _activeOutputSink.setStatus('idle');
            }
        }

        return true;
    } catch (error) {
        console.error('Stata All in One: stopConsoleExecution 异常:', error.message);
        return false;
    }
}

/**
 * Get current Stata session
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {StataConsoleSession|null} - 会话实例或 null
 */
function getConsoleSession(context) {
    return session.getConsoleSession(context);
}

/**
 * 强制关闭 Stata 会话
 * @returns {boolean} - 成功返回 true
 */
function forceShutdownConsoleSession() {
    try {
        _activeOutputSink = null;
        return session.forceShutdownConsoleSession();
    } catch (error) {
        console.error('Stata All in One: forceShutdownConsoleSession 异常:', error.message);
        return false;
    }
}

module.exports = {
    findStataDylib,
    syncMacStataPythonConfig,
    ensureConsoleSession,
    showConsoleLicenseDialog,
    runOnMacWebview,
    initConsoleSession,
    stopConsoleExecution,
    getConsoleSession,
    forceShutdownConsoleSession
};
