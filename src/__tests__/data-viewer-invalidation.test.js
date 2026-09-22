const test = require('node:test');
const assert = require('node:assert/strict');

const nativePath = require.resolve('../modules/runCode/embeddedConsole/native/stata_process');
const sessionPath = require.resolve('../modules/runCode/embeddedConsole/session');

function createContext() {
    const values = new Map();
    return {
        globalState: {
            get(key) {
                return values.get(key);
            },
            update(key, value) {
                if (value === undefined) values.delete(key);
                else values.set(key, value);
                return Promise.resolve();
            }
        }
    };
}

function loadSessionWith(engine) {
    require.cache[nativePath] = {
        id: nativePath,
        filename: nativePath,
        loaded: true,
        exports: engine
    };
    delete require.cache[sessionPath];
    return require(sessionPath);
}

function createEngine(script = {}) {
    const state = { commands: [], initialized: true };
    return {
        state,
        isLoaded: () => true,
        isInitialized: () => state.initialized,
        getDylibPath: () => '/tmp/libstata-mp.dylib',
        async initSession() {
            state.initialized = true;
            return true;
        },
        async execute(code) {
            state.commands.push(code);
            return script[code] || { success: true, returnCode: 0, output: '' };
        },
        shutdown() {
            state.initialized = false;
        },
        clearOutput() {},
        setBreak() {
            return true;
        }
    };
}

test('a partially applied, then failing, command still invalidates cached data', async () => {
    const engine = createEngine({
        drop: { success: true, returnCode: 0, output: '' },
        'summarize price': { success: false, returnCode: 111, output: '', error: 'r(111);' }
    });
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');

        const changes = [];
        const subscription = sessionManager.onDidChangeData((event) => changes.push(event));

        // The user's run: `drop` succeeded, `summarize price` failed.
        const first = await session.runUserCode('drop');
        assert.equal(first.success, true);
        const second = await session.runUserCode('summarize price');
        assert.equal(second.success, false, 'the second command must report its failure');

        assert.equal(changes.length, 2, 'both commands changed (or may have changed) the data');
        subscription.dispose();
    } finally {
        delete require.cache[sessionPath];
    }
});

test('internal viewer reads do not invalidate the data they are reading', async () => {
    const engine = createEngine();
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');

        const changes = [];
        const subscription = sessionManager.onDidChangeData((event) => changes.push(event));

        await session.execute('mata: printf("meta")', false, null, { internal: true });
        await session.execute('capture program list __saio_data_bridge', false, null, { internal: true });
        await session.execute('plugin call __saio_data_bridge _all, 0x1', false, null, { internal: true });

        assert.deepEqual(changes, [], 'a read transaction must not invalidate its own cache');

        await session.runUserCode('use auto, clear');
        assert.equal(changes.length, 1, 'user code must invalidate the cache');
        subscription.dispose();
    } finally {
        delete require.cache[sessionPath];
    }
});

test('data-change listeners survive a throwing listener', async () => {
    const engine = createEngine();
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');

        const seen = [];
        const bad = sessionManager.onDidChangeData(() => {
            throw new Error('listener exploded');
        });
        const good = sessionManager.onDidChangeData(() => seen.push('ok'));

        await session.runUserCode('describe');
        assert.equal(seen.length, 1);
        bad.dispose();
        good.dispose();
    } finally {
        delete require.cache[sessionPath];
    }
});
