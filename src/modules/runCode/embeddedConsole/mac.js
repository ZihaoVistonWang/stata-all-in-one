/**
 * macOS Embedded Console initialization and platform entry point.
 */
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const session = require('./session');
const config = require('../../../utils/config');
const { showInfo, showError, msg } = require('../../../utils/common');
const { ensureStataConfigured } = require('../stataInstallationResolver');
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
 * Find Stata dylib on macOS
 * Scans /Applications for Stata MP/SE/BE editions and returns the dylib path
 * @param {string|null} preferredEdition - Preferred edition: 'mp', 'se', 'be', or null for auto
 * @returns {{
 *   path: string|null,
 *   edition: 'mp'|'se'|'be'|null,
 *   installed: string[],
 *   fromCache: boolean
 * }}
 */
function findStataDylib(preferredEdition = null, savedPath = null) {
    if (savedPath && fs.existsSync(savedPath)) {
        const editionMatch = savedPath.match(/libstata-(mp|se|be)\.dylib$/);
        return {
            path: savedPath,
            edition: editionMatch ? editionMatch[1] : null,
            installed: [],
            fromCache: true
        };
    }

    const editions = ['mp', 'se', 'be'];
    const appNames = {
        mp: 'StataMP',
        se: 'StataSE',
        be: 'StataBE'
    };

    const installed = [];
    let targetEdition = null;
    let targetPath = null;

    const baseDir = '/Applications';
    if (!fs.existsSync(baseDir)) {
        return { path: null, edition: null, installed: [], fromCache: false };
    }

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
        const subDirPath = path.join(baseDir, entry.name);

        for (const edition of editions) {
            const appPath = path.join(subDirPath, `${appNames[edition]}.app`);
            if (!fs.existsSync(appPath)) {
                continue;
            }

            installed.push(edition);

            const dylibPath = path.join(
                appPath,
                'Contents',
                'MacOS',
                `libstata-${edition}.dylib`
            );

            if (fs.existsSync(dylibPath) && !targetPath) {
                targetEdition = edition;
                targetPath = dylibPath;
            }
        }
    }

    if (preferredEdition && installed.includes(preferredEdition)) {
        for (const entry of entries) {
            const appPath = path.join(baseDir, entry.name, `${appNames[preferredEdition]}.app`);
            const dylibPath = path.join(
                appPath,
                'Contents',
                'MacOS',
                `libstata-${preferredEdition}.dylib`
            );

            if (fs.existsSync(dylibPath)) {
                targetEdition = preferredEdition;
                targetPath = dylibPath;
                break;
            }
        }
    }

    return {
        path: targetPath,
        edition: targetEdition,
        installed,
        fromCache: false
    };
}

function escapeStataQuotedString(value) {
    return String(value || '').replace(/"/g, '""');
}

function readMacStataPythonExec() {
    const domains = [
        'com.stata.stata19',
        'com.stata.stata18',
        'com.stata.stata17',
        'com.stata.stata16'
    ];

    for (const domain of domains) {
        try {
            const pythonExec = childProcess.execFileSync(
                '/usr/bin/defaults',
                ['read', domain, 'python.pyexec_64'],
                {
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'ignore']
                }
            ).trim();
            if (pythonExec) {
                return pythonExec;
            }
        } catch (_) {
            // Try the next installed Stata version.
        }
    }

    return '';
}

async function syncMacStataPythonConfig(consoleSession) {
    const pythonExec = readMacStataPythonExec();
    if (!pythonExec) {
        return;
    }

    const command = `python set exec "${escapeStataQuotedString(pythonExec)}"`;
    const result = await consoleSession.execute(command, false);
    if (!result.success) {
        console.warn(
            'Stata All in One: Failed to apply Stata Python configuration:',
            result.error || result.output || result.returnCode
        );
    }
}

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
            reason: msg('noStataInstalled', { installedList: 'none detected' })
        };
    }

    let savedPath = context ? context.globalState.get('stataConsoleDylibPath') : null;
    const detectedAppPath = context ? context.globalState.get('stataGuiAppPath') : null;
    if (!savedPath && detectedAppPath && fs.existsSync(detectedAppPath)) {
        const configuredEditionMatch = String(config.getStataVersion() || '').match(/^Stata(MP|SE|BE|IC)$/i);
        if (configuredEditionMatch) {
            const edition = configuredEditionMatch[1].toLowerCase();
            const detectedDylibPath = path.join(
                detectedAppPath,
                'Contents',
                'MacOS',
                `libstata-${edition}.dylib`
            );
            if (fs.existsSync(detectedDylibPath)) {
                savedPath = detectedDylibPath;
            } else {
                return {
                    success: false,
                    failCode: 'LIBRARY_NOT_FOUND',
                    reason: msg('consoleLibraryMissingInSelected', {
                        libraryName: path.basename(detectedDylibPath)
                    })
                };
            }
        }
    }
    const dylibInfo = findStataDylib(null, savedPath);

    if (!dylibInfo.path) {
        console.error('Stata All in One: 未找到 Stata dylib，已安装版本:', dylibInfo.installed);
        return {
            success: false,
            failCode: 'LIBRARY_NOT_FOUND',
            reason: '无法找到 Stata。请确保 Stata MP/SE/BE 已安装在 /Applications 目录下。'
        };
    }

    if (context && !dylibInfo.fromCache) {
        await context.globalState.update('stataConsoleDylibPath', dylibInfo.path);
        console.log('Stata All in One: 已保存 dylib 路径:', dylibInfo.path);
    }

    // Derive the Stata install directory to check for license file
    // macOS: /Applications/StataMP.app/Contents/MacOS/libstata-mp.dylib → /Applications
    const stHomeDir = dylibInfo.path
        ? path.dirname(path.dirname(path.dirname(path.dirname(dylibInfo.path))))
        : null;
    const licPath = stHomeDir ? path.join(stHomeDir, 'stata.lic') : null;

    // Pre-check: no license file → bail out early, let caller show dialog
    if (!licPath || !fs.existsSync(licPath)) {
        console.log('Stata All in One: No stata.lic found in', stHomeDir);
        return { success: false, noLicense: true, failCode: 'LICENSE_NOT_FOUND', reason: '' };
    }

    process.env.STATA_LICENSE = licPath;
    console.log('Stata All in One: License file found:', licPath);

    const initResult = await session.initConsoleSession(context, dylibInfo.path);
    if (!initResult.success) {
        console.error('Stata All in One: 会话初始化失败:', initResult.error);
        const detail = initResult.error ? `：${initResult.error}` : '';
        return {
            success: false,
            failCode: initResult.failCode || 'SESSION_INIT_FAILED',
            reason: `Stata 会话初始化失败${detail}。请检查 Stata ${dylibInfo.edition ? dylibInfo.edition.toUpperCase() : ''} 是否正确安装。`
        };
    }

    const consoleSession = session.getConsoleSession(context);
    if (consoleSession) {
        await syncMacStataPythonConfig(consoleSession);
    }

    // License was found and session initialized — clear any suppression preference
    if (context && context.globalState.get(LICENSE_DIALOG_SUPPRESSED_KEY)) {
        await context.globalState.update(LICENSE_DIALOG_SUPPRESSED_KEY, false);
        await context.globalState.update(LICENSE_DIALOG_REMIND_KEY, 0);
        showInfo(`Stata All in One: ${msg('consoleLicenseFound')}`);
    }

    return {
        success: true,
        fromExisting: false,
        edition: dylibInfo.edition
    };
}

const runOnMacWebview = createConsoleRunner({ platform: 'darwin', ensureConsoleSession });

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
        console.error('Stata All in One: initConsoleSession 异常:', error.message);
        showError(`Stata 初始化错误: ${error.message}`);
        return false;
    }
}

module.exports = {
    findStataDylib,
    syncMacStataPythonConfig,
    ensureConsoleSession,
    showConsoleLicenseDialog,
    runOnMacWebview,
    initConsoleSession,
    stopConsoleExecution,
    getConsoleSession,
    forceShutdownConsoleSession
};
