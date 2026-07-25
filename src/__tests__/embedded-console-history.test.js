const test = require('node:test');
const assert = require('node:assert/strict');

const {
    appendConsoleHistory
} = require('../modules/runCode/embeddedConsole/consoleHistory');
const {
    serializeConsoleExport
} = require('../modules/runCode/embeddedConsole/consoleExport');

test('keeps and exports complete console history beyond the former 1200-entry limit', async () => {
    let history = [];
    const entries = Array.from({ length: 1400 }, (_, index) => ({
        kind: 'default',
        segments: [{ text: `line ${index + 1}` }]
    }));

    history = appendConsoleHistory(history, entries.slice(0, 700));
    history = appendConsoleHistory(history, entries.slice(700));

    assert.equal(history.length, 1400);
    assert.equal(history[0].segments[0].text, 'line 1');
    assert.equal(history[1399].segments[0].text, 'line 1400');

    const exported = await serializeConsoleExport(history, 'html');
    assert.match(exported.content, />line 1</);
    assert.match(exported.content, />line 1400</);
});
