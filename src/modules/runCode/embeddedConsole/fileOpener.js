const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const {
    isImageFilePath,
    isStataFilePath,
    isTextFilePath,
    isVerifiedWebTarget
} = require('./fileLinks');
const { defaultApplicationName } = require('./externalApplication');

/**
 * Files on a remote Linux host (VS Code Remote-SSH, Tunnels) cannot be handed
 * to the local desktop: `openExternal` would look for the path on the client
 * machine and xdg-open has no display on a headless server. VS Code's own
 * editors are used instead. A local Linux desktop keeps the system default.
 */
function shouldOpenInVsCode(platform, vscode, options = {}) {
    if (platform !== 'linux') return false;
    if (options.remote !== undefined) return Boolean(options.remote);
    try {
        return Boolean(vscode && vscode.env && vscode.env.remoteName);
    } catch (_error) {
        return false;
    }
}

function openWithSystemDefault(filePath, uri, vscode, options = {}) {
    const platform = options.platform || process.platform;
    const spawn = options.spawn || childProcess.spawn;
    if (platform !== 'win32') {
        return vscode.env.openExternal(uri);
    }

    return new Promise((resolve, reject) => {
        const child = spawn('explorer.exe', [filePath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.once('error', reject);
        child.once('spawn', () => {
            child.unref();
            resolve(true);
        });
    });
}

function isAbsoluteFilePath(filePath, platform) {
    return platform === 'win32'
        ? path.win32.isAbsolute(filePath)
        : path.isAbsolute(filePath);
}

async function showExternalOpenNotice(filePath, options) {
    const {
        platform,
        execFile,
        comSpec,
        message,
        showInfo,
        resolveExternalApplicationName
    } = options;
    let appName = '';
    try {
        appName = await resolveExternalApplicationName(filePath, {
            platform,
            execFile,
            comSpec
        });
    } catch (_error) {
        appName = '';
    }
    try {
        Promise.resolve(showInfo(message('consoleOpeningWithExternalApplication', {
            appName: appName || message('consoleSystemDefaultApplication')
        }))).catch(() => {});
    } catch (_error) {
        // A failed VS Code notification must never block the file open request.
    }
}

async function openConsoleFile(options) {
    const {
        filePath,
        vscode,
        context,
        showWarn,
        showError,
        showInfo = () => {},
        message,
        stat = fs.promises.stat,
        openDtaFile,
        platform = process.platform,
        remote,
        spawn = childProcess.spawn,
        execFile = childProcess.execFile,
        comSpec,
        resolveExternalApplicationName = defaultApplicationName
    } = options;
    const openInVsCode = shouldOpenInVsCode(platform, vscode, { remote });
    const targetPath = String(filePath || '').trim();
    if (!targetPath || !isAbsoluteFilePath(targetPath, platform)) {
        showWarn(message('consoleFileNotFound', { filePath: targetPath }));
        return 'missing';
    }

    try {
        const fileStat = await stat(targetPath);
        if (!fileStat.isFile()) {
            showWarn(message('consoleFileNotFound', { filePath: targetPath }));
            return 'missing';
        }

        const uri = vscode.Uri.file(targetPath);
        if (path.extname(targetPath).toLowerCase() === '.dta') {
            const openData = openDtaFile
                || require('./dataViewer/panel').openDtaFileInDataViewer;
            await openData(context, uri);
            return 'data-viewer';
        }
        if (isStataFilePath(targetPath) && !openInVsCode) {
            await showExternalOpenNotice(targetPath, {
                platform,
                execFile,
                comSpec,
                message,
                showInfo,
                resolveExternalApplicationName
            });
            const opened = await openWithSystemDefault(targetPath, uri, vscode, {
                platform,
                spawn
            });
            if (!opened) {
                throw new Error(message('consoleSystemOpenRejected'));
            }
            return 'stata';
        }
        if (isImageFilePath(targetPath)) {
            await vscode.commands.executeCommand('vscode.open', uri, {
                viewColumn: vscode.ViewColumn.Active,
                preview: false
            });
            return 'image-preview';
        }
        if (isTextFilePath(targetPath)) {
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Active,
                preview: false
            });
            return 'editor';
        }
        if (openInVsCode) {
            await vscode.commands.executeCommand('vscode.open', uri, {
                viewColumn: vscode.ViewColumn.Active,
                preview: false
            });
            return 'editor';
        }

        await showExternalOpenNotice(targetPath, {
            platform,
            execFile,
            comSpec,
            message,
            showInfo,
            resolveExternalApplicationName
        });
        const opened = await openWithSystemDefault(targetPath, uri, vscode, {
            platform,
            spawn
        });
        if (!opened) {
            throw new Error(message('consoleSystemOpenRejected'));
        }
        return 'system';
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            showWarn(message('consoleFileNotFound', { filePath: targetPath }));
            return 'missing';
        }
        showError(message('consoleFileOpenFailed', {
            filePath: targetPath,
            error: error && error.message ? error.message : String(error)
        }));
        return 'error';
    }
}

async function openConsoleLink(options) {
    const link = options && options.link || {};
    const kind = String(link.kind || 'file');
    const target = String(link.target || '').trim();
    if (kind === 'url') {
        if (!isVerifiedWebTarget(target)) {
            options.showWarn(options.message('consoleFileNotFound', { filePath: target }));
            return 'missing';
        }
        const opened = await options.vscode.env.openExternal(options.vscode.Uri.parse(target));
        return opened ? 'url' : 'error';
    }
    if (kind === 'directory') {
        try {
            const stat = await (options.stat || fs.promises.stat)(target);
            if (!stat.isDirectory()) {
                options.showWarn(options.message('consoleFileNotFound', { filePath: target }));
                return 'missing';
            }
            if (shouldOpenInVsCode(options.platform || process.platform, options.vscode, { remote: options.remote })) {
                await options.vscode.commands.executeCommand('revealInExplorer', options.vscode.Uri.file(target));
                return 'directory';
            }
            const opened = await openWithSystemDefault(
                target,
                options.vscode.Uri.file(target),
                options.vscode,
                {
                    platform: options.platform || process.platform,
                    spawn: options.spawn || childProcess.spawn
                }
            );
            return opened ? 'directory' : 'error';
        } catch (error) {
            if (error && error.code === 'ENOENT') {
                options.showWarn(options.message('consoleFileNotFound', { filePath: target }));
                return 'missing';
            }
            options.showError(options.message('consoleFileOpenFailed', {
                filePath: target,
                error: error && error.message ? error.message : String(error)
            }));
            return 'error';
        }
    }
    return openConsoleFile({
        ...options,
        filePath: target
    });
}

module.exports = {
    isAbsoluteFilePath,
    openConsoleLink,
    openConsoleFile,
    openWithSystemDefault,
    shouldOpenInVsCode,
    showExternalOpenNotice
};
