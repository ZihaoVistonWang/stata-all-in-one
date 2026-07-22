/**
 * Update Notification Module
 * Handles version update notifications with changelog
 * 版本更新提示模块
 */

const vscode = require('vscode');
const { getUserLanguage, showInfo } = require('../utils/common');

// Update changelog: version -> changelog text
const CHANGELOG = {
    en: {
        '0.3.5': {
            ver_info: '✨ Stata All in One (0.3.5): Moved Stata AI Skill online, reducing the Stata All in One extension package to 2.48 MB; fixed Tab recognition between code tokens.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#035-2026-07-22'
        },
        '0.3.4': {
            ver_info: '✨ Stata All in One (0.3.4): Rebuilt the Data Viewer around direct local `.dta` parsing and in-memory Console data access, with isolated snapshots, Stata-style filtering, and safer native execution on macOS and Windows.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#034-2026-07-22'
        },
        '0.3.3': {
            ver_info: '✨ Stata All in One (0.3.3): Improved Embedded Console command compatibility and multi-line `browse` routing, and refined `which` output rendering.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#033-2026-07-21'
        },
        '0.3.2': {
            ver_info: '✨ Stata All in One (0.3.2): Focused on improving Stata initialization and intelligent autocomplete, while adding multi-format Console export, built-in data browsing commands, and Stata AI Skill v1.1.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#032-2026-07-17'
        },
        '0.3.1': {
            ver_info: '✨ Stata All in One (0.3.1): Streamlined Stata startup setup with automatic installation discovery and runtime checks to minimize manual configuration.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#031-2026-07-13'
        },
        '0.3.0': {
            ver_info: '✨ Stata All in One (0.3.0): Fixed known issues from the preview releases.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#030-2026-07-06'
        },
        '0.2.19': {
            ver_info: '✨ Stata All in One (0.2.19): Restored actual graph export execution in the Embedded Console, including PDF and PNG/JPG/JPEG output without sharp native binaries; added online CJK monospace font defaults for aligned mixed-language tables; bundled the standalone native Stata AI Skill and refined console/editor behavior.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.18': {
            ver_info: '✨ Stata All in One (0.2.18): Fixed Windows Embedded Console initialization failure and STATA.LIC detection; fixed webview Service Worker registration error; improved error reporting and console input styling; fixed AI Skill multi-line code execution.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.17': {
            ver_info: '✨ Stata All in One (0.2.17): A major pre-release version. If there are any bugs, please give feedback and re-install v0.2.13! The embedded console, data viewer, bundled native AI Skill and hover help have been introduced, while bringing significant performance improvements on the Windows side.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.16': {
            ver_info: '✨ Stata All in One (0.2.16): A major pre-release version. If there are any bugs, please give feedback and re-install v0.2.13! The embedded console, data viewer, bundled native AI Skill and hover help have been introduced, while bringing significant performance improvements on the Windows side.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.15': {
            ver_info: '✨ Stata All in One (0.2.15): A major pre-release version. If there are any bugs, please give feedback and re-install v0.2.13! The embedded console, data viewer and hover help have been introduced, while bringing significant performance improvements on the Windows side.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.14': {
            ver_info: '✨ Stata All in One (0.2.14): A major pre-release version. If there are any bugs, please give feedback and re-install v0.2.13! The embedded console, data viewer and hover help have been introduced, while bringing significant performance improvements on the Windows side.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.13': {
            ver_info: '✨ Stata All in One (0.2.13): On Windows, running code no longer resets a snapped or maximized Stata window to a smaller size, it will now keep the current window size unchanged.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#Changelog'
        },
        '0.2.12': {
            ver_info: '✨ Stata All in One (0.2.12): Refactored execution logic on Windows, featuring a new option to to close other Stata windows before sending code; added a setting to show "bug" and "sponsor" buttons.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#close_stata_other_windows'
        },
        '0.2.11': {
            ver_info: '✨ Stata All in One (0.2.11): New option to auto `cd` to do file directory on first Stata launch.',
            more_url: 'https://github.com/ZihaoVistonWang/stata-all-in-one#cd-to-do-file-dir'
        },
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
        '0.3.5': {
            ver_info: '✨ Stata All in One (0.3.5)：Stata AI Skill 改为在线安装，Stata All in One拓展包精简至 2.48 MB；修复代码中字符串间的 Tab 命令识别问题。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#035-2026-07-22'
        },
        '0.3.4': {
            ver_info: '✨ Stata All in One (0.3.4)：重构数据查看器，支持本地直读 `.dta` 与直接访问 Console 内存数据，并新增独立快照、Stata 风格筛选及更安全的 macOS/Windows 原生执行。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#034-2026-07-22'
        },
        '0.3.3': {
            ver_info: '✨ Stata All in One (0.3.3)：改进 Embedded Console 命令兼容性与多行 `browse` 路由，优化 `which` 输出显示。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#033-2026-07-21'
        },
        '0.3.2': {
            ver_info: '✨ Stata All in One (0.3.2)：重点优化了 Stata 初始化与智能补全，并新增 Console 多格式导出、内置数据浏览命令及 Stata AI Skill v1.1。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#032-2026-07-17'
        },
        '0.3.1': {
            ver_info: '✨ Stata All in One (0.3.1)：优化 Stata 初始化配置流程，自动完成安装探测与运行环境检查，尽可能减少用户手动配置的情况。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#031-2026-07-13'
        },
        '0.3.0': {
            ver_info: '✨ Stata All in One (0.3.0)：修复预览版中的已知问题。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#030-2026-07-06'
        },
        '0.2.19': {
            ver_info: '✨ Stata All in One (0.2.19)：恢复 Embedded Console 中 graph export 的实际执行，支持 PDF 与 PNG/JPG/JPEG 导出且不再依赖 sharp 原生二进制；默认启用在线 CJK 等宽字体以改善中英混排表格对齐；内置独立原生 Stata AI Skill 并优化控制台/编辑器体验。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.18': {
            ver_info: '✨ Stata All in One (0.2.18)：修复 Windows 嵌入式控制台初始化失败与 STATA.LIC 证书检测；修复 webview Service Worker 注册错误；优化错误信息展示与控制台输入框样式；修复 AI Skill 多行代码执行问题。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.17': {
            ver_info: '✨ Stata All in One (0.2.17)：这是一个预览版本，如果有Bug影响使用，请及时反馈并安装0.2.13版本！引入了嵌入式控制台、数据查看器、内置原生 AI Skill 和悬停帮助等，同时在 Windows 端带来了显著的性能提升。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.16': {
            ver_info: '✨ Stata All in One (0.2.16)：这是一个预览版本，如果有Bug影响使用，请及时反馈并安装0.2.13版本！引入了嵌入式控制台、数据查看器、内置原生 AI Skill 和悬停帮助等，同时在 Windows 端带来了显著的性能提升。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.15': {
            ver_info: '✨ Stata All in One (0.2.15)：这是一个预览版本，如果有Bug影响使用，请及时反馈并安装0.2.13版本！引入了嵌入式控制台、数据查看器和悬停帮助等，同时在 Windows 端带来了显著的性能提升。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.14': {
            ver_info: '✨ Stata All in One (0.2.14)：这是一个预览版本，如果有Bug影响使用，请及时反馈并安装0.2.13版本！引入了嵌入式控制台、数据查看器和悬停帮助等，同时在 Windows 端带来了显著的性能提升。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one/blob/main/CHANGELOG.md#0219-0214-2026-06-18'
        },
        '0.2.13': {
            ver_info: '✨ Stata All in One (0.2.13)：Windows 下运行代码时，不再把已贴靠或最大化 的 Stata 窗口还原成更小的普通窗口，现会保持 Stata 当前窗口大小不变。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#版本记录'
        },
        '0.2.12': {
            ver_info: '✨ Stata All in One (0.2.12)：重构Windows端的代码执行逻辑；Windows端可配置发送代码前是否关闭stata其他窗口；新增配置是否显示“bug“和“打赏“按钮。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#close_stata_other_windows'
        },
        '0.2.11': {
            ver_info: '✨ Stata All in One (0.2.11)：新增可选配置，Stata 首次启动时自动 `cd` 到 do 文件所在目录。',
            more_url: 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#cd-to-do-file-dir'
        },
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
                const sponsorLabel = lang === 'zh' ? '☕ 打赏支持' : '☕ Buy me a coffee';
                showInfo(changelog.ver_info, 'OK', learnMoreLabel, sponsorLabel).then(selection => {
                    if (selection === learnMoreLabel && changelog.more_url) {
                        vscode.env.openExternal(vscode.Uri.parse(changelog.more_url));
                    } else if (selection === sponsorLabel) {
                        const sponsorUrl = lang === 'zh'
                            ? 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#打赏支持'
                            : 'https://github.com/ZihaoVistonWang/stata-all-in-one#sponsor';
                        vscode.env.openExternal(vscode.Uri.parse(sponsorUrl));
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
            const sponsorLabel = lang === 'zh' ? '☕ 打赏支持' : '☕ Buy me a coffee';
            showInfo(changelog.ver_info, 'OK', learnMoreLabel, sponsorLabel).then(selection => {
                if (selection === learnMoreLabel && changelog.more_url) {
                    vscode.env.openExternal(vscode.Uri.parse(changelog.more_url));
                } else if (selection === sponsorLabel) {
                    const sponsorUrl = lang === 'zh'
                        ? 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#打赏支持'
                        : 'https://github.com/ZihaoVistonWang/stata-all-in-one#sponsor';
                    vscode.env.openExternal(vscode.Uri.parse(sponsorUrl));
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
