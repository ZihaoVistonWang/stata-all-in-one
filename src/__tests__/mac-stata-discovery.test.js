const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { DEFAULT_TIMEOUT_MS, discoverMacStataInstallations } = require('../modules/runCode/macStataDiscovery');

test('macOS discovery default timeout is three seconds', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 3000);
});

function createMacInstallation(baseDir, folderName, appName, edition, withLicense = true) {
    const installDir = path.join(baseDir, folderName);
    const macosDir = path.join(installDir, `${appName}.app`, 'Contents', 'MacOS');
    fs.mkdirSync(macosDir, { recursive: true });
    fs.writeFileSync(path.join(macosDir, `libstata-${edition}.dylib`), 'test');
    if (withLicense) fs.writeFileSync(path.join(installDir, 'stata.lic'), 'test');
}

test('macOS discovery prefers the newest numeric version before MP edition', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-mac-discovery-'));
    try {
        createMacInstallation(baseDir, 'Stata17', 'StataMP', 'mp');
        createMacInstallation(baseDir, 'Stata18', 'StataSE', 'se');
        const result = await discoverMacStataInstallations({
            baseDir,
            timeoutMs: 3000,
            allowUnsupportedPlatform: true
        });
        assert.equal(result.timedOut, false);
        assert.equal(result.candidates[0].version, 18);
        assert.equal(result.candidates[0].edition, 'se');
        assert.equal(result.candidates[0].hasDylib, true);
        assert.equal(result.candidates[0].hasLicense, true);
    } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});

test('macOS discovery prefers MP within the same numeric version', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-mac-discovery-'));
    try {
        createMacInstallation(baseDir, 'Stata18-SE', 'StataSE', 'se');
        createMacInstallation(baseDir, 'Stata18-MP', 'StataMP', 'mp');
        const result = await discoverMacStataInstallations({
            baseDir,
            timeoutMs: 3000,
            allowUnsupportedPlatform: true
        });
        assert.equal(result.candidates[0].edition, 'mp');
    } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});
