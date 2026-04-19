/**
 * macOS Stata Runner
 * Handles code execution on macOS via AppleScript
 * macOS Stata 代码运行
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { showError, showInfo, msg } = require('../../../utils/common');
const config = require('../../../utils/config');

/**
 * Find available Stata application on macOS
 */
function findStataApp(preferredName, savedPath = null) {
    const apps = [];
    const seen = new Set();
    const baseDir = '/Applications';

    if (savedPath && fs.existsSync(savedPath)) {
        const appName = path.basename(savedPath, '.app');
        return { 
            name: appName, 
            path: savedPath, 
            installed: [], 
            fromCache: true 
        };
    }

    if (!fs.existsSync(baseDir)) {
        return { name: null, path: null, installed: [], fromCache: false };
    }

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    
    for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('.app')) {
            const appName = entry.name.slice(0, -4);
            if (/stata/i.test(appName)) {
                const appPath = path.join(baseDir, entry.name);
                if (!seen.has(appName)) {
                    seen.add(appName);
                    apps.push({ name: appName, path: appPath });
                }
            }
        }
        
        if (entry.isDirectory() && !entry.name.endsWith('.app')) {
            const subDirPath = path.join(baseDir, entry.name);
            try {
                const subEntries = fs.readdirSync(subDirPath, { withFileTypes: true });
                for (const subEntry of subEntries) {
                    if (subEntry.isDirectory() && subEntry.name.endsWith('.app')) {
                        const appName = subEntry.name.slice(0, -4);
                        if (/stata/i.test(appName)) {
                            const appPath = path.join(subDirPath, subEntry.name);
                            if (!seen.has(appName)) {
                                seen.add(appName);
                                apps.push({ name: appName, path: appPath });
                            }
                        }
                    }
                }
            } catch (e) {}
        }
    }

    const preferredOrder = ['StataMP', 'StataSE', 'StataIC', 'StataBE', 'Stata'];
    apps.sort((a, b) => {
        const aIdx = preferredOrder.indexOf(a.name);
        const bIdx = preferredOrder.indexOf(b.name);
        const aScore = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
        const bScore = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
        if (aScore !== bScore) return aScore - bScore;
        return a.name.localeCompare(b.name);
    });

    const installed = apps.map(app => app.name);
    
    let chosen = { name: null, path: null };
    if (preferredName) {
        const preferred = apps.find(app => app.name === preferredName);
        if (preferred) {
            chosen = preferred;
        } else if (apps.length > 0) {
            chosen = apps[0];
        }
    } else if (apps.length > 0) {
        chosen = apps[0];
    }

    return { 
        name: chosen.name, 
        path: chosen.path, 
        installed,
        fromCache: false
    };
}

/**
 * Check if Stata is currently running on macOS
 */
function isStataRunning(appName) {
    try {
        const result = execSync(`pgrep -x "${appName}"`, { encoding: 'utf8' });
        return result.trim().length > 0;
    } catch {
        return false;
    }
}

/**
 * Run code on macOS
 * @param {string} codeToRun - The code to execute
 * @param {string} tmpFilePath - Path to temporary file
 * @param {boolean} isHelpCommand - Whether this is a help command (will force window activation)
 * @param {string|null} docDir - Directory of the do file, used to cd on first launch
 */
function runOnMac(codeToRun, tmpFilePath, isHelpCommand = false, docDir = null, context = null) {
    const stataVersion = config.getStataVersion();
    
    let appName;
    let appPath;

    const savedPath = context ? context.globalState.get('stataGuiAppPath') : null;
    
    if (savedPath && fs.existsSync(savedPath)) {
        appName = path.basename(savedPath, '.app');
        appPath = savedPath;
    } else if (!stataVersion || stataVersion.trim() === '') {
        const foundApp = findStataApp('');
        if (!foundApp.name) {
            const installedList = (foundApp.installed && foundApp.installed.length > 0)
                ? foundApp.installed.join(', ')
                : 'none detected';
            showError(msg('noStataInstalled', { installedList }));
            return;
        }
        appName = foundApp.name;
        appPath = foundApp.path;
        
        if (context && appPath) {
            context.globalState.update('stataGuiAppPath', appPath);
        }
    } else {
        const foundApp = findStataApp(stataVersion);
        if (!foundApp.name) {
            showError(msg('stataNotFoundConfigured', { stataVersion }));
            return;
        }
        appName = foundApp.name;
        appPath = foundApp.path;
        
        if (context && appPath) {
            context.globalState.update('stataGuiAppPath', appPath);
        }
    }

    const cdEnabled = config.getCdToDoFileDir ? config.getCdToDoFileDir() : false;
    const running = isStataRunning(appName);
    let finalCode = codeToRun;
    if (cdEnabled && !running && docDir) {
        const escapedDir = docDir.replace(/"/g, '\\"');
        finalCode = `cd "${escapedDir}"\n${codeToRun}`;
    }
    fs.writeFileSync(tmpFilePath, finalCode, 'utf8');

    let stataCommand = `osascript -e 'tell application "${appName}" to activate' && `;
    
    stataCommand += `osascript -e 'tell application "${appName}" to DoCommandAsync "do \\"${tmpFilePath}\\""'`;

    exec(stataCommand, (error, stdout, stderr) => {
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
