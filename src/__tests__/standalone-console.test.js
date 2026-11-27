const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    getFocusEditorGroupCommand,
    resolveStandaloneConsoleDirectory,
    shouldOpenConsoleInActiveGroup
} = require('../modules/runCode/embeddedConsole/standaloneConsole');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const panelSource = read('src/modules/runCode/embeddedConsole/panel.js');
const extensionSource = read('src/extension.js');
const executeSource = read('src/modules/runCode/execute/index.js');

function tab(filePath) {
    return { input: { uri: { fsPath: filePath } } };
}

function folder(fsPath) {
    return { uri: { fsPath } };
}

test('starts in the first workspace folder when no Stata source file is open', () => {
    const groups = [{ tabs: [tab('/project/notes.md')] }, { tabs: [] }];
    assert.equal(
        resolveStandaloneConsoleDirectory(groups, [folder('/project'), folder('/other')]),
        '/project'
    );
    assert.equal(resolveStandaloneConsoleDirectory([], [folder('/project')]), '/project');
});

test('defers to the do-file directory setting when a Stata source file is open', () => {
    for (const file of ['/project/code/main.do', '/project/ado/tool.ado', '/project/m.mata']) {
        assert.equal(
            resolveStandaloneConsoleDirectory([{ tabs: [tab(file)] }], [folder('/project')]),
            null
        );
    }
});

test('keeps Stata in its startup directory when no workspace folder is open', () => {
    assert.equal(resolveStandaloneConsoleDirectory([], undefined), null);
    assert.equal(resolveStandaloneConsoleDirectory([], []), null);
    assert.equal(resolveStandaloneConsoleDirectory([], [{ uri: {} }]), null);
});

test('opens in the active group only when there is no editor to sit beside', () => {
    assert.equal(shouldOpenConsoleInActiveGroup({ tabs: [] }), true);
    assert.equal(shouldOpenConsoleInActiveGroup(undefined), true);
    assert.equal(shouldOpenConsoleInActiveGroup({ tabs: [tab('/project/main.do')] }), false);
});

test('declares the Open Console command with English and Chinese titles', () => {
    const manifest = JSON.parse(read('package.json'));
    const command = manifest.contributes.commands
        .find(item => item.command === 'stata-all-in-one.openConsole');
    assert.ok(command);
    assert.equal(command.title, '%command.openConsole.title%');
    assert.equal(JSON.parse(read('package.nls.json'))['command.openConsole.title'],
        'Stata All in One: Open Console');
    assert.equal(JSON.parse(read('package.nls.zh-cn.json'))['command.openConsole.title'],
        'Stata All in One：打开控制台');
    // It must stay reachable from the Command Palette without a do-file open.
    const hidden = manifest.contributes.menus.commandPalette
        .some(item => item.command === 'stata-all-in-one.openConsole');
    assert.equal(hidden, false);
});

test('opens the Console without starting Stata or running code', () => {
    assert.match(extensionSource, /registerCommand\(\s*'stata-all-in-one\.openConsole'/);
    const body = panelSource.slice(
        panelSource.indexOf('async function openPanel()'),
        panelSource.indexOf('function getWebviewTerminalViewColumn()')
    );
    assert.ok(body.length > 0);
    assert.match(body, /preserveFocus: false/);
    assert.match(body, /shouldOpenConsoleInActiveGroup\(vscode\.window\.tabGroups\.activeTabGroup\)/);
    assert.doesNotMatch(body, /ensureConsoleSession|_commandHandler|setStatus\(/);
    assert.match(panelSource, /openWebviewTerminalPanel: openPanel/);
});

test('focuses the input once the webview is ready to receive the request', () => {
    assert.match(panelSource, /if \(_webviewReady\) \{\s*panel\.webview\.postMessage\(\{ type: 'focusInput' \}\);\s*\} else \{[\s\S]*?_focusInputWhenReady = true;/);
    assert.match(panelSource, /message\.type === 'ready'\) \{\s*_webviewReady = true;[\s\S]*?if \(_focusInputWhenReady\) \{\s*_focusInputWhenReady = false;\s*panel\.webview\.postMessage\(\{ type: 'focusInput' \}\);/);
    assert.match(panelSource, /message\.type === 'focusInput'\) \{\s*if \(input\.disabled\) \{[\s\S]*?pendingFocus = true;\s*\} else \{\s*window\.focus\(\);\s*input\.focus\(\);/);
    // A recreated panel must wait for its own 'ready' message again.
    assert.match(panelSource, /_panel = panel;\s*_webviewReady = false;/);
});

test('passes the standalone directory from typed Console input to every platform runner', () => {
    assert.match(extensionSource, /standaloneConsoleDirectory: resolveStandaloneConsoleDirectory\(\s*vscode\.window\.tabGroups\.all,\s*vscode\.workspace\.workspaceFolders\s*\)/);
    assert.equal(
        executeSource.match(/standaloneConsoleDirectory: options\.standaloneConsoleDirectory \|\| null/g)?.length,
        3
    );
});

test('maps the Console view column to the command that focuses its editor group', () => {
    assert.equal(getFocusEditorGroupCommand(1), 'workbench.action.focusFirstEditorGroup');
    assert.equal(getFocusEditorGroupCommand(2), 'workbench.action.focusSecondEditorGroup');
    assert.equal(getFocusEditorGroupCommand(8), 'workbench.action.focusEighthEditorGroup');
    for (const column of [undefined, null, 0, 9, -1, 1.5, '2']) {
        assert.equal(getFocusEditorGroupCommand(column), null);
    }
});

test('focuses the editor group of an already open Console before focusing its input', () => {
    const body = panelSource.slice(
        panelSource.indexOf('async function openPanel()'),
        panelSource.indexOf('function getWebviewTerminalViewColumn()')
    );
    const reveal = body.indexOf('panel.reveal(');
    const focusGroup = body.indexOf('executeCommand(focusGroupCommand)');
    const focusInput = body.indexOf("postMessage({ type: 'focusInput' })");
    assert.ok(reveal > 0 && focusGroup > reveal && focusInput > focusGroup);
    assert.match(body, /getFocusEditorGroupCommand\(panel\.viewColumn\)/);
});
