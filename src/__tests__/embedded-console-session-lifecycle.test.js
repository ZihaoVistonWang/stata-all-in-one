const test = require('node:test');
const assert = require('node:assert/strict');

const nativePath = require.resolve('../modules/runCode/embeddedConsole/native/stata_process');
const sessionPath = require.resolve('../modules/runCode/embeddedConsole/session');

// Simulated native Stata session: it survives JS wrapper replacement because
// the real dlclose/FreeLibrary path is deliberately avoided on panel close.
function createNativeSimulator() {
    const executions = [];
    const state = {
        initialized: false,
        libraryPath: null,
        // Everything Stata would keep in memory between commands.
        memory: { dataset: null, macros: {}, programs: new Set() }
    };

    return {
        state,
        executions,
        exports: {
            isLoaded: () => true,
            isInitialized: () => state.initialized,
            getDylibPath: () => state.libraryPath,
            async initSession(libraryPath) {
                if (state.initialized) {
                    return true;
                }
                state.initialized = true;
                state.libraryPath = libraryPath;
                return true;
            },
            async execute(code) {
                executions.push(code);
                if (/^\s*(quietly\s+)?clear\s+all\b/i.test(code)) {
                    state.memory.dataset = null;
                    state.memory.macros = {};
                    state.memory.programs.clear();
                }
                if (/use\s+/i.test(code)) {
                    state.memory.dataset = code.trim();
                }
                const programMatch = code.match(/program\s+(\w+)\s*,/);
                if (programMatch) {
                    state.memory.programs.add(programMatch[1]);
                }
                return { success: true, returnCode: 0, output: '' };
            },
            shutdown() {
                state.initialized = false;
                state.libraryPath = null;
                state.memory = { dataset: null, macros: {}, programs: new Set() };
            },
            clearOutput() {},
            setBreak() {
                return true;
            }
        }
    };
}

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

function loadSessionWith(nativeSimulator) {
    require.cache[nativePath] = {
        id: nativePath,
        filename: nativePath,
        loaded: true,
        exports: nativeSimulator.exports
    };
    delete require.cache[sessionPath];
    return require(sessionPath);
}

const DYLIB = '/Applications/StataNow/StataMP.app/Contents/MacOS/libstata-mp.dylib';

test('closing and reopening the Console keeps the live Stata data', async () => {
    const nativeSimulator = createNativeSimulator();
    const sessionManager = loadSessionWith(nativeSimulator);
    const context = createContext();

    try {
        const first = sessionManager.getConsoleSession(context);
        assert.equal((await first.init(DYLIB)).success, true);
        first.setBootstrapped(true);
        await first.execute('use "/tmp/auto.dta", clear');
        assert.match(nativeSimulator.state.memory.dataset, /auto\.dta/);

        // Console panel closed.
        sessionManager.markSessionStale();
        assert.equal(sessionManager.isSessionStale(), true);

        // Console panel reopened → the wrapper is dropped but native data lives on.
        sessionManager.clearStaleSession();
        const reopened = sessionManager.getConsoleSession(context);
        assert.notEqual(reopened, first);
        const initResult = await reopened.init(DYLIB);
        assert.equal(initResult.success, true);

        // The reopened session must still see the data the user loaded, and must
        // report itself as bootstrapped so the next run does not `clear all`.
        assert.equal(reopened.isBootstrapped(), true);
        assert.match(nativeSimulator.state.memory.dataset, /auto\.dta/);
        assert.equal(
            nativeSimulator.executions.some((code) => /clear\s+all/i.test(code)),
            false,
            'reopening the Console must not run clear all'
        );

        // A subsequent run must not clear the data either.
        await reopened.execute('summarize price');
        assert.match(nativeSimulator.state.memory.dataset, /auto\.dta/);
    } finally {
        sessionManager.forceShutdownConsoleSession();
        delete require.cache[sessionPath];
    }
});

test('a genuinely new native session still needs the one-time bootstrap', async () => {
    const nativeSimulator = createNativeSimulator();
    const sessionManager = loadSessionWith(nativeSimulator);
    const context = createContext();

    try {
        const session = sessionManager.getConsoleSession(context);
        assert.equal((await session.init(DYLIB)).success, true);
        assert.equal(session.isBootstrapped(), false);
        session.setBootstrapped(true);
        assert.equal(session.isBootstrapped(), true);
    } finally {
        sessionManager.forceShutdownConsoleSession();
        delete require.cache[sessionPath];
    }
});

test('an explicit restart resets Stata state and requires bootstrap again', async () => {
    const nativeSimulator = createNativeSimulator();
    const sessionManager = loadSessionWith(nativeSimulator);
    const context = createContext();

    try {
        const session = sessionManager.getConsoleSession(context);
        await session.init(DYLIB);
        session.setBootstrapped(true);
        await session.execute('use "/tmp/auto.dta", clear');
        assert.match(nativeSimulator.state.memory.dataset, /auto\.dta/);

        const restart = await sessionManager.restartConsoleSession(context);
        assert.equal(restart.success, true);

        const restarted = sessionManager.getConsoleSession(context);
        assert.notEqual(restarted, session);
        assert.equal(restarted.isBootstrapped(), false, 'an explicit restart must bootstrap again');
        assert.equal(nativeSimulator.state.memory.dataset, null, 'clear all must still reset the data');
    } finally {
        sessionManager.forceShutdownConsoleSession();
        delete require.cache[sessionPath];
    }
});

test('viewer-style reads never clear or replace the dataset', async () => {
    const nativeSimulator = createNativeSimulator();
    const sessionManager = loadSessionWith(nativeSimulator);
    const context = createContext();

    try {
        const session = sessionManager.getConsoleSession(context);
        await session.init(DYLIB);
        session.setBootstrapped(true);
        await session.execute('use "/tmp/auto.dta", clear');
        const generationBefore = session.getGeneration();

        await session.execute('mata: printf("__SAIO_NOBS__%f\\n", st_nobs())', false);
        await session.execute('capture program drop __saio_data_bridge', false);
        await session.execute('program __saio_data_bridge, plugin using("/tmp/x.plugin")', false);
        await session.execute('plugin call __saio_data_bridge _all, 0x0', false);

        assert.match(nativeSimulator.state.memory.dataset, /auto\.dta/);
        assert.equal(session.getGeneration(), generationBefore);
        assert.equal(session.isInitialized(), true);
    } finally {
        sessionManager.forceShutdownConsoleSession();
        delete require.cache[sessionPath];
    }
});

test('reconnecting re-applies the idempotent settings but never clears data', async () => {
    const nativeSimulator = createNativeSimulator();
    const sessionManager = loadSessionWith(nativeSimulator);
    const context = createContext();

    try {
        const first = sessionManager.getConsoleSession(context);
        await first.init(DYLIB);
        first.setBootstrapped(true);
        first.setResetPerformed(true);
        await first.execute('use "/tmp/auto.dta", clear');

        // Console closed and reopened: the wrapper is replaced but the native
        // session (and the loaded data) lives on.
        sessionManager.markSessionStale();
        sessionManager.clearStaleSession();
        const reopened = sessionManager.getConsoleSession(context);
        await reopened.init(DYLIB);

        // The destructive reset is considered done, so it is never repeated...
        assert.equal(reopened.isResetPerformed(), true);
        // ...while the idempotent settings are re-applied by the platform layer.
        assert.equal(reopened.needsBootstrapSettings(), false);

        const { applyWebviewBootstrap } = require('../modules/runCode/embeddedConsole/bootstrap');
        const before = nativeSimulator.executions.length;
        await applyWebviewBootstrap(reopened);
        const applied = nativeSimulator.executions.slice(before);

        assert.equal(
            applied.some((code) => /clear\s+all/i.test(code)),
            false,
            'a reconnect must never run clear all'
        );
        assert.equal(
            applied.some((code) => /set\s+linesize/i.test(code)),
            false,
            'settings already applied are not repeated on every run'
        );
        assert.match(nativeSimulator.state.memory.dataset, /auto\.dta/);
    } finally {
        sessionManager.forceShutdownConsoleSession();
        delete require.cache[sessionPath];
    }
});

test('a fresh session runs the full bootstrap exactly once', async () => {
    const nativeSimulator = createNativeSimulator();
    const sessionManager = loadSessionWith(nativeSimulator);
    const context = createContext();
    const { applyWebviewBootstrap } = require('../modules/runCode/embeddedConsole/bootstrap');

    try {
        const session = sessionManager.getConsoleSession(context);
        await session.init(DYLIB);
        assert.equal(session.isResetPerformed(), false);

        await applyWebviewBootstrap(session);
        const first = nativeSimulator.executions.slice();
        assert.equal(first[0], 'quietly clear all', 'a new session starts with the reset');
        assert.deepEqual(first.slice(1), ['quietly set more off', 'quietly set linesize 255']);
        assert.equal(session.isResetPerformed(), true);

        await applyWebviewBootstrap(session);
        assert.equal(
            nativeSimulator.executions.length,
            first.length,
            'a second run issues no bootstrap commands at all'
        );
    } finally {
        sessionManager.forceShutdownConsoleSession();
        delete require.cache[sessionPath];
    }
});

test('an unexpected session loss is never reported as a user interrupt', async () => {
    const nativeSimulator = createNativeSimulator();
    const sessionManager = loadSessionWith(nativeSimulator);
    const context = createContext();

    try {
        const session = sessionManager.getConsoleSession(context);
        await session.init(DYLIB);
        session.setBootstrapped(true);
        session.beginManualStopScope();
        // A stop lands right as the command finishes.
        assert.equal(session.stop(), true);

        // The next command completes normally: the stop scope must end with it...
        const result = await session.execute('summarize price');
        assert.equal(result.success, true);
        assert.equal(Boolean(result.interrupted), false);
        // ...so it is not reported as an interrupt of an unrelated later failure.
        assert.equal(session.isStopRequested(), true, 'the flag stays until the scope is cleared');
        session.clearManualStopScope();
        assert.equal(session.isStopRequested(), false);
    } finally {
        sessionManager.forceShutdownConsoleSession();
        delete require.cache[sessionPath];
    }
});
