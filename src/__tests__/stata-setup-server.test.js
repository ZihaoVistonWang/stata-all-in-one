const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const Module = require('module');
const path = require('path');

function loadServerModule() {
    const modulePath = path.resolve(__dirname, '../modules/runCode/stataSetupServer.js');
    delete require.cache[modulePath];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (parent && parent.filename === modulePath) {
            if (request === '../capability') return { getCapabilityState: () => 'unverified' };
            if (request === '../../utils/config') {
                return {
                    getRunMode: () => 'embeddedConsole',
                    getStataPathOnWindows: () => '',
                    getStataVersion: () => ''
                };
            }
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        return require(modulePath);
    } finally {
        Module._load = originalLoad;
    }
}

function createContext(values = {}) {
    return {
        globalState: {
            get(key) { return values[key]; }
        }
    };
}

function request(port, requestPath, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            host: '127.0.0.1',
            port,
            path: requestPath,
            headers
        }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => resolve({
                body,
                headers: response.headers,
                statusCode: response.statusCode
            }));
        });
        req.on('error', reject);
    });
}

function textFields(body) {
    const result = {};
    for (const line of body.trim().split(/\r?\n/).slice(1)) {
        const index = line.indexOf('=');
        if (index > 0) result[line.slice(0, index)] = line.slice(index + 1);
    }
    return result;
}

test('setup server reports configuration and stays alive after repeated setup', async () => {
    const { StataSetupServer } = loadServerModule();
    let setupCalls = 0;
    const server = new StataSetupServer(createContext(), async signal => {
        setupCalls++;
        assert.equal(signal.flavor, 'MP');
        return { resolvedPath: '/Applications/StataNow/StataMP.app' };
    }, {
        platform: 'darwin',
        portStart: 28186,
        portEnd: 28186,
        extensionVersion: '0.3.3',
        config: {
            getRunMode: () => 'embeddedConsole',
            getStataPathOnWindows: () => '',
            getStataVersion: () => ''
        },
        capability: { getCapabilityState: () => 'unverified' },
        randomBytes: () => Buffer.from('123456789012345678901234')
    });
    try {
        await server.start();
        const status = await request(28186, '/status?format=stata');
        assert.equal(status.statusCode, 200);
        assert.equal(status.headers['cache-control'], 'no-store');
        const fields = textFields(status.body);
        assert.equal(fields.configured, '0');
        assert.equal(fields.setupToken, Buffer.from('123456789012345678901234').toString('hex'));

        const query = new URLSearchParams({
            protocolVersion: '1',
            setupToken: fields.setupToken,
            clientVersion: '1.0.0',
            os: 'Unix',
            stataVersion: '19.5',
            flavor: 'MP',
            machineType: 'Mac (Apple Silicon)',
            sysdirStata: '/Applications/StataNow/'
        });
        const setup = await request(28186, `/setup?${query}`);
        assert.equal(setup.statusCode, 200);
        assert.equal(textFields(setup.body).accepted, '1');
        assert.equal(setupCalls, 1);

        const replay = await request(28186, `/setup?${query}`);
        assert.equal(replay.statusCode, 403);
        assert.equal(setupCalls, 1);

        const nextStatus = await request(28186, '/status?format=stata');
        assert.equal(nextStatus.statusCode, 200);
    } finally {
        await server.stop();
    }
});

test('setup server rejects browser origins and platform mismatches', async () => {
    const { StataSetupServer } = loadServerModule();
    const server = new StataSetupServer(createContext(), async () => ({ resolvedPath: '' }), {
        platform: 'darwin',
        portStart: 28187,
        portEnd: 28187
    });
    try {
        await server.start();
        const originResponse = await request(28187, '/status?format=stata', {
            Origin: 'https://example.com'
        });
        assert.equal(originResponse.statusCode, 403);

        const status = await request(28187, '/status?format=stata');
        const token = textFields(status.body).setupToken;
        const query = new URLSearchParams({
            protocolVersion: '1',
            setupToken: token,
            clientVersion: '1.0.0',
            os: 'Windows',
            stataVersion: '18.0',
            flavor: 'MP',
            machineType: 'PC',
            sysdirStata: 'C:\\Program Files\\Stata18\\'
        });
        const mismatch = await request(28187, `/setup?${query}`);
        assert.equal(mismatch.statusCode, 409);
    } finally {
        await server.stop();
    }
});

test('setup server advances to the next port when the primary port is occupied', async () => {
    const { StataSetupServer } = loadServerModule();
    const occupied = http.createServer((_request, response) => response.end('occupied'));
    await new Promise(resolve => occupied.listen(28188, '127.0.0.1', resolve));
    const server = new StataSetupServer(createContext(), async () => ({ resolvedPath: '' }), {
        platform: 'darwin',
        portStart: 28188,
        portEnd: 28189
    });
    try {
        assert.equal(await server.start(), 28189);
        assert.equal((await request(28189, '/status?format=stata')).statusCode, 200);
    } finally {
        await server.stop();
        await new Promise(resolve => occupied.close(resolve));
    }
});

test('installation result session allows retries after failure and expires after success', async () => {
    const { StataSetupServer } = loadServerModule();
    const results = [];
    const server = new StataSetupServer(createContext(), async () => ({ resolvedPath: '' }), {
        platform: 'darwin',
        portStart: 28190,
        portEnd: 28190,
        randomBytes: () => Buffer.from('install-session-token-123')
    });
    try {
        await server.start();
        const session = server.beginInstallSession(result => results.push(result.installed));
        assert.equal(session.port, 28190);

        const invalidResult = await request(28190, `/installed?saio=2&token=${session.token}`);
        assert.equal(invalidResult.statusCode, 400);

        const wrongToken = await request(28190, '/installed?saio=1&token=wrong');
        assert.equal(wrongToken.statusCode, 403);

        const failed = await request(28190, `/installed?saio=0&token=${session.token}`);
        assert.equal(failed.statusCode, 200);
        assert.equal(textFields(failed.body).installed, '0');
        assert.deepEqual(results, [false]);

        const succeeded = await request(28190, `/installed?saio=1&token=${session.token}`);
        assert.equal(succeeded.statusCode, 200);
        assert.equal(textFields(succeeded.body).installed, '1');
        assert.deepEqual(results, [false, true]);

        const replay = await request(28190, `/installed?saio=0&token=${session.token}`);
        assert.equal(replay.statusCode, 403);
    } finally {
        await server.stop();
    }
});

test('closing an installation result session invalidates its token', async () => {
    const { StataSetupServer } = loadServerModule();
    const server = new StataSetupServer(createContext(), async () => ({ resolvedPath: '' }), {
        platform: 'darwin',
        portStart: 28191,
        portEnd: 28191
    });
    try {
        await server.start();
        const session = server.beginInstallSession(() => {});
        session.dispose();
        const response = await request(28191, `/installed?saio=1&token=${session.token}`);
        assert.equal(response.statusCode, 403);
    } finally {
        await server.stop();
    }
});

test('legacy Windows query bytes produce local-code-page path candidates', () => {
    const { decodeQueryValueCandidates } = loadServerModule();
    const candidates = decodeQueryValueCandidates(
        '/setup?sysdirStata=C%3A%5C%D6%D0%CE%C4%5CStata13%5C',
        'sysdirStata',
        'win32'
    );
    assert.ok(candidates.includes('C:\\中文\\Stata13\\'));
});
