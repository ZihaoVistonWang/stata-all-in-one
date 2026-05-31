/**
 * Stata AI Skill - HTTP Server
 * 在 VS Code 扩展内启动 localhost HTTP 服务，让 AI 编程工具通过 curl 执行 Stata 代码
 * 零外部依赖 —— 只使用 Node.js 内置 http 模块（VS Code / Electron 自带）
 */

const http = require('http');

let server = null;
let consoleSession = null;
let serverPort = 19521;

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
            status: 'running',
            sessionActive: sessionActive,
            message: sessionActive
                ? 'Stata session is active'
                : 'Stata session not initialized. Open a .do file in VS Code first.'
        }));
        return;
    }

    // POST /execute —— 执行 Stata 代码
    if (req.method === 'POST' && req.url === '/execute') {
        try {
            const body = await readBody(req);
            const requestData = JSON.parse(body);
            const code = requestData.code || '';

            if (!code.trim()) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    output: '',
                    error: 'No code provided. Please include a "code" field in the JSON body.'
                }));
                return;
            }

            if (!consoleSession || !consoleSession.isInitialized()) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    output: '',
                    error: 'Stata session not initialized. Open a .do file in VS Code to activate Stata first.'
                }));
                return;
            }

            // 调用已有 StataConsoleSession 执行代码
            const echo = requestData.echo !== undefined ? requestData.echo : false;
            const result = await consoleSession.execute(code, echo);

            const statusCode = result.success ? 200 : 500;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: result.success,
                returnCode: result.returnCode,
                output: result.output || '',
                error: result.error || ''
            }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                output: '',
                error: 'Invalid request: ' + (err.message || 'Unknown error')
            }));
        }
        return;
    }

    // POST /shutdown —— 关闭服务器
    if (req.method === 'POST' && req.url === '/shutdown') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Server shutting down' }));
        stopServer();
        return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        success: false,
        error: 'Not Found. Available endpoints: GET /status, POST /execute, POST /shutdown'
    }));
}

/**
 * 启动 HTTP 服务器
 * @param {object} session - StataConsoleSession 实例
 * @param {number} port - 监听端口，默认 19521
 * @returns {Promise<boolean>}
 */
function startServer(session, port) {
    return new Promise((resolve) => {
        if (server) {
            // 已经在运行
            resolve(true);
            return;
        }

        if (!session || !session.isInitialized()) {
            console.error('[Stata AI Skill] Cannot start server: Stata session not initialized');
            resolve(false);
            return;
        }

        consoleSession = session;
        serverPort = port || 19521;

        try {
            server = http.createServer(handleRequest);
            server.on('error', (err) => {
                console.error('[Stata AI Skill] Server error:', err.message);
                server = null;
                resolve(false);
            });

            server.listen(serverPort, '127.0.0.1', () => {
                console.log(`[Stata AI Skill] ✅ HTTP server started on http://127.0.0.1:${serverPort}`);
                console.log(`[Stata AI Skill]    Status:  curl http://127.0.0.1:${serverPort}/status`);
                console.log(`[Stata AI Skill]    Execute: curl -X POST http://127.0.0.1:${serverPort}/execute -H "Content-Type: application/json" -d '{"code":"display 2+2"}'`);
                resolve(true);
            });
        } catch (err) {
            console.error('[Stata AI Skill] Failed to start server:', err.message);
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
        console.log('[Stata AI Skill] Stopping HTTP server...');
        server.close();
        server = null;
        consoleSession = null;
        console.log('[Stata AI Skill] Server stopped');
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
    getServerPort
};
