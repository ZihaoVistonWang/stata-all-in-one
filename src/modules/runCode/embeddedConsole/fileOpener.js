const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const {
    isImageFilePath,
    isStataFilePath,
    isTextFilePath
} = require('./fileLinks');

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

async function openConsoleFile(options) {
    const {
        filePath,
        vscode,
        context,
        showWarn,
        showError,
        message,
        stat = fs.promises.stat,
        openDtaFile,
        platform = process.platform,
        spawn = childProcess.spawn
    } = options;
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
        if (isStataFilePath(targetPath)) {
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

module.exports = {
    isAbsoluteFilePath,
    openConsoleFile,
    openWithSystemDefault
};
