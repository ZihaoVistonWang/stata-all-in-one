/**
 * Linux Embedded Console Runner
 *
 * Owns everything that is specific to Stata for Linux: locating the shared
 * library (libstata-mp.so / libstata-se.so / libstata.so), checking stata.lic
 * and initialising the native session. Executing code is identical on every
 * platform, so it is delegated to the shared runner with this module's
 * session bootstrap (see `runOnLinuxEmbeddedConsole`).
 *
 * External App mode does not exist on Linux: Stata for Linux is typically used
 * on headless servers (for example through VS Code Remote-SSH).
 */

const fs = require('fs');
const path = require('path');

const session = require('./session');
const config = require('../../../utils/config');
const { showInfo, showError, msg } = require('../../../utils/common');
const { ensureStataConfigured } = require('../stataInstallationResolver');
const {
    inspectLinuxInstallation,
    resolveLinuxInstallationPath,
    selectLinuxCandidate
} = require('../stataDiscovery');
const {
    createConsoleRunner,
    showConsoleLicenseDialog,
    stopConsoleExecution,
    getConsoleSession,
    forceShutdownConsoleSession
} = require('./runner');

const LIBRARY_PATH_KEY = 'stataConsoleLibraryPath';
const LICENSE_DIALOG_SUPPRESSED_KEY = 'stata-all-in-one.consoleLicenseDialogSuppressed';
const LICENSE_DIALOG_REMIND_KEY = 'stata-all-in-one.consoleLicenseDialogNextReminder';

/**
 * Find the Stata shared library to load.
 *
 * Resolution order:
 *   1. the candidate attached to the resolved installation (discovery or
 *      `saio setup`);
 *   2. the `stataPathOnLinux` setting: an installation directory, or a library /
 *      executable path inside it that pins the edition;
 *   3. the library remembered from the previous session, when it still exists
 *      in that directory.
 * Within one directory MP is preferred over SE over BE.
 *
 * @param {object|null} resolvedInstallation - from ensureStataConfigured()
 * @param {string|null} savedPath - library path cached in globalState
 * @returns {{
 *   path: string|null,
 *   edition: 'mp'|'se'|'be'|'ic'|null,
 *   directory: string|null,
 *   candidate: object|null
 * }}
 */
function findStataLibrary(resolvedInstallation, savedPath = null) {
    const resolvedCandidate = resolvedInstallation && resolvedInstallation.candidate;
    const configured = resolveLinuxInstallationPath(
        (resolvedInstallation && resolvedInstallation.installationPath) || config.getStataPathOnLinux()
    );
    const directory = (resolvedCandidate && resolvedCandidate.installDirectory)
        || (configured && configured.installDirectory)
        || null;
    if (!directory) {
        return { path: null, edition: null, directory: null, candidate: null };
    }

    const pinnedEdition = configured ? configured.edition : null;
    const candidate = selectLinuxCandidate(inspectLinuxInstallation(directory), {
        edition: pinnedEdition,
        preferredLibraryPath: (resolvedCandidate && resolvedCandidate.libraryPath)
            || (pinnedEdition ? null : savedPath)
    });
    return {
        path: candidate ? candidate.libraryPath : null,
        edition: candidate ? candidate.edition : null,
        directory,
        candidate
    };
}

/**
 * Make sure a Stata session is running, starting one when needed.
 * Mirrors ensureConsoleSession() in mac.js / windows.js.
 * @param {vscode.ExtensionContext} context
 * @returns {Promise<{success: boolean, fromExisting?: boolean, edition?: string|null,
 *   failCode?: string, reason?: string, noLicense?: boolean}>}
 */
async function ensureConsoleSession(context) {
    // If session was marked stale (console panel closed), shut it down first.
    // This deferred shutdown is safe because no execution is running right now.
    if (session.isSessionStale()) {
        session.clearStaleSession();
    }

    if (session.hasActiveConsoleSession()) {
        return {
            success: true,
            fromExisting: true
        };
    }

    const resolvedInstallation = await ensureStataConfigured(context, { promptOnFailure: true });
    if (!resolvedInstallation) {
        return {
            success: false,
            failCode: 'INSTALLATION_NOT_CONFIGURED',
            reason: msg('missingLinuxPath')
        };
    }

    const savedPath = context ? context.globalState.get(LIBRARY_PATH_KEY) : null;
    const libraryInfo = findStataLibrary(resolvedInstallation, savedPath);
    if (!libraryInfo.path) {
        console.error('Stata All in One: No Stata shared library found in', libraryInfo.directory);
        return {
            success: false,
            failCode: 'LIBRARY_NOT_FOUND',
            reason: libraryInfo.directory
                ? msg('linuxLibraryNotFound', { directory: libraryInfo.directory })
                : msg('missingLinuxPath')
        };
    }

    if (context && savedPath !== libraryInfo.path) {
        await context.globalState.update(LIBRARY_PATH_KEY, libraryInfo.path);
        console.log('Stata All in One: Saved Stata library path:', libraryInfo.path);
    }

    // Stata for Linux keeps stata.lic next to the shared library.
    const stHomeDir = path.dirname(libraryInfo.path);
    const licPath = path.join(stHomeDir, 'stata.lic');

    // Pre-check: no license file → bail out early, let the caller show the dialog.
    if (!fs.existsSync(licPath)) {
        console.log('Stata All in One: No stata.lic found in', stHomeDir);
        return { success: false, noLicense: true, failCode: 'LICENSE_NOT_FOUND', reason: '' };
    }
    console.log('Stata All in One: License file found:', licPath);

    const initResult = await session.initConsoleSession(context, libraryInfo.path);
    if (!initResult.success) {
        console.error('Stata All in One: Session initialization failed:', initResult.error);
        return {
            success: false,
            failCode: initResult.failCode || 'SESSION_INIT_FAILED',
            reason: `${initResult.error || 'StataSO_Main failed'} (${libraryInfo.path})`
        };
    }

    // The user previously dismissed the license dialog but now has a
    // license → clear the preference and notify that console mode works.
    if (context && context.globalState.get(LICENSE_DIALOG_SUPPRESSED_KEY)) {
        await context.globalState.update(LICENSE_DIALOG_SUPPRESSED_KEY, false);
        await context.globalState.update(LICENSE_DIALOG_REMIND_KEY, 0);
        showInfo(`Stata All in One: ${msg('consoleLicenseFound')}`);
    }

    return {
        success: true,
        fromExisting: false,
        edition: libraryInfo.edition
    };
}

/**
 * Run code on Linux via the Embedded Console-backed session.
 * Same contract as runOnMacWebview() / runOnWindowsEmbeddedConsole().
 * @param {string} codeToRun
 * @param {string} tmpFilePath - unused in Embedded Console mode
 * @param {string|null} docDir - directory of the do-file
 * @param {vscode.ExtensionContext} context
 * @param {object} [options]
 * @returns {Promise<object>} - { success, shouldOfferGuiFallback, errorType?, message? }
 */
const runOnLinuxEmbeddedConsole = createConsoleRunner({ platform: 'linux', ensureConsoleSession });

/**
 * Initialize Stata session
 * @param {vscode.ExtensionContext} context
 * @returns {Promise<boolean>} - true if initialization succeeded
 */
async function initConsoleSession(context) {
    try {
        const result = await ensureConsoleSession(context);
        if (!result.success) {
            showError(result.reason);
            return false;
        }

        if (!result.fromExisting) {
            showInfo(`Stata ${result.edition ? result.edition.toUpperCase() : ''} session initialized.`);
        }

        return true;
    } catch (error) {
        console.error('Stata All in One: initConsoleSession exception:', error.message);
        showError(`Stata initialization error: ${error.message}`);
        return false;
    }
}

module.exports = {
    findStataLibrary,
    ensureConsoleSession,
    showConsoleLicenseDialog,
    runOnLinuxEmbeddedConsole,
    initConsoleSession,
    stopConsoleExecution,
    getConsoleSession,
    forceShutdownConsoleSession
};
