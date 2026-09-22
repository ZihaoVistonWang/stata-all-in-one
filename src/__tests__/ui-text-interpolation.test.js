const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const SRC_ROOT = path.resolve(__dirname, '..');

function loadCommon(language) {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return { env: { language }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve('../utils/common')];
    const common = require('../utils/common');
    Module._load = originalLoad;
    return common;
}

function collectUsedKeys() {
    const keys = new Set();
    const walk = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '__tests__') walk(full);
            } else if (entry.name.endsWith('.js')) {
                const text = fs.readFileSync(full, 'utf8');
                for (const match of text.matchAll(/msg\(\s*['"]([A-Za-z0-9_]+)['"]/g)) {
                    keys.add(match[1]);
                }
            }
        }
    };
    walk(SRC_ROOT);
    return keys;
}

test('every message key used in src exists in both languages', () => {
    const source = fs.readFileSync(path.join(SRC_ROOT, 'utils', 'common.js'), 'utf8');
    const enBlock = source.slice(source.indexOf('    en: {'), source.indexOf('    zh: {'));
    const zhBlock = source.slice(source.indexOf('    zh: {'), source.indexOf('\n};'));
    const used = collectUsedKeys();
    assert.ok(used.size > 100, 'the scan should find the message keys');
    const missingEn = [...used].filter((key) => !new RegExp(`\\b${key}:`).test(enBlock));
    const missingZh = [...used].filter((key) => !new RegExp(`\\b${key}:`).test(zhBlock));
    assert.deepEqual(missingEn, [], 'keys missing from the English dictionary');
    assert.deepEqual(missingZh, [], 'keys missing from the Chinese dictionary');
});

test('placeholder strings are interpolated instead of leaking {name}', () => {
    for (const language of ['en', 'zh-cn']) {
        const { msg } = loadCommon(language);
        const rendered = msg('dataViewerTruncatedBuffer', { what: 'string value' });
        assert.doesNotMatch(rendered, /\{what\}/, `${language} must interpolate {what}`);
        assert.match(rendered, /string value/);

        const tooLarge = msg('dataViewerCaptureTooLarge', { rows: 1234, megabytes: 256 });
        assert.doesNotMatch(tooLarge, /\{rows\}|\{megabytes\}/);
        assert.match(tooLarge, /1234/);
        assert.match(tooLarge, /256/);
    }
});

test('a message with no parameters still renders cleanly', () => {
    const { msg } = loadCommon('en');
    assert.equal(msg('dataViewerNoDataset'), 'No dataset loaded');
    assert.equal(msg('dataViewerPanelTitle'), 'Data Viewer | Stata All in One');
});
