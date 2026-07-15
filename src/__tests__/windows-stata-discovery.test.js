const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    DISCOVERY_TIMEOUT_MS,
    DISCOVERY_SCRIPT_NAME,
    discoverStataInstallations,
    getDiscoveryScriptPath,
    getInstallationSignals,
    parseDiscoveryReport
} = require('../modules/runCode/stataDiscovery');

test('Windows BAT discovery default timeout is five seconds', () => {
    assert.equal(DISCOVERY_TIMEOUT_MS.win32, 5000);
});

test('bundled discovery BAT uses the standalone JSON payload contract', () => {
    const scriptPath = getDiscoveryScriptPath();
    const script = fs.readFileSync(scriptPath, 'utf8');
    assert.equal(path.basename(scriptPath), DISCOVERY_SCRIPT_NAME);
    assert.match(script, /# POWERSHELL_PAYLOAD_BELOW/);
    assert.match(script, /RegistryKey\]::OpenBaseKey/);
    assert.match(script, /ConvertTo-Json/);
    assert.match(script, /schemaVersion = 1/);
    assert.match(script, /stata-discovery-report\.json/);
});

test('JSON report parser accepts schema version one and rejects invalid output', () => {
    const report = parseDiscoveryReport(JSON.stringify({ schemaVersion: 1, candidates: [] }));
    assert.equal(report.schemaVersion, 1);
    assert.throws(() => parseDiscoveryReport(''), /no JSON output/);
    assert.throws(
        () => parseDiscoveryReport(JSON.stringify({ schemaVersion: 2, candidates: [] })),
        /unsupported JSON schema/
    );
});

test('partial registry errors do not discard valid candidates returned by the BAT', async () => {
    const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-win-bat-discovery-'));
    const executablePath = path.join(installDir, 'StataMP-64.exe');
    fs.writeFileSync(executablePath, 'test');

    const report = {
        schemaVersion: 1,
        supported: true,
        elapsedMs: 1250.96,
        searchedKeys: 3,
        registryEntries: [{ displayName: 'StataNow19' }],
        candidates: [{
            executablePath,
            displayName: 'StataNow19',
            edition: 'mp',
            version: 19,
            registryKey: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Stata19',
            registryView: '64',
            hasLicense: true,
            hasMatchingDll: true,
            dllPath: path.join(installDir, 'mp-64.dll')
        }],
        errors: ['Failed to query HKCU uninstall registry [32-bit]']
    };
    const scriptRunner = async () => ({
        stdout: JSON.stringify(report),
        stderr: '',
        error: null,
        timedOut: false
    });

    try {
        const result = await discoverStataInstallations({
            platform: 'win32',
            allowUnsupportedPlatform: true,
            scriptRunner
        });
        assert.equal(result.timedOut, false);
        assert.equal(result.scriptElapsedMs, 1250.96);
        assert.equal(result.searchedKeys, 3);
        assert.equal(result.candidates.length, 1);
        assert.equal(result.candidates[0].executablePath, executablePath);
        assert.deepEqual(result.errors, ['Failed to query HKCU uninstall registry [32-bit]']);
    } finally {
        fs.rmSync(installDir, { recursive: true, force: true });
    }
});

test('BAT execution timeout returns a structured discovery result', async () => {
    const result = await discoverStataInstallations({
        platform: 'win32',
        timeoutMs: 5000,
        allowUnsupportedPlatform: true,
        scriptRunner: async () => ({
            stdout: '',
            stderr: '',
            error: 'process timed out',
            timedOut: true
        })
    });
    assert.equal(result.timedOut, true);
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.errors, ['process timed out']);
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
