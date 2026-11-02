const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const workerThreads = require('node:worker_threads');

function loadWithWorker(Worker) {
    const filename = require.resolve('../modules/runCode/stataDiscovery');
    const isolated = new Module(filename, module);
    isolated.filename = filename;
    isolated.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalRequire = isolated.require.bind(isolated);
    isolated.require = name => name === 'worker_threads' ? { ...workerThreads, Worker } : originalRequire(name);
    isolated._compile(fs.readFileSync(filename, 'utf8'), filename);
    return isolated.exports;
}

const options = { platform: 'linux', baseDirs: ['/blocked-stata-root'], allowUnsupportedPlatform: true };

test('a blocked Linux filesystem scan times out without blocking the host and its worker exits', { timeout: 5000 }, async t => {
    const started = new Int32Array(new SharedArrayBuffer(4));
    let worker, exited;
    class BlockedScanWorker extends workerThreads.Worker {
        constructor(filename, workerOptions) {
            super(`
                const fs = require('node:fs');
                const { workerData } = require('node:worker_threads');
                fs.readdirSync = () => {
                    const flag = new Int32Array(workerData.started);
                    Atomics.store(flag, 0, 1);
                    Atomics.wait(flag, 0, 1);
                    throw new Error('scan must be terminated');
                };
                require(${JSON.stringify(filename)});
            `, { eval: true, workerData: { ...workerOptions.workerData, started: started.buffer } });
            worker = this;
            exited = new Promise(resolve => this.once('exit', resolve));
        }
    }
    const discovery = loadWithWorker(BlockedScanWorker);
    let heartbeats = 0;
    const interval = setInterval(() => { heartbeats += 1; }, 10);
    t.after(() => { clearInterval(interval); if (worker) worker.terminate(); });
    const begin = Date.now();
    const result = await discovery.discoverStataInstallations({ ...options, timeoutMs: 500 });
    assert.equal(result.timedOut, true);
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.errors, []);
    assert.equal(Atomics.load(started, 0), 1, 'the worker must have entered the blocking filesystem operation');
    assert.ok(heartbeats > 0, 'the Extension Host event loop must remain responsive');
    assert.ok(Date.now() - begin < 3000, 'discovery must return without waiting for the blocked filesystem');
    assert.equal(await exited, 1, 'the timed-out worker must be terminated');
});

test('a Linux discovery worker failure produces an error report rather than a timeout', async () => {
    class FailedScanWorker extends workerThreads.Worker {
        constructor() {
            super("throw new Error('filesystem scan failed')", { eval: true });
        }
    }
    const result = await loadWithWorker(FailedScanWorker).discoverStataInstallations({ ...options, timeoutMs: 3000 });
    assert.equal(result.timedOut, false);
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.errors, ['filesystem scan failed']);
});

test('a Linux discovery worker exiting without a result is reported instead of hanging', async () => {
    class EmptyScanWorker extends workerThreads.Worker {
        constructor() { super('', { eval: true }); }
    }
    const result = await loadWithWorker(EmptyScanWorker).discoverStataInstallations({ ...options, timeoutMs: 3000 });
    assert.equal(result.timedOut, false);
    assert.match(result.errors[0], /exited without a result/);
});

test('a Linux worker startup failure releases its deadline and returns a structured error', async () => {
    class UnavailableWorker {
        constructor() { throw new Error('worker unavailable'); }
    }
    const result = await loadWithWorker(UnavailableWorker).discoverStataInstallations({ ...options, timeoutMs: 3000 });
    assert.equal(result.timedOut, false);
    assert.deepEqual(result.errors, ['worker unavailable']);
});
