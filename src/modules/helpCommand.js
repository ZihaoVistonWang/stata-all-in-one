/**
 * Help Command Module
 * Provides help for selected Stata commands
 * 帮助命令模块 - 为选中的 Stata 命令提供帮助
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { isWindows, isMacOS, showError, stripSurroundingQuotes, msg } = require('../utils/common');
const config = require('../utils/config');
const { runOnMac } = require('./runCode/mac');
const { runOnWindows } = require('./runCode/windows');

/**
 * Get selected text from editor
 */
function getSelectedText(editor) {
    const selection = editor.selection;
    
    if (selection.isEmpty) {
        return null;
    }
    
    const document = editor.document;
    const selectedText = document.getText(selection);
    
    return selectedText.trim();
}

/**
 * Check if text is a valid Stata command identifier
 * Valid identifier: only letters, digits and underscores
 */
function isValidCommandIdentifier(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }
    const commandRegex = /^[a-z0-9_]+$/i;
    return commandRegex.test(text);
}

/**
 * Generate help code
 */
function generateHelpCode(command) {
    return `help ${command}`;
}

/**
 * Run help command
 */
async function runHelpCommand() {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
        showError(msg('noEditor'));
        return;
    }
    
    // Get selected text
    const selectedText = getSelectedText(editor);
    
    if (!selectedText) {
        showError(msg('noTextSelected'));
        return;
    }
    
    // Check if selected text is a command
    // Check if selected text is a valid command identifier
    if (!isValidCommandIdentifier(selectedText)) {
        showError(msg('notAValidIdentifier', { command: selectedText }));
        return;
    }
    
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
    
    // Generate help code
    const helpCode = generateHelpCode(selectedText);
    
    // Create temporary file
    const document = editor.document;
    const docDir = path.dirname(document.fileName);
    const tmpFilePath = path.join(docDir, 'stata_help_temp.do');
    
    try {
        fs.writeFileSync(tmpFilePath, helpCode, 'utf8');
        
        if (onWindows) {
            runOnWindows(helpCode, tmpFilePath, stataPathOnWindows);
        } else if (onMac) {
            runOnMac(helpCode, tmpFilePath);
        }
        // Silent success: no popup notification
    } catch (error) {
        showError(msg('tmpFileFailed', { message: error.message }));
    }
}

/**
 * Register help command
 */
function registerHelpCommand(context) {
    const disposable = vscode.commands.registerCommand('stata-all-in-one.showHelp', runHelpCommand);
    context.subscriptions.push(disposable);
}

module.exports = {
    runHelpCommand,
    registerHelpCommand,
    isValidCommandIdentifier,
    getSelectedText
};
