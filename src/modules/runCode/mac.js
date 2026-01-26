/**
 * macOS Stata Runner
 * Handles code execution on macOS via AppleScript
 * macOS Stata 代码运行
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { showInfo, showError } = require('../../utils/common');
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
        showError(`No Stata installation detected. Please install Stata or set an existing version. Installed: ${installedList}.`);
        return;
    }

    const appName = foundApp.name;
    const appPath = foundApp.path;

    let stataCommand = `pgrep -x "${appName}" > /dev/null || (open -a "${appPath}" && while ! pgrep -x "${appName}" > /dev/null; do sleep 0.2; done && sleep 0.5); osascript -e 'tell application "${appName}" to DoCommand "do \\"${tmpFilePath}\\""'`;
    
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
            showError(`Failed to run Stata code: ${error.message}`);
            return;
        }
        
        showInfo(`Code sent to ${appName}`);
    });
}

module.exports = {
    runOnMac
};
