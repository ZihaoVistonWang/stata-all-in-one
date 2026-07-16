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
    const calls = {
        windowsDiscovery: 0,
        windowsTimeoutMs: null,
        macDiscovery: 0,
        macTimeoutMs: null,
        input: 0,
        info: 0,
        clipboard: [],
        openDialog: 0,
        quickPick: 0,
        quickPickItems: null,
        quickPickOptions: null
    };
    const vscodeMock = {
        ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
        env: {
            clipboard: {
                async writeText(value) {
                    calls.clipboard.push(value);
                }
            }
        },
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
            async showInformationMessage() {
                calls.info++;
                return options.infoValue || 'stataSetupCommandDone';
            },
            async showInputBox() {
                calls.input++;
                return options.inputValue;
            },
            async showQuickPick(items, quickPickOptions) {
                calls.quickPick++;
                calls.quickPickItems = items;
                calls.quickPickOptions = quickPickOptions;
                return typeof options.quickPickValue === 'function'
                    ? options.quickPickValue(items)
                    : options.quickPickValue;
            },
            async showOpenDialog() {
                calls.openDialog++;
                return options.openDialogValue;
            },
            async showErrorMessage() {
                return undefined;
            }
        },
        Uri: { file: fsPath => ({ fsPath }) }
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
    const stataDiscoveryMock = {
        DISCOVERY_TIMEOUT_MS: { darwin: 3000, win32: 5000 },
        editionFromAppName(appName) {
            const match = String(appName || '').match(/^Stata(MP|SE|BE|IC)$/i);
            return match ? match[1].toLowerCase() : null;
        },
        async discoverStataInstallations(discoveryOptions = {}) {
            if (discoveryOptions.platform === 'darwin') {
                calls.macDiscovery++;
                calls.macTimeoutMs = discoveryOptions.timeoutMs;
                return options.macDiscovery || { candidates: [] };
            }
            calls.windowsDiscovery++;
            calls.windowsTimeoutMs = discoveryOptions.timeoutMs;
            if (options.discoveryDelay) await new Promise(resolve => setTimeout(resolve, options.discoveryDelay));
            return options.windowsDiscovery || { candidates: [] };
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
            if (request === './stataDiscovery') return stataDiscoveryMock;
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
        extensionPath: '/extensions/stata-all-in-one',
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
        windowsDiscovery: { candidates: [candidate] },
        quickPickValue: items => items[0]
    });
    const context = createContext();
    const firstCaller = resolver.ensureStataConfigured(context, { promptOnFailure: true });
    const secondCaller = resolver.ensureStataConfigured(context, { promptOnFailure: true });
    const [firstResult, secondResult] = await Promise.all([firstCaller, secondCaller]);

    assert.equal(calls.windowsDiscovery, 1);
    assert.equal(calls.windowsTimeoutMs, 5000);
    assert.equal(calls.input, 0);
    assert.equal(settings.stataPathOnWindows, candidate.executablePath);
    assert.equal(firstResult.executablePath, candidate.executablePath);
    assert.equal(secondResult.executablePath, candidate.executablePath);
});

test('Windows discovery failure opens the Stata command setup flow', async () => {
    const { resolver, calls } = loadResolver({ windowsDiscovery: { candidates: [] } });
    const result = await resolver.ensureStataConfigured(createContext(), { promptOnFailure: true });
    assert.equal(calls.windowsDiscovery, 1);
    assert.equal(calls.input, 0);
    assert.equal(calls.info, 1);
    assert.equal(result.source, 'stata-command-pending');
});

test('one detected Windows installation still shows the selection list', async () => {
    const candidate = {
        displayName: 'Stata18',
        edition: 'mp',
        executablePath: 'D:\\Stata18\\StataMP-64.exe'
    };
    const { resolver, calls } = loadResolver({
        windowsDiscovery: { candidates: [candidate] },
        quickPickValue: items => items[0]
    });

    const result = await resolver.ensureStataConfigured(createContext(), { promptOnFailure: true });

    assert.equal(calls.quickPick, 1);
    assert.equal(calls.quickPickItems.length, 2);
    assert.equal(calls.quickPickItems[1].label, 'stataDiscoveryUseStataSetup');
    assert.equal(result.executablePath, candidate.executablePath);
});

test('multiple Windows installations require an explicit selection', async () => {
    const candidates = [
        { displayName: 'Stata18', edition: 'mp', executablePath: 'D:\\Stata18\\StataMP-64.exe' },
        { displayName: 'Stata17', edition: 'se', executablePath: 'D:\\Stata17\\StataSE-64.exe' }
    ];
    const { resolver, settings, calls } = loadResolver({
        windowsDiscovery: { candidates },
        quickPickValue: items => items[1]
    });

    const result = await resolver.ensureStataConfigured(createContext(), { promptOnFailure: true });

    assert.equal(calls.quickPick, 1);
    assert.equal(calls.quickPickOptions.title, '✨ Stata All in One (0.3.1)');
    assert.equal(calls.quickPickItems[0].label, 'Stata 18 MP');
    assert.equal(calls.quickPickItems[0].description, 'stataDiscoveryRecommended');
    assert.equal(calls.quickPickItems[0].detail, candidates[0].executablePath);
    assert.equal(calls.quickPickItems.at(-1).label, 'stataDiscoveryUseStataSetup');
    assert.equal(settings.stataPathOnWindows, candidates[1].executablePath);
    assert.equal(result.executablePath, candidates[1].executablePath);
});

test('Stata setup item in the Windows picker opens command instructions', async () => {
    const { resolver, calls } = loadResolver({
        windowsDiscovery: {
            candidates: [
                { displayName: 'Stata18', edition: 'mp', executablePath: 'D:\\Stata18\\StataMP-64.exe' },
                { displayName: 'Stata17', edition: 'mp', executablePath: 'D:\\Stata17\\StataMP-64.exe' }
            ]
        },
        quickPickValue: items => items.at(-1),
        infoValue: 'stataSetupCommandDone'
    });
    const result = await resolver.ensureStataConfigured(createContext(), { promptOnFailure: true });
    assert.equal(calls.quickPick, 1);
    assert.equal(calls.input, 0);
    assert.equal(calls.info, 1);
    assert.equal(result.source, 'stata-command-pending');
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
        quickPickValue: items => items[0],
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

test('macOS discovery failure opens the Stata command setup flow', async () => {
    const { resolver, calls } = loadResolver({
        platform: 'darwin',
        macDiscovery: { candidates: [] }
    });
    const context = createContext();
    const result = await resolver.ensureStataConfigured(context, { promptOnFailure: true });
    assert.equal(calls.macDiscovery, 1);
    assert.equal(calls.quickPick, 0);
    assert.equal(calls.openDialog, 0);
    assert.equal(calls.info, 1);
    assert.equal(result.source, 'stata-command-pending');
});

test('macOS discovery success caches the selected app and dylib paths', async () => {
    const candidate = {
        appName: 'StataMP',
        appPath: '/Applications/Stata19/StataMP.app',
        edition: 'mp',
        version: 19,
        dylibPath: '/Applications/Stata19/StataMP.app/Contents/MacOS/libstata-mp.dylib',
        hasDylib: true
    };
    const { resolver, settings, calls } = loadResolver({
        platform: 'darwin',
        macDiscovery: { candidates: [candidate] },
        quickPickValue: items => items[0]
    });
    const context = createContext();
    const result = await resolver.ensureStataConfigured(context, { promptOnFailure: true });
    assert.equal(calls.macTimeoutMs, 3000);
    assert.equal(calls.macDiscovery, 1);
    assert.equal(calls.quickPick, 1);
    assert.equal(calls.quickPickItems[0].label, 'Stata 19 MP');
    assert.equal(calls.quickPickItems.at(-1).label, 'stataDiscoveryUseStataSetup');
    assert.equal(settings.stataVersionOnMacOS, 'StataMP');
    assert.equal(context.values.get('stataGuiAppPath'), candidate.appPath);
    assert.equal(context.values.get('stataConsoleDylibPath'), candidate.dylibPath);
    assert.equal(result.autoDetected, true);
});

test('macOS Stata signal falls back to the installed edition when c(flavor) differs', () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-signal-'));
    const executableDirectory = path.join(tempDirectory, 'StataMP.app', 'Contents', 'MacOS');
    fs.mkdirSync(executableDirectory, { recursive: true });
    fs.writeFileSync(path.join(executableDirectory, 'StataMP'), 'test');
    fs.writeFileSync(path.join(executableDirectory, 'libstata-mp.dylib'), 'test');
    const { resolver } = loadResolver({ platform: 'darwin' });
    try {
        const result = resolver.resolveMacSignalInstallation({
            flavor: 'IC',
            sysdirStata: tempDirectory
        });
        assert.equal(result.edition, 'mp');
        assert.equal(result.version, 'StataMP');
        assert.equal(result.candidate.appPath, path.join(tempDirectory, 'StataMP.app'));
        assert.equal(result.candidate.hasDylib, true);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});
