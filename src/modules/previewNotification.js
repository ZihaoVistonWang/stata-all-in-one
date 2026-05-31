/**
 * Preview Version Notification Module
 * Shows a modal notification for pre-release versions (≥ v0.2.14, < v0.3.0)
 * 预览版本通知模块（≥ v0.2.14，< v0.3.0 之间的版本都会显示）
 */

const vscode = require('vscode');

const PREVIEW_SNOOZE_KEY = 'stata-all-in-one.previewSnoozeUntil';
const PREVIEW_MIN_VERSION = '0.2.14';
const PREVIEW_MAX_VERSION = '0.3.0';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getVersion() {
    try {
        return require('../../package.json').version;
    } catch {
        return '0.0.0';
    }
}

function isPreviewVersion(version) {
    // Compare: show for versions >= 0.2.14 and < 0.3.0
    return compareVersions(version, PREVIEW_MIN_VERSION) >= 0
        && compareVersions(version, PREVIEW_MAX_VERSION) < 0;
}

function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
}

function getMessage(lang, version) {
    if (lang === 'zh') {
        return 'Stata All in One 预览版本 v' + version + '：\n\n这是一个预览版本，如果有Bug影响使用，请及时反馈并回退安装发布版本（≤v0.2.13）！\n\n预览版引入了嵌入式控制台、数据查看器、AI Skill 功能和悬停帮助等，同时在 Windows 端带来了显著的性能提升。';
    }
    return 'Stata All in One Preview Version v' + version + ':\n\nThis is a preview version. If you encounter bugs that affect your workflow, please report them and rollback to the release version (≤v0.2.13)!\n\nThe preview introduces the Embedded Console, Data Viewer, AI Skill and Hover Help, along with significant performance improvements on Windows.';
}

const MESSAGES = {
    en: {
        remindLater: 'Remind Later',
        remind7Days: 'Remind in 7 Days',
        ok: 'OK',
        rollback: 'Rollback',
        learnMore: 'Learn More',
        resetDone: 'Preview notification snooze state reset. It will show again on next extension activation.',
        rollbackTip: 'On the extension page, click the "Switch to Release Version" button to install the stable release.'
    },
    zh: {
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
    const lang = getUserLanguage();
    const t = MESSAGES[lang] || MESSAGES.en;
    vscode.window.showInformationMessage(`Stata All in One: ${t.rollbackTip}`, t.ok);
}

/**
 * Show the preview version notification
 * Only shows for preview versions (≥ v0.2.14, < v0.3.0) and if not snoozed
 */
async function showPreviewNotification(context) {
    const currentVersion = getVersion();
    if (!isPreviewVersion(currentVersion)) {
        console.log('Stata All in One: Version', currentVersion, 'is not a preview version, skipping notification');
        return;
    }

    const snoozeUntil = context.globalState.get(PREVIEW_SNOOZE_KEY, 0);
    if (Date.now() < snoozeUntil) {
        return;
    }

    const lang = getUserLanguage();
    const t = MESSAGES[lang] || MESSAGES.en;
    const message = getMessage(lang, currentVersion);

    const result = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        t.remindLater,
        t.remind7Days,
        t.learnMore
    );

    if (result === t.remind7Days) {
        await context.globalState.update(PREVIEW_SNOOZE_KEY, Date.now() + SEVEN_DAYS_MS);
    } else if (result === t.learnMore) {
        const moreUrl = lang === 'zh'
            ? 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0216-0214-2026-05-31'
            : 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0216-0214-2026-05-31';
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
    isPreviewVersion
};
