/**
 * Stata Embedded Console Native Session Wrapper
 * Loads the compiled .node native module and provides Promise-based API
 * 加载编译后的 .node 原生模块并提供 Promise 封装的 API
 */

const path = require('path');

// State tracking
let nativeModule = null;
let sessionInitialized = false;
let currentDylibPath = null;

// Windows: dedicated Worker thread for Stata execution.
// Both StataSO_Main and StataSO_Execute must run on the SAME thread
// (thread affinity required by Windows Stata DLL), but the main JS
// thread must stay responsive for UI events including the stop button.
let _stataWorker = null;
let _workerMsgId = 0;

function _getWorker() {
    if (!_stataWorker) {
        const { Worker } = require('worker_threads');
        const workerPath = path.join(__dirname, 'stata_worker.js');
        _stataWorker = new Worker(workerPath);
    }
    return _stataWorker;
}

function _workerRequest(msg) {
    return new Promise((resolve, reject) => {
        const worker = _getWorker();
        const id = ++_workerMsgId;
        const handler = (response) => {
            if (response.id === id) {
                worker.off('message', handler);
                resolve(response);
            }
        };
        worker.on('message', handler);
        worker.postMessage({ ...msg, id });
    });
}

async function _terminateWorker() {
    if (_stataWorker) {
        try { _stataWorker.postMessage({ type: 'shutdown' }); } catch (_e) {}
        try { await _stataWorker.terminate(); } catch (_e) {}
        _stataWorker = null;
    }
}

/**
 * Try to load the native .node module
 * 尝试加载原生 .node 模块
 */
function loadNativeModule() {
    if (nativeModule !== null) {
        return nativeModule;
    }

    const binDir = path.join(__dirname, '..', '..', '..', '..', '..', 'bin');
    const platformSuffix = process.platform; // 'darwin', 'win32', 'linux'

    // Platform-specific binary takes priority
    const platformPath = path.join(binDir, `stata_bridge-${platformSuffix}.node`);
    // Fallback for backwards compatibility
    const fallbackPath = path.join(binDir, 'stata_bridge.node');

    const candidates = [platformPath, fallbackPath];

    for (const modulePath of candidates) {
        try {
            nativeModule = require(modulePath);
            return nativeModule;
        } catch (error) {
            // Try next candidate
        }
    }

    console.error('Failed to load native module from:', candidates.map(p => p).join(', '));
    return null;
}

/**
 * Check if native module is loaded
 * 检查原生模块是否已加载
 */
function isNativeLoaded() {
    if (nativeModule === null) {
        nativeModule = loadNativeModule();
    }
    return nativeModule !== null;
}

/**
 * Initialize a Stata session with the given dylib path
 * 使用指定的 dylib 路径初始化 Stata 会话
 * @param {string} dylibPath - Path to the Stata dylib/shared library
 * @returns {Promise<boolean>} - True if initialization succeeded
 */
function initSession(dylibPath, splash = false, execPath = '', stHome = '') {
    // Windows: delegate to dedicated Worker thread so that both
    // StataSO_Main and StataSO_Execute run on the same thread.
    if (process.platform === 'win32') {
        return _initSessionWinWorker(dylibPath, splash, execPath, stHome);
    }

    // macOS: init synchronously on the main thread (dlopen is thread-safe)
    return new Promise((resolve, reject) => {
        if (!isNativeLoaded()) {
            reject(new Error('Native module not loaded. Please ensure stata_bridge.node is compiled and in the bin directory.'));
            return;
        }

        try {
            const result = nativeModule.initSession(dylibPath, splash, execPath, stHome);

            if (result) {
                sessionInitialized = true;
                currentDylibPath = dylibPath;
                resolve(true);
            } else {
                reject(new Error('Failed to initialize Stata session with dylib: ' + dylibPath));
            }
        } catch (error) {
            reject(new Error('Error initializing session: ' + error.message));
        }
    });
}

async function _initSessionWinWorker(dylibPath, splash, execPath, stHome) {
    // Ensure the native module is loaded on the main thread so that
    // setBreak() can access g_StataSO_SetBreak (process-wide global).
    if (!isNativeLoaded()) {
        throw new Error('Native module not available on main thread.');
    }
    const nativePath = path.join(__dirname, '..', '..', '..', '..', '..', 'bin', 'stata_bridge-win32.node');
    const response = await _workerRequest({
        type: 'init',
        nativePath,
        dllPath: dylibPath,
        splash,
        execPath,
        stHome
    });
    if (response.success) {
        sessionInitialized = true;
        currentDylibPath = dylibPath;
        return true;
    }
    throw new Error(response.error || 'Failed to initialize Stata session on Worker');
}

/**
 * Execute Stata code on Windows using ExecuteSync (main thread)
 *
 * On Windows, the Stata DLL (mp-64.dll) requires StataSO_Execute to be
 * called from the same thread that called StataSO_Main (the main JS thread).
 * Calling it from a worker thread causes g_StataSO_Execute to hang indefinitely.
 *
 * macOS does not have this restriction — dlopen'd dylibs are thread-safe.
 *
 * This function uses nativeModule.executeSync() which calls StataSO_Execute
 * synchronously from the main thread via setImmediate to give the event loop
 * a chance to process pending UI updates before blocking.
 *
 * @param {string} code - Stata code to execute
 * @param {boolean} echo - Whether Stata should echo the command
 * @param {function} onOutput - Called with full output after execution
 * @returns {Promise<{success: boolean, returnCode: number, output: string, error: string}>}
 */
async function executeSyncWin(code, echo = false, onOutput = null) {
    if (!sessionInitialized) {
        throw new Error('Session not initialized. Call initSession() first.');
    }

    const t0 = Date.now();
    const response = await _workerRequest({
        type: 'execute',
        code,
        echo: echo ? 1 : 0
    });

    const elapsed = Date.now() - t0;
    if (elapsed > 200) {
        console.log(`[stata_session] Worker execute took ${elapsed}ms for: ${code.substring(0, 80)}`);
    }

    const output = response.output || '';
    if (typeof onOutput === 'function' && output) {
        onOutput(output);
    }

    return {
        success: response.success,
        returnCode: response.returnCode,
        output: output,
        error: response.error || (response.returnCode !== 0
            ? `Execution failed with return code ${response.returnCode}`
            : '')
    };
}

/**
 * Execute Stata code (async, via worker thread — macOS / fallback)
 * 执行 Stata 代码
 * @param {string} code - Stata code to execute
 * @param {boolean} echo - Whether Stata should echo the command
 * @param {function} onOutput - Called for each output chunk (streaming)
 * @returns {Promise<{success: boolean, returnCode: number, output: string, error: string}>}
 */
function executeAsync(code, echo = false, onOutput = null) {
    return new Promise((resolve, reject) => {
        if (!isNativeLoaded()) {
            reject(new Error('Native module not loaded. Please ensure stata_bridge.node is compiled and in the bin directory.'));
            return;
        }

        if (!sessionInitialized) {
            reject(new Error('Session not initialized. Call initSession() first.'));
            return;
        }

        try {
            clearOutput();
            let latestOutput = '';
            const t0 = Date.now();
            nativeModule.execute(code, echo, (payload) => {
                if (!payload || typeof payload !== 'object') {
                    return;
                }

                if (payload.type === 'output') {
                    const chunk = payload.data || '';
                    if (chunk) {
                        latestOutput += chunk;
                        if (typeof onOutput === 'function') {
                            onOutput(chunk);
                        }
                    }
                    return;
                }

                if (payload.type === 'done') {
                    const elapsed = Date.now() - t0;
                    if (elapsed > 500) {
                        console.log(`[stata_session] executeAsync took ${elapsed}ms for: ${code.substring(0, 80)}`);
                    }
                    const finalOutput = payload.output || latestOutput || '';
                    resolve({
                        success: payload.returnCode === 0,
                        returnCode: payload.returnCode,
                        output: finalOutput,
                        error: payload.error || (payload.returnCode !== 0
                            ? `Execution failed with return code ${payload.returnCode}`
                            : '')
                    });
                }
            });
        } catch (error) {
            reject(new Error('Error executing code: ' + error.message));
        }
    });
}

/**
 * Execute Stata code — platform-aware dispatcher
 *
 * Windows: Uses ExecuteSync (main-thread synchronous call via setImmediate)
 *          because Stata DLL on Windows requires main-thread affinity for
 *          StataSO_Execute. Worker-thread calls hang indefinitely.
 * macOS:   Uses async Execute (worker thread with streaming output) because
 *          dylib on macOS is thread-safe.
 *
 * @param {string} code - Stata code to execute
 * @param {boolean} echo - Whether Stata should echo the command
 * @param {function} onOutput - Called for output chunks (streaming on macOS, full output on Windows)
 * @returns {Promise<{success: boolean, returnCode: number, output: string, error: string}>}
 */
function execute(code, echo = false, onOutput = null) {
    // Windows: delegate to Worker thread (non-blocking, stop button works)
    // macOS:   use async worker-thread Execute (streaming output)
    if (process.platform === 'win32') {
        return executeSyncWin(code, echo, onOutput);
    }
    return executeAsync(code, echo, onOutput);
}

/**
 * Clear the output buffer
 * 清除输出缓冲区
 * @returns {void}
 */
function clearOutput() {
    if (!isNativeLoaded()) {
        console.warn('Native module not loaded. Cannot clear output.');
        return;
    }

    if (!sessionInitialized) {
        console.warn('Session not initialized. Cannot clear output.');
        return;
    }

    try {
        nativeModule.clearOutput();
    } catch (error) {
        console.error('Error clearing output: ' + error.message);
    }
}

/**
 * Set break/interrupt flag
 * 设置中断/打断标志
 * @returns {void}
 */
function setBreak() {
    if (!isNativeLoaded()) {
        console.warn('Native module not loaded. Cannot set break.');
        return;
    }

    // On Windows the session lives on the Worker thread, so
    // sessionInitialized is always false on the main thread.
    // g_StataSO_SetBreak is process-wide and thread-safe —
    // calling it from the main thread interrupts the Worker's
    // StataSO_Execute.
    if (!sessionInitialized && process.platform !== 'win32') {
        console.warn('Session not initialized. Cannot set break.');
        return;
    }

    try {
        nativeModule.setBreak();
    } catch (error) {
        console.error('Error setting break: ' + error.message);
    }
}

/**
 * Shutdown the Stata session
 * 关闭 Stata 会话
 * @returns {void}
 */
function shutdown() {
    if (!isNativeLoaded()) {
        console.warn('Native module not loaded. Cannot shutdown.');
        return;
    }

    // Windows: terminate the Worker thread
    if (process.platform === 'win32') {
        _terminateWorker().catch(() => {});
    }

    if (!sessionInitialized) {
        console.warn('Session not initialized. Nothing to shutdown.');
        return;
    }

    try {
        nativeModule.shutdown();
        sessionInitialized = false;
        currentDylibPath = null;
    } catch (error) {
        console.error('Error shutting down session: ' + error.message);
    }
}

/**
 * Get current output buffer content
 * 获取当前输出缓冲区内容
 * @returns {string} - Output buffer content
 */
function getOutput() {
    if (!isNativeLoaded()) {
        return '';
    }

    if (!sessionInitialized) {
        return '';
    }

    try {
        return nativeModule.getOutput() || '';
    } catch (error) {
        console.error('Error getting output: ' + error.message);
        return '';
    }
}

// Export the API
/**
 * Get dataset info (observations, variables, source, sorted by)
 */
function getDatasetInfo() {
    if (!isNativeLoaded()) {
        return Promise.resolve(null);
    }
    try {
        const result = nativeModule.getDatasetInfo();
        return Promise.resolve(result);
    } catch (e) {
        return Promise.resolve(null);
    }
}

/**
 * Get variable metadata (name, type, format, label)
 */
function getVarMetadata() {
    if (!isNativeLoaded()) {
        return Promise.resolve([]);
    }
    try {
        const result = nativeModule.getVarMetadata();
        return Promise.resolve(result);
    } catch (e) {
        return Promise.resolve([]);
    }
}

/**
 * Get data rows from the current dataset
 * @param {string} varList - variable list (default "_all")
 * @param {number} start - start observation (default 1)
 * @param {number} end - end observation (default 100)
 */
function getDataRows(varList, start, end) {
    if (!isNativeLoaded()) {
        return Promise.resolve({ columns: [], rows: [] });
    }
    try {
        const result = nativeModule.getDataRows(varList || '_all', start || 1, end || 100);
        return Promise.resolve(result);
    } catch (e) {
        return Promise.resolve({ columns: [], rows: [] });
    }
}

/**
 * Get summary statistics for all variables
 */
function getSummary() {
    if (!isNativeLoaded()) {
        return Promise.resolve([]);
    }
    try {
        const result = nativeModule.getSummary();
        return Promise.resolve(result);
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = {
    initSession,
    execute,
    clearOutput,
    setBreak,
    shutdown,
    getOutput,
    getDatasetInfo,
    getVarMetadata,
    getDataRows,
    getSummary,

    // Export status getters for external inspection
    isInitialized: () => sessionInitialized,
    getDylibPath: () => currentDylibPath,
    isLoaded: isNativeLoaded
};
