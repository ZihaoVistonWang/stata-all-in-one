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

/**
 * Execute Stata code
 * 执行 Stata 代码
 * @param {string} code - Stata code to execute
 * @param {boolean} echo - Whether Stata should echo the command
 * @returns {Promise<{success: boolean, returnCode: number, output: string, error: string}>}
 */
function execute(code, echo = false, onOutput = null) {
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

    if (!sessionInitialized) {
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
