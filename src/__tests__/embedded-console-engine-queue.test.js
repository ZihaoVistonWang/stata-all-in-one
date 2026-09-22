const test = require('node:test');
const assert = require('node:assert/strict');

const nativePath = require.resolve('../modules/runCode/embeddedConsole/native/stata_process');
const sessionPath = require.resolve('../modules/runCode/embeddedConsole/session');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

// A native engine that records overlap: entering a command while another one is
// still running is exactly the corruption the queue must prevent. Each command
// blocks until the test releases it, so scheduling is fully deterministic.
function createEngineSimulator() {
    const state = {
        concurrentPeak: 0,
        running: 0,
        commands: [],
        breakCalls: 0,
        initialized: true,
        failNext: false
    };
    const waiting = [];

    function enter(code) {
        state.commands.push(code);
        state.running += 1;
        state.concurrentPeak = Math.max(state.concurrentPeak, state.running);
        const gate = deferred();
        waiting.push({ code, gate });
        return gate.promise.then(() => {
            state.running -= 1;
            if (state.failNext) {
                state.failNext = false;
                return { success: false, returnCode: 111, output: '', error: 'r(111)' };
            }
            return { success: true, returnCode: 0, output: '' };
        });
    }

    return {
        state,
        waiting,
        async waitForCommand(index) {
            for (let attempt = 0; attempt < 500 && state.commands.length <= index; attempt += 1) {
                await new Promise((resolve) => setImmediate(resolve));
            }
            assert.ok(
                state.commands.length > index,
                `engine never received command #${index} (received: ${JSON.stringify(state.commands)})`
            );
            return state.commands[index];
        },
        release(index = 0) {
            const entry = waiting[index];
            assert.ok(entry, `no command waiting at index ${index}`);
            entry.gate.resolve();
        },
        releaseByCode(code) {
            const index = waiting.findIndex((entry) => entry.code === code);
            assert.ok(
                index >= 0,
                `command "${code}" is not waiting (waiting: ${waiting.map((entry) => entry.code).join(', ')})`
            );
            const [entry] = waiting.splice(index, 1);
            entry.gate.resolve();
        },
        exports: {
            isLoaded: () => true,
            isInitialized: () => state.initialized,
            getDylibPath: () => '/tmp/libstata-mp.dylib',
            async initSession() {
                state.initialized = true;
                return true;
            },
            execute: (code) => enter(code),
            shutdown() {
                state.initialized = false;
            },
            clearOutput() {},
            setBreak() {
                state.breakCalls += 1;
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

function loadSessionWith(engine) {
    require.cache[nativePath] = {
        id: nativePath,
        filename: nativePath,
        loaded: true,
        exports: engine.exports
    };
    delete require.cache[sessionPath];
    return require(sessionPath);
}

async function startSession(engine) {
    const sessionManager = loadSessionWith(engine);
    const session = sessionManager.getConsoleSession(createContext());
    await session.init('/tmp/libstata-mp.dylib');
    return { sessionManager, session };
}

test('two concurrent Console executions never enter the engine at once', async () => {
    const engine = createEngineSimulator();
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');

        const first = session.execute('use auto');
        const second = session.execute('describe');

        await engine.waitForCommand(0);
        assert.deepEqual(engine.state.commands, ['use auto'], 'second command must wait for the first');
        engine.releaseByCode('use auto');
        await first;

        await engine.waitForCommand(1);
        assert.deepEqual(engine.state.commands, ['use auto', 'describe']);
        engine.releaseByCode('describe');
        await second;

        assert.equal(engine.state.concurrentPeak, 1);
    } finally {
        delete require.cache[sessionPath];
    }
});

test('engine operations are dispatched in submission order', async () => {
    const engine = createEngineSimulator();
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');

        const order = [];
        const tasks = ['a', 'b', 'c'].map((label) => session.execute(label).then(() => order.push(label)));
        for (let index = 0; index < 3; index += 1) {
            await engine.waitForCommand(index);
            engine.release(index);
        }
        await Promise.all(tasks);
        assert.deepEqual(order, ['a', 'b', 'c']);
        assert.deepEqual(engine.state.commands, ['a', 'b', 'c']);
        assert.equal(engine.state.concurrentPeak, 1);
    } finally {
        delete require.cache[sessionPath];
    }
});

test('a read transaction holds the engine against interleaved user commands', async () => {
    const engine = createEngineSimulator();
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');

        const transaction = session.withTransaction(async (tx) => {
            await tx.execute('meta-command');
            await tx.execute('capture-command');
            return 'done';
        });
        // A user command submitted while the transaction is in flight.
        const userCommand = session.execute('user-command');

        await engine.waitForCommand(0);
        assert.equal(engine.state.commands[0], 'meta-command');
        engine.releaseByCode('meta-command');

        await engine.waitForCommand(1);
        assert.deepEqual(
            engine.state.commands,
            ['meta-command', 'capture-command'],
            'the user command must not slip between the metadata read and the capture'
        );
        engine.releaseByCode('capture-command');
        assert.equal(await transaction, 'done');

        await engine.waitForCommand(2);
        assert.equal(engine.state.commands[2], 'user-command');
        engine.releaseByCode('user-command');
        await userCommand;

        assert.equal(engine.state.concurrentPeak, 1);
    } finally {
        delete require.cache[sessionPath];
    }
});

test('a failing command does not stall the queue', async () => {
    const engine = createEngineSimulator();
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');

        engine.state.failNext = true;
        const failing = session.execute('broken');
        await engine.waitForCommand(0);
        engine.releaseByCode('broken');
        assert.equal((await failing).success, false);

        const following = session.execute('after');
        await engine.waitForCommand(1);
        assert.equal(engine.state.commands[1], 'after', 'the queue must keep draining after a failure');
        engine.releaseByCode('after');
        assert.equal((await following).success, true);
    } finally {
        delete require.cache[sessionPath];
    }
});

test('Break reaches the engine while a long command is queued behind it', async () => {
    const engine = createEngineSimulator();
    const sessionManager = loadSessionWith(engine);

    try {
        const session = sessionManager.getConsoleSession(createContext());
        await session.init('/tmp/libstata-mp.dylib');

        const running = session.execute('sleep 1000');
        await engine.waitForCommand(0);

        assert.equal(session.isBusy(), true);
        assert.equal(session.stop(), true);
        assert.equal(engine.state.breakCalls, 1, 'stop must not wait for the queue to drain');

        engine.releaseByCode('sleep 1000');
        await running;
        assert.equal(session.isStopRequested(), true);
    } finally {
        delete require.cache[sessionPath];
    }
});

test('waitUntilIdle waits for the whole queue, not just the running command', async () => {
    const engine = createEngineSimulator();

    try {
        const { session } = await startSession(engine);

        const first = session.execute('one');
        const second = session.execute('two');
        await engine.waitForCommand(0);

        let idle = false;
        const idlePromise = session.waitUntilIdle().then(() => {
            idle = true;
        });

        engine.releaseByCode('one');
        await first;
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(idle, false, 'a queued command still counts as busy');

        await engine.waitForCommand(1);
        engine.releaseByCode('two');
        await second;
        await idlePromise;
        assert.equal(idle, true);
    } finally {
        delete require.cache[sessionPath];
    }
});

test('a transaction started from another session joins instead of deadlocking', async () => {
    const engine = createEngineSimulator();
    const sessionManager = loadSessionWith(engine);

    try {
        const { session } = await startSession(engine);
        // A second session object over the same (singleton) engine.
        const otherSession = sessionManager.getConsoleSession(createContext());

        const transaction = session.withTransaction(async (tx) => {
            await tx.execute('outer');
            // A nested transaction created through a different session instance
            // must join the enclosing one: queueing would deadlock because the
            // engine queue is already held by this transaction.
            const inner = otherSession.withTransaction(async (innerTx) => {
                await innerTx.execute('inner');
                return 'inner-done';
            });
            return inner;
        });

        assert.equal(await engine.waitForCommand(0), 'outer');
        engine.releaseByCode('outer');
        assert.equal(await engine.waitForCommand(1), 'inner');
        engine.releaseByCode('inner');

        assert.equal(await transaction, 'inner-done');
        assert.equal(engine.state.concurrentPeak, 1);
    } finally {
        delete require.cache[sessionPath];
    }
});

test('waitUntilIdle resolves even when the queue drains before the last command', async () => {
    const engine = createEngineSimulator();

    try {
        const { session } = await startSession(engine);
        const running = session.execute('one');
        await engine.waitForCommand(0);
        engine.releaseByCode('one');
        await running;

        let idle = false;
        await session.waitUntilIdle().then(() => {
            idle = true;
        });
        assert.equal(idle, true);
    } finally {
        delete require.cache[sessionPath];
    }
});
