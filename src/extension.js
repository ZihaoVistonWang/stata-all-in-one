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
const { syncConsoleTerminalTheme } = require('./modules/runCode/embeddedConsole/renderer');
const { prewarmConsoleTextmateTokenizer } = require('./modules/runCode/embeddedConsole/textmateTokenizer');
const { registerDtaDataViewer } = require('./modules/runCode/embeddedConsole/dataViewer/dtaEditor');
const { registerHoverProvider, buildHelpIndex, createHoverProvider, DocumentCache } = require('./modules/hoverProvider');
const { isWindows, isMacOS, showInfo, showWarn, showConsoleUnavailableToast, msg } = require('./utils/common');

const { ensureConsoleFontCache, getConsoleFontWebviewOptions } = require('./utils/consoleFonts');
const capability = require('./modules/capability');
const config = require('./utils/config');
const { discoverStataInstallationsFromRegistry } = require('./modules/runCode/windowsStataDiscovery');
const {
    DISCOVERY_TIMEOUT_MS,
    ensureStataConfigured,
    resetStataDiscoveryState
} = require('./modules/runCode/stataInstallationResolver');
const {
    resetStataSetupState,
    startStartupStataSetup
} = require('./modules/runCode/stataSetupManager');

// Execution session state context key for "stop" button visibility
const CONSOLE_SESSION_ACTIVE_KEY = 'stata-all-in-one.consoleSessionActive';

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
    { old: 'stata-outline.stataVersion', fresh: 'stata-all-in-one.stataVersionOnMacOS' },
    { old: 'stata-outline.stataPathOnWindows', fresh: 'stata-all-in-one.stataPathOnWindows' },
    { old: 'stata-outline.commentStyle', fresh: 'stata-all-in-one.commentStyle' },
    { old: 'stata-outline.separatorLength', fresh: 'stata-all-in-one.separatorLength' }
];

const DEPRECATED_CONFIG_KEYS = [
    'stata-all-in-one.showRunButton'
];

const EMBEDDED_CONSOLE_OVERFLOW_NOTICE_SUPPRESSED_KEY = 'stata-all-in-one.embeddedConsoleOverflowNoticeSuppressed';

function getUserLanguage() {
    const lang = (vscode.env.language || '').toLowerCase();
    return lang.startsWith('zh') ? 'zh' : 'en';
}

async function replaceConfigurationAtGlobalScope(extensionConfig, key, value) {
    const inspected = extensionConfig.inspect(key);
    if (inspected && inspected.workspaceFolderValue !== undefined) {
        await extensionConfig.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    }
    if (inspected && inspected.workspaceValue !== undefined) {
        await extensionConfig.update(key, undefined, vscode.ConfigurationTarget.Workspace);
    }
    await extensionConfig.update(key, value, vscode.ConfigurationTarget.Global);
}

async function resetStataSetupForDebug(context, extensionConfig) {
    await resetStataSetupState(context);
    await capability.setCapabilityState(context, 'unverified');
    await replaceConfigurationAtGlobalScope(
        extensionConfig,
        'runMode',
        config.RUN_MODES.embeddedConsole
    );
    await context.globalState.update('stata-all-in-one.consoleLicenseDialogSuppressed', undefined);
    await context.globalState.update('stata-all-in-one.consoleLicenseDialogNextReminder', undefined);
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

async function clearDeprecatedSettings() {
    const config = vscode.workspace.getConfiguration();

    for (const key of DEPRECATED_CONFIG_KEYS) {
        const inspected = config.inspect(key);
        if (!inspected) {
            continue;
        }

        if (inspected.globalValue !== undefined) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        }
        if (inspected.workspaceValue !== undefined) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Workspace);
        }
    }
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
 * 内容：标题 + 功能介绍 + 安装提示
 * 按钮：复制提示词、关闭
 * 复制后弹出中心弹窗告知用户粘贴到 AI 工具
 */
async function showAISkillDialog() {
    const copyLabel = msg('aiSkillCopyBtn');

    // 弹窗内容：欢迎标题 + 介绍 + 操作提示（提示词不显示，只进剪贴板）
    const body = msg('aiSkillWelcomeTitle') + '\n\n'
        + msg('aiSkillWelcomeIntro') + '\n\n'
        + msg('aiSkillWelcomeHint');

    // modal 会自动加一个"取消"按钮，所以这里只要两个自定义按钮
    const choice = await vscode.window.showInformationMessage(
        body,
        { modal: true },
        copyLabel
    );

    if (choice === copyLabel) {
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

    // Initialize capability state (UNVERIFIED → CONSOLE | EXTERNAL)
    capability.initCapabilityState(context);

    clearDeprecatedSettings().catch(err => {
        console.error('Stata All in One: Failed to clear deprecated settings:', err);
    });
    
    // Check if Stata Outline is installed. Startup discovery waits for this
    // promise so an imported path/version always wins over auto-detection.
    let settingsReadyPromise = Promise.resolve(false);
    if (isStataOutlineInstalled()) {
        console.log('Stata All in One: Stata Outline detected, checking for migration');
        settingsReadyPromise = migrateSettingsFromOutline().then(migrated => {
            console.log('Stata All in One: Settings migrated:', migrated);
            // Always show notification if Stata Outline is installed
            showMigrationNotification(context);
            return migrated;
        }).catch(err => {
            console.error('Stata All in One: Migration error:', err);
            return false;
        });
    } else {
        console.log('Stata All in One: Stata Outline not installed, skipping migration');
    }

    // Begin setup as soon as migration is settled. Registration continues in
    // parallel, while activation itself remains pending until the user has
    // explicitly acknowledged the central setup result.
    const startupStataSetupPromise = startStartupStataSetup(context, settingsReadyPromise);

    // Check for updates and show notification
    registerUpdateCheck(context);

    try {
        await ensureConsoleFontCache(context);
    } catch (error) {
        console.error('Stata All in One: Failed to initialize console font cache:', error.message);
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
            await context.globalState.update('stataGuiAppPath', undefined);
            await context.globalState.update('stataConsoleDylibPath', undefined);
            resetStataDiscoveryState('darwin');
            await resetStataSetupState(context);
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

    const stataDiscoveryOutput = vscode.window.createOutputChannel('Stata Installation Discovery');
    context.subscriptions.push(stataDiscoveryOutput);

    const debugDiscoverStataOnWindowsCommand = vscode.commands.registerCommand(
        'stata-all-in-one.debugDiscoverStataOnWindows',
        async () => {
            if (!isWindows()) {
                showWarn(getUserLanguage() === 'zh'
                    ? '此调试命令仅支持 Windows。'
                    : 'This debug command is available on Windows only.');
                return;
            }

            stataDiscoveryOutput.clear();
            stataDiscoveryOutput.appendLine('Stata All in One - Windows registry discovery');
            stataDiscoveryOutput.appendLine(`Started: ${new Date().toISOString()}`);
            stataDiscoveryOutput.appendLine(`Timeout: ${DISCOVERY_TIMEOUT_MS} ms`);
            stataDiscoveryOutput.appendLine('');
            stataDiscoveryOutput.show(true);

            const result = await discoverStataInstallationsFromRegistry({ timeoutMs: DISCOVERY_TIMEOUT_MS });
            stataDiscoveryOutput.appendLine(`Elapsed: ${result.elapsedMs} ms`);
            stataDiscoveryOutput.appendLine(`Timed out: ${result.timedOut ? 'yes' : 'no'}`);
            stataDiscoveryOutput.appendLine(`Matched registry keys: ${result.searchedKeys}`);
            stataDiscoveryOutput.appendLine(`Valid Stata executables: ${result.candidates.length}`);

            result.candidates.forEach((candidate, index) => {
                stataDiscoveryOutput.appendLine('');
                stataDiscoveryOutput.appendLine(`[${index + 1}] ${candidate.displayName}`);
                stataDiscoveryOutput.appendLine(`EXE: ${candidate.executablePath}`);
                stataDiscoveryOutput.appendLine(`Edition: ${candidate.edition || 'unknown'}`);
                stataDiscoveryOutput.appendLine(`Version: ${candidate.version || 'unknown'}`);
                stataDiscoveryOutput.appendLine(`Matching DLL: ${candidate.hasMatchingDll ? 'yes' : 'no'}`);
                if (candidate.dllPath) {
                    stataDiscoveryOutput.appendLine(`DLL: ${candidate.dllPath}`);
                }
                stataDiscoveryOutput.appendLine(`stata.lic: ${candidate.hasLicense ? 'yes' : 'no'}`);
                stataDiscoveryOutput.appendLine(`Registry (${candidate.registryView}-bit view): ${candidate.registryKey}`);
            });

            if (result.errors.length) {
                stataDiscoveryOutput.appendLine('');
                stataDiscoveryOutput.appendLine('Non-timeout registry errors:');
                result.errors.forEach(error => stataDiscoveryOutput.appendLine(`- ${error}`));
            }

            const language = getUserLanguage();
            const summary = result.candidates.length
                ? (language === 'zh'
                    ? `Windows Stata 探测完成：${result.elapsedMs} ms，找到 ${result.candidates.length} 个可执行文件。`
                    : `Windows Stata discovery completed in ${result.elapsedMs} ms with ${result.candidates.length} executable(s).`)
                : (language === 'zh'
                    ? `Windows Stata 探测完成：${result.elapsedMs} ms，未找到可用路径${result.timedOut ? '（已超时）' : ''}。`
                    : `Windows Stata discovery completed in ${result.elapsedMs} ms with no valid path${result.timedOut ? ' (timed out)' : ''}.`);
            showInfo(summary);
        }
    );
    context.subscriptions.push(debugDiscoverStataOnWindowsCommand);

    const debugInitializeStataAutoDiscoveryCommand = vscode.commands.registerCommand(
        'stata-all-in-one.debugInitializeStataAutoDiscovery',
        async () => {
            const extensionConfig = vscode.workspace.getConfiguration('stata-all-in-one');
            if (isWindows()) {
                await replaceConfigurationAtGlobalScope(extensionConfig, 'stataPathOnWindows', '');
                resetStataDiscoveryState('win32');
            } else if (isMacOS()) {
                await replaceConfigurationAtGlobalScope(extensionConfig, 'stataVersionOnMacOS', '');
                await context.globalState.update('stataGuiAppPath', undefined);
                await context.globalState.update('stataConsoleDylibPath', undefined);
                resetStataDiscoveryState('darwin');
            } else {
                showWarn(getUserLanguage() === 'zh'
                    ? 'Stata 自动探测仅支持 Windows 和 macOS。'
                    : 'Stata auto-discovery is available on Windows and macOS only.');
                return;
            }

            await resetStataSetupForDebug(context, extensionConfig);
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    );
    context.subscriptions.push(debugInitializeStataAutoDiscoveryCommand);

    const debugResetStataSetupStateCommand = vscode.commands.registerCommand(
        'stata-all-in-one.debugResetStataSetupState',
        async () => {
            const extensionConfig = vscode.workspace.getConfiguration('stata-all-in-one');
            await resetStataSetupForDebug(context, extensionConfig);
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    );
    context.subscriptions.push(debugResetStataSetupStateCommand);

    // ========== Diagnose Console ==========

    // Register diagnose console command
    const diagnoseConsoleCommand = vscode.commands.registerCommand(
        'stata-all-in-one.diagnoseConsole',
        async () => {
            console.log('Stata All in One: Diagnose console command triggered');
            try {
                let ensureConsoleSessionFn;
                if (isWindows()) {
                    const resolved = await ensureStataConfigured(context, { promptOnFailure: true });
                    if (!resolved) return;
                    ensureConsoleSessionFn = require('./modules/runCode/embeddedConsole/windows').ensureConsoleSession;
                } else if (isMacOS()) {
                    const resolved = await ensureStataConfigured(context, { promptOnFailure: true });
                    if (!resolved) return;
                    ensureConsoleSessionFn = require('./modules/runCode/embeddedConsole/mac').ensureConsoleSession;
                } else {
                    showInfo(msg('unsupportedPlatform'));
                    return;
                }

                const result = await ensureConsoleSessionFn(context);
                if (result.success) {
                    await capability.setCapabilityState(context, 'console');
                    showInfo(result.fromExisting
                        ? msg('diagnoseConsoleRunning')
                        : msg('diagnoseConsoleAvailable'));
                } else {
                    showConsoleUnavailableToast(result);
                    // Only transition to external if not already console
                    if (capability.getCapabilityState() !== 'console') {
                        await capability.setCapabilityState(context, 'external');
                    }
                }
            } catch (err) {
                console.error('Stata All in One: Diagnose console error:', err.message);
                showError(`Diagnose failed: ${err.message}`);
            }
        }
    );
    context.subscriptions.push(diagnoseConsoleCommand);

    // ========== AI Skill ==========

    // Register AI Skill dialog command (editor title button)
    const showAISkillDialogCommand = vscode.commands.registerCommand(
        'stata-all-in-one.showAISkillDialog',
        () => showAISkillDialog()
    );
    context.subscriptions.push(showAISkillDialogCommand);

    // Do not complete activation while the initialization modal is awaiting an
    // explicit choice. This keeps the startup setup state machine authoritative
    // without changing the execution, Help, Data Viewer, or Diagnose flows.
    await startupStataSetupPromise;

    console.log('Stata All in One: AI Skill commands registered');
    console.log('Stata All in One: All commands registered');
}

/**
 * Deactivate the extension
 */
function deactivate() {
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
