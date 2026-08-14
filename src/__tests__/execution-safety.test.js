const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const {
    cleanupStaleTempFiles,
    getTempFilePath,
    STALE_TEMP_FILE_AGE_MS
} = require('../modules/runCode/execute/tempfile');
const {
    findLineContinuationIndex,
    hasDisplayableBlankLine,
    hasDisplayableFullLineComment,
    normalizeStandaloneCdCommand,
    splitExecutionSourceLines,
    stripTrailingLineComment
} = require('../modules/runCode/embeddedConsole/commandParsing');

test('temporary do-files are unique, system-owned, and stale cleanup is prefix-scoped', () => {
    const first = getTempFilePath('/a/project');
    const second = getTempFilePath('/a/project');
    assert.equal(path.dirname(first), os.tmpdir());
    assert.equal(path.dirname(second), os.tmpdir());
    assert.notEqual(first, second);
    assert.match(path.basename(first), /^stata-all-in-one-\d+-[0-9a-f-]+\.do$/);

    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'saio-temp-cleanup-'));
    try {
        const ownedOld = path.join(tempDirectory, 'stata-all-in-one-1-old.do');
        const ownedRecent = path.join(tempDirectory, 'stata-all-in-one-1-recent.do');
        const unrelatedOld = path.join(tempDirectory, 'someone-else.do');
        fs.writeFileSync(ownedOld, '');
        fs.writeFileSync(ownedRecent, '');
        fs.writeFileSync(unrelatedOld, '');
        const now = Date.now();
        const oldSeconds = (now - STALE_TEMP_FILE_AGE_MS - 1000) / 1000;
        fs.utimesSync(ownedOld, oldSeconds, oldSeconds);
        fs.utimesSync(unrelatedOld, oldSeconds, oldSeconds);

        assert.equal(cleanupStaleTempFiles({ tempDirectory, now }), 1);
        assert.equal(fs.existsSync(ownedOld), false);
        assert.equal(fs.existsSync(ownedRecent), true);
        assert.equal(fs.existsSync(unrelatedOld), true);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});

test('line comments require Stata whitespace boundaries and preserve URLs', () => {
    assert.equal(
        stripTrailingLineComment('local u https://example.com/a//b'),
        'local u https://example.com/a//b'
    );
    assert.equal(
        stripTrailingLineComment('local u file:///tmp/data // comment'),
        'local u file:///tmp/data '
    );
    assert.equal(stripTrailingLineComment('display 1//comment'), 'display 1//comment');
    assert.equal(stripTrailingLineComment('display 1 //comment'), 'display 1 ');
    assert.equal(stripTrailingLineComment('// comment'), '');
    assert.equal(normalizeStandaloneCdCommand('cd https://example.com/work'), 'cd https://example.com/work');
    assert.equal(findLineContinuationIndex('copy https:///example.com/data target'), -1);
    assert.equal(findLineContinuationIndex('display 1 /// comment'), 10);
});

test('detects full-line comments whose native echo must be preserved', () => {
    assert.equal(hasDisplayableFullLineComment('**# External App request A'), true);
    assert.equal(hasDisplayableFullLineComment('* ordinary comment'), true);
    assert.equal(hasDisplayableFullLineComment('// slash comment'), true);
    assert.equal(hasDisplayableFullLineComment('/* block comment */'), true);
    assert.equal(
        hasDisplayableFullLineComment([
            'use https://www.stata-press.com/data/r18/auto.dta, clear',
            'display 1 // trailing comment'
        ]),
        false
    );
});

test('preserves intentional source blank lines but ignores the final line ending', () => {
    assert.deepEqual(
        splitExecutionSourceLines('// Basic data exploration\n\ndescribe\n'),
        ['// Basic data exploration', '', 'describe']
    );
    assert.equal(hasDisplayableBlankLine(['describe']), false);
    assert.equal(hasDisplayableBlankLine(['describe', '', 'summarize']), true);
});

function loadMacRunner(childProcess, errors) {
    const modulePath = require.resolve('../modules/runCode/externalApp/mac');
    delete require.cache[modulePath];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (parent && parent.filename === modulePath) {
            if (request === 'child_process') return childProcess;
            if (request === 'vscode') return {};
            if (request === '../../../utils/config') {
                return {
                    getStataVersion: () => 'StataMP',
                    getCdToDoFileDir: () => false
                };
            }
            if (request === '../../../utils/common') {
                return {
                    msg: (key, value) => `${key}:${JSON.stringify(value || {})}`,
                    showError: message => errors.push(message),
                    showInfo: () => {}
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

test('macOS external execution passes AppleScript as argv without a shell', () => {
    const calls = [];
    const errors = [];
    const childProcess = {
        execFileSync(command, args) {
            calls.push({ sync: true, command, args });
            return '123\n';
        },
        execFile(command, args, callback) {
            calls.push({ sync: false, command, args });
            callback(null, '', '');
        }
    };
    const runner = loadMacRunner(childProcess, errors);
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'saio mac safety ; $()-'));
    const appPath = path.join(tempDirectory, 'StataMP.app');
    const doPath = path.join(tempDirectory, 'input "quoted"; $(touch nope).do');
    fs.mkdirSync(appPath);
    try {
        runner.runOnMac('display 1', doPath, false, null, {
            globalState: {
                get: () => appPath,
                update: () => {}
            }
        });
        assert.deepEqual(errors, []);
        assert.deepEqual(calls[0], { sync: true, command: 'pgrep', args: ['-x', 'StataMP'] });
        assert.equal(calls[1].command, 'osascript');
        assert.equal(Array.isArray(calls[1].args), true);
        assert.equal(calls[1].args.some(argument => argument.includes('$(touch nope)')), true);
        assert.equal(fs.existsSync(doPath), true, 'async external execution keeps the do-file available');
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});

test('macOS external execution rejects an unexpected application name', () => {
    const calls = [];
    const errors = [];
    const runner = loadMacRunner({
        execFileSync() { calls.push('sync'); return ''; },
        execFile() { calls.push('async'); }
    }, errors);
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'saio-mac-app-'));
    const appPath = path.join(tempDirectory, 'StataMP$(touch-pwned).app');
    fs.mkdirSync(appPath);
    try {
        runner.runOnMac('display 1', path.join(tempDirectory, 'input.do'), false, null, {
            globalState: {
                get: () => appPath,
                update: () => {}
            }
        });
        assert.equal(errors.length, 1);
        assert.deepEqual(calls, []);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});
