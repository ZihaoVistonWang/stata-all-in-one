/**
 * Shared Embedded Console execution and lifecycle for macOS, Windows and Linux.
 * Platform modules own discovery, licensing checks and native initialization.
 */

const vscode = require('vscode');
const fs = require('fs');
const session = require('./session');
const completionSound = require('./completionSound');
const { getTempFilePath, cleanupTempFile } = require('../execute/tempfile');
const config = require('../../../utils/config');
const { ensureSessionWorkingDirectory, syncSessionWorkingDirectory } = require('./workingDirectory');
const { msg } = require('../../../utils/common');
const { getWebviewTerminalSink, setGraphResourceRoot, convertGraphSvgToBitmap } = require('./panel');
const { beginGraphCapture, endGraphCapture, executeBitmapGraphExport, exportCapturedGraphs, getGraphCacheDir } = require('./graphs');
const { startSmclSidecar } = require('./smclLinks');
const {
    findLineContinuationIndex,
    hasDisplayableBlankLine,
    hasDisplayableFullLineComment,
    normalizeStandaloneCdCommand,
    splitExecutionSourceLines,
    stripTrailingLineComment
} = require('./commandParsing');
const { applyWebviewBootstrap } = require('./bootstrap');

let _activeOutputSink = null;
const LICENSE_DIALOG_SUPPRESSED_KEY = 'stata-all-in-one.consoleLicenseDialogSuppressed';
const LICENSE_DIALOG_REMIND_KEY = 'stata-all-in-one.consoleLicenseDialogNextReminder';
const LICENSE_DIALOG_REMIND_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * Bind a platform's initializer once, keeping execution options separate from
 * native session setup. Windows retains its existing '+' progress markers.
 */
function createConsoleRunner({ platform, ensureConsoleSession }) {
    const progressMarkerPattern = platform === 'win32'
        ? /(?:\.{2,}[\s+]*\d|\.\d)/
        : /(?:\.{2,}\s*\d|\.\d)/;

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

        const markerMatch = withoutPrompt.match(progressMarkerPattern);
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

        const markerMatch = withoutPrompt.match(progressMarkerPattern);
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

    async function runEmbeddedConsole(codeToRun, tmpFilePath, docDir = null, context = null, options = {}) {
        const completion = options.completionSound || completionSound.getService().begin(options.completionSoundSettings);
        let executionPlan = null;
        let streamedOutput = '';
        let lastRealChunkAt = 0;
        let progressOutputActive = false;
        let lastProgressState = '';
        let runStartTime = null;
        let graphCaptureState = null;
        let graphDir = null;
        let smclSidecar = null;
        const outputSink = getOutputSink();

        try {
            const initResult = await ensureConsoleSession(context);
            if (!initResult.success) {
                completion.abort();
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
                completion.abort();
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
            consoleSession.beginManualStopScope();

            const normalizedCode = normalizeCodeToRun(codeToRun);
            const hasExecOverride = options && options.execCode !== undefined;
            const execCode = hasExecOverride
                ? normalizeCodeToRun(options.execCode)
                : normalizedCode;
            const progressTotal = extractProgressTotalFromCode(execCode);
            await applyWebviewBootstrap(consoleSession);
            await ensureInitialWorkingDirectory(consoleSession, docDir);
            if (typeof outputSink.setWorkingDirectory === 'function') {
                outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
            }
            smclSidecar = await startSmclSidecar(consoleSession);
            graphCaptureState = await beginGraphCapture(consoleSession);
            executionPlan = createExecutionPlan(execCode, consoleSession.getWorkingDirectory());
            if (typeof outputSink.writeSubmission === 'function' && normalizedCode) {
                outputSink.writeSubmission(normalizedCode);
            }
            if (executionPlan.tempFilePath
                && typeof outputSink.beginTemporaryDoFileOutput === 'function') {
                outputSink.beginTemporaryDoFileOutput(executionPlan.tempFilePath);
            }
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
                if (smclSidecar && typeof outputSink.enqueueSemanticLinks === 'function') {
                    smclSidecar.drain()
                        .then(links => outputSink.enqueueSemanticLinks(links))
                        .catch(() => {});
                }
            };

            let result = null;
            if (!execCode.trim()) {
                console.log('Stata All in One: No executable Stata code to run');
                result = { success: true, returnCode: 0, output: '' };
            } else if (Array.isArray(executionPlan.commands) && executionPlan.commands.length) {
                if (platform === 'win32') {
                    console.log(`Stata All in One: Executing ${executionPlan.commands.length} command(s) line-by-line`);
                }
                for (const [commandIndex, command] of executionPlan.commands.entries()) {
                    if (consoleSession.isStopRequested()) {
                        result = {
                            success: false,
                            returnCode: 1,
                            output: '',
                            error: 'Execution interrupted by user.'
                        };
                        break;
                    }
                    if (typeof outputSink.setWorkingDirectory === 'function') {
                        outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
                    }
                    if (typeof outputSink.writeCommand === 'function') {
                        outputSink.writeCommand(command);
                    }
                    const commandStartedAt = Date.now();
                    if (platform === 'win32') {
                        console.log(`Stata All in One: [${commandIndex + 1}/${executionPlan.commands.length}] Executing: ${command.substring(0, 100)}`);
                    }
                    result = await executeConsoleCommand(consoleSession, graphDir, command, onExecutionChunk, completion);
                    if (consoleSession.isStopRequested()) {
                        result = {
                            ...result,
                            success: false,
                            returnCode: 1,
                            error: 'Execution interrupted by user.'
                        };
                        break;
                    }
                    await writeChangedGraphs(consoleSession, graphDir, graphCaptureState, outputSink, true);
                    if (platform === 'win32') {
                        console.log(`Stata All in One: [${commandIndex + 1}/${executionPlan.commands.length}] Done in ${Date.now() - commandStartedAt}ms, success=${result.success}, rc=${result.returnCode}`);
                    }
                    await syncSessionWorkingDirectory(consoleSession);
                    if (typeof outputSink.setWorkingDirectory === 'function') {
                        outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
                    }
                    if (!result.success) {
                        if (platform === 'win32') console.error(`Stata All in One: Command failed: ${result.error}`);
                        break;
                    }
                }
            } else {
                const commandStartedAt = Date.now();
                if (platform === 'win32') {
                    console.log(`Stata All in One: Executing single command via do-file: ${executionPlan.command.substring(0, 100)}`);
                }
                if (!executionPlan.tempFilePath && typeof outputSink.writeCommand === 'function') {
                    outputSink.writeCommand(executionPlan.displayCode || normalizedCode);
                }
                // Temporary do-files rely on Stata's native echo for their internal commands.
                result = await executeConsoleCommand(consoleSession, graphDir, executionPlan.command, onExecutionChunk, completion);
                await syncSessionWorkingDirectory(consoleSession);
                if (typeof outputSink.setWorkingDirectory === 'function') {
                    outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
                }
                if (platform === 'win32') {
                    console.log(`Stata All in One: Do-file execution done in ${Date.now() - commandStartedAt}ms, success=${result.success}`);
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
            if (typeof outputSink.finishTemporaryDoFileOutput === 'function') {
                outputSink.finishTemporaryDoFileOutput();
            }

            if (!result || result.sessionUnavailable || result.sessionLost || result.forced
                || result.interrupted || consoleSession.isStopRequested()) completion.abort();
            outputSink.flushOutput();
            await writeChangedGraphs(consoleSession, graphDir, graphCaptureState, outputSink);

            if (!result.success) {
                console.error('Stata All in One: 执行失败:', result.error);
                if (typeof outputSink.markRunFailed === 'function') {
                    outputSink.markRunFailed();
                }
                if (result.forced && typeof outputSink.writeWarningMessage === 'function') {
                    outputSink.writeWarningMessage(msg('consoleForceStopped'));
                }
                if (consoleSession.isStopRequested()
                    && !/--break--/i.test(`${streamedOutput}\n${result.output || ''}`)
                    && typeof outputSink.writeBreak === 'function') {
                    outputSink.writeBreak();
                }
                if (!result.output && !consoleSession.isStopRequested()) {
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

            if (typeof outputSink.setWorkingDirectory === 'function') {
                outputSink.setWorkingDirectory(consoleSession.getWorkingDirectory());
            }
            return {
                success: true,
                shouldOfferGuiFallback: false
            };
        } catch (error) {
            completion.abort();
            console.error(`Stata All in One: ${platform} Embedded Console exception:`, error.message);

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
            const soundSession = session.getActiveSession();
            if (soundSession && soundSession.isStopRequested()) completion.abort();
            if (!options.completionSound) completion.finish();
            if (typeof outputSink.finishTemporaryDoFileOutput === 'function') {
                outputSink.finishTemporaryDoFileOutput();
            }
            outputSink.flushOutput();
            if (smclSidecar) {
                const links = await smclSidecar.finish();
                if (typeof outputSink.applySemanticLinksWithRetry === 'function') {
                    await outputSink.applySemanticLinksWithRetry(links);
                } else if (typeof outputSink.applySemanticLinks === 'function') {
                    outputSink.applySemanticLinks(links);
                }
            }
            const activeSession = session.getActiveSession();
            if (activeSession) {
                if (activeSession.isStopRequested()) completion.abort();
                activeSession.clearManualStopScope();
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

    async function executeConsoleCommand(consoleSession, graphDir, command, onExecutionChunk, completion) {
        const executionOptions = completion ? {
            onExecutionComplete: (result, elapsedMs) => completion.record(result, elapsedMs)
        } : null;
        const graphSession = Object.create(consoleSession);
        graphSession.execute = (code, echo, onOutput) => consoleSession.execute(code, echo, onOutput, executionOptions);
        const graphExportResult = await executeBitmapGraphExport(
            graphSession,
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

        return await consoleSession.execute(command, false, onExecutionChunk, executionOptions);
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



    function createExecutionPlan(codeToRun, workingDirectory) {
        const lines = splitExecutionSourceLines(codeToRun);

        if (!lines.some(line => line.trim().length > 0)) {
            return {
                command: '',
                commands: null,
                displayCode: lines.join('\n'),
                tempFilePath: null
            };
        }

        const standaloneCdCommand = lines.length === 1
            ? normalizeStandaloneCdCommand(lines[0])
            : null;
        if (standaloneCdCommand) {
            return {
                command: standaloneCdCommand,
                commands: null,
                displayCode: lines.join('\n'),
                tempFilePath: null
            };
        }

        const directLines = buildDirectExecutionLines(lines);
        const preserveSourceLayoutEcho = hasDisplayableFullLineComment(lines)
            || hasDisplayableBlankLine(lines);

        if (!preserveSourceLayoutEcho
            && directLines.length === 1
            && lines.length === 1
            && canExecuteLineByLine(directLines)) {
            return {
                command: directLines[0],
                commands: null,
                displayCode: lines.join('\n'),
                tempFilePath: null
            };
        }

        if (!preserveSourceLayoutEcho
            && directLines.length > 0
            && canExecuteLineByLine(directLines)) {
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

    function shouldUseDoFileForSingleLine(line) {
        const trimmed = String(line || '').trim();
        return trimmed.includes('//') || trimmed.includes('/*') || trimmed.startsWith('*');
    }

    return runEmbeddedConsole;
}

async function stopConsoleExecution(context) {
    try {
        if (session.hasActiveConsoleSession()) {
            const consoleSession = session.getConsoleSession(context);
            consoleSession.stop();
        }

        if (_activeOutputSink) {
            if (typeof _activeOutputSink.setStatus === 'function') {
                _activeOutputSink.setStatus('stopping');
            }
        }

        return true;
    } catch (error) {
        console.error('Stata All in One: stopConsoleExecution exception:', error.message);
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
        console.error('Stata All in One: forceShutdownConsoleSession exception:', error.message);
        return false;
    }
}

module.exports = {
    createConsoleRunner,
    showConsoleLicenseDialog,
    stopConsoleExecution,
    getConsoleSession,
    forceShutdownConsoleSession
};
