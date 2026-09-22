function parseBrowseCommand(code) {
    const normalized = String(code || '').replace(/\r\n?/g, '\n').trim();
    if (!normalized || normalized.includes('\n')) {
        return null;
    }

    const match = normalized.match(/^(browse|br)\b\s*(.*)$/i);
    if (!match) {
        return null;
    }

    return {
        command: match[1].toLowerCase(),
        filterText: match[2].trim()
    };
}

function splitBrowseCommandSegments(code) {
    const normalized = String(code || '').replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    const segments = [];
    let codeLines = [];

    const flushCode = () => {
        const code = codeLines.join('\n').trim();
        if (code) {
            segments.push({ type: 'code', code });
        }
        codeLines = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
        const parsed = parseBrowseCommand(lines[index]);
        let previousLineIndex = index - 1;
        while (previousLineIndex >= 0 && !lines[previousLineIndex].trim()) {
            previousLineIndex -= 1;
        }
        const followsContinuation = previousLineIndex >= 0
            && /\/\/\/\s*$/.test(lines[previousLineIndex]);

        if (parsed && !followsContinuation) {
            flushCode();
            segments.push({
                type: 'browse',
                commandText: lines[index].trim(),
                filterText: parsed.filterText
            });
            continue;
        }

        codeLines.push(lines[index]);
    }

    flushCode();
    return segments;
}

function shouldRouteBrowseCommand(runMode) {
    return runMode === 'embeddedConsole';
}

async function routeBrowseCommand(code, dependencies = {}) {
    const parsed = parseBrowseCommand(code);
    if (!parsed) {
        return null;
    }

    // Loaded lazily: the Data Viewer panel pulls in `vscode`, and this module is
    // also imported by the pure-logic tests.
    let dataViewer = null;
    const loadDataViewer = () => {
        if (!dataViewer) {
            dataViewer = require('./embeddedConsole/dataViewer/panel');
        }
        return dataViewer;
    };
    const revealDataViewer = dependencies.revealDataViewer
        || ((...args) => loadDataViewer().revealDataViewer(...args));
    // The data-viewer-specific result is only reachable when the Data Viewer
    // module itself is available; a caller that supplies its own reveal function
    // (the logic tests) simply has no result to read.
    const safeDataViewer = () => {
        try {
            return loadDataViewer();
        } catch (_error) {
            return null;
        }
    };
    const readLastResult = dependencies.getLastRevealResult
        || (() => {
            const viewer = safeDataViewer();
            return viewer && typeof viewer.getLastRevealResult === 'function'
                ? viewer.getLastRevealResult()
                : null;
        });
    const readRevealSequence = dependencies.getRevealSequence
        || (() => {
            const viewer = safeDataViewer();
            return viewer && typeof viewer.getRevealSequence === 'function'
                ? viewer.getRevealSequence()
                : null;
        });
    const getTerminalSink = dependencies.getTerminalSink
        || require('./embeddedConsole/panel').getWebviewTerminalSink;
    // utils/common requires `vscode`, so it is resolved only when a message is
    // actually needed; the logic tests supply their own strings.
    const msg = (key, params) => require('../../utils/common').msg(key, params);
    const openedMessage = dependencies.openedMessage
        || msg('dataViewerOpenedNotice', { title: msg('dataViewerPanelTitle') });
    const readFailedMessage = dependencies.readFailedMessage
        || (() => msg('dataViewerReadFailed'));
    const openedWithErrorMessage = dependencies.openedWithErrorMessage
        || ((error) => msg('dataViewerOpenedWithError', { error }));

    const sink = getTerminalSink();
    await sink.prepareForExecution();
    sink.writeCommand(String(code || '').trim());
    const sequenceBefore = readRevealSequence();
    await revealDataViewer(parsed.filterText, {
        allowWhileRunning: Boolean(dependencies.keepRunning),
        captureSnapshot: Boolean(dependencies.keepRunning)
    });

    // Opening the panel and reading the data are separate outcomes. Reporting
    // "opened" as success while the read failed is what hid plugin and session
    // failures behind an empty viewer.
    //
    // The reveal result is stamped with a sequence number: when this reveal did
    // not run to completion (the Console was busy, say), the result left over
    // from an earlier reveal must not be attributed to this run.
    let revealResult = readLastResult();
    const sequenceAfter = readRevealSequence();
    if (revealResult && sequenceBefore !== null && sequenceAfter !== null
        && revealResult.sequence !== sequenceAfter) {
        revealResult = null;
    }
    if (!revealResult) {
        revealResult = {
            success: false,
            status: 'read-failed',
            error: readFailedMessage()
        };
    }
    const readFailed = Boolean(revealResult && revealResult.success === false);
    if (readFailed) {
        const reason = revealResult.error || readFailedMessage();
        sink.writeRawChunk(openedWithErrorMessage(reason));
        sink.flushOutput();
        if (!dependencies.keepRunning) {
            sink.setStatus('error');
        }
        return {
            success: false,
            shouldOfferGuiFallback: false,
            routedToDataViewer: true,
            viewerOpened: true,
            readFailed: true,
            status: revealResult.status,
            error: reason,
            filterText: parsed.filterText
        };
    }

    sink.writeRawChunk(openedMessage);
    sink.flushOutput();
    if (!dependencies.keepRunning) {
        sink.setStatus('success');
    }

    return {
        success: true,
        shouldOfferGuiFallback: false,
        routedToDataViewer: true,
        viewerOpened: true,
        status: revealResult ? revealResult.status : 'ok',
        filterText: parsed.filterText
    };
}

module.exports = {
    parseBrowseCommand,
    splitBrowseCommandSegments,
    shouldRouteBrowseCommand,
    routeBrowseCommand
};
