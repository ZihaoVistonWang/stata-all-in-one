/**
 * Stata All in One - VS Code Extension
 * Main entry point for the extension
 */

const vscode = require('vscode');
const { setHeadingLevel, createDocumentSymbolProvider } = require('./modules/outlineView');
const { registerSeparatorCommands } = require('./modules/separator');
const { registerCommentCommand, toggleComment } = require('./modules/comment');
const { registerExecuteCommand } = require('./modules/runCode/execute');
const { runArbitraryCode } = require('./modules/runCode/execute');
const { stopConsoleExecution, forceShutdownConsoleSession } = require('./modules/runCode/embeddedConsole/mac');
const { setWebviewCommandHandler, setWebviewActionHandler, setOverflowNoticeSuppressed, registerWebviewPanelSerializer, clearWebviewTerminalPanel, setWebviewTerminalStatus, setConsoleFontOptions } = require('./modules/runCode/embeddedConsole/panel');
const { registerCustomCommandHighlight } = require('./modules/customCommandHighlight');
const { registerCompletionProvider } = require('./modules/completionProvider');
const { registerVariableSuggestionService } = require('./modules/variableSuggestionService');
const { registerHelpCommand } = require('./modules/helpCommand');
const { registerLineBreakCommand } = require('./modules/lineBreak');
const { registerRenameProvider } = require('./modules/renameProvider');
const { registerUpdateCheck } = require('./modules/updateNotification');
const { findStataApp } = require('./modules/runCode/externalApp/mac');
const { syncConsoleTerminalTheme } = require('./modules/runCode/embeddedConsole/renderer');
const { prewarmConsoleTextmateTokenizer } = require('./modules/runCode/embeddedConsole/textmateTokenizer');
const { registerDtaDataViewer } = require('./modules/runCode/embeddedConsole/dataViewer/dtaEditor');
const { registerHoverProvider, buildHelpIndex, createHoverProvider, DocumentCache } = require('./modules/hoverProvider');
const { isWindows, isMacOS, showInfo, showWarn, msg } = require('./utils/common');
const { startServer: startAIServer, stopServer: stopAIServer, isServerRunning: isAIServerRunning, getServerPort: getAIServerPort } = require('./modules/aiSkill/httpServer');
const { getActiveSession, getConsoleSession, initConsoleSession } = require('./modules/runCode/embeddedConsole/session');
const { findStataDylib } = require('./modules/runCode/embeddedConsole/mac');
const { findStataDll } = require('./modules/runCode/embeddedConsole/windows');

const { ensureConsoleFontCache, getConsoleFontWebviewOptions } = require('./utils/consoleFonts');
const config = require('./utils/config');

// Execution session state context key for "stop" button visibility
const CONSOLE_SESSION_ACTIVE_KEY = 'stata-all-in-one.consoleSessionActive';
const { showPreviewNotification, resetPreviewNotification, executeRollback } = require('./modules/previewNotification');

const MIGRATION_MESSAGES = {
    en: {
        prompt: 'Settings were imported from Stata Outline. You can uninstall Stata Outline to avoid duplicates.',
        uninstall: 'Uninstall Stata Outline',
        remindLater: 'Remind me in 7 days'
    },
    zh: {
        prompt: '已从 Stata Outline 迁移设置。可以卸载 Stata Outline 以避免重复。',
        uninstall: '卸载 Stata Outline',
        remindLater: '稍后提示'
    }
};

const MIGRATION_STATE_KEYS = {
    next: 'stata-all-in-one.migrationNextPrompt'
};

const CONFIG_MAPPING = [
    { old: 'stata-outline.numberingShow', fresh: 'stata-all-in-one.numberingShow' },
    { old: 'stata-outline.numberingAdd', fresh: 'stata-all-in-one.numberingAdd' },
    { old: 'stata-outline.showRunButton', fresh: 'stata-all-in-one.showRunButton' },
    { old: 'stata-outline.stataVersion', fresh: 'stata-all-in-one.stataVersionOnMacOS' },
    { old: 'stata-outline.stataPathOnWindows', fresh: 'stata-all-in-one.stataPathOnWindows' },
    { old: 'stata-outline.commentStyle', fresh: 'stata-all-in-one.commentStyle' },
    { old: 'stata-outline.separatorLength', fresh: 'stata-all-in-one.separatorLength' }
];

const MAC_AUTO_DETECT_KEY = 'stata-all-in-one.macAutoDetectDone';
const EMBEDDED_CONSOLE_OVERFLOW_NOTICE_SUPPRESSED_KEY = 'stata-all-in-one.embeddedConsoleOverflowNoticeSuppressed';

function getUserLanguage() {
    const lang = (vscode.env.language || '').toLowerCase();
    return lang.startsWith('zh') ? 'zh' : 'en';
}

/**
 * Check if Stata Outline extension is installed
 * Returns true if:
 * - Extension is installed from marketplace (in .vscode/extensions/)
 * - Extension is loaded as development extension (but NOT from the same parent directory)
 */
function isStataOutlineInstalled() {
    const extension = vscode.extensions.getExtension('ZihaoVistonWang.stata-outline');
    if (!extension) {
        console.log('Stata All in One: Stata Outline not found');
        return false;
    }
    
    const extPath = extension.extensionPath;
    console.log('Stata All in One: Extension path:', extPath);
    
    // Check if it's a marketplace install
    const isMarketplaceInstall = extPath.includes('.vscode/extensions/') 
        || extPath.includes('.vscode-server/extensions/')
        || extPath.includes('VSCode/extensions/');
    
    if (isMarketplaceInstall) {
        console.log('Stata All in One: Detected marketplace installation');
        return true;
    }
    
    // For development mode: check if it's in a different parent directory than current extension
    // This allows testing with both extensions open, while avoiding false positives
    const currentPath = __dirname; // This extension's path
    const isSameParent = extPath.includes('OneDrive') && currentPath.includes('OneDrive') 
        && extPath.split('/').slice(0, -1).join('/') === currentPath.split('/').slice(0, -2).join('/');
    
    console.log('Stata All in One: Same parent directory:', isSameParent);
    console.log('Stata All in One: Treat as installed:', !isSameParent);
    
    // Consider it "installed" if it's not in the same development workspace
    return !isSameParent;
}

function isConfigUserSet(inspectResult) {
    if (!inspectResult) {
        return false;
    }
    return inspectResult.workspaceValue !== undefined || inspectResult.globalValue !== undefined || inspectResult.workspaceFolderValue !== undefined;
}

function pickTarget(inspectResult) {
    if (!inspectResult) {
        return vscode.ConfigurationTarget.Global;
    }
    if (inspectResult.workspaceValue !== undefined) {
        return vscode.ConfigurationTarget.Workspace;
    }
    if (inspectResult.workspaceFolderValue !== undefined) {
        return vscode.ConfigurationTarget.Workspace;
    }
    return vscode.ConfigurationTarget.Global;
}

/**
 * Migrate settings from Stata Outline to Stata All in One
 * Always checks and migrates if old settings exist and new ones don't
 */
async function migrateSettingsFromOutline() {
    const config = vscode.workspace.getConfiguration();
    let migrated = false;

    for (const map of CONFIG_MAPPING) {
        const oldInspect = config.inspect(map.old);
        if (!isConfigUserSet(oldInspect)) {
            continue;
        }

        const newInspect = config.inspect(map.fresh);
        if (isConfigUserSet(newInspect)) {
            continue;
        }

        const value = oldInspect.workspaceValue !== undefined
            ? oldInspect.workspaceValue
            : (oldInspect.workspaceFolderValue !== undefined ? oldInspect.workspaceFolderValue : oldInspect.globalValue);

        if (value === undefined) {
            continue;
        }

        const target = pickTarget(oldInspect);
        await config.update(map.fresh, value, target);
        migrated = true;
    }

    return migrated;
}

/**
 * Show migration notification to uninstall Stata Outline
 * Only delays notification if user clicks "Remind me later"
 */
async function showMigrationNotification(context) {
    const next = context.globalState.get(MIGRATION_STATE_KEYS.next, 0);
    if (typeof next === 'number' && next > Date.now()) {
        return;
    }

    const lang = getUserLanguage();
    const t = MIGRATION_MESSAGES[lang] || MIGRATION_MESSAGES.en;

    const choice = await showInfo(t.prompt, t.uninstall, t.remindLater);
    
    if (choice === t.uninstall) {
        await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', 'ZihaoVistonWang.stata-outline');
        // Clear the delay timer after uninstall
        await context.globalState.update(MIGRATION_STATE_KEYS.next, 0);
        return;
    }

    if (choice === t.remindLater) {
        // Only set delay if user explicitly clicks "Remind me later"
        await context.globalState.update(MIGRATION_STATE_KEYS.next, Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    // If user closes the notification (choice is undefined), don't set delay
    // Will prompt again next time if extension is still installed
}

/**
 * Reset migration prompt state for debugging purposes
 * 重置迁移提示状态（调试用）
 */
async function resetMigrationPrompt(context) {
    await context.globalState.update(MIGRATION_STATE_KEYS.next, 0);
}

/**
 * Show AI Skill welcome dialog
 * 显示 AI Skill 欢迎弹窗
 * 内容：标题 + 功能介绍 + 提示词预览 + 操作提示
 * 按钮：打开/关闭（醒目）、复制提示词、关闭
 * 复制后弹出中心弹窗告知用户粘贴到 AI 工具
 */
async function showAISkillDialog() {
    const config = vscode.workspace.getConfiguration('stata-all-in-one');
    const aiSkillEnabled = config.get('aiSkillEnabled', true);

    const toggleLabel = aiSkillEnabled
        ? msg('aiSkillToggleDisable')
        : msg('aiSkillToggleEnable');
    const copyLabel = msg('aiSkillCopyBtn');

    // 弹窗内容：欢迎标题 + 介绍 + 操作提示（提示词不显示，只进剪贴板）
    const body = msg('aiSkillWelcomeTitle') + '\n\n'
        + msg('aiSkillWelcomeIntro') + '\n\n'
        + msg('aiSkillWelcomeHint');

    // modal 会自动加一个"取消"按钮，所以这里只要两个自定义按钮
    const choice = await vscode.window.showInformationMessage(
        body,
        { modal: true },
        toggleLabel,
        copyLabel
    );

    if (choice === toggleLabel) {
        const newValue = !aiSkillEnabled;
        await config.update('aiSkillEnabled', newValue, vscode.ConfigurationTarget.Global);
        // 启动/停止由下面的配置监听器统一处理，避免重复弹窗
    } else if (choice === copyLabel) {
        await vscode.env.clipboard.writeText(msg('aiSkillWelcomePrompt'));
        // 中心弹窗，不是右下角 toast
        await vscode.window.showInformationMessage(
            msg('aiSkillCopiedMessage'),
            { modal: true },
            msg('aiSkillCopiedOk')
        );
    }
    // choice === closeLabel 或关闭弹窗 → 什么都不做
}

/**
 * Activate the extension
 */
async function activate(context) {
    console.log('Stata All in One: Extension activated');
    syncConsoleTerminalTheme();
    context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
        syncConsoleTerminalTheme();
    }));

    const refreshConsoleFontOptions = () => {
        setConsoleFontOptions(getConsoleFontWebviewOptions(context));
    };
    
    // Initialize execution session context to false
    vscode.commands.executeCommand('setContext', CONSOLE_SESSION_ACTIVE_KEY, false);
    
    // Check if Stata Outline is installed
    if (isStataOutlineInstalled()) {
        console.log('Stata All in One: Stata Outline detected, checking for migration');
        migrateSettingsFromOutline().then(migrated => {
            console.log('Stata All in One: Settings migrated:', migrated);
            // Always show notification if Stata Outline is installed
            showMigrationNotification(context);
        }).catch(err => {
            console.error('Stata All in One: Migration error:', err);
        });
    } else {
        console.log('Stata All in One: Stata Outline not installed, skipping migration');
    }

    // Check for updates and show notification
    registerUpdateCheck(context);

    // Show preview version notification (≥ v0.2.14, < v0.3.0)
    showPreviewNotification(context);

    try {
        await ensureConsoleFontCache(context);
    } catch (error) {
        console.error('Stata All in One: Failed to initialize console font cache:', error.message);
    }

    // Auto-detect Stata on macOS (one-time reset, then only when empty)
    if (isMacOS()) {
        const config = vscode.workspace.getConfiguration('stata-all-in-one');
        const currentVersion = config.get('stataVersionOnMacOS');
        const autoDetectDone = context.globalState.get(MAC_AUTO_DETECT_KEY, false);
        const shouldAutoDetect = !autoDetectDone || !currentVersion || currentVersion.trim() === '';

        if (shouldAutoDetect) {
            console.log('Stata All in One: Attempting auto-detection of Stata on macOS');
            const autoFound = findStataApp('');

            if (autoFound.path && autoFound.name) {
                config.update('stataVersionOnMacOS', autoFound.name, vscode.ConfigurationTarget.Global)
                    .then(() => {
                        console.log(`Stata All in One: Auto-detected and saved ${autoFound.name}`);
                        showInfo(msg('autoDetectedStata', { appName: autoFound.name, appPath: autoFound.path }));
                    }, (err) => {
                        console.error('Stata All in One: Failed to save auto-detected config:', err);
                    })
                    .then(() => context.globalState.update(MAC_AUTO_DETECT_KEY, true));
            } else {
                const installedList = (autoFound.installed && autoFound.installed.length > 0)
                    ? autoFound.installed.join(', ')
                    : 'none detected';
                console.log('Stata All in One: No Stata installation detected on macOS');
                showWarn(msg('noStataInstalled', { installedList }));
                context.globalState.update(MAC_AUTO_DETECT_KEY, true);
            }
        } else {
            console.log(`Stata All in One: Stata version already configured: ${currentVersion}`);
        }
    }

    // Register heading level commands
    const headingCommands = [
        { id: 'stata-all-in-one.setLevel1', level: 1 },
        { id: 'stata-all-in-one.setLevel2', level: 2 },
        { id: 'stata-all-in-one.setLevel3', level: 3 },
        { id: 'stata-all-in-one.setLevel4', level: 4 },
        { id: 'stata-all-in-one.setLevel5', level: 5 },
        { id: 'stata-all-in-one.setLevel6', level: 6 },
        { id: 'stata-all-in-one.clearHeading', level: 0 }
    ];

    headingCommands.forEach(cmd => {
        const disposable = vscode.commands.registerCommand(cmd.id, () => {
            setHeadingLevel(cmd.level);
        });
        context.subscriptions.push(disposable);
    });

    // Register separator commands
    registerSeparatorCommands(context);

    // Register comment toggle command
    registerCommentCommand(context);

    // Register line break command
    registerLineBreakCommand(context);

    // Register custom command highlighting (native injection grammar)
    registerCustomCommandHighlight(context);
    prewarmConsoleTextmateTokenizer();

    // Register completion provider for Stata commands and functions
    registerVariableSuggestionService(context);
    registerCompletionProvider(context);
    console.log('Stata All in One: Code completion provider registered');

    // Register hover provider for Stata commands (if enabled)
    const enableHoverDocs = vscode.workspace.getConfiguration('stata-all-in-one').get('enableHoverDocs', true);
    if (enableHoverDocs) {
        // Build help index asynchronously (non-blocking)
        buildHelpIndex().then(index => {
            const cache = new DocumentCache(200);
            const provider = createHoverProvider(index, cache);
            const hoverDisposable = vscode.languages.registerHoverProvider(
                { language: 'stata' },
                provider
            );
            context.subscriptions.push(hoverDisposable);
            console.log('Stata All in One: Hover provider registered');
        }).catch(err => {
            console.error('Stata All in One: Failed to build help index:', err);
        });
    } else {
        console.log('Stata All in One: Hover provider disabled in settings');
    }

    // Register rename provider for Stata variables and commands
    registerRenameProvider(context);
    console.log('Stata All in One: Rename provider registered');

    // Register custom rename command to handle F2
    const { executeRename } = require('./modules/renameProvider');
    context.subscriptions.push(
        vscode.commands.registerCommand('stata-all-in-one.rename', executeRename)
    );
    console.log('Stata All in One: Custom rename command registered');

    // Register run code command (uses dispatch layer for Embedded Console/External App routing)
    registerExecuteCommand(context);
    setWebviewCommandHandler(async (code) => {
        await runArbitraryCode(context, code, {
            outputMode: config.RUN_MODES.embeddedConsole
        });
    });
    refreshConsoleFontOptions();
    registerWebviewPanelSerializer(context);
    setOverflowNoticeSuppressed(Boolean(context.globalState.get(EMBEDDED_CONSOLE_OVERFLOW_NOTICE_SUPPRESSED_KEY, false)));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('editor.fontFamily')
            || event.affectsConfiguration('stata-all-in-one.consoleFontMode')
            || event.affectsConfiguration('stata-all-in-one.consoleCustomFontFamily')) {
            refreshConsoleFontOptions();
        }
    }));
    setWebviewActionHandler(async (action) => {
        if (action === 'stopExecution') {
            stopConsoleExecution(context);
            return;
        }

        if (action === 'clearConsole') {
            clearWebviewTerminalPanel();
            setWebviewTerminalStatus('idle');
            return;
        }

        if (action === 'showOverflowNotice') {
            const dismissForeverLabel = msg('webviewOverflowDismissForever');
            const choice = await showInfo(
                msg('webviewOverflowNotice'),
                msg('webviewOverflowConfirm'),
                dismissForeverLabel
            );

            if (choice === dismissForeverLabel) {
                await context.globalState.update(EMBEDDED_CONSOLE_OVERFLOW_NOTICE_SUPPRESSED_KEY, true);
                setOverflowNoticeSuppressed(true);
            }
        }
    });

    // Register stop execution command
    const stopConsoleCommand = vscode.commands.registerCommand(
        'stata-all-in-one.stopConsoleExecution',
        () => {
            stopConsoleExecution(context);
        }
    );
    context.subscriptions.push(stopConsoleCommand);

    // Register help command
    registerHelpCommand(context);

    // Register open settings command
    const openSettingsCommand = vscode.commands.registerCommand(
        'stata-all-in-one.openSettings',
        () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'stata-all-in-one');
        }
    );
    context.subscriptions.push(openSettingsCommand);

    // Register bug report command
    const reportBugCommand = vscode.commands.registerCommand(
        'stata-all-in-one.reportBug',
        () => {
            showInfo(msg('reportBugInfo'));
        }
    );
    context.subscriptions.push(reportBugCommand);

    // Register sponsor command
    const sponsorCommand = vscode.commands.registerCommand(
        'stata-all-in-one.showSponsor',
        () => {
            const lang = getUserLanguage();
            const sponsorUrl = lang === 'zh'
                ? 'https://gitee.com/ZihaoVistonWang/stata-all-in-one#打赏支持'
                : 'https://github.com/ZihaoVistonWang/stata-all-in-one#sponsor';
            vscode.env.openExternal(vscode.Uri.parse(sponsorUrl));
        }
    );
    context.subscriptions.push(sponsorCommand);

    // Register rollback version command
    const rollbackCommand = vscode.commands.registerCommand(
        'stata-all-in-one.rollbackVersion',
        () => {
            executeRollback();
        }
    );
    context.subscriptions.push(rollbackCommand);

    // Register data viewer command
    const { revealDataViewer } = require('./modules/runCode/embeddedConsole/dataViewer/panel');
    const dataViewerCommand = vscode.commands.registerCommand(
        'stata-all-in-one.showDataViewer',
        (filterText) => {
            revealDataViewer(typeof filterText === 'string' ? filterText : '');
        }
    );
    context.subscriptions.push(dataViewerCommand);
    registerDtaDataViewer(context);

    // Register document symbol provider for outline view
    const provider = createDocumentSymbolProvider();
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: "stata" },
            provider
        )
    );

    // Register reset Stata version on macOS command
    const resetMacVersionCommand = vscode.commands.registerCommand(
        'stata-all-in-one.resetStataVersionOnMacOS',
        async () => {
            if (!isMacOS()) {
                showWarn(msg('macOnlyCommand'));
                return;
            }

            await vscode.workspace.getConfiguration('stata-all-in-one').update(
                'stataVersionOnMacOS',
                '',
                vscode.ConfigurationTarget.Global
            );
            await context.globalState.update(MAC_AUTO_DETECT_KEY, false);
            showInfo(msg('macVersionReset'));
        }
    );
    context.subscriptions.push(resetMacVersionCommand);

    // Register debug reset migration prompt command
    const resetPromptCommand = vscode.commands.registerCommand(
        'stata-all-in-one.debugResetMigrationPrompt',
        async () => {
            console.log('Stata All in One: Debug reset command executed');
            await resetMigrationPrompt(context);
            const { showInfo, msg } = require('./utils/common');
            
            // Only show notification if Stata Outline is installed
            if (isStataOutlineInstalled()) {
                showInfo(msg('resetDone'));
                await showMigrationNotification(context);
            } else {
                showInfo('Migration state reset. Stata Outline is not installed, no notification shown.');
            }
        }
    );
    context.subscriptions.push(resetPromptCommand);

    // Register debug test update notification command
    const testUpdateCommand = vscode.commands.registerCommand(
        'stata-all-in-one.debugTestUpdateNotification',
        async () => {
            console.log('Stata All in One: Debug test update notification command executed');
            const { checkAndNotifyUpdate } = require('./modules/updateNotification');
            
            // Reset version to trigger update notification
            const packageJson = require('../package.json');
            const currentVersion = packageJson.version;
            
            // Reset stored version to trigger notification
            await context.globalState.update('stata-all-in-one.lastSeenVersion', '0.0.0');
            
            // Show update notification
            checkAndNotifyUpdate(context);
            
            const { showInfo } = require('./utils/common');
            showInfo(`Debug: Reset version to 0.0.0, showing notification for v${currentVersion}`);
        }
    );
    context.subscriptions.push(testUpdateCommand);

    const resetEmbeddedConsoleOverflowNoticeCommand = vscode.commands.registerCommand(
        'stata-all-in-one.debugResetEmbeddedConsoleOverflowNotice',
        async () => {
            console.log('Stata All in One: Debug reset embedded console overflow notice command executed');
            await context.globalState.update(EMBEDDED_CONSOLE_OVERFLOW_NOTICE_SUPPRESSED_KEY, false);
            setOverflowNoticeSuppressed(false);
            showInfo('Embedded console overflow notice reset. It will show again when output overflows.');
        }
    );
    context.subscriptions.push(resetEmbeddedConsoleOverflowNoticeCommand);

    // Register debug command: Reset preview notification
    const resetPreviewNotificationCommand = vscode.commands.registerCommand(
        'stata-all-in-one.debugResetPreviewNotification',
        async () => {
            console.log('Stata All in One: Debug reset preview notification command executed');
            await resetPreviewNotification(context);
            const { MESSAGES } = require('./modules/previewNotification');
            const lang = getUserLanguage();
            const t = MESSAGES[lang] || MESSAGES.en;
            showInfo(t.resetDone);
        }
    );
    context.subscriptions.push(resetPreviewNotificationCommand);

    // ========== AI Skill ==========

    // Register AI Skill dialog command (editor title button)
    const showAISkillDialogCommand = vscode.commands.registerCommand(
        'stata-all-in-one.showAISkillDialog',
        () => showAISkillDialog()
    );
    context.subscriptions.push(showAISkillDialogCommand);

    // Shared helper: ensure Stata session is initialized and start HTTP server
    const ensureSessionAndStartServer = async () => {
        if (isAIServerRunning()) return true;

        let session = getActiveSession();
        if (!session || !session.isInitialized()) {
            const cfg = vscode.workspace.getConfiguration('stata-all-in-one');
            let libPath = null;

            if (isWindows()) {
                const dllInfo = findStataDll();
                if (!dllInfo || !dllInfo.path) {
                    console.log('Stata All in One: [AI Skill] Stata DLL not found');
                    return false;
                }
                libPath = dllInfo.path;
            } else {
                const savedPath = context.globalState.get('stataConsoleDylibPath');
                const preferredEdition = (cfg.get('stataVersionOnMacOS') || '').replace('Stata', '').toLowerCase();
                const dylibInfo = findStataDylib(preferredEdition, savedPath);
                if (!dylibInfo || !dylibInfo.path) {
                    console.log('Stata All in One: [AI Skill] Stata dylib not found');
                    return false;
                }
                libPath = dylibInfo.path;
            }

            session = getConsoleSession(context);
            const initResult = await session.init(libPath);
            if (!initResult.success) {
                console.log('Stata All in One: [AI Skill] Session init failed:', initResult.error);
                return false;
            }

            await session.execute('quietly set more off', false);
            await session.execute('quietly set linesize 255', false);
            // 启用图形捕获，防止画图命令弹出 GUI 窗口阻塞会话
            await session.execute('quietly _gr_list on', false);
            session.setBootstrapped(true);
            console.log('Stata All in One: [AI Skill] Stata session initialized');
        }

        // 确保图形捕获已启用（每次启动服务器都执行，防止画图命令弹出 GUI 窗口阻塞会话）
        try { await session.execute('quietly _gr_list on', false); } catch (_) { /* ignore */ }

        const port = vscode.workspace.getConfiguration('stata-all-in-one').get('aiSkillPort', 19521);
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || null;
        return await startAIServer(session, port, wsRoot);
    };

    // Register start AI server command
    const startAIServerCommand = vscode.commands.registerCommand(
        'stata-all-in-one.startAIServer',
        async () => {
            const ok = await ensureSessionAndStartServer();
            if (ok) {
                const port = vscode.workspace.getConfiguration('stata-all-in-one').get('aiSkillPort', 19521);
                showInfo(`AI Skill server started on http://127.0.0.1:${port}`);
            } else {
                showWarn(msg('aiSkillServerFailed') || 'Failed to start AI Skill server. Check console for details.');
            }
        }
    );
    context.subscriptions.push(startAIServerCommand);

    // Register stop AI server command
    const stopAIServerCommand = vscode.commands.registerCommand(
        'stata-all-in-one.stopAIServer',
        () => {
            if (isAIServerRunning()) {
                stopAIServer();
                showInfo('AI Skill server stopped.');
            } else {
                showInfo('AI Skill server is not running.');
            }
        }
    );
    context.subscriptions.push(stopAIServerCommand);

    // Auto-start AI server if enabled
    const aiSkillEnabled = vscode.workspace.getConfiguration('stata-all-in-one').get('aiSkillEnabled', true);
    if (aiSkillEnabled) {
        let autoStartNotified = false;
        const tryAutoStart = async () => {
            try {
                const ok = await ensureSessionAndStartServer();
                if (ok && !autoStartNotified) {
                    autoStartNotified = true;
                    const port = vscode.workspace.getConfiguration('stata-all-in-one').get('aiSkillPort', 19521);
                    console.log(`Stata All in One: [AI Skill] Server auto-started on port ${port}`);
                    showInfo(msg('aiSkillServerStarted', { port }));
                }
            } catch (err) {
                console.error('Stata All in One: [AI Skill] Auto-start failed:', err.message);
            }
        };

        // Try immediately and defer for delayed session availability
        tryAutoStart();
        setTimeout(tryAutoStart, 5000);

    }

    // Listen for AI Skill config changes (always registered)
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('stata-all-in-one.aiSkillEnabled')) {
            const enabled = vscode.workspace.getConfiguration('stata-all-in-one').get('aiSkillEnabled', true);
            if (enabled && !isAIServerRunning()) {
                vscode.commands.executeCommand('stata-all-in-one.startAIServer');
            } else if (!enabled && isAIServerRunning()) {
                stopAIServer();
                showInfo('AI Skill server stopped (disabled in settings).');
            }
        }
    }));

    console.log('Stata All in One: AI Skill commands registered');
    console.log('Stata All in One: All commands registered');
}

/**
 * Deactivate the extension
 */
function deactivate() {
    // Shutdown AI Skill HTTP server
    stopAIServer();
    forceShutdownConsoleSession();
    // Shutdown COM automation service if initialized
    try {
        const { getComService } = require('./modules/runCode/externalApp/comService');
        const svc = getComService(null);
        if (svc) svc.shutdown();
    } catch { /* extension may be in a state where require fails */ }
}

module.exports = { 
    activate, 
    deactivate, 
    CONSOLE_SESSION_ACTIVE_KEY 
};
