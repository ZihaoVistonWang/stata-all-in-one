const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseConsoleUnsupportedCommand,
    routeConsoleUnsupportedCommand
} = require('../modules/runCode/consoleCompatibility');

test('recognizes unsupported GUI commands and their which queries', () => {
    assert.deepEqual(parseConsoleUnsupportedCommand('which browse'), {
        kind: 'which', command: 'browse', original: 'which browse'
    });
    assert.deepEqual(parseConsoleUnsupportedCommand('which br'), {
        kind: 'which', command: 'br', original: 'which br'
    });
    assert.deepEqual(parseConsoleUnsupportedCommand('which viewsource, all'), {
        kind: 'which', command: 'viewsource', original: 'which viewsource, all'
    });
    assert.deepEqual(parseConsoleUnsupportedCommand('findit cleanplots'), {
        kind: 'direct', command: 'findit', original: 'findit cleanplots'
    });
    assert.equal(parseConsoleUnsupportedCommand('which summarize'), null);
    assert.equal(parseConsoleUnsupportedCommand('browse price mpg'), null);
    assert.equal(parseConsoleUnsupportedCommand('br price mpg'), null);
});

test('writes a compatibility message instead of sending unsupported commands to Stata', async () => {
    const events = [];
    const sink = {
        async prepareForExecution() { events.push('prepare'); },
        writeCommand(command) { events.push(['command', command]); },
        writeRawChunk(message) { events.push(['message', message]); },
        flushOutput() { events.push('flush'); },
        setStatus(status) { events.push(['status', status]); }
    };

    const result = await routeConsoleUnsupportedCommand('which browse', {
        getTerminalSink: () => sink,
        message: 'browse is handled by the Data Viewer.'
    });

    assert.equal(result.kind, 'which');
    assert.deepEqual(events, [
        'prepare',
        ['command', 'which browse'],
        ['message', 'browse is handled by the Data Viewer.'],
        'flush',
        ['status', 'success']
    ]);
});
