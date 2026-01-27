/**
 * Run Code Module
 * Main module for handling code execution across platforms
 * 代码运行模块 - 跨平台处理
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { isWindows, isMacOS, showError, stripSurroundingQuotes, msg } = require('../../utils/common');
const config = require('../../utils/config');
const { runOnMac } = require('./mac');
const { runOnWindows } = require('./windows');

/**
 * Get code to run based on current selection or section
 */
function getCodeToRun(editor) {
    const document = editor.document;
    const selection = editor.selection;

    if (!selection.isEmpty) {
        // Run selected code (complete lines)
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        
        const startPos = new vscode.Position(startLine, 0);
        const endLineText = document.lineAt(endLine);
        const endPos = new vscode.Position(endLine, endLineText.text.length);
        
        return document.getText(new vscode.Range(startPos, endPos));
    } else {
        // Run current section
        const currentLine = editor.selection.active.line;
        const regex = /^\*{1,2}\s*(#+)\s?(.*)$/;
        
        let sectionStart = -1;
        let sectionLevel = -1;
        
        // Find the current section header
        for (let i = currentLine; i >= 0; i--) {
            const line = document.lineAt(i).text;
            const match = regex.exec(line);
            if (match) {
                sectionStart = i;
                sectionLevel = match[1].length;
                break;
            }
        }
        
        if (sectionStart === -1) {
            sectionStart = 0;
            sectionLevel = 0;
        }
        
        // Find the next section at same or higher level
        let sectionEnd = document.lineCount - 1;
        
        for (let i = sectionStart + 1; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            const match = regex.exec(line);
            if (match) {
                const currentLevel = match[1].length;
                if (currentLevel <= sectionLevel && sectionLevel > 0) {
                    sectionEnd = i - 1;
                    break;
                }
                if (sectionLevel === 0) {
                    sectionEnd = i - 1;
                    break;
                }
            }
        }
        
        const startPos = new vscode.Position(sectionStart, 0);
        const endLine = document.lineAt(sectionEnd);
        const endPos = new vscode.Position(sectionEnd, endLine.text.length);
        
        return document.getText(new vscode.Range(startPos, endPos));
    }
}

/**
 * Main function to run current section
 */
async function runCurrentSection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        showError(msg('noEditor'));
        return;
    }

    const document = editor.document;

    // Platform check
    const onWindows = isWindows();
    const onMac = isMacOS();

    if (!onWindows && !onMac) {
        showError(msg('unsupportedPlatform'));
        return;
    }

    // Windows platform specific validation
    let stataPathOnWindows = null;
    if (onWindows) {
        const rawPath = config.getStataPathOnWindows();
        stataPathOnWindows = stripSurroundingQuotes(rawPath.trim());
        if (!stataPathOnWindows) {
            showError(msg('missingWinPath'));
            return;
        }
    }

    // Get code to run
    const codeToRun = getCodeToRun(editor);
    
    // Create temporary file
    const docDir = path.dirname(document.fileName);
    const tmpFilePath = path.join(docDir, 'stata_outline_temp.do');
    
    try {
        fs.writeFileSync(tmpFilePath, codeToRun, 'utf8');
        
        if (onWindows) {
            runOnWindows(codeToRun, tmpFilePath, stataPathOnWindows);
        } else if (onMac) {
            runOnMac(codeToRun, tmpFilePath);
        }
    } catch (error) {
        showError(msg('tmpFileFailed', { message: error.message }));
    }
}

/**
 * Register run section command
 */
function registerRunCommand(context) {
    const disposable = vscode.commands.registerCommand('stata-all-in-one.runSection', runCurrentSection);
    context.subscriptions.push(disposable);
}

module.exports = {
    runCurrentSection,
    registerRunCommand
};
