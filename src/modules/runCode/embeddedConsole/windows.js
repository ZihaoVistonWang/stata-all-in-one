/**
 * Windows Embedded Console initialization and platform entry point.
 */
const fs = require('fs');
const path = require('path');
const session = require('./session');
const config = require('../../../utils/config');
const { showInfo, showError, msg } = require('../../../utils/common');
const { ensureStataConfigured } = require('../stataInstallationResolver');
const { getInstallationSignals } = require('../stataDiscovery');
const {
    createConsoleRunner,
    showConsoleLicenseDialog,
    stopConsoleExecution,
    getConsoleSession,
    forceShutdownConsoleSession
} = require('./runner');

const LICENSE_DIALOG_SUPPRESSED_KEY = 'stata-all-in-one.consoleLicenseDialogSuppressed';
const LICENSE_DIALOG_REMIND_KEY = 'stata-all-in-one.consoleLicenseDialogNextReminder';

/**
 * Find Stata DLL on Windows.
 *
 * Resolution order:
 *   1. Derive from `stataPathOnWindows` config — detected or set by the user.
 *      e.g. D:\Stata18\StataMP-64.exe → D:\Stata18\mp-64.dll
 *
 * DLL naming convention: <edition>-64.dll
 *   MP: mp-64.dll   SE: se-64.dll   BE: be-64.dll   IC: ic-64.dll
 *
 * @returns {{
 *   path: string|null,
 *   edition: string|null,
 *   installed: string[],
 *   fromCache: boolean
 * }}
 */
function findStataDll() {
    const exePath = config.getStataPathOnWindows ? config.getStataPathOnWindows() : '';
    const cleanExePath = String(exePath).replace(/^["']|["']$/g, '').trim();

    if (!cleanExePath) {
        return { path: null, edition: null, installed: [] };
    }

    const exeName = path.basename(cleanExePath).toLowerCase();
    const exeEditionMatch = exeName.match(/stata(mp|se|be|ic)-?\d*\.exe$/);
    const exeEdition = exeEditionMatch ? exeEditionMatch[1] : null;
    const signals = getInstallationSignals(cleanExePath, exeEdition);
    if (signals.dllPath) {
        return { path: signals.dllPath, edition: signals.dllEdition, installed: [signals.dllEdition] };
    }

    return { path: null, edition: null, installed: [] };
}

// =========================================================================
// Session management
// =========================================================================

async function ensureConsoleSession(context) {
    // If session was marked stale (console panel closed), shut it down first.
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
            reason: msg('missingWinPath')
        };
    }

    const dllInfo = findStataDll();

    if (!dllInfo.path) {
        return {
            success: false,
            failCode: 'LIBRARY_NOT_FOUND',
            reason: '无法找到 Stata DLL。请在设置 stata-all-in-one.stataPathOnWindows 中指定 Stata EXE 路径（如 D:\\Stata17\\StataMP-64.exe）。'
        };
    }

    const exeDir = path.dirname(
        String(config.getStataPathOnWindows()).replace(/^["']|["']$/g, '').trim()
    );
    const licPath = path.join(exeDir, 'stata.lic');

    // Pre-check: no license file → bail out early, let the caller show dialog.
    if (!fs.existsSync(licPath)) {
        console.log('Stata All in One: No stata.lic found in', exeDir);
        return { success: false, noLicense: true, failCode: 'LICENSE_NOT_FOUND', reason: '' };
    }

    process.env.STATA_LICENSE = licPath;
    console.log('Stata All in One: License file found:', licPath);

    const initResult = await session.initConsoleSession(context, dllInfo.path);
    if (!initResult.success) {
        console.error('Stata All in One: Session initialization failed:', initResult.error);
        return {
            success: false,
            failCode: initResult.failCode || 'SESSION_INIT_FAILED',
            reason: `Stata 会话初始化失败 (${dllInfo.path})：${initResult.error}。请检查 Stata ${dllInfo.edition ? dllInfo.edition.toUpperCase() : ''} 是否正确安装。`
        };
    }

    // The user previously dismissed the license dialog but now has a
    // license → clear the preference and notify that console mode works.
    if (context && context.globalState.get(LICENSE_DIALOG_SUPPRESSED_KEY)) {
        await context.globalState.update(LICENSE_DIALOG_SUPPRESSED_KEY, false);
        await context.globalState.update(LICENSE_DIALOG_REMIND_KEY, 0);
        const { showInfo, msg } = require('../../../utils/common');
        showInfo(`Stata All in One: ${msg('consoleLicenseFound')}`);
    }

    return {
        success: true,
        fromExisting: false,
        edition: dllInfo.edition
    };
}

const runOnWindowsEmbeddedConsole = createConsoleRunner({ platform: 'win32', ensureConsoleSession });

async function initConsoleSession(context) {
    try {
        const result = await ensureConsoleSession(context);
        if (!result.success) {
            showError(result.reason);
            return false;
        }

        if (!result.fromExisting) {
            showInfo(
                `Stata ${result.edition ? result.edition.toUpperCase() : ''} 会话已初始化成功。`
            );
        }

        return true;
    } catch (error) {
        console.error('Stata All in One: initConsoleSession exception:', error.message);
        showError(`Stata 初始化错误: ${error.message}`);
        return false;
    }
}

module.exports = {
    findStataDll,
    ensureConsoleSession,
    showConsoleLicenseDialog,
    runOnWindowsEmbeddedConsole,
    initConsoleSession,
    stopEmbeddedConsoleExecution: stopConsoleExecution,
    getConsoleSession,
    forceShutdownEmbeddedConsoleSession: forceShutdownConsoleSession
};
