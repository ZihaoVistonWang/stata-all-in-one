const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');

function loadManager(vscode) {
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === 'vscode') return vscode;
        return originalLoad.call(this, request, parent, isMain);
    };
    const modulePath = require.resolve('../modules/runCode/embeddedConsole/resultPreviewManager');
    delete require.cache[modulePath];
    try {
        return require(modulePath);
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
}

function createHarness(options = {}) {
    const calls = [];
    let receiveMessage;
    let didDispose;
    const panel = {
        title: '',
        webview: {
            cspSource: 'webview-source',
            html: '',
            postMessage(message) {
                calls.push(['postMessage', message]);
                return Promise.resolve(true);
            },
            onDidReceiveMessage(handler) {
                receiveMessage = handler;
                return { dispose() {} };
            }
        },
        reveal(viewColumn, preserveFocus) {
            calls.push(['reveal', viewColumn, preserveFocus]);
        },
        onDidDispose(handler) {
            didDispose = handler;
            return { dispose() {} };
        },
        dispose() {
            calls.push(['dispose']);
            if (didDispose) didDispose();
        }
    };
    const vscode = {
        ViewColumn: { Active: -1 },
        commands: {
            async getCommands(includeInternal) {
                calls.push(['getCommands', includeInternal]);
                if (options.waitForCommands) await options.waitForCommands;
                return options.commands || ['workbench.action.moveEditorToNewWindow'];
            },
            async executeCommand(command) {
                calls.push(['executeCommand', command]);
                if (options.waitForMove) await options.waitForMove;
                if (options.moveError) throw options.moveError;
            }
        },
        window: {
            createWebviewPanel(viewType, title, viewColumn, webviewOptions) {
                calls.push(['createWebviewPanel', viewType, title, viewColumn, webviewOptions]);
                panel.title = title;
                return panel;
            }
        }
    };
    const loaded = loadManager(vscode);
    return {
        ...loaded,
        calls,
        panel,
        manager: new loaded.ResultPreviewManager(vscode),
        receive(message) {
            receiveMessage(message);
        }
    };
}

function preview(overrides = {}) {
    return {
        commandLines: [{
            segments: [{ text: 'regress y x', className: 'tok tok-command', style: {} }]
        }],
        entries: [{
            kind: 'default',
            segments: [{
                text: 'wide result',
                className: 'tok tok-plain',
                style: { color: '#fff' }
            }]
        }],
        panelTitle: 'Result Preview | Stata All in One',
        closeLabel: 'Close',
        openFileLabel: 'Open file',
        appearance: {
            themeVars: { plain: '#ffffff' },
            fontOptions: { fontMode: 'system', fontSize: 14, systemFallbackFamily: 'monospace' }
        },
        ...overrides
    };
}

test('collects a complete result block and stops at every non-result boundary', () => {
    const { collectResultBlock } = createHarness();
    const history = [
        { kind: 'submission' },
        { kind: 'default', segments: [{ text: 'a' }] },
        { kind: 'footer', segments: [{ text: 'b' }] },
        { kind: 'command' },
        { kind: 'default', segments: [{ text: 'c' }] },
        { kind: 'graph' },
        { kind: 'default', segments: [{ text: 'd' }] },
        { kind: 'raw-prompt' },
        { kind: 'default', segments: [{ text: 'e' }] }
    ];
    assert.deepEqual(collectResultBlock(history, 2), history.slice(1, 3));
    assert.deepEqual(collectResultBlock(history, 4), history.slice(4, 5));
    assert.deepEqual(collectResultBlock(history, 6), history.slice(6, 7));
    assert.deepEqual(collectResultBlock(history, 8), history.slice(8, 9));
    assert.deepEqual(collectResultBlock(history, 0), []);
});

test('uses only the adjacent comment and command group and removes timing footer rows', () => {
    const { collectResultPreview } = createHarness();
    const history = [
        {
            kind: 'submission',
            code: '// every earlier input\nsysuse auto, clear\n// Basic data exploration\ndescribe'
        },
        { kind: 'command', segments: [{ text: '. sysuse auto, clear', tokenType: 'prompt' }] },
        { kind: 'default', segments: [{ text: '(1978 automobile data)' }] },
        { kind: 'blank', segments: [] },
        {
            kind: 'comment-command',
            segments: [
                { text: '. ', tokenType: 'prompt' },
                { text: '// Basic data exploration', tokenType: 'comment' }
            ]
        },
        {
            kind: 'command',
            segments: [
                { text: '. ', tokenType: 'prompt' },
                { text: 'describe', tokenType: 'command' }
            ]
        },
        { kind: 'default', segments: [{ text: 'Contains data from auto.dta' }] },
        { kind: 'footer', segments: [{ text: 'Worked for 0.3s' }] },
        { kind: 'blank', segments: [] }
    ];
    const result = collectResultPreview(history, 6);
    assert.deepEqual(
        result.commandLines.map(line => line.segments.map(segment => segment.text).join('')),
        ['// Basic data exploration', 'describe']
    );
    assert.deepEqual(result.entries, [history[6]]);
    assert.equal(
        result.entries.some(entry => entry.kind === 'footer'
            || entry.segments.some(segment => String(segment.text).includes('Worked for'))),
        false
    );
});

test('reports unsupported without creating a preview panel', async () => {
    const harness = createHarness({ commands: ['other.command'] });
    assert.equal(await harness.manager.isSupported(), false);
    assert.equal(await harness.manager.showResult(preview()), false);
    assert.equal(harness.calls.some(call => call[0] === 'createWebviewPanel'), false);
});

test('creates, reveals, then moves the Result Preview in strict order', async () => {
    const harness = createHarness();
    assert.equal(await harness.manager.showResult(preview()), true);
    assert.deepEqual(
        harness.calls
            .filter(call => ['createWebviewPanel', 'reveal', 'executeCommand'].includes(call[0]))
            .map(call => call[0]),
        ['createWebviewPanel', 'reveal', 'executeCommand']
    );
    assert.equal(harness.panel.webview.html.includes("span.textContent = String((segment && segment.text) || '')"), true);
    assert.equal(harness.panel.webview.html.includes('innerHTML'), false);
    assert.equal(harness.panel.webview.html.includes("type: 'openConsoleFile'"), true);
    assert.equal(harness.panel.webview.html.includes('renderCommand(message.commandLines'), true);
    assert.equal(harness.panel.webview.html.includes("prompt.textContent = index === 0 ? '. ' : '> '"), true);
    assert.equal(harness.panel.webview.html.includes('border: none;'), true);
});

test('forces standalone summary equals signs to use the separator color', async () => {
    const harness = createHarness();
    await harness.manager.showResult(preview({
        entries: [{
            kind: 'summary',
            segments: [
                { text: 'Prob > F', className: 'tok tok-header is-bold', style: { color: '#ff00aa' } },
                { text: ' = ', className: 'tok tok-header is-bold', style: { color: '#ff00aa' } },
                { text: '0.0000', className: 'tok tok-number', style: { color: '#aa88ff' } }
            ]
        }]
    }));

    const state = harness.calls
        .filter(call => call[0] === 'postMessage' && call[1].type === 'setResultState')
        .at(-1)[1];
    assert.deepEqual(state.entries[0].segments[1], {
        text: ' = ',
        className: 'tok tok-separator',
        style: { color: '', backgroundColor: '' },
        consoleLink: null
    });
});

test('reuses the existing floating panel without moving it back to the active column', async () => {
    const harness = createHarness();
    await harness.manager.showResult(preview());
    await harness.manager.showResult(preview({
        entries: [{ kind: 'default', segments: [{ text: 'replacement' }] }]
    }));

    assert.equal(harness.calls.filter(call => call[0] === 'createWebviewPanel').length, 1);
    assert.deepEqual(harness.calls.filter(call => call[0] === 'reveal').at(-1), [
        'reveal', undefined, false
    ]);
    const state = harness.calls
        .filter(call => call[0] === 'postMessage' && call[1].type === 'setResultState')
        .at(-1)[1];
    assert.equal(state.commandLines[0].segments[0].text, 'regress y x');
    assert.equal(state.entries[0].segments[0].text, 'replacement');
});

test('serializes rapid clicks so they create only one panel', async () => {
    let releaseCommands;
    const waitForCommands = new Promise(resolve => {
        releaseCommands = resolve;
    });
    const harness = createHarness({ waitForCommands });
    const first = harness.manager.showResult(preview());
    const second = harness.manager.showResult(preview({
        entries: [{ kind: 'default', segments: [{ text: 'latest' }] }]
    }));
    releaseCommands();

    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(harness.calls.filter(call => call[0] === 'createWebviewPanel').length, 1);
    const state = harness.calls
        .filter(call => call[0] === 'postMessage' && call[1].type === 'setResultState')
        .at(-1)[1];
    assert.equal(state.entries[0].segments[0].text, 'latest');
});

test('disables future previews and releases the panel when moving fails', async () => {
    const harness = createHarness({ moveError: new Error('unsupported') });
    assert.equal(await harness.manager.showResult(preview()), false);
    assert.equal(harness.calls.filter(call => call[0] === 'dispose').length, 1);
    assert.equal(await harness.manager.isSupported(), false);
    assert.equal(await harness.manager.showResult(preview()), false);
    assert.equal(harness.calls.filter(call => call[0] === 'createWebviewPanel').length, 1);
});

test('restores Host-owned scroll state after a Webview ready message', async () => {
    const harness = createHarness();
    await harness.manager.showResult(preview());
    harness.receive({ type: 'scrollChanged', left: 120, top: 45 });
    harness.receive({ type: 'ready' });

    const restored = harness.calls
        .filter(call => call[0] === 'postMessage' && call[1].type === 'setResultState')
        .at(-1)[1];
    assert.deepEqual(restored.scrollPosition, { left: 120, top: 45 });
});

test('normalizes and forwards existing Console links from the preview', async () => {
    const opened = [];
    const harness = createHarness();
    await harness.manager.showResult(preview({
        entries: [{
            kind: 'default',
            segments: [{
                text: '/tmp/result.txt',
                consoleLink: { kind: 'file', target: '/tmp/result.txt', source: 'smcl' }
            }]
        }],
        openLink: link => opened.push(link)
    }));
    harness.receive({
        type: 'openConsoleFile',
        link: { kind: 'file', target: '/tmp/result.txt', source: 'smcl' }
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(opened, [{ kind: 'file', target: '/tmp/result.txt', source: 'smcl' }]);
});

test('wires capability-gated hover controls into overflowing Console result blocks', () => {
    const panelSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/panel.js'),
        'utf8'
    );
    const commonSource = fs.readFileSync(path.join(__dirname, '../utils/common.js'), 'utf8');
    assert.equal(panelSource.includes("className = 'result-expand-button codicon-screen-full'"), true);
    assert.equal(panelSource.includes("type: 'openResultPreview'"), true);
    assert.equal(panelSource.includes("message.type === 'resultPreviewCapability'"), true);
    assert.match(panelSource, /\.result-block-shell\.has-horizontal-overflow:hover \.result-expand-button/);
    assert.match(panelSource, /\.result-expand-button\s*\{[\s\S]*border:\s*1px solid var\(--vscode-focusBorder\)/);
    assert.match(panelSource, /\.result-expand-button\s*\{[\s\S]*position:\s*sticky/);
    assert.match(panelSource, /\.result-block-shell\s*\{[\s\S]*display:\s*grid/);
    assert.equal(commonSource.includes("consoleExpandResult: 'Expand result'"), true);
    assert.equal(commonSource.includes("consoleExpandResult: '展开结果'"), true);
});
