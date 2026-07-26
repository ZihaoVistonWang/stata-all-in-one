const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const FORCE_STOP_GRACE_MS = 750;

let worker = null;
let initialized = false;
let currentLibraryPath = null;
let requestSequence = 0;
let forceStopTimer = null;
let manualStopInProgress = false;
const pendingRequests = new Map();
const activeExecutionIds = new Set();

function nativeBinaryPath() {
    const binDir = path.join(__dirname, '..', '..', '..', '..', '..', 'bin');
    const platformPath = path.join(binDir, `stata_bridge-${process.platform}.node`);
    const fallbackPath = path.join(binDir, 'stata_bridge.node');
    return fs.existsSync(platformPath) ? platformPath : fallbackPath;
}

function clearForceStopTimer() {
    if (forceStopTimer) {
        clearTimeout(forceStopTimer);
        forceStopTimer = null;
    }
}

function resetWorkerState() {
    clearForceStopTimer();
    worker = null;
    initialized = false;
    currentLibraryPath = null;
    activeExecutionIds.clear();
}

function settlePendingAfterExit(reason) {
    for (const [id, pending] of pendingRequests) {
        pendingRequests.delete(id);
        if (pending.action === 'execute' && manualStopInProgress) {
            pending.resolve({
                success: false,
                returnCode: 1,
                output: '',
                error: 'Execution interrupted by user.',
                interrupted: true,
                forced: true
            });
        } else {
            pending.reject(new Error(reason));
        }
    }
    manualStopInProgress = false;
}

function handleWorkerExit(code, signal) {
    const reason = `Stata worker exited (code=${code}, signal=${signal || 'none'}).`;
    settlePendingAfterExit(reason);
    resetWorkerState();
}

function ensureWorker() {
    if (worker && worker.connected) {
        return worker;
    }

    const workerPath = path.join(__dirname, 'stata_process_worker.js');
    worker = childProcess.fork(workerPath, [], {
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1'
        },
        execArgv: [],
        serialization: 'advanced',
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    worker.stdout.on('data', data => process.stdout.write(data));
    worker.stderr.on('data', data => process.stderr.write(data));
    worker.on('message', handleWorkerMessage);
    worker.once('exit', handleWorkerExit);
    worker.once('error', error => {
        settlePendingAfterExit(error.message);
        resetWorkerState();
    });
    return worker;
}

function handleWorkerMessage(message) {
    if (!message || typeof message !== 'object') {
        return;
    }
    const pending = pendingRequests.get(message.id);
    if (!pending) {
        return;
    }
    if (message.kind === 'output') {
        if (typeof pending.onOutput === 'function') {
            pending.onOutput(message.data || '');
        }
        return;
    }
    if (message.kind !== 'response') {
        return;
    }

    pendingRequests.delete(message.id);
    if (pending.action === 'execute') {
        activeExecutionIds.delete(message.id);
        if (activeExecutionIds.size === 0) {
            clearForceStopTimer();
            manualStopInProgress = false;
        }
    }
    if (message.ok) {
        pending.resolve(message.result);
    } else {
        pending.reject(new Error(message.error || `Stata worker action failed: ${pending.action}`));
    }
}

function request(action, args = [], onOutput = null) {
    const child = ensureWorker();
    const id = ++requestSequence;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { action, resolve, reject, onOutput });
        if (action === 'execute') {
            activeExecutionIds.add(id);
        }
        child.send({ kind: 'request', id, action, args }, error => {
            if (!error) {
                return;
            }
            pendingRequests.delete(id);
            activeExecutionIds.delete(id);
            reject(error);
        });
    });
}

function sendSignal(action) {
    if (!worker || !worker.connected) {
        return false;
    }
    worker.send({ kind: 'signal', action });
    return true;
}

function forceTerminateWorker() {
    if (!worker) {
        return;
    }
    manualStopInProgress = true;
    const child = worker;
    clearForceStopTimer();
    try {
        child.kill('SIGKILL');
    } catch (error) {
        console.error('Stata All in One: Failed to terminate Stata worker:', error.message);
    }
}

async function initSession(libraryPath, splash = false, execPath = '', stHome = '') {
    const result = await request('initSession', [libraryPath, splash, execPath, stHome]);
    initialized = Boolean(result);
    currentLibraryPath = initialized ? libraryPath : null;
    return initialized;
}

async function execute(code, echo = false, onOutput = null) {
    return request('execute', [code, echo], onOutput);
}

function setBreak() {
    if (!initialized || activeExecutionIds.size === 0) {
        return false;
    }
    manualStopInProgress = true;
    const sent = sendSignal('break');
    if (!sent) {
        return false;
    }

    if (forceStopTimer) {
        forceTerminateWorker();
        return true;
    }
    forceStopTimer = setTimeout(() => {
        if (activeExecutionIds.size > 0) {
            forceTerminateWorker();
        }
    }, FORCE_STOP_GRACE_MS);
    return true;
}

function shutdown() {
    if (!worker) {
        resetWorkerState();
        return true;
    }
    manualStopInProgress = false;
    const child = worker;
    resetWorkerState();
    for (const [id, pending] of pendingRequests) {
        pendingRequests.delete(id);
        pending.reject(new Error('Stata session shut down.'));
    }
    try {
        child.kill('SIGKILL');
        return true;
    } catch (error) {
        console.error('Stata All in One: Failed to shut down Stata worker:', error.message);
        return false;
    }
}

function clearOutput() {
    sendSignal('clearOutput');
}

function cancelDatasetCapture() {
    sendSignal('cancelDatasetCapture');
}

module.exports = {
    initSession,
    execute,
    clearOutput,
    setBreak,
    shutdown,
    getOutput: () => '',
    getDatasetInfo: () => request('getDatasetInfo'),
    beginDatasetCapture: () => request('beginDatasetCapture'),
    finishDatasetCapture: () => request('finishDatasetCapture'),
    cancelDatasetCapture,
    getVarMetadata: () => request('getVarMetadata'),
    getDataRows: (varList, start, end) => request('getDataRows', [varList, start, end]),
    getSummary: () => request('getSummary'),
    isInitialized: () => initialized,
    getDylibPath: () => currentLibraryPath,
    isLoaded: () => fs.existsSync(nativeBinaryPath())
};
