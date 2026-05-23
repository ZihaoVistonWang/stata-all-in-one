/**
 * Stata Embedded Console Session Manager
 * 管理单个 VS Code 窗口的 Stata Embedded Console 会话实例
 * 
 * 提供单例模式的会话管理，封装原生模块的异步 API
 */

const native = require('./native/stata_session');

// 模块级单例变量
let _consoleSessionInstance = null;

/**
 * StataConsoleSession 类
 * 管理 Stata Embedded Console 会话的初始化、执行和关闭
 */
class StataConsoleSession {
    /**
     * 构造函数
     * @param {vscode.ExtensionContext} context - VS Code 扩展上下文，用于状态存储
     */
    constructor(context) {
        // 私有状态
        this._initialized = false;
        this._dylibPath = null;
        this._nativeSession = null;
        this._context = context;
        this._workingDirectory = null;
        this._bootstrapped = false;
        
        // 从上下文中恢复已有状态（如果有）
        this._restoreState();
    }

    /**
     * 从 ExtensionContext 恢复状态
     * @private
     */
    _restoreState() {
        if (this._context) {
            // 检查全局状态中是否有已初始化的会话
            const storedDylibPath = this._context.globalState.get('stataConsoleDylibPath');
            if (storedDylibPath && native.isInitialized()) {
                this._initialized = native.isInitialized();
                this._dylibPath = storedDylibPath;
            }
        }
    }

    /**
     * 保存状态到 ExtensionContext
     * @private
     */
    _saveState() {
        if (this._context) {
            this._context.globalState.update('stataConsoleDylibPath', this._dylibPath);
        }
    }

    /**
     * 清除状态
     * @private
     */
    _clearState() {
        if (this._context) {
            this._context.globalState.update('stataConsoleDylibPath', undefined);
        }
        this._initialized = false;
        this._dylibPath = null;
        this._workingDirectory = null;
        this._bootstrapped = false;
    }

    /**
     * 初始化 Stata 会话
     * 异步初始化，不阻塞扩展激活
     * @param {string} dylibPath - Stata dylib/shared library 路径
     * @returns {Promise<boolean>} - 初始化成功返回 true，失败返回 false（不抛出异常）
     */
    async init(dylibPath) {
        if (!native.isLoaded()) {
            console.error('[StataConsoleSession] Native module not loaded. Cannot initialize session.');
            return false;
        }

        if (this._initialized) {
            if (this._dylibPath === dylibPath) {
                return true;
            } else {
                this.shutdown();
            }
        }

        try {
            const path = require('path');
            const execPath = process.execPath;
            let stHome = '/Applications';
            const stataNowMatch = dylibPath.match(/\/Applications\/(StataNow|Stata)/);
            if (stataNowMatch) {
                stHome = '/Applications/' + stataNowMatch[1];
            }
            
            const splash = false;
            const result = await native.initSession(dylibPath, splash, execPath, stHome);
            
            if (result) {
                this._initialized = true;
                this._dylibPath = dylibPath;
                this._saveState();
                return true;
            } else {
                console.error('[StataConsoleSession] Initialization returned false.');
                return false;
            }
        } catch (error) {
            console.error('[StataConsoleSession] Initialization failed:', error.message);
            return false;
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
            console.warn('[StataConsoleSession] Cannot stop: session not initialized.');
            return false;
        }

        try {
            native.setBreak();
            return true;
        } catch (error) {
            console.error('[StataConsoleSession] Failed to set break:', error.message);
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
            console.warn('[StataConsoleSession] Nothing to shutdown: session not initialized.');
            return true; // 未初始化也算成功关闭
        }

        try {
            native.shutdown();
            this._clearState();
            return true;
        } catch (error) {
            console.error('[StataConsoleSession] Shutdown failed:', error.message);
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
     * 获取当前 dylib 路径
     * @returns {string|null}
     */
    getDylibPath() {
        return this._dylibPath;
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
            console.error('[StataConsoleSession] Clear output failed:', error.message);
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
 * @returns {Promise<boolean>} - 初始化结果
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
    return _consoleSessionInstance !== null && _consoleSessionInstance.isInitialized();
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
    forceShutdownConsoleSession
};
