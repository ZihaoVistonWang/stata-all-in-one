/**
 * Windows Embedded Console Runner
 * Uses Stata C API via DLL (mp-64.dll) loaded through the native bridge
 * to execute code and stream output to the embedded console webview.
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const session = require('./session');
const { getTempFilePath, cleanupTempFile } = require('../execute/tempfile');
const config = require('../../../utils/config');
const { showInfo, showError } = require('../../../utils/common');
const { getWebviewTerminalSink, setGraphResourceRoot } = require('./panel');
const { beginGraphCapture, endGraphCapture, exportCapturedGraphs, getGraphCacheDir } = require('./graphs');

let _activeOutputSink = null;

const LICENSE_DIALOG_SUPPRESSED_KEY = 'stata-all-in-one.consoleLicenseDialogSuppressed';
const LICENSE_DIALOG_REMIND_KEY = 'stata-all-in-one.consoleLicenseDialogNextReminder';
const LICENSE_DIALOG_REMIND_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function showConsoleLicenseDialog(context) {
    if (!context) return;
    // Respect "don't show again"
    if (context.globalState.get(LICENSE_DIALOG_SUPPRESSED_KEY)) return;
    // Respect 7-day snooze
    const nextReminder = context.globalState.get(LICENSE_DIALOG_REMIND_KEY, 0);
    if (Date.now() < nextReminder) return;

    const { msg } = require('../../../utils/common');
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
    // Closed → do nothing, will show again next time
}

// =========================================================================
// Output processing helpers (shared logic, functionally identical to mac.js)
// =========================================================================

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
    if (allowContinuation && /^[\s.,\d]+(?:\s+done)?$/i.test(withoutPrompt) && /[.\d]/.test(withoutPrompt)) {
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

    const markerMatch = withoutPrompt.match(/(?:\.{2,}[\s+]*\d|\.\d)/);
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
    const matches = [...String(payload || '').matchAll(/(\d{1,3}(?:,\d{3})*)(?=(?:\.+|\s|done|$))/gi)];
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
    if (allowContinuation && /^[\s.,\d]+(?:\s+done)?$/i.test(withoutPrompt) && /[.\d]/.test(withoutPrompt)) {
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

// =========================================================================
// Windows-specific: DLL discovery
// =========================================================================

/**
 * Find Stata DLL on Windows.
 *
 * Resolution order:
 *   1. Saved/cached path from globalState (instant)
 *   2. Derive from `stataPathOnWindows` config — the EXE path set by user.
 *      e.g. D:\Stata18\StataMP-64.exe → D:\Stata18\mp-64.dll
 *   3. Scan common installation directories as a fallback
 *
 * DLL naming convention: <edition>-64.dll
 *   MP: mp-64.dll   SE: se-64.dll   BE: be-64.dll   IC: ic-64.dll
 *
 * @param {string|null} preferredEdition - Preferred edition: 'mp', 'se', 'be', 'ic', or null for auto
 * @param {string|null} savedPath - Previously saved DLL path from globalState
 * @returns {{
 *   path: string|null,
 *   edition: string|null,
 *   installed: string[],
 *   fromCache: boolean
 * }}
 */
function findStataDll() {
    const editionPatterns = {
        mp: ['mp-64.dll', 'StataMP-64.dll'],
        se: ['se-64.dll', 'StataSE-64.dll'],
        be: ['be-64.dll', 'StataBE-64.dll'],
        ic: ['ic-64.dll', 'StataIC-64.dll']
    };

    const exePath = config.getStataPathOnWindows ? config.getStataPathOnWindows() : '';
    const cleanExePath = String(exePath).replace(/^["']|["']$/g, '').trim();

    if (!cleanExePath) {
        return { path: null, edition: null, installed: [] };
    }

    const exeDir = path.dirname(cleanExePath);
    const exeName = path.basename(cleanExePath).toLowerCase();
    const exeEditionMatch = exeName.match(/stata(mp|se|be|ic)-?\d*\.exe$/);
    const exeEdition = exeEditionMatch ? exeEditionMatch[1] : null;

    // Try the matching edition first, then all patterns
    const editionsToTry = exeEdition
        ? [exeEdition, ...Object.keys(editionPatterns).filter(e => e !== exeEdition)]
        : Object.keys(editionPatterns);

    for (const edition of editionsToTry) {
        for (const dllName of editionPatterns[edition]) {
            const dllPath = path.join(exeDir, dllName);
            if (fs.existsSync(dllPath)) {
                return { path: dllPath, edition, installed: [edition] };
            }
        }
    }

    return { path: null, edition: null, installed: [] };
}

// =========================================================================
// Session management
// =========================================================================

async function ensureConsoleSession(context) {
    if (session.hasActiveConsoleSession()) {
        return {
            success: true,
            fromExisting: true
        };
    }

    const dllInfo = findStataDll();

    if (!dllInfo.path) {
        return {
            success: false,
            reason: '无法找到 Stata DLL。请在设置 stata-all-in-one.stataPathOnWindows 中指定 Stata EXE 路径（如 D:\\Stata17\\StataMP-64.exe）。'
        };
    }

    const exeDir = path.dirname(
        String(config.getStataPathOnWindows()).replace(/^["']|["']$/g, '').trim()
    );
    const licPath = path.join(exeDir, 'stata.lic');

    // Pre-check: no license file → bail out early, let the caller show dialog.
    if (!fs.existsSync(licPath)) {
        console.log('[windows.js] No stata.lic found in', exeDir);
        return { success: false, noLicense: true, reason: '' };
    }

    process.env.STATA_LICENSE = licPath;
    console.log('[windows.js] License file found:', licPath);

    const initResult = await session.initConsoleSession(context, dllInfo.path);
    if (!initResult.success) {
        console.error('[windows.js] Session initialization failed:', initResult.error);
        return {
            success: false,
            reason: `Stata 会话初始化失败 (${dllInfo.path})：${initResult.error}。请检查 Stata ${dllInfo.edition ? dllInfo.edition.toUpperCase() : ''} 是否正确安装。`
        };
    }

    // The user previously dismissed the license dialog but now has a
    // license → clear the preference and notify that console mode works.
    if (context && context.globalState.get(LICENSE_DIALOG_SUPPRESSED_KEY)) {
        await context.globalState.update(LICENSE_DIALOG_SUPPRESSED_KEY, false);
        await context.globalState.update(LICENSE_DIALOG_REMIND_KEY, 0);
        const { showInfo, msg } = require('../../../utils/common');
        showInfo(`Stata All in One: ${msg('consoleLicenseFound')}`);
    }

    return {
        success: true,
        fromExisting: false,
        edition: dllInfo.edition
    };
}

// =========================================================================
// Main execution function
// =========================================================================

/**
 * Run code on Windows via Embedded Console-backed session
 * @param {string} codeToRun - The code to execute
 * @param {string} tmpFilePath - Path to temporary file (unused in webview mode)
 * @param {string|null} docDir - Directory of the do file
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @param {object} [options] - Additional options
 * @returns {Promise<object>} - { success, shouldOfferExternalAppFallback, errorType?, message? }
 */
async function runOnWindowsEmbeddedConsole(codeToRun, tmpFilePath, docDir = null, context = null, options = {}) {
    let executionPlan = null;
    let streamedOutput = '';
    let lastRealChunkAt = 0;
    let progressOutputActive = false;
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
                noLicense: initResult.noLicense || false
            };
        }

        const consoleSession = session.getConsoleSession(context);
        if (!consoleSession || !consoleSession.isInitialized()) {
            console.error('[windows.js] Unable to get valid Stata session');
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
            console.error('[windows.js] Failed to initialize graph cache:', error.message);
        }
        await outputSink.prepareForExecution();

        const normalizedCode = normalizeCodeToRun(codeToRun);
        const progressTotal = extractProgressTotalFromCode(normalizedCode);
        await ensureWebviewBootstrap(consoleSession);
        await ensureInitialWorkingDirectory(consoleSession, docDir);
        graphCaptureState = await beginGraphCapture(consoleSession);
        executionPlan = createExecutionPlan(normalizedCode, consoleSession.getWorkingDirectory());
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
                if (progressDetail) {
                    const current = parseIntegerWithCommas(progressDetail);
                    if (progressTotal && current !== null) {
                        outputSink.setWorkingDetail({
                            kind: 'progress',
                            current,
                            total: progressTotal
                        });
                    } else {
                        outputSink.setWorkingDetail(progressDetail);
                    }
                }
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

        let result = null;
        if (Array.isArray(executionPlan.commands) && executionPlan.commands.length) {
            if (typeof outputSink.writeCommand === 'function') {
                outputSink.writeCommand(executionPlan.displayCode || normalizedCode);
            }
            for (const command of executionPlan.commands) {
                result = await consoleSession.execute(command, false, onExecutionChunk);
                if (!result.success) {
                    break;
                }
            }
        } else {
            result = await consoleSession.execute(executionPlan.command, true, onExecutionChunk);
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

        if (!result.success) {
            console.error('[windows.js] Execution failed:', result.error);
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

        if (graphCaptureState && graphCaptureState.enabled && graphDir && typeof outputSink.writeGraphEntries === 'function') {
            const exportedGraphs = await exportCapturedGraphs(consoleSession, graphDir);
            outputSink.writeGraphEntries(exportedGraphs);
        }

        updateWorkingDirectoryFromCode(consoleSession, normalizedCode);
        return {
            success: true,
            shouldOfferGuiFallback: false
        };
    } catch (error) {
        console.error('[windows.js] runOnWindowsEmbeddedConsole exception:', error.message);

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
        outputSink.flushOutput();
        const activeSession = session.getActiveSession();
        if (activeSession) {
            await endGraphCapture(activeSession, graphCaptureState);
        }
        if (runStartTime !== null) {
            outputSink.writeRunFooter(Date.now() - runStartTime);
        }

        if (executionPlan && executionPlan.tempFilePath) {
            cleanupTempFile(executionPlan.tempFilePath).catch(() => {});
        }
    }
}

// =========================================================================
// Code normalization & execution plan (shared logic, identical to mac.js)
// =========================================================================

function normalizeCodeToRun(code) {
    return String(code || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.replace(/^\s*\.\s?/, ''))
        .join('\n')
        .trim();
}

async function ensureInitialWorkingDirectory(consoleSession, docDir) {
    if (consoleSession.getWorkingDirectory() || !docDir || !config.getCdToDoFileDir()) {
        return;
    }

    const escapedDir = String(docDir).replace(/"/g, '""');
    const cdResult = await consoleSession.execute(`quietly cd "${escapedDir}"`, false);
    if (!cdResult.success) {
        throw new Error(cdResult.error || 'Failed to initialize working directory.');
    }

    consoleSession.setWorkingDirectory(docDir);
}

async function ensureWebviewBootstrap(consoleSession) {
    if (consoleSession.isBootstrapped()) {
        return;
    }

    const bootstrapCommands = [
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

// =========================================================================
// Public API
// =========================================================================

/**
 * Initialize Stata session
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {Promise<boolean>} - true if initialization succeeded
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
        console.error('[windows.js] initConsoleSession exception:', error.message);
        showError(`Stata 初始化错误: ${error.message}`);
        return false;
    }
}

/**
 * Stop Stata execution in embedded console
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {boolean}
 */
async function stopEmbeddedConsoleExecution(context) {
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
        console.error('[windows.js] stopEmbeddedConsoleExecution exception:', error.message);
        return false;
    }
}

/**
 * Get current Stata session
 * @param {vscode.ExtensionContext} context
 * @returns {StataConsoleSession|null}
 */
function getConsoleSession(context) {
    return session.getConsoleSession(context);
}

/**
 * Force shutdown the Stata session
 * @returns {boolean}
 */
function forceShutdownEmbeddedConsoleSession() {
    try {
        _activeOutputSink = null;
        return session.forceShutdownConsoleSession();
    } catch (error) {
        console.error('[windows.js] forceShutdownEmbeddedConsoleSession exception:', error.message);
        return false;
    }
}

module.exports = {
    findStataDll,
    showConsoleLicenseDialog,
    runOnWindowsEmbeddedConsole,
    initConsoleSession,
    stopEmbeddedConsoleExecution,
    getConsoleSession,
    forceShutdownEmbeddedConsoleSession
};
