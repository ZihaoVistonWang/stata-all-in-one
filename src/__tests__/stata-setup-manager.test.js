const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { version: extensionVersion } = require('../../package.json');

const SETUP_TITLE = `✨ Stata All in One (${extensionVersion})`;

const BUTTONS = {
    stataSetupConfirm: '确认',
    stataSetupSwitchExternal: '切换到外部 Stata 软件运行',
    stataSetupConfirmSwitchExternal: '确认并切换到外部 Stata 软件运行',
    stataSetupUseEmbedded: '切换到内置 Stata 控制台',
    stataSetupKeepExternal: '继续使用外部 Stata 软件',
    stataSetupReconfigure: '重新配置',
    stataSetupPurchaseGenuine: '采购或使用正版Stata',
    stataSetupVisitDealer: '联系友万科技'
};

function localizedMessage(key, params = {}) {
    if (BUTTONS[key]) return BUTTONS[key];
    const messages = {
        stataSetupInstallationMissing: '未找到可用的 Stata 安装。',
        stataSetupMissingDll: '未找到内置 Stata 控制台所需的 DLL。',
        stataSetupMissingDylib: '未找到内置 Stata 控制台所需的 dylib。',
        stataSetupMissingLicense: '未找到许可证文件 stata.lic。请支持正版Stata软件，以体验Stata All in One完整功能。',
        stataSetupNativeUnavailable: '无法加载原生桥接模块。',
        stataSetupExternalAvailable: '仍可通过外部 Stata 软件运行代码。',
        stataSetupGenuineInfo: '中国大陆用户可以联系 Stata Corp, LLC 官方授权经销商北京友万信息科技有限公司（友万科技）采购正版软件或申请试用。\n\nhttp://xhslink.com/o/QYWdYfrEhy'
    };
    if (messages[key]) return messages[key];
    if (key === 'stataSetupSuccess') return `成功：${params.stataPath}`;
    if (key === 'stataSetupSuccessExternalMode') return `外部模式成功：${params.stataPath}`;
    if (key === 'stataSetupConsoleFailure') return `已找到 Stata：${params.stataPath}，但 Console 不可用：`;
    if (key === 'stataSetupSessionFailed') return `Console 初始化失败：${params.reason || ''}`;
    return key;
}

function createContext() {
    const values = new Map();
    return {
        values,
        globalState: {
            get(key, defaultValue) {
                return values.has(key) ? values.get(key) : defaultValue;
            },
            async update(key, value) {
                if (value === undefined) values.delete(key);
                else values.set(key, value);
            }
        }
    };
}

function loadSetupManager(options = {}) {
    const calls = {
        capability: [],
        console: 0,
        events: [],
        info: [],
        resolver: 0,
        updates: [],
        warning: [],
        external: []
    };
    const settings = {
        runMode: options.runMode || 'embeddedConsole',
        stataPathOnWindows: options.windowsPath || '',
        stataVersionOnMacOS: options.macVersion || ''
    };
    const infoChoices = [...(options.infoChoices || [BUTTONS.stataSetupConfirm])];
    const warningChoices = [...(options.warningChoices || [])];
    const platform = options.platform || 'win32';

    const vscodeMock = {
        ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
        Uri: { parse: value => value },
        env: {
            async openExternal(uri) {
                calls.external.push(uri);
                return true;
            }
        },
        workspace: {
            getConfiguration() {
                return {
                    inspect() {
                        return {};
                    },
                    async update(key, value, target) {
                        settings[key] = value;
                        calls.updates.push({ key, value, target });
                    }
                };
            }
        },
        window: {
            async showInformationMessage(message, modalOptions, ...items) {
                calls.events.push('info');
                calls.info.push({ message, modalOptions, items });
                return infoChoices.shift();
            },
            async showWarningMessage(message, modalOptions, ...items) {
                calls.events.push('warning');
                calls.warning.push({ message, modalOptions, items });
                return warningChoices.shift();
            }
        }
    };
    const configMock = {
        RUN_MODES: { embeddedConsole: 'embeddedConsole', externalApp: 'externalApp' },
        getRunMode: () => settings.runMode
    };
    const commonMock = {
        isWindows: () => platform === 'win32',
        isMacOS: () => platform === 'darwin',
        msg: localizedMessage,
        stripSurroundingQuotes: value => String(value || '').replace(/^['"]|['"]$/g, '')
    };
    const capabilityMock = {
        async setCapabilityState(_context, state) {
            calls.events.push(`cap:${state}`);
            calls.capability.push(state);
        }
    };
    const resolverMock = {
        MAC_DISCOVERY_TIMEOUT_MS: 3000,
        async ensureStataConfigured() {
            calls.resolver++;
            return typeof options.getResolvedInstallation === 'function'
                ? options.getResolvedInstallation()
                : options.resolvedInstallation;
        },
        resetStataDiscoveryState() {}
    };
    const stataDiscoveryMock = {
        getInstallationSignals(executablePath) {
            if (typeof options.getWindowsSignals === 'function') {
                return options.getWindowsSignals(executablePath);
            }
            return options.windowsSignals || {
                hasMatchingDll: true,
                dllPath: path.join(path.dirname(executablePath), 'mp-64.dll'),
                hasLicense: true
            };
        },
        async discoverStataInstallations() {
            return { candidates: options.macCandidates || [] };
        }
    };
    const embeddedConsoleMock = {
        async ensureConsoleSession() {
            calls.console++;
            if (typeof options.getConsoleResult === 'function') return options.getConsoleResult();
            return options.consoleResult || { success: true, fromExisting: false };
        }
    };

    const managerPath = path.resolve(__dirname, '../modules/runCode/stataSetupManager.js');
    delete require.cache[managerPath];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (parent && parent.filename === managerPath) {
            if (request === 'vscode') return vscodeMock;
            if (request === '../capability') return capabilityMock;
            if (request === '../../utils/config') return configMock;
            if (request === '../../utils/common') return commonMock;
            if (request === './stataDiscovery') return stataDiscoveryMock;
            if (request === './stataInstallationResolver') return resolverMock;
            if (request === './embeddedConsole/windows' || request === './embeddedConsole/mac') {
                return embeddedConsoleMock;
            }
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    let manager;
    try {
        manager = require(managerPath);
    } finally {
        Module._load = originalLoad;
    }
    return {
        calls,
        manager,
        settings,
        setupOptions: {
            consoleInitializer: () => embeddedConsoleMock.ensureConsoleSession()
        }
    };
}

function createWindowsInstallation() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-setup-win-'));
    const executablePath = path.join(directory, 'StataMP-64.exe');
    fs.writeFileSync(executablePath, 'test');
    return { directory, executablePath };
}

function createMacInstallation(options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-setup-mac-'));
    const appPath = path.join(directory, 'StataMP.app');
    const macOSDirectory = path.join(appPath, 'Contents', 'MacOS');
    fs.mkdirSync(macOSDirectory, { recursive: true });
    fs.writeFileSync(path.join(macOSDirectory, 'StataMP'), 'test');
    const dylibPath = path.join(macOSDirectory, 'libstata-mp.dylib');
    const licensePath = path.join(directory, 'stata.lic');
    if (options.withDylib !== false) fs.writeFileSync(dylibPath, 'test');
    if (options.withLicense !== false) fs.writeFileSync(licensePath, 'test');
    return { directory, appPath, dylibPath, licensePath };
}

test('startup setup shares one promise and shows Windows success once', async () => {
    const installation = createWindowsInstallation();
    let resolverCall = 0;
    const { calls, manager, setupOptions } = loadSetupManager({
        getResolvedInstallation() {
            resolverCall++;
            return {
                platform: 'win32',
                executablePath: installation.executablePath,
                source: resolverCall === 1 ? 'detected' : 'configured'
            };
        }
    });
    const context = createContext();
    try {
        let releaseStartup;
        const prerequisite = new Promise(resolve => { releaseStartup = resolve; });
        const startup = manager.startStartupStataSetup(context, prerequisite, setupOptions);
        const concurrentCaller = manager.ensureStataSetup(context);
        releaseStartup();
        const [startupResult, concurrentResult] = await Promise.all([startup, concurrentCaller]);

        assert.equal(calls.console, 1);
        assert.equal(calls.info.length, 1);
        assert.equal(calls.events[0], 'cap:unverified');
        assert.ok(calls.events.indexOf('info') < calls.events.lastIndexOf('cap:console'));
        assert.equal(calls.info[0].message, SETUP_TITLE);
        assert.equal(calls.info[0].modalOptions.modal, true);
        assert.match(calls.info[0].modalOptions.detail, new RegExp(installation.executablePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.deepEqual(calls.info[0].items, [
            BUTTONS.stataSetupConfirm,
            BUTTONS.stataSetupSwitchExternal
        ]);
        assert.equal(startupResult.consoleAvailable, true);
        assert.equal(concurrentResult.consoleAvailable, true);

        await manager.ensureStataSetup(context, setupOptions);
        assert.equal(calls.info.length, 1);
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('fresh auto-discovery reports setup again despite an unchanged acknowledgement', async () => {
    const installation = createWindowsInstallation();
    const resolvedInstallation = {
        platform: 'win32',
        executablePath: installation.executablePath,
        source: 'detected'
    };
    const { calls, manager, setupOptions } = loadSetupManager({ resolvedInstallation });
    const context = createContext();
    try {
        const report = await manager.inspectInstallation(context, resolvedInstallation);
        const signature = manager.buildSetupSignature(report, []);
        await context.globalState.update(manager.SETUP_NOTICE_STATE_KEY, {
            signature,
            outcome: 'success',
            acknowledgedAt: Date.now()
        });

        const result = await manager.ensureStataSetup(context, setupOptions);

        assert.equal(result.consoleAvailable, true);
        assert.equal(calls.info.length, 1);
        assert.equal(calls.info[0].message, SETUP_TITLE);
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('Windows missing DLL and license are reported together in one modal', async () => {
    const installation = createWindowsInstallation();
    const { calls, manager, settings } = loadSetupManager({
        resolvedInstallation: {
            platform: 'win32',
            executablePath: installation.executablePath,
            source: 'detected'
        },
        windowsSignals: {
            hasMatchingDll: false,
            dllPath: null,
            hasLicense: false
        },
        infoChoices: [BUTTONS.stataSetupConfirmSwitchExternal]
    });
    try {
        const result = await manager.ensureStataSetup(createContext());
        assert.equal(calls.info.length, 1);
        assert.ok(calls.events.indexOf('info') < calls.events.lastIndexOf('cap:external'));
        assert.equal(calls.info[0].message, SETUP_TITLE);
        assert.equal(calls.info[0].modalOptions.modal, true);
        assert.deepEqual(calls.info[0].items, [
            BUTTONS.stataSetupConfirmSwitchExternal,
            BUTTONS.stataSetupPurchaseGenuine
        ]);
        assert.match(calls.info[0].modalOptions.detail, /DLL/);
        assert.match(calls.info[0].modalOptions.detail, /stata\.lic/);
        assert.match(calls.info[0].modalOptions.detail, /请支持正版Stata软件，以体验Stata All in One完整功能。/);
        assert.match(calls.info[0].modalOptions.detail, new RegExp(installation.executablePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.equal(calls.console, 0);
        assert.equal(settings.runMode, 'externalApp');
        assert.equal(result.canProceed, true);
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('debug license failure dialog opens genuine Stata guidance and dealer URL', async () => {
    const { calls, manager, settings } = loadSetupManager({
        infoChoices: [
            BUTTONS.stataSetupPurchaseGenuine,
            BUTTONS.stataSetupVisitDealer,
            BUTTONS.stataSetupConfirmSwitchExternal
        ]
    });

    await manager.showDebugLicenseFailureDialog();

    assert.equal(calls.info.length, 3);
    assert.deepEqual(calls.info[0].items, [
        BUTTONS.stataSetupConfirmSwitchExternal,
        BUTTONS.stataSetupPurchaseGenuine
    ]);
    assert.equal(calls.info[1].message, SETUP_TITLE);
    assert.match(calls.info[1].modalOptions.detail, /中国大陆用户/);
    assert.match(calls.info[1].modalOptions.detail, /北京友万信息科技有限公司/);
    assert.deepEqual(calls.info[1].items, [
        BUTTONS.stataSetupVisitDealer,
        BUTTONS.stataSetupConfirm
    ]);
    assert.deepEqual(calls.external, ['http://xhslink.com/o/QYWdYfrEhy']);
    assert.equal(settings.runMode, 'externalApp');
});

test('macOS license failure displays the exact app path and support sentence', async () => {
    const installation = createMacInstallation({ withDylib: true, withLicense: false });
    const { calls, manager, setupOptions } = loadSetupManager({
        platform: 'darwin',
        resolvedInstallation: {
            platform: 'darwin',
            version: 'StataMP',
            source: 'manual',
            candidate: { appPath: installation.appPath, edition: 'mp' }
        },
        infoChoices: [BUTTONS.stataSetupConfirmSwitchExternal]
    });
    try {
        await manager.ensureStataSetup(createContext());
        assert.equal(calls.info.length, 1);
        assert.equal(calls.info[0].message, SETUP_TITLE);
        assert.match(calls.info[0].modalOptions.detail, new RegExp(installation.appPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.doesNotMatch(calls.info[0].modalOptions.detail, /libstata-mp\.dylib/);
        assert.match(calls.info[0].modalOptions.detail, /请支持正版Stata软件，以体验Stata All in One完整功能。/);
        assert.doesNotMatch(calls.info[0].modalOptions.detail, /DLL/);
        assert.equal(calls.console, 0);
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('macOS success displays the app path and can switch to external mode', async () => {
    const installation = createMacInstallation();
    const { calls, manager, settings, setupOptions } = loadSetupManager({
        platform: 'darwin',
        resolvedInstallation: {
            platform: 'darwin',
            version: 'StataMP',
            source: 'detected',
            candidate: { appPath: installation.appPath, edition: 'mp' }
        },
        infoChoices: [BUTTONS.stataSetupSwitchExternal]
    });
    const context = createContext();
    try {
        const result = await manager.ensureStataSetup(context, setupOptions);
        assert.equal(result.consoleAvailable, true);
        assert.equal(calls.info.length, 1);
        assert.equal(calls.info[0].message, SETUP_TITLE);
        assert.match(calls.info[0].modalOptions.detail, new RegExp(installation.appPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.deepEqual(calls.info[0].items, [
            BUTTONS.stataSetupConfirm,
            BUTTONS.stataSetupSwitchExternal
        ]);
        assert.equal(settings.runMode, 'externalApp');
        assert.equal(context.values.has(manager.SETUP_NOTICE_STATE_KEY), true);

        await manager.resetStataSetupState(context);
        assert.equal(context.values.has(manager.SETUP_NOTICE_STATE_KEY), false);
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('closing a failure modal keeps initialization pending until explicit confirmation', async () => {
    const installation = createWindowsInstallation();
    const { calls, manager, settings } = loadSetupManager({
        resolvedInstallation: {
            platform: 'win32',
            executablePath: installation.executablePath,
            source: 'detected'
        },
        windowsSignals: {
            hasMatchingDll: false,
            dllPath: null,
            hasLicense: true
        },
        infoChoices: [undefined, BUTTONS.stataSetupConfirmSwitchExternal]
    });
    const context = createContext();
    try {
        const confirmed = await manager.ensureStataSetup(context);
        assert.equal(calls.info.length, 2);
        assert.equal(confirmed.acknowledged, true);
        assert.equal(settings.runMode, 'externalApp');
        assert.equal(context.values.has(manager.SETUP_NOTICE_STATE_KEY), true);
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('a configured installation is revalidated silently after its license state recovers', async () => {
    const installation = createWindowsInstallation();
    let licenseAvailable = false;
    let resolverCall = 0;
    const { calls, manager, settings, setupOptions } = loadSetupManager({
        getResolvedInstallation() {
            resolverCall++;
            return {
                platform: 'win32',
                executablePath: installation.executablePath,
                source: resolverCall === 1 ? 'detected' : 'configured'
            };
        },
        getWindowsSignals() {
            return {
                hasMatchingDll: true,
                dllPath: path.join(installation.directory, 'mp-64.dll'),
                hasLicense: licenseAvailable
            };
        },
        infoChoices: [BUTTONS.stataSetupConfirmSwitchExternal]
    });
    const context = createContext();
    try {
        await manager.ensureStataSetup(context);
        assert.equal(calls.info.length, 1);

        licenseAvailable = true;
        settings.runMode = 'embeddedConsole';
        const result = await manager.ensureStataSetup(context, setupOptions);
        assert.equal(result.consoleAvailable, true);
        assert.equal(calls.info.length, 1);
        assert.equal(calls.console, 1);
        assert.equal(context.values.get(manager.SETUP_NOTICE_STATE_KEY).outcome, 'success');
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('a changed configured installation validates Console silently when successful', async () => {
    const installation = createWindowsInstallation();
    const { calls, manager, setupOptions } = loadSetupManager({
        resolvedInstallation: {
            platform: 'win32',
            executablePath: installation.executablePath,
            source: 'configured'
        }
    });
    const context = createContext();
    await context.globalState.update(manager.SETUP_NOTICE_STATE_KEY, {
        signature: 'previous-installation',
        outcome: 'success',
        acknowledgedAt: Date.now()
    });
    try {
        const result = await manager.ensureStataSetup(context, setupOptions);
        assert.equal(result.consoleAvailable, true);
        assert.equal(result.action, 'silent');
        assert.equal(calls.console, 1);
        assert.equal(calls.info.length, 0);
        assert.equal(calls.warning.length, 0);
        assert.notEqual(
            context.values.get(manager.SETUP_NOTICE_STATE_KEY).signature,
            'previous-installation'
        );
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('external run mode skips Console validation for an auto-detected installation', async () => {
    const installation = createWindowsInstallation();
    const { calls, manager } = loadSetupManager({
        runMode: 'externalApp',
        resolvedInstallation: {
            platform: 'win32',
            executablePath: installation.executablePath,
            source: 'detected'
        }
    });
    try {
        const result = await manager.ensureStataSetup(createContext());
        assert.equal(result.action, 'external');
        assert.equal(result.consoleCheckSkipped, true);
        assert.equal(calls.console, 0);
        assert.equal(calls.info.length, 0);
        assert.equal(calls.warning.length, 0);
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('Stata-triggered setup revalidates Console without changing external run mode', async () => {
    const installation = createWindowsInstallation();
    const { calls, manager, settings } = loadSetupManager({
        runMode: 'externalApp',
        resolvedInstallation: {
            platform: 'win32',
            executablePath: installation.executablePath,
            source: 'configured'
        },
        infoChoices: [BUTTONS.stataSetupKeepExternal]
    });
    try {
        const result = await manager.ensureStataSetup(createContext(), {
            forceNotice: true,
            signalReceived: true,
            validateConsole: true
        });
        assert.equal(calls.console, 1);
        assert.equal(result.consoleAvailable, true);
        assert.equal(settings.runMode, 'externalApp');
        assert.match(calls.info[0].modalOptions.detail, /^stataSetupSignalReceived/);
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('external run mode still reports a missing Stata application', async () => {
    const { calls, manager } = loadSetupManager({
        runMode: 'externalApp',
        resolvedInstallation: {
            platform: 'win32',
            executablePath: 'C:\\Missing\\StataMP-64.exe',
            source: 'detected'
        },
        warningChoices: [BUTTONS.stataSetupConfirm]
    });

    const result = await manager.ensureStataSetup(createContext());

    assert.equal(result.installationAvailable, false);
    assert.equal(calls.console, 0);
    assert.equal(calls.info.length, 0);
    assert.equal(calls.warning.length, 1);
    assert.equal(calls.warning[0].modalOptions.detail, '未找到可用的 Stata 安装。');
});

test('missing installation modal never offers external Stata', async () => {
    const { calls, manager, setupOptions } = loadSetupManager({
        resolvedInstallation: null,
        warningChoices: [BUTTONS.stataSetupConfirm]
    });
    const result = await manager.ensureStataSetup(createContext());
    assert.equal(result.installationAvailable, false);
    assert.equal(calls.warning[0].message, SETUP_TITLE);
    assert.equal(calls.warning[0].modalOptions.detail, '未找到可用的 Stata 安装。');
    assert.deepEqual(calls.warning[0].items, [
        BUTTONS.stataSetupReconfigure,
        BUTTONS.stataSetupConfirm
    ]);
    assert.equal(calls.warning[0].items.includes(BUTTONS.stataSetupSwitchExternal), false);
    assert.equal(calls.warning[0].items.includes(BUTTONS.stataSetupConfirmSwitchExternal), false);
});

test('an invalid saved Windows path is kept until the user requests reconfiguration', async () => {
    const configuredPath = path.join(os.tmpdir(), 'Missing', 'StataMP-64.exe');
    const { calls, manager, settings } = loadSetupManager({
        windowsPath: configuredPath,
        resolvedInstallation: {
            platform: 'win32',
            executablePath: configuredPath,
            source: 'configured'
        },
        warningChoices: [BUTTONS.stataSetupConfirm]
    });

    const result = await manager.ensureStataSetup(createContext());

    assert.equal(result.installationAvailable, false);
    assert.equal(calls.resolver, 1);
    assert.equal(calls.warning.length, 1);
    assert.equal(calls.info.length, 0);
    assert.equal(settings.stataPathOnWindows, configuredPath);
    assert.equal(calls.updates.some(update => update.key === 'stataPathOnWindows'), false);
});

test('an invalid saved Windows path is repaired only after explicit reconfiguration', async () => {
    const installation = createWindowsInstallation();
    let resolverCall = 0;
    const { calls, manager, setupOptions } = loadSetupManager({
        getResolvedInstallation() {
            resolverCall++;
            if (resolverCall === 1) {
                return {
                    platform: 'win32',
                    executablePath: path.join(installation.directory, 'Missing', 'StataMP-64.exe'),
                    source: 'configured'
                };
            }
            return {
                platform: 'win32',
                executablePath: installation.executablePath,
                source: 'detected'
            };
        },
        warningChoices: [BUTTONS.stataSetupReconfigure]
    });
    try {
        const result = await manager.ensureStataSetup(createContext(), setupOptions);
        assert.equal(result.installationAvailable, true);
        assert.equal(result.consoleAvailable, true);
        assert.equal(calls.resolver, 2);
        assert.equal(calls.warning.length, 1);
        assert.equal(calls.info.length, 1);
        assert.ok(calls.updates.some(update => update.key === 'stataPathOnWindows' && update.value === ''));
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});

test('a macOS edition selection without a matching app is kept until reconfiguration is requested', async () => {
    const { calls, manager, settings } = loadSetupManager({
        platform: 'darwin',
        macVersion: 'StataMP',
        resolvedInstallation: {
            platform: 'darwin',
            version: 'StataMP',
            source: 'manual',
            candidate: {
                appPath: '/Applications/Missing/StataMP.app',
                edition: 'mp'
            }
        },
        warningChoices: [BUTTONS.stataSetupConfirm]
    });
    const result = await manager.ensureStataSetup(createContext());
    assert.equal(result.installationAvailable, false);
    assert.equal(settings.stataVersionOnMacOS, 'StataMP');
    assert.equal(calls.resolver, 1);
    assert.equal(calls.warning.length, 1);
});

test('native initialization failure uses the single external-switch modal', async () => {
    const installation = createWindowsInstallation();
    const { calls, manager, setupOptions } = loadSetupManager({
        resolvedInstallation: {
            platform: 'win32',
            executablePath: installation.executablePath,
            source: 'configured'
        },
        consoleResult: {
            success: false,
            failCode: 'NATIVE_NOT_LOADED',
            reason: 'native module unavailable'
        },
        infoChoices: [BUTTONS.stataSetupConfirmSwitchExternal]
    });
    try {
        await manager.ensureStataSetup(createContext(), setupOptions);
        assert.equal(calls.info.length, 1);
        assert.equal(calls.info[0].message, SETUP_TITLE);
        assert.match(calls.info[0].modalOptions.detail, /原生桥接模块/);
        assert.deepEqual(calls.info[0].items, [BUTTONS.stataSetupConfirmSwitchExternal]);
    } finally {
        fs.rmSync(installation.directory, { recursive: true, force: true });
    }
});
