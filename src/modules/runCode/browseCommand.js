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

    const revealDataViewer = dependencies.revealDataViewer
        || require('./embeddedConsole/dataViewer/panel').revealDataViewer;
    const getTerminalSink = dependencies.getTerminalSink
        || require('./embeddedConsole/panel').getWebviewTerminalSink;
    const openedMessage = dependencies.openedMessage
        || (() => {
            const { msg } = require('../../utils/common');
            return msg('dataViewerOpenedNotice', { title: msg('dataViewerPanelTitle') });
        })();

    const sink = getTerminalSink();
    await sink.prepareForExecution();
    sink.writeCommand(String(code || '').trim());
    await revealDataViewer(parsed.filterText, {
        allowWhileRunning: Boolean(dependencies.keepRunning),
        captureSnapshot: Boolean(dependencies.keepRunning)
    });
    sink.writeRawChunk(openedMessage);
    sink.flushOutput();
    if (!dependencies.keepRunning) {
        sink.setStatus('success');
    }

    return {
        success: true,
        shouldOfferGuiFallback: false,
        routedToDataViewer: true,
        filterText: parsed.filterText
    };
}

module.exports = {
    parseBrowseCommand,
    splitBrowseCommandSegments,
    shouldRouteBrowseCommand,
    routeBrowseCommand
};
