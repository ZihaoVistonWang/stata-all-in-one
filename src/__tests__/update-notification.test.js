const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../../package.json');

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
    const message = getChangelog(manifest.version, 'en').ver_info;
    await showUpdateInfo(message, 'OK');

    assert.ok(message.startsWith(`✨ Stata All in One (${manifest.version}):`));
    assert.equal(shownArgs[0], message);
    assert.doesNotMatch(shownArgs[0], /Stata All in One.*Stata All in One/);
});

test('keeps update notices expanded when no actions are supplied', async () => {
    const message = getChangelog(manifest.version, 'en').ver_info;
    await showUpdateInfo(message);

    assert.deepEqual(shownArgs, [message, 'OK']);
});

test('current release summaries and changelog anchors agree across both READMEs and update notices', () => {
    const root = path.resolve(__dirname, '../..');
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const heading = changelog.split('\n').find(line => line.startsWith(`## ${manifest.version} (`));
    assert.ok(heading, 'the current version needs a dated Changelog entry');
    const anchor = heading.slice(3).replace(/[.()]/g, '').replace(/ /g, '-');
    for (const [lang, filename] of [['en', 'README.md'], ['zh', 'README_CN.md']]) {
        const entry = getChangelog(manifest.version, lang);
        const summary = entry.ver_info.replace(/^✨ Stata All in One \([^)]*\)[:：]\s*/, '');
        const readme = fs.readFileSync(path.join(root, filename), 'utf8');
        assert.ok(readme.includes(summary), `${filename} must use the update notice summary`);
        assert.equal(new URL(entry.more_url).hash, '#' + anchor);
        if (manifest.preview) {
            assert.match(summary, /Preview|预览版/);
            assert.match(readme, /Preview Release Notice|预览版提醒/);
        }
    }
});
