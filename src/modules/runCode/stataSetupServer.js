const crypto = require('crypto');
const http = require('http');

const capability = require('../capability');
const config = require('../../utils/config');
const { version: extensionVersion } = require('../../../package.json');

const HOST = '127.0.0.1';
const PORT_START = 16886;
const PORT_END = 16895;
const PROTOCOL_VERSION = 1;
const SERVICE_NAME = 'stata-all-in-one-setup';
const MAX_URL_LENGTH = 8192;
const MAX_FIELD_LENGTH = 4096;

function cleanLineValue(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/[\r\n]/g, ' ');
}

function editionFromVersion(version) {
    const match = String(version || '').match(/^Stata(MP|SE|BE|IC)$/i);
    return match ? match[1].toUpperCase() : '';
}

function stataTextResponse(fields) {
    return [
        `SAIO/${PROTOCOL_VERSION}`,
        ...Object.entries(fields).map(([key, value]) => `${key}=${cleanLineValue(value)}`),
        ''
    ].join('\n');
}

function normalizeStataPlatform(osName, machineType = '') {
    const normalized = String(osName || '').toLowerCase();
    const normalizedMachine = String(machineType || '').toLowerCase();
    if (normalized.includes('windows')) return 'win32';
    if (normalized.includes('mac')) return 'darwin';
    // Console-backed Stata reports c(os) as "Unix" on macOS. Its machine
    // type remains explicitly Mac, so retain host validation without
    // rejecting a legitimate native Console request.
    if (normalized === 'unix' && normalizedMachine.includes('mac')) return 'darwin';
    return normalized;
}

function rawQueryBytes(rawValue) {
    const bytes = [];
    const encoder = new TextEncoder();
    for (let index = 0; index < rawValue.length;) {
        if (/^[0-9a-f]{2}$/i.test(rawValue.slice(index + 1, index + 3)) && rawValue[index] === '%') {
            bytes.push(Number.parseInt(rawValue.slice(index + 1, index + 3), 16));
            index += 3;
            continue;
        }
        const character = rawValue[index] === '+' ? ' ' : rawValue[index];
        bytes.push(...encoder.encode(character));
        index++;
    }
    return Uint8Array.from(bytes);
}

function decodeQueryValueCandidates(requestUrl, field, platform) {
    const query = String(requestUrl || '').split('?', 2)[1] || '';
    const part = query.split('&').find(item => item.split('=', 1)[0] === field);
    if (!part) return [];
    const rawValue = part.slice(part.indexOf('=') + 1);
    const bytes = rawQueryBytes(rawValue);
    const encodings = platform === 'win32'
        ? ['utf-8', 'gbk', 'big5', 'shift_jis', 'euc-kr', 'windows-1252']
        : ['utf-8'];
    const values = [];
    for (const encoding of encodings) {
        try {
            const value = new TextDecoder(encoding, { fatal: true }).decode(bytes);
            if (!values.includes(value)) values.push(value);
        } catch {
            // The byte sequence does not belong to this encoding.
        }
    }
    return values;
}

class StataSetupServer {
    constructor(context, onSetup, options = {}) {
        this.context = context;
        this.onSetup = onSetup;
        this.host = options.host || HOST;
        this.portStart = options.portStart || PORT_START;
        this.portEnd = options.portEnd || PORT_END;
        this.http = options.http || http;
        this.randomBytes = options.randomBytes || crypto.randomBytes;
        this.platform = options.platform || process.platform;
        this.config = options.config || config;
        this.capability = options.capability || capability;
        this.extensionVersion = options.extensionVersion || extensionVersion;
        this.server = null;
        this.port = null;
        this.setupToken = null;
        this.installSession = null;
    }

    async start() {
        if (this.server) return this.port;
        for (let port = this.portStart; port <= this.portEnd; port++) {
            try {
                await this._listen(port);
                this.port = port;
                console.log(`Stata All in One: setup service listening on http://${this.host}:${port}`);
                return port;
            } catch (error) {
                if (error.code !== 'EADDRINUSE') throw error;
            }
        }
        throw new Error(`No available Stata setup port in ${this.portStart}-${this.portEnd}.`);
    }

    _listen(port) {
        return new Promise((resolve, reject) => {
            const server = this.http.createServer((request, response) => {
                this._handleRequest(request, response).catch(error => {
                    console.error('Stata All in One: setup request failed:', error.message);
                    if (!response.headersSent) {
                        this._sendText(response, error.statusCode || 500, {
                            success: 0,
                            code: error.code || 'INTERNAL_ERROR',
                            message: error.message
                        });
                    } else {
                        response.end();
                    }
                });
            });
            const onError = error => {
                server.removeListener('listening', onListening);
                try { server.close(); } catch { /* no-op */ }
                reject(error);
            };
            const onListening = () => {
                server.removeListener('error', onError);
                this.server = server;
                resolve();
            };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(port, this.host);
        });
    }

    async stop() {
        if (!this.server) return;
        const server = this.server;
        this.server = null;
        this.port = null;
        this.setupToken = null;
        this.installSession = null;
        await new Promise(resolve => server.close(resolve));
    }

    dispose() {
        this.stop().catch(error => {
            console.error('Stata All in One: failed to stop setup service:', error.message);
        });
    }

    _currentStatus() {
        const isWindows = this.platform === 'win32';
        const configuredVersion = isWindows ? '' : String(this.config.getStataVersion() || '').trim();
        const configuredPath = isWindows
            ? String(this.config.getStataPathOnWindows() || '').trim()
            : String(this.context.globalState.get('stataGuiAppPath') || '').trim();
        const configured = isWindows ? Boolean(configuredPath) : Boolean(configuredVersion);
        return {
            service: SERVICE_NAME,
            protocolVersion: PROTOCOL_VERSION,
            status: 'ready',
            extensionVersion: this.extensionVersion,
            port: this.port,
            setupToken: this.setupToken,
            configured: configured ? 1 : 0,
            platform: this.platform,
            installationPath: configuredPath,
            stataEdition: isWindows ? this._windowsEdition(configuredPath) : editionFromVersion(configuredVersion),
            runMode: this.config.getRunMode(),
            capability: this.capability.getCapabilityState()
        };
    }

    _windowsEdition(executablePath) {
        const match = String(executablePath || '').match(/Stata(MP|SE|BE|IC)/i);
        return match ? match[1].toUpperCase() : '';
    }

    _newToken() {
        this.setupToken = this.randomBytes(24).toString('hex');
        return this.setupToken;
    }

    beginInstallSession(onResult) {
        if (!this.server || !this.port) {
            throw new Error('The Stata setup service is not running.');
        }
        const token = this.randomBytes(24).toString('hex');
        const session = { token, onResult };
        this.installSession = session;
        return {
            port: this.port,
            token,
            dispose: () => {
                if (this.installSession === session) this.installSession = null;
            }
        };
    }

    _validateRequest(request) {
        if (request.method !== 'GET') {
            const error = new Error('Only GET requests are supported.');
            error.statusCode = 405;
            error.code = 'METHOD_NOT_ALLOWED';
            throw error;
        }
        if (String(request.url || '').length > MAX_URL_LENGTH) {
            const error = new Error('Request URL is too long.');
            error.statusCode = 414;
            error.code = 'URL_TOO_LONG';
            throw error;
        }
        const expectedHost = `${this.host}:${this.port}`;
        if (String(request.headers.host || '').toLowerCase() !== expectedHost) {
            const error = new Error('Invalid setup service host.');
            error.statusCode = 403;
            error.code = 'INVALID_HOST';
            throw error;
        }
        if (request.headers.origin) {
            const error = new Error('Browser-originated setup requests are not allowed.');
            error.statusCode = 403;
            error.code = 'ORIGIN_NOT_ALLOWED';
            throw error;
        }
    }

    async _handleRequest(request, response) {
        this._validateRequest(request);
        const url = new URL(request.url, `http://${this.host}:${this.port}`);
        if (url.pathname === '/status') {
            this._newToken();
            const status = this._currentStatus();
            if (url.searchParams.get('format') === 'stata') {
                this._sendText(response, 200, status);
            } else {
                this._sendJson(response, 200, status);
            }
            return;
        }
        if (url.pathname === '/setup') {
            await this._handleSetup(request, url, response);
            return;
        }
        if (url.pathname === '/installed') {
            await this._handleInstalled(url, response);
            return;
        }
        this._sendText(response, 404, {
            success: 0,
            code: 'NOT_FOUND',
            message: 'Unknown setup service route.'
        });
    }

    async _handleSetup(request, url, response) {
        const fields = [
            'protocolVersion',
            'setupToken',
            'clientVersion',
            'os',
            'stataVersion',
            'flavor',
            'machineType',
            'sysdirStata'
        ];
        const payload = {};
        for (const field of fields) {
            const value = url.searchParams.get(field);
            if (value === null || value.length > MAX_FIELD_LENGTH) {
                const error = new Error(`Missing or invalid setup field: ${field}.`);
                error.statusCode = 400;
                error.code = 'INVALID_FIELD';
                throw error;
            }
            payload[field] = value;
        }
        if (Number(payload.protocolVersion) !== PROTOCOL_VERSION) {
            const error = new Error('The saio command protocol is not compatible with this extension.');
            error.statusCode = 426;
            error.code = 'PROTOCOL_MISMATCH';
            throw error;
        }
        if (!this.setupToken || payload.setupToken !== this.setupToken) {
            const error = new Error('The setup token is invalid or has expired.');
            error.statusCode = 403;
            error.code = 'INVALID_TOKEN';
            throw error;
        }
        const signalPlatform = normalizeStataPlatform(payload.os, payload.machineType);
        if (signalPlatform !== this.platform) {
            const error = new Error('The running Stata platform does not match the VS Code extension host.');
            error.statusCode = 409;
            error.code = 'PLATFORM_MISMATCH';
            throw error;
        }

        payload.sysdirStataCandidates = decodeQueryValueCandidates(
            request.url,
            'sysdirStata',
            signalPlatform
        );

        this.setupToken = null;
        const result = await this.onSetup({
            platform: signalPlatform,
            clientVersion: payload.clientVersion,
            stataVersion: payload.stataVersion,
            flavor: payload.flavor,
            machineType: payload.machineType,
            sysdirStata: payload.sysdirStata,
            sysdirStataCandidates: payload.sysdirStataCandidates
        });
        this._sendText(response, 200, {
            success: 1,
            accepted: 1,
            resolvedPath: result.resolvedPath,
            message: 'Configuration received. Return to VS Code.'
        });
    }

    async _handleInstalled(url, response) {
        const result = url.searchParams.get('saio');
        const token = url.searchParams.get('token');
        if (result !== '0' && result !== '1') {
            const error = new Error('The saio installation result must be 0 or 1.');
            error.statusCode = 400;
            error.code = 'INVALID_INSTALL_RESULT';
            throw error;
        }
        const session = this.installSession;
        if (!session || !token || token !== session.token) {
            const error = new Error('The saio installation session is invalid or has expired.');
            error.statusCode = 403;
            error.code = 'INVALID_INSTALL_TOKEN';
            throw error;
        }

        const installed = result === '1';
        if (installed) this.installSession = null;
        if (typeof session.onResult === 'function') {
            await session.onResult({ installed });
        }
        this._sendText(response, 200, {
            success: 1,
            acknowledged: 1,
            installed: installed ? 1 : 0
        });
    }

    _headers(contentType) {
        return {
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        };
    }

    _sendText(response, statusCode, fields) {
        response.writeHead(statusCode, this._headers('text/plain; charset=utf-8'));
        response.end(stataTextResponse(fields));
    }

    _sendJson(response, statusCode, value) {
        response.writeHead(statusCode, this._headers('application/json; charset=utf-8'));
        response.end(JSON.stringify(value));
    }
}

module.exports = {
    HOST,
    MAX_URL_LENGTH,
    PORT_END,
    PORT_START,
    PROTOCOL_VERSION,
    SERVICE_NAME,
    StataSetupServer,
    decodeQueryValueCandidates,
    normalizeStataPlatform,
    stataTextResponse
};
