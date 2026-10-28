const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('separates submitted input from direct and temporary do-file command echoes', () => {
    const platformSources = [
        '../modules/runCode/embeddedConsole/runner.js'
    ].map(relativePath => fs.readFileSync(path.join(__dirname, relativePath), 'utf8'));

    for (const source of platformSources) {
        assert.equal(
            source.includes("typeof outputSink.writeSubmission === 'function'"),
            true
        );
        assert.equal(
            source.includes("outputSink.beginTemporaryDoFileOutput(executionPlan.tempFilePath)"),
            true
        );
        assert.match(source, /for \(const \[commandIndex, command\] of executionPlan\.commands\.entries\(\)\)/);
        assert.match(source, /outputSink\.writeCommand\(command\)/);
        assert.equal(
            source.includes("Temporary do-files rely on Stata's native echo for their internal commands."),
            true
        );
        assert.match(source, /command: `do "\$\{tempFilePath\.replace/);
        assert.doesNotMatch(source, /command: `run "\$\{tempFilePath\.replace/);
    }
});

test('routes primary echoes through comment-aware run grouping', () => {
    const panelSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/panel.js'),
        'utf8'
    );

    assert.match(panelSource, /const \{ PrimaryEchoGrouper \} = require\('\.\/echoGrouping'\)/);
    assert.match(panelSource, /this\._primaryEchoGrouper = new PrimaryEchoGrouper\(\)/);
    assert.match(panelSource, /writeCommand\(command\) \{[\s\S]*this\._primaryEchoGrouper\.push\(rendered\)/);
    assert.match(panelSource, /_appendOutputEntries\(entries\) \{[\s\S]*this\._primaryEchoGrouper\.push\(entries\)/);
    assert.match(panelSource, /flushOutput\(\) \{[\s\S]*this\._primaryEchoGrouper\.flush\(\)/);
});

test('the shared runner keeps source comments and blank lines in a temporary do-file for native echo', () => {
    const runnerSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/runner.js'),
        'utf8'
    );
    for (const source of [runnerSource]) {
        assert.match(source, /const lines = splitExecutionSourceLines\(codeToRun\)/);
        assert.match(
            source,
            /const preserveSourceLayoutEcho = hasDisplayableFullLineComment\(lines\)[\s\S]*?hasDisplayableBlankLine\(lines\)/
        );
        assert.match(source, /if \(!preserveSourceLayoutEcho[\s\S]*?directLines\.length === 1/);
        assert.match(source, /if \(!preserveSourceLayoutEcho[\s\S]*?directLines\.length > 0/);
    }
});
