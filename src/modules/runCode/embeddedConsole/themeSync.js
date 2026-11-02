const vscode = require('vscode');
const jsonc = require('jsonc-parser');
const { resolveClientTheme } = require('./themeResolver');

const EXPORT_COMMAND = 'workbench.action.generateColorTheme';
let generation = 0;
let exportQueue = Promise.resolve();
const snapshots = new Map();

function invalidateClientTheme() {
    generation += 1;
    snapshots.clear();
}

function exportedTheme(document) {
    if (!document.isUntitled || document.languageId !== 'jsonc') return null;
    const errors = [];
    const data = jsonc.parse(document.getText(), errors, { allowTrailingComma: true });
    if (errors.length || !data || data.$schema !== 'vscode://schemas/color-theme'
        || !Array.isArray(data.tokenColors) || !data.colors || typeof data.colors !== 'object') return null;
    return { colors: data.colors, tokenColors: data.tokenColors };
}

function tabFor(document) {
    return vscode.window.tabGroups.all.flatMap(group => group.tabs)
        .find(tab => tab.input && tab.input.uri && tab.input.uri.toString() === document.uri.toString());
}

async function waitForTab(document) {
    if (tabFor(document)) return tabFor(document);
    return new Promise(resolve => {
        const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
            const tab = tabFor(document);
            if (tab) finish(tab);
        });
        const timer = setTimeout(() => finish(tabFor(document)), 5000);
        function finish(tab) {
            clearTimeout(timer);
            subscription.dispose();
            resolve(tab);
        }
    });
}

function waitForCleanTab(document) {
    const isClean = () => {
        const tab = tabFor(document);
        return !tab || tab.isDirty === false;
    };
    if (isClean()) return Promise.resolve(true);
    return new Promise(resolve => {
        const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
            if (isClean()) finish(true);
        });
        const timer = setTimeout(() => finish(false), 3000);
        function finish(clean) {
            clearTimeout(timer);
            subscription.dispose();
            resolve(clean);
        }
    });
}

function waitForClosedTab(document) {
    if (!tabFor(document)) return Promise.resolve();
    return new Promise(resolve => {
        const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
            if (!tabFor(document)) finish();
        });
        const timer = setTimeout(finish, 3000);
        function finish() {
            clearTimeout(timer);
            subscription.dispose();
            resolve();
        }
    });
}

async function captureClientTheme(themeId, expectedGeneration, panel) {
    if (expectedGeneration !== generation) throw new Error('Theme request was superseded.');
    const existing = new Set(vscode.workspace.textDocuments.map(document => document.uri.toString()));
    const originalGroup = vscode.window.tabGroups.activeTabGroup;
    const originalTab = originalGroup.activeTab;
    const originalEditor = vscode.window.activeTextEditor;
    const originalSelection = originalEditor && originalEditor.selection;
    const restorePanel = Boolean(panel && panel.active);
    let captured;
    let captureError;
    let timer;
    let receive;
    const received = new Promise(resolve => { receive = resolve; });
    const subscription = vscode.workspace.onDidOpenTextDocument(document => {
        if (existing.has(document.uri.toString())) return;
        const data = exportedTheme(document);
        if (!data || captured) return;
        captured = { document, data, source: document.getText() };
        receive(captured);
    });
    // runCommands keeps the editor pane returned by EXPORT_COMMAND inside
    // the UI process instead of trying to serialize it over Remote-SSH.
    const execution = Promise.resolve().then(async () => {
        try {
            await vscode.commands.executeCommand('runCommands', { commands: [EXPORT_COMMAND] });
        } catch (error) {
            if (!/command.*runCommands.*not found/i.test(String(error.message || error))) throw error;
            // Compatibility with VS Code versions before runCommands.
            await vscode.commands.executeCommand(EXPORT_COMMAND);
        }
    }).catch(error => {
        if (!captured) throw error;
    });
    const deadline = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Client theme export timed out.')), 15000);
    });
    try {
        // The document notification precedes completion of openEditor. Wait
        // for both before modifying it, otherwise editor initialization can
        // race the cleanup and leave an empty tab behind.
        await Promise.race([Promise.all([received, execution]), deadline]);
    } catch (error) {
        captureError = error;
    } finally {
        clearTimeout(timer);
        subscription.dispose();
        if (captured) {
            const tab = await waitForTab(captured.document);
            if (tab) {
                // Only discard the document produced by this export, never a
                // pre-existing untitled document or content the user edited.
                const unchanged = !captured.document.isClosed && captured.document.getText() === captured.source;
                if (unchanged) {
                    // An empty, unassociated untitled document is not dirty in
                    // VS Code. Clear only this export via a versioned edit, then
                    // close its exact tab without a Save/Discard prompt or an
                    // active-editor command that could target a user's file.
                    const edit = new vscode.WorkspaceEdit();
                    edit.delete(captured.document.uri, new vscode.Range(
                        new vscode.Position(0, 0), captured.document.positionAt(captured.source.length)));
                    const cleared = await vscode.workspace.applyEdit(edit);
                    // Read the UI tab's authoritative dirty state. Remote text
                    // document notifications can lag or be reordered after the
                    // versioned edit; the native tab controls save confirmation.
                    const clean = cleared && await waitForCleanTab(captured.document);
                    const wasActive = tab.isActive && vscode.window.tabGroups.activeTabGroup === tab.group;
                    const closed = clean
                        && await vscode.window.tabGroups.close(tab, true);
                    if (closed) await waitForClosedTab(captured.document);
                    if (closed && wasActive) {
                        // Closing the generated tab restores native editor history.
                        // Re-focus the calling Webview only if it was active before
                        // export and the user has not moved to a different tab.
                        const current = originalGroup.activeTab;
                        if (restorePanel && (!current || current === originalTab)) {
                            try { panel.reveal(panel.viewColumn, false); } catch (_error) {}
                        } else if (originalEditor && vscode.window.activeTextEditor === originalEditor) {
                            originalEditor.selection = originalSelection;
                        }
                    }
                }
            }
        }
    }
    if (captureError) throw captureError;
    if (expectedGeneration !== generation) throw new Error('Theme changed during export.');
    return { themeId, ...captured.data };
}

function remoteSnapshot(themeId, panel) {
    const key = themeId;
    if (!snapshots.has(key)) {
        const expectedGeneration = generation;
        const task = exportQueue.then(() => captureClientTheme(themeId, expectedGeneration, panel));
        exportQueue = task.catch(() => {});
        // Keep a failed request cached until the theme changes or the window
        // reloads; an unavailable command must not keep stealing editor focus.
        snapshots.set(key, task);
        if (snapshots.size > 16) snapshots.delete(snapshots.keys().next().value);
    }
    return snapshots.get(key);
}

async function resolveDisplayTheme(request, panel) {
    const snapshot = vscode.env.remoteName ? await remoteSnapshot(request.themeId, panel) : undefined;
    return resolveClientTheme(request, vscode, snapshot);
}

async function handleThemeRequest(message, panel) {
    const request = {
        themeId: typeof message.themeId === 'string' ? message.themeId.slice(0, 256) : '',
        foreground: typeof message.foreground === 'string' ? message.foreground.slice(0, 80) : '',
        scopes: Array.isArray(message.scopes) ? message.scopes.slice(0, 128) : []
    };
    let response;
    try {
        const result = await resolveDisplayTheme(request, panel);
        response = { type: 'clientThemeColors', requestId: message.requestId, ...result };
    } catch (error) {
        console.error('Stata All in One: Client theme unavailable:', error.message);
        response = { type: 'clientThemeColors', requestId: message.requestId,
            themeId: request.themeId, colors: {}, unavailable: true };
    }
    try { await panel.webview.postMessage(response); } catch (_error) {}
}

module.exports = { resolveDisplayTheme, handleThemeRequest, invalidateClientTheme };
