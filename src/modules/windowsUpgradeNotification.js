/**
 * Windows Upgrade Notification (v0.2.12+)
 * 显示Windows用户关于代码执行逻辑重构的升级提示
 * 
 * This module handles showing an informational message to Windows users
 * when they upgrade to version 0.2.12 or later.
 */

const vscode = require('vscode');
const { isWindows } = require('../utils/common');
const packageJson = require('../../package.json');

// 升级通知的版本号（需要升级提醒的版本）
// Upgrade notification version - update this when you want to trigger notification for new versions
const NOTIFICATION_VERSION = '0.2.12';

const VERSION_KEY = 'stata-all-in-one.windowsUpgradeNotificationVersion';

const UPGRADE_MESSAGES = {
    en: {
        message: 'Stata All in One - Windows Code Execution Refactored!\n\n\n\nThe code execution logic for Windows has been refactored for better stability and performance.\n\nIf Stata doesn\'t launch or run code after sending, please try enabling the setting: "Close Stata Other Windows Before Sending Code" (stata-all-in-one.closeStataOtherWindowsBeforeSendingCode).\n\nFor bug reports, please email hi@zihaowang.cn.',
        ok: 'OK',
        remindLater: 'Remind Me Later'
    },
    zh: {
        message: 'Stata All in One - Windows 代码执行逻辑已重构！\n\n\n\n本次版本重构了 Windows 端执行代码的逻辑，以提供更好的稳定性和性能。\n\n当出现没有唤起 Stata 并运行代码的情况，请首先尝试打开"发送代码前关闭 Stata 其他窗口"选项（设置项 stata-all-in-one.closeStataOtherWindowsBeforeSendingCode）。\n\n如有任何 bug 请反馈给 hi@zihaowang.cn。',
        ok: '确定',
        remindLater: '稍后提醒'
    }
};

/**
 * 获取用户语言
 */
function getUserLanguage() {
    const lang = (vscode.env.language || '').toLowerCase();
    return lang.startsWith('zh') ? 'zh' : 'en';
}

/**
 * 检查是否需要显示升级提示
 * 如果用户从低于NOTIFICATION_VERSION的版本升级到该版本或更高版本，显示提示
 */
function shouldShowUpgradeNotification(context) {
    if (!isWindows()) {
        return false;
    }

    const currentVersion = packageJson.version;
    const storedVersion = context.globalState.get(VERSION_KEY, '0.0.0');
    
    // 比较版本号：如果存储版本 < NOTIFICATION_VERSION，显示提示
    const isVersionUpgrade = compareVersions(storedVersion, NOTIFICATION_VERSION) < 0;
    
    return isVersionUpgrade;
}

/**
 * 简单的版本比较函数
 * 返回: -1 (a < b), 0 (a == b), 1 (a > b)
 */
function compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aPart = aParts[i] || 0;
        const bPart = bParts[i] || 0;
        
        if (aPart < bPart) return -1;
        if (aPart > bPart) return 1;
    }
    
    return 0;
}

/**
 * 显示升级通知
 * 用户可以点击"确定"确认，或点击"稍后提醒"在下次激活时再次显示
 */
async function showWindowsUpgradeNotification(context) {
    if (!shouldShowUpgradeNotification(context)) {
        return;
    }

    const lang = getUserLanguage();
    const msgs = UPGRADE_MESSAGES[lang];

    const result = await vscode.window.showInformationMessage(
        msgs.message,
        { modal: true },
        msgs.ok,
        msgs.remindLater
    );

    // 只有点击"确定"才更新版本号，防止重复显示
    // 点击"稍后提醒"或关闭通知时，不更新版本号，下次启动时会再次显示
    if (result === msgs.ok) {
        await context.globalState.update(VERSION_KEY, packageJson.version);
    }
}

/**
 * 调试命令：强制显示升级通知
 * 用于测试，忽略版本检查
 */
async function forceShowWindowsUpgradeNotification(context) {
    if (!isWindows()) {
        vscode.window.showWarningMessage('This notification is only for Windows users');
        return;
    }

    const lang = getUserLanguage();
    const msgs = UPGRADE_MESSAGES[lang];

    const result = await vscode.window.showInformationMessage(
        msgs.message,
        { modal: true },
        msgs.ok,
        msgs.remindLater
    );

    // 与正常流程一致：只有点击"确定"才更新版本号
    if (result === msgs.ok) {
        await context.globalState.update(VERSION_KEY, packageJson.version);
    }
}

/**
 * 重置升级通知（用于调试）
 * 清除存储的版本号，使得下次启动时再次显示通知
 */
async function resetWindowsUpgradeNotification(context) {
    await context.globalState.update(VERSION_KEY, '0.0.0');
}

module.exports = {
    showWindowsUpgradeNotification,
    forceShowWindowsUpgradeNotification,
    resetWindowsUpgradeNotification
};
