const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
const englishMessages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.nls.json'), 'utf8'));
const chineseMessages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.nls.zh-cn.json'), 'utf8'));
const properties = packageJson.contributes.configuration.properties;
const editorTitleItems = packageJson.contributes.menus['editor/title'];

function getEditorTitleItem(command) {
    return editorTitleItems.find((item) => item.command === command);
}

function getCommand(command) {
    return packageJson.contributes.commands.find((item) => item.command === command);
}

function localize(value, messages) {
    const match = /^%(.+)%$/.exec(value);
    return match ? messages[match[1]] : value;
}

test('Sponsor editor-title button is independently enabled by default', () => {
    assert.deepEqual(properties['stata-all-in-one.showSponsorButton'], {
        type: 'boolean',
        default: true,
        markdownDescription: '%config.showSponsorButton.description%'
    });

    const sponsorItem = getEditorTitleItem('stata-all-in-one.showSponsor');
    const sponsorIconItem = getEditorTitleItem('stata-all-in-one.showSponsorIcon');
    assert.match(sponsorItem.when, /config\.stata-all-in-one\.showSponsorButton/);
    assert.match(sponsorIconItem.when, /config\.stata-all-in-one\.showSponsorButton/);
    assert.doesNotMatch(sponsorItem.when, /showActionButtons/);
    assert.doesNotMatch(sponsorIconItem.when, /showActionButtons/);
});

test('general action-button setting still controls Bug Report and AI only', () => {
    assert.match(getEditorTitleItem('stata-all-in-one.reportBugBrand').when, /showActionButtons/);
    assert.match(getEditorTitleItem('stata-all-in-one.reportBugBrandText').when, /showActionButtons/);
    assert.match(getEditorTitleItem('stata-all-in-one.reportBug').when, /showActionButtons/);
    assert.match(getEditorTitleItem('stata-all-in-one.reportBugIcon').when, /showActionButtons/);
    assert.match(getEditorTitleItem('stata-all-in-one.showAISkillDialog').when, /showActionButtons/);
    assert.match(getEditorTitleItem('stata-all-in-one.showAISkillDialogIcon').when, /showActionButtons/);
});

test('editor-title actions switch from text to icons in four timed stages', () => {
    assert.deepEqual(getCommand('stata-all-in-one.reportBugBrand').icon, {
        light: 'img/tab-icon-light.svg',
        dark: 'img/tab-icon-dark.svg'
    });
    assert.equal(getCommand('stata-all-in-one.reportBugBrandText').icon, undefined);
    assert.equal(
        getCommand('stata-all-in-one.reportBugBrandText').shortTitle,
        '%command.reportBugBrandText.short%'
    );
    assert.equal(getCommand('stata-all-in-one.reportBug').icon, undefined);
    assert.equal(getCommand('stata-all-in-one.reportBug').shortTitle, '%command.reportBug.short%');
    assert.equal(getCommand('stata-all-in-one.reportBugIcon').icon, '$(feedback)');
    assert.equal(getCommand('stata-all-in-one.showSponsor').icon, undefined);
    assert.equal(
        getCommand('stata-all-in-one.showSponsor').shortTitle,
        '%command.showSponsor.short%'
    );
    assert.deepEqual(getCommand('stata-all-in-one.showSponsorIcon').icon, {
        light: '%command.showSponsorIcon.light%',
        dark: '%command.showSponsorIcon.dark%'
    });
    assert.equal(getCommand('stata-all-in-one.showAISkillDialog').icon, undefined);
    assert.equal(getCommand('stata-all-in-one.showAISkillDialogIcon').icon, '$(sparkle)');

    assert.equal(getEditorTitleItem('stata-all-in-one.reportBugBrand').group, 'navigation@0');
    assert.equal(getEditorTitleItem('stata-all-in-one.reportBugBrandText').group, 'navigation@0');
    assert.equal(getEditorTitleItem('stata-all-in-one.reportBug').group, 'navigation@0.1');
    assert.equal(getEditorTitleItem('stata-all-in-one.reportBugIcon').group, 'navigation@0.1');
    assert.equal(getEditorTitleItem('stata-all-in-one.showSponsor').group, 'navigation@1');
    assert.equal(getEditorTitleItem('stata-all-in-one.showSponsorIcon').group, 'navigation@1');
    assert.equal(getEditorTitleItem('stata-all-in-one.showAISkillDialog').group, 'navigation@1.8');
    assert.equal(getEditorTitleItem('stata-all-in-one.showAISkillDialogIcon').group, 'navigation@1.8');

    assert.match(getEditorTitleItem('stata-all-in-one.reportBugBrand').when, />= 1/);
    assert.match(getEditorTitleItem('stata-all-in-one.reportBugBrandText').when, /< 1/);
    assert.match(getEditorTitleItem('stata-all-in-one.reportBugIcon').when, />= 2/);
    assert.match(getEditorTitleItem('stata-all-in-one.reportBug').when, /< 2/);
    assert.match(getEditorTitleItem('stata-all-in-one.showSponsorIcon').when, />= 3/);
    assert.match(getEditorTitleItem('stata-all-in-one.showSponsor').when, /< 3/);
    assert.match(getEditorTitleItem('stata-all-in-one.showAISkillDialogIcon').when, />= 4/);
    assert.match(getEditorTitleItem('stata-all-in-one.showAISkillDialog').when, /< 4/);

    assert.equal(englishMessages['command.reportBugBrandText.short'], 'Stata All in One:');
    assert.equal(chineseMessages['command.reportBugBrandText.short'], 'Stata All in One:');
    assert.equal(englishMessages['command.reportBug.short'], 'Report Bug');
    assert.equal(chineseMessages['command.reportBug.short'], '反馈 Bug');
});

test('AI and localized Sponsor editor-title buttons preserve their labels and theme icon paths', () => {
    assert.equal(englishMessages['command.showAISkillDialog.short'], 'Stata AI Skill');
    assert.equal(chineseMessages['command.showAISkillDialog.short'], 'Stata AI Skill');
    assert.equal(englishMessages['command.showSponsorIcon.light'], 'img/buy-me-a-coffee-light.svg');
    assert.equal(englishMessages['command.showSponsorIcon.dark'], 'img/buy-me-a-coffee-dark.svg');
    assert.equal(chineseMessages['command.showSponsorIcon.light'], 'img/sponsor-light.svg');
    assert.equal(chineseMessages['command.showSponsorIcon.dark'], 'img/sponsor-dark.svg');
});

test('every editor-title action tooltip keeps the Stata All in One prefix', () => {
    const commandIds = [...new Set(editorTitleItems.map(item => item.command))];

    for (const commandId of commandIds) {
        const command = getCommand(commandId);
        assert.ok(command, `missing command contribution for ${commandId}`);
        assert.match(
            localize(command.title, englishMessages),
            /^Stata All in One:/,
            `missing English prefix for ${commandId}`
        );
        assert.match(
            localize(command.title, chineseMessages),
            /^Stata All in One：/,
            `missing Chinese prefix for ${commandId}`
        );
    }
});

test('brand text and tab icon have exact switch-action tooltips', () => {
    assert.equal(
        englishMessages['command.reportBugBrandText.title'],
        'Stata All in One: Switch to Icon Buttons'
    );
    assert.equal(
        chineseMessages['command.reportBugBrandText.title'],
        'Stata All in One：切换为图标按钮'
    );
    assert.equal(
        englishMessages['command.reportBugBrand.title'],
        'Stata All in One: Switch to Text Buttons'
    );
    assert.equal(
        chineseMessages['command.reportBugBrand.title'],
        'Stata All in One：切换为文字按钮'
    );
});

test('run button title and shortcut switch together for every execution target', () => {
    const targets = [
        {
            target: 'section',
            defaultCommand: 'stata-all-in-one.runSection',
            shiftCommand: 'stata-all-in-one.runSectionWithShiftShortcut'
        },
        {
            target: 'line',
            defaultCommand: 'stata-all-in-one.runLine',
            shiftCommand: 'stata-all-in-one.runLineWithShiftShortcut'
        },
        {
            target: 'selection',
            defaultCommand: 'stata-all-in-one.runSelection',
            shiftCommand: 'stata-all-in-one.runSelectionWithShiftShortcut'
        }
    ];

    for (const item of targets) {
        const defaultBinding = packageJson.contributes.keybindings.find(
            binding => binding.command === item.defaultCommand
        );
        const shiftBinding = packageJson.contributes.keybindings.find(
            binding => binding.command === item.shiftCommand
        );
        const defaultButton = getEditorTitleItem(item.defaultCommand);
        const shiftButton = getEditorTitleItem(item.shiftCommand);

        assert.equal(defaultBinding.mac, 'cmd+d');
        assert.equal(shiftBinding.mac, 'cmd+shift+d');
        assert.match(defaultBinding.when, /!config\.stata-all-in-one\.enableCtrlShiftD/);
        assert.match(shiftBinding.when, /config\.stata-all-in-one\.enableCtrlShiftD/);
        assert.match(defaultButton.when, /!config\.stata-all-in-one\.enableCtrlShiftD/);
        assert.match(shiftButton.when, /config\.stata-all-in-one\.enableCtrlShiftD/);
        assert.match(defaultButton.when, new RegExp(`runTarget == ${item.target}`));
        assert.match(shiftButton.when, new RegExp(`runTarget == ${item.target}`));
    }
});

test('run target titles have English and Chinese localization', () => {
    assert.equal(englishMessages['command.runSection.title'], 'Stata All in One: Run Current Section');
    assert.equal(englishMessages['command.runLine.title'], 'Stata All in One: Run Current Line');
    assert.equal(englishMessages['command.runSelection.title'], 'Stata All in One: Run Selected Lines');
    assert.equal(chineseMessages['command.runSection.title'], 'Stata All in One：运行当前章节');
    assert.equal(chineseMessages['command.runLine.title'], 'Stata All in One：运行当前行');
    assert.equal(chineseMessages['command.runSelection.title'], 'Stata All in One：运行选中行');
});
