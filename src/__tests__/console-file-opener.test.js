const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const EventEmitter = require('node:events');

const {
    isAbsoluteFilePath,
    openConsoleFile
} = require('../modules/runCode/embeddedConsole/fileOpener');

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
        },
        commands: {
            async executeCommand(command, uri, options) {
                calls.push(['executeCommand', command, uri.fsPath, options]);
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

function successfulWindowsSpawn(calls) {
    return (command, args, options) => {
        calls.push(['spawn', command, args, options]);
        const child = new EventEmitter();
        child.unref = () => calls.push(['unref']);
        process.nextTick(() => child.emit('spawn'));
        return child;
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

test('uses explorer.exe for Windows system file associations', async () => {
    const { calls, options } = harness();
    const filePath = 'C:\\Research project\\analysis output.pdf';
    const spawn = successfulWindowsSpawn(calls);

    assert.equal(await openConsoleFile({
        ...options,
        filePath,
        platform: 'win32',
        spawn
    }), 'system');
    assert.deepEqual(calls, [
        ['spawn', 'explorer.exe', [filePath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        }],
        ['unref']
    ]);
});

test('recognizes Windows absolute paths independently of the test host', () => {
    assert.equal(isAbsoluteFilePath(
        'C:\\Research project\\analysis output.pdf',
        'win32'
    ), true);
    assert.equal(isAbsoluteFilePath(
        '\\\\server\\share\\analysis output.pdf',
        'win32'
    ), true);
    assert.equal(isAbsoluteFilePath('./analysis output.pdf', 'win32'), false);
});

test('opens common images in a separate VS Code preview tab', async () => {
    for (const extension of [
        'avif', 'bmp', 'gif', 'ico', 'jpe', 'jpeg', 'jpg', 'png', 'svg', 'webp'
    ]) {
        const { calls, options } = harness();
        const filePath = path.resolve(`/tmp/figure.${extension}`);
        assert.equal(await openConsoleFile({ ...options, filePath }), 'image-preview');
        assert.deepEqual(calls, [[
            'executeCommand',
            'vscode.open',
            filePath,
            { viewColumn: 1, preview: false }
        ]]);
    }
});

test('opens office and other files with the system application', async () => {
    for (const extension of ['xls', 'xlsx', 'doc', 'docx', 'pdf', 'tiff']) {
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
