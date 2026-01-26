/**
 * Windows Stata Runner
 * Handles code execution on Windows via PowerShell
 * Windows Stata 代码运行
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { showInfo, showError, stripSurroundingQuotes } = require('../../utils/common');
const config = require('../../utils/config');

/**
 * Run code on Windows
 */
function runOnWindows(codeToRun, tmpFilePath, stataPathWindows) {
    const extensionPath = vscode.extensions.getExtension('ZihaoVistonWang.stata-all-in-one').extensionPath;
    const psScriptPath = stripSurroundingQuotes(path.join(extensionPath, 'scripts', 'win_run_do_file.ps1'));
    const cleanDoFilePath = stripSurroundingQuotes(tmpFilePath);

    // Build PowerShell command
    const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptPath}" -stataPath "${stataPathWindows}" -doFilePath "${cleanDoFilePath}"`;
    
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
            showError(`Failed to run Stata code on Windows: ${error.message}${detail}`);
            return;
        }
        
        showInfo('Code sent to Stata');
    });
}

module.exports = {
    runOnWindows
};
