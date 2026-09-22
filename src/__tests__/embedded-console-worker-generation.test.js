const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const childProcess = require('node:child_process');
const processPath = require.resolve('../modules/runCode/embeddedConsole/native/stata_process');

// A fork() stand-in: it records every spawned worker so the test can drive
// exit/error events for an already-replaced (old) worker.
function createWorkerSimulator() {
    const workers = [];

    function makeWorker() {
        const worker = new EventEmitter();
        worker.connected = true;
        worker.stdout = new EventEmitter();
        worker.stderr = new EventEmitter();
        worker.sent = [];
        worker.killedWith = null;
        worker.send = function (message, callback) {
            worker.sent.push(message);
            if (callback) callback(null);
            return true;
        };
        worker.kill = function (signal) {
            worker.killedWith = signal;
            return true;
        };
        workers.push(worker);
        return worker;
    }

    return { workers, makeWorker };
}

function loadProcess(simulator) {
    const originalFork = childProcess.fork;
    const originalExistsSync = require('node:fs').existsSync;
    childProcess.fork = () => simulator.makeWorker();
    // Pretend the native binary is present so isLoaded()/guards behave normally.
    require('node:fs').existsSync = () => true;
    delete require.cache[processPath];
    const mod = require(processPath);
    return {
        mod,
        restore() {
            childProcess.fork = originalFork;
            require('node:fs').existsSync = originalExistsSync;
            delete require.cache[processPath];
        }
    };
}

function respond(worker, id, result) {
    worker.emit('message', { kind: 'response', id, ok: true, result });
}

function requestIdOf(worker, index) {
    return worker.sent.filter((m) => m.kind === 'request')[index].id;
}

test('a late exit from a replaced worker does not invalidate the new session', async () => {
    const simulator = createWorkerSimulator();
    const { mod, restore } = loadProcess(simulator);

    try {
        const initPromise = mod.initSession('/Applications/StataMP.app/Contents/MacOS/libstata-mp.dylib');
        const oldWorker = simulator.workers[0];
        respond(oldWorker, requestIdOf(oldWorker, 0), true);
        assert.equal(await initPromise, true);
        assert.equal(mod.isInitialized(), true);

        // The console restarts the session: the old worker is killed and a new
        // one takes over.
        mod.shutdown();
        assert.equal(mod.isInitialized(), false);
        oldWorker.connected = false;

        const reinitPromise = mod.initSession('/Applications/StataMP.app/Contents/MacOS/libstata-mp.dylib');
        const newWorker = simulator.workers[1];
        respond(newWorker, requestIdOf(newWorker, 0), true);
        assert.equal(await reinitPromise, true);
        assert.equal(mod.isInitialized(), true);

        // The old worker's exit event finally arrives.
        oldWorker.emit('exit', null, 'SIGKILL');
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(mod.isInitialized(), true, 'old worker exit must not clear the new session');

        // And the new session still works without spawning a third worker.
        const executePromise = mod.execute('describe');
        assert.equal(simulator.workers.length, 2, 'no replacement worker should be spawned');
        respond(newWorker, requestIdOf(newWorker, 1), { success: true, returnCode: 0, output: 'ok' });
        assert.equal((await executePromise).output, 'ok');
    } finally {
        restore();
    }
});

test('old worker error and exit events do not reject new worker requests', async () => {
    const simulator = createWorkerSimulator();
    const { mod, restore } = loadProcess(simulator);

    try {
        const firstInit = mod.initSession('/tmp/one.dylib');
        const oldWorker = simulator.workers[0];
        respond(oldWorker, requestIdOf(oldWorker, 0), true);
        await firstInit;

        mod.shutdown();
        oldWorker.connected = false;

        const secondInit = mod.initSession('/tmp/one.dylib');
        const newWorker = simulator.workers[1];
        respond(newWorker, requestIdOf(newWorker, 0), true);
        await secondInit;

        const pending = mod.execute('summarize');
        const pendingId = requestIdOf(newWorker, 1);

        // Old worker emits both error and exit after being replaced.
        oldWorker.emit('error', new Error('old worker blew up'));
        oldWorker.emit('exit', 1, null);

        respond(newWorker, pendingId, { success: true, returnCode: 0, output: 'kept' });
        const result = await pending;
        assert.equal(result.output, 'kept');
        assert.equal(mod.isInitialized(), true);
    } finally {
        restore();
    }
});

test('a genuine worker exit reports the session as lost', async () => {
    const simulator = createWorkerSimulator();
    const { mod, restore } = loadProcess(simulator);

    try {
        const initPromise = mod.initSession('/tmp/one.dylib');
        const worker = simulator.workers[0];
        respond(worker, requestIdOf(worker, 0), true);
        await initPromise;

        const pending = mod.execute('sleep 100');
        assert.equal(mod.isInitialized(), true);

        // The current worker dies for real.
        worker.connected = false;
        worker.emit('exit', 3221225477, null);

        await assert.rejects(pending, /exited/i);
        assert.equal(mod.isInitialized(), false);
        assert.equal(mod.getLostSessionReason(), 'worker-exited');
    } finally {
        restore();
    }
});

test('initSession reflects the worker it actually talked to', async () => {
    const simulator = createWorkerSimulator();
    const { mod, restore } = loadProcess(simulator);

    try {
        const initPromise = mod.initSession('/tmp/one.dylib');
        const worker = simulator.workers[0];
        // The worker dies before answering the init request.
        worker.connected = false;
        worker.emit('exit', 1, null);

        const result = await initPromise;
        assert.equal(result, false, 'a worker that died mid-init must not report success');
        assert.equal(mod.isInitialized(), false);
        assert.equal(mod.getLostSessionReason(), 'init-failed');
    } finally {
        restore();
    }
});
