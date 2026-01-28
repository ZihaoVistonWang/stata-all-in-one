/**
 * Line Break Module
 * Handles Stata-style line continuation with ///
 * Stata 换行模块
 */

const vscode = require('vscode');
const { showWarning, msg } = require('../utils/common');

/**
 * Insert Stata line continuation at cursor position
 * Formats the line properly with /// and indentation
 */
function insertLineBreak() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        showWarning(msg('noEditor'));
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const position = selection.active;
    const currentLine = document.lineAt(position.line);
    const lineText = currentLine.text;
    
    // Get the text before and after cursor
    const textBeforeCursor = lineText.substring(0, position.character);
    const textAfterCursor = lineText.substring(position.character);
    
    // Check if we're on a continuation line by looking at previous lines
    let isFirstLineBreak = true;
    let baseIndentation = lineText.match(/^\s*/)[0];
    
    // Look backwards to find if there's a line with ///
    if (position.line > 0) {
        for (let i = position.line - 1; i >= 0; i--) {
            const prevLine = document.lineAt(i);
            const prevText = prevLine.text.trim();
            
            // If we find a line ending with ///, we're in a continuation block
            if (prevText.endsWith('///')) {
                isFirstLineBreak = false;
                // Use the current line's indentation (already a continuation line)
                break;
            }
            
            // If we hit a non-empty line without ///, stop searching
            if (prevText && !prevText.endsWith('///')) {
                break;
            }
        }
    }
    
    // Calculate indentation for the new line
    let indentation = '';
    if (isFirstLineBreak) {
        // First line break: add 4 spaces to base indentation
        indentation = baseIndentation + '    ';
    } else {
        // Continuation line: maintain current indentation
        indentation = baseIndentation;
    }
    
    // Remove trailing whitespace before cursor
    const trimmedBeforeCursor = textBeforeCursor.trimEnd();
    
    // Remove leading whitespace after cursor
    const trimmedAfterCursor = textAfterCursor.trimStart();
    
    // Construct the new text
    // Ensure only one space before ///
    const newFirstLine = trimmedBeforeCursor + ' ///';
    const newSecondLine = indentation + trimmedAfterCursor;
    
    editor.edit(editBuilder => {
        // Replace the current line with formatted version
        const lineRange = new vscode.Range(
            currentLine.range.start,
            currentLine.range.end
        );
        editBuilder.replace(lineRange, newFirstLine + '\n' + newSecondLine);
    }).then(success => {
        if (success) {
            // Move cursor to the start of the new line (after indentation)
            const newPosition = new vscode.Position(
                position.line + 1,
                indentation.length
            );
            editor.selection = new vscode.Selection(newPosition, newPosition);
        }
    });
}

/**
 * Register line break command
 */
function registerLineBreakCommand(context) {
    const disposable = vscode.commands.registerCommand(
        'stata-all-in-one.insertLineBreak',
        insertLineBreak
    );
    context.subscriptions.push(disposable);
}

module.exports = {
    insertLineBreak,
    registerLineBreakCommand
};
