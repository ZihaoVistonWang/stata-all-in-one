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
    const baseDirs = ['/Applications', '/Applications/Stata', '/Applications/StataNow'];
    const apps = [];
    const seen = new Set();

    // Scan directories for Stata apps
    for (const dir of baseDirs) {
        try {
            if (!fs.existsSync(dir)) continue;
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || !entry.name.endsWith('.app')) continue;
                
                const appName = entry.name.slice(0, -4);
                if (!/stata/i.test(appName)) continue;
                
                const appPath = path.join(dir, entry.name);
                if (!seen.has(appName)) {
                    seen.add(appName);
                    apps.push({ name: appName, path: appPath });
                }
            }
        } catch (e) {
            // Ignore directory read errors
        }
    }

    // Sort by preferred order
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
    
    // Use user's preferred version if found, otherwise use first by priority
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
        installed 
    };
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
    
    let appName;

    // Only scan if config is empty, otherwise use configured version
    if (!stataVersion || stataVersion.trim() === '') {
        const foundApp = findStataApp('');
        if (!foundApp.name) {
            const installedList = (foundApp.installed && foundApp.installed.length > 0)
                ? foundApp.installed.join(', ')
                : 'none detected';
            showError(msg('noStataInstalled', { installedList }));
            return;
        }
        appName = foundApp.name;
    } else {
        // Verify configured version exists
        const candidates = [
            `/Applications/${stataVersion}.app`,
            `/Applications/Stata/${stataVersion}.app`,
            `/Applications/StataNow/${stataVersion}.app`
        ];
        const exists = candidates.some(p => fs.existsSync(p));
        if (!exists) {
            showError(msg('stataNotFoundConfigured', { stataVersion }));
            return;
        }
        appName = stataVersion;
    }

    // Activate window first if needed, then close help windows and run code
    // 先激活窗口（视觉反馈更快），再执行关闭帮助窗口和运行代码
    let stataCommand = '';
    
    if (isHelpCommand || activateStataWindow) {
        stataCommand = `osascript -e 'tell application "${appName}" to activate' && `;
    }
    
    // Please uncomment the following line if you want to close all help windows before running code
    // 如果需要先关闭帮助窗口，则将下面的命令取消注释
    // stataCommand += `osascript -e 'tell application "${appName}" to DoCommandAsync "window manage close viewer _all"' && `;

    stataCommand += `osascript -e 'tell application "${appName}" to DoCommandAsync "do \\"${tmpFilePath}\\""'`;

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
