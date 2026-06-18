/**
 * Stata AI Skill - HTTP Server
 * 在 VS Code 扩展内启动 localhost HTTP 服务，让 AI 编程工具通过 curl 执行 Stata 代码
 * 依赖：sharp（SVG→PNG 转换，可选）
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

let sharp;
try {
    sharp = require('sharp');
} catch (_) {
    // sharp is optional; if not installed, PNG conversion is skipped
}

let server = null;
let consoleSession = null;
let serverPort = 19521;
let workspaceRoot = null;
let isExecuting = false;

const TEMP_DO_FILENAME = 'stata_ai_skill_temp.do';
const STATA_TEMP_DIR = '.stata-all-in-one';
const MAX_TEMP_FILES = 10;
const AI_SKILL_SERVICE = 'stata-all-in-one-ai-skill';
const AI_SKILL_VERSION = '202606131204';

// Timeout defaults (seconds): normal commands vs long-running jobs
const DEFAULT_TIMEOUT_SEC = 30;        // 30s for normal commands
const MAX_TIMEOUT_SEC = 600;           // 10min hard cap

/**
 * Execute Stata code with timeout. On timeout, interrupts Stata via setBreak.
 *
 * CRITICAL: After calling stop(), we MUST await the original execPromise so the
 * C++ native module's TSFN (ThreadSafeFunction) callback has a valid JS Promise
 * to resolve into.  Abandoning the Promise via Promise.race alone causes the
 * C++ callback to fire into a torn-down context, crashing the Node.js process
 * on both Windows and macOS.
 *
 * @param {string} stataCode
 * @param {boolean} echo
 * @param {number} timeoutSec
 * @returns {Promise<object>}
 */
async function executeWithTimeout(stataCode, echo, timeoutSec) {
    const execPromise = consoleSession.execute(stataCode, echo);
    if (!timeoutSec || timeoutSec <= 0) {
        return await execPromise;
    }
    const capped = Math.min(timeoutSec, MAX_TIMEOUT_SEC);
    const timeoutMs = capped * 1000;

    let timedOut = false;
    let timerId;

    const timeoutPromise = new Promise((resolve) => {
        timerId = setTimeout(() => {
            timedOut = true;
            consoleSession.stop();
            resolve();
        }, timeoutMs);
    });

    // Race: normal completion vs timeout.  When execPromise wins we simply
    // clear the timer and return the result.
    const result = await Promise.race([execPromise, timeoutPromise]);
    clearTimeout(timerId);

    if (timedOut) {
        // The timeout fired and called stop().  We must now drain execPromise
        // so the C++ TSFN callback lands safely — StataSO_Execute returns
        // after processing the break signal set by stop().
        try {
            await execPromise;
        } catch (_) {
            // The interrupted execution may return an error (rc=1); ignore it.
        }
        throw Object.assign(
            new Error(`执行超时（${capped}s）`),
            { isTimeout: true }
        );
    }

    return result;
}

/**
 * Normalize Stata code: strip ". " prefixes, normalize line endings
 * @param {string} code
 * @returns {string}
 */
function normalizeCode(code) {
    return String(code || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.replace(/^\s*\.\s?/, ''))
        .join('\n')
        .trim();
}

/**
 * Check if code contains multiple lines
 * @param {string} code
 * @returns {boolean}
 */
function isMultiLine(code) {
    return String(code || '').replace(/\r\n/g, '\n').split('\n').filter(l => l.trim()).length > 1;
}

/**
 * Strip "graph export ..." lines from user code.
 * graph export is handled automatically by the server; user-invoked
 * graph export (especially .png) hangs Stata without a display server.
 * @param {string} code
 * @returns {{ code: string, removed: string[] }}
 */
function stripGraphExport(code) {
    const lines = String(code || '').split('\n');
    const kept = [];
    const removed = [];
    for (const line of lines) {
        if (/^\s*(\.\s?)?(quietly\s+)?graph\s+export\b/i.test(line)) {
            removed.push(line.trim());
        } else {
            kept.push(line);
        }
    }
    return { code: kept.join('\n'), removed };
}

/**
 * Clean up old temp files in .stata-all-in-one/ directory.
 * Keeps only the latest MAX_TEMP_FILES files per format (extension).
 * Called automatically after each /execute request.
 * Called automatically after each /execute request.
 */
function cleanupStataTempFiles() {
    if (!workspaceRoot) return;
    const dir = path.join(workspaceRoot, STATA_TEMP_DIR);
    if (!fs.existsSync(dir)) return;

    try {
        const allFiles = fs.readdirSync(dir)
            .map(f => {
                const fullPath = path.join(dir, f);
                try {
                    const stat = fs.statSync(fullPath);
                    if (!stat.isFile()) return null;
                    return { name: f, path: fullPath, mtime: stat.mtimeMs, ext: path.extname(f).toLowerCase() };
                } catch (_) {
                    return null;
                }
            })
            .filter(Boolean);

        // Group by extension, keep latest MAX_TEMP_FILES per format
        const byExt = {};
        for (const f of allFiles) {
            if (!byExt[f.ext]) byExt[f.ext] = [];
            byExt[f.ext].push(f);
        }
        for (const [ext, files] of Object.entries(byExt)) {
            files.sort((a, b) => b.mtime - a.mtime);
            for (const file of files.slice(MAX_TEMP_FILES)) {
                try {
                    fs.unlinkSync(file.path);
                    console.log(`Stata All in One: [AI Skill] 🧹 Cleaned up old ${ext} file: ${file.name}`);
                } catch (_) { /* ignore per-file errors */ }
            }
        }
    } catch (_) { /* ignore directory read errors */ }
}

/**
 * Parse graph names from Stata's _gr_list list output.
 * @param {string} output - Raw output from display "`r(_grlist)'"
 * @returns {string[]}
 */
function parseGraphNames(output) {
    const names = String(output || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split(/\s+/)
        .map(item => item.trim())
        .filter(item => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item));
    return Array.from(new Set(names));
}

/**
 * Export captured Stata graphs to .stata-all-in-one/ as SVG files.
 * Called after each /execute to automatically save any graphs the user's code generated.
 * @returns {Promise<Array<{name: string, path: string}>>}
 */
async function exportCapturedGraphs() {
    if (!workspaceRoot) return [];

    try {
        // Get list of captured graphs
        await consoleSession.execute('quietly _gr_list list', false);
        const displayResult = await consoleSession.execute('display "`r(_grlist)\'"', false);
        const graphNames = parseGraphNames(displayResult && displayResult.output || '');
        if (!graphNames.length) return [];

        // Ensure output directory exists
        const outDir = path.join(workspaceRoot, STATA_TEMP_DIR);
        fs.mkdirSync(outDir, { recursive: true });

        const exported = [];
        const runId = Date.now();

        for (let i = 0; i < graphNames.length; i++) {
            const graphName = graphNames[i];
            const safeName = String(graphName).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'graph';
            const svgPath = path.join(outDir, `${safeName}_${runId}_${i}.svg`);
            const pngPath = path.join(outDir, `${safeName}_${runId}_${i}.png`);

            try {
                // Step 1: Export as SVG from Stata (works without display server)
                const escapedSvgPath = String(svgPath).replace(/"/g, '""');
                const cmd = `quietly graph export "${escapedSvgPath}", name(${graphName}) replace`;
                const exportResult = await consoleSession.execute(cmd, false);

                if (!exportResult || !exportResult.success || !fs.existsSync(svgPath) || fs.statSync(svgPath).size === 0) {
                    continue;
                }
                console.log(`Stata All in One: [AI Skill] 📊 Exported graph "${graphName}" → ${path.basename(svgPath)}`);

                // Step 2: Convert SVG to PNG using sharp (cross-platform, no display server needed)
                let pngOk = false;
                if (sharp) {
                    try {
                        await sharp(svgPath).png().toFile(pngPath);
                        pngOk = fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0;
                    } catch (_) { /* sharp conversion failed, SVG is still available */ }
                }

                exported.push({
                    name: graphName,
                    svg: svgPath,
                    png: pngOk ? pngPath : null
                });

            } catch (_) { /* skip failed exports */ }
        }

        // Clear graph list to free memory
        try { await consoleSession.execute('quietly _gr_list clear', false); } catch (_) { /* ignore */ }

        return exported;
    } catch (_) {
        return [];
    }
}

/**
 * 读取 HTTP 请求体
 * @param {http.IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', err => reject(err));
    });
}

/**
 * Check whether an occupied port is already serving this AI Skill.
 * This lets multiple VS Code windows reuse the first server instead of
 * stealing the port from each other.
 * @param {number} port
 * @returns {Promise<object|null>}
 */
function getExistingAISkillServerStatus(port) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            resolve(value);
        };

        const req = http.get({
            hostname: '127.0.0.1',
            port,
            path: '/status',
            timeout: 1000
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const explicitMatch = data && data.service === AI_SKILL_SERVICE && data.status === 'running';
                    // Compatibility with older extension versions before the
                    // service marker existed.
                    const legacyMatch = data && data.status === 'running'
                        && typeof data.message === 'string'
                        && data.message.includes('Stata');
                    finish(explicitMatch || legacyMatch ? data : null);
                } catch (_) {
                    finish(false);
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            finish(false);
        });
        req.on('error', () => finish(false));
    });
}

async function isExistingAISkillServer(port) {
    const status = await getExistingAISkillServerStatus(port);
    return Boolean(status && status.sessionActive === true);
}

function releaseInactiveAISkillServer(port) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: '/release-if-inactive',
            method: 'POST',
            timeout: 1000
        }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode === 200));
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.on('error', () => resolve(false));
        req.end();
    });
}

/**
 * Free a port only when it is not already owned by this AI Skill server.
 * @param {number} port
 * @returns {boolean}
 */
function killProcessOnPort(port) {
    try {
        const { execSync } = require('child_process');
        if (process.platform === 'win32') {
            const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
            const pid = (out.match(/LISTENING\s+(\d+)/) || [])[1];
            if (pid) execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } else {
            execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null; true`, { stdio: 'ignore' });
        }
        return true;
    } catch (e) {
        console.error(`Stata All in One: [AI Skill] ❌ Failed to free port ${port}:`, e.message);
        return false;
    }
}

/**
 * 处理 HTTP 请求
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handleRequest(req, res) {
    // CORS 头 —— 允许来自任何工具的请求
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // GET /status —— 健康检查
    if (req.method === 'GET' && req.url === '/status') {
        const sessionActive = consoleSession && consoleSession.isInitialized();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            service: AI_SKILL_SERVICE,
            skillVersion: AI_SKILL_VERSION,
            status: 'running',
            sessionActive: sessionActive,
            busy: isExecuting,
            message: sessionActive
                ? (isExecuting ? 'Stata is busy executing' : 'Stata session is active')
                : 'Stata session not initialized. Open a .do file in VS Code first.'
        }));
        return;
    }

    // Allow another VS Code window to take over the configured port only when
    // this server no longer has a usable Stata session.
    if (req.method === 'POST' && req.url === '/release-if-inactive') {
        const sessionActive = consoleSession && consoleSession.isInitialized();
        if (sessionActive) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Stata session is still active' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        setImmediate(() => stopServer());
        return;
    }

    // POST /execute —— 执行 Stata 代码或 .do 文件
    if (req.method === 'POST' && req.url === '/execute') {
        try {
            const body = await readBody(req);
            const requestData = JSON.parse(body);
            const code = requestData.code || '';
            const doFile = requestData.file || '';

            if (!code.trim() && !doFile.trim()) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, output: '', error: 'Provide "code" or "file" in JSON body.' }));
                return;
            }

            if (!consoleSession || !consoleSession.isInitialized()) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, output: '', error: 'Stata session not initialized. Open a .do file in VS Code first.' }));
                return;
            }

            const echo = requestData.echo !== undefined ? requestData.echo : false;
            const timeout = requestData.timeout !== undefined ? parseInt(requestData.timeout, 10) : DEFAULT_TIMEOUT_SEC;
            let stataCode;
            let tempFilePath = null;
            let graphExportStripped = [];

            if (doFile) {
                // Explicit .do file path
                stataCode = `do "${doFile.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            } else if (isMultiLine(code)) {
                // Strip graph export lines before writing temp .do file
                const stripped = stripGraphExport(code);
                graphExportStripped = stripped.removed;
                const normalized = normalizeCode(stripped.code);
                tempFilePath = path.join(os.tmpdir(), TEMP_DO_FILENAME);
                fs.writeFileSync(tempFilePath, normalized, 'utf8');
                stataCode = `do "${tempFilePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            } else {
                // Single-line: strip if it's a graph export command
                const stripped = stripGraphExport(code);
                graphExportStripped = stripped.removed;
                if (!stripped.code.trim()) {
                    // Entire code was a graph export line — nothing to execute
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true, returnCode: 0,
                        output: '[Stata All in One] graph export 命令已禁用。图形由服务器自动导出，请查看 graphs 字段获取文件路径。',
                        error: '', graphs: []
                    }));
                    return;
                }
                stataCode = normalizeCode(stripped.code);
            }

            console.log('Stata All in One: [AI Skill] Execute:', doFile ? `do "${doFile}"` : (tempFilePath ? `do "${tempFilePath}" (${code.split('\n').filter(l => l.trim()).length} lines)` : code.substring(0, 80)));
            if (graphExportStripped.length) {
                console.log(`Stata All in One: [AI Skill] ⚠️ Stripped ${graphExportStripped.length} graph export line(s):`, graphExportStripped);
            }
            isExecuting = true;
            const result = await executeWithTimeout(stataCode, echo, timeout);
            isExecuting = false;

            // Clean up temp file after execution
            if (tempFilePath) {
                try { fs.unlinkSync(tempFilePath); } catch (_) { /* ignore */ }
            }

            // Export any graphs the user's code generated (SVG + PNG via sharp)
            const graphs = result.success ? await exportCapturedGraphs() : [];

            // Build output with auto-graph note for the agent
            let output = result.output || '';
            const notes = [];
            if (graphExportStripped.length) {
                notes.push(`graph export 命令已禁用：${graphExportStripped.join('; ')}。图形由服务器自动导出。`);
            }
            if (graphs.length) {
                notes.push(`图形已自动保存：${graphs.map(g => g.png || g.svg).join(', ')}`);
            }
            if (notes.length) {
                output = output + '\n\n[Stata All in One] ' + notes.join(' ');
            }

            const statusCode = result.success ? 200 : 500;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: result.success,
                returnCode: result.returnCode,
                output: output,
                error: result.error || '',
                graphs: graphs
            }));

            // Auto-cleanup old temp files after each execution
            cleanupStataTempFiles();
        } catch (err) {
            isExecuting = false;
            if (err && err.isTimeout) {
                console.error('Stata All in One: [AI Skill] Execution timed out:', err.message);
                // Still try to export any graphs generated before the timeout
                let graphs = [];
                try { graphs = await exportCapturedGraphs(); } catch (_) { /* ignore */ }
                res.writeHead(408, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false, returnCode: -1,
                    output: err.message + '\n建议：对于长时间运行的命令（如 bootstrap、大型回归），设置 "timeout" 参数延长超时时间（单位秒），例如 {"timeout": 300} 表示 5 分钟。',
                    error: err.message,
                    graphs: graphs
                }));
                cleanupStataTempFiles();
                return;
            }
            console.error('Stata All in One: [AI Skill] Execute error:', err.message);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, output: '', error: 'Invalid request: ' + (err.message || 'Unknown error') }));
        }
        return;
    }

    // POST /break —— 中断当前 Stata 执行（不关闭服务器）
    if (req.method === 'POST' && req.url === '/break') {
        if (!consoleSession || !consoleSession.isInitialized()) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'No active Stata session' }));
            return;
        }
        const stopped = consoleSession.stop();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: stopped, message: stopped ? 'Break signal sent' : 'Failed to send break' }));
        console.log('Stata All in One: [AI Skill] ⏸ Break requested by agent');
        return;
    }

    // POST /shutdown —— 关闭服务器（仅 VS Code 内部命令调用，不暴露给 agent）
    // 该端点已移除对外访问，服务器只能通过 VS Code 命令关闭
    // if (req.method === 'POST' && req.url === '/shutdown') { ... }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        success: false,
        error: 'Not Found. Available endpoints: GET /status, POST /execute, POST /break'
    }));
}

/**
 * 启动 HTTP 服务器
 * @param {object} session - StataConsoleSession 实例
 * @param {number} port - 监听端口，默认 19521
 * @returns {Promise<boolean>}
 */
function startServer(session, port, wsRoot) {
    return new Promise((resolve) => {
        if (server) {
            // 已经在运行
            resolve(true);
            return;
        }

        if (!session || !session.isInitialized()) {
            console.error('Stata All in One: [AI Skill] Cannot start server: Stata session not initialized');
            resolve(false);
            return;
        }

        consoleSession = session;
        serverPort = port || 19521;
        workspaceRoot = wsRoot || null;

        const listen = (reclaimed = false, reclaimAttempted = false) => {
            server = http.createServer(handleRequest);
            server.on('error', async (err) => {
                server = null;

                if (err.code === 'EADDRINUSE') {
                    const existingStatus = await getExistingAISkillServerStatus(serverPort);
                    if (existingStatus && existingStatus.sessionActive === true) {
                        console.log(`Stata All in One: [AI Skill] Reusing existing AI Skill server on http://127.0.0.1:${serverPort}`);
                        resolve(true);
                        return;
                    }

                    if (existingStatus) {
                        const released = await releaseInactiveAISkillServer(serverPort);
                        if (released && !reclaimAttempted) {
                            setTimeout(() => listen(true, true), 200);
                        } else {
                            console.error(`Stata All in One: [AI Skill] Existing inactive AI Skill server on port ${serverPort} could not release the port.`);
                            resolve(false);
                        }
                        return;
                    }

                    console.log(`Stata All in One: [AI Skill] Port ${serverPort} is occupied by another process; reclaiming it...`);
                    if (reclaimAttempted) {
                        console.error(`Stata All in One: [AI Skill] Port ${serverPort} is still occupied after reclaim attempt.`);
                        resolve(false);
                        return;
                    }

                    if (killProcessOnPort(serverPort)) {
                        setTimeout(() => {
                            listen(true, true);
                        }, 800);
                    } else {
                        resolve(false);
                    }
                } else {
                    console.error('Stata All in One: [AI Skill] Server error:', err.message);
                    resolve(false);
                }
            });

            server.listen(serverPort, '127.0.0.1', () => {
                const suffix = reclaimed ? ' (reclaimed port)' : '';
                console.log(`Stata All in One: [AI Skill] ✅ HTTP server started on http://127.0.0.1:${serverPort}${suffix}`);
                console.log(`Stata All in One: [AI Skill]    Status:  curl http://127.0.0.1:${serverPort}/status`);
                console.log(`Stata All in One: [AI Skill]    Execute: curl -X POST http://127.0.0.1:${serverPort}/execute -H "Content-Type: application/json" -d '{"code":"display 2+2"}'`);
                resolve(true);
            });
        };

        try {
            listen();
        } catch (err) {
            console.error('Stata All in One: [AI Skill] Failed to start server:', err.message);
            server = null;
            resolve(false);
        }
    });
}

/**
 * 停止 HTTP 服务器
 */
function stopServer() {
    if (server) {
        console.log('Stata All in One: [AI Skill] Stopping HTTP server...');
        server.close();
        server = null;
        consoleSession = null;
        console.log('Stata All in One: [AI Skill] Server stopped');
        return true;
    }
    return false;
}

/**
 * 检查服务器是否在运行
 * @returns {boolean}
 */
function isServerRunning() {
    return server !== null;
}

/**
 * 获取服务器端口
 * @returns {number|null}
 */
function getServerPort() {
    return server ? serverPort : null;
}

module.exports = {
    startServer,
    stopServer,
    isServerRunning,
    getServerPort,
    isExistingAISkillServer,
    getExistingAISkillServerStatus,
    releaseInactiveAISkillServer
};
