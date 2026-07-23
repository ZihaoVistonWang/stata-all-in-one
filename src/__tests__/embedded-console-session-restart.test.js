const test = require('node:test');
const assert = require('node:assert/strict');

const nativePath = require.resolve('../modules/runCode/embeddedConsole/native/stata_session');
let resolveExecution;
let initialized = false;
let shutdownCalls = 0;
let executeImpl = () => new Promise((resolve) => {
    resolveExecution = resolve;
});

require.cache[nativePath] = {
    id: nativePath,
    filename: nativePath,
    loaded: true,
    exports: {
        isLoaded: () => true,
        isInitialized: () => initialized,
        async initSession() {
            initialized = true;
            return true;
        },
        execute() {
            return executeImpl(...arguments);
        },
        shutdown() {
            shutdownCalls += 1;
            initialized = false;
        },
        clearOutput() {},
        setBreak() {}
    }
};

const sessionManager = require('../modules/runCode/embeddedConsole/session');

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

test('waits for active execution before allowing a Console session shutdown', async () => {
    const session = sessionManager.getConsoleSession(createContext());
    const initResult = await session.init('/Applications/StataNow/libstata-mp.dylib');
    assert.equal(initResult.success, true);

    const execution = session.execute('sleep 1000');
    assert.equal(session.isBusy(), true);
    assert.equal(sessionManager.forceShutdownConsoleSession(), false);

    let idleResolved = false;
    const idle = session.waitUntilIdle().then(() => {
        idleResolved = true;
    });
    await Promise.resolve();
    assert.equal(idleResolved, false);

    resolveExecution({ success: true, returnCode: 0, output: '' });
    await execution;
    await idle;

    assert.equal(session.isBusy(), false);
    assert.equal(sessionManager.forceShutdownConsoleSession(), true);
    assert.equal(shutdownCalls, 1);
});

test('restarts by clearing Stata state and replacing the JS session wrapper', async () => {
    const commands = [];
    executeImpl = async (command) => {
        commands.push(command);
        return { success: true, returnCode: 0, output: '' };
    };

    const context = createContext();
    const oldSession = sessionManager.getConsoleSession(context);
    const initResult = await oldSession.init('/Applications/StataNow/libstata-mp.dylib');
    assert.equal(initResult.success, true);
    oldSession.setWorkingDirectory('/tmp/project');
    oldSession.setBootstrapped(true);

    const restartResult = await sessionManager.restartConsoleSession(context);
    const newSession = sessionManager.getConsoleSession(context);

    assert.equal(restartResult.success, true);
    assert.notEqual(newSession, oldSession);
    assert.equal(newSession.isInitialized(), true);
    assert.equal(newSession.getWorkingDirectory(), null);
    assert.equal(newSession.isBootstrapped(), false);
    assert.equal(shutdownCalls, 1);
    assert.deepEqual(commands.slice(0, 4), [
        'clear all',
        'capture macro drop _all',
        'capture scalar drop _all',
        'capture matrix drop _all'
    ]);
    assert.match(commands.at(-1), /^cd "/);

    sessionManager.forceShutdownConsoleSession();
});
