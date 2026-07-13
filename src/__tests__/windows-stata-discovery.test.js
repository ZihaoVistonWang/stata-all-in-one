const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeDisplayIcon,
    registryKeysFromSearchOutput,
    registryValuesFromQueryOutput,
    versionFromDisplayName
} = require('../modules/runCode/windowsStataDiscovery');

test('registry search output extracts Stata uninstall keys', () => {
    const output = [
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Stata19',
        '    DisplayName    REG_SZ    Stata19',
        '',
        'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StataNow18'
    ].join('\r\n');

    assert.deepEqual(registryKeysFromSearchOutput(output), [
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Stata19',
        'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StataNow18'
    ]);
});

test('registry detail output extracts installation values', () => {
    const output = [
        '    DisplayName         REG_SZ    StataNow19',
        '    InstallLocation     REG_SZ    D:\\Apps\\Stata19',
        '    DisplayIcon         REG_SZ    "D:\\Apps\\Stata19\\StataMP-64.exe",0'
    ].join('\r\n');

    assert.deepEqual(registryValuesFromQueryOutput(output), {
        displayname: 'StataNow19',
        installlocation: 'D:\\Apps\\Stata19',
        displayicon: '"D:\\Apps\\Stata19\\StataMP-64.exe",0'
    });
});

test('display icon normalization removes quotes and icon index', () => {
    assert.equal(
        normalizeDisplayIcon('"D:\\Apps\\Stata19\\StataMP-64.exe",0'),
        'D:\\Apps\\Stata19\\StataMP-64.exe'
    );
    assert.equal(
        normalizeDisplayIcon('D:\\Apps\\Stata19\\StataSE-64.exe,-1'),
        'D:\\Apps\\Stata19\\StataSE-64.exe'
    );
});

test('Stata and StataNow display names expose their release number', () => {
    assert.equal(versionFromDisplayName('Stata19'), 19);
    assert.equal(versionFromDisplayName('StataNow 18'), 18);
    assert.equal(versionFromDisplayName('Stata'), null);
});
