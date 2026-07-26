const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('keeps Stop and Escape active while Stata is stopping without rewriting user code', () => {
    const panelSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/panel.js'),
        'utf8'
    );
    const extensionSource = fs.readFileSync(
        path.join(__dirname, '../extension.js'),
        'utf8'
    );
    const macSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/mac.js'),
        'utf8'
    );
    const windowsSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/windows.js'),
        'utf8'
    );
    const sessionSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/session.js'),
        'utf8'
    );
    const processSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/native/stata_process.js'),
        'utf8'
    );

    assert.equal(panelSource.includes("status === 'running' || status === 'stopping'"), true);
    assert.equal(panelSource.includes("document.body.dataset.status === 'stopping'"), true);
    assert.equal(extensionSource.includes("setWebviewTerminalStatus('stopping')"), true);
    assert.equal(macSource.includes('instrumentStataLoops'), false);
    assert.equal(windowsSource.includes('instrumentStataLoops'), false);
    assert.equal(macSource.includes("fs.writeFileSync(tempFilePath, lines.join('\\n'), 'utf8')"), true);
    assert.equal(windowsSource.includes("fs.writeFileSync(tempFilePath, lines.join('\\n'), 'utf8')"), true);
    assert.equal(sessionSource.includes("require('./native/stata_process')"), true);
    assert.equal(processSource.includes('childProcess.fork('), true);
    assert.equal(processSource.includes("child.kill('SIGKILL')"), true);
    assert.equal(processSource.includes('FORCE_STOP_GRACE_MS = 750'), true);
});
