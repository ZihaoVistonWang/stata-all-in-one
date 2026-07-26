/**
 * Comment Toggle Module
 * Handles toggling comments with different styles
 * 注释切换模块
 */

const vscode = require('vscode');
const config = require('../utils/config');
const { getCommentStyleMenuValue } = require('./commentStyle');

const COMMENT_STYLE_CONTEXT_KEY = 'stata-all-in-one.commentStyleMenu';
const QUICK_COMMENT_COMMANDS = [
    'stata-all-in-one.quickCommentSlash',
    'stata-all-in-one.quickCommentStar',
    'stata-all-in-one.quickCommentBlock'
];

/**
 * Toggle comment for selected lines
 */
function toggleComment() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const commentStyle = config.getCommentStyle();

    const startLine = selection.start.line;
    const endLine = selection.end.line;

    editor.edit(editBuilder => {
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text.trim();

            if (commentStyle === '/* ... */') {
                // Handle block comments
                if (lineText.startsWith('/*') && lineText.endsWith('*/')) {
                    const uncommentedText = lineText.replace(/^\/\*/, '').replace(/\*\/$/, '').trim();
                    const range = new vscode.Range(lineNum, 0, lineNum, line.text.length);
                    editBuilder.replace(range, uncommentedText);
                } else {
                    const commentedText = `/* ${lineText} */`;
                    const range = new vscode.Range(lineNum, 0, lineNum, line.text.length);
                    editBuilder.replace(range, commentedText);
                }
            } else {
                // Handle line comments
                const baseCommentStyle = commentStyle.trim();
                const escapedBaseStyle = baseCommentStyle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const commentPattern = new RegExp(`^${escapedBaseStyle}\\s*`);
                
                if (commentPattern.test(lineText)) {
                    const uncommentedText = lineText.replace(commentPattern, '');
                    const range = new vscode.Range(lineNum, 0, lineNum, line.text.length);
                    editBuilder.replace(range, uncommentedText);
                } else {
                    const commentedText = commentStyle + lineText;
                    const range = new vscode.Range(lineNum, 0, lineNum, line.text.length);
                    editBuilder.replace(range, commentedText);
                }
            }
        }
    });
}

/**
 * Register comment toggle command
 */
function registerCommentCommand(context) {
    const updateCommentStyleContext = () => {
        Promise.resolve(
            vscode.commands.executeCommand(
                'setContext',
                COMMENT_STYLE_CONTEXT_KEY,
                getCommentStyleMenuValue(config.getCommentStyle())
            )
        ).catch(() => {});
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('stata-all-in-one.toggleComment', toggleComment),
        ...QUICK_COMMENT_COMMANDS.map(command => vscode.commands.registerCommand(command, toggleComment)),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('stata-all-in-one.commentStyle')) {
                updateCommentStyleContext();
            }
        })
    );
    updateCommentStyleContext();
}

module.exports = {
    toggleComment,
    registerCommentCommand
};
