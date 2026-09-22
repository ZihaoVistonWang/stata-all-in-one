/**
 * Stata Embedded Console Session Manager
 * Manages the Stata Embedded Console session instance per VS Code window.
 * Supports both macOS (dylib) and Windows (DLL) via the same native bridge.
 *
 * Provides singleton session management, wrapping the native module's async API.
 */

const native = require('./native/stata_process');
const { createOperationQueue } = require('./native/operationQueue');
const fs = require('fs');
const nodePath = require('path');
const os = require('os');

// Every call that reaches the Stata engine goes through this queue. Stata is
// single-threaded and the native bridge keeps one command slot plus one output
// buffer per execution, so user Console execution, variable/metadata queries
// and Data Viewer reads must never overlap.
const engineQueue = createOperationQueue();

// Transactions own the engine queue, so ownership is tracked per ENGINE, not per
// session instance: a transaction on one session whose task starts a transaction
// on another session must join the enclosing one instead of deadlocking behind
// the queue it is already holding.
let engineOwnerToken = null;

// Module-level singleton
let _consoleSessionInstance = null;
let _sessionStale = false; // true when console panel was closed — the JS wrapper should be replaced

// One-time Stata bootstrap state ("set more off", "set linesize 255", and the
// initial "clear all"). It belongs to the NATIVE session, not to the JS wrapper:
// the wrapper is dropped whenever the Console panel closes, while the native
// StataSO session (and everything the user loaded into it) keeps living.
// Keeping this on the wrapper made a reopen look like a brand-new session and
// silently wiped the user's data with `clear all`.
let _nativeSessionBootstrapped = false;
// Whether the destructive `clear all` bootstrap already ran for the current
// native session. Only a genuinely new native session resets it.
let _nativeSessionReset = false;

/**
 * StataSO_Execute does not consistently recognize horizontal tabs as token
 * separators. Normalize tabs in executable code while preserving literal tabs
 * inside quoted strings.
 *
 * @param {string} code - Stata code submitted to the native session
 * @returns {string}
 */
function normalizeNativeCommandWhitespace(code) {
    const source = String(code || '');
    let normalized = '';
    let inQuotedString = false;

    for (let index = 0; index < source.length; index++) {
        const character = source[index];

        if (character === '"') {
            normalized += character;

            // A doubled quote inside a string represents a literal quote.
            if (inQuotedString && source[index + 1] === '"') {
                normalized += source[index + 1];
                index += 1;
            } else {
                inQuotedString = !inQuotedString;
            }
            continue;
        }

        normalized += character === '\t' && !inQuotedString ? ' ' : character;
    }

    return normalized;
}

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
        this._activeExecutions = 0;
        this._idleWaiters = [];
        this._stopRequested = false;
        this._generation = 0;
        this._sessionLostNotified = false;

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
            this._libraryPath = storedPath || null;
        }
        // The wrapper's view of the session must always be reconciled with the
        // native session, because the native session outlives any single
        // wrapper instance (the wrapper is dropped when the Console closes).
        if (native.isInitialized()) {
            this._initialized = true;
            if (!this._libraryPath && typeof native.getDylibPath === 'function') {
                this._libraryPath = native.getDylibPath() || null;
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

        // The native session died behind our back (crash / forced stop).
        if (this._initialized && !native.isInitialized()) {
            this._initialized = false;
            _nativeSessionBootstrapped = false;
            this._workingDirectory = null;
            this._sessionLostNotified = true;
            notifySessionLost();
        }

        if (this._initialized) {
            if (this._libraryPath === libraryPath) {
                // Already connected. Nothing to do — in particular, do NOT
                // re-run the bootstrap, which starts with `clear all`.
                this._reconcileBootstrapState();
                return { success: true, error: '' };
            }
            this.shutdown();
        }

        // If the native C++ session is still alive from a previous JS wrapper
        // (panel was closed without native shutdown to avoid dlclose crash),
        // just reconnect this JS wrapper to the existing native session.
        // The user's data is still in memory, so this is NOT a new session and
        // must not trigger the `clear all` bootstrap.
        if (native.isInitialized()) {
            console.log('Stata All in One: Reconnecting to existing native session');
            this._initialized = true;
            this._libraryPath = libraryPath;
            this._generation += 1;
            this._reconcileBootstrapState();
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
                this._generation += 1;
                this._sessionLostNotified = false;
                _nativeSessionBootstrapped = false;
                _nativeSessionReset = false;
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
     * Reconnecting to a live native session must never look like a brand-new
     * session, otherwise the next run wipes the user's data with `clear all`.
     * @private
     */
    _reconcileBootstrapState() {
        if (!_nativeSessionBootstrapped) {
            // The native session predates this module's bookkeeping (for example
            // the extension was reloaded). The DESTRUCTIVE part of the bootstrap
            // (`clear all`) must be skipped, or reconnecting would wipe the data
            // the user is working with; the idempotent settings are re-applied by
            // the caller instead (see needsBootstrapSettings).
            _nativeSessionBootstrapped = true;
            _nativeSessionReset = true;
        }
    }

    /**
     * True when the idempotent bootstrap settings still have to be applied to
     * this live session. Cheap to satisfy and safe to repeat.
     */
    needsBootstrapSettings() {
        return !_nativeSessionBootstrapped;
    }

    /**
     * 执行 Stata 代码
     * @param {string} code - 要执行的 Stata 代码
     * @param {boolean} echo - 是否回显命令
     * @returns {Promise<{success: boolean, output: string, error?: string}>} - 执行结果对象
     */
    async execute(code, echo = false, onOutput = null, options = null) {
        // 检查是否已初始化
        if (!this._initialized) {
            return {
                success: false,
                output: '',
                error: 'Session not initialized. Call init() first.',
                sessionUnavailable: true
            };
        }

        // 检查原生模块
        if (!native.isLoaded()) {
            return {
                success: false,
                output: '',
                error: 'Native module not loaded.',
                sessionUnavailable: true
            };
        }

        // Deliberately NOT re-entrant. A read transaction issues its commands
        // through its own executor (see withTransaction); a plain execute() is
        // always queued, so a concurrent Data Viewer read can never slip between
        // two commands that must belong to the same dataset version.
        //
        // Internal housekeeping reads (metadata, plugin preparation, bootstrap)
        // are marked so they do not invalidate the viewer's own cache.
        const internal = Boolean(options && options.internal);
        return engineQueue.enqueue(
            async () => {
                if (!internal) {
                    // Announced when the command starts, not when it finishes:
                    // a partially applied command (drop succeeded, the next
                    // statement failed) still changed the data, and so does an
                    // interrupted one.
                    notifyDataMayHaveChanged({ code });
                }
                return this._executeNow(code, echo, onOutput);
            },
            internal ? 'read' : 'execute'
        );
    }

    /**
     * Run arbitrary user code through the same queue as execute(), with the
     * data-change notification enabled.
     */
    runUserCode(code, echo = false, onOutput = null) {
        return this.execute(code, echo, onOutput, { internal: false });
    }

    /**
     * Perform one Stata command that must not count as a user data change.
     * @private
     */
    async _executeNow(code, echo, onOutput) {
        this._activeExecutions += 1;
        try {
            const normalizedCode = normalizeNativeCommandWhitespace(code);
            const result = await native.execute(normalizedCode, echo, onOutput);
            if (result && result.sessionLost && !this._sessionLostNotified) {
                this._sessionLostNotified = true;
                notifySessionLost();
            }
            return {
                success: result.success,
                returnCode: result.returnCode,
                output: result.output || '',
                error: result.error || undefined,
                interrupted: Boolean(result.interrupted),
                forced: Boolean(result.forced),
                sessionLost: Boolean(result.sessionLost),
                lostReason: result.lostReason
            };
        } catch (error) {
            const nativeInitialized = typeof native.isInitialized === 'function'
                ? native.isInitialized()
                : true;
            return {
                success: false,
                returnCode: -1,
                output: '',
                error: error.message || 'Unknown execution error',
                interrupted: this._stopRequested,
                forced: false,
                sessionLost: !nativeInitialized
            };
        } finally {
            this._activeExecutions = Math.max(0, this._activeExecutions - 1);
            if (this._activeExecutions === 0 && this._idleWaiters.length) {
                const waiters = this._idleWaiters.splice(0);
                for (const resolve of waiters) {
                    resolve();
                }
            }
        }
    }

    /**
     * Run `task` as one indivisible read transaction.
     *
     * Metadata reads, plugin preparation and the capture call must belong to the
     * same dataset version. Without this, a user command (or another viewer
     * refresh) could change the dataset — or switch frames — between the
     * metadata read and the data read, producing a capture that is internally
     * inconsistent.
     *
     * @param {function(StataConsoleSession): Promise<any>} task
     * @returns {Promise<any>}
     */
    withTransaction(task) {
        if (typeof task !== 'function') {
            return Promise.reject(new TypeError('Transaction task must be a function.'));
        }
        // Nested transaction on an already-owned queue: join the enclosing one so
        // a nested call can never deadlock behind itself.
        if (engineOwnerToken !== null) {
            return Promise.resolve().then(() => task(this._createTransactionExecutor()));
        }
        return engineQueue.enqueue(async () => {
            engineOwnerToken = Symbol('stata-transaction');
            try {
                return await task(this._createTransactionExecutor());
            } finally {
                engineOwnerToken = null;
            }
        }, 'transaction');
    }

    /**
     * Executor handed to a transaction task.
     *
     * Its `execute` runs inline instead of queueing: the engine queue is already
     * held by the transaction, so queueing would deadlock, and running inline is
     * exactly what guarantees that no other operation can interleave between the
     * commands of one read.
     *
     * @private
     */
    _createTransactionExecutor() {
        const session = this;
        return {
            execute(code, echo = false, onOutput = null) {
                if (!session._initialized) {
                    return Promise.resolve({
                        success: false,
                        output: '',
                        error: 'Session not initialized. Call init() first.',
                        sessionUnavailable: true
                    });
                }
                // Runs inline: the transaction already owns the engine queue, so
                // queueing here would deadlock, and inline is exactly what keeps
                // other operations out of the middle of a read.
                return session._executeNow(code, echo, onOutput);
            },
            isInitialized: () => session.isInitialized(),
            getGeneration: () => session.getGeneration(),
            session
        };
    }

    isInTransaction() {
        return engineOwnerToken !== null;
    }

    /**
     * Count of queued + running engine operations. Used by the Data Viewer to
     * decide whether a read can start immediately.
     */
    getEngineQueueStats() {
        return engineQueue.getStats();
    }

    /**
     * Wait until all direct Console/Data Viewer calls using this session finish.
     * This prevents shutdown from racing with a background memory capture.
     * @returns {Promise<void>}
     */
    waitUntilIdle() {
        if (this._activeExecutions === 0 && !engineQueue.isRunning() && engineQueue.depth() === 0) {
            return Promise.resolve();
        }
        return engineQueue.whenIdle().then(() => {
            // Re-check after the queue drains: the last execution may already
            // have finished, and parking a resolver that nothing will drain would
            // leak it for the lifetime of the host.
            if (this._activeExecutions === 0) {
                return undefined;
            }
            return new Promise((resolve) => {
                this._idleWaiters.push(resolve);
            });
        });
    }

    isBusy() {
        return this._activeExecutions > 0;
    }

    getGeneration() {
        return this._generation;
    }

    /**
     * Reset all user-visible Stata state without calling StataSO_Shutdown.
     * StataSO_Shutdown terminates the hosting Extension Host process, so an
     * in-window restart must reset Stata and replace the JS session wrapper.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async resetState() {
        const resetDirectory = os.homedir().replace(/"/g, '""').replace(/\\/g, '/');
        const commands = [
            'clear all',
            'capture macro drop _all',
            'capture scalar drop _all',
            'capture matrix drop _all',
            'capture constraint drop _all',
            'capture estimates clear',
            'capture collect clear',
            'capture discard',
            `cd "${resetDirectory}"`
        ];

        for (const command of commands) {
            const result = await this.execute(command, false);
            if (!result.success) {
                return {
                    success: false,
                    error: result.error || result.output || `Failed to execute: ${command}`
                };
            }
        }

        this._workingDirectory = null;
        // An explicit restart intentionally returns the session to its
        // just-created state, so the next run performs the reset bootstrap.
        _nativeSessionBootstrapped = false;
        _nativeSessionReset = false;
        this.clearOutput();
        return { success: true };
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

        // The request flag is set BEFORE calling into the native layer: a break
        // that was requested must stay visible to the running execution even if
        // the native signal itself cannot be delivered.
        this._stopRequested = true;
        try {
            const breakRequested = native.setBreak();
            return breakRequested !== false;
        } catch (error) {
            console.error('Stata All in One: Failed to set break:', error.message);
            return false;
        }
    }

    beginManualStopScope() {
        this._stopRequested = false;
    }

    clearManualStopScope() {
        this._stopRequested = false;
    }

    isStopRequested() {
        return this._stopRequested;
    }

    /**
     * 关闭 Stata 会话
     * 清理原生模块状态和本地状态
     * @returns {boolean} - 成功返回 true
     */
    shutdown() {
        if (!this._initialized && !native.isInitialized()) {
            console.warn('Stata All in One: Nothing to shutdown: session not initialized.');
            return true; // 未初始化也算成功关闭
        }

        try {
            native.shutdown();
            _nativeSessionBootstrapped = false;
            this._clearState();
            return true;
        } catch (error) {
            console.error('Stata All in One: Shutdown failed:', error.message);
            // 即使原生关闭失败，也清除本地状态
            _nativeSessionBootstrapped = false;
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
        if (!this._initialized) {
            return false;
        }
        if (native.isInitialized()) {
            return true;
        }
        // The native session disappeared (worker crash / forced stop). Report it
        // once so the UI can say the session was lost instead of silently
        // treating the next run as a fresh, empty session.
        if (!this._sessionLostNotified) {
            this._sessionLostNotified = true;
            notifySessionLost();
        }
        return false;
    }

    /**
     * Why the live session disappeared, when it did.
     * @returns {string|null}
     */
    getLostSessionReason() {
        if (typeof native.getLostSessionReason === 'function') {
            return native.getLostSessionReason();
        }
        return null;
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

    /**
     * Bootstrap has TWO parts with different lifetimes:
     *
     *  - the destructive reset (`clear all`), which may only run once for a
     *    genuinely NEW native session;
     *  - the idempotent settings (`set more off`, `set linesize 255`), which are
     *    safe to re-apply and SHOULD be re-applied whenever a wrapper reconnects
     *    to a live session, because the previous wrapper may have exited before
     *    applying them (and a wrapped output buffer breaks the metadata reader).
     *
     * This state belongs to the native session, not to this wrapper: the wrapper
     * is dropped whenever the Console panel closes while the native session —
     * and everything the user loaded into it — keeps running.
     */
    isBootstrapped() {
        return _nativeSessionBootstrapped;
    }

    setBootstrapped(bootstrapped) {
        _nativeSessionBootstrapped = Boolean(bootstrapped);
    }

    isResetPerformed() {
        return _nativeSessionReset;
    }

    setResetPerformed(performed) {
        _nativeSessionReset = Boolean(performed);
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

const dataChangedListeners = new Set();
const sessionLostListeners = new Set();

/**
 * Register a listener that runs when a command that may have changed Stata's
 * in-memory data has started executing. The Data Viewer uses this to drop its
 * cached copy so it never presents old data as current.
 *
 * Fired when execution STARTS: a command that succeeds only partially (for
 * example `drop` succeeded and the following statement failed), or one that the
 * user interrupted, has still changed the data.
 *
 * @param {function({code: string}): void} listener
 * @returns {{dispose: function(): void}}
 */
function onDidChangeData(listener) {
    if (typeof listener !== 'function') {
        return { dispose() {} };
    }
    dataChangedListeners.add(listener);
    return {
        dispose() {
            dataChangedListeners.delete(listener);
        }
    };
}

function notifyDataMayHaveChanged(event) {
    for (const listener of Array.from(dataChangedListeners)) {
        try {
            listener(event);
        } catch (error) {
            console.error('Stata All in One: Data-change listener failed:', error.message);
        }
    }
}

/**
 * Register a listener that runs when the live Stata session disappears
 * unexpectedly (worker crash, forced stop, Stata shutdown). A lost session is
 * NOT the same thing as a brand-new empty session, and callers must be able to
 * tell the difference instead of silently showing an empty dataset.
 * @param {function({reason: string}): void} listener
 * @returns {{dispose: function(): void}}
 */
function onDidLoseSession(listener) {
    if (typeof listener !== 'function') {
        return { dispose() {} };
    }
    sessionLostListeners.add(listener);
    return {
        dispose() {
            sessionLostListeners.delete(listener);
        }
    };
}

function notifySessionLost() {
    for (const listener of Array.from(sessionLostListeners)) {
        try {
            listener({ reason: 'session-lost' });
        } catch (error) {
            console.error('Stata All in One: Session-lost listener failed:', error.message);
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
 * The native session is still alive and still holds the user's data; only the
 * JS wrapper is dropped.
 */
function isSessionStale() {
    return _sessionStale && _consoleSessionInstance !== null && _consoleSessionInstance.isInitialized();
}

/**
 * Clear a stale session WITHOUT calling native shutdown.
 * The native C++ dlclose/FreeLibrary can crash VS Code due to a race
 * condition with detached worker threads. Instead, we just drop the JS
 * wrapper — the next session.init() will detect that the native module
 * is already initialized and reconnect to it. Reconnecting must PRESERVE the
 * live data, so the bootstrap state is intentionally kept (it is tied to the
 * native session, not to the wrapper).
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
        if (_consoleSessionInstance.isBusy()) {
            console.warn('Stata All in One: Refusing to shutdown a busy Console session.');
            return false;
        }
        const result = _consoleSessionInstance.shutdown();
        _consoleSessionInstance = null;
        _sessionStale = false;
        return result;
    }
    _sessionStale = false;
    return true;
}

/**
 * Explicit user-requested restart.
 *
 * This is the ONE path that is allowed to erase Stata state: it resets the
 * live session and then replaces the wrapper so the next run bootstraps again.
 * Unlike a panel close/reopen, the reset here is intentional.
 */
async function restartConsoleSession(context) {
    if (!_consoleSessionInstance || !_consoleSessionInstance.isInitialized()) {
        return { success: false, error: 'Stata session is not initialized.' };
    }

    await _consoleSessionInstance.waitUntilIdle();
    const resetResult = await _consoleSessionInstance.resetState();
    if (!resetResult.success) {
        return resetResult;
    }

    _consoleSessionInstance = new StataConsoleSession(context);
    _sessionStale = false;
    const connected = _consoleSessionInstance.isInitialized();
    return {
        success: connected,
        error: connected ? '' : 'Failed to reconnect to the reset Stata session.'
    };
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
    normalizeNativeCommandWhitespace,
    onDidLoseSession,
    onDidChangeData,
    getConsoleSession,
    getActiveSession,
    initConsoleSession,
    hasActiveConsoleSession,
    forceShutdownConsoleSession,
    restartConsoleSession,
    markSessionStale,
    isSessionStale,
    clearStaleSession
};
