const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    DEFAULT_TIMEOUT_MS,
    normalizeDisplayIcon,
    registryKeysFromSearchOutput,
    registryValuesFromQueryOutput,
    versionFromDisplayName,
    getInstallationSignals
} = require('../modules/runCode/windowsStataDiscovery');

test('Windows discovery default timeout is three seconds', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 3000);
});

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
        '    DisplayVersion      REG_SZ    19.5',
        '    InstallLocation     REG_SZ    D:\\Apps\\Stata19',
        '    DisplayIcon         REG_SZ    "D:\\Apps\\Stata19\\StataMP-64.exe",0'
    ].join('\r\n');

    assert.deepEqual(registryValuesFromQueryOutput(output), {
        displayname: 'StataNow19',
        displayversion: '19.5',
        installlocation: 'D:\\Apps\\Stata19',
        displayicon: '"D:\\Apps\\Stata19\\StataMP-64.exe",0'
    });
});

test('Windows DLL discovery uses Stata engine names and edition fallback order', () => {
    const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-win-discovery-'));
    try {
        const executablePath = path.join(installDir, 'StataMP-64.exe');
        const dllPath = path.join(installDir, 'mp-64.dll');
        fs.writeFileSync(executablePath, 'test');
        fs.writeFileSync(dllPath, 'test');
        fs.writeFileSync(path.join(installDir, 'stata.lic'), 'test');
        const result = getInstallationSignals(executablePath, 'mp');
        assert.equal(result.hasMatchingDll, true);
        assert.equal(result.dllPath, dllPath);
        assert.equal(result.dllEdition, 'mp');
        assert.equal(result.hasLicense, true);
    } finally {
        fs.rmSync(installDir, { recursive: true, force: true });
    }
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
