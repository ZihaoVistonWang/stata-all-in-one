/**
 * Stata worker supervisor (main-process side)
 *
 * The Stata engine runs in a forked child process so that a hard crash or a
 * forced stop cannot take down the Extension Host. Every worker is identified
 * by a monotonically increasing generation, and all exit/error handling,
 * initialization results and pending requests are bound to the generation that
 * created them: an event arriving from a worker that has already been replaced
 * must never touch the state of the worker that replaced it.
 */

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const FORCE_STOP_GRACE_MS = 750;
const EXIT_REASONS = {
    WORKER_EXITED: 'worker-exited',
    WORKER_ERROR: 'worker-error',
    INIT_FAILED: 'init-failed',
    SHUTDOWN: 'shutdown'
};

/** @type {import('child_process').ChildProcess|null} */
let worker = null;
let workerGeneration = 0;
let initialized = false;
let initializedGeneration = 0;
let currentLibraryPath = null;
let requestSequence = 0;
let forceStopTimer = null;
let manualStopInProgress = false;
let lostSessionReason = null;
let shuttingDown = false;

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

/**
 * Drop every request that belongs to `generation` and reject them with reason.
 * Requests issued against a newer worker are left untouched.
 */
function settlePendingForGeneration(generation, reason) {
    let settledExecution = false;
    for (const [id, pending] of Array.from(pendingRequests)) {
        if (pending.generation !== generation) {
            continue;
        }
        pendingRequests.delete(id);
        if (pending.action === 'execute') {
            activeExecutionIds.delete(id);
            settledExecution = true;
            if (manualStopInProgress) {
                pending.resolve({
                    success: false,
                    returnCode: 1,
                    output: '',
                    error: 'Execution interrupted by user.',
                    interrupted: true,
                    forced: true
                });
                continue;
            }
        }
        pending.reject(new Error(reason));
    }
    if (settledExecution && activeExecutionIds.size === 0) {
        clearForceStopTimer();
        manualStopInProgress = false;
    }
    return settledExecution;
}

/**
 * Handle the death of worker `generation`.
 * Only the state that still belongs to that generation is affected.
 */
function handleWorkerGone(generation, reason, lostReason) {
    const isCurrent = worker !== null && generation === workerGeneration;
    settlePendingForGeneration(generation, reason);

    if (!isCurrent) {
        // A worker we already replaced. Its exit must not touch the live session.
        return;
    }

    worker = null;
    clearForceStopTimer();
    manualStopInProgress = false;
    activeExecutionIds.clear();
    if (initialized && initializedGeneration === generation) {
        initialized = false;
        currentLibraryPath = null;
        initializedGeneration = 0;
        if (!shuttingDown) {
            // Uncommanded loss: the caller must be able to distinguish this
            // from "a brand-new empty session".
            lostSessionReason = lostReason || EXIT_REASONS.WORKER_EXITED;
        }
    }
}

function attachWorkerListeners(child, generation) {
    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('message', message => handleWorkerMessage(generation, message));
    child.once('exit', (code, signal) => {
        handleWorkerGone(
            generation,
            `Stata worker exited (code=${code}, signal=${signal || 'none'}).`,
            EXIT_REASONS.WORKER_EXITED
        );
    });
    child.once('error', (error) => {
        handleWorkerGone(generation, error.message, EXIT_REASONS.WORKER_ERROR);
    });
}

function ensureWorker() {
    if (worker && worker.connected) {
        return worker;
    }

    const workerPath = path.join(__dirname, 'stata_process_worker.js');
    const generation = workerGeneration + 1;
    const child = childProcess.fork(workerPath, [], {
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1'
        },
        execArgv: [],
        serialization: 'advanced',
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    workerGeneration = generation;
    worker = child;
    initialized = false;
    currentLibraryPath = null;
    attachWorkerListeners(child, generation);
    return child;
}

function handleWorkerMessage(generation, message) {
    if (!message || typeof message !== 'object') {
        return;
    }
    const pending = pendingRequests.get(message.id);
    if (!pending) {
        return;
    }
    if (pending.generation !== generation) {
        // Output for an id that now belongs to another worker generation.
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
    const generation = workerGeneration;
    const id = ++requestSequence;
    return new Promise((resolve, reject) => {
        if (!initialized && action !== 'initSession') {
            reject(new Error('Stata session is not initialized.'));
            return;
        }
        pendingRequests.set(id, { action, resolve, reject, onOutput, generation });
        if (action === 'execute') {
            activeExecutionIds.add(id);
        }
        child.send({ kind: 'request', id, action, args }, error => {
            if (!error) {
                return;
            }
            const pending = pendingRequests.get(id);
            if (!pending) {
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
    const child = worker;
    if (!child) {
        return;
    }
    manualStopInProgress = true;
    clearForceStopTimer();
    try {
        child.kill('SIGKILL');
    } catch (error) {
        console.error('Stata All in One: Failed to terminate Stata worker:', error.message);
    }
}

async function initSession(libraryPath, splash = false, execPath = '', stHome = '') {
    const child = ensureWorker();
    const generation = workerGeneration;
    let result;
    try {
        result = await request('initSession', [libraryPath, splash, execPath, stHome]);
    } catch (error) {
        if (!lostSessionReason) {
            lostSessionReason = EXIT_REASONS.INIT_FAILED;
        }
        if (worker === child && generation === workerGeneration) {
            initialized = false;
            currentLibraryPath = null;
            initializedGeneration = 0;
        }
        // A worker that died while initializing is a failed init, not an
        // exception the console layer has to translate.
        return false;
    }

    // The worker that answered may already have been replaced (or died while
    // answering). Reporting success then would leave `initialized` describing a
    // process that no longer exists.
    if (worker !== child || generation !== workerGeneration || !child.connected) {
        return false;
    }

    initialized = Boolean(result);
    initializedGeneration = initialized ? generation : 0;
    currentLibraryPath = initialized ? libraryPath : null;
    if (initialized) {
        lostSessionReason = null;
    } else {
        lostSessionReason = EXIT_REASONS.INIT_FAILED;
    }
    return initialized;
}

async function execute(code, echo = false, onOutput = null) {
    if (!initialized) {
        return {
            success: false,
            returnCode: 1,
            output: '',
            error: 'Stata session is not initialized.',
            sessionLost: true,
            lostReason: lostSessionReason || undefined
        };
    }
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
    clearForceStopTimer();
    manualStopInProgress = false;
    shuttingDown = true;
    const child = worker;
    const generation = workerGeneration;

    worker = null;
    initialized = false;
    initializedGeneration = 0;
    currentLibraryPath = null;
    activeExecutionIds.clear();
    lostSessionReason = null;

    // Reject only the requests that belonged to the worker being replaced.
    for (const [id, pending] of Array.from(pendingRequests)) {
        if (child && pending.generation !== generation) {
            continue;
        }
        pendingRequests.delete(id);
        pending.reject(new Error('Stata session shut down.'));
    }

    shuttingDown = false;

    if (!child) {
        return true;
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
    getWorkerGeneration: () => workerGeneration,
    getLostSessionReason: () => lostSessionReason,
    isLoaded: () => fs.existsSync(nativeBinaryPath())
};
