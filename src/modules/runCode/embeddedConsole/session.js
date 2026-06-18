/**
 * Stata Embedded Console Session Manager
 * Manages the Stata Embedded Console session instance per VS Code window.
 * Supports both macOS (dylib) and Windows (DLL) via the same native bridge.
 *
 * Provides singleton session management, wrapping the native module's async API.
 */

const native = require('./native/stata_session');
const fs = require('fs');
const nodePath = require('path');

// Module-level singleton
let _consoleSessionInstance = null;
let _sessionStale = false; // true when console panel was closed — session should be recreated

// Platform-aware globalState key for persisting library path
const kLibraryPathKey = process.platform === 'win32'
    ? 'stataConsoleDllPath'
    : 'stataConsoleDylibPath';

/**
 * StataConsoleSession class
 * Manages Stata Embedded Console session initialization, execution, and shutdown.
 */
class StataConsoleSession {
    /**
     * @param {vscode.ExtensionContext} context - VS Code extension context for state storage
     */
    constructor(context) {
        this._initialized = false;
        this._libraryPath = null;
        this._nativeSession = null;
        this._context = context;
        this._workingDirectory = null;
        this._bootstrapped = false;

        // Restore state from previous session if available
        this._restoreState();
    }

    /**
     * Restore state from ExtensionContext
     * @private
     */
    _restoreState() {
        if (this._context) {
            const storedPath = this._context.globalState.get(kLibraryPathKey);
            if (storedPath && native.isInitialized()) {
                this._initialized = native.isInitialized();
                this._libraryPath = storedPath;
            }
        }
    }

    /**
     * Persist state to ExtensionContext
     * @private
     */
    _saveState() {
        if (this._context) {
            this._context.globalState.update(kLibraryPathKey, this._libraryPath);
        }
    }

    /**
     * Clear persisted state
     * @private
     */
    _clearState() {
        if (this._context) {
            this._context.globalState.update(kLibraryPathKey, undefined);
        }
        this._initialized = false;
        this._libraryPath = null;
        this._workingDirectory = null;
        this._bootstrapped = false;
    }

    /**
     * Compute stHome (SYSDIR_STATA) from the library path.
     * macOS:  /Applications/StataMP.app/Contents/MacOS/libstata-mp.dylib → /Applications/StataMP
     * Windows: D:\Stata18\mp-64.dll → D:\Stata18
     * @private
     */
    _deriveStHome(libraryPath) {
        if (process.platform === 'win32') {
            // Windows: the DLL is directly in the Stata install root (e.g. D:\Stata18\mp-64.dll)
            return nodePath.dirname(libraryPath);
        }

        // macOS: extract the .app bundle parent from /Applications/Stata*.app/Contents/MacOS/libstata-*.dylib
        const appMatch = libraryPath.match(/^(\/Applications\/Stata(?:Now|MP|SE|BE|IC)?)\.app\//);
        if (appMatch) {
            return appMatch[1];
        }

        // Fallback: walk up to find the .app directory
        let dir = nodePath.dirname(libraryPath);               // Contents/MacOS
        dir = nodePath.dirname(dir);                           // Contents
        dir = nodePath.dirname(dir);                           // StataMP.app (or similar)
        if (dir.endsWith('.app')) {
            return nodePath.dirname(dir);                      // /Applications (or wherever)
        }
        return '/Applications';
    }

    _deriveStataExecutablePath(libraryPath) {
        if (process.platform === 'win32') {
            return '';
        }

        const macosDir = nodePath.dirname(libraryPath);
        const dylibName = nodePath.basename(libraryPath);
        const editionMatch = dylibName.match(/^libstata-(mp|se|be|ic)\.dylib$/i);
        const editionToExecutable = {
            mp: 'StataMP',
            se: 'StataSE',
            be: 'StataBE',
            ic: 'StataIC'
        };

        const candidates = [];
        if (editionMatch) {
            candidates.push(nodePath.join(macosDir, editionToExecutable[editionMatch[1].toLowerCase()]));
        }
        candidates.push(
            nodePath.join(macosDir, 'StataMP'),
            nodePath.join(macosDir, 'StataSE'),
            nodePath.join(macosDir, 'StataBE'),
            nodePath.join(macosDir, 'StataIC')
        );

        for (const candidate of candidates) {
            if (candidate && fs.existsSync(candidate)) {
                return candidate;
            }
        }
        return '';
    }

    /**
     * Initialize Stata session
     * Async initialization; does not block extension activation.
     * @param {string} libraryPath - Path to Stata dylib/DLL
     * @returns {Promise<{success: boolean, error: string}>}
     */
    async init(libraryPath) {
        if (!native.isLoaded()) {
            return { success: false, error: 'Native module not loaded.', failCode: 'NATIVE_NOT_LOADED' };
        }

        if (this._initialized) {
            if (this._libraryPath === libraryPath) {
                return { success: true, error: '' };
            }
            this.shutdown();
        }

        // If the native C++ session is still alive from a previous JS wrapper
        // (panel was closed without native shutdown to avoid dlclose crash),
        // just reconnect this JS wrapper to the existing native session.
        if (native.isInitialized()) {
            console.log('Stata All in One: Reconnecting to existing native session');
            this._initialized = true;
            this._libraryPath = libraryPath;
            this._saveState();
            return { success: true, error: '' };
        }

        try {
            const execPath = this._deriveStataExecutablePath(libraryPath);
            const stHome = this._deriveStHome(libraryPath);
            const splash = false;

            const result = await native.initSession(libraryPath, splash, execPath, stHome);

            if (result) {
                this._initialized = true;
                this._libraryPath = libraryPath;
                this._saveState();
                return { success: true, error: '' };
            }

            console.error('Stata All in One: Initialization returned false.');
            return { success: false, error: 'StataSO_Main returned failure.', failCode: 'SESSION_INIT_FAILED' };
        } catch (error) {
            console.error('Stata All in One: Initialization failed:', error.message);
            return { success: false, error: error.message, failCode: 'SESSION_INIT_FAILED' };
        }
    }

    /**
     * 执行 Stata 代码
     * @param {string} code - 要执行的 Stata 代码
     * @param {boolean} echo - 是否回显命令
     * @returns {Promise<{success: boolean, output: string, error?: string}>} - 执行结果对象
     */
    async execute(code, echo = false, onOutput = null) {
        // 检查是否已初始化
        if (!this._initialized) {
            return {
                success: false,
                output: '',
                error: 'Session not initialized. Call init() first.'
            };
        }

        // 检查原生模块
        if (!native.isLoaded()) {
            return {
                success: false,
                output: '',
                error: 'Native module not loaded.'
            };
        }

        try {
            const result = await native.execute(code, echo, onOutput);
            return {
                success: result.success,
                returnCode: result.returnCode,
                output: result.output || '',
                error: result.error || undefined
            };
        } catch (error) {
            return {
                success: false,
                returnCode: -1,
                output: '',
                error: error.message || 'Unknown execution error'
            };
        }
    }

    /**
     * 中断当前执行
     * 设置中断标志，停止正在运行的 Stata 命令
     * @returns {boolean} - 成功返回 true，失败返回 false
     */
    stop() {
        if (!this._initialized) {
            console.warn('Stata All in One: Cannot stop: session not initialized.');
            return false;
        }

        try {
            native.setBreak();
            return true;
        } catch (error) {
            console.error('Stata All in One: Failed to set break:', error.message);
            return false;
        }
    }

    /**
     * 关闭 Stata 会话
     * 清理原生模块状态和本地状态
     * @returns {boolean} - 成功返回 true
     */
    shutdown() {
        if (!this._initialized) {
            console.warn('Stata All in One: Nothing to shutdown: session not initialized.');
            return true; // 未初始化也算成功关闭
        }

        try {
            native.shutdown();
            this._clearState();
            return true;
        } catch (error) {
            console.error('Stata All in One: Shutdown failed:', error.message);
            // 即使原生关闭失败，也清除本地状态
            this._clearState();
            return false;
        }
    }

    /**
     * 检查会话是否已初始化
     * @returns {boolean}
     */
    isInitialized() {
        // 同时检查本地状态和原生模块状态
        return this._initialized && native.isInitialized();
    }

    /**
     * Get current library path (dylib on macOS, DLL on Windows)
     * @returns {string|null}
     */
    getDylibPath() {
        return this._libraryPath;  // kept as getDylibPath for backward compat
    }

    /**
     * 获取当前工作目录
     * @returns {string|null}
     */
    getWorkingDirectory() {
        return this._workingDirectory;
    }

    /**
     * 设置当前工作目录
     * @param {string|null} workingDirectory
     */
    setWorkingDirectory(workingDirectory) {
        this._workingDirectory = workingDirectory || null;
    }

    isBootstrapped() {
        return this._bootstrapped;
    }

    setBootstrapped(bootstrapped) {
        this._bootstrapped = Boolean(bootstrapped);
    }

    /**
     * 清除输出缓冲区
     * @returns {boolean}
     */
    clearOutput() {
        if (!this._initialized) {
            return false;
        }
        
        try {
            native.clearOutput();
            return true;
        } catch (error) {
            console.error('Stata All in One: Clear output failed:', error.message);
            return false;
        }
    }
}

/**
 * 获取或创建会话单例
 * 每个 VS Code 窗口只有一个实例
 * @param {vscode.ExtensionContext} context - VS Code 扩展上下文
 * @returns {StataConsoleSession}
 */
function getConsoleSession(context) {
    if (!_consoleSessionInstance) {
        _consoleSessionInstance = new StataConsoleSession(context);
    }
    return _consoleSessionInstance;
}

/**
 * 初始化会话单例
 * 创建单例并尝试初始化
 * @param {vscode.ExtensionContext} context - VS Code 扩展上下文
 * @param {string} dylibPath - Stata dylib 路径
 * @returns {Promise<{success: boolean, error: string}>}
 */
async function initConsoleSession(context, dylibPath) {
    const session = getConsoleSession(context);
    return await session.init(dylibPath);
}

/**
 * 检查单例是否存在且已初始化
 * @returns {boolean}
 */
function hasActiveConsoleSession() {
    if (_sessionStale) return false;
    return _consoleSessionInstance !== null && _consoleSessionInstance.isInitialized();
}

/**
 * Mark the current session as stale (console panel was closed).
 * Next run will auto-shutdown the old session and create a fresh one.
 * The shutdown is deferred to avoid the C++ dlclose/FreeLibrary race
 * condition with active execution worker threads.
 */
function markSessionStale() {
    _sessionStale = true;
}

/**
 * Check if a session exists but is stale (panel was closed).
 * Caller should shut down the old session and recreate.
 */
function isSessionStale() {
    return _sessionStale && _consoleSessionInstance !== null && _consoleSessionInstance.isInitialized();
}

/**
 * Clear a stale session WITHOUT calling native shutdown.
 * The native C++ dlclose/FreeLibrary can crash VS Code due to a race
 * condition with detached worker threads. Instead, we just drop the JS
 * wrapper — the next session.init() will detect that the native module
 * is already initialized and skip the C++ init call.
 */
function clearStaleSession() {
    if (_sessionStale && _consoleSessionInstance) {
        _consoleSessionInstance = null;
    }
    _sessionStale = false;
}

/**
 * 强制关闭单例并清除
 * 用于清理或重置
 * @returns {boolean}
 */
function forceShutdownConsoleSession() {
    if (_consoleSessionInstance) {
        const result = _consoleSessionInstance.shutdown();
        _consoleSessionInstance = null;
        return result;
    }
    return true;
}

// 导出接口
function getActiveSession() {
    if (_consoleSessionInstance && _consoleSessionInstance.isInitialized()) {
        return _consoleSessionInstance;
    }
    return null;
}

module.exports = {
    StataConsoleSession,
    getConsoleSession,
    getActiveSession,
    initConsoleSession,
    hasActiveConsoleSession,
    forceShutdownConsoleSession,
    markSessionStale,
    isSessionStale,
    clearStaleSession
};
