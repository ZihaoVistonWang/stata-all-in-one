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
    discoverStataInstallations,
    editionFromAppName
} = require('./stataDiscovery');
const { version: extensionVersion } = require('../../../package.json');

const WINDOWS_DISCOVERY_TIMEOUT_MS = DISCOVERY_TIMEOUT_MS.win32;
const MAC_DISCOVERY_TIMEOUT_MS = DISCOVERY_TIMEOUT_MS.darwin;
const SETUP_DIALOG_TITLE = `✨ Stata All in One (${extensionVersion})`;

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

async function discoverAndConfigureWindows() {
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
        label: msg('stataDiscoveryManualExePath'),
        manualPath: true
    });
    const selected = await vscode.window.showQuickPick(items, {
        title: SETUP_DIALOG_TITLE,
        placeHolder: msg('stataDiscoverySelectWindows'),
        ignoreFocusOut: true,
        matchOnDetail: true
    });
    if (!selected) return null;
    if (selected.manualPath) return promptForWindowsPath();
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
        label: msg('stataDiscoveryManualMacApp'),
        manualApp: true
    });
    const selected = await vscode.window.showQuickPick(items, {
        title: SETUP_DIALOG_TITLE,
        placeHolder: msg('stataDiscoverySelectMac'),
        ignoreFocusOut: true,
        matchOnDetail: true
    });
    if (!selected) return null;
    if (selected.manualApp) return promptForMacApp(context);
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

async function promptForMacApp(context) {
    const selectedUris = await vscode.window.showOpenDialog({
        title: SETUP_DIALOG_TITLE,
        defaultUri: vscode.Uri.file('/Applications'),
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: msg('stataDiscoveryManualMacApp')
    });
    if (!selectedUris || !selectedUris.length) return null;

    const appPath = selectedUris[0].fsPath;
    const appName = path.basename(appPath, '.app');
    const edition = editionFromAppName(appName);
    if (!edition) {
        await vscode.window.showErrorMessage(msg('stataDiscoveryMacAppInvalid'), {
            modal: true,
            title: SETUP_DIALOG_TITLE
        });
        return null;
    }

    const dylibPath = path.join(appPath, 'Contents', 'MacOS', `libstata-${edition}.dylib`);
    const candidate = {
        appName,
        appPath,
        edition,
        dylibPath,
        hasDylib: fs.existsSync(dylibPath),
        licensePath: path.join(path.dirname(appPath), 'stata.lic'),
        hasLicense: fs.existsSync(path.join(path.dirname(appPath), 'stata.lic'))
    };
    const version = `Stata${edition.toUpperCase()}`;
    await saveGlobalConfiguration('stataVersionOnMacOS', version);
    if (context) {
        await context.globalState.update('stataGuiAppPath', appPath);
        await context.globalState.update(
            'stataConsoleDylibPath',
            candidate.hasDylib ? dylibPath : undefined
        );
    }
    return {
        platform: 'darwin',
        version,
        candidate,
        autoDetected: false,
        source: 'manual'
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
    if (detected === null || detected || !promptOnFailure) return detected;
    return platform === 'win32' ? promptForWindowsPath() : promptForMacApp(context);
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
    WINDOWS_DISCOVERY_TIMEOUT_MS,
    ensureStataConfigured,
    resetStataDiscoveryState,
    validateWindowsExecutablePath
};
