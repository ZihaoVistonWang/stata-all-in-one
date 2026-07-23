const fs = require('fs');
const path = require('path');
const { isStataFilePath, isTextFilePath } = require('./fileLinks');

async function openConsoleFile(options) {
    const {
        filePath,
        vscode,
        context,
        showWarn,
        showError,
        message,
        stat = fs.promises.stat,
        openDtaFile
    } = options;
    const targetPath = String(filePath || '').trim();
    if (!targetPath || !path.isAbsolute(targetPath)) {
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
            const opened = await vscode.env.openExternal(uri);
            if (!opened) {
                throw new Error(message('consoleSystemOpenRejected'));
            }
            return 'stata';
        }
        if (isTextFilePath(targetPath)) {
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Active,
                preview: false
            });
            return 'editor';
        }

        const opened = await vscode.env.openExternal(uri);
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
    openConsoleFile
};
