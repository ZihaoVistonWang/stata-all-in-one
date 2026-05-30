/**
 * Windows External App Runner
 * Handles code execution on Windows via the external Stata app.
 * Primary path: Stata Automation COM (DoCommandAsync)
 * Fallback path: keystroke simulation via PowerShell scripts
 * Windows 外部 Stata 应用运行
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { showError, showWarn, stripSurroundingQuotes, msg } = require('../../../utils/common');
const config = require('../../../utils/config');
const { getComService } = require('./comService');

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
 * Try to execute code via Stata Automation COM.
 * Writes code to a temp .do file and sends "do <file>" command to Stata
 * (same approach as the keystroke fallback, but via COM instead of SendKeys).
 *
 * @param {string} code - Stata code to execute
 * @param {string} tmpFilePath - Path for temp .do file
 * @param {string} stataPath - Path to Stata executable
 * @param {string|null} docDir - Document directory for cd prepend
 * @param {vscode.ExtensionContext|null} context - Extension context for globalState
 * @returns {Promise<{success: boolean, fallbackReason?: string}>}
 */
async function _tryComExecution(code, tmpFilePath, stataPath, docDir, context) {
    const extensionPath = vscode.extensions.getExtension(
        'ZihaoVistonWang.stata-all-in-one'
    ).extensionPath;
    const comService = getComService(extensionPath);

    // If COM has been marked unavailable for this session, skip immediately
    if (comService.isUnavailable()) {
        return { success: false, fallbackReason: 'com-marked-unavailable' };
    }

    // Lazy-initialize the COM service if needed
    if (!comService.isInitialized()) {
        try {
            const initOk = await comService.init(stataPath, context);
            if (!initOk) {
                return { success: false, fallbackReason: 'init-failed' };
            }
        } catch (err) {
            console.error('[windows.js] COM init exception:', err.message);
            comService.markUnavailable();
            showWarn(msg('comInitFailed'));
            return { success: false, fallbackReason: 'init-exception' };
        }
    }

    try {
        // If cdToDoFileDir is enabled, prepend cd to the do-file (same as keystroke fallback)
        const cdEnabled = config.getCdToDoFileDir ? config.getCdToDoFileDir() : false;
        const running = isStataRunningOnWindows();
        let finalCode = code;
        if (cdEnabled && !running && docDir) {
            const escapedDir = docDir.replace(/"/g, '\\"');
            finalCode = `cd "${escapedDir}"\n${code}`;
        }

        // Write code to temp .do file
        fs.writeFileSync(tmpFilePath, finalCode, 'utf8');

        // Build do command with forward slashes
        const cleanPath = tmpFilePath.replace(/\\/g, '/');
        const quote = '"';
        const runCommand = 'do ' + quote + cleanPath + quote;

        // Send do command via COM (async, non-blocking)
        console.log('[windows.js] COM sending: ' + runCommand);
        const result = await comService.execute(runCommand);
        if (result.success) {
            console.log('[windows.js] COM do command sent');
            // Fire-and-forget: poll until Stata finishes, then foreground
            // (Graph windows need time to render after DoCommandAsync returns)
            comService.waitAndForeground(60000).catch(() => {});
            return { success: true };
        }

        console.error('[windows.js] COM execute error:', result.error);
        comService.markUnavailable();
        showWarn(msg('comExecFailed'));
        return { success: false, fallbackReason: 'execute-failed' };
    } catch (err) {
        console.error('[windows.js] COM exception:', err.message);
        comService.markUnavailable();
        showWarn(msg('comExecFailed'));
        return { success: false, fallbackReason: 'exception' };
    }
}

/**
 * Fallback: execute code via keystroke simulation (original approach).
 * Writes a temp .do file and runs a PowerShell script to paste
 * the do-command into Stata's command window.
 *
 * @param {string} code - Stata code
 * @param {string} tmpFilePath - Path for temp .do file
 * @param {string} stataPath - Stata executable path
 * @param {string|null} docDir - Document directory
 */
function _fallbackKeystrokeExecution(code, tmpFilePath, stataPath, docDir) {
    const cdEnabled = config.getCdToDoFileDir ? config.getCdToDoFileDir() : false;
    const running = isStataRunningOnWindows();
    let finalCode = code;
    if (cdEnabled && !running && docDir) {
        const escapedDir = docDir.replace(/"/g, '\\"');
        finalCode = `cd "${escapedDir}"\n${code}`;
    }
    fs.writeFileSync(tmpFilePath, finalCode, 'utf8');

    const extensionPath = vscode.extensions.getExtension(
        'ZihaoVistonWang.stata-all-in-one'
    ).extensionPath;
    const closeOtherWindows = config.getCloseStataOtherWindowsBeforeSendingCode
        ? config.getCloseStataOtherWindowsBeforeSendingCode()
        : true;
    const scriptFileName = closeOtherWindows
        ? 'win_run_do_file_close_all_windows.ps1'
        : 'win_run_do_file_with_all_windows.ps1';
    const psScriptPath = stripSurroundingQuotes(
        path.join(extensionPath, 'scripts', scriptFileName)
    );
    const cleanDoFilePath = stripSurroundingQuotes(tmpFilePath);

    const sleepDelay = config.getStataStepDelayOnWindows
        ? config.getStataStepDelayOnWindows()
        : 100;

    const psCommand = [
        'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', `"${psScriptPath}"`,
        '-stataPath', `"${stataPath}"`,
        '-doFilePath', `"${cleanDoFilePath}"`,
        '-sleepDelay', sleepDelay
    ].join(' ');

    exec(psCommand, (error, stdout, stderr) => {
        setTimeout(() => {
            try { fs.unlinkSync(tmpFilePath); } catch (e) {
                console.error('Failed to delete temporary file:', e);
            }
        }, 2000);

        if (error) {
            const detail = stderr && stderr.trim() ? ` Details: ${stderr.trim()}` : '';
            showError(msg('winRunFailed', { message: error.message, detail }));
        }
    });
}

/**
 * Run code on Windows.
 * Primary: Stata Automation COM (async, non-blocking).
 * Fallback: keystroke simulation via PowerShell scripts.
 *
 * @param {string} codeToRun - Stata code
 * @param {string} tmpFilePath - Path for temp .do file (used by fallback)
 * @param {string} stataPathOnWindows - Stata executable path
 * @param {string|null} docDir - Document directory (for cd prepend)
 * @param {vscode.ExtensionContext|null} context - Extension context (for globalState)
 */
async function runOnWindows(codeToRun, tmpFilePath, stataPathOnWindows, docDir = null, context = null) {
    // Step 1: Try COM execution (primary path)
    try {
        const comResult = await _tryComExecution(
            codeToRun, tmpFilePath, stataPathOnWindows, docDir, context
        );
        if (comResult.success) {
            // COM succeeded — no need for temp file or keystroke simulation
            return;
        }
        console.log(
            `[windows.js] COM path failed (${comResult.fallbackReason}), falling back to keystroke`
        );
    } catch (err) {
        console.error('[windows.js] COM path unexpected error:', err.message);
    }

    // Step 2: Fallback to keystroke-based execution
    _fallbackKeystrokeExecution(codeToRun, tmpFilePath, stataPathOnWindows, docDir);
}

module.exports = {
    runOnWindows
};
