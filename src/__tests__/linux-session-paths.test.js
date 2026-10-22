const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const nativePath = require.resolve('../modules/runCode/embeddedConsole/native/stata_process');
const sessionPath = require.resolve('../modules/runCode/embeddedConsole/session');

// session.js reads process.platform directly, so this can only be verified on a
// Linux host. The pure path helpers behind it are covered for every host in
// linux-stata-discovery.test.js.
test('Linux sessions derive SYSDIR_STATA and the console executable from the library path', { skip: process.platform !== 'linux' }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-linux-session-'));
    const directory = path.join(root, 'stata18');
    fs.mkdirSync(directory);
    const libraryPath = path.join(directory, 'libstata-mp.so');
    fs.writeFileSync(libraryPath, 'test');
    fs.writeFileSync(path.join(directory, 'stata-mp'), 'test');

    const initCalls = [];
    require.cache[nativePath] = {
        id: nativePath,
        filename: nativePath,
        loaded: true,
        exports: {
            isLoaded: () => true,
            isInitialized: () => initCalls.length > 0,
            getDylibPath: () => libraryPath,
            async initSession(...args) {
                initCalls.push(args);
                return true;
            },
            async execute() {
                return { success: true, returnCode: 0, output: '' };
            },
            shutdown() {},
            clearOutput() {},
            setBreak: () => true
        }
    };
    delete require.cache[sessionPath];
    const sessionManager = require(sessionPath);
    const values = new Map();
    const context = {
        globalState: {
            get: key => values.get(key),
            async update(key, value) {
                if (value === undefined) values.delete(key);
                else values.set(key, value);
            }
        }
    };

    try {
        const session = sessionManager.getConsoleSession(context);
        assert.equal((await session.init(libraryPath)).success, true);
        assert.deepEqual(initCalls, [[libraryPath, false, path.join(directory, 'stata-mp'), directory]]);
        assert.equal(values.get('stataConsoleLibraryPath'), libraryPath);
        assert.equal(values.has('stataConsoleDylibPath'), false);
    } finally {
        sessionManager.forceShutdownConsoleSession();
        delete require.cache[sessionPath];
        delete require.cache[nativePath];
        fs.rmSync(root, { recursive: true, force: true });
    }
});
