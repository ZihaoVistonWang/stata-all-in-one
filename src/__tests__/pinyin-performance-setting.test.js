const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const manifest = require('../../package.json');
const english = require('../../package.nls.json');
const chinese = require('../../package.nls.zh-cn.json');
const providerSource = fs.readFileSync(
    path.join(root, 'src/modules/completionProvider.js'),
    'utf8'
);
const commonSource = fs.readFileSync(
    path.join(root, 'src/utils/common.js'),
    'utf8'
);

test('pinyin variable matching is enabled by default and localized', () => {
    const setting = manifest.contributes.configuration.properties[
        'stata-all-in-one.enablePinyinVariableMatching'
    ];
    assert.strictEqual(setting.type, 'boolean');
    assert.strictEqual(setting.default, true);
    assert.ok(english['config.enablePinyinVariableMatching.description']);
    assert.ok(chinese['config.enablePinyinVariableMatching.description']);
});

test('slow pinyin caching prompts in the active language and disables the effective setting', () => {
    assert.match(providerSource, /showSlowPinyinNotification/);
    assert.match(providerSource, /workspaceFolderValue !== undefined/);
    assert.match(providerSource, /workspaceValue !== undefined/);
    assert.match(providerSource, /choice === yes/);
    assert.match(providerSource, /enablePinyinVariableMatching', false, target/);
    assert.match(commonSource, /pinyinMatchingSlow/);
    assert.match(commonSource, /pinyinMatchingDisableYes/);
    assert.match(commonSource, /pinyinMatchingDisableNo/);
});
