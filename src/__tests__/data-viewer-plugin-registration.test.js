const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const readerPath = require.resolve(
    '../modules/runCode/embeddedConsole/dataViewer/consoleDataReader'
);

// Minimal Stata model: `program x, plugin using(...)` defines an entry point;
// clear all / program drop _all remove every entry point.
function createStataSimulator() {
    const programs = new Set();
    const executed = [];
    let clearAllCount = 0;
    let lastReturnCode = 0;

    return {
        programs,
        executed,
        get clearAllCount() {
            return clearAllCount;
        },
        set clearAllCount(_value) {
            clearAllCount = 0;
        },
        async execute(code) {
            executed.push(code);
            if (/^\s*(quietly\s+)?clear\s+all\b/i.test(code)) {
                programs.clear();
                clearAllCount += 1;
                return { success: true, returnCode: 0, output: '' };
            }
            if (/program\s+drop\s+_all/i.test(code)) {
                programs.clear();
                return { success: true, returnCode: 0, output: '' };
            }
            const dropMatch = code.match(/program\s+drop\s+(\w+)/);
            if (dropMatch) {
                programs.delete(dropMatch[1]);
                return { success: true, returnCode: 0, output: '' };
            }
            const defineMatch = code.match(/program\s+(\w+)\s*,/);
            if (defineMatch) {
                programs.add(defineMatch[1]);
                return { success: true, returnCode: 0, output: '' };
            }
            // Real Stata signatures:
            //  - `program list <plugin>` returns 111 for EVERY plugin program
            //    (plugin code cannot be listed), so it must never be used as an
            //    existence test.
            //  - `plugin call <undefined>` returns 199.
            //  - `plugin call <registered plugin>` returns 198 (the plugin's own
            //    argument check) once the program exists.
            const listMatch = code.match(/capture program list\s+(\w+)/);
            if (listMatch) {
                return {
                    success: true,
                    returnCode: 0,
                    output: `__saio_plugin_probe=${programs.has(listMatch[1]) ? 0 : 111}\n`
                };
            }
            const callMatch = code.match(/capture plugin call\s+(\w+)/);
            if (callMatch) {
                lastReturnCode = programs.has(callMatch[1]) ? 198 : 199;
                return {
                    success: true,
                    returnCode: 0,
                    output: ''
                };
            }
            if (/display "__saio_plugin_probe=" _rc/.test(code)) {
                return {
                    success: true,
                    returnCode: 0,
                    output: `__saio_plugin_probe=${lastReturnCode}\n`
                };
            }
            return { success: true, returnCode: 0, output: '' };
        }
    };
}

function loadReader({ stata, capturedBuffer, metadataOutput }) {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
        }
        if (parent && parent.filename === readerPath && request === '../native/stata_process') {
            return {
                isInitialized: () => true,
                beginDatasetCapture: async () => '1:0xfeedface',
                finishDatasetCapture: async () => capturedBuffer,
                cancelDatasetCapture: async () => {}
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[readerPath];
    const reader = require(readerPath);
    Module._load = originalLoad;
    return reader;
}

function buildCapture(columns) {
    // columns: [{ kind: 0|1, type }]; values are fixed: one row.
    const header = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(header, 0);
    header.writeBigUInt64LE(1n, 8);
    header.writeUInt32LE(columns.length, 16);
    const parts = [header];
    for (const column of columns) {
        parts.push(Buffer.from([column.kind]));
        if (column.kind === 0) {
            const cell = Buffer.alloc(9);
            cell[0] = 0;
            cell.writeDoubleLE(1, 1);
            parts.push(cell);
        } else {
            const length = Buffer.alloc(4);
            length.writeUInt32LE(0, 0);
            parts.push(length);
        }
    }
    return Buffer.concat(parts);
}

const SEP = String.fromCharCode(31);

/**
 * A session double: metadata reads are answered from a fixture, everything else
 * goes to the Stata simulator. A single raw execute keeps the fixture visible
 * to every caller (the reader's transaction executor as well as the test).
 */
function createSession(stata, { type = 'double', nobs = 1, metadataAvailable = true } = {}) {
    const metadataOutput = `__SAIO_NOBS__${nobs}\n__SAIO_NVAR__1\n`
        + `__SAIO_META_BEGIN__x${SEP}${type}${SEP}%9.0g${SEP}__SAIO_META_END__\n`;

    async function rawExecute(code, echo, onOutput) {
        if (/st_nobs\(\)/.test(code)) {
            return metadataAvailable
                ? { success: true, returnCode: 0, output: metadataOutput }
                : { success: true, returnCode: 0, output: '' };
        }
        return stata.execute(code, echo, onOutput);
    }

    const session = {
        execute: rawExecute,
        withTransaction: (task) => Promise.resolve(task({ execute: rawExecute })),
        isInitialized: () => true,
        getGeneration: () => 1
    };
    return session;
}

test('re-registers the plugin entry point after clear all removed it', async () => {
    const stata = createStataSimulator();
    const reader = loadReader({
        stata,
        capturedBuffer: buildCapture([{ kind: 0, type: 'double' }])
    });
    const session = createSession(stata);

    // First read registers the plugin.
    const first = await reader.capture(session);
    assert.equal(first.meta.nobs, 1);
    assert.deepEqual([...stata.programs], ['__saio_data_bridge']);

    // The user runs clear all: Stata drops the program, the JS layer cannot know.
    const clearResult = await stata.execute('clear all');
    assert.equal(clearResult.success, true);
    assert.equal(stata.programs.size, 0);

    // The next read must notice the missing entry point and re-register it
    // instead of calling a program that no longer exists.
    const second = await reader.capture(session);
    assert.equal(second.meta.nobs, 1);
    assert.deepEqual(
        [...stata.programs],
        ['__saio_data_bridge'],
        'the plugin must be re-registered after clear all'
    );
    // Only the real capture calls (with a callback pointer) count; the probe
    // uses the dummy pointer `0 1`.
    const captureCalls = stata.executed.filter(
        (code) => /plugin call __saio_data_bridge _all in \d+\/\d+, (?!0 1)/.test(code)
    );
    assert.equal(captureCalls.length, 2, 'both reads must reach the plugin');
});

test('re-registers the plugin entry point after program drop _all', async () => {
    const stata = createStataSimulator();
    const reader = loadReader({
        stata,
        capturedBuffer: buildCapture([{ kind: 1, type: 'str20' }])
    });
    const session = createSession(stata, { type: 'str20' });

    await reader.capture(session);
    await stata.execute('program drop _all');
    assert.equal(stata.programs.size, 0);

    const second = await reader.capture(session);
    assert.equal(second.meta.nobs, 1);
    assert.deepEqual([...stata.programs], ['__saio_data_bridge']);
});

test('reports a plugin load failure instead of returning empty data', async () => {
    const stata = createStataSimulator();
    const reader = loadReader({
        stata,
        capturedBuffer: buildCapture([{ kind: 0, type: 'double' }])
    });
    const session = createSession(stata);
    const pluginDefinition = stata.execute;
    stata.execute = async (code, echo, onOutput) => {
        if (/program __saio_data_bridge\s*,/.test(code)) {
            return { success: false, returnCode: 199, output: '', error: 'plugin not found' };
        }
        return pluginDefinition(code, echo, onOutput);
    };

    await assert.rejects(
        () => reader.capture(session),
        (error) => {
            assert.ok(error instanceof Error);
            assert.ok(
                /reader|plugin|无法|Unable/i.test(error.message),
                `expected a descriptive plugin failure, got: ${JSON.stringify(error.message)}`
            );
            assert.equal(error.returnCode, 199, 'the Stata return code must survive');
            return true;
        }
    );
});

test('isPluginRegistered reads the live session probe, not a JS cache', async () => {
    const stata = createStataSimulator();
    const reader = loadReader({ stata, capturedBuffer: Buffer.alloc(0) });
    const session = createSession(stata);

    await stata.execute('program __saio_data_bridge, plugin using("/tmp/x.plugin")');
    const present = await reader.isPluginRegistered(session);
    assert.equal(present.present, true);
    assert.equal(present.sessionError, null);

    await stata.execute('clear all');
    const gone = await reader.isPluginRegistered(session);
    assert.equal(gone.present, false, 'clear all removes the entry point and the probe must notice');
    assert.equal(gone.sessionError, null);
});

test('a registered plugin is recognised even though program list returns 111', async () => {
    // Regression: the reader used `capture program list <name>` as its existence
    // probe. Real Stata answers 111 for every plugin program, so every read
    // failed with "Unable to load the Stata data reader" on a correctly
    // registered plugin.
    const stata = createStataSimulator();
    const reader = loadReader({
        stata,
        capturedBuffer: buildCapture([{ kind: 0, type: 'double' }])
    });
    const session = createSession(stata);

    await stata.execute('program __saio_data_bridge, plugin using("/tmp/x.plugin")');
    const probe = await reader.isPluginRegistered(session);
    assert.equal(probe.present, true, 'a loaded plugin must be reported as present');
    assert.equal(probe.exitCode, 198);
    assert.ok(stata.executed.some(code => code === 'display "__saio_plugin_probe=" _rc'));
    assert.ok(stata.executed.every(code => !code.includes('\n')), 'native Stata accepts one command per execute call');

    // The registration path must not try to re-register (and must not throw).
    const data = await reader.capture(session);
    assert.equal(data.meta.nobs, 1);
});

test('an unregistered plugin is reported as missing instead of present', async () => {
    const stata = createStataSimulator();
    const reader = loadReader({
        stata,
        capturedBuffer: buildCapture([{ kind: 0, type: 'double' }])
    });
    const session = createSession(stata);

    const probe = await reader.isPluginRegistered(session);
    assert.equal(probe.present, false, 'a missing entry point must be detected');
    assert.equal(probe.exitCode, 199);
});
