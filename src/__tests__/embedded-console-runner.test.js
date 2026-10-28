const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.resolve(__dirname, '../modules/runCode/embeddedConsole');

function loadModule(name, imports) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(directory, `${name}.js`), 'utf8'), {
        module,
        console: { log() {}, warn() {}, error() {} },
        Date,
        process: { env: {} },
        require(request) {
            if (Object.hasOwn(imports, request)) return imports[request];
            if (['fs', 'path', 'os', 'child_process'].includes(request)) return require(request);
            throw new Error(`Unexpected ${name} dependency: ${request}`);
        }
    }, { filename: `${name}.js` });
    return module.exports;
}

function fixture(options = {}) {
    const calls = { events: [], output: [], commands: [], submitted: [], writes: [], cleanup: [], progress: [] };
    let stopped = false;
    let initialized = true;
    const completion = {
        abort() { calls.aborted = true; },
        finish() { calls.finished = true; },
        record() {}
    };
    const consoleSession = {
        isInitialized: () => initialized,
        beginManualStopScope() { calls.events.push('begin-stop-scope'); },
        clearManualStopScope() { calls.events.push('clear-stop-scope'); },
        isStopRequested: () => stopped,
        getWorkingDirectory: () => '/work',
        stop() { stopped = true; },
        async execute(code, echo, onOutput, executionOptions) {
            calls.commands.push(code);
            if (options.throwExecution) throw new Error('worker disconnected');
            for (const chunk of options.chunks || ['result\n']) onOutput(chunk);
            if (options.stopDuringExecution) stopped = true;
            const result = options.result || { success: true, output: 'result\n', returnCode: 0 };
            executionOptions.onExecutionComplete(result, 50);
            return result;
        }
    };
    const session = {
        isSessionStale: () => false,
        hasActiveConsoleSession: () => true,
        getConsoleSession: () => consoleSession,
        getActiveSession: () => consoleSession,
        forceShutdownConsoleSession() { initialized = false; return true; }
    };
    const sink = {
        async prepareForExecution() { calls.events.push('prepare'); },
        setWorkingDirectory() {},
        writeSubmission(code) { calls.submitted.push(code); },
        writeCommand(code) { calls.events.push(`echo:${code}`); },
        beginTemporaryDoFileOutput(file) { calls.temporary = file; },
        finishTemporaryDoFileOutput() { calls.temporaryFinished = true; },
        writeOutputChunk(chunk) { calls.output.push(chunk); },
        flushOutput() {},
        setWorkingDetail(detail) { calls.progress.push(detail); },
        discardBufferedOutput() {},
        writeRunFooter() { calls.footer = true; },
        writeError(error) { calls.error = error; },
        markRunFailed() { calls.failed = true; },
        writeBreak() { calls.break = true; },
        setStatus(status) { calls.status = status; },
        writeGraphEntries(entries) { calls.graphs = entries; },
        applySemanticLinks(links) { calls.links = links; }
    };
    const imports = {
        vscode: { window: { async showWarningMessage() { return 'consoleLicenseMissingNever'; } } },
        fs: { writeFileSync(file, contents) { calls.writes.push({ file, contents }); } },
        './session': session,
        './completionSound': { getService: () => ({ begin: () => completion }) },
        '../execute/tempfile': {
            getTempFilePath: () => '/work/temporary.do',
            async cleanupTempFile(file) { calls.cleanup.push(file); }
        },
        '../../../utils/config': { getCdToDoFileDir: () => true },
        '../../../utils/common': { msg: key => key },
        './workingDirectory': {
            async ensureSessionWorkingDirectory(_session, docDir) { calls.initialDirectory = docDir; },
            async syncSessionWorkingDirectory() { calls.events.push('sync-directory'); }
        },
        './panel': { getWebviewTerminalSink: () => sink, setGraphResourceRoot() {}, convertGraphSvgToBitmap() {} },
        './graphs': {
            getGraphCacheDir: () => '/cache/graphs',
            async beginGraphCapture() { return { enabled: true }; },
            async endGraphCapture() { calls.events.push('end-graphs'); },
            async executeBitmapGraphExport() { return null; },
            async exportCapturedGraphs() { return [{ path: '/cache/graphs/plot.svg' }]; }
        },
        './smclLinks': { async startSmclSidecar() { return { async finish() { return ['semantic-link']; } }; } },
        './bootstrap': { async applyWebviewBootstrap() { calls.events.push('bootstrap'); } },
        './commandParsing': require('../modules/runCode/embeddedConsole/commandParsing')
    };
    const runner = loadModule('runner', imports);
    const platformImports = {
        './runner': runner,
        './session': session,
        '../../../utils/config': {},
        '../../../utils/common': { msg: key => key },
        '../stataInstallationResolver': {},
        '../stataDiscovery': require('../modules/runCode/stataDiscovery')
    };
    return { calls, runner, platformImports, session, completion };
}

const platforms = [
    ['mac', 'darwin', 'runOnMacWebview'],
    ['windows', 'win32', 'runOnWindowsEmbeddedConsole'],
    ['linux', 'linux', 'runOnLinuxEmbeddedConsole']
];

for (const [name, platform, entry] of platforms) {
    test(`${name} entry executes through the shared runner and preserves output, graphs and cleanup`, async () => {
        const f = fixture();
        const api = loadModule(name, f.platformImports);
        // No other platform module is available to the loader. Each real
        // initializer reuses the active session and invokes the actual runner.
        const result = await api[entry]('display 1\ndisplay 2', null, '/project', {});
        assert.equal(result.success, true);
        assert.deepEqual(f.calls.commands, ['display 1', 'display 2']);
        assert.deepEqual(f.calls.submitted, ['display 1\ndisplay 2']);
        assert.deepEqual(f.calls.output, ['result\n', 'result\n']);
        assert.equal(f.calls.initialDirectory, '/project');
        assert.equal(f.calls.graphs[0].path, '/cache/graphs/plot.svg');
        assert.deepEqual(f.calls.links, ['semantic-link']);
        assert.ok(f.calls.events.includes('clear-stop-scope'));
        assert.ok(f.calls.events.includes('end-graphs'));
        assert.equal(f.calls.finished, true);
        assert.equal(f.calls.footer, true);
        assert.equal(api.getConsoleSession({}), f.session.getConsoleSession());
        const stop = api.stopConsoleExecution || api.stopEmbeddedConsoleExecution;
        assert.equal(await stop({}), true);
        assert.equal(f.calls.status, 'stopping');
        const shutdown = api.forceShutdownConsoleSession || api.forceShutdownEmbeddedConsoleSession;
        assert.equal(shutdown(), true);
        assert.equal(f.session.getConsoleSession().isInitialized(), false);
    });

    test(`${name} initializer is bound independently of per-run options`, async () => {
        const f = fixture();
        const context = {};
        const run = f.runner.createConsoleRunner({
            platform,
            async ensureConsoleSession(received) {
                assert.equal(received, context);
                return { success: false, noLicense: true, failCode: 'LICENSE_NOT_FOUND', reason: 'missing licence' };
            }
        });
        const result = await run('display 1', null, null, context, {
            ensureConsoleSession() { throw new Error('must not replace the platform initializer'); }
        });
        assert.equal(result.success, false);
        assert.equal(result.noLicense, true);
        assert.equal(result.failCode, 'LICENSE_NOT_FOUND');
        assert.equal(result.shouldOfferGuiFallback, true);
        assert.deepEqual(f.calls.commands, []);
        assert.equal(f.calls.aborted, true);
    });
}

test('source comments and blank lines retain native do-file echo and the temporary file is cleaned', async () => {
    const f = fixture();
    const run = f.runner.createConsoleRunner({ platform: 'linux', ensureConsoleSession: async () => ({ success: true }) });
    const source = '* source comment\n\ndisplay 1';
    const result = await run(source, null, '/work', {});
    assert.equal(result.success, true);
    assert.deepEqual(f.calls.writes, [{ file: '/work/temporary.do', contents: source }]);
    assert.deepEqual(f.calls.commands, ['do "/work/temporary.do"']);
    assert.deepEqual(f.calls.cleanup, ['/work/temporary.do']);
    assert.equal(f.calls.temporary, '/work/temporary.do');
    assert.equal(f.calls.temporaryFinished, true);
});

test('Stata errors retain the return code and do not request an application fallback', async () => {
    const f = fixture({ result: { success: false, output: '', returnCode: 199, error: 'unrecognized command' }, chunks: [] });
    const run = f.runner.createConsoleRunner({ platform: 'win32', ensureConsoleSession: async () => ({ success: true }) });
    const result = await run('badcommand', null, null, {});
    assert.equal(result.returnCode, 199);
    assert.equal(result.shouldOfferGuiFallback, false);
    assert.equal(f.calls.error, 'unrecognized command');
    assert.equal(f.calls.failed, true);
});

test('Stop interrupts a split submission before the next command and aborts its reminder', async () => {
    const f = fixture({ stopDuringExecution: true });
    const run = f.runner.createConsoleRunner({ platform: 'darwin', ensureConsoleSession: async () => ({ success: true }) });
    const result = await run('display 1\ndisplay 2', null, null, {});
    assert.equal(result.success, false);
    assert.deepEqual(f.calls.commands, ['display 1']);
    assert.equal(f.calls.aborted, true);
    assert.equal(f.calls.break, true);
    assert.ok(f.calls.events.includes('clear-stop-scope'));
});

test('worker failures report an extension error and finalize graph capture', async () => {
    const f = fixture({ throwExecution: true });
    const run = f.runner.createConsoleRunner({ platform: 'linux', ensureConsoleSession: async () => ({ success: true }) });
    const result = await run('display 1', null, null, {});
    assert.equal(result.errorType, 'extension');
    assert.equal(result.shouldOfferGuiFallback, true);
    assert.equal(f.calls.error, 'worker disconnected');
    assert.equal(f.calls.aborted, true);
    assert.ok(f.calls.events.includes('end-graphs'));
});

test('the Windows progress-marker variant is preserved without changing Mac/Linux parsing', async () => {
    for (const [, platform] of platforms) {
        const f = fixture({ chunks: ['prefix .......... +  50\n'] });
        const run = f.runner.createConsoleRunner({ platform, ensureConsoleSession: async () => ({ success: true }) });
        await run('bootstrap, reps(100): regress y x', null, null, {});
        assert.equal(f.calls.progress.some(detail => detail && detail.current === 50 && detail.total === 100), platform === 'win32');
    }
});

test('a caller-owned completion and suppressed footer remain under the caller control', async () => {
    const f = fixture();
    const run = f.runner.createConsoleRunner({ platform: 'linux', ensureConsoleSession: async () => ({ success: true }) });
    await run('display 1', null, null, {}, { completionSound: f.completion, suppressRunFooter: true });
    assert.equal(f.calls.finished, undefined);
    assert.equal(f.calls.footer, undefined);
});

for (const scenario of [
    { name: 'local macOS', host: 'darwin' },
    { name: 'local Windows', host: 'win32' },
    { name: 'local Linux', host: 'linux' },
    { name: 'macOS client connected to Linux over SSH', host: 'linux', remote: 'ssh-remote' },
    { name: 'Windows client connected to Linux over SSH', host: 'linux', remote: 'ssh-remote' }
]) {
    test(`${scenario.name} dispatches to the extension host initializer and shared execution`, async () => {
        const f = fixture();
        const initializedPlatforms = [];
        const platformImports = {
            ...f.platformImports,
            './runner': {
                ...f.runner,
                createConsoleRunner({ platform, ensureConsoleSession }) {
                    return f.runner.createConsoleRunner({
                        platform,
                        async ensureConsoleSession(context) {
                            initializedPlatforms.push(platform);
                            return ensureConsoleSession(context);
                        }
                    });
                }
            }
        };
        const dispatch = loadModule('../execute/index', {
            vscode: {
                env: { remoteName: scenario.remote },
                window: {}, workspace: {},
                commands: { async executeCommand() {} }
            },
            '../../../utils/common': {
                isWindows: () => scenario.host === 'win32',
                isMacOS: () => scenario.host === 'darwin',
                isLinux: () => scenario.host === 'linux',
                msg: key => key,
                showWarn() { assert.fail('unexpected dispatcher warning'); },
                showError() { assert.fail('unexpected dispatcher error'); }
            },
            '../../../utils/config': {
                RUN_MODES: { embeddedConsole: 'embeddedConsole', externalApp: 'externalApp' },
                getRunMode: () => 'embeddedConsole', getConsoleCompletionSound: () => ({ enabled: false })
            },
            '../../variableSuggestionService': { async refreshMemoryVars() { return []; } },
            '../../capability': { setCapabilityState() {} },
            '../embeddedConsole/completionSound': { getService: () => ({ stop() {} }) },
            '../stataInstallationResolver': { async ensureStataConfigured() { return { executablePath: 'stata.exe' }; } },
            '../externalApp/mac': { runOnMac() { assert.fail('unexpected external Mac execution'); } },
            '../externalApp/windows': { runOnWindows() { assert.fail('unexpected external Windows execution'); } },
            '../embeddedConsole/mac': loadModule('mac', platformImports),
            '../embeddedConsole/windows': loadModule('windows', platformImports),
            '../embeddedConsole/linux': loadModule('linux', platformImports),
            '../embeddedConsole/panel': { isWebviewTerminalRunning: () => false },
            '../embeddedConsole/dataViewer/panel': { async updateDataViewerData() {} },
            '../browseCommand': { shouldRouteBrowseCommand: () => false },
            '../consoleCompatibility': { async routeConsoleUnsupportedCommand() { return null; } },
            '../saioCommandGuard': { containsSaioCommand: () => false },
            './tempfile': { getTempFilePath: () => '/work/dispatch.do' },
            './runTarget': {}
        });
        const result = await dispatch.runArbitraryCode({}, 'display 1', { docDir: '/project' });
        assert.equal(result.success, true);
        assert.deepEqual(initializedPlatforms, [scenario.host]);
        assert.deepEqual(f.calls.commands, ['display 1']);
    });
}
