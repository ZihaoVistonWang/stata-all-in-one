/**
 * Update Notification Module
 * Handles version update notifications with changelog
 * 版本更新提示模块
 */

const vscode = require('vscode');
const { getUserLanguage } = require('../utils/common');

// Update changelog: version -> changelog text
const CHANGELOG = {
    en: {
        '0.2.10': {
            ver_info: '✨ Stata All in One (0.2.10): Section/Line/Selection execution modes, configurable run shortcut, and F2 rename with option detection.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#code_execution'
        },
        '0.2.9': {
            ver_info: '✨ Stata All in One (0.2.9): Fixed custom command highlighting in comments.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#Changelog'
        },
        '0.2.8': {
            ver_info: '✨ Stata All in One (0.2.8): Fixed an issue with title numbering.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#Changelog'
        },
        '0.2.7': {
            ver_info: '✨ Stata All in One (0.2.7): Switch macOS runner to async AppleScript for faster start/execute, and add outline support for `program define` blocks.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#Changelog'
        },
        '0.2.6': {
            ver_info: '✨ Stata All in One (0.2.6): macOS Stata auto-detection (Stata 19+), separator symmetric setting with bulk update, and help shortcut set to `Ctrl/Cmd+Shift+H`.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#separatorSymmetric'
        },
        '0.2.5': {
            ver_info: '✨ Stata All in One (0.2.5): Smart Line Break - New smart line break feature (Shift+Enter) with auto-indentation and formatting for Stata code.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#line-break'
        },
        '0.2.4': {
            ver_info: '✨ Stata All in One (0.2.4): Added Stata help functionality and fixed some known issues.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#Changelog'
        }
    },
    zh: {
        '0.2.10': {
            ver_info: '✨ Stata All in One (0.2.10)：重构"章节/单行/选中"代码运行逻辑、可选运行快捷键配置、变量按f2可全局重命名。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#code_execution'
        },
        '0.2.9': {
            ver_info: '✨ Stata All in One (0.2.9)：修复了自定义命令在注释中仍显示高亮颜色的问题。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#版本记录'
        },
        '0.2.8': {
            ver_info: '✨ Stata All in One (0.2.8)：修复了关于标题序号的已知问题',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#版本记录'
        },
        '0.2.7': {
            ver_info: '✨ Stata All in One (0.2.7)：mac 运行逻辑改为异步以提升启动与执行响应；大纲视图新增对 program define 代码块的识别。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#版本记录'
        },
        '0.2.6': {
            ver_info: '✨ Stata All in One (0.2.6)：macOS 版 Stata 自动检测（支持 Stata 19+），新增分隔线“对称”配置与批量更新命令，帮助快捷键改为 `Ctrl/Cmd+Shift+H`。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#separatorSymmetric'
        },
        '0.2.5': {
            ver_info: '✨ Stata All in One (0.2.5)：智能换行 - 新增智能换行功能（Shift+Enter），支持 Stata 代码自动缩进和格式化。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#line-break'
        },
        '0.2.4': {
            ver_info: '✨ Stata All in One (0.2.4)：添加了 Stata 帮助功能，修复了一些已知问题。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#版本记录'
        }
    }
};

/**
 * Get changelog for a specific version
 */
function getChangelog(version, lang = 'en') {
    const langChangelog = CHANGELOG[lang] || CHANGELOG.en;
    return langChangelog[version] || null;
}

/**
 * Check for updates and show notification
 */
function checkAndNotifyUpdate(context) {
    try {
        // Get current version from package.json
        let currentVersion = '0.0.0';
        try {
            const packageJson = require('../../package.json');
            currentVersion = packageJson.version;
        } catch (e) {
            console.log('Stata All in One: Failed to read package.json:', e.message);
            return;
        }

        // Get last seen version from global state
        const lastSeenVersion = context.globalState.get('stata-all-in-one.lastSeenVersion');
        
        // If no last seen version, this might be an upgrade from old version (before update notification feature)
        // Show notification for current version, then store it
        if (!lastSeenVersion) {
            const lang = getUserLanguage();
            const changelog = getChangelog(currentVersion, lang);
            
            if (changelog) {
                const learnMoreLabel = lang === 'zh' ? '了解更多' : 'Learn More';
                vscode.window.showInformationMessage(changelog.ver_info, 'OK', learnMoreLabel).then(selection => {
                    if (selection === learnMoreLabel && changelog.more_url) {
                        vscode.env.openExternal(vscode.Uri.parse(changelog.more_url));
                    }
                });
            }
            
            context.globalState.update('stata-all-in-one.lastSeenVersion', currentVersion);
            console.log('Stata All in One: First time or upgrade from old version, showing notification for', currentVersion);
            return;
        }

        // Compare versions
        if (currentVersion === lastSeenVersion) {
            // No update
            return;
        }

        // Version changed - show notification
        const lang = getUserLanguage();
        const changelog = getChangelog(currentVersion, lang);

        if (changelog) {
            const learnMoreLabel = lang === 'zh' ? '了解更多' : 'Learn More';
            vscode.window.showInformationMessage(changelog.ver_info, 'OK', learnMoreLabel).then(selection => {
                if (selection === learnMoreLabel && changelog.more_url) {
                    vscode.env.openExternal(vscode.Uri.parse(changelog.more_url));
                }
            });
        }

        // Update stored version
        context.globalState.update('stata-all-in-one.lastSeenVersion', currentVersion);

        console.log('Stata All in One: Version update notification shown for', currentVersion);
    } catch (error) {
        console.log('Stata All in One: Error checking for updates:', error.message);
    }
}

/**
 * Register update check on extension activation
 */
function registerUpdateCheck(context) {
    try {
        checkAndNotifyUpdate(context);
    } catch (error) {
        console.log('Stata All in One: Failed to register update check:', error.message);
    }
}

module.exports = {
    getChangelog,
    checkAndNotifyUpdate,
    registerUpdateCheck
};
