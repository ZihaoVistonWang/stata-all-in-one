/**
 * Stata All in One - VS Code Extension
 * Main entry point for the extension
 */

const vscode = require('vscode');
const { setHeadingLevel, createDocumentSymbolProvider } = require('./modules/outlineView');
const { registerSeparatorCommands } = require('./modules/separator');
const { registerCommentCommand, toggleComment } = require('./modules/comment');
const { registerRunCommand } = require('./modules/runCode');
const { registerCustomCommandHighlight } = require('./modules/customCommandHighlight');
const { registerCompletionProvider } = require('./modules/completionProvider');

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
    { old: 'stata-outline.showNumbering', fresh: 'stata-all-in-one.showNumbering' },
    { old: 'stata-outline.updateFileContent', fresh: 'stata-all-in-one.updateFileContent' },
    { old: 'stata-outline.showRunButton', fresh: 'stata-all-in-one.showRunButton' },
    { old: 'stata-outline.stataVersion', fresh: 'stata-all-in-one.stataVersion' },
    { old: 'stata-outline.stataPathWindows', fresh: 'stata-all-in-one.stataPathWindows' },
    { old: 'stata-outline.activateStataWindow', fresh: 'stata-all-in-one.activateStataWindow' },
    { old: 'stata-outline.commentStyle', fresh: 'stata-all-in-one.commentStyle' },
    { old: 'stata-outline.separatorLength', fresh: 'stata-all-in-one.separatorLength' }
];

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

    const choice = await vscode.window.showInformationMessage(t.prompt, t.uninstall, t.remindLater);
    
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
 * Activate the extension
 */
function activate(context) {
    console.log('Stata All in One: Extension activated');
    
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

    // Register semantic tokens for custom commands (user-configurable keywords)
    registerCustomCommandHighlight(context);

    // Register completion provider for Stata commands and functions (if enabled)
    const { getEnableCompletion } = require('./utils/config');
    if (getEnableCompletion()) {
        registerCompletionProvider(context);
        console.log('Stata All in One: Code completion provider registered');
    } else {
        console.log('Stata All in One: Code completion provider disabled');
    }

    // Register run code command
    registerRunCommand(context);

    // Register document symbol provider for outline view
    const provider = createDocumentSymbolProvider();
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: "stata" },
            provider
        )
    );

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
    console.log('Stata All in One: All commands registered');
}

/**
 * Deactivate the extension
 */
function deactivate() {}

module.exports = { activate, deactivate };
