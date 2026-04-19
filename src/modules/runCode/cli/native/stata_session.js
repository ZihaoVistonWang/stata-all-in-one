/**
 * Stata Native Session Wrapper
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

    try {
        const modulePath = path.join(__dirname, '..', '..', '..', '..', '..', 'bin', 'stata_bridge.node');
        nativeModule = require(modulePath);
        return nativeModule;
    } catch (error) {
        console.error('Failed to load native module:', error.message);
        return null;
    }
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
function execute(code, echo = false) {
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
            const result = nativeModule.executeSync(code, echo);
            if (result.returnCode === 0) {
                resolve({
                    success: true,
                    returnCode: result.returnCode,
                    output: result.output || '',
                    error: ''
                });
            } else {
                resolve({
                    success: false,
                    returnCode: result.returnCode,
                    output: result.output || '',
                    error: result.error || `Execution failed with return code ${result.returnCode}`
                });
            }
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
module.exports = {
    initSession,
    execute,
    clearOutput,
    setBreak,
    shutdown,
    getOutput,
    
    // Export status getters for external inspection
    isInitialized: () => sessionInitialized,
    getDylibPath: () => currentDylibPath,
    isLoaded: isNativeLoaded
};
