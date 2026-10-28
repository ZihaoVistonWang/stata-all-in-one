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
    const runnerSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/runner.js'),
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
    assert.equal(panelSource.includes('followOutputTail = true;'), true);
    assert.equal(panelSource.includes('const shouldStick = followOutputTail || isOutputAtBottom();'), true);
    assert.equal(panelSource.includes('id="jump-bottom-button"'), true);
    assert.match(
        panelSource,
        /#jump-bottom-button\s*\{[\s\S]*?right:\s*12px;[\s\S]*?border:\s*1px solid var\(--vscode-focusBorder\);[\s\S]*?border-radius:\s*6px;/
    );
    assert.equal(panelSource.includes("const rightAnchor = outputShell.querySelector('.submission-frame') || input;"), true);
    assert.equal(panelSource.includes("jumpBottomButton.style.right = rightOffset + 'px';"), true);
    assert.equal(panelSource.includes('requestHistoryTail(true);'), true);
    assert.equal(extensionSource.includes("setWebviewTerminalStatus('stopping')"), true);
    assert.equal(runnerSource.includes('instrumentStataLoops'), false);
    assert.equal(runnerSource.includes("fs.writeFileSync(tempFilePath, lines.join('\\n'), 'utf8')"), true);
    assert.equal(sessionSource.includes("require('./native/stata_process')"), true);
    assert.equal(processSource.includes('childProcess.fork('), true);
    assert.equal(processSource.includes("child.kill('SIGKILL')"), true);
    assert.equal(processSource.includes('FORCE_STOP_GRACE_MS = 750'), true);
});
