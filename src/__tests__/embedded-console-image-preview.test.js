const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');

function createHarness(options = {}) {
    const calls = [];
    let receiveMessage;
    let didDispose;
    const panel = {
        title: '',
        webview: {
            cspSource: 'webview-source',
            html: '',
            options: {},
            asWebviewUri(uri) {
                return `preview:${uri.fsPath}`;
            },
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
        Uri: {
            file(filePath) {
                return { fsPath: filePath };
            }
        },
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
                panel.webview.options = webviewOptions;
                return panel;
            }
        }
    };

    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === 'vscode') return vscode;
        return originalLoad.call(this, request, parent, isMain);
    };
    const modulePath = require.resolve('../modules/runCode/embeddedConsole/imagePreviewManager');
    delete require.cache[modulePath];
    let ImagePreviewManager;
    try {
        ({ ImagePreviewManager } = require(modulePath));
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }

    return {
        calls,
        panel,
        manager: new ImagePreviewManager(vscode),
        receive(message) {
            receiveMessage(message);
        }
    };
}

function image(overrides = {}) {
    return {
        imageUri: 'data:image/png;base64,AAAA',
        title: 'Graph 1',
        panelTitle: 'Image Preview',
        closeLabel: 'Close',
        ...overrides
    };
}

test('falls back without creating a panel when the floating-window command is unavailable', async () => {
    const harness = createHarness({ commands: ['other.command'] });
    assert.equal(await harness.manager.showImage(image()), false);
    assert.deepEqual(harness.calls, [['getCommands', true]]);
});

test('creates, reveals, then moves the preview panel in strict order', async () => {
    const harness = createHarness();
    assert.equal(await harness.manager.showImage(image()), true);

    const operationNames = harness.calls
        .filter(call => ['createWebviewPanel', 'reveal', 'executeCommand'].includes(call[0]))
        .map(call => call[0]);
    assert.deepEqual(operationNames, ['createWebviewPanel', 'reveal', 'executeCommand']);
    assert.equal(harness.panel.webview.html.includes("vscode.postMessage({ type: 'ready' })"), true);
});

test('reuses one panel and updates its image instead of creating another panel', async () => {
    const harness = createHarness();
    await harness.manager.showImage(image());
    await harness.manager.showImage(image({ imageUri: 'data:image/png;base64,BBBB', title: 'Graph 2' }));

    assert.equal(harness.calls.filter(call => call[0] === 'createWebviewPanel').length, 1);
    assert.equal(harness.calls.filter(call => call[0] === 'reveal').length, 2);
    assert.deepEqual(harness.calls.filter(call => call[0] === 'reveal').at(-1), [
        'reveal', undefined, false
    ]);
    const stateMessages = harness.calls
        .filter(call => call[0] === 'postMessage' && call[1].type === 'setImageState')
        .map(call => call[1]);
    assert.equal(stateMessages.at(-1).imageUri, 'data:image/png;base64,BBBB');
    assert.equal(stateMessages.at(-1).title, 'Graph 2');
});

test('serializes simultaneous opens so rapid clicks create only one panel', async () => {
    let releaseCommands;
    const waitForCommands = new Promise(resolve => {
        releaseCommands = resolve;
    });
    const harness = createHarness({ waitForCommands });
    const first = harness.manager.showImage(image({ title: 'Graph 1' }));
    const second = harness.manager.showImage(image({ title: 'Graph 2' }));
    releaseCommands();

    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(harness.calls.filter(call => call[0] === 'createWebviewPanel').length, 1);
    const stateMessage = harness.calls
        .filter(call => call[0] === 'postMessage' && call[1].type === 'setImageState')
        .at(-1)[1];
    assert.equal(stateMessage.title, 'Graph 2');
});

test('makes simultaneous clicks share a failed move result', async () => {
    let releaseMove;
    const waitForMove = new Promise(resolve => {
        releaseMove = resolve;
    });
    const harness = createHarness({ waitForMove, moveError: new Error('unsupported') });
    const first = harness.manager.showImage(image({ title: 'Graph 1' }));
    await new Promise(resolve => setImmediate(resolve));
    const second = harness.manager.showImage(image({ title: 'Graph 2' }));
    releaseMove();

    assert.deepEqual(await Promise.all([first, second]), [false, false]);
    assert.equal(harness.calls.filter(call => call[0] === 'createWebviewPanel').length, 1);
    assert.equal(harness.calls.filter(call => call[0] === 'dispose').length, 1);
});

test('creates a preview-specific webview URI for local graph files', async () => {
    const harness = createHarness();
    const filePath = path.join('/tmp', 'graphs', 'figure.svg');
    await harness.manager.showImage(image({ imageUri: 'old-webview-uri', filePath }));
    harness.receive({ type: 'ready' });

    const createCall = harness.calls.find(call => call[0] === 'createWebviewPanel');
    assert.equal(createCall[4].localResourceRoots[0].fsPath, path.dirname(filePath));
    const stateMessage = harness.calls
        .filter(call => call[0] === 'postMessage' && call[1].type === 'setImageState')
        .at(-1)[1];
    assert.equal(stateMessage.imageUri, `preview:${filePath}`);
});

test('disposes a newly created panel and reports fallback when moving fails', async () => {
    const harness = createHarness({ moveError: new Error('unsupported') });
    assert.equal(await harness.manager.showImage(image()), false);
    assert.equal(harness.calls.some(call => call[0] === 'dispose'), true);

    await harness.manager.showImage(image({ title: 'Retry' }));
    assert.equal(harness.calls.filter(call => call[0] === 'createWebviewPanel').length, 2);
});

test('restores state after ready, accepts state updates, and clears the reference on close', async () => {
    const harness = createHarness();
    await harness.manager.showImage(image());
    harness.receive({
        type: 'previewStateChanged',
        zoom: 1.5,
        position: { x: 12, y: -8 }
    });
    harness.receive({ type: 'ready' });

    const restored = harness.calls
        .filter(call => call[0] === 'postMessage' && call[1].type === 'setImageState')
        .at(-1)[1];
    assert.equal(restored.zoom, 1.5);
    assert.deepEqual(restored.position, { x: 12, y: -8 });

    harness.receive({ type: 'close' });
    await harness.manager.showImage(image({ title: 'New Panel' }));
    assert.equal(harness.calls.filter(call => call[0] === 'createWebviewPanel').length, 2);
});

test('routes the existing Console full-screen action through the manager with local fallback', () => {
    const panelSource = fs.readFileSync(
        path.join(__dirname, '../modules/runCode/embeddedConsole/panel.js'),
        'utf8'
    );
    assert.equal(panelSource.includes("type: 'openGraphPreview'"), true);
    assert.equal(panelSource.includes("message.type === 'showGraphFullscreenFallback'"), true);
    assert.equal(panelSource.includes('showGraphFullscreen({'), true);
    assert.equal(panelSource.includes('id="graph-fullscreen"'), true);
});
