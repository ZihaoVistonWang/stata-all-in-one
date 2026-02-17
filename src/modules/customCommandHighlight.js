/**
 * Custom command highlighting for user-defined Stata commands
 * Generates injection grammar file for native TextMate highlighting
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const config = require('../utils/config');

/**
 * Build case-insensitive regex pattern for grammar
 * Converts each letter to [Aa] format for case-insensitive matching
 */
function buildGrammarPattern(commands) {
    if (!commands || commands.length === 0) {
        return null;
    }
    // Escape special regex characters and create case-insensitive pattern
    const escaped = commands.map(cmd => {
        const escaped = cmd.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Make each character case-insensitive: a -> [Aa]
        return escaped.split('').map(char => {
            if (/[a-zA-Z]/.test(char)) {
                return `[${char.toUpperCase()}${char.toLowerCase()}]`;
            }
            return char;
        }).join('');
    });
    return `\\b(${escaped.join('|')})\\b`;
}

/**
 * Create injection grammar object for TextMate
 */
function createInjectionGrammar(commands) {
    const pattern = buildGrammarPattern(commands);
    if (!pattern) {
        return null;
    }

    return {
        scopeName: 'stata.injection.custom-commands',
        injectionSelector: 'L:source.stata',
        patterns: [
            {
                match: pattern,
                name: 'keyword.control.flow.stata'
            }
        ]
    };
}

/**
 * Update the dynamic grammar file with current custom commands
 */
function updateGrammarFile(context) {
    const commands = config.getCustomCommands();
    
    // Get extension path
    const extensionPath = context.extensionPath;
    const grammarPath = path.join(extensionPath, 'grammars', 'stata-custom.json');

    // Always create grammar file, even if empty (to avoid package.json reference error)
    const grammar = createInjectionGrammar(commands) || {
        scopeName: 'stata.injection.custom-commands',
        injectionSelector: 'L:source.stata',
        patterns: []
    };

    // Write grammar file
    try {
        fs.writeFileSync(grammarPath, JSON.stringify(grammar, null, 2), 'utf8');
        if (commands && commands.length > 0) {
            console.log('Stata All in One: Updated custom grammar with', commands.length, 'commands:', commands.join(', '));
        } else {
            console.log('Stata All in One: Custom grammar file cleared (no commands configured)');
        }
        return commands && commands.length > 0;
    } catch (error) {
        console.error('Stata All in One: Failed to write grammar file:', error);
        return false;
    }
}

/**
 * Register custom command highlighting
 * Generates injection grammar on activation and watches for configuration changes
 */
function registerCustomCommandHighlight(context) {
    // Update grammar file on activation
    updateGrammarFile(context);

    // Watch for configuration changes
    const disposable = vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('stata-all-in-one.customCommands')) {
            console.log('Stata All in One: Custom commands configuration changed');
            
            if (updateGrammarFile(context)) {
                // Prompt user to reload window
                const message = vscode.env.language.startsWith('zh') 
                    ? '自定义命令已更新，需要重新加载窗口以应用更改。'
                    : 'Custom commands updated. Reload window to apply changes.';
                const reloadButton = vscode.env.language.startsWith('zh') 
                    ? '重新加载' 
                    : 'Reload';
                
                vscode.window.showInformationMessage(message, reloadButton).then(selection => {
                    if (selection === reloadButton) {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });
            }
        }
    });

    context.subscriptions.push(disposable);
}

module.exports = {
    registerCustomCommandHighlight
};

