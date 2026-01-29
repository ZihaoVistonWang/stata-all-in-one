/**
 * macOS Stata Runner
 * Handles code execution on macOS via AppleScript
 * macOS Stata 代码运行
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { showError, showInfo, msg } = require('../../utils/common');
const config = require('../../utils/config');

/**
 * Find available Stata application on macOS
 */
function findStataApp(preferredName) {
    const checkPaths = (appName) => {
        const candidates = [
            `/Applications/${appName}.app`,
            `/Applications/Stata/${appName}.app`,
            `/Applications/StataNow/${appName}.app`
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return null;
    };

    const scanForStataApps = () => {
        const baseDirs = ['/Applications', '/Applications/Stata', '/Applications/StataNow'];
        const apps = [];
        const seen = new Set();

        for (const dir of baseDirs) {
            try {
                if (!fs.existsSync(dir)) {
                    continue;
                }
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory() || !entry.name.endsWith('.app')) {
                        continue;
                    }
                    const appName = entry.name.slice(0, -4);
                    if (!/stata/i.test(appName)) {
                        continue;
                    }
                    const appPath = path.join(dir, entry.name);
                    const key = `${appName}@@${appPath}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        apps.push({ name: appName, path: appPath });
                    }
                }
            } catch (e) {
                // Ignore directory read errors
            }
        }

        const preferredOrder = ['StataMP', 'StataSE', 'StataIC', 'Stata'];
        apps.sort((a, b) => {
            const aIdx = preferredOrder.findIndex(p => a.name === p);
            const bIdx = preferredOrder.findIndex(p => b.name === p);
            const aScore = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
            const bScore = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
            if (aScore !== bScore) {
                return aScore - bScore;
            }
            return a.name.localeCompare(b.name);
        });

        return apps;
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
    let autoDetected = false;

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

    if (!chosenPath) {
        const autoCandidates = scanForStataApps();
        if (autoCandidates.length > 0) {
            autoDetected = true;
            chosenName = autoCandidates[0].name;
            chosenPath = autoCandidates[0].path;
            autoCandidates.forEach(app => installed.push(app.name));
        }
    }

    return { name: chosenName, path: chosenPath, installed: Array.from(new Set(installed)), autoDetected };
}

/**
 * Run code on macOS
 * @param {string} codeToRun - The code to execute
 * @param {string} tmpFilePath - Path to temporary file
 * @param {boolean} isHelpCommand - Whether this is a help command (will force window activation)
 */
function runOnMac(codeToRun, tmpFilePath, isHelpCommand = false) {
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

    // Only show notification if auto-detected in this session (not saved yet)
    // Auto-detection should have saved config in index.js already
    const appName = foundApp.name;
    const appPath = foundApp.path;

    // Close all help windows first / 先关闭所有帮助窗口
    let closeHelpCommand = `osascript -e 'tell application "System Events"' -e 'set helperWindows to (every window of application "${appName}" whose name contains "help")' -e 'repeat with w in helperWindows' -e 'close w' -e 'end repeat' -e 'end tell' 2>/dev/null || true`;
    
    let stataCommand = `${closeHelpCommand}; pgrep -x "${appName}" > /dev/null || (open -a "${appPath}" && while ! pgrep -x "${appName}" > /dev/null; do sleep 0.2; done && sleep 0.5); osascript -e 'tell application "${appName}" to DoCommand "do \\"${tmpFilePath}\\""'`;
    
    // For help commands, activate the help window specifically after a delay
    // 对于帮助命令，延迟后专门激活帮助窗口
    if (isHelpCommand) {
        stataCommand += ` && sleep 0.2 && osascript -e 'tell application "System Events"' -e 'tell process "${appName}"' -e 'set helpWin to first window whose name contains "help"' -e 'set frontmost to true' -e 'perform action "AXRaise" of helpWin' -e 'end tell' -e 'end tell' 2>/dev/null || osascript -e 'tell application "${appName}" to activate'`;
    } else if (activateStataWindow) {
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
    runOnMac,
    findStataApp
};
