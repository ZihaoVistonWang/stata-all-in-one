const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { openConsoleFile } = require('../modules/runCode/embeddedConsole/fileOpener');

function harness(overrides = {}) {
    const calls = [];
    const vscode = {
        ViewColumn: {
            Active: 1
        },
        Uri: {
            file(filePath) {
                return { fsPath: filePath };
            }
        },
        workspace: {
            async openTextDocument(uri) {
                calls.push(['openTextDocument', uri.fsPath]);
                return { uri };
            }
        },
        window: {
            async showTextDocument(document, options) {
                calls.push(['showTextDocument', document.uri.fsPath, options]);
            }
        },
        env: {
            async openExternal(uri) {
                calls.push(['openExternal', uri.fsPath]);
                return true;
            }
        }
    };
    return {
        calls,
        options: {
            vscode,
            context: {},
            stat: async () => ({ isFile: () => true }),
            openDtaFile: async (_context, uri) => calls.push(['openDta', uri.fsPath]),
            showWarn: value => calls.push(['warn', value]),
            showError: value => calls.push(['error', value]),
            message: (key, values = {}) => `${key}:${values.filePath || ''}:${values.error || ''}`,
            ...overrides
        }
    };
}

test('opens .dta in the built-in Data Viewer', async () => {
    const { calls, options } = harness();
    const filePath = path.resolve('/tmp/panel data.dta');
    assert.equal(await openConsoleFile({ ...options, filePath }), 'data-viewer');
    assert.deepEqual(calls, [['openDta', filePath]]);
});

test('opens text files in the VS Code editor', async () => {
    const { calls, options } = harness();
    const filePath = path.resolve('/tmp/results.md');
    assert.equal(await openConsoleFile({ ...options, filePath }), 'editor');
    assert.deepEqual(calls, [
        ['openTextDocument', filePath],
        ['showTextDocument', filePath, {
            viewColumn: 1,
            preview: false
        }]
    ]);
});

test('opens .smcl through the Stata file association', async () => {
    const { calls, options } = harness();
    const filePath = path.resolve('/tmp/analysis output.smcl');
    assert.equal(await openConsoleFile({ ...options, filePath }), 'stata');
    assert.deepEqual(calls, [['openExternal', filePath]]);
});

test('opens office and other files with the system application', async () => {
    for (const extension of ['xls', 'xlsx', 'doc', 'docx', 'pdf', 'png']) {
        const { calls, options } = harness();
        const filePath = path.resolve(`/tmp/result.${extension}`);
        assert.equal(await openConsoleFile({ ...options, filePath }), 'system');
        assert.deepEqual(calls, [['openExternal', filePath]]);
    }
});

test('reports missing and rejected files with localized messages', async () => {
    const missing = harness({
        stat: async () => {
            const error = new Error('missing');
            error.code = 'ENOENT';
            throw error;
        }
    });
    const filePath = path.resolve('/tmp/missing.xlsx');
    assert.equal(await openConsoleFile({ ...missing.options, filePath }), 'missing');
    assert.deepEqual(missing.calls, [['warn', `consoleFileNotFound:${filePath}:`]]);

    const rejected = harness();
    rejected.options.vscode.env.openExternal = async () => false;
    assert.equal(await openConsoleFile({ ...rejected.options, filePath }), 'error');
    assert.equal(rejected.calls[0][0], 'error');
});
