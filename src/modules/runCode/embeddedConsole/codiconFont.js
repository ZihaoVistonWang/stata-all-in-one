/**
 * Location of the codicon icon font used by the Console and Data Viewer webviews.
 *
 * A local VS Code install ships the font at <appRoot>/out/media/codicon.ttf and
 * that copy is preferred, so the icons always match the running VS Code. VS Code
 * Server (Remote-SSH, WSL, Tunnels) does not ship that file, which left every
 * toolbar and graph icon as an empty box; the copy bundled from @vscode/codicons
 * is used instead.
 *
 * Kept free of `vscode` so the tests can use it directly.
 */

const fs = require('fs');
const path = require('path');

const CODICON_FONT_FILE = 'codicon.ttf';
const BUNDLED_CODICON_DIRECTORY = path.resolve(
    __dirname, '..', '..', '..', '..', 'node_modules', '@vscode', 'codicons', 'dist'
);

/**
 * @param {string|undefined} appRoot - vscode.env.appRoot
 * @param {{ exists?: Function, bundledDirectory?: string }} [options]
 * @returns {string} directory that contains codicon.ttf
 */
function resolveCodiconFontDirectory(appRoot, options = {}) {
    const exists = options.exists || fs.existsSync;
    const bundledDirectory = options.bundledDirectory || BUNDLED_CODICON_DIRECTORY;
    const builtInDirectory = appRoot ? path.join(appRoot, 'out', 'media') : '';
    if (builtInDirectory && exists(path.join(builtInDirectory, CODICON_FONT_FILE))) {
        return builtInDirectory;
    }
    if (exists(path.join(bundledDirectory, CODICON_FONT_FILE))) {
        return bundledDirectory;
    }
    return builtInDirectory || bundledDirectory;
}

module.exports = {
    BUNDLED_CODICON_DIRECTORY,
    CODICON_FONT_FILE,
    resolveCodiconFontDirectory
};
