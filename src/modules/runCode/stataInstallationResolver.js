const vscode = require('vscode');
const config = require('../../utils/config');
const {
    isWindows,
    isMacOS,
    msg,
    showInfo,
    stripSurroundingQuotes
} = require('../../utils/common');
const { discoverStataInstallationsFromRegistry } = require('./windowsStataDiscovery');
const { discoverMacStataInstallations } = require('./macStataDiscovery');

const DISCOVERY_TIMEOUT_MS = 3000;
const MAC_VERSION_CHOICES = ['StataMP', 'StataSE', 'StataBE', 'StataIC'];

let startupPromise = null;
let startupCompleted = false;
let resolutionPromise = null;
const discoveryAttempted = { win32: false, darwin: false };

function getConfiguredResult() {
    if (isWindows()) {
        const rawPath = config.getStataPathOnWindows();
        const executablePath = stripSurroundingQuotes(String(rawPath || '').trim());
        return executablePath ? { platform: 'win32', executablePath, autoDetected: false } : null;
    }
    if (isMacOS()) {
        const version = String(config.getStataVersion() || '').trim();
        return version ? { platform: 'darwin', version, autoDetected: false } : null;
    }
    return null;
}

async function promptForWindowsPath() {
    const userPath = await vscode.window.showInputBox({
        prompt: msg('promptWinPath'),
        placeHolder: msg('promptWinPathPlaceholder'),
        ignoreFocusOut: true
    });
    if (!userPath) return null;

    const trimmedPath = userPath.trim();
    await vscode.workspace.getConfiguration('stata-all-in-one').update(
        'stataPathOnWindows',
        trimmedPath,
        vscode.ConfigurationTarget.Global
    );
    showInfo(msg('configSaved'));
    return {
        platform: 'win32',
        executablePath: stripSurroundingQuotes(trimmedPath),
        autoDetected: false
    };
}

async function promptForMacVersion(context) {
    const selectedVersion = await vscode.window.showQuickPick(MAC_VERSION_CHOICES, {
        placeHolder: msg('promptMacVersion'),
        ignoreFocusOut: true
    });
    if (!selectedVersion) return null;

    await vscode.workspace.getConfiguration('stata-all-in-one').update(
        'stataVersionOnMacOS',
        selectedVersion,
        vscode.ConfigurationTarget.Global
    );
    if (context) {
        await context.globalState.update('stataGuiAppPath', undefined);
        await context.globalState.update('stataConsoleDylibPath', undefined);
    }
    showInfo(msg('configSaved'));
    return { platform: 'darwin', version: selectedVersion, autoDetected: false };
}

async function discoverAndConfigureWindows() {
    const result = await discoverStataInstallationsFromRegistry({ timeoutMs: DISCOVERY_TIMEOUT_MS });
    const candidate = result.candidates[0];
    if (!candidate) return null;

    await vscode.workspace.getConfiguration('stata-all-in-one').update(
        'stataPathOnWindows',
        candidate.executablePath,
        vscode.ConfigurationTarget.Global
    );
    showInfo(msg('autoDetectedStata', {
        appName: candidate.displayName,
        appPath: candidate.executablePath
    }));
    return {
        platform: 'win32',
        executablePath: candidate.executablePath,
        candidate,
        discovery: result,
        autoDetected: true
    };
}

async function discoverAndConfigureMac(context) {
    const result = await discoverMacStataInstallations({ timeoutMs: DISCOVERY_TIMEOUT_MS });
    const candidate = result.candidates.find(item => item.edition);
    if (!candidate) return null;

    const version = `Stata${candidate.edition.toUpperCase()}`;
    await vscode.workspace.getConfiguration('stata-all-in-one').update(
        'stataVersionOnMacOS',
        version,
        vscode.ConfigurationTarget.Global
    );
    if (context) {
        await context.globalState.update('stataGuiAppPath', candidate.appPath);
        await context.globalState.update(
            'stataConsoleDylibPath',
            candidate.hasDylib ? candidate.dylibPath : undefined
        );
    }
    showInfo(msg('autoDetectedStata', { appName: candidate.appName, appPath: candidate.appPath }));
    return {
        platform: 'darwin',
        version,
        candidate,
        discovery: result,
        autoDetected: true
    };
}

async function resolveEmptyConfiguration(context, promptOnFailure) {
    const platform = isWindows() ? 'win32' : (isMacOS() ? 'darwin' : null);
    if (!platform) return null;

    let detected = null;
    if (!discoveryAttempted[platform]) {
        discoveryAttempted[platform] = true;
        detected = platform === 'win32'
            ? await discoverAndConfigureWindows()
            : await discoverAndConfigureMac(context);
    }
    if (detected || !promptOnFailure) return detected;
    return platform === 'win32' ? promptForWindowsPath() : promptForMacVersion(context);
}

async function ensureStataConfigured(context, options = {}) {
    const configured = getConfiguredResult();
    if (configured) return configured;

    if (startupPromise && !startupCompleted && options.waitForStartup !== false) {
        return startupPromise;
    }
    if (resolutionPromise) return resolutionPromise;

    resolutionPromise = resolveEmptyConfiguration(context, options.promptOnFailure !== false)
        .finally(() => {
            resolutionPromise = null;
        });
    return resolutionPromise;
}

function startStartupStataDetection(context, prerequisites = Promise.resolve()) {
    if (startupPromise) return startupPromise;
    startupPromise = Promise.resolve(prerequisites)
        .then(() => ensureStataConfigured(context, {
            promptOnFailure: true,
            waitForStartup: false
        }))
        .catch(error => {
            console.error('Stata All in One: Startup Stata discovery failed:', error.message);
            return null;
        })
        .finally(() => {
            startupCompleted = true;
        });
    return startupPromise;
}

function resetStataDiscoveryState(platform = process.platform) {
    if (Object.prototype.hasOwnProperty.call(discoveryAttempted, platform)) {
        discoveryAttempted[platform] = false;
    }
    startupPromise = null;
    startupCompleted = false;
    resolutionPromise = null;
}

module.exports = {
    DISCOVERY_TIMEOUT_MS,
    MAC_VERSION_CHOICES,
    ensureStataConfigured,
    startStartupStataDetection,
    resetStataDiscoveryState
};
