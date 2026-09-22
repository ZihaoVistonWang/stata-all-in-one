const test = require('node:test');
const assert = require('node:assert/strict');

const nativePath = require.resolve('../modules/runCode/embeddedConsole/native/stata_process');
const sessionPath = require.resolve('../modules/runCode/embeddedConsole/session');

function createContext() {
    const values = new Map();
    return {
        globalState: {
            get(key) { return values.get(key); },
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

function createEngine() {
    const state = { initialized: true, lostReason: null, executeResult: null };
    return {
        state,
        isLoaded: () => true,
        isInitialized: () => state.initialized,
        getDylibPath: () => '/tmp/libstata-mp.dylib',
        getLostSessionReason: () => state.lostReason,
        async initSession() {
            state.initialized = true;
            state.lostReason = null;
            return true;
        },
        async execute() {
            if (!state.initialized) {
                return {
                    success: false,
                    returnCode: 1,
                    output: '',
                    error: 'Stata session is not initialized.',
                    sessionLost: true,
                    lostReason: state.lostReason
                };
            }
            return state.executeResult || { success: true, returnCode: 0, output: '' };
        },
        shutdown() { state.initialized = false; },
        clearOutput() {},
        setBreak() { return true; }
    };
}

test('a lost session is announced once and never looks like a fresh session', async () => {
    const engine = createEngine();
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');
        assert.equal(session.isInitialized(), true);
        // Joining a live native session is treated as already bootstrapped, so a
        // reconnect can never re-run the `clear all` bootstrap.
        assert.equal(session.isBootstrapped(), true);

        const losses = [];
        const subscription = sessionManager.onDidLoseSession((event) => losses.push(event));

        // The Stata worker dies behind our back.
        engine.state.initialized = false;
        engine.state.lostReason = 'worker-exited';

        assert.equal(session.isInitialized(), false);
        assert.equal(losses.length, 1, 'the loss must be reported');
        assert.equal(session.getLostSessionReason(), 'worker-exited');

        // Repeated checks must not spam the notification.
        assert.equal(session.isInitialized(), false);
        assert.equal(losses.length, 1);

        // Reconnecting to a genuinely new native session clears the loss state.
        await session.init('/tmp/libstata-mp.dylib');
        assert.equal(session.isInitialized(), true);
        assert.equal(session.getLostSessionReason(), null);
        subscription.dispose();
    } finally {
        delete require.cache[sessionPath];
    }
});

test('an execute that reports a lost session notifies listeners', async () => {
    const engine = createEngine();
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');

        const losses = [];
        const subscription = sessionManager.onDidLoseSession(() => losses.push('lost'));

        engine.state.initialized = false;
        engine.state.lostReason = 'worker-exited';
        const result = await session.execute('describe');
        assert.equal(result.success, false);
        assert.equal(result.sessionLost, true);
        assert.equal(losses.length, 1, 'the failure must be reported as a lost session');
        subscription.dispose();
    } finally {
        delete require.cache[sessionPath];
    }
});
