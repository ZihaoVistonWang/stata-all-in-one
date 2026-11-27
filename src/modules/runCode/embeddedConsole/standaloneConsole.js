/**
 * Policy for the Console when it is opened on its own (through the
 * "Open Console" command) instead of as a side effect of running a do-file.
 *
 * Kept free of `vscode` so it can be unit tested with plain objects.
 */

const { hasOpenStataSourceTab } = require('./editorRestorePolicy');

/**
 * Directory a new Stata session should start in when the first command is
 * typed into the Console and no Stata source file is open.
 *
 * With a do-file open, the existing `cdToDoFileDir` setting keeps deciding;
 * this returns null so the caller leaves that behaviour untouched.
 *
 * @param {readonly object[]} tabGroups - vscode.window.tabGroups.all
 * @param {readonly object[]|undefined} workspaceFolders - vscode.workspace.workspaceFolders
 * @returns {string|null}
 */
function resolveStandaloneConsoleDirectory(tabGroups, workspaceFolders) {
    if (hasOpenStataSourceTab(tabGroups)) {
        return null;
    }
    const folder = Array.isArray(workspaceFolders) ? workspaceFolders[0] : null;
    const folderPath = folder && folder.uri ? String(folder.uri.fsPath || '') : '';
    return folderPath || null;
}

/**
 * A new Console normally opens beside the do-file that was run. When the
 * active editor group is empty there is nothing to sit beside, and opening
 * to the side would leave an empty group next to the Console.
 *
 * @param {object|undefined} activeTabGroup - vscode.window.tabGroups.activeTabGroup
 * @returns {boolean}
 */
function shouldOpenConsoleInActiveGroup(activeTabGroup) {
    const tabs = activeTabGroup && activeTabGroup.tabs;
    return !tabs || tabs.length === 0;
}

const FOCUS_EDITOR_GROUP_COMMANDS = [
    'workbench.action.focusFirstEditorGroup',
    'workbench.action.focusSecondEditorGroup',
    'workbench.action.focusThirdEditorGroup',
    'workbench.action.focusFourthEditorGroup',
    'workbench.action.focusFifthEditorGroup',
    'workbench.action.focusSixthEditorGroup',
    'workbench.action.focusSeventhEditorGroup',
    'workbench.action.focusEighthEditorGroup'
];

/**
 * WebviewPanel.reveal() brings the Console tab to the front, but it does not
 * reliably move keyboard focus when the Console is already visible in another
 * editor group. Focusing that group explicitly does.
 *
 * @param {number|undefined} viewColumn - WebviewPanel.viewColumn (1-based)
 * @returns {string|null} built-in command id, or null when the column is unknown
 */
function getFocusEditorGroupCommand(viewColumn) {
    if (!Number.isInteger(viewColumn)) {
        return null;
    }
    return FOCUS_EDITOR_GROUP_COMMANDS[viewColumn - 1] || null;
}

module.exports = {
    getFocusEditorGroupCommand,
    resolveStandaloneConsoleDirectory,
    shouldOpenConsoleInActiveGroup
};
