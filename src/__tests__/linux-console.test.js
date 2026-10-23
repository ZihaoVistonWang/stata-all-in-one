const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const linuxPath = require.resolve('../modules/runCode/embeddedConsole/linux');

/**
 * Load linux.js with its VS Code-bound neighbours replaced by doubles. The
 * discovery helpers it uses are plain filesystem code and stay real.
 */
function loadLinuxConsole(options = {}) {
    const calls = { init: [], runner: [], errors: [], infos: [] };
    const sessionMock = {
        isSessionStale: () => Boolean(options.stale),
        clearStaleSession() { calls.staleCleared = true; },
        hasActiveConsoleSession: () => Boolean(options.active),
        async initConsoleSession(_context, libraryPath) {
            calls.init.push(libraryPath);
            return options.initResult || { success: true, error: '' };
        }
    };
    const configMock = {
        getStataPathOnLinux: () => options.linuxPath || ''
    };
    const commonMock = {
        showInfo: message => calls.infos.push(message),
        showError: message => calls.errors.push(message),
        msg: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)
    };
    const resolverMock = {
        async ensureStataConfigured() {
            return options.resolved === undefined ? null : options.resolved;
        }
    };
    const macMock = {
        async runOnMacWebview(code, tmpFilePath, docDir, context, runOptions) {
            calls.runner.push({ code, tmpFilePath, docDir, context, runOptions });
            return { success: true };
        },
        async showConsoleLicenseDialog() {},
        stopConsoleExecution: () => true,
        getConsoleSession: () => null,
        forceShutdownConsoleSession: () => true
    };

    delete require.cache[linuxPath];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (parent && parent.filename === linuxPath) {
            if (request === './session') return sessionMock;
            if (request === '../../../utils/config') return configMock;
            if (request === '../../../utils/common') return commonMock;
            if (request === '../stataInstallationResolver') return resolverMock;
            if (request === './mac') return macMock;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        return { linux: require(linuxPath), calls };
    } finally {
        Module._load = originalLoad;
        delete require.cache[linuxPath];
    }
}

function createContext(initialValues = {}) {
    const values = new Map(Object.entries(initialValues));
    return {
        values,
        globalState: {
            get: key => values.get(key),
            async update(key, value) {
                if (value === undefined) values.delete(key);
                else values.set(key, value);
            }
        }
    };
}

function createInstallation(options = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-linux-console-'));
    const directory = path.join(root, 'stata18');
    fs.mkdirSync(directory);
    const libraries = { mp: 'libstata-mp.so', se: 'libstata-se.so', be: 'libstata.so' };
    const executables = { mp: 'stata-mp', se: 'stata-se', be: 'stata' };
    for (const edition of options.editions || ['mp', 'se', 'be']) {
        fs.writeFileSync(path.join(directory, libraries[edition]), 'test');
        fs.writeFileSync(path.join(directory, executables[edition]), 'test');
    }
    if (options.license !== false) fs.writeFileSync(path.join(directory, 'stata.lic'), 'test');
    return { root, directory, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('a configured installation directory starts the MP library and remembers it', async () => {
    const installation = createInstallation();
    const { linux, calls } = loadLinuxConsole({
        resolved: { platform: 'linux', installationPath: installation.directory, source: 'configured' }
    });
    const context = createContext();
    try {
        const result = await linux.ensureConsoleSession(context);
        assert.deepEqual(result, { success: true, fromExisting: false, edition: 'mp' });
        assert.deepEqual(calls.init, [path.join(installation.directory, 'libstata-mp.so')]);
        assert.equal(
            context.values.get('stataConsoleLibraryPath'),
            path.join(installation.directory, 'libstata-mp.so')
        );
    } finally {
        installation.cleanup();
    }
});

test('a library path in the setting pins the edition', async () => {
    const installation = createInstallation();
    const pinned = path.join(installation.directory, 'libstata-se.so');
    const { linux, calls } = loadLinuxConsole({
        resolved: { platform: 'linux', installationPath: pinned, source: 'configured' }
    });
    try {
        const result = await linux.ensureConsoleSession(createContext({
            stataConsoleLibraryPath: path.join(installation.directory, 'libstata-mp.so')
        }));
        assert.equal(result.success, true);
        assert.equal(result.edition, 'se');
        assert.deepEqual(calls.init, [pinned]);
    } finally {
        installation.cleanup();
    }
});

test('the remembered library wins over the default edition of a directory', async () => {
    const installation = createInstallation();
    const remembered = path.join(installation.directory, 'libstata.so');
    const { linux, calls } = loadLinuxConsole({
        resolved: { platform: 'linux', installationPath: installation.directory, source: 'configured' }
    });
    try {
        const result = await linux.ensureConsoleSession(createContext({ stataConsoleLibraryPath: remembered }));
        assert.equal(result.edition, 'be');
        assert.deepEqual(calls.init, [remembered]);
    } finally {
        installation.cleanup();
    }
});

test('a detected candidate is used directly', async () => {
    const installation = createInstallation();
    const libraryPath = path.join(installation.directory, 'libstata-se.so');
    const { linux, calls } = loadLinuxConsole({
        resolved: {
            platform: 'linux',
            installationPath: installation.directory,
            source: 'detected',
            candidate: { installDirectory: installation.directory, libraryPath, edition: 'se' }
        }
    });
    try {
        const result = await linux.ensureConsoleSession(createContext());
        assert.equal(result.edition, 'se');
        assert.deepEqual(calls.init, [libraryPath]);
    } finally {
        installation.cleanup();
    }
});

test('missing configuration, library and licence are reported before any session starts', async () => {
    const unconfigured = loadLinuxConsole({ resolved: null });
    const missing = await unconfigured.linux.ensureConsoleSession(createContext());
    assert.deepEqual(missing, {
        success: false,
        failCode: 'INSTALLATION_NOT_CONFIGURED',
        reason: 'missingLinuxPath'
    });

    const empty = createInstallation({ editions: [] });
    const noLibrary = loadLinuxConsole({
        resolved: { platform: 'linux', installationPath: empty.directory, source: 'configured' }
    });
    try {
        const result = await noLibrary.linux.ensureConsoleSession(createContext());
        assert.equal(result.success, false);
        assert.equal(result.failCode, 'LIBRARY_NOT_FOUND');
        assert.match(result.reason, /^linuxLibraryNotFound:/);
        assert.match(result.reason, new RegExp(empty.directory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.deepEqual(noLibrary.calls.init, []);
    } finally {
        empty.cleanup();
    }

    const unlicensed = createInstallation({ license: false });
    const noLicense = loadLinuxConsole({
        resolved: { platform: 'linux', installationPath: unlicensed.directory, source: 'configured' }
    });
    try {
        const result = await noLicense.linux.ensureConsoleSession(createContext());
        assert.deepEqual(result, { success: false, noLicense: true, failCode: 'LICENSE_NOT_FOUND', reason: '' });
        assert.deepEqual(noLicense.calls.init, []);
    } finally {
        unlicensed.cleanup();
    }
});

test('a native initialization failure names the library that was loaded', async () => {
    const installation = createInstallation();
    const { linux } = loadLinuxConsole({
        resolved: { platform: 'linux', installationPath: installation.directory, source: 'configured' },
        initResult: { success: false, error: 'StataSO_Main failed with return code: -1', failCode: 'SESSION_INIT_FAILED' }
    });
    try {
        const result = await linux.ensureConsoleSession(createContext());
        assert.equal(result.success, false);
        assert.equal(result.failCode, 'SESSION_INIT_FAILED');
        assert.match(result.reason, /return code: -1/);
        assert.match(result.reason, /libstata-mp\.so/);
    } finally {
        installation.cleanup();
    }
});

test('an active session is reused and a stale one is cleared first', async () => {
    const active = loadLinuxConsole({ active: true });
    assert.deepEqual(await active.linux.ensureConsoleSession(createContext()), {
        success: true,
        fromExisting: true
    });

    const stale = loadLinuxConsole({ stale: true, active: true });
    await stale.linux.ensureConsoleSession(createContext());
    assert.equal(stale.calls.staleCleared, true);
});

test('code execution reuses the shared runner with the Linux session bootstrap injected', async () => {
    const { linux, calls } = loadLinuxConsole({ active: true });
    const context = createContext();
    const result = await linux.runOnLinuxEmbeddedConsole('sysuse auto', '/tmp/x.do', '/work', context, {
        completionSoundSettings: { enabled: false },
        suppressRunFooter: true
    });
    assert.deepEqual(result, { success: true });
    assert.equal(calls.runner.length, 1);
    const [call] = calls.runner;
    assert.equal(call.code, 'sysuse auto');
    assert.equal(call.docDir, '/work');
    assert.equal(call.context, context);
    assert.equal(call.runOptions.ensureConsoleSession, linux.ensureConsoleSession);
    assert.equal(call.runOptions.suppressRunFooter, true);
    assert.deepEqual(call.runOptions.completionSoundSettings, { enabled: false });
});

test('initConsoleSession surfaces failures to the user', async () => {
    const failing = loadLinuxConsole({ resolved: null });
    assert.equal(await failing.linux.initConsoleSession(createContext()), false);
    assert.deepEqual(failing.calls.errors, ['missingLinuxPath']);

    const installation = createInstallation();
    const working = loadLinuxConsole({
        resolved: { platform: 'linux', installationPath: installation.directory, source: 'configured' }
    });
    try {
        assert.equal(await working.linux.initConsoleSession(createContext()), true);
        assert.match(working.calls.infos[0], /Stata MP session initialized/);
    } finally {
        installation.cleanup();
    }
});
