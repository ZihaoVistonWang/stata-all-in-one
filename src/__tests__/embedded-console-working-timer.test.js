const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    formatWorkingElapsedSeconds
} = require('../modules/runCode/embeddedConsole/workingTimer');

const panelSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/runCode/embeddedConsole/panel.js'),
    'utf8'
);

test('formats elapsed working time across minute and hour boundaries', () => {
    assert.equal(formatWorkingElapsedSeconds(0), '0s');
    assert.equal(formatWorkingElapsedSeconds(59), '59s');
    assert.equal(formatWorkingElapsedSeconds(60), '1m00s');
    assert.equal(formatWorkingElapsedSeconds(125), '2m05s');
    assert.equal(formatWorkingElapsedSeconds(3599), '59m59s');
    assert.equal(formatWorkingElapsedSeconds(3600), '1h00m00s');
    assert.equal(formatWorkingElapsedSeconds(7384), '2h03m04s');
});

test('keeps an authoritative start time and refreshes after webview throttling', () => {
    assert.match(panelSource, /let _workingStartedAt = 0;/);
    assert.match(panelSource, /workingStartedAt: _workingStartedAt/);
    assert.match(panelSource, /function scheduleWorkingIndicatorTick\(\)/);
    assert.match(panelSource, /Date\.now\(\) - runningStartedAt/);
    assert.match(panelSource, /document\.addEventListener\('visibilitychange'/);
    assert.match(panelSource, /window\.addEventListener\('focus', refreshWorkingIndicatorAfterResume\)/);
    assert.doesNotMatch(panelSource, /workingTimer = setInterval/);
});
