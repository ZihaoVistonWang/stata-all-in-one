const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('uses Stata native echo as the only input display for temporary do-files', () => {
    const platformSources = [
        '../modules/runCode/embeddedConsole/mac.js',
        '../modules/runCode/embeddedConsole/windows.js'
    ].map(relativePath => fs.readFileSync(path.join(__dirname, relativePath), 'utf8'));

    for (const source of platformSources) {
        assert.equal(
            source.includes("if (!executionPlan.tempFilePath && typeof outputSink.writeCommand === 'function')"),
            true
        );
        assert.equal(
            source.includes("Temporary do-files rely on Stata's native echo so the input is shown only once."),
            true
        );
        assert.match(source, /command: `do "\$\{tempFilePath\.replace/);
        assert.doesNotMatch(source, /command: `run "\$\{tempFilePath\.replace/);
    }
});
