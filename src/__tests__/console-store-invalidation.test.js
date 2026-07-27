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
        if (parent && parent.filename === storePath && request === './consoleDataReader') {
            return {
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
        captures[0]({ marker: 'stale' });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(captures.length, 2);

        captures[1]({ marker: 'fresh' });
        assert.equal((await pending).marker, 'fresh');
    } finally {
        Module._load = originalLoad;
        delete require.cache[storePath];
    }
});
