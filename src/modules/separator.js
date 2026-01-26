/**
 * Separator Module
 * Handles insertion and management of separator lines
 * 分隔线模块
 */

const vscode = require('vscode');
const { showInfo, showWarn, hasNonAsciiCodePoint, buildSeparatorSegment, isSeparatorLine } = require('../utils/common');
const config = require('../utils/config');

/**
 * Insert a separator line
 */
function insertSeparator(char) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const totalLength = config.getSeparatorLength();
    const effectiveTotalLength = hasNonAsciiCodePoint(char) ? Math.max(10, Math.floor(totalLength * 2 / 3)) : totalLength;

    // Check if selection is within a single heading line
    if (!selection.isEmpty && selection.start.line === selection.end.line) {
        const line = document.lineAt(selection.start.line);
        const text = line.text;
        const headingMatch = /^\*\*\s*(#+)\s*(.*)$/.exec(text.trim());
        if (headingMatch) {
            const level = headingMatch[1];
            let titleText = headingMatch[2].trim();
            
            const existingSepMatch = /^([=\-*#%]+)\s+(.+?)\s+[=\-*#%]+$/.exec(titleText);
            if (existingSepMatch) {
                titleText = existingSepMatch[2].trim();
            }
            
            const prefixLength = 2 + level.length + 1;
            const titleLength = Array.from(titleText).length;
            const remaining = effectiveTotalLength - prefixLength - titleLength;
            
            if (remaining < 4) {
                showWarn('Line would be too long. Increase separator length setting.');
                return;
            }
            
            const sepTotal = remaining - 2;
            const leftSepLen = Math.floor(sepTotal / 2);
            const rightSepLen = sepTotal - leftSepLen;
            
            const leftSep = buildSeparatorSegment(char, leftSepLen);
            const rightSep = buildSeparatorSegment(char, rightSepLen);
            
            const newLine = `**${level} ${leftSep} ${titleText} ${rightSep}`;
            
            editor.edit(editBuilder => {
                const range = line.range;
                editBuilder.replace(range, newLine);
            });
            return;
        }
    }

    // Insert standalone separator line
    const separatorBody = buildSeparatorSegment(char, effectiveTotalLength - 3);
    const separatorLine = `** ${separatorBody}`;
    
    let targetLine = selection.start.line;
    const currentLineText = document.lineAt(targetLine).text;
    const isCurrentEmpty = currentLineText.trim().length === 0;
    const currentIsSep = isSeparatorLine(currentLineText);
    const prevIsSep = targetLine > 0 && isSeparatorLine(document.lineAt(targetLine - 1).text);
    const nextIsSep = (targetLine + 1 < document.lineCount) && isSeparatorLine(document.lineAt(targetLine + 1).text);

    if (currentIsSep || (prevIsSep && nextIsSep)) {
        showInfo('Separator already present here.');
        return;
    }

    if (!isCurrentEmpty) {
        if (prevIsSep) {
            if (nextIsSep) {
                showInfo('Separator already present above and below.');
                return;
            }
            targetLine = targetLine + 1;
        }
    }

    const insertLine = Math.min(targetLine, document.lineCount);
    const position = new vscode.Position(insertLine, 0);

    editor.edit(editBuilder => {
        editBuilder.insert(position, separatorLine + "\n");
    });
}

/**
 * Register separator commands
 */
function registerSeparatorCommands(context) {
    const separatorCommands = [
        { id: 'stata-all-in-one.insertSeparatorDash', char: '-' },
        { id: 'stata-all-in-one.insertSeparatorEqual', char: '=' },
        { id: 'stata-all-in-one.insertSeparatorStar', char: '*' }
    ];

    separatorCommands.forEach(cmd => {
        const disposable = vscode.commands.registerCommand(cmd.id, () => {
            insertSeparator(cmd.char);
        });
        context.subscriptions.push(disposable);
    });

    // Register custom separator command
    const customSeparatorCommand = vscode.commands.registerCommand('stata-all-in-one.insertCustomSeparator', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter a single separator character (emoji / letter / symbol / space, defaults to "=")',
            placeHolder: '='
        });

        if (input) {
            const cps = Array.from(input);
            if (cps.length > 1) {
                showWarn('Please enter exactly one character.');
                return;
            }
            if (/[\x00-\x1F\x7F]/.test(input)) {
                showWarn('Control characters are not supported.');
                return;
            }
        }

        const char = (input && input.length > 0) ? input : '=';
        insertSeparator(char);
    });
    context.subscriptions.push(customSeparatorCommand);
}

module.exports = {
    insertSeparator,
    registerSeparatorCommands
};
