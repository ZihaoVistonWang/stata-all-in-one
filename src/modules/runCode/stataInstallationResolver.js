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

const WINDOWS_DISCOVERY_TIMEOUT_MS = DISCOVERY_TIMEOUT_MS.win32;
const MAC_DISCOVERY_TIMEOUT_MS = DISCOVERY_TIMEOUT_MS.darwin;
const MAC_VERSION_CHOICES = ['StataMP', 'StataSE', 'StataBE', 'StataIC'];

let resolutionPromise = null;
const discoveryAttempted = { win32: false, darwin: false };

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

async function promptForWindowsPath() {
    const userPath = await vscode.window.showInputBox({
        prompt: msg('promptWinPath'),
        placeHolder: msg('promptWinPathPlaceholder'),
        ignoreFocusOut: true,
        validateInput: validateWindowsExecutablePath
    });
    if (!userPath) return null;

    const trimmedPath = stripSurroundingQuotes(userPath.trim());
    if (validateWindowsExecutablePath(trimmedPath)) return null;
    await saveGlobalConfiguration('stataPathOnWindows', trimmedPath);
    return {
        platform: 'win32',
        executablePath: stripSurroundingQuotes(trimmedPath),
        autoDetected: false,
        source: 'manual'
    };
}

async function promptForMacVersion(context) {
    const selectedVersion = await vscode.window.showQuickPick(MAC_VERSION_CHOICES, {
        placeHolder: msg('promptMacVersion'),
        ignoreFocusOut: true
    });
    if (!selectedVersion) return null;

    await saveGlobalConfiguration('stataVersionOnMacOS', selectedVersion);
    if (context) {
        await context.globalState.update('stataGuiAppPath', undefined);
        await context.globalState.update('stataConsoleDylibPath', undefined);
    }
    return { platform: 'darwin', version: selectedVersion, autoDetected: false, source: 'manual' };
}

async function discoverAndConfigureWindows() {
    const result = await discoverStataInstallations({
        platform: 'win32',
        timeoutMs: WINDOWS_DISCOVERY_TIMEOUT_MS
    });
    const candidate = result.candidates[0];
    if (!candidate) return null;

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

async function discoverAndConfigureMac(context) {
    const result = await discoverStataInstallations({
        platform: 'darwin',
        timeoutMs: MAC_DISCOVERY_TIMEOUT_MS
    });
    const candidate = result.candidates.find(item => item.edition);
    if (!candidate) return null;

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

    if (resolutionPromise) return resolutionPromise;

    resolutionPromise = resolveEmptyConfiguration(context, options.promptOnFailure !== false)
        .finally(() => {
            resolutionPromise = null;
        });
    return resolutionPromise;
}

function resetStataDiscoveryState(platform = process.platform) {
    if (Object.prototype.hasOwnProperty.call(discoveryAttempted, platform)) {
        discoveryAttempted[platform] = false;
    }
    resolutionPromise = null;
}

module.exports = {
    MAC_DISCOVERY_TIMEOUT_MS,
    MAC_VERSION_CHOICES,
    WINDOWS_DISCOVERY_TIMEOUT_MS,
    ensureStataConfigured,
    resetStataDiscoveryState,
    validateWindowsExecutablePath
};
