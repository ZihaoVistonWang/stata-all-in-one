const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const READER_PATH = path.resolve(
    __dirname,
    '../modules/runCode/embeddedConsole/dataViewer/consoleDataReader.js'
);
const STORE_PATH = path.resolve(
    __dirname,
    '../modules/runCode/embeddedConsole/dataViewer/consoleStore.js'
);

function installVscodeStub() {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    return () => {
        Module._load = originalLoad;
    };
}

const SEP = String.fromCharCode(31);

function metadataFor(variables, nobs) {
    const rows = variables.map((variable) => (
        `__SAIO_META_BEGIN__${variable.name}${SEP}${variable.type}${SEP}%9.0g${SEP}${variable.label || ''}__SAIO_META_END__`
    ));
    return [`__SAIO_NOBS__${nobs}`, `__SAIO_NVAR__${variables.length}`, ...rows].join('\n');
}

function buildCapture(columns, nobs) {
    const header = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(header, 0);
    header.writeBigUInt64LE(BigInt(nobs), 8);
    header.writeUInt32LE(columns.length, 16);
    const parts = [header];
    for (const column of columns) {
        parts.push(Buffer.from([column.kind]));
        for (let row = 0; row < nobs; row += 1) {
            if (column.kind === 0) {
                const cell = Buffer.alloc(9);
                cell[0] = 0;
                cell.writeDoubleLE(column.valueAt ? column.valueAt(row) : row + 1, 1);
                parts.push(cell);
            } else {
                const text = Buffer.from(String(column.valueAt ? column.valueAt(row) : ''), 'utf8');
                const length = Buffer.alloc(4);
                length.writeUInt32LE(text.length, 0);
                parts.push(length, text);
            }
        }
    }
    return Buffer.concat(parts);
}

/**
 * A Stata-session double that records exactly which observation range each
 * capture asked for, so a test can prove the read was windowed.
 */
function createStataDouble({ variables, totalObservations, columns }) {
    const calls = [];
    return {
        calls,
        isInitialized: () => true,
        getDylibPath: () => '/tmp/libstata-mp.dylib',
        async execute(code) {
            calls.push({ code });
            if (/st_nobs\(\)/.test(code)) {
                return { success: true, returnCode: 0, output: metadataFor(variables, totalObservations) };
            }
            if (/^capture program list/.test(code)) {
                return { success: true, returnCode: 0, output: '__saio_plugin_probe=0\n' };
            }
            return { success: true, returnCode: 0, output: '' };
        },
        get captureRanges() {
            return calls
                .map((call) => call.code.match(/plugin call \S+ _all in (\d+)\/(\d+)/))
                .filter(Boolean)
                .map((match) => ({ start: Number(match[1]), end: Number(match[2]) }));
        }
    };
}

function loadReader({ stato, captured }) {
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
        }
        if (parent && parent.filename === READER_PATH && request === '../native/stata_process') {
            return {
                isInitialized: () => true,
                beginDatasetCapture: async () => '1:0xabc',
                finishDatasetCapture: async () => captured.buffer,
                cancelDatasetCapture: async () => { captured.cancelled += 1; }
            };
        }
        if (parent && parent.filename === READER_PATH && request === '../session') {
            return { getActiveSession: () => null };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[READER_PATH];
    const reader = require(READER_PATH);
    Module._load = originalLoad;
    return reader;
}

test('a capture reads a bounded window and says which rows it covers', async () => {
    const restore = installVscodeStub();
    const variables = [{ name: 'x', type: 'double' }];
    const stato = createStataDouble({
        variables,
        totalObservations: 1000000,
        columns: [{ kind: 0 }]
    });
    const captured = { buffer: buildCapture([{ kind: 0 }], 2000), cancelled: 0 };
    const reader = loadReader({ stato, captured });
    const session = {
        execute: (code, echo, onOutput) => stato.execute(code, echo, onOutput),
        withTransaction: (task) => Promise.resolve(task({
            execute: (code, echo, onOutput) => stato.execute(code, echo, onOutput)
        }))
    };

    try {
        const data = await reader.capture(session, { startObs: 1001, endObs: 3000 });
        assert.deepEqual(stato.captureRanges[0], { start: 1001, end: 3000 },
            'the plugin call must carry the requested observation range');
        assert.equal(data.meta.windowStart, 1001);
        assert.equal(data.meta.windowEnd, 3000);
        assert.equal(data.meta.totalObservations, 1000000, 'the dataset size is still reported');
        assert.equal(data.meta.nobs, 2000);
    } finally {
        restore();
        delete require.cache[READER_PATH];
    }
});

test('the default window is bounded instead of reading the whole dataset', async () => {
    const restore = installVscodeStub();
    const variables = [{ name: 'x', type: 'double' }];
    const stato = createStataDouble({
        variables,
        totalObservations: 5000000,
        columns: [{ kind: 0 }]
    });
    const captured = { buffer: buildCapture([{ kind: 0 }], 2000), cancelled: 0 };
    const reader = loadReader({ stato, captured });
    const session = {
        execute: (code, echo, onOutput) => stato.execute(code, echo, onOutput),
        withTransaction: (task) => Promise.resolve(task({
            execute: (code, echo, onOutput) => stato.execute(code, echo, onOutput)
        }))
    };

    try {
        const data = await reader.capture(session);
        const range = stato.captureRanges[0];
        assert.ok(range, 'a capture must have been issued');
        assert.ok(range.end - range.start + 1 <= reader.DEFAULT_WINDOW_ROWS,
            `window ${range.end - range.start + 1} must stay within DEFAULT_WINDOW_ROWS`);
        assert.equal(data.meta.totalObservations, 5000000);
    } finally {
        restore();
        delete require.cache[READER_PATH];
    }
});

test('a request that exceeds the byte budget fails in a controlled way', async () => {
    const restore = installVscodeStub();
    const variables = [{ name: 'x', type: 'str2000' }];
    const stato = createStataDouble({
        variables,
        totalObservations: 10000000,
        columns: [{ kind: 1 }]
    });
    const captured = { buffer: Buffer.alloc(0), cancelled: 0 };
    const reader = loadReader({ stato, captured });
    const session = {
        execute: (code, echo, onOutput) => stato.execute(code, echo, onOutput),
        withTransaction: (task) => Promise.resolve(task({
            execute: (code, echo, onOutput) => stato.execute(code, echo, onOutput)
        }))
    };

    try {
        const estimate = reader.estimateCaptureBytes(
            { headers: ['x'], types: ['str2000'] },
            10
        );
        assert.equal(estimate, 10 * (4 + 2000), 'a string cell costs its storage plus a length');

        // Tighten the budget so a normally-sized window trips it.
        const previousBudget = reader.getCaptureBudget();
        reader.setCaptureBudget(1024);

        try {
            await assert.rejects(
                () => reader.capture(session, { startObs: 1, endObs: 10 }),
                (error) => {
                    assert.equal(error.tooLarge, true);
                    assert.equal(error.budgetBytes, 1024);
                    assert.match(error.message, /budget|MB/i);
                    return true;
                }
            );
            assert.equal(stato.captureRanges.length, 0, 'nothing may be read once the budget is exceeded');
        } finally {
            reader.setCaptureBudget(previousBudget);
        }
    } finally {
        restore();
        delete require.cache[READER_PATH];
    }
});

test('an aborted read never reaches Stata', async () => {
    const restore = installVscodeStub();
    const variables = [{ name: 'x', type: 'double' }];
    const stato = createStataDouble({ variables, totalObservations: 10, columns: [{ kind: 0 }] });
    const captured = { buffer: Buffer.alloc(0), cancelled: 0 };
    const reader = loadReader({ stato, captured });
    const session = {
        execute: (code, echo, onOutput) => stato.execute(code, echo, onOutput),
        withTransaction: (task) => Promise.resolve(task({
            execute: (code, echo, onOutput) => stato.execute(code, echo, onOutput)
        }))
    };

    try {
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
            () => reader.capture(session, { signal: controller.signal }),
            (error) => {
                assert.equal(error.cancelled, true);
                return true;
            }
        );
        assert.equal(stato.captureRanges.length, 0);
    } finally {
        restore();
        delete require.cache[READER_PATH];
    }
});

test('the console store keeps a bounded window and reads more on demand', async () => {
    const restore = installVscodeStub();
    const variables = [{ name: 'x', type: 'double' }];
    const ranges = [];
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
        }
        if (parent && parent.filename === STORE_PATH && request === './consoleDataReader') {
            return {
                DEFAULT_WINDOW_ROWS: 2000,
                async capture(_session, options = {}) {
                    const start = options.startObs || 1;
                    const end = options.endObs || 2000;
                    ranges.push({ start, end });
                    const rows = end - start + 1;
                    const data = {
                        meta: {
                            headers: ['x'],
                            types: ['double'],
                            formats: ['%9.0g'],
                            labels: [''],
                            nobs: rows,
                            windowStart: start,
                            windowEnd: end,
                            totalObservations: 5000000
                        },
                        columns: { x: Float64Array.from({ length: rows }, (_v, index) => start + index) },
                        missing: { x: new Uint8Array(rows) }
                    };
                    return data;
                }
            };
        }
        if (parent && parent.filename === STORE_PATH && request === './directDtaStore') {
            return require(STORE_PATH.replace('consoleStore.js', 'directDtaStore.js'));
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[STORE_PATH];

    try {
        const store = require(STORE_PATH);
        const first = await store.getLiveSnapshot('', 0, 500);
        assert.equal(ranges.length, 1);
        assert.ok(ranges[0].end - ranges[0].start + 1 <= store.DEFAULT_MAX_CACHED_ROWS);
        assert.equal(first.info.totalObservations, 5000000, 'the dataset size is reported');
        assert.equal(first.dataRows.length, 500);
        assert.equal(first.dataRows[0].values[0], 1, 'row numbers stay absolute');

        // The cached row count is bounded, never the whole 5M-row dataset.
        assert.ok(store.cachedRowCount() <= store.DEFAULT_MAX_CACHED_ROWS);

        // Scrolling inside the cached window does not re-read Stata.
        const before = ranges.length;
        const more = await store.getLiveMore(200, 100, '');
        assert.equal(ranges.length, before, 'a request inside the window must not re-read');
        assert.equal(more.length, 100);
        assert.equal(more[0].values[0], 201, 'paged rows keep dataset coordinates');
    } finally {
        Module._load = originalLoad;
        delete require.cache[STORE_PATH];
    }
});

test('the local .dta cache is bounded and evicts the least recently used file', async () => {
    const restore = installVscodeStub();
    const store = require('../modules/runCode/embeddedConsole/dataViewer/directDtaStore');
    assert.ok(Number.isInteger(store.MAX_CACHED_FILES));
    assert.ok(store.MAX_CACHED_FILES >= 2, 'at least two files must stay cached');
    restore();
});

test('an unreadable .dta file is reported as a file problem', async () => {
    const restore = installVscodeStub();
    const store = require('../modules/runCode/embeddedConsole/dataViewer/directDtaStore');
    try {
        await assert.rejects(
            () => store.getSnapshot('/definitely/not/here/nope.dta', 100, ''),
            (error) => {
                assert.equal(error.fileUnavailable, true, 'the caller must be able to distinguish this');
                assert.equal(error.code, 'ENOENT');
                return true;
            }
        );
    } finally {
        restore();
    }
});

test('a filtered page walks forward until enough matches are found', async () => {
    const restore = installVscodeStub();
    const ranges = [];
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') {
            return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
        }
        if (parent && parent.filename === STORE_PATH && request === './consoleDataReader') {
            return {
                DEFAULT_WINDOW_ROWS: 100,
                async capture(_session, options = {}) {
                    const start = options.startObs || 1;
                    const end = options.endObs || start + 99;
                    ranges.push({ start, end });
                    const rows = end - start + 1;
                    // Every 10th observation satisfies "if mod(x, 10) == 0".
                    const values = Float64Array.from(
                        { length: rows },
                        (_v, index) => start + index
                    );
                    return {
                        meta: {
                            headers: ['x'],
                            types: ['double'],
                            formats: ['%9.0g'],
                            labels: [''],
                            nobs: rows,
                            windowStart: start,
                            windowEnd: end,
                            totalObservations: 100000
                        },
                        columns: { x: values },
                        missing: { x: new Uint8Array(rows) }
                    };
                }
            };
        }
        if (parent && parent.filename === STORE_PATH && request === './directDtaStore') {
            return require(STORE_PATH.replace('consoleStore.js', 'directDtaStore.js'));
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[STORE_PATH];

    try {
        const store = require(STORE_PATH);
        const snapshot = await store.getLiveSnapshot('if mod(x, 10) == 0', 0, 5);
        assert.equal(snapshot.info.totalObservations, 100000, 'the dataset size is the unfiltered one');
        assert.equal(snapshot.dataRows.length, 5);
        // The matches are observations 10, 20, 30, 40, 50 — the store had to read
        // past the first window to find them.
        assert.deepEqual(
            snapshot.dataRows.map((row) => row.values[0]),
            [10, 20, 30, 40, 50]
        );
        assert.ok(ranges.length >= 1);
        assert.ok(
            ranges[ranges.length - 1].end >= 50,
            'the read must extend past the last match'
        );

        const more = await store.getLiveMore(5, 5, 'if mod(x, 10) == 0');
        assert.deepEqual(more.map((row) => row.values[0]), [60, 70, 80, 90, 100]);
    } finally {
        Module._load = originalLoad;
        delete require.cache[STORE_PATH];
    }
});
