/**
 * Windows Stata Runner
 * Handles code execution on Windows via PowerShell
 * Windows Stata 代码运行
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { showError, stripSurroundingQuotes, msg } = require('../../utils/common');
const config = require('../../utils/config');

/**
 * Check if Stata is currently running on Windows
 */
function isStataRunningOnWindows() {
    try {
        const result = execSync('tasklist /FI "IMAGENAME eq Stata*" /NH', { encoding: 'utf8' });
        return /stata/i.test(result);
    } catch {
        return false;
    }
}

/**
 * Run code on Windows
 */
function runOnWindows(codeToRun, tmpFilePath, stataPathOnWindows, docDir = null) {
    // If enabled and Stata is not running, prepend cd to the do file's directory
    const cdEnabled = config.getCdToDoFileDir ? config.getCdToDoFileDir() : false;
    const running = isStataRunningOnWindows();
    let finalCode = codeToRun;
    if (cdEnabled && !running && docDir) {
        const escapedDir = docDir.replace(/"/g, '\\"');
        finalCode = `cd "${escapedDir}"\n${codeToRun}`;
    }
    fs.writeFileSync(tmpFilePath, finalCode, 'utf8');

    const extensionPath = vscode.extensions.getExtension('ZihaoVistonWang.stata-all-in-one').extensionPath;
    const closeOtherWindows = config.getCloseStataOtherWindowsBeforeSendingCode ? config.getCloseStataOtherWindowsBeforeSendingCode() : true;
    const scriptFileName = closeOtherWindows
        ? 'win_run_do_file_close_all_windows.ps1'
        : 'win_run_do_file_with_all_windows.ps1';
    const psScriptPath = stripSurroundingQuotes(path.join(extensionPath, 'scripts', scriptFileName));
    const cleanDoFilePath = stripSurroundingQuotes(tmpFilePath);
    
    // Get step delay from config, default 100ms
    const sleepDelay = config.getStataStepDelayOnWindows ? config.getStataStepDelayOnWindows() : 100;

    // Build PowerShell command
    const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptPath}" -stataPath "${stataPathOnWindows}" -doFilePath "${cleanDoFilePath}" -sleepDelay ${sleepDelay}`;
    
    // Execute PowerShell command
    exec(psCommand, (error, stdout, stderr) => {
        // Clean up temporary file
        setTimeout(() => {
            try {
                fs.unlinkSync(tmpFilePath);
            } catch (e) {
                console.error('Failed to delete temporary file:', e);
            }
        }, 2000);
        
        if (error) {
            const detail = stderr && stderr.trim() ? ` Details: ${stderr.trim()}` : '';
            showError(msg('winRunFailed', { message: error.message, detail }));
            return;
        }

        // Silent success: no popup notification
    });
}

module.exports = {
    runOnWindows
};
