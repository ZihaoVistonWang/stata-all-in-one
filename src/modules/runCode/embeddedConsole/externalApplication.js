const path = require('path');
const childProcess = require('child_process');

const MAC_DEFAULT_APPLICATION_SCRIPT = `
ObjC.import('AppKit');

function run(argv) {
    const fileUrl = $.NSURL.fileURLWithPath(argv[0]);
    const applicationUrl = $.NSWorkspace.sharedWorkspace
        .URLForApplicationToOpenURL(fileUrl);
    if (!applicationUrl) {
        return '';
    }
    return ObjC.unwrap(
        applicationUrl.lastPathComponent.stringByDeletingPathExtension
    );
}
`.trim();

function runTextCommand(execFile, command, args) {
    return new Promise(resolve => {
        execFile(command, args, {
            encoding: 'utf8',
            timeout: 2000,
            windowsHide: true
        }, (error, stdout) => {
            resolve(error ? '' : String(stdout || '').trim());
        });
    });
}

function executableApplicationName(commandLine) {
    const command = String(commandLine || '').trim();
    const match = command.match(/^\s*"([^"]+?\.exe)"/i)
        || command.match(/^\s*(.+?\.exe)(?:\s|$)/i);
    const executable = match && (match[1] || match[2]);
    if (!executable) {
        return '';
    }
    const name = path.win32.basename(executable).replace(/\.exe$/i, '');
    return /^(?:cmd|explorer|rundll32)$/i.test(name) ? '' : name;
}

async function windowsDefaultApplicationName(filePath, options = {}) {
    const execFile = options.execFile || childProcess.execFile;
    const command = options.comSpec || process.env.ComSpec || 'cmd.exe';
    const extension = path.win32.extname(filePath).toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(extension)) {
        return '';
    }

    const association = await runTextCommand(
        execFile,
        command,
        ['/d', '/c', `assoc ${extension}`]
    );
    const prefix = `${extension}=`;
    const associationLine = association
        .split(/\r?\n/)
        .find(line => line.toLowerCase().startsWith(prefix));
    const programId = associationLine
        ? associationLine.slice(prefix.length).trim()
        : '';
    if (!/^[a-z0-9._-]+$/i.test(programId)) {
        return '';
    }

    const fileType = await runTextCommand(
        execFile,
        command,
        ['/d', '/c', `ftype ${programId}`]
    );
    const equalsIndex = fileType.indexOf('=');
    return executableApplicationName(
        equalsIndex >= 0 ? fileType.slice(equalsIndex + 1) : fileType
    );
}

async function macDefaultApplicationName(filePath, options = {}) {
    const execFile = options.execFile || childProcess.execFile;
    const value = await runTextCommand(execFile, 'osascript', [
        '-l',
        'JavaScript',
        '-e',
        MAC_DEFAULT_APPLICATION_SCRIPT,
        '--',
        filePath
    ]);
    return value === 'missing value' ? '' : value;
}

async function defaultApplicationName(filePath, options = {}) {
    const platform = options.platform || process.platform;
    if (platform === 'win32') {
        return windowsDefaultApplicationName(filePath, options);
    }
    if (platform === 'darwin') {
        return macDefaultApplicationName(filePath, options);
    }
    return '';
}

module.exports = {
    defaultApplicationName,
    executableApplicationName,
    MAC_DEFAULT_APPLICATION_SCRIPT,
    macDefaultApplicationName,
    windowsDefaultApplicationName
};
