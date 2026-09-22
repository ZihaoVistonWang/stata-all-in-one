const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

test('discards an in-flight capture after Console data is invalidated', async () => {
    const storePath = path.resolve(
        __dirname,
        '../modules/runCode/embeddedConsole/dataViewer/consoleStore.js'
    );
    const captures = [];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === 'vscode') {
            return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
        }
        if (parent && parent.filename === storePath && request === './consoleDataReader') {
            return {
                DEFAULT_WINDOW_ROWS: 2000,
                capture: () => new Promise((resolve) => {
                    captures.push(resolve);
                })
            };
        }
        if (parent && parent.filename === storePath && request === './directDtaStore') {
            return {
                getSnapshotFromData: (data) => ({ marker: data.marker })
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[storePath];

    try {
        const store = require(storePath);
        const pending = store.getLiveSnapshot();
        assert.equal(captures.length, 1);

        await store.invalidateLive();
        captures[0]({
            marker: 'stale',
            meta: { nobs: 1, headers: ['x'], windowStart: 1, windowEnd: 1 }
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(captures.length, 2, 'a superseded capture must be retried');

        captures[1]({
            marker: 'fresh',
            meta: { nobs: 1, headers: ['x'], windowStart: 1, windowEnd: 1 }
        });
        assert.equal((await pending).marker, 'fresh');
    } finally {
        Module._load = originalLoad;
        delete require.cache[storePath];
    }
});

test('reports a read error instead of hanging when the capture keeps being superseded', async () => {
    const storePath = path.resolve(
        __dirname,
        '../modules/runCode/embeddedConsole/dataViewer/consoleStore.js'
    );
    const captures = [];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === 'vscode') {
            return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
        }
        if (parent && parent.filename === storePath && request === './consoleDataReader') {
            return {
                DEFAULT_WINDOW_ROWS: 2000,
                capture: () => new Promise((resolve, reject) => {
                    captures.push({ resolve, reject });
                })
            };
        }
        if (parent && parent.filename === storePath && request === './directDtaStore') {
            return { getSnapshotFromData: (data) => ({ marker: data.marker }) };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[storePath];

    try {
        const store = require(storePath);
        const pending = store.getLiveSnapshot();
        const failure = new Error('plugin failed');
        captures[0].reject(failure);
        await assert.rejects(() => pending, /plugin failed/);
    } finally {
        Module._load = originalLoad;
        delete require.cache[storePath];
    }
});
