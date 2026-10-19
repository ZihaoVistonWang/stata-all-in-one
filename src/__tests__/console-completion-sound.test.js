const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createCompletionSoundService } = require('../modules/runCode/embeddedConsole/completionSound');

function fixture(overrides = {}) {
    let time = 0;
    let nextTimer = 0;
    const timers = new Map();
    const children = [];
    const warnings = [];
    const settings = { enabled: true, thresholdMinutes: 5, durationSeconds: 10, ringtone: 'notification', customPath: '' };
    const service = createCompletionSoundService({
        platform: 'darwin', config: { getConsoleCompletionSound: () => ({ ...settings }) },
        now: () => time,
        setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, at: time + ms }); return id; },
        clearTimeout(id) { timers.delete(id); },
        spawn(command, args, options) {
            const child = new EventEmitter();
            child.stdin = new EventEmitter();
            child.stdin.end = data => { child.input = data; };
            child.stderr = new EventEmitter();
            child.stdout = new EventEmitter();
            child.kill = () => { child.killed = true; };
            children.push(Object.assign(child, { command, args, options }));
            return child;
        },
        readable() {}, notify() {}, warn: () => warnings.push(true), log() {}, ...overrides
    });
    return { service, settings, children, warnings, timers, advance(ms) {
        const end = time + ms;
        while (true) {
            const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry || entry[1].at > end) break;
            time = entry[1].at; timers.delete(entry[0]); entry[1].fn();
        }
        time = end;
    } };
}
const ok = { success: true, returnCode: 0 };
function finish(f, result = ok, elapsed = 300000) {
    const task = f.service.begin(); task.record(result, elapsed); task.finish(); return task;
}

test('disabled, below threshold, empty, aborted and failed engine submissions stay silent', () => {
    for (const result of [null, { success: false, returnCode: -1 }, { ...ok, interrupted: true },
        { ...ok, forced: true }, { ...ok, sessionLost: true }, { ...ok, sessionUnavailable: true },
        { success: false, returnCode: 1 }]) {
        const f = fixture(); finish(f, result); assert.equal(f.children.length, 0);
    }
    const f = fixture();
    f.settings.enabled = false; finish(f); f.settings.enabled = true;
    finish(f, ok, 299999);
    const empty = f.service.begin(); empty.finish();
    const aborted = f.service.begin(); aborted.record(ok, 300000); aborted.abort(); aborted.finish();
    assert.equal(f.children.length, 0);
});

test('threshold equality, Stata errors, zero threshold and shared segments trigger only once', () => {
    for (const result of [ok, { success: false, returnCode: 198 }]) {
        const f = fixture(); const task = finish(f, result); task.finish();
        assert.equal(f.children.length, 1);
    }
    const f = fixture(); const shared = f.service.begin();
    shared.record(ok, 100000); shared.record(ok, 200000); shared.finish(); shared.finish();
    assert.equal(f.children.length, 1);
    f.settings.thresholdMinutes = 0; finish(f, ok, 0);
    assert.equal(f.children.length, 2);
});

test('submission snapshots settings, while disabling or disposing cancels playback', () => {
    const f = fixture();
    const task = f.service.begin(); f.settings.ringtone = 'warning'; f.settings.thresholdMinutes = 100;
    task.record(ok, 300000); task.finish();
    assert.match(f.children[0].args[0], /Glass\.aiff$/);
    f.service.begin(); assert.equal(f.children[0].killed, true);
    f.settings.thresholdMinutes = 0; finish(f);
    f.service.dispose(); assert.equal(f.children[1].killed, true); assert.equal(f.timers.size, 0);
    const disabled = fixture(); const pending = disabled.service.begin();
    disabled.settings.enabled = false; pending.record(ok, 300000); pending.finish();
    assert.equal(disabled.children.length, 0);
});

test('short audio repeats and long audio is cut off at a single fixed deadline', () => {
    const f = fixture(); finish(f); f.advance(500); f.children[0].emit('close', 0);
    f.advance(100); assert.equal(f.children.length, 2);
    f.advance(9400); assert.equal(f.children[1].killed, true); assert.equal(f.timers.size, 0);
    f.children[1].emit('close', 0); assert.equal(f.children.length, 2);
});

test('invalid paths and decoder errors warn once and fall back without changing results', () => {
    for (const badPath of ['', '/missing/audio.mp3']) {
        const f = fixture({ readable() { throw new Error('unreadable'); } });
        f.settings.ringtone = 'custom'; f.settings.customPath = badPath; finish(f);
        assert.equal(f.warnings.length, 1); assert.match(f.children[0].args[0], /Glass/);
    }
    const f = fixture(); f.settings.ringtone = 'custom'; f.settings.customPath = '/tmp/bad.mp3';
    finish(f); f.children[0].emit('error', new Error('decoder failed')); f.children[0].emit('close', 1);
    assert.equal(f.warnings.length, 1); assert.equal(f.children.length, 2);
    f.children[1].emit('close', 1); assert.equal(f.children.length, 2); assert.equal(f.timers.size, 0);
});

test('custom audio paths are passed as data on both platforms, with MP3 validation', () => {
    const file = '/tmp/中文 空格\'"$(touch nope).mp3';
    const mac = fixture(); mac.settings.ringtone = 'custom'; mac.settings.customPath = file; finish(mac);
    assert.deepEqual(mac.children[0].args, [file]); assert.equal(mac.children[0].options.shell, undefined);
    const win = fixture({ platform: 'win32' }); win.settings.ringtone = 'custom'; win.settings.customPath = file; finish(win);
    assert.equal(JSON.parse(win.children[0].input).path, file);
    assert.ok(win.children[0].args.includes('-STA'));
    assert.ok(!win.children[0].args.some(arg => arg.includes(file)));
    assert.equal(win.children[0].options.windowsHide, true);
    win.children[0].stdout.emit('data', 'SAIO_AUDIO_READY\n');
    win.advance(10000); assert.equal(win.children[0].killed, true);
});

test('late events from a replaced player cannot stop or restart the current player', () => {
    const f = fixture(); finish(f); const old = f.children[0]; finish(f);
    old.emit('error', new Error('late')); old.emit('close', 1);
    assert.equal(f.children.length, 2); assert.equal(f.children[1].killed, undefined);
});


test('manual stop controls only the current reminder and does not disable future reminders', () => {
    const stops = [];
    const f = fixture({ notify: stopCurrent => stops.push(stopCurrent) });
    finish(f);
    stops[0]();
    assert.equal(f.children[0].killed, true);
    assert.equal(f.timers.size, 0);
    finish(f);
    stops[0]();
    assert.equal(f.children[1].killed, undefined, 'old notification must not stop a newer sound');
    stops[1]();
    assert.equal(f.children[1].killed, true);
    finish(f);
    assert.equal(f.children.length, 3);
});

test('non-MP3 custom files fall back even when the path is readable', () => {
    const f = fixture(); f.settings.ringtone = 'custom'; f.settings.customPath = '/tmp/test.wav';
    finish(f);
    assert.equal(f.warnings.length, 1);
    assert.match(f.children[0].args[0], /Glass/);
});

test('configuration defaults and validation match the localized settings contract', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const vm = require('node:vm');
    const values = {};
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../utils/config.js'), 'utf8'), {
        module, require: () => ({ workspace: { getConfiguration: () => ({ get: (key, fallback) => key in values ? values[key] : fallback }) } })
    });
    const get = module.exports.getConsoleCompletionSound;
    assert.equal(get().enabled, false);
    assert.equal(get().thresholdMinutes, 5);
    assert.equal(get().durationSeconds, 60);
    Object.assign(values, {
        'consoleCompletionSound.enabled': true,
        'consoleCompletionSound.thresholdMinutes': 0.1,
        'consoleCompletionSound.durationSeconds': 300,
        'consoleCompletionSound.ringtone': 'custom'
    });
    assert.equal(get().thresholdMinutes, 0.1); assert.equal(get().durationSeconds, 300);
    values['consoleCompletionSound.thresholdMinutes'] = -1;
    values['consoleCompletionSound.durationSeconds'] = 1.5;
    assert.equal(get().thresholdMinutes, 5); assert.equal(get().durationSeconds, 60);
    const manifest = require('../../package.json');
    const en = require('../../package.nls.json');
    const zh = require('../../package.nls.zh-cn.json');
    for (const [key, property] of Object.entries(manifest.contributes.configuration.properties)) {
        if (!key.includes('consoleCompletionSound')) continue;
        for (const placeholder of [property.markdownDescription, ...(property.enumItemLabels || [])]) {
            const translation = placeholder.slice(1, -1);
            assert.ok(en[translation]); assert.ok(zh[translation]);
        }
    }
    assert.ok(manifest.contributes.commands.some(command => command.command === 'stata-all-in-one.stopCompletionSound'));
});

test('the registered command, live disable and extension disposal clean up playback', () => {
    const commands = new Map();
    let listener;
    const context = { subscriptions: [] };
    const f = fixture({ vscode: {
        commands: { registerCommand(name, callback) { commands.set(name, callback); return { dispose() {} }; } },
        workspace: { onDidChangeConfiguration(callback) { listener = callback; return { dispose() {} }; } }
    } });
    f.service.register(context);
    finish(f); commands.get('stata-all-in-one.stopCompletionSound')();
    assert.equal(f.children[0].killed, true);
    finish(f); f.settings.enabled = false;
    listener({ affectsConfiguration: key => key === 'stata-all-in-one.consoleCompletionSound.enabled' });
    assert.equal(f.children[1].killed, true); assert.equal(f.timers.size, 0);
    f.settings.enabled = true; finish(f);
    for (const disposable of context.subscriptions) disposable.dispose();
    assert.equal(f.children[2].killed, true); assert.equal(f.timers.size, 0);
});


test('Windows startup is excluded from playback duration and a hung decoder is bounded', () => {
    const f = fixture({ platform: 'win32' }); finish(f);
    f.advance(4000);
    f.children[0].stdout.emit('data', 'SAIO_AUDIO_');
    f.children[0].stdout.emit('data', 'READY\n');
    f.advance(9999); assert.equal(f.children[0].killed, undefined);
    f.advance(1); assert.equal(f.children[0].killed, true);
    finish(f); f.advance(18000); assert.equal(f.children[1].killed, true);
});

function dispatcherFixture({ windows = false, result = { success: true }, failBrowse = false } = {}) {
    const fs = require('node:fs');
    const path = require('node:path');
    const vm = require('node:vm');
    const f = fixture();
    const calls = [];
    const runners = async (code, temp, directory, context, options) => {
        calls.push(code);
        const task = options.completionSound || f.service.begin(options.completionSoundSettings);
        task.record(result.success ? ok : { success: false, returnCode: 198 }, 150000);
        if (result.shouldOfferGuiFallback) task.abort();
        if (!options.completionSound) task.finish();
        return result;
    };
    const module = { exports: {} };
    const imports = {
        vscode: { window: {}, workspace: {}, commands: { executeCommand: async () => {} } },
        '../../variableSuggestionService': { refreshMemoryVars: async () => ['x'] },
        '../../../utils/common': { isWindows: () => windows, isMacOS: () => !windows,
            msg: value => value, showWarn: async () => {}, showError() {}, showInfo() {}, showConsoleUnavailableToast() {} },
        '../../../utils/config': { RUN_MODES: { embeddedConsole: 'embeddedConsole', externalApp: 'externalApp' },
            getRunMode: () => 'embeddedConsole', getConsoleCompletionSound: () => ({ ...f.settings }) },
        '../embeddedConsole/completionSound': { getService: () => f.service },
        '../stataInstallationResolver': { ensureStataConfigured: async () => ({ executablePath: 'stata.exe' }) },
        '../externalApp/mac': { runOnMac: async () => calls.push('external') },
        '../externalApp/windows': { runOnWindows: async () => calls.push('external') },
        '../embeddedConsole/mac': { runOnMacWebview: runners },
        '../embeddedConsole/windows': { runOnWindowsEmbeddedConsole: runners },
        '../embeddedConsole/panel': { isWebviewTerminalRunning: () => false, getWebviewTerminalSink: () => ({ writeRunFooter() {} }) },
        '../embeddedConsole/dataViewer/panel': { activateDataViewerTab() {}, updateDataViewerData: async () => {} },
        '../browseCommand': { ...require('../modules/runCode/browseCommand'),
            shouldRouteBrowseCommand: mode => mode === 'embeddedConsole', routeBrowseCommand: async () => ({ success: !failBrowse }) },
        '../consoleCompatibility': { routeConsoleUnsupportedCommand: async () => null },
        '../saioCommandGuard': { containsSaioCommand: () => false },
        './tempfile': { getTempFilePath: () => '/tmp/sound-test.do' },
        '../../capability': { setCapabilityState() {} }
    };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../modules/runCode/execute/index.js'), 'utf8'), {
        module, console, setTimeout, require: name => name === 'os' || name === 'path' ? require(name) : imports[name] || {}
    });
    return { ...f, calls, run: (code, options = {}) => module.exports.runArbitraryCode({}, code, options) };
}

test('both dispatchers share one reminder for a browse-split user submission', async () => {
    for (const windows of [false, true]) {
        const f = dispatcherFixture({ windows });
        const result = await f.run('display 1\nbrowse\ndisplay 2');
        assert.equal(result.success, true);
        assert.equal(f.calls.length, 2);
        assert.equal(f.children.length, 1);
    }
});

test('external execution, fallback and failed browse routing stay silent', async () => {
    const external = dispatcherFixture(); await external.run('display 1', { outputMode: 'externalApp' });
    assert.deepEqual(external.calls, ['external']); assert.equal(external.children.length, 0);
    const fallback = dispatcherFixture({ result: { success: false, shouldOfferGuiFallback: true } });
    await fallback.run('display 1\nbrowse\ndisplay 2'); assert.equal(fallback.children.length, 0);
    const browse = dispatcherFixture({ failBrowse: true });
    await browse.run('display 1\nbrowse\ndisplay 2'); assert.equal(browse.children.length, 0);
});
