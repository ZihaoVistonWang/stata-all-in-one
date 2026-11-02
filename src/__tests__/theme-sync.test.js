const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jsonc = require('jsonc-parser');
const source = fs.readFileSync(path.resolve(__dirname, '../modules/runCode/embeddedConsole/themeSync.js'), 'utf8');

function fixture(options = {}) {
    const listeners = new Set(), tabListeners = new Set(), documentListeners = new Set(), timers = new Map();
    const calls = [], cleared = [], closed = [], revealed = [];
    let nextTimer = 0, exports = 0;
    const original = { input: { uri: { toString: () => 'untitled:user-notes' } }, isActive: true };
    const group = { tabs: [original], activeTab: original };
    original.group = group;
    const documents = [{ uri: original.input.uri, getText: () => 'unsaved user text' }];
    let generated;
    const panel = { active: true, viewColumn: 2, reveal: (...args) => revealed.push(args) };
    const vscode = {
        env: { remoteName: options.local ? undefined : 'ssh-remote' },
        Position: class { constructor(line, character) { this.line = line; this.character = character; } },
        Range: class { constructor(start, end) { this.start = start; this.end = end; } },
        WorkspaceEdit: class { delete(uri, range) { this.uri = uri; this.range = range; } },
        workspace: {
            textDocuments: documents,
            onDidOpenTextDocument(fn) { listeners.add(fn); return { dispose: () => listeners.delete(fn) }; },
            onDidChangeTextDocument(fn) { documentListeners.add(fn); return { dispose: () => documentListeners.delete(fn) }; },
            async applyEdit(edit) {
                if (options.rejectEdit) return false;
                cleared.push(edit.uri.toString());
                generated.text = '';
                const markClean = () => {
                    if (!options.staleDocumentDirty) generated.isDirty = false;
                    group.tabs.find(tab => tab.input.uri.toString() === generated.uri.toString()).isDirty = false;
                    tabListeners.forEach(fn => fn({ changed: group.tabs }));
                };
                if (options.delayedDirty) setImmediate(() => {
                    markClean();
                    documentListeners.forEach(fn => fn({ document: generated }));
                });
                else markClean();
                return true;
            }
        },
        window: { tabGroups: {
            all: [group], activeTabGroup: group,
            onDidChangeTabs(fn) { tabListeners.add(fn); return { dispose: () => tabListeners.delete(fn) }; },
            async close(tab) {
                assert.equal(tab.isDirty, false, 'closing must never prompt to save the export');
                closed.push(tab.input.uri.toString());
                group.tabs.splice(group.tabs.indexOf(tab), 1);
                if (group.activeTab === tab) group.activeTab = original;
                return true;
            }
        } },
        commands: { async executeCommand(command) {
            calls.push(command);
            if (command === 'runCommands' && options.oldVSCode) throw new Error("command 'runCommands' not found");
            if (options.fail) throw new Error('export unavailable');
            if (options.noDocument) return;
            exports += 1;
            const uri = { toString: () => 'untitled:generated-' + exports };
            generated = { uri, isUntitled: true, languageId: 'jsonc', isDirty: true,
                text: JSON.stringify({ $schema: 'vscode://schemas/color-theme', colors: { 'editor.foreground': '#CCCCCC' },
                    tokenColors: [{ scope: 'string', settings: { foreground: options.color || '#123456' } }] }),
                getText() { return this.text; }, positionAt(offset) { return { line: 0, character: offset }; }
            };
            documents.push(generated);
            listeners.forEach(fn => fn(generated));
            if (options.afterCapture) options.afterCapture();
            if (options.userEdited) generated.text += '\n// user edit';
            const tab = { input: { uri }, group, isActive: !options.userSwitched, isDirty: true };
            const addTab = () => {
                group.tabs.push(tab);
                if (!options.userSwitched) group.activeTab = tab;
                tabListeners.forEach(fn => fn({ opened: [tab] }));
            };
            if (options.delayedTab) setImmediate(addTab); else addTab();
        } }
    };
    const module = { exports: {} };
    vm.runInNewContext(source, { module, console: { error() {} },
        setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); },
        require(name) {
            if (name === 'vscode') return vscode;
            if (name === 'jsonc-parser') return jsonc;
            if (name === './themeResolver') return { resolveClientTheme: async (request, _vscode, snapshot) => ({
                themeId: request.themeId, colors: {}, snapshot
            }) };
            throw new Error('Unexpected dependency: ' + name);
        }
    });
    return { api: module.exports, panel, calls, cleared, closed, revealed, documents, listeners, tabListeners, documentListeners,
        get exports() { return exports; }, get generated() { return generated; },
        expire() { [...timers.values()].forEach(fn => fn()); }
    };
}

const request = { themeId: 'Client A', scopes: [] };

test('remote panels share one export and close only their clean generated tab', async () => {
    const f = fixture();
    const [a, b] = await Promise.all([f.api.resolveDisplayTheme(request, f.panel), f.api.resolveDisplayTheme(request, f.panel)]);
    assert.equal(f.exports, 1);
    assert.equal(a.snapshot.tokenColors[0].settings.foreground, '#123456');
    assert.equal(b.themeId, 'Client A');
    assert.deepEqual(f.cleared, ['untitled:generated-1']);
    assert.deepEqual(f.closed, ['untitled:generated-1']);
    assert.equal(f.documents[0].getText(), 'unsaved user text');
    assert.equal(f.revealed.length, 1);
    assert.equal(f.listeners.size, 0);
    assert.ok(!f.calls.some(command => /installExtension|themeBridge/.test(command)));
});

test('theme changes invalidate the shared cache, including customization of the same theme', async () => {
    const f = fixture();
    await f.api.resolveDisplayTheme(request, f.panel);
    await f.api.resolveDisplayTheme(request, f.panel);
    assert.equal(f.exports, 1);
    f.api.invalidateClientTheme();
    await f.api.resolveDisplayTheme(request, f.panel);
    assert.equal(f.exports, 2);
});

test('tab creation can arrive after the text document without leaking a temporary editor', async () => {
    const f = fixture({ delayedTab: true });
    await f.api.resolveDisplayTheme(request, f.panel);
    assert.equal(f.closed.length, 1);
    assert.equal(f.tabListeners.size, 0);
});

test('remote dirty-state notifications can arrive after applyEdit resolves', async () => {
    const f = fixture({ delayedDirty: true });
    await f.api.resolveDisplayTheme(request, f.panel);
    assert.equal(f.closed.length, 1);
    assert.equal(f.documentListeners.size, 0);
});

test('the UI tab dirty state is authoritative when remote document notifications are stale', async () => {
    const f = fixture({ staleDocumentDirty: true });
    await f.api.resolveDisplayTheme(request, f.panel);
    assert.equal(f.generated.isDirty, true);
    assert.equal(f.closed.length, 1);
});

test('a theme changed during export discards the stale snapshot but still cleans its editor', async () => {
    const options = {};
    const f = fixture(options);
    options.afterCapture = () => f.api.invalidateClientTheme();
    await assert.rejects(f.api.resolveDisplayTheme(request, f.panel), /changed during export/);
    assert.equal(f.closed.length, 1);
});

test('user edits to the generated document are preserved', async () => {
    const f = fixture({ userEdited: true });
    await f.api.resolveDisplayTheme(request, f.panel);
    assert.equal(f.cleared.length, 0);
    assert.equal(f.closed.length, 0);
    assert.ok(f.generated.getText().includes('user edit'));
});

test('switching to another tab does not force focus back to the requesting panel', async () => {
    const f = fixture({ userSwitched: true });
    await f.api.resolveDisplayTheme(request, f.panel);
    assert.equal(f.closed.length, 1);
    assert.equal(f.revealed.length, 0);
});

test('a rejected versioned edit does not close a dirty document', async () => {
    const f = fixture({ rejectEdit: true });
    await f.api.resolveDisplayTheme(request, f.panel);
    assert.equal(f.closed.length, 0);
});

test('failed exports return neutral colors and do not repeatedly open editors', async () => {
    const f = fixture({ fail: true });
    const messages = [];
    const panel = { webview: { postMessage: message => messages.push(message) } };
    await f.api.handleThemeRequest({ ...request, requestId: '1' }, panel);
    await f.api.handleThemeRequest({ ...request, requestId: '2' }, panel);
    assert.equal(f.calls.length, 1);
    assert.equal(messages[0].unavailable, true);
    assert.equal(messages[1].requestId, '2');
    assert.equal(f.listeners.size, 0);
});

test('an export that produces no document times out and releases its listeners', async () => {
    const f = fixture({ noDocument: true });
    const task = f.api.resolveDisplayTheme(request, f.panel);
    await new Promise(resolve => setImmediate(resolve));
    f.expire();
    await assert.rejects(task, /timed out/);
    assert.equal(f.listeners.size, 0);
});

test('older VS Code versions use the direct export command', async () => {
    const f = fixture({ oldVSCode: true });
    await f.api.resolveDisplayTheme(request, f.panel);
    assert.deepEqual(f.calls, ['runCommands', 'workbench.action.generateColorTheme']);
});

test('local theme resolution does not open an export editor', async () => {
    const f = fixture({ local: true });
    const result = await f.api.resolveDisplayTheme(request, f.panel);
    assert.equal(result.snapshot, undefined);
    assert.equal(f.calls.length, 0);
});
