const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            workspace: { getConfiguration: () => ({ get: () => '' }) },
            extensions: { all: [] }
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { StataTerminalRenderer } = require('../modules/runCode/embeddedConsole/renderer');
Module._load = originalLoad;

test('renders standalone which results as plain text while keeping the command highlighted', () => {
    const renderer = new StataTerminalRenderer();
    const commandEntries = renderer.renderCommandSegments('which reghdfe, all', 88);
    const outputEntries = renderer.renderOutputChunkSegments(
        '/Applications/StataNow/plus/r/reghdfe.ado\n*! version 6.13.1 10Jan2026\n',
        88
    );

    assert.ok(commandEntries[0].segments.some(segment => segment.tokenType === 'command'));
    assert.equal(
        outputEntries.flatMap(entry => entry.segments).some(segment => segment.tokenType === 'number'),
        false
    );
});

test('keeps numeric highlighting for ordinary Stata output', () => {
    const renderer = new StataTerminalRenderer();
    renderer.renderCommandSegments('display 1.25', 88);
    const outputEntries = renderer.renderOutputChunkSegments('value 1.25\n', 88);

    assert.ok(outputEntries[0].segments.some(segment => segment.tokenType === 'number'));
});

test('keeps which errors highlighted as errors', () => {
    const renderer = new StataTerminalRenderer();
    renderer.renderCommandSegments('which missing_command', 88);
    const outputEntries = renderer.renderOutputChunkSegments('command missing_command not found\nr(111);\n', 88);

    assert.equal(outputEntries[0].segments.every(segment => segment.tokenType === 'plain'), true);
    assert.equal(outputEntries[1].kind, 'error');
});
