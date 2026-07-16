const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const config = require('../../utils/config');
const {
    isWindows,
    isMacOS,
    msg,
    stripSurroundingQuotes
} = require('../../utils/common');
const {
    DISCOVERY_TIMEOUT_MS,
    discoverStataInstallations
} = require('./stataDiscovery');
const { version: extensionVersion } = require('../../../package.json');

const WINDOWS_DISCOVERY_TIMEOUT_MS = DISCOVERY_TIMEOUT_MS.win32;
const MAC_DISCOVERY_TIMEOUT_MS = DISCOVERY_TIMEOUT_MS.darwin;
const SETUP_DIALOG_TITLE = `✨ Stata All in One (${extensionVersion})`;

let resolutionPromise = null;
const discoveryAttempted = { win32: false, darwin: false };
let stataCommandSetupQuickPick = null;

async function saveGlobalConfiguration(key, value) {
    const extensionConfig = vscode.workspace.getConfiguration('stata-all-in-one');
    const inspected = typeof extensionConfig.inspect === 'function'
        ? extensionConfig.inspect(key)
        : null;
    const isExplicitlyEmpty = item => typeof item === 'string' && item.trim() === '';
    if (inspected && isExplicitlyEmpty(inspected.workspaceFolderValue)) {
        await extensionConfig.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    }
    if (inspected && isExplicitlyEmpty(inspected.workspaceValue)) {
        await extensionConfig.update(key, undefined, vscode.ConfigurationTarget.Workspace);
    }
    await extensionConfig.update(key, value, vscode.ConfigurationTarget.Global);
}

function validateWindowsExecutablePath(value) {
    const executablePath = stripSurroundingQuotes(String(value || '').trim());
    if (!executablePath) return undefined;
    if (path.extname(executablePath).toLowerCase() !== '.exe') {
        return msg('stataSetupWindowsExeRequired');
    }
    if (!/^Stata(?:MP|SE|BE|IC)?(?:-64)?\.exe$/i.test(path.basename(executablePath))) {
        return msg('stataSetupWindowsExeInvalid');
    }
    try {
        if (!fs.statSync(executablePath).isFile()) {
            return msg('stataSetupWindowsExeNotFound');
        }
    } catch {
        return msg('stataSetupWindowsExeNotFound');
    }
    return undefined;
}

function getConfiguredResult() {
    if (isWindows()) {
        const rawPath = config.getStataPathOnWindows();
        const executablePath = stripSurroundingQuotes(String(rawPath || '').trim());
        return executablePath
            ? { platform: 'win32', executablePath, autoDetected: false, source: 'configured' }
            : null;
    }
    if (isMacOS()) {
        const version = String(config.getStataVersion() || '').trim();
        return version
            ? { platform: 'darwin', version, autoDetected: false, source: 'configured' }
            : null;
    }
    return null;
}

function buildStataNetInstallCommand(context) {
    const packageDirectory = path.join(context.extensionPath, 'stata', 'saio')
        .replace(/\\/g, '/')
        .replace(/"/g, '""');
    return `net install saio, from("${packageDirectory}") replace`;
}

async function promptForStataCommandSetup(context) {
    closeStataCommandSetupQuickPick();

    const installCommand = buildStataNetInstallCommand(context);
    const setupCommand = 'saio setup';
    const quickPick = vscode.window.createQuickPick();
    stataCommandSetupQuickPick = quickPick;
    let installCopied = false;
    let setupCopied = false;

    const buildItems = () => [
        {
            label: `${installCopied ? '$(check)' : '$(primitive-square)'} ${msg('stataSetupQuickPickInstallLabel')}`,
            description: installCopied
                ? msg('stataSetupQuickPickCopied')
                : msg('stataSetupQuickPickClickToCopy'),
            detail: msg('stataSetupQuickPickInstallDetail'),
            setupAction: 'copyInstall'
        },
        {
            label: `${setupCopied ? '$(check)' : '$(primitive-square)'} ${msg('stataSetupQuickPickSetupLabel')}`,
            description: setupCopied
                ? msg('stataSetupQuickPickCopied')
                : msg('stataSetupQuickPickClickToCopy'),
            detail: msg('stataSetupQuickPickSetupDetail'),
            setupAction: 'copySetup'
        }
    ];

    quickPick.title = SETUP_DIALOG_TITLE;
    quickPick.placeholder = msg('stataSetupQuickPickPlaceholder');
    quickPick.ignoreFocusOut = true;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = buildItems();
    if (context && Array.isArray(context.subscriptions)) {
        context.subscriptions.push(quickPick);
    }

    quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0];
        if (!selected) return;
        if (selected.setupAction === 'copyInstall') {
            await vscode.env.clipboard.writeText(installCommand);
            installCopied = true;
            quickPick.placeholder = msg('stataSetupQuickPickInstallCopiedHint');
        } else if (selected.setupAction === 'copySetup') {
            await vscode.env.clipboard.writeText(setupCommand);
            setupCopied = true;
            quickPick.placeholder = msg('stataSetupQuickPickSetupCopiedHint');
        }
        quickPick.items = buildItems();
        quickPick.selectedItems = [];
        const nextAction = selected.setupAction === 'copyInstall' ? 'copySetup' : selected.setupAction;
        const nextItem = quickPick.items.find(item => item.setupAction === nextAction);
        if (nextItem) quickPick.activeItems = [nextItem];
    });
    quickPick.onDidHide(() => {
        if (stataCommandSetupQuickPick === quickPick) {
            stataCommandSetupQuickPick = null;
        }
        quickPick.dispose();
    });
    quickPick.show();

    return {
        platform: isWindows() ? 'win32' : 'darwin',
        autoDetected: false,
        pending: true,
        source: 'stata-command-pending'
    };
}

function closeStataCommandSetupQuickPick() {
    if (!stataCommandSetupQuickPick) return;
    const quickPick = stataCommandSetupQuickPick;
    stataCommandSetupQuickPick = null;
    quickPick.hide();
}

async function discoverAndConfigureWindows(context) {
    const result = await discoverStataInstallations({
        platform: 'win32',
        timeoutMs: WINDOWS_DISCOVERY_TIMEOUT_MS
    });
    if (!result.candidates.length) return undefined;

    const items = result.candidates.map((item, index) => ({
        label: getWindowsCandidateLabel(item),
        description: index === 0 ? msg('stataDiscoveryRecommended') : undefined,
        detail: item.executablePath,
        candidate: item
    }));
    items.push({
        label: msg('stataDiscoveryUseStataSetup'),
        stataCommandSetup: true
    });
    const selected = await vscode.window.showQuickPick(items, {
        title: SETUP_DIALOG_TITLE,
        placeHolder: msg('stataDiscoverySelectWindows'),
        ignoreFocusOut: true,
        matchOnDetail: true
    });
    if (!selected) return null;
    if (selected.stataCommandSetup) return promptForStataCommandSetup(context);
    const candidate = selected.candidate;

    await saveGlobalConfiguration('stataPathOnWindows', candidate.executablePath);
    return {
        platform: 'win32',
        executablePath: candidate.executablePath,
        candidate,
        discovery: result,
        autoDetected: true,
        source: 'detected'
    };
}

function getWindowsCandidateLabel(candidate) {
    const displayName = String(candidate.displayName || 'Stata')
        .replace(/Stata(?:Now)?\s*(\d{1,2})/i, 'Stata $1')
        .trim();
    const edition = String(candidate.edition || '').toUpperCase();
    return edition && !new RegExp(`\\b${edition}\\b`, 'i').test(displayName)
        ? `${displayName} ${edition}`
        : displayName;
}

async function discoverAndConfigureMac(context) {
    const result = await discoverStataInstallations({
        platform: 'darwin',
        timeoutMs: MAC_DISCOVERY_TIMEOUT_MS
    });
    const candidates = result.candidates.filter(item => item.edition);
    if (!candidates.length) return undefined;

    const items = candidates.map((item, index) => ({
        label: getMacCandidateLabel(item),
        description: index === 0 ? msg('stataDiscoveryRecommended') : undefined,
        detail: item.appPath,
        candidate: item
    }));
    items.push({
        label: msg('stataDiscoveryUseStataSetup'),
        stataCommandSetup: true
    });
    const selected = await vscode.window.showQuickPick(items, {
        title: SETUP_DIALOG_TITLE,
        placeHolder: msg('stataDiscoverySelectMac'),
        ignoreFocusOut: true,
        matchOnDetail: true
    });
    if (!selected) return null;
    if (selected.stataCommandSetup) return promptForStataCommandSetup(context);
    const candidate = selected.candidate;

    const version = `Stata${candidate.edition.toUpperCase()}`;
    await saveGlobalConfiguration('stataVersionOnMacOS', version);
    if (context) {
        await context.globalState.update('stataGuiAppPath', candidate.appPath);
        await context.globalState.update(
            'stataConsoleDylibPath',
            candidate.hasDylib ? candidate.dylibPath : undefined
        );
    }
    return {
        platform: 'darwin',
        version,
        candidate,
        discovery: result,
        autoDetected: true,
        source: 'detected'
    };
}

function getMacCandidateLabel(candidate) {
    const edition = String(candidate.edition || '').toUpperCase();
    const version = Number(candidate.version) || null;
    return ['Stata', version, edition].filter(Boolean).join(' ');
}

async function resolveEmptyConfiguration(context, promptOnFailure) {
    const platform = isWindows() ? 'win32' : (isMacOS() ? 'darwin' : null);
    if (!platform) return null;

    let detected = null;
    if (!discoveryAttempted[platform]) {
        discoveryAttempted[platform] = true;
        detected = platform === 'win32'
            ? await discoverAndConfigureWindows(context)
            : await discoverAndConfigureMac(context);
    }
    if (detected === null || detected || !promptOnFailure) return detected;
    return promptForStataCommandSetup(context);
}

function normalizeSignalEdition(flavor) {
    const match = String(flavor || '').match(/^(MP|SE|BE|IC)$/i);
    return match ? match[1].toLowerCase() : null;
}

function resolveWindowsSignalInstallation(signal) {
    const requestedEdition = normalizeSignalEdition(signal.flavor);
    if (!requestedEdition) return null;
    const editions = [requestedEdition, 'mp', 'se', 'be', 'ic']
        .filter((edition, index, values) => values.indexOf(edition) === index);
    const executableNames = [
        ...editions.flatMap(edition => [
            `Stata${edition.toUpperCase()}-64.exe`,
            `Stata${edition.toUpperCase()}.exe`
        ]),
        'Stata-64.exe',
        'Stata.exe'
    ];
    const rawPaths = [signal.sysdirStata, ...(signal.sysdirStataCandidates || [])]
        .map(value => stripSurroundingQuotes(String(value || '').trim()))
        .filter((value, index, values) => value && values.indexOf(value) === index);
    const candidates = rawPaths.flatMap(rawPath => {
        const windowsPath = rawPath.replace(/\//g, '\\');
        return path.win32.extname(windowsPath).toLowerCase() === '.exe'
            ? [windowsPath]
            : executableNames.map(name => path.win32.join(windowsPath, name));
    });
    const executablePath = candidates.find(candidate => !validateWindowsExecutablePath(candidate));
    if (!executablePath) return null;
    const editionMatch = path.win32.basename(executablePath).match(/^Stata(MP|SE|BE|IC)/i);
    const edition = editionMatch ? editionMatch[1].toLowerCase() : requestedEdition;
    return {
        platform: 'win32',
        executablePath,
        edition,
        autoDetected: false,
        source: 'stata-command'
    };
}

function extractMacAppPath(rawPath) {
    const normalized = path.normalize(rawPath);
    const appIndex = normalized.toLowerCase().indexOf('.app');
    return appIndex >= 0 ? normalized.slice(0, appIndex + 4) : null;
}

function resolveMacSignalInstallation(signal) {
    const requestedEdition = normalizeSignalEdition(signal.flavor);
    if (!requestedEdition) return null;
    const rawPath = stripSurroundingQuotes(String(signal.sysdirStata || '').trim());
    if (!rawPath) return null;
    const embeddedAppPath = extractMacAppPath(rawPath);
    const editions = [requestedEdition, 'mp', 'se', 'be', 'ic']
        .filter((edition, index, values) => values.indexOf(edition) === index);
    const candidates = [];
    if (embeddedAppPath) candidates.push({ appPath: embeddedAppPath, edition: requestedEdition });
    for (const edition of editions) {
        const appName = `Stata${edition.toUpperCase()}.app`;
        candidates.push({ appPath: path.join(rawPath, appName), edition });
        candidates.push({ appPath: path.join(path.dirname(rawPath), appName), edition });
    }
    const match = candidates.find(({ appPath: candidate, edition }) => {
        const executablePaths = [
            path.join(candidate, 'Contents', 'MacOS', `Stata${edition.toUpperCase()}`),
            path.join(candidate, 'Contents', 'MacOS', `stata-${edition}`)
        ];
        return fs.existsSync(candidate) && executablePaths.some(item => fs.existsSync(item));
    });
    if (!match) return null;
    const { appPath, edition } = match;
    const dylibPath = path.join(appPath, 'Contents', 'MacOS', `libstata-${edition}.dylib`);
    const candidate = {
        appName: path.basename(appPath, '.app'),
        appPath,
        edition,
        dylibPath,
        hasDylib: fs.existsSync(dylibPath),
        licensePath: path.join(path.dirname(appPath), 'stata.lic'),
        hasLicense: fs.existsSync(path.join(path.dirname(appPath), 'stata.lic'))
    };
    return {
        platform: 'darwin',
        version: `Stata${edition.toUpperCase()}`,
        candidate,
        edition,
        autoDetected: false,
        source: 'stata-command'
    };
}

async function configureFromStataSignal(context, signal) {
    const resolved = signal.platform === 'win32'
        ? resolveWindowsSignalInstallation(signal)
        : resolveMacSignalInstallation(signal);
    if (!resolved) {
        const error = new Error(msg('stataSetupSignalPathInvalid'));
        error.statusCode = 422;
        error.code = 'STATA_INSTALLATION_NOT_RESOLVED';
        throw error;
    }
    if (resolved.platform === 'win32') {
        await saveGlobalConfiguration('stataPathOnWindows', resolved.executablePath);
        return { ...resolved, resolvedPath: resolved.executablePath };
    }
    await saveGlobalConfiguration('stataVersionOnMacOS', resolved.version);
    await context.globalState.update('stataGuiAppPath', resolved.candidate.appPath);
    await context.globalState.update(
        'stataConsoleDylibPath',
        resolved.candidate.hasDylib ? resolved.candidate.dylibPath : undefined
    );
    return { ...resolved, resolvedPath: resolved.candidate.appPath };
}

async function ensureStataConfigured(context, options = {}) {
    const configured = getConfiguredResult();
    if (configured) return configured;

    if (resolutionPromise) return resolutionPromise;

    resolutionPromise = resolveEmptyConfiguration(context, options.promptOnFailure !== false)
        .finally(() => {
            resolutionPromise = null;
        });
    return resolutionPromise;
}

function resetStataDiscoveryState(platform = process.platform) {
    closeStataCommandSetupQuickPick();
    if (Object.prototype.hasOwnProperty.call(discoveryAttempted, platform)) {
        discoveryAttempted[platform] = false;
    }
    resolutionPromise = null;
}

module.exports = {
    MAC_DISCOVERY_TIMEOUT_MS,
    WINDOWS_DISCOVERY_TIMEOUT_MS,
    buildStataNetInstallCommand,
    closeStataCommandSetupQuickPick,
    configureFromStataSignal,
    ensureStataConfigured,
    promptForStataCommandSetup,
    resetStataDiscoveryState,
    resolveMacSignalInstallation,
    resolveWindowsSignalInstallation,
    validateWindowsExecutablePath
};
