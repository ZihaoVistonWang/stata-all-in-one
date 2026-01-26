/**
 * Semantic tokens for user-defined Stata commands
 */

const vscode = require('vscode');
const config = require('../utils/config');

const TOKEN_TYPES = ['keyword'];
const TOKEN_MODIFIERS = [];
const LEGEND = new vscode.SemanticTokensLegend(TOKEN_TYPES, TOKEN_MODIFIERS);

function buildRegex(commands) {
    if (!commands || commands.length === 0) {
        return null;
    }
    const escaped = commands.map(cmd => cmd.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const pattern = `\\b(${escaped.join('|')})\\b`;
    return new RegExp(pattern, 'gi');
}

function createProvider() {
    return {
        provideDocumentSemanticTokens(document) {
            const commands = config.getCustomCommands();
            const regex = buildRegex(commands);
            if (!regex) {
                return null;
            }

            const builder = new vscode.SemanticTokensBuilder(LEGEND);
            for (let line = 0; line < document.lineCount; line++) {
                const text = document.lineAt(line).text;
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    builder.push(line, match.index, match[0].length, 0, 0);
                }
            }
            return builder.build();
        }
    };
}

function registerCustomCommandHighlight(context) {
    const selector = [
        { language: 'stata', scheme: 'file' },
        { language: 'stata', scheme: 'untitled' }
    ];
    const provider = createProvider();
    const disposable = vscode.languages.registerDocumentSemanticTokensProvider(selector, provider, LEGEND);
    context.subscriptions.push(disposable);
}

module.exports = {
    registerCustomCommandHighlight
};
