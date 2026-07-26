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

test('Sponsor editor-title button is independently enabled by default', () => {
    assert.deepEqual(properties['stata-all-in-one.showSponsorButton'], {
        type: 'boolean',
        default: true,
        markdownDescription: '%config.showSponsorButton.description%'
    });

    const sponsorItem = getEditorTitleItem('stata-all-in-one.showSponsor');
    assert.match(sponsorItem.when, /config\.stata-all-in-one\.showSponsorButton/);
    assert.doesNotMatch(sponsorItem.when, /showActionButtons/);
});

test('general action-button setting still controls Bug Report and AI only', () => {
    assert.match(getEditorTitleItem('stata-all-in-one.reportBug').when, /showActionButtons/);
    assert.match(getEditorTitleItem('stata-all-in-one.showAISkillDialog').when, /showActionButtons/);
});

test('AI editor-title button uses the full Stata AI Skill label', () => {
    assert.equal(englishMessages['command.showAISkillDialog.title'], 'Stata AI Skill');
    assert.equal(chineseMessages['command.showAISkillDialog.title'], 'Stata AI Skill');
});

test('run button and shortcut switch together with the Shift setting', () => {
    const defaultCommand = 'stata-all-in-one.runSection';
    const shiftCommand = 'stata-all-in-one.runSectionWithShiftShortcut';
    const defaultBinding = packageJson.contributes.keybindings.find(
        item => item.command === defaultCommand
    );
    const shiftBinding = packageJson.contributes.keybindings.find(
        item => item.command === shiftCommand
    );
    const defaultButton = getEditorTitleItem(defaultCommand);
    const shiftButton = getEditorTitleItem(shiftCommand);

    assert.equal(defaultBinding.mac, 'cmd+d');
    assert.equal(shiftBinding.mac, 'cmd+shift+d');
    assert.match(defaultBinding.when, /!config\.stata-all-in-one\.enableCtrlShiftD/);
    assert.match(shiftBinding.when, /config\.stata-all-in-one\.enableCtrlShiftD/);
    assert.match(defaultButton.when, /!config\.stata-all-in-one\.enableCtrlShiftD/);
    assert.match(shiftButton.when, /config\.stata-all-in-one\.enableCtrlShiftD/);
});
