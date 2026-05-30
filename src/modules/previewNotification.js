/**
 * Preview Version Notification Module (v0.2.15)
 * Shows a modal notification for pre-release users with options to remind later,
 * remind in 7 days, rollback to release version, or learn more.
 * 预览版本通知模块 (v0.2.15)
 */

const vscode = require('vscode');

const PREVIEW_SNOOZE_KEY = 'stata-all-in-one.preview015SnoozeUntil';
const PREVIEW_VERSION = '0.2.15';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const MESSAGES = {
    en: {
        message: 'Stata All in One Preview Version v' + PREVIEW_VERSION + ':\n\nThis is a preview version. If you encounter bugs that affect your workflow, please report them and rollback to the release version (≤v0.2.13)!\n\nThis preview introduces the Embedded Console, Data Viewer and Hover Help, along with significant performance improvements on Windows.',
        remindLater: 'Remind Later',
        remind7Days: 'Remind in 7 Days',
        ok: 'OK',
        rollback: 'Rollback',
        learnMore: 'Learn More',
        resetDone: 'Preview notification snooze state reset. It will show again on next extension activation.',
        rollbackTip: 'On the extension page, click the "Switch to Release Version" button to install the stable release.'
    },
    zh: {
        message: 'Stata All in One 预览版本 v' + PREVIEW_VERSION + '：\n\n这是一个预览版本，如果有Bug影响使用，请及时反馈并回退安装发布版本（≤v0.2.13）！\n\n本次预览版引入了嵌入式控制台、数据查看器和悬停帮助等，同时在 Windows 端带来了显著的性能提升。',
        remindLater: '稍后提醒',
        remind7Days: '7天后提醒',
        ok: '确定',
        rollback: '回退版本',
        learnMore: '了解更多',
        resetDone: '预览版本通知延迟状态已重置。下次激活插件时将再次弹出。',
        rollbackTip: '在拓展页面点击"切换为发布版本"按钮，即可安装正式版。'
    }
};

function getUserLanguage() {
    const lang = (vscode.env.language || '').toLowerCase();
    return lang.startsWith('zh') ? 'zh' : 'en';
}

/**
 * Execute rollback - opens the extension page in VS Code
 * and shows a tip telling users to click "Switch to Release Version"
 */
function executeRollback() {
    const extUri = vscode.Uri.parse('vscode:extension/ZihaoVistonWang.stata-all-in-one');
    vscode.commands.executeCommand('vscode.open', extUri);
    // Show a tip notification with OK button in the bottom-right corner
    const lang = getUserLanguage();
    const t = MESSAGES[lang] || MESSAGES.en;
    vscode.window.showInformationMessage(`Stata All in One: ${t.rollbackTip}`, t.ok);
}

/**
 * Show the preview version notification
 * Only shows if current time is past the snooze timestamp
 */
async function showPreviewNotification(context) {
    const snoozeUntil = context.globalState.get(PREVIEW_SNOOZE_KEY, 0);
    if (Date.now() < snoozeUntil) {
        return;
    }

    const lang = getUserLanguage();
    const t = MESSAGES[lang] || MESSAGES.en;

    const result = await vscode.window.showInformationMessage(
        t.message,
        { modal: true },
        t.remindLater,
        t.remind7Days,
        t.learnMore
    );

    if (result === t.remind7Days) {
        await context.globalState.update(PREVIEW_SNOOZE_KEY, Date.now() + SEVEN_DAYS_MS);
    } else if (result === t.learnMore) {
        const moreUrl = lang === 'zh'
            ? 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#02150214-2026-05-31'
            : 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#02150214-2026-05-31';
        vscode.env.openExternal(vscode.Uri.parse(moreUrl));
    }
    // If "Remind Later" (稍后提醒) or closed, do nothing — will show again on next activation
}

/**
 * Reset the preview notification snooze state (debug command)
 * Clears the snooze timestamp so the notification shows again on next activation
 */
async function resetPreviewNotification(context) {
    await context.globalState.update(PREVIEW_SNOOZE_KEY, 0);
}

module.exports = {
    showPreviewNotification,
    resetPreviewNotification,
    executeRollback,
    MESSAGES,
    PREVIEW_SNOOZE_KEY,
    PREVIEW_VERSION
};
