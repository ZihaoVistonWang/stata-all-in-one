const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
const englishMessages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.nls.json'), 'utf8'));
const chineseMessages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.nls.zh-cn.json'), 'utf8'));
const setupSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/runCode/stataSetupManager.js'),
    'utf8'
);
const registeredSource = [
    '../extension.js',
    '../modules/comment.js',
    '../modules/separator.js',
    '../modules/runCode/execute/index.js'
].map(file => fs.readFileSync(path.resolve(__dirname, file), 'utf8')).join('\n');
const contextItems = packageJson.contributes.menus['editor/context'];

function contextCommand(command) {
    return contextItems.find(item => item.command === command);
}

function keybinding(command) {
    return packageJson.contributes.keybindings.find(item => item.command === command);
}

test('adds the requested top-level Stata editor context actions', () => {
    assert.ok(contextCommand('stata-all-in-one.runSection'));
    assert.ok(contextCommand('stata-all-in-one.runLine'));
    assert.ok(contextCommand('stata-all-in-one.runSelection'));
    assert.ok(contextItems.find(item => item.submenu === 'stata-all-in-one.headingMenu'));
    assert.ok(contextItems.find(item => item.submenu === 'stata-all-in-one.separatorMenu'));
    assert.match(
        contextCommand('stata-all-in-one.centerHeadingText').when,
        /stata-all-in-one\.cursorOnHeading/
    );
});

test('heading and separator submenus expose the requested entries', () => {
    const headingItems = packageJson.contributes.menus['stata-all-in-one.headingMenu'];
    const separatorItems = packageJson.contributes.menus['stata-all-in-one.separatorMenu'];

    assert.equal(headingItems.length, 7);
    assert.equal(separatorItems.length, 4);
    assert.equal(chineseMessages['menu.heading.normal'], '普通行');
    assert.equal(chineseMessages['menu.separator.dash'], '**# ----------');
    assert.equal(englishMessages['menu.separator.equal'], '**# ========');
    assert.equal(chineseMessages['menu.separator.equal'], '**# ========');
    assert.equal(chineseMessages['menu.separator.star'], '**# **********');
});

test('quick-comment label follows the configured comment style context', () => {
    const variants = [
        ['stata-all-in-one.quickCommentSlash', 'slash'],
        ['stata-all-in-one.quickCommentStar', 'star'],
        ['stata-all-in-one.quickCommentBlock', 'block']
    ];

    for (const [command, style] of variants) {
        assert.match(contextCommand(command).when, new RegExp(`commentStyleMenu == ${style}`));
    }
    assert.match(chineseMessages['command.quickCommentSlash.title'], /“\/\/”/);
    assert.match(englishMessages['command.quickCommentBlock.title'], /\/\* \.\.\. \*\//);
});

test('AI Skill context action requires the detected Stata license', () => {
    assert.match(
        contextCommand('stata-all-in-one.contextShowAISkillDialog').when,
        /stata-all-in-one\.licenseAvailable/
    );
    assert.match(setupSource, /updateLicenseAvailableContext\(report\.licenseAvailable\)/);
    assert.match(setupSource, /source === 'stata-command-pending'[\s\S]*updateLicenseAvailableContext\(false\)/);
});

test('every context-menu command is registered by the extension', () => {
    for (const item of contextItems) {
        if (item.command) {
            assert.ok(registeredSource.includes(item.command), `unregistered command: ${item.command}`);
        }
    }
    for (const submenu of ['stata-all-in-one.headingMenu', 'stata-all-in-one.separatorMenu']) {
        for (const item of packageJson.contributes.menus[submenu]) {
            assert.ok(registeredSource.includes(item.command), `unregistered command: ${item.command}`);
        }
    }
});

test('context commands with existing shortcuts display their keybindings', () => {
    const expectedMacBindings = new Map([
        ['stata-all-in-one.contextSetLevel1', 'cmd+1'],
        ['stata-all-in-one.contextSetLevel2', 'cmd+2'],
        ['stata-all-in-one.contextSetLevel3', 'cmd+3'],
        ['stata-all-in-one.contextSetLevel4', 'cmd+4'],
        ['stata-all-in-one.contextSetLevel5', 'cmd+5'],
        ['stata-all-in-one.contextSetLevel6', 'cmd+6'],
        ['stata-all-in-one.contextClearHeading', 'cmd+0'],
        ['stata-all-in-one.contextInsertSeparatorDash', 'cmd+-'],
        ['stata-all-in-one.contextInsertSeparatorEqual', 'cmd+='],
        ['stata-all-in-one.contextInsertSeparatorStar', 'cmd+shift+8'],
        ['stata-all-in-one.contextInsertCustomSeparator', 'ctrl+cmd+s'],
        ['stata-all-in-one.quickCommentSlash', 'cmd+/'],
        ['stata-all-in-one.quickCommentStar', 'cmd+/'],
        ['stata-all-in-one.quickCommentBlock', 'cmd+/']
    ]);

    for (const [command, mac] of expectedMacBindings) {
        assert.equal(keybinding(command).mac, mac, `missing menu keybinding: ${command}`);
    }
    assert.equal(keybinding('stata-all-in-one.centerHeadingText'), undefined);
    assert.equal(keybinding('stata-all-in-one.contextShowAISkillDialog'), undefined);
});
