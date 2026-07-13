const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadResolver(options = {}) {
    const settings = {
        stataPathOnWindows: options.windowsPath || '',
        stataVersionOnMacOS: options.macVersion || ''
    };
    const updates = [];
    const calls = { windowsDiscovery: 0, macDiscovery: 0, input: 0, quickPick: 0 };
    const vscodeMock = {
        ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
        workspace: {
            getConfiguration() {
                return {
                    inspect() {
                        return options.inspectedConfiguration || {};
                    },
                    async update(key, value, target) {
                        if (target === vscodeMock.ConfigurationTarget.Global) settings[key] = value;
                        updates.push({ key, value, target });
                    }
                };
            }
        },
        window: {
            async showInputBox() {
                calls.input++;
                return options.inputValue;
            },
            async showQuickPick() {
                calls.quickPick++;
                return options.quickPickValue;
            }
        }
    };
    const configMock = {
        getStataPathOnWindows: () => settings.stataPathOnWindows,
        getStataVersion: () => settings.stataVersionOnMacOS
    };
    const commonMock = {
        isWindows: () => options.platform !== 'darwin',
        isMacOS: () => options.platform === 'darwin',
        msg: key => key,
        showInfo: () => {},
        stripSurroundingQuotes: value => String(value || '').replace(/^["']|["']$/g, '')
    };
    const windowsDiscoveryMock = {
        async discoverStataInstallationsFromRegistry() {
            calls.windowsDiscovery++;
            if (options.discoveryDelay) await new Promise(resolve => setTimeout(resolve, options.discoveryDelay));
            return options.windowsDiscovery || { candidates: [] };
        }
    };
    const macDiscoveryMock = {
        async discoverMacStataInstallations() {
            calls.macDiscovery++;
            return options.macDiscovery || { candidates: [] };
        }
    };

    const resolverPath = path.resolve(__dirname, '../modules/runCode/stataInstallationResolver.js');
    delete require.cache[resolverPath];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (parent && parent.filename === resolverPath) {
            if (request === 'vscode') return vscodeMock;
            if (request === '../../utils/config') return configMock;
            if (request === '../../utils/common') return commonMock;
            if (request === './windowsStataDiscovery') return windowsDiscoveryMock;
            if (request === './macStataDiscovery') return macDiscoveryMock;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    let resolver;
    try {
        resolver = require(resolverPath);
    } finally {
        Module._load = originalLoad;
    }
    return { resolver, settings, updates, calls };
}

function createContext() {
    const values = new Map();
    return {
        globalState: {
            get: key => values.get(key),
            async update(key, value) { values.set(key, value); }
        },
        values
    };
}

test('concurrent configuration callers share one Windows discovery promise', async () => {
    const candidate = { displayName: 'Stata18', executablePath: 'D:\\Stata18\\StataMP-64.exe' };
    const { resolver, settings, calls } = loadResolver({
        discoveryDelay: 10,
        windowsDiscovery: { candidates: [candidate] }
    });
    const context = createContext();
    const firstCaller = resolver.ensureStataConfigured(context, { promptOnFailure: true });
    const secondCaller = resolver.ensureStataConfigured(context, { promptOnFailure: true });
    const [firstResult, secondResult] = await Promise.all([firstCaller, secondCaller]);

    assert.equal(calls.windowsDiscovery, 1);
    assert.equal(calls.input, 0);
    assert.equal(settings.stataPathOnWindows, candidate.executablePath);
    assert.equal(firstResult.executablePath, candidate.executablePath);
    assert.equal(secondResult.executablePath, candidate.executablePath);
});

test('Windows discovery failure falls back to the existing path input', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-resolver-'));
    const executablePath = path.join(tempDirectory, 'StataSE-64.exe');
    fs.writeFileSync(executablePath, 'test');
    const { resolver, settings, calls } = loadResolver({
        windowsDiscovery: { candidates: [] },
        inputValue: executablePath
    });
    try {
        const result = await resolver.ensureStataConfigured(createContext(), { promptOnFailure: true });
        assert.equal(calls.windowsDiscovery, 1);
        assert.equal(calls.input, 1);
        assert.equal(settings.stataPathOnWindows, executablePath);
        assert.equal(result.executablePath, settings.stataPathOnWindows);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});

test('Windows manual path validation rejects missing and non-EXE files', () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-resolver-'));
    const textPath = path.join(tempDirectory, 'StataMP.txt');
    const otherExePath = path.join(tempDirectory, 'Notepad.exe');
    fs.writeFileSync(textPath, 'test');
    fs.writeFileSync(otherExePath, 'test');
    const { resolver } = loadResolver();
    try {
        assert.equal(resolver.validateWindowsExecutablePath(''), undefined);
        assert.equal(resolver.validateWindowsExecutablePath(textPath), 'stataSetupWindowsExeRequired');
        assert.equal(resolver.validateWindowsExecutablePath(otherExePath), 'stataSetupWindowsExeInvalid');
        assert.equal(
            resolver.validateWindowsExecutablePath(path.join(tempDirectory, 'StataMP-64.exe')),
            'stataSetupWindowsExeNotFound'
        );
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});

test('non-empty Windows configuration skips discovery', async () => {
    const configuredPath = 'E:\\Stata19\\StataMP-64.exe';
    const { resolver, calls } = loadResolver({ windowsPath: configuredPath });
    const result = await resolver.ensureStataConfigured(createContext(), { promptOnFailure: true });
    assert.equal(calls.windowsDiscovery, 0);
    assert.equal(calls.input, 0);
    assert.equal(result.executablePath, configuredPath);
});

test('auto-configuration clears explicit empty workspace overrides', async () => {
    const candidate = { displayName: 'Stata18', executablePath: 'D:\\Stata18\\StataMP-64.exe' };
    const { resolver, settings, updates } = loadResolver({
        windowsDiscovery: { candidates: [candidate] },
        inspectedConfiguration: {
            workspaceFolderValue: '',
            workspaceValue: ''
        }
    });
    await resolver.ensureStataConfigured(createContext(), { promptOnFailure: true });
    assert.equal(settings.stataPathOnWindows, candidate.executablePath);
    assert.deepEqual(updates, [
        { key: 'stataPathOnWindows', value: undefined, target: 3 },
        { key: 'stataPathOnWindows', value: undefined, target: 2 },
        { key: 'stataPathOnWindows', value: candidate.executablePath, target: 1 }
    ]);
});

test('macOS discovery failure immediately falls back to the existing edition picker', async () => {
    const { resolver, settings, calls } = loadResolver({
        platform: 'darwin',
        macDiscovery: { candidates: [] },
        quickPickValue: 'StataBE'
    });
    const result = await resolver.ensureStataConfigured(createContext(), { promptOnFailure: true });
    assert.equal(calls.macDiscovery, 1);
    assert.equal(calls.quickPick, 1);
    assert.equal(settings.stataVersionOnMacOS, 'StataBE');
    assert.equal(result.version, 'StataBE');
});

test('macOS discovery success caches the selected app and dylib paths', async () => {
    const candidate = {
        appName: 'StataMP',
        appPath: '/Applications/Stata19/StataMP.app',
        edition: 'mp',
        dylibPath: '/Applications/Stata19/StataMP.app/Contents/MacOS/libstata-mp.dylib',
        hasDylib: true
    };
    const { resolver, settings, calls } = loadResolver({
        platform: 'darwin',
        macDiscovery: { candidates: [candidate] }
    });
    const context = createContext();
    const result = await resolver.ensureStataConfigured(context, { promptOnFailure: true });
    assert.equal(calls.macDiscovery, 1);
    assert.equal(calls.quickPick, 0);
    assert.equal(settings.stataVersionOnMacOS, 'StataMP');
    assert.equal(context.values.get('stataGuiAppPath'), candidate.appPath);
    assert.equal(context.values.get('stataConsoleDylibPath'), candidate.dylibPath);
    assert.equal(result.autoDetected, true);
});
