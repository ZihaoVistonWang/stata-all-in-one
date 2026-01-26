/**
 * Stata All in One - VS Code Extension
 * Main entry point for the extension
 */

const vscode = require('vscode');
const { setHeadingLevel, createDocumentSymbolProvider } = require('./modules/outlineView');
const { registerSeparatorCommands } = require('./modules/separator');
const { registerCommentCommand, toggleComment } = require('./modules/comment');
const { registerRunCommand } = require('./modules/runCode');

/**
 * Activate the extension
 */
function activate(context) {
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
}

/**
 * Deactivate the extension
 */
function deactivate() {}

module.exports = { activate, deactivate };
