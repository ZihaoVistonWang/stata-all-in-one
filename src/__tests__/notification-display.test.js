const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

function loadCommon() {
    const calls = [];
    const vscodeMock = {
        env: { language: 'en' },
        window: {
            showInformationMessage: (...args) => {
                calls.push(['info', ...args]);
                return Promise.resolve(args.at(-1));
            },
            showWarningMessage: (...args) => {
                calls.push(['warn', ...args]);
                return Promise.resolve(args.at(-1));
            },
            showErrorMessage: (...args) => {
                calls.push(['error', ...args]);
                return Promise.resolve(args.at(-1));
            }
        }
    };
    const commonPath = path.resolve(__dirname, '../utils/common.js');
    delete require.cache[commonPath];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === 'vscode' && parent && parent.filename === commonPath) {
            return vscodeMock;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    let common;
    try {
        common = require(commonPath);
    } finally {
        Module._load = originalLoad;
    }
    return { common, calls };
}

test('bottom-right notifications always include an action so VS Code keeps them expanded', async () => {
    const { common, calls } = loadCommon();

    await common.showInfo('Information');
    await common.showWarn('Warning');
    await common.showError('Error');

    assert.deepEqual(calls, [
        ['info', 'Stata All in One: Information', 'OK'],
        ['warn', 'Stata All in One: Warning', 'OK'],
        ['error', 'Stata All in One: Error', 'OK']
    ]);
});

test('existing notification actions remain unchanged', async () => {
    const { common, calls } = loadCommon();

    await common.showInfo('Choose an action', 'Open', 'Later');

    assert.deepEqual(calls, [
        ['info', 'Stata All in One: Choose an action', 'Open', 'Later']
    ]);
});
