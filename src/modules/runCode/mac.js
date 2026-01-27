/**
 * macOS Stata Runner
 * Handles code execution on macOS via AppleScript
 * macOS Stata 代码运行
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { showError, msg } = require('../../utils/common');
const config = require('../../utils/config');

/**
 * Find available Stata application on macOS
 */
function findStataApp(preferredName) {
    const checkPaths = (appName) => {
        const candidates = [
            `/Applications/${appName}.app`,
            `/Applications/Stata/${appName}.app`
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return null;
    };

    const orderedNames = Array.from(new Set([
        preferredName,
        'StataMP',
        'StataSE',
        'StataIC',
        'Stata'
    ].filter(Boolean)));

    const installed = [];
    let chosenName = null;
    let chosenPath = null;

    for (const name of orderedNames) {
        const p = checkPaths(name);
        if (p) {
            installed.push(name);
            if (!chosenPath) {
                chosenName = name;
                chosenPath = p;
            }
        }
    }

    return { name: chosenName, path: chosenPath, installed };
}

/**
 * Run code on macOS
 */
function runOnMac(codeToRun, tmpFilePath) {
    const stataVersion = config.getStataVersion();
    const activateStataWindow = config.getActivateStataWindow();
    
    const foundApp = findStataApp(stataVersion);
    if (!foundApp.path) {
        const installedList = (foundApp.installed && foundApp.installed.length > 0)
            ? foundApp.installed.join(', ')
            : 'none detected';
        showError(msg('noStataInstalled', { installedList }));
        return;
    }

    const appName = foundApp.name;
    const appPath = foundApp.path;

    // Close all help windows first / 先关闭所有帮助窗口
    let closeHelpCommand = `osascript -e 'tell application "System Events"' -e 'set helperWindows to (every window of application "${appName}" whose name contains "help")' -e 'repeat with w in helperWindows' -e 'close w' -e 'end repeat' -e 'end tell' 2>/dev/null || true`;
    
    let stataCommand = `${closeHelpCommand}; pgrep -x "${appName}" > /dev/null || (open -a "${appPath}" && while ! pgrep -x "${appName}" > /dev/null; do sleep 0.2; done && sleep 0.5); osascript -e 'tell application "${appName}" to DoCommand "do \\"${tmpFilePath}\\""'`;
    
    if (activateStataWindow) {
        stataCommand += ` -e 'tell application "${appName}" to activate'`;
    }

    exec(stataCommand, (error, stdout, stderr) => {
        // Clean up temporary file
        setTimeout(() => {
            try {
                fs.unlinkSync(tmpFilePath);
            } catch (e) {
                console.error('Failed to delete temporary file:', e);
            }
        }, 2000);
        
        if (error) {
            showError(msg('runFailed', { message: error.message }));
            return;
        }

        // Silent success: no popup notification
    });
}

module.exports = {
    runOnMac
};
