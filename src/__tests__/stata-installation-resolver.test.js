const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

function loadResolver(options = {}) {
    const settings = {
        stataPathOnWindows: options.windowsPath || '',
        stataVersionOnMacOS: options.macVersion || ''
    };
    const updates = [];
    const calls = { windowsDiscovery: 0, macDiscovery: 0, input: 0, quickPick: 0 };
    const vscodeMock = {
        ConfigurationTarget: { Global: 1 },
        workspace: {
            getConfiguration() {
                return {
                    async update(key, value) {
                        settings[key] = value;
                        updates.push({ key, value });
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

test('startup and command callers share one Windows discovery promise', async () => {
    const candidate = { displayName: 'Stata18', executablePath: 'D:\\Stata18\\StataMP-64.exe' };
    const { resolver, settings, calls } = loadResolver({
        discoveryDelay: 10,
        windowsDiscovery: { candidates: [candidate] }
    });
    const context = createContext();
    const startup = resolver.startStartupStataDetection(context, Promise.resolve());
    const command = resolver.ensureStataConfigured(context, { promptOnFailure: true });
    const [startupResult, commandResult] = await Promise.all([startup, command]);

    assert.equal(calls.windowsDiscovery, 1);
    assert.equal(calls.input, 0);
    assert.equal(settings.stataPathOnWindows, candidate.executablePath);
    assert.equal(startupResult.executablePath, candidate.executablePath);
    assert.equal(commandResult.executablePath, candidate.executablePath);
});

test('Windows discovery failure falls back to the existing path input', async () => {
    const { resolver, settings, calls } = loadResolver({
        windowsDiscovery: { candidates: [] },
        inputValue: 'D:\\Stata17\\StataSE-64.exe'
    });
    const result = await resolver.ensureStataConfigured(createContext(), { promptOnFailure: true });
    assert.equal(calls.windowsDiscovery, 1);
    assert.equal(calls.input, 1);
    assert.equal(settings.stataPathOnWindows, 'D:\\Stata17\\StataSE-64.exe');
    assert.equal(result.executablePath, settings.stataPathOnWindows);
});

test('non-empty Windows configuration skips startup discovery', async () => {
    const configuredPath = 'E:\\Stata19\\StataMP-64.exe';
    const { resolver, calls } = loadResolver({ windowsPath: configuredPath });
    const result = await resolver.startStartupStataDetection(createContext(), Promise.resolve());
    assert.equal(calls.windowsDiscovery, 0);
    assert.equal(calls.input, 0);
    assert.equal(result.executablePath, configuredPath);
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
