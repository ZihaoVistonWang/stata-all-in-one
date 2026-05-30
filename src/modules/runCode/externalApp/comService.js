/**
 * Stata COM Automation Service Manager
 * Manages a persistent PowerShell child process that bridges
 * VS Code ↔ Stata Automation COM interface.
 *
 * Follows the same singleton pattern as session.js (StataConsoleSession).
 */

const { spawn } = require('child_process');
const path = require('path');
const { showInfo, showWarn, msg } = require('../../../utils/common');

const STATA_COM_MAX_COMMAND_LENGTH = 8192;
const GLOBAL_STATE_KEY = 'stataComLastRegisteredPath';

// Module-level singleton
let _comServiceInstance = null;

class StataComService {
    constructor(extensionPath) {
        this._extensionPath = extensionPath;
        this._childProcess = null;
        this._requestId = 0;
        this._pending = new Map();       // id → { resolve, reject, timer }
        this._lineBuffer = '';
        this._initialized = false;
        this._comUnavailable = false;
        this._stataPath = null;
        this._context = null;
    }

    // ── Public API ──────────────────────────────────────────

    /**
     * Initialize the COM service.
     * Compares current stataPath with last registered path stored in globalState.
     * If paths differ, triggers UAC registration automatically.
     *
     * @param {string} stataPath - Stata executable path
     * @param {vscode.ExtensionContext} context - for globalState persistence
     * @returns {Promise<boolean>}
     */
    async init(stataPath, context) {
        console.log('[StataComService] init called, stataPath=' + stataPath +
            ', alreadyInit=' + this._initialized +
            ', comUnavailable=' + this._comUnavailable);

        // Already initialized with same path — no-op
        if (this._initialized && this._stataPath === stataPath) {
            console.log('[StataComService] Already initialized with same path, returning true');
            return true;
        }

        // COM marked permanently unavailable — don't retry
        if (this._comUnavailable) {
            return false;
        }

        this._context = context;
        this._stataPath = stataPath;

        // Shutdown any existing child process (e.g., different path)
        if (this._childProcess) {
            this._killProcess();
        }

        const lastRegisteredPath = context
            ? context.globalState.get(GLOBAL_STATE_KEY, '')
            : '';

        // Path matches → COM should already be registered, try directly
        if (lastRegisteredPath && lastRegisteredPath === stataPath) {
            console.log('[StataComService] Path matches last registered, trying COM without registration');
            const result = await this._initComService(stataPath, false);
            if (result.success) {
                console.log('[StataComService] COM init succeeded (no registration needed)');
                return true;
            }
            // COM creation failed even though path matches
            // Registration may have been lost — fall through to register
            console.log('[StataComService] COM creation failed for registered path, attempting re-registration');
        }

        // If no context available, try COM directly without registration
        // (The registration should have been done by the primary execution path)
        if (!context) {
            console.log('[StataComService] No context available, trying COM directly without registration');
            const result = await this._initComService(stataPath, false);
            if (result.success) {
                return true;
            }
            // COM not available and can't auto-register — mark unavailable
            this._comUnavailable = true;
            this._killProcess();
            showWarn(msg('comInitFailed'));
            return false;
        }

        // Path differs, first use, or re-registration needed
        // Show non-blocking info before UAC prompt
        try {
            showInfo(msg('comRegRequired'));
        } catch (_) { /* ignore if common.js not ready */ }

        // Trigger registration (UAC prompt appears here)
        const result = await this._initComService(stataPath, true);
        if (result.success) {
            // Persist the successfully registered path
            await context.globalState.update(GLOBAL_STATE_KEY, stataPath);
            return true;
        }

        // Registration failed — mark unavailable for this session
        this._comUnavailable = true;
        this._killProcess();
        showWarn(msg('comInitFailed'));
        return false;
    }

    /**
     * Send Stata code asynchronously via DoCommandAsync.
     * Splits code > 8192 chars into chunks at newline boundaries.
     *
     * @param {string} code - Stata code to execute
     * @returns {Promise<object>} { success, errorCode?, error? }
     */
    async execute(code) {
        if (!this._initialized) {
            return { success: false, error: 'COM service not initialized' };
        }
        if (!this._childProcess) {
            return { success: false, error: 'COM child process not running' };
        }

        const chunks = this._splitCode(code);
        let lastResult = null;

        for (const chunk of chunks) {
            lastResult = await this._sendRequest({
                action: 'execute',
                command: chunk
            });
            if (!lastResult.success) {
                break;
            }
        }

        return lastResult;
    }

    /**
     * Get Stata free/busy status.
     */
    async status() {
        if (!this._initialized) {
            return { isFree: false, returnCode: -1 };
        }
        return await this._sendRequest({ action: 'status' });
    }

    /**
     * Poll UtilIsStataFree() until Stata finishes executing,
     * then bring all windows to foreground.
     * This ensures Graph windows (created during do-file execution) are visible.
     *
     * @param {number} timeoutMs - max wait time (default 60s)
     */
    async waitAndForeground(timeoutMs = 60000) {
        await this._waitUntilFree(timeoutMs);
        return await this.foreground();
    }

    /**
     * Bring Stata window to foreground.
     */
    async foreground() {
        if (!this._initialized) {
            return { success: false };
        }
        return await this._sendRequest({ action: 'foreground' });
    }

    /**
     * Break current Stata execution.
     */
    async break() {
        if (!this._initialized) {
            return { success: false };
        }
        return await this._sendRequest({ action: 'break' });
    }

    /**
     * Shutdown the COM service and release resources.
     */
    shutdown() {
        this._initialized = false;
        this._killProcess();
        // Reject all pending promises
        this._pending.forEach(({ reject, timer }) => {
            clearTimeout(timer);
            reject(new Error('COM service shutdown'));
        });
        this._pending.clear();
        _comServiceInstance = null;
    }

    // ── State queries ───────────────────────────────────────

    isInitialized() {
        return this._initialized;
    }

    isUnavailable() {
        return this._comUnavailable;
    }

    markUnavailable() {
        this._comUnavailable = true;
    }

    // ── Private methods ─────────────────────────────────────

    async _waitUntilFree(timeoutMs) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const s = await this.status();
            if (s.isFree) {
                return true;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        return false;
    }

    /**
     * Internal: spawn PS process and send init command.
     * @param {string} stataPath
     * @param {boolean} doRegister - whether to run /Register first
     */
    async _initComService(stataPath, doRegister) {
        // Kill any existing process first
        this._killProcess();

        const psScript = path.join(
            this._extensionPath, 'scripts', 'stata_com_service.ps1'
        );

        this._childProcess = spawn('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', psScript,
            '-stataPath', stataPath
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
        });

        this._childProcess.stdout.on('data', (data) => {
            this._handleStdout(data.toString());
        });

        this._childProcess.stderr.on('data', (data) => {
            // PS diagnostic messages come via stderr
            const text = data.toString().trim();
            if (text) {
                console.log('[StataComService] ' + text);
            }
        });

        this._childProcess.on('exit', (code) => {
            console.log(`[StataComService] PS process exited with code ${code}`);
            this._initialized = false;
            // Reject pending requests on unexpected exit
            this._pending.forEach(({ reject, timer }) => {
                clearTimeout(timer);
                reject(new Error(`PS process exited (code ${code})`));
            });
            this._pending.clear();
        });

        // Wait for "ready" signal from PS
        try {
            await this._waitForReady(15000);
        } catch (err) {
            console.error('[StataComService] PS ready timeout:', err.message);
            this._killProcess();
            return { success: false, error: 'PowerShell process startup timed out' };
        }

        // Send init command to PS
        try {
            const result = await this._sendRequest(
                { action: 'init', doRegister },
                120000  // 120s timeout for init (includes UAC wait)
            );
            if (result && result.success) {
                this._initialized = true;
                return { success: true };
            }
            return { success: false, error: result ? result.error : 'Init returned null' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Wait for the PS process to emit a {"ready":true} JSON line.
     */
    _waitForReady(timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timed out waiting for PS ready signal'));
            }, timeoutMs);

            const onData = (data) => {
                this._lineBuffer += data.toString();
                const lines = this._lineBuffer.split('\n');
                this._lineBuffer = lines.pop(); // keep incomplete final segment

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const msg = JSON.parse(trimmed);
                        if (msg.ready) {
                            clearTimeout(timer);
                            this._childProcess.stdout.removeListener('data', onData);
                            resolve();
                            return;
                        }
                    } catch (_) { /* not JSON, ignore */ }
                }
            };

            this._childProcess.stdout.on('data', onData);
        });
    }

    /**
     * Send a JSON-line request and return a Promise for the response.
     * @param {object} payload - request object (id is auto-assigned)
     * @param {number} timeoutMs - timeout in ms (default 60000)
     */
    _sendRequest(payload, timeoutMs = 60000) {
        return new Promise((resolve, reject) => {
            if (!this._childProcess || !this._childProcess.stdin) {
                reject(new Error('Child process stdin is not available'));
                return;
            }

            const id = ++this._requestId;
            payload.id = id;

            console.log('[StataComService] Sending request #' + id +
                ' action=' + payload.action +
                (payload.command ? ' cmdLen=' + payload.command.length : ''));

            const timer = setTimeout(() => {
                this._pending.delete(id);
                console.error('[StataComService] Request #' + id + ' TIMED OUT');
                reject(new Error(`Request #${id} timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this._pending.set(id, { resolve, reject, timer });

            try {
                this._childProcess.stdin.write(
                    JSON.stringify(payload) + '\n'
                );
            } catch (err) {
                clearTimeout(timer);
                this._pending.delete(id);
                console.error('[StataComService] Failed to write to stdin:', err.message);
                reject(err);
            }
        });
    }

    /**
     * Handle stdout data from PS process.
     * Accumulates into line buffer, dispatches complete JSON lines
     * to matching pending requests by id.
     */
    _handleStdout(data) {
        this._lineBuffer += data;
        const lines = this._lineBuffer.split('\n');
        this._lineBuffer = lines.pop(); // keep incomplete final segment

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                const response = JSON.parse(trimmed);
                // Ignore ready signal in normal operation
                if (response.ready) continue;

                const id = response.id;
                if (id !== undefined && this._pending.has(id)) {
                    const { resolve, timer } = this._pending.get(id);
                    clearTimeout(timer);
                    this._pending.delete(id);
                    console.log('[StataComService] Response #' + id +
                        ' success=' + response.success +
                        (response.error ? ' error=' + response.error : ''));
                    resolve(response);
                }
            } catch (_) {
                // Non-JSON output from PS — ignore
            }
        }
    }

    /**
     * Split code into chunks ≤ STATA_COM_MAX_COMMAND_LENGTH chars,
     * breaking on newline boundaries to preserve syntax.
     */
    _splitCode(code) {
        if (code.length <= STATA_COM_MAX_COMMAND_LENGTH) {
            return [code];
        }

        const chunks = [];
        const lines = code.split('\n');
        let current = '';

        for (const line of lines) {
            const candidate = current ? current + '\n' + line : line;
            if (candidate.length > STATA_COM_MAX_COMMAND_LENGTH) {
                if (current) {
                    chunks.push(current);
                }
                // If a single line exceeds the limit, hard-chop it
                if (line.length > STATA_COM_MAX_COMMAND_LENGTH) {
                    let remaining = line;
                    while (remaining.length > STATA_COM_MAX_COMMAND_LENGTH) {
                        chunks.push(
                            remaining.substring(0, STATA_COM_MAX_COMMAND_LENGTH)
                        );
                        remaining = remaining.substring(
                            STATA_COM_MAX_COMMAND_LENGTH
                        );
                    }
                    current = remaining;
                } else {
                    current = line;
                }
            } else {
                current = candidate;
            }
        }

        if (current) {
            chunks.push(current);
        }

        return chunks;
    }

    /**
     * Kill the PS child process and clean up.
     */
    _killProcess() {
        const oldProcess = this._childProcess;
        if (oldProcess) {
            // Best-effort graceful shutdown
            try {
                oldProcess.stdin.write(
                    JSON.stringify({ id: 0, action: 'shutdown' }) + '\n'
                );
            } catch (_) { /* stdin might already be closed */ }

            // Force kill after a short grace period
            // Capture the reference to avoid killing a newly spawned process
            setTimeout(() => {
                try {
                    if (oldProcess && !oldProcess.killed) {
                        oldProcess.kill();
                    }
                } catch (_) { /* process may already be dead */ }
            }, 2000);
        }

        this._childProcess = null;
        this._initialized = false;
    }
}

/**
 * Get or create the COM service singleton.
 * @param {string} extensionPath - extension root path
 * @returns {StataComService}
 */
function getComService(extensionPath) {
    if (!_comServiceInstance) {
        _comServiceInstance = new StataComService(extensionPath);
    }
    return _comServiceInstance;
}

module.exports = {
    StataComService,
    getComService
};
