const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('separates submitted input from direct and temporary do-file command echoes', () => {
    const platformSources = [
        '../modules/runCode/embeddedConsole/mac.js',
        '../modules/runCode/embeddedConsole/windows.js'
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
        assert.match(source, /for \(const command of executionPlan\.commands\)|for \(let ci = 0; ci < executionPlan\.commands\.length; ci\+\+\)/);
        assert.match(source, /outputSink\.writeCommand\(command\)/);
        assert.equal(
            source.includes("Temporary do-files rely on Stata's native echo for their internal commands."),
            true
        );
        assert.match(source, /command: `do "\$\{tempFilePath\.replace/);
        assert.doesNotMatch(source, /command: `run "\$\{tempFilePath\.replace/);
    }
});

test('adds one blank line before later primary echoes without splitting continuations', () => {
    const panelSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/panel.js'),
        'utf8'
    );

    assert.match(panelSource, /const isPrimaryEcho = \(kind === 'command' \|\| kind === 'comment-command'\)[\s\S]*text\.startsWith\('\. '\)/);
    assert.match(panelSource, /this\._primaryEchoCount > 0 && !this\._lastEchoEntryWasBlank/);
    assert.match(panelSource, /spaced\.push\(\{ kind: 'blank', segments: \[\] \}\)/);
    assert.match(panelSource, /writeCommand\(command\) \{[\s\S]*this\._insertPrimaryEchoSpacing\(rendered\)/);
    assert.match(panelSource, /_appendOutputEntries\(entries\) \{[\s\S]*this\._insertPrimaryEchoSpacing\(entries\)/);
});
