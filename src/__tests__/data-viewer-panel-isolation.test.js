const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const DATA_VIEWER_DIR = path.resolve(
    __dirname,
    '../modules/runCode/embeddedConsole/dataViewer'
);
const PANEL_PATH = path.join(DATA_VIEWER_DIR, 'panel.js');
const MANGLED_MODULES = [
    'panel.js',
    'directDtaStore.js',
    'consoleStore.js',
    'status.js',
    'viewerRequestTracker.js',
    'provider.js',
    'autocomplete.js',
    'dtaParser.js',
    'dtaFilterCompiler.js'
].map((name) => path.join(DATA_VIEWER_DIR, name));

function createVscodeStub() {
    const vscodeStub = {
        env: { language: 'en', appRoot: '/tmp/appRoot' },
        Uri: {
            file: (p) => ({ fsPath: p, scheme: 'file', toString: () => 'file://' + p }),
            joinPath: (...parts) => ({
                fsPath: parts.map((part) => (typeof part === 'string' ? part : part.fsPath)).join('/')
            })
        },
        ViewColumn: { Two: 2 },
        workspace: {
            getConfiguration: () => ({ get: () => '' }),
            onDidChangeConfiguration: () => ({ dispose() {} })
        },
        window: {
            createWebviewPanel: () => createPanel(),
            showInformationMessage: async () => undefined,
            showErrorMessage: async () => undefined,
            showWarningMessage: async () => undefined
        },
        EventEmitter: class {
            constructor() {
                this.event = () => ({ dispose() {} });
            }
            fire() {}
            dispose() {}
        },
        commands: { executeCommand: async () => undefined }
    };

    function createPanel() {
        const panel = {
            title: '',
            iconPath: null,
            active: true,
            messages: [],
            incoming: [],
            webview: {
                options: {},
                html: '',
                onDidReceiveMessage(handler) {
                    panel.incoming.push(handler);
                    return { dispose() {} };
                },
                postMessage(message) {
                    panel.messages.push(message);
                    return Promise.resolve(true);
                },
                asWebviewUri: (uri) => uri
            },
            onDidChangeViewState() { return { dispose() {} }; },
            onDidDispose(handler) { panel._onDispose = handler; return { dispose() {} }; },
            reveal() {},
            dispose() {
                if (panel._onDispose) panel._onDispose();
            }
        };
        return panel;
    }

    return { vscodeStub, createPanel };
}

/**
 * Load dataViewer/panel.js against a stubbed `vscode` and stubbed stores, with a
 * pristine require cache for the whole data-viewer module graph so every test
 * sees its own stubs.
 */
function createHarness({ directDtaStore, consoleStore }) {
    const { vscodeStub, createPanel } = createVscodeStub();
    const originalLoad = Module._load;
    const srcRoot = path.resolve(__dirname, '..') + path.sep;

    Module._load = function (request, parent, isMain) {
        const from = parent ? parent.filename : '';
        if (request === 'vscode' && from.startsWith(srcRoot)) {
            return vscodeStub;
        }
        if (from === PANEL_PATH && request === './directDtaStore') {
            return directDtaStore;
        }
        if (from === PANEL_PATH && request === './consoleStore') {
            return consoleStore;
        }
        if (from === PANEL_PATH && request === '../../../variableSuggestionService') {
            return {
                getActiveVariables: () => [],
                getActiveVariableCandidates: () => [],
                setMemoryVars: () => {},
                refreshMemoryVars: async () => [],
                onDidChangeVariables: () => ({ dispose() {} })
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    for (const modulePath of MANGLED_MODULES) {
        delete require.cache[modulePath];
    }
    let panelModule;
    try {
        panelModule = require(PANEL_PATH);
    } finally {
        Module._load = originalLoad;
    }

    return {
        panelModule,
        createPanel,
        async deliver(panel, message) {
            for (const handler of panel.incoming.slice()) {
                await handler(message);
            }
        },
        cleanup() {
            for (const modulePath of MANGLED_MODULES) {
                delete require.cache[modulePath];
            }
        }
    };
}

function createConsoleStoreStub() {
    return {
        getLiveSnapshot: async () => ({ error: 'unused' }),
        getLiveMore: async () => [],
        getLiveColumnAutoFitValue: async () => '',
        captureSnapshot: async () => ({ data: null, view: null }),
        getSnapshot: async () => ({ error: 'unused' }),
        getMore: async () => [],
        getColumnAutoFitValue: async () => '',
        invalidateLive: async () => {},
        resetLive: async () => {},
        dispose: async () => {}
    };
}

function snapshotFor(source, value) {
    return {
        meta: { headers: ['id'], nobs: 3 },
        info: { observations: 3, totalObservations: 3 },
        vars: [{ name: 'id', type: 'long', format: '%9.0g', label: null }],
        dataColumns: ['id'],
        allVarNames: ['id'],
        dataRows: [{ rowNum: 1, values: [value] }],
        windowStart: 0,
        filterText: '',
        source
    };
}

test('pagination for file A never reads file B and never posts to B', async () => {
    const reads = [];
    const directDtaStore = {
        getSnapshot: async (filePath) => snapshotFor(filePath, 1),
        getMore: async (filePath, startObs, count) => {
            reads.push({ filePath, startObs, count });
            return [{ rowNum: startObs + 1, values: [path.basename(filePath) + ':' + startObs] }];
        },
        getColumnAutoFitValue: async () => '',
        dispose: () => {}
    };
    const harness = createHarness({ directDtaStore, consoleStore: createConsoleStoreStub() });

    try {
        const panelA = harness.createPanel();
        const panelB = harness.createPanel();
        await harness.panelModule.openDtaFileInDataViewer(null, { scheme: 'file', fsPath: '/data/a.dta' }, panelA);
        await harness.panelModule.openDtaFileInDataViewer(null, { scheme: 'file', fsPath: '/data/b.dta' }, panelB);
        await harness.deliver(panelA, { type: 'ready' });
        await harness.deliver(panelB, { type: 'ready' });
        panelA.messages.length = 0;
        panelB.messages.length = 0;

        await harness.deliver(panelA, { type: 'loadWindow', startObs: 10, count: 5, filterText: '' });
        assert.deepEqual(reads.at(-1), { filePath: '/data/a.dta', startObs: 10, count: 5 });
        const windowA = panelA.messages.filter((message) => message.type === 'setWindow');
        assert.equal(windowA.length, 1, 'panel A must receive its own window');
        assert.equal(windowA[0].windowStart, 10);
        assert.deepEqual(
            panelB.messages.filter((message) => message.type === 'setWindow'),
            [],
            'panel B must not receive panel A rows'
        );

        await harness.deliver(panelB, { type: 'loadWindow', startObs: 20, count: 5, filterText: '' });
        assert.deepEqual(reads.at(-1), { filePath: '/data/b.dta', startObs: 20, count: 5 });
        const windowB = panelB.messages.filter((message) => message.type === 'setWindow');
        assert.equal(windowB.length, 1);
        assert.equal(windowB[0].windowStart, 20);
    } finally {
        harness.cleanup();
    }
});

test('closing one file panel does not disturb another and drops only its own cache', async () => {
    const disposed = [];
    const directDtaStore = {
        getSnapshot: async (filePath) => snapshotFor(filePath, 1),
        getMore: async () => [{ rowNum: 1, values: ['b'] }],
        getColumnAutoFitValue: async () => '',
        dispose: (filePath) => disposed.push(filePath)
    };
    const harness = createHarness({ directDtaStore, consoleStore: createConsoleStoreStub() });

    try {
        const panelA = harness.createPanel();
        const panelB = harness.createPanel();
        await harness.panelModule.openDtaFileInDataViewer(null, { scheme: 'file', fsPath: '/data/a.dta' }, panelA);
        await harness.panelModule.openDtaFileInDataViewer(null, { scheme: 'file', fsPath: '/data/b.dta' }, panelB);
        await harness.deliver(panelA, { type: 'ready' });
        await harness.deliver(panelB, { type: 'ready' });

        panelA.dispose();
        assert.deepEqual(disposed, ['/data/a.dta'], 'only the closed file releases its parsed columns');

        panelB.messages.length = 0;
        await harness.deliver(panelB, { type: 'loadWindow', startObs: 0, count: 5, filterText: '' });
        assert.equal(
            panelB.messages.filter((message) => message.type === 'setWindow').length,
            1,
            'the surviving panel keeps working'
        );
    } finally {
        harness.cleanup();
    }
});

test('a superseded refresh result does not overwrite a newer one', async () => {
    const pending = [];
    const issued = [];
    const directDtaStore = {
        getSnapshot: (filePath, limit, filterText) => new Promise((resolve) => {
            const entry = {
                filterText,
                resolved: false,
                resolve: (value) => {
                    entry.resolved = true;
                    resolve(value);
                }
            };
            pending.push(entry);
            issued.push(filterText);
        }),
        getMore: async () => [],
        getColumnAutoFitValue: async () => '',
        dispose: () => {}
    };
    const harness = createHarness({ directDtaStore, consoleStore: createConsoleStoreStub() });

    // Drain every outstanding read with a snapshot, until the panel settles.
    async function settleAll(value) {
        for (let round = 0; round < 6; round += 1) {
            const outstanding = pending.splice(0, pending.length);
            if (!outstanding.length) {
                return;
            }
            for (const entry of outstanding) {
                entry.resolve(snapshotFor(entry.filterText || 'initial', value));
            }
            await new Promise((resolve) => setImmediate(resolve));
        }
        throw new Error('the panel kept re-issuing reads');
    }

    try {
        const panel = harness.createPanel();
        const opening = harness.panelModule.openDtaFileInDataViewer(
            null,
            { scheme: 'file', fsPath: '/data/a.dta' },
            panel
        );
        assert.equal(pending.length, 1, 'opening the file reads it once');
        pending.shift().resolve(snapshotFor('/data/a.dta', 'initial'));
        await opening;

        // The 'ready' handshake refreshes once.
        const readyRefresh = harness.deliver(panel, { type: 'ready' });
        assert.equal(pending.length, 1, 'becoming ready refreshes once');
        pending.shift().resolve(snapshotFor('/data/a.dta', 'ready'));
        await readyRefresh;
        panel.messages.length = 0;

        // Two overlapping refreshes: the older one is superseded and its result
        // arrives last.
        const older = harness.deliver(panel, { type: 'refresh', filterText: 'if id > 1' });
        assert.equal(pending.length, 1, 'the refresh issues exactly one read');
        const newer = harness.deliver(panel, { type: 'refresh', filterText: 'if id > 2' });
        assert.equal(pending.length, 2, 'the newer refresh issues its own read');

        // The newer read lands first...
        const newerRead = pending.find((entry) => !entry.resolved && entry.filterText === 'if id > 2');
        newerRead.resolve(snapshotFor('if id > 2', 'newer'));
        await newer;

        // ...and the older read lands afterwards, far too late.
        const olderRead = pending.find((entry) => !entry.resolved && entry.filterText === 'if id > 1');
        olderRead.resolve(snapshotFor('if id > 1', 'stale'));
        await new Promise((resolve) => setImmediate(resolve));

        // The superseded read is retried against the CURRENT filter rather than
        // applied or silently dropped.
        const retry = pending.find((entry) => !entry.resolved && entry.filterText === 'if id > 2');
        assert.ok(retry, 'the superseded read must be retried with the current filter');
        retry.resolve(snapshotFor('if id > 2', 'newest'));
        await older;

        const applied = panel.messages.filter(
            (message) => message.type === 'setData'
                && message.data
                && Array.isArray(message.data.dataRows)
                && message.data.dataRows.length
        );
        assert.deepEqual(
            applied.map((message) => message.data.dataRows[0].values[0]),
            ['newer', 'newest'],
            'the stale value must never render'
        );
        assert.equal(
            applied.some((message) => message.data.dataRows[0].values[0] === 'stale'),
            false,
            'the superseded read value must never reach the table'
        );
        await settleAll('final');
    } finally {
        harness.cleanup();
    }
});
