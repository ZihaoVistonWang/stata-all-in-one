const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

let shownArgs = null;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            window: {
                showInformationMessage: (...args) => {
                    shownArgs = args;
                    return Promise.resolve();
                }
            }
        };
    }
    if (request === '../utils/common') {
        return {
            getUserLanguage: () => 'en',
            showInfo: () => Promise.resolve()
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const { getChangelog, showUpdateInfo } = require('../modules/updateNotification');
Module._load = originalLoad;

test('shows update notices with exactly one extension label', async () => {
    const message = getChangelog('0.3.7', 'en').ver_info;
    await showUpdateInfo(message, 'OK');

    assert.match(message, /^✨ Stata All in One \(0\.3\.7\):/);
    assert.equal(shownArgs[0], message);
    assert.doesNotMatch(shownArgs[0], /Stata All in One.*Stata All in One/);
});
