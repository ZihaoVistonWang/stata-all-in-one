/**
 * Outline View Module
 * Provides document symbol provider for hierarchical outline structure
 * 大纲视图模块
 */

const vscode = require('vscode');
const { removeSeparators } = require('../utils/common');
const config = require('../utils/config');

/**
 * Set heading level for selected lines
 */
function setHeadingLevel(level) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    
    let startLine = selection.start.line;
    let endLine = selection.end.line;
    
    if (selection.isEmpty) {
        endLine = startLine;
    }

    editor.edit(editBuilder => {
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            
            const cleanedText = lineText.replace(/^(\*+\s*#+\s?)+/, '');
            
            let newText;
            if (level === 0) {
                newText = cleanedText;
            } else {
                const hashes = '#'.repeat(level);
                newText = `**${hashes} ${cleanedText}`;
            }
            
            const range = new vscode.Range(lineNum, 0, lineNum, lineText.length);
            editBuilder.replace(range, newText);
        }
    });
}

/**
 * Update file content with numbering
 */
function numberingAddWithNumbering(document, items, counters) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }

    const numberingShow = config.getnumberingShow();
    const numberingAdd = config.getnumberingAdd();

    if (!numberingAdd) {
        return;
    }

    const editBuilder = new vscode.WorkspaceEdit();
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const line = document.lineAt(item.range.start.line);
        const lineText = line.text;
        
        let newText;
        
        if (numberingShow) {
            const numbering = counters.slice(0, item.level).join('.');
            
            const regex = /^\*{1,2}\s*(#+)\s+(\d+(?:\.\d+)*)\s+(.*)$/;
            const match = regex.exec(lineText);
            
            if (match) {
                const hashes = match[1];
                const title = match[3];
                newText = `**${hashes} ${numbering} ${title}`;
            } else {
                const regexNoNumber = /^\*{1,2}\s*(#+)\s+(.*)$/;
                const matchNoNumber = regexNoNumber.exec(lineText);
                if (matchNoNumber) {
                    const hashes = matchNoNumber[1];
                    const title = matchNoNumber[2];
                    newText = `**${hashes} ${numbering} ${title}`;
                } else {
                    continue;
                }
            }
        } else {
            const regexWithNumber = /^\*{1,2}\s*(#+)\s+(?:\d+(?:\.\d+)*)\s+(.*)$/;
            const match = regexWithNumber.exec(lineText);
            
            if (match) {
                const hashes = match[1];
                const title = match[2];
                newText = `**${hashes} ${title}`;
            } else {
                continue;
            }
        }
        
        if (newText && newText !== lineText) {
            const range = new vscode.Range(item.range.start.line, 0, item.range.start.line, lineText.length);
            editBuilder.replace(document.uri, range, newText);
        }
    }

    if (editBuilder.size > 0) {
        vscode.workspace.applyEdit(editBuilder).then(success => {
            if (!success) {
                console.error('Failed to update file content with numbering');
            }
        });
    }
}

/**
 * Remove numbering from a line
 */
function removeNumberingFromLine(document, item) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }

    const line = document.lineAt(item.range.start.line);
    const lineText = line.text;
    
    const regexWithNumber = /^\*{1,2}\s*(#+)\s+(?:\d+(?:\.\d+)*)\s+(.*)$/;
    const match = regexWithNumber.exec(lineText);
    
    if (match) {
        const hashes = match[1];
        const title = match[2];
        const newText = `**${hashes} ${title}`;
        
        const range = new vscode.Range(item.range.start.line, 0, item.range.start.line, lineText.length);
        const editBuilder = new vscode.WorkspaceEdit();
        editBuilder.replace(document.uri, range, newText);
        
        vscode.workspace.applyEdit(editBuilder).then(success => {
            if (!success) {
                console.error('Failed to remove numbering from line');
            }
        });
    }
}

/**
 * Create document symbol provider for outline view
 */
function createDocumentSymbolProvider() {
    return {
        provideDocumentSymbols(document) {
            const headingRegex = /^\*\*\s*(#+)\s*(.*)$/;
            const programDefineRegex = /^\s*program\s+define\s+(\w+)/i;
            const programEndRegex = /^\s*end\s*$/i;
            
            const items = [];
            const programBlocks = [];

            // Step 1: Collect all headings and program blocks
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                
                // Check for heading
                const headingMatch = headingRegex.exec(line);
                if (headingMatch) {
                    const marks = headingMatch[1];
                    const title = headingMatch[2].trim();
                    const level = marks.length;

                    const titleRange = new vscode.Range(i, 0, i, line.length);

                    let originalTitle = removeSeparators(title);
                    
                    const numberingMatch = /^(\d+(?:\.\d+)*)\s+(.*)$/.exec(originalTitle);
                    if (numberingMatch) {
                        originalTitle = numberingMatch[2];
                    }

                    items.push({
                        title: originalTitle,
                        level: level,
                        titleRange: titleRange,
                        lineNumber: i,
                        type: 'heading'
                    });
                }
                
                // Check for program define
                const programMatch = programDefineRegex.exec(line);
                if (programMatch) {
                    const programName = programMatch[1];
                    let endLine = document.lineCount - 1;
                    
                    // Find the matching 'end'
                    for (let j = i + 1; j < document.lineCount; j++) {
                        if (programEndRegex.test(document.lineAt(j).text)) {
                            endLine = j;
                            break;
                        }
                    }
                    
                    const titleRange = new vscode.Range(i, 0, i, line.length);
                    const endLineText = document.lineAt(endLine);
                    const fullRange = new vscode.Range(i, 0, endLine, endLineText.text.length);
                    
                    programBlocks.push({
                        title: programName,
                        titleRange: titleRange,
                        fullRange: fullRange,
                        lineNumber: i,
                        type: 'program'
                    });
                }
            }

            // Step 2: Calculate full range for each heading
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                let endLine = document.lineCount - 1;
                
                for (let j = i + 1; j < items.length; j++) {
                    if (items[j].level <= item.level) {
                        endLine = items[j].lineNumber - 1;
                        break;
                    }
                }
                
                const endLineText = document.lineAt(endLine);
                item.fullRange = new vscode.Range(
                    item.lineNumber, 
                    0, 
                    endLine, 
                    endLineText.text.length
                );
            }

            const numberingShow = config.getnumberingShow();

            // Step 3: Build outline tree structure
            const rootSymbols = [];
            const stack = [];
            const counters = [];

            // Combine and sort all items by line number
            const allItems = [...items, ...programBlocks].sort((a, b) => a.lineNumber - b.lineNumber);

            for (let itemIndex = 0; itemIndex < allItems.length; itemIndex++) {
                const item = allItems[itemIndex];
                let displayTitle;
                let symbolKind;
                let fullRange;
                
                if (item.type === 'heading') {
                    // Reset counters when we reach a new heading at same or higher level
                    while (counters.length > 0 && counters.length >= item.level) {
                        counters.pop();
                    }
                    
                    if (numberingShow) {
                        while (counters.length < item.level) {
                            counters.push(0);
                        }

                        for (let i = item.level; i < counters.length; i++) {
                            counters[i] = 0;
                        }

                        counters[item.level - 1]++;
                        const numbering = counters.slice(0, item.level).join('.');
                        displayTitle = `${numbering} ${item.title}`;
                    } else {
                        displayTitle = item.title;
                    }
                    
                    symbolKind = vscode.SymbolKind.Method;
                    fullRange = item.fullRange;
                } else if (item.type === 'program') {
                    displayTitle = item.title;
                    symbolKind = vscode.SymbolKind.Property;
                    fullRange = item.fullRange;
                }

                const symbol = new vscode.DocumentSymbol(
                    displayTitle,
                    '',
                    symbolKind,
                    fullRange,
                    item.titleRange
                );

                symbol.children = [];

                // Pop from stack until we find parent with lower level
                if (item.type === 'heading') {
                    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
                        stack.pop();
                    }
                    
                    if (stack.length === 0) {
                        rootSymbols.push(symbol);
                    } else {
                        stack[stack.length - 1].symbol.children.push(symbol);
                    }
                    
                    stack.push({ level: item.level, symbol: symbol, itemIndex: itemIndex });
                } else if (item.type === 'program') {
                    // Programs are children of the current heading
                    if (stack.length > 0) {
                        stack[stack.length - 1].symbol.children.push(symbol);
                    } else {
                        rootSymbols.push(symbol);
                    }
                }
            }

            // Handle file content updates based on configuration
            const numberingAdd = config.getnumberingAdd();
            
            if (items.length > 0) {
                if (numberingAdd) {
                    const fileCounters = [];
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        while (fileCounters.length < item.level) {
                            fileCounters.push(0);
                        }
                        for (let j = item.level; j < fileCounters.length; j++) {
                            fileCounters[j] = 0;
                        }
                        fileCounters[item.level - 1]++;
                        
                        const tempCounters = [...fileCounters].slice(0, item.level);
                        
                        const tempItem = {
                            title: item.title,
                            level: item.level,
                            range: item.titleRange
                        };
                        
                        numberingAddWithNumbering(document, [tempItem], tempCounters);
                    }
                } else {
                    for (const item of items) {
                        const tempItem = {
                            title: item.title,
                            level: item.level,
                            range: item.titleRange
                        };
                        removeNumberingFromLine(document, tempItem);
                    }
                }
            }

            return rootSymbols;
        }
    };
}

module.exports = {
    setHeadingLevel,
    createDocumentSymbolProvider
};
