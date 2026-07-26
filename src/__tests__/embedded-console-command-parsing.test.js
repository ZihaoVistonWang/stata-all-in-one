const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeStandaloneCdCommand
} = require('../modules/runCode/embeddedConsole/commandParsing');

test('removes trailing line comments from standalone cd commands', () => {
    assert.equal(
        normalizeStandaloneCdCommand('cd "/路径/data" // 更改当前工作目录'),
        'cd "/路径/data"'
    );
    assert.equal(
        normalizeStandaloneCdCommand('cd results // use local output directory'),
        'cd results'
    );
});

test('keeps double slashes inside a quoted cd path', () => {
    assert.equal(
        normalizeStandaloneCdCommand('cd "https://example.com/data"'),
        'cd "https://example.com/data"'
    );
});

test('does not classify ordinary commands as standalone cd commands', () => {
    assert.equal(normalizeStandaloneCdCommand('display 1 // comment'), null);
});
