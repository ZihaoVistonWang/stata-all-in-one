/**
 * Separator Module
 * Handles insertion and management of separator lines
 * 分隔线模块
 */

const vscode = require('vscode');
const { showInfo, showWarn, hasNonAsciiCodePoint, buildSeparatorSegment, isSeparatorLine, msg } = require('../utils/common');
const config = require('../utils/config');

/**
 * Find the repeating separator character in a string
 */
function findSeparatorChar(str) {
    let maxConsecutive = 0;
    let maxChar = '';
    let currentChar = '';
    let currentCount = 0;

    for (const char of str) {
        // Skip # and spaces
        if (char === '#' || char === ' ') {
            if (currentCount > maxConsecutive) {
                maxConsecutive = currentCount;
                maxChar = currentChar;
            }
            currentCount = 0;
            currentChar = '';
        } else if (char === currentChar) {
            currentCount++;
        } else {
            if (currentCount > maxConsecutive) {
                maxConsecutive = currentCount;
                maxChar = currentChar;
            }
            currentChar = char;
            currentCount = 1;
        }
    }
    if (currentCount > maxConsecutive) {
        maxConsecutive = currentCount;
        maxChar = currentChar;
    }

    return maxChar;
}

/**
 * Update all separator lines in document according to separatorSymmetric setting
 */
function updateAllSeparators() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const shouldAddSuffix = config.getSeparatorSymmetric();
    const edits = [];

    // Scan all lines
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        const lineText = line.text;
        const trimmed = lineText.trim();

        // Check if line starts with '**'
        if (!trimmed.startsWith('**')) {
            continue;
        }

        // Extract the original prefix (** with or without spaces/# before content)
        const afterStars = trimmed.slice(2);
        const spacesBeforeContent = afterStars.length - afterStars.trimStart().length;
        const prefix = '**' + afterStars.slice(0, spacesBeforeContent);
        
        // Extract body after '**' prefix (with spaces removed)
        const body = afterStars.trimStart();
        if (!body) {
            continue;
        }

        // Check if line ends with ' **'
        const hasSuffix = body.endsWith(' **');
        
        // Get body content without suffix
        let bodyForCheck = body;
        if (hasSuffix) {
            bodyForCheck = body.slice(0, -3).trim();
        }

        // Check if it's a separator line (has consecutive repeated characters)
        if (!isSeparatorLine(`**${bodyForCheck}`)) {
            continue;
        }

        // Find the separator character
        const sepChar = findSeparatorChar(bodyForCheck);
        if (!sepChar) {
            continue;
        }

        // Determine if we need to update this line
        let needsUpdate = false;
        let newLine;

        if (shouldAddSuffix && !hasSuffix) {
            // Add suffix: remove 1 char from front and 2 from back, then add ' **'
            let adjusted = bodyForCheck;
            
            // Find first occurrence of separator char (skip # and spaces)
            let firstSepIndex = -1;
            for (let j = 0; j < adjusted.length; j++) {
                if (adjusted[j] === sepChar) {
                    firstSepIndex = j;
                    break;
                }
            }
            
            // Find last occurrence of separator char
            let lastSepIndex = -1;
            for (let j = adjusted.length - 1; j >= 0; j--) {
                if (adjusted[j] === sepChar) {
                    lastSepIndex = j;
                    break;
                }
            }
            
            // Remove 1 from front and 2 from back
            if (firstSepIndex !== -1 && lastSepIndex !== -1) {
                // Remove from front
                adjusted = adjusted.slice(0, firstSepIndex) + adjusted.slice(firstSepIndex + 1);
                // Adjust lastSepIndex after removal
                lastSepIndex--;
                
                // Remove 2 from back (need to find new last positions)
                let removed = 0;
                let newAdjusted = '';
                for (let j = adjusted.length - 1; j >= 0 && removed < 2; j--) {
                    if (adjusted[j] === sepChar) {
                        removed++;
                    } else {
                        newAdjusted = adjusted.slice(0, j + 1);
                        break;
                    }
                }
                if (removed === 2) {
                    adjusted = newAdjusted || adjusted.slice(0, adjusted.length - 2);
                }
                
                needsUpdate = true;
                newLine = `${prefix}${adjusted} **`;
            }
        } else if (!shouldAddSuffix && hasSuffix) {
            // Remove suffix: add 1 char to front and 2 to back, then remove ' **'
            let adjusted = bodyForCheck;
            
            // Find first occurrence of separator char
            let firstSepIndex = -1;
            for (let j = 0; j < adjusted.length; j++) {
                if (adjusted[j] === sepChar) {
                    firstSepIndex = j;
                    break;
                }
            }
            
            // Add 1 to front
            if (firstSepIndex !== -1) {
                adjusted = adjusted.slice(0, firstSepIndex) + sepChar + adjusted.slice(firstSepIndex);
            }
            
            // Add 2 to back
            adjusted = adjusted + sepChar + sepChar;
            
            needsUpdate = true;
            newLine = `${prefix}${adjusted}`;
        }

        if (needsUpdate) {
            edits.push({
                range: line.range,
                newText: newLine
            });
        }
    }

    // Apply all edits silently (no notification)
    if (edits.length > 0) {
        editor.edit(editBuilder => {
            edits.forEach(edit => {
                editBuilder.replace(edit.range, edit.newText);
            });
        });
    }
}

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

    // Check if selection is within a single heading line AND has selected text
    if (selection.start.line === selection.end.line && !selection.isEmpty) {
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
                showWarn(msg('lineTooLong'));
                return;
            }
            
            const sepTotal = remaining - 2;
            const leftSepLen = Math.floor(sepTotal / 2);
            const rightSepLen = sepTotal - leftSepLen;
            
            const leftSep = buildSeparatorSegment(char, leftSepLen);
            const rightSep = buildSeparatorSegment(char, rightSepLen);
            
            const suffix = config.getSeparatorSymmetric() ? ' **' : '';
            const newLine = `**${level} ${leftSep} ${titleText} ${rightSep}${suffix}`;
            
            editor.edit(editBuilder => {
                const range = line.range;
                editBuilder.replace(range, newLine);
            });
            return;
        }
    }

    // Insert standalone separator line
    const suffix = config.getSeparatorSymmetric() ? ' **' : '';
    const suffixLength = suffix.length;
    const separatorBody = buildSeparatorSegment(char, effectiveTotalLength - 3 - suffixLength);
    const separatorLine = `** ${separatorBody}${suffix}`;
    
    let targetLine = selection.start.line;
    const currentLineText = document.lineAt(targetLine).text;
    const isCurrentEmpty = currentLineText.trim().length === 0;
    const currentIsSep = isSeparatorLine(currentLineText);
    const prevIsSep = targetLine > 0 && isSeparatorLine(document.lineAt(targetLine - 1).text);
    const nextIsSep = (targetLine + 1 < document.lineCount) && isSeparatorLine(document.lineAt(targetLine + 1).text);

    if (currentIsSep || (prevIsSep && nextIsSep)) {
        showInfo(msg('sepHere'));
        return;
    }

    if (!isCurrentEmpty) {
        if (prevIsSep) {
            if (nextIsSep) {
                showInfo(msg('sepAboveBelow'));
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
 * Register auto-update on document open
 * Checks if separatorSymmetric setting has changed and updates accordingly
 */
function registerAutoUpdate(context) {
    // Listen to active editor changes (when switching between files)
    const disposable = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (!editor) {
            return;
        }

        const document = editor.document;
        
        // Only process .do files
        if (document.languageId !== 'stata') {
            return;
        }

        const fileUri = document.uri.toString();
        const currentSetting = config.getSeparatorSymmetric();
        
        // Get stored setting for this file
        const storedSettings = context.workspaceState.get('separatorSymmetricState', {});
        const storedSetting = storedSettings[fileUri];

        // If this is the first time opening the file, just store the current setting
        if (storedSetting === undefined) {
            storedSettings[fileUri] = currentSetting;
            await context.workspaceState.update('separatorSymmetricState', storedSettings);
            return;
        }

        // If setting has changed, auto-update separators
        if (storedSetting !== currentSetting) {
            updateAllSeparators();
            
            // Update stored setting
            storedSettings[fileUri] = currentSetting;
            await context.workspaceState.update('separatorSymmetricState', storedSettings);
        }
    });

    context.subscriptions.push(disposable);
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

    // Register update all separators command
    const updateAllSeparatorsCommand = vscode.commands.registerCommand('stata-all-in-one.updateAllSeparators', () => {
        updateAllSeparators();
    });
    context.subscriptions.push(updateAllSeparatorsCommand);

    // Register auto-update on document open
    registerAutoUpdate(context);

    // Register custom separator command
    const customSeparatorCommand = vscode.commands.registerCommand('stata-all-in-one.insertCustomSeparator', async () => {
        const input = await vscode.window.showInputBox({
            prompt: msg('customSepPrompt'),
            placeHolder: msg('customSepPlaceholder')
        });

        if (input) {
            const cps = Array.from(input);
            if (cps.length > 1) {
                showWarn(msg('oneChar'));
                return;
            }
            if (/[\x00-\x1F\x7F]/.test(input)) {
                showWarn(msg('controlChars'));
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
    updateAllSeparators,
    registerSeparatorCommands
};
