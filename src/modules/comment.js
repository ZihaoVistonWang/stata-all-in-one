/**
 * Comment Toggle Module
 * Handles toggling comments with different styles
 * 注释切换模块
 */

const vscode = require('vscode');
const config = require('../utils/config');

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
    const disposable = vscode.commands.registerCommand('stata-all-in-one.toggleComment', toggleComment);
    context.subscriptions.push(disposable);
}

module.exports = {
    toggleComment,
    registerCommentCommand
};
