const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const capability = require('../capability');
const config = require('../../utils/config');
const { isWindows, isMacOS, msg, stripSurroundingQuotes } = require('../../utils/common');
const { discoverStataInstallations, getInstallationSignals } = require('./stataDiscovery');
const { version: extensionVersion } = require('../../../package.json');
const {
    MAC_DISCOVERY_TIMEOUT_MS,
    ensureStataConfigured,
    resetStataDiscoveryState
} = require('./stataInstallationResolver');

const SETUP_NOTICE_STATE_KEY = 'stata-all-in-one.stataSetupNoticeState';
const SETUP_DIALOG_TITLE = `✨ Stata All in One (${extensionVersion})`;
const STATA_DEALER_URL = 'http://xhslink.com/o/QYWdYfrEhy';

let startupPromise = null;
let startupCompleted = false;
let setupPromise = null;

function isFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

function isDirectory(directoryPath) {
    try {
        return fs.statSync(directoryPath).isDirectory();
    } catch {
        return false;
    }
}

function macEditionFromVersion(version) {
    const match = String(version || '').match(/^Stata(MP|SE|BE|IC)$/i);
    return match ? match[1].toLowerCase() : null;
}

function buildMacCandidate(appPath, edition) {
    if (!appPath || !edition) return null;
    const macOSDirectory = path.join(appPath, 'Contents', 'MacOS');
    const executablePaths = [
        path.join(macOSDirectory, `Stata${edition.toUpperCase()}`),
        path.join(macOSDirectory, `stata-${edition}`)
    ];
    const dylibPath = path.join(appPath, 'Contents', 'MacOS', `libstata-${edition}.dylib`);
    const licensePath = path.join(path.dirname(appPath), 'stata.lic');
    return {
        appName: path.basename(appPath, '.app'),
        appPath,
        edition,
        executablePaths,
        hasExecutable: executablePaths.some(isFile),
        dylibPath,
        hasDylib: isFile(dylibPath),
        licensePath,
        hasLicense: isFile(licensePath)
    };
}

async function findConfiguredMacCandidate(context, resolvedInstallation) {
    const edition = macEditionFromVersion(resolvedInstallation.version);
    if (!edition) return null;
    const appMatchesEdition = appPath => {
        const match = path.basename(String(appPath || ''), '.app').match(/^Stata(MP|SE|BE|IC)$/i);
        return Boolean(match && match[1].toLowerCase() === edition);
    };

    const resolvedCandidate = resolvedInstallation.candidate;
    if (
        resolvedCandidate
        && appMatchesEdition(resolvedCandidate.appPath)
        && isDirectory(resolvedCandidate.appPath)
    ) {
        return buildMacCandidate(resolvedCandidate.appPath, edition);
    }

    const cachedAppPath = context && context.globalState.get('stataGuiAppPath');
    if (cachedAppPath && appMatchesEdition(cachedAppPath) && isDirectory(cachedAppPath)) {
        return buildMacCandidate(cachedAppPath, edition);
    }

    const discovery = await discoverStataInstallations({
        platform: 'darwin',
        timeoutMs: MAC_DISCOVERY_TIMEOUT_MS
    });
    const candidate = discovery.candidates.find(item => item.edition === edition);
    return candidate ? buildMacCandidate(candidate.appPath, edition) : null;
}

async function inspectInstallation(context, resolvedInstallation) {
    if (!resolvedInstallation) {
        return {
            platform: isWindows() ? 'win32' : (isMacOS() ? 'darwin' : process.platform),
            installationAvailable: false,
            installationPath: '',
            libraryAvailable: false,
            licenseAvailable: false
        };
    }

    if (resolvedInstallation.platform === 'win32' || isWindows()) {
        const executablePath = stripSurroundingQuotes(
            String(resolvedInstallation.executablePath || '').trim()
        );
        const editionMatch = path.basename(executablePath).match(/^Stata(MP|SE|BE|IC)(?:-64)?\.exe$/i);
        const edition = editionMatch ? editionMatch[1].toLowerCase() : null;
        const recognizedExecutable = /^Stata(?:MP|SE|BE|IC)?(?:-64)?\.exe$/i.test(
            path.basename(executablePath)
        );
        const signals = getInstallationSignals(executablePath, edition);
        return {
            platform: 'win32',
            resolvedInstallation,
            installationAvailable: recognizedExecutable && isFile(executablePath),
            installationPath: executablePath,
            edition,
            libraryKind: 'DLL',
            libraryAvailable: signals.hasMatchingDll,
            libraryPath: signals.dllPath,
            licenseAvailable: signals.hasLicense,
            licensePath: path.join(path.dirname(executablePath), 'stata.lic')
        };
    }

    const candidate = await findConfiguredMacCandidate(context, resolvedInstallation);
    if (!candidate) {
        return {
            platform: 'darwin',
            resolvedInstallation,
            installationAvailable: false,
            installationPath: '',
            edition: macEditionFromVersion(resolvedInstallation.version),
            libraryKind: 'dylib',
            libraryAvailable: false,
            licenseAvailable: false
        };
    }

    if (context) {
        await context.globalState.update('stataGuiAppPath', candidate.appPath);
        await context.globalState.update(
            'stataConsoleDylibPath',
            candidate.hasDylib ? candidate.dylibPath : undefined
        );
    }

    return {
        platform: 'darwin',
        resolvedInstallation: {
            ...resolvedInstallation,
            candidate
        },
        installationAvailable: isDirectory(candidate.appPath) && candidate.hasExecutable,
        installationPath: candidate.appPath,
        edition: candidate.edition,
        libraryKind: 'dylib',
        libraryAvailable: candidate.hasDylib,
        libraryPath: candidate.dylibPath,
        licenseAvailable: candidate.hasLicense,
        licensePath: candidate.licensePath
    };
}

function collectIssueCodes(report, consoleResult = null) {
    const issues = [];
    if (!report.installationAvailable) issues.push('INSTALLATION_NOT_FOUND');
    if (report.installationAvailable && !report.libraryAvailable) issues.push('LIBRARY_NOT_FOUND');
    if (report.installationAvailable && !report.licenseAvailable) issues.push('LICENSE_NOT_FOUND');
    if (
        report.installationAvailable
        && report.libraryAvailable
        && report.licenseAvailable
        && consoleResult
        && !consoleResult.success
    ) {
        issues.push(consoleResult.failCode || 'SESSION_INIT_FAILED');
    }
    return [...new Set(issues)];
}

function buildSetupSignature(report, issueCodes) {
    const normalizePath = value => {
        const normalized = path.normalize(String(value || ''));
        return report.platform === 'win32' ? normalized.toLowerCase() : normalized;
    };
    return JSON.stringify([
        report.platform || '',
        normalizePath(report.installationPath),
        report.edition || '',
        normalizePath(report.libraryPath),
        normalizePath(report.licensePath),
        report.installationAvailable ? 1 : 0,
        report.libraryAvailable ? 1 : 0,
        report.licenseAvailable ? 1 : 0,
        ...issueCodes
    ]);
}

async function updateRunMode(runMode) {
    await vscode.workspace.getConfiguration('stata-all-in-one').update(
        'runMode',
        runMode,
        vscode.ConfigurationTarget.Global
    );
}

async function saveAcknowledgement(context, signature, outcome) {
    if (!context) return;
    await context.globalState.update(SETUP_NOTICE_STATE_KEY, {
        signature,
        outcome,
        acknowledgedAt: Date.now()
    });
}

function wasAcknowledged(context, signature) {
    if (!context) return false;
    const state = context.globalState.get(SETUP_NOTICE_STATE_KEY);
    return Boolean(state && state.signature === signature && state.acknowledgedAt);
}

function shouldForceSetupNotice(resolvedInstallation, forceNotice) {
    if (forceNotice) return true;
    return Boolean(resolvedInstallation && resolvedInstallation.source === 'detected');
}

function failureIssueMessages(report, issueCodes, consoleResult) {
    const messages = [];
    if (issueCodes.includes('LIBRARY_NOT_FOUND')) {
        messages.push(report.platform === 'darwin'
            ? msg('stataSetupMissingDylib')
            : msg('stataSetupMissingDll'));
    }
    if (issueCodes.includes('LICENSE_NOT_FOUND')) {
        messages.push(msg('stataSetupMissingLicense'));
    }
    if (issueCodes.includes('NATIVE_NOT_LOADED')) {
        messages.push(msg('stataSetupNativeUnavailable'));
    }
    if (issueCodes.some(code => ![
        'INSTALLATION_NOT_FOUND',
        'LIBRARY_NOT_FOUND',
        'LICENSE_NOT_FOUND',
        'NATIVE_NOT_LOADED'
    ].includes(code))) {
        messages.push(msg('stataSetupSessionFailed', {
            reason: (consoleResult && (consoleResult.reason || consoleResult.error)) || ''
        }));
    }
    return messages;
}

function withStataSignalPrefix(detail, signalReceived) {
    if (!signalReceived) return detail;
    return `${msg('stataSetupSignalReceived')}\n\n${detail}`;
}

async function showMissingInstallationDialog() {
    const reconfigure = msg('stataSetupReconfigure');
    const confirm = msg('stataSetupConfirm');
    while (true) {
        const choice = await vscode.window.showWarningMessage(
            SETUP_DIALOG_TITLE,
            { modal: true, detail: msg('stataSetupInstallationMissing') },
            reconfigure,
            confirm
        );
        if (choice === reconfigure || choice === confirm) {
            return { reconfigure: choice === reconfigure, acknowledged: choice === confirm };
        }
    }
}

async function showSuccessDialog(context, report, signature, forceNotice, signalReceived = false) {
    const acknowledged = !forceNotice && wasAcknowledged(context, signature);
    if (acknowledged) {
        return { acknowledged: true, action: 'previous' };
    }

    const currentRunMode = config.getRunMode();
    if (currentRunMode === config.RUN_MODES.externalApp) {
        const useEmbedded = msg('stataSetupUseEmbedded');
        const keepExternal = msg('stataSetupKeepExternal');
        while (true) {
            const choice = await vscode.window.showInformationMessage(
                SETUP_DIALOG_TITLE,
                {
                    modal: true,
                    detail: withStataSignalPrefix(
                        msg('stataSetupSuccessExternalMode', {
                            stataPath: report.installationPath
                        }),
                        signalReceived
                    )
                },
                useEmbedded,
                keepExternal
            );
            if (choice === useEmbedded) {
                await updateRunMode(config.RUN_MODES.embeddedConsole);
                await saveAcknowledgement(context, signature, 'success');
                return { acknowledged: true, action: 'embedded' };
            }
            if (choice === keepExternal) {
                await saveAcknowledgement(context, signature, 'success');
                return { acknowledged: true, action: 'external' };
            }
        }
    }

    const confirm = msg('stataSetupConfirm');
    const switchExternal = msg('stataSetupSwitchExternal');
    while (true) {
        const choice = await vscode.window.showInformationMessage(
            SETUP_DIALOG_TITLE,
            {
                modal: true,
                detail: withStataSignalPrefix(
                    msg('stataSetupSuccess', { stataPath: report.installationPath }),
                    signalReceived
                )
            },
            confirm,
            switchExternal
        );
        if (choice === switchExternal) {
            await updateRunMode(config.RUN_MODES.externalApp);
            await saveAcknowledgement(context, signature, 'success');
            return { acknowledged: true, action: 'external' };
        }
        if (choice === confirm) {
            await saveAcknowledgement(context, signature, 'success');
            return { acknowledged: true, action: 'embedded' };
        }
    }
}

async function showGenuineStataDialog() {
    const visitDealer = msg('stataSetupVisitDealer');
    const confirm = msg('stataSetupConfirm');
    const choice = await vscode.window.showInformationMessage(
        SETUP_DIALOG_TITLE,
        { modal: true, detail: msg('stataSetupGenuineInfo') },
        visitDealer,
        confirm
    );
    if (choice === visitDealer) {
        await vscode.env.openExternal(vscode.Uri.parse(STATA_DEALER_URL));
    }
}

async function promptFailureDialog(report, issueCodes, consoleResult, signalReceived = false) {
    const issueMessages = failureIssueMessages(report, issueCodes, consoleResult);
    const bulletList = issueMessages.map(message => `• ${message}`).join('\n');
    const message = [
        msg('stataSetupConsoleFailure', { stataPath: report.installationPath }),
        bulletList,
        msg('stataSetupExternalAvailable')
    ].filter(Boolean).join('\n\n');
    const confirmSwitch = msg('stataSetupConfirmSwitchExternal');
    const purchaseGenuine = msg('stataSetupPurchaseGenuine');
    const actions = issueCodes.includes('LICENSE_NOT_FOUND')
        ? [confirmSwitch, purchaseGenuine]
        : [confirmSwitch];
    while (true) {
        const choice = await vscode.window.showInformationMessage(
            SETUP_DIALOG_TITLE,
            { modal: true, detail: withStataSignalPrefix(message, signalReceived) },
            ...actions
        );
        if (choice === purchaseGenuine && issueCodes.includes('LICENSE_NOT_FOUND')) {
            await showGenuineStataDialog();
            continue;
        }
        if (choice === confirmSwitch) break;
    }
}

async function showFailureDialog(
    context,
    report,
    issueCodes,
    consoleResult,
    signature,
    forceNotice,
    signalReceived = false
) {
    if (!forceNotice && wasAcknowledged(context, signature)) {
        await updateRunMode(config.RUN_MODES.externalApp);
        return { acknowledged: true, action: 'external' };
    }

    await promptFailureDialog(report, issueCodes, consoleResult, signalReceived);

    await updateRunMode(config.RUN_MODES.externalApp);
    await saveAcknowledgement(context, signature, 'failure');
    return { acknowledged: true, action: 'external' };
}

async function showDebugLicenseFailureDialog() {
    const installationPath = isWindows()
        ? 'C:\\Program Files\\Stata19\\StataMP-64.exe'
        : '/Applications/StataMP.app';
    await promptFailureDialog({
        platform: isWindows() ? 'win32' : 'darwin',
        installationPath
    }, ['LICENSE_NOT_FOUND'], { success: false, failCode: 'STATIC_REQUIREMENTS_MISSING' });
    await updateRunMode(config.RUN_MODES.externalApp);
}

async function clearConfiguredInstallation(context) {
    const extensionConfig = vscode.workspace.getConfiguration('stata-all-in-one');
    const key = isWindows() ? 'stataPathOnWindows' : 'stataVersionOnMacOS';
    const inspected = extensionConfig.inspect(key);
    if (inspected && inspected.workspaceFolderValue !== undefined) {
        await extensionConfig.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    }
    if (inspected && inspected.workspaceValue !== undefined) {
        await extensionConfig.update(key, undefined, vscode.ConfigurationTarget.Workspace);
    }
    await extensionConfig.update(key, '', vscode.ConfigurationTarget.Global);
    if (isMacOS() && context) {
        await context.globalState.update('stataGuiAppPath', undefined);
        await context.globalState.update('stataConsoleDylibPath', undefined);
    }
}

async function initializeConsole(context, report, consoleInitializer = null) {
    if (!report.installationAvailable || !report.libraryAvailable || !report.licenseAvailable) {
        return { success: false, failCode: 'STATIC_REQUIREMENTS_MISSING' };
    }
    try {
        if (context) {
            await context.globalState.update('stata-all-in-one.consoleLicenseDialogSuppressed', undefined);
            await context.globalState.update('stata-all-in-one.consoleLicenseDialogNextReminder', undefined);
        }
        if (consoleInitializer) return await consoleInitializer(context, report);
        const platformModule = report.platform === 'win32'
            ? require('./embeddedConsole/windows')
            : require('./embeddedConsole/mac');
        return await platformModule.ensureConsoleSession(context);
    } catch (error) {
        return {
            success: false,
            failCode: 'SESSION_INIT_FAILED',
            reason: error.message,
            error: error.message
        };
    }
}

async function performSetup(context, options = {}) {
    let resolvedInstallation = await ensureStataConfigured(context, { promptOnFailure: true });

    while (true) {
        if (resolvedInstallation && resolvedInstallation.source === 'stata-command-pending') {
            await capability.setCapabilityState(context, 'unverified');
            return {
                ...resolvedInstallation,
                consoleAvailable: false,
                installationAvailable: false,
                acknowledged: true,
                action: 'stata-command-pending',
                canProceed: false
            };
        }
        const report = await inspectInstallation(context, resolvedInstallation);
        if (report.installationAvailable) {
            // External App is an explicit execution preference. Keep locating
            // and validating the Stata application, but do not initialize or
            // promote the Embedded Console when the user selected this mode.
            if (
                config.getRunMode() === config.RUN_MODES.externalApp
                && options.validateConsole !== true
            ) {
                await capability.setCapabilityState(context, 'external');
                return {
                    ...report.resolvedInstallation,
                    report,
                    consoleAvailable: false,
                    installationAvailable: true,
                    acknowledged: true,
                    action: 'external',
                    canProceed: true,
                    consoleCheckSkipped: true
                };
            }

            const consoleResult = options.consoleResult || await initializeConsole(
                context,
                report,
                options.consoleInitializer
            );
            const issueCodes = collectIssueCodes(report, consoleResult);
            const signature = buildSetupSignature(report, issueCodes);
            const forceNotice = shouldForceSetupNotice(
                resolvedInstallation,
                options.forceNotice === true
            );

            if (!issueCodes.length && consoleResult.success) {
                const notice = forceNotice
                    ? await showSuccessDialog(
                        context,
                        report,
                        signature,
                        true,
                        options.signalReceived === true
                    )
                    : { acknowledged: true, action: 'silent' };
                if (!forceNotice) {
                    await saveAcknowledgement(context, signature, 'success');
                }
                await capability.setCapabilityState(context, 'console');
                return {
                    ...report.resolvedInstallation,
                    report,
                    consoleResult,
                    consoleAvailable: true,
                    installationAvailable: true,
                    acknowledged: notice.acknowledged,
                    action: notice.action,
                    canProceed: notice.acknowledged
                };
            }

            const notice = await showFailureDialog(
                context,
                report,
                issueCodes,
                consoleResult,
                signature,
                forceNotice,
                options.signalReceived === true
            );
            await capability.setCapabilityState(context, 'external');
            return {
                ...report.resolvedInstallation,
                report,
                consoleResult,
                issueCodes,
                consoleAvailable: false,
                installationAvailable: true,
                acknowledged: notice.acknowledged,
                action: notice.action,
                canProceed: notice.acknowledged && notice.action === 'external'
            };
        }

        const missingChoice = await showMissingInstallationDialog();
        if (!missingChoice.reconfigure) {
            await capability.setCapabilityState(context, 'external');
            return {
                report,
                consoleAvailable: false,
                installationAvailable: false,
                acknowledged: missingChoice.acknowledged,
                action: missingChoice.acknowledged ? 'confirmed' : 'dismissed',
                canProceed: false
            };
        }

        if (resolvedInstallation) {
            await clearConfiguredInstallation(context);
            resolvedInstallation = null;
        }
        resetStataDiscoveryState(isWindows() ? 'win32' : 'darwin');
        resolvedInstallation = await ensureStataConfigured(context, { promptOnFailure: true });
    }
}

async function ensureStataSetup(context, options = {}) {
    if (startupPromise && !startupCompleted && options.waitForStartup !== false) {
        return startupPromise;
    }
    if (setupPromise) return setupPromise;

    setupPromise = performSetup(context, options).finally(() => {
        setupPromise = null;
    });
    return setupPromise;
}

function startStartupStataSetup(context, prerequisites = Promise.resolve(), options = {}) {
    if (startupPromise) return startupPromise;
    startupPromise = Promise.resolve()
        .then(() => capability.setCapabilityState(context, 'unverified'))
        .then(() => prerequisites)
        .then(() => ensureStataSetup(context, {
            ...options,
            waitForStartup: false
        }))
        .catch(error => {
            console.error('Stata All in One: Startup Stata setup failed:', error.message);
            return null;
        })
        .finally(() => {
            startupCompleted = true;
        });
    return startupPromise;
}

async function resetStataSetupState(context) {
    startupPromise = null;
    startupCompleted = false;
    setupPromise = null;
    if (context) {
        await context.globalState.update(SETUP_NOTICE_STATE_KEY, undefined);
    }
}

module.exports = {
    SETUP_DIALOG_TITLE,
    SETUP_NOTICE_STATE_KEY,
    buildSetupSignature,
    collectIssueCodes,
    ensureStataSetup,
    inspectInstallation,
    resetStataSetupState,
    showDebugLicenseFailureDialog,
    startStartupStataSetup,
    withStataSignalPrefix
};
