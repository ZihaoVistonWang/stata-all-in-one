const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const bridgeSource = fs.readFileSync(
    path.join(__dirname, '../../native/stata_bridge/src/stata_bridge.cc'),
    'utf8'
);
const sessionSource = fs.readFileSync(
    path.join(__dirname, '../modules/runCode/embeddedConsole/native/stata_session.js'),
    'utf8'
);

test('runs Stata initialization and execution on one dedicated thread on every platform', () => {
    assert.match(bridgeSource, /g_stata_thread = std::thread/);
    assert.match(bridgeSource, /g_StataSO_Main[\s\S]+StataThreadLoop\(\)/);
    assert.match(bridgeSource, /g_cmd_return_code = g_StataSO_Execute/);
    assert.match(bridgeSource, /Napi::Value Execute[\s\S]+g_cmd_pending = true/);
    assert.doesNotMatch(bridgeSource, /macOS: create a C\+\+ worker thread/);
    assert.doesNotMatch(bridgeSource, /execute_thread/);
});

test('does not clear Stata output from JavaScript before queued execution', () => {
    const executeBody = sessionSource.match(/function execute\(code[\s\S]+?\n}\n\n\/\*\*/);
    assert.ok(executeBody, 'expected to find the native session execute function');
    assert.doesNotMatch(executeBody[0], /\bclearOutput\(\)/);
});
