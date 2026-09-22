const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { VIEWER_STATUS, classifySnapshot, classifyError, keepsPreviousView } = require(
    '../modules/runCode/embeddedConsole/dataViewer/status'
);
const { parseCapture, parseMetadataOutput } = require(
    '../modules/runCode/embeddedConsole/dataViewer/consoleDataReader'
);
Module._load = originalLoad;

function snapshot({ headers = ['x'], nobs = 1, observations = 1, hasFilter = false } = {}) {
    return {
        meta: { headers, nobs },
        info: { observations, totalObservations: nobs },
        hasFilter,
        filterText: hasFilter ? 'if x > 0' : ''
    };
}

test('classifies an empty session, a zero-observation dataset and an empty filter apart', () => {
    assert.equal(
        classifySnapshot(snapshot({ headers: [], nobs: 0, observations: 0 })),
        VIEWER_STATUS.NO_DATASET
    );
    assert.equal(
        classifySnapshot(snapshot({ nobs: 0, observations: 0 })),
        VIEWER_STATUS.ZERO_OBSERVATIONS
    );
    assert.equal(
        classifySnapshot(snapshot({ nobs: 100, observations: 0, hasFilter: true }), { filterText: 'if x > 0' }),
        VIEWER_STATUS.NO_MATCHES
    );
    assert.equal(classifySnapshot(snapshot({ nobs: 100, observations: 5 })), VIEWER_STATUS.OK);
    assert.equal(classifySnapshot(null), VIEWER_STATUS.READ_FAILED);
});

test('classifies a lost session and an unreadable file apart from a read failure', () => {
    assert.equal(classifyError(new Error('generic')), VIEWER_STATUS.READ_FAILED);
    assert.equal(classifyError(Object.assign(new Error('gone'), { sessionUnavailable: true })), VIEWER_STATUS.SESSION_UNAVAILABLE);
    assert.equal(classifyError(Object.assign(new Error('gone'), { sessionLost: true })), VIEWER_STATUS.SESSION_UNAVAILABLE);
    assert.equal(classifyError(Object.assign(new Error('no file'), { code: 'ENOENT' })), VIEWER_STATUS.FILE_UNAVAILABLE);
});

test('a failed status keeps the previous view instead of blanking it', () => {
    assert.equal(keepsPreviousView(VIEWER_STATUS.READ_FAILED), true);
    assert.equal(keepsPreviousView(VIEWER_STATUS.SESSION_UNAVAILABLE), true);
    assert.equal(keepsPreviousView(VIEWER_STATUS.NO_DATASET), false);
    assert.equal(keepsPreviousView(VIEWER_STATUS.NO_MATCHES), false);
});

test('rejects a metadata response that never reported the observation count', () => {
    const separator = String.fromCharCode(31);
    assert.throws(
        () => parseMetadataOutput(`__SAIO_META_BEGIN__x${separator}double${separator}%9.0g${separator}__SAIO_META_END__`),
        /metadata/i
    );
    // Zero observations is a legitimate answer and must still parse.
    const empty = parseMetadataOutput('__SAIO_NOBS__0\n');
    assert.deepEqual(empty, { headers: [], types: [], formats: [], labels: [], nobs: 0 });
});

test('rejects a capture buffer whose string length exceeds the payload', () => {
    const header = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(header, 0);
    header.writeBigUInt64LE(1n, 8);
    header.writeUInt32LE(1, 16);
    // Claims 100 bytes of string data but only carries 2.
    const length = Buffer.alloc(4);
    length.writeUInt32LE(100, 0);
    const truncated = Buffer.concat([header, Buffer.from([1]), length, Buffer.from('ab', 'utf8')]);

    assert.throws(
        () => parseCapture(truncated, {
            headers: ['s'],
            types: ['str100'],
            formats: ['%100s'],
            labels: ['']
        }),
        /truncated|invalid/i
    );
});

test('rejects a capture buffer with trailing bytes or a mismatched variable count', () => {
    const metadata = { headers: ['x'], types: ['double'], formats: ['%9.0g'], labels: [''] };
    const header = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(header, 0);
    header.writeBigUInt64LE(1n, 8);
    header.writeUInt32LE(2, 16); // claims two variables, metadata has one
    assert.throws(
        () => parseCapture(Buffer.concat([header, Buffer.from([0]), Buffer.alloc(9)]), metadata),
        /match|metadata/i
    );

    const header2 = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(header2, 0);
    header2.writeBigUInt64LE(1n, 8);
    header2.writeUInt32LE(1, 16);
    const cell = Buffer.alloc(9);
    cell[0] = 0;
    cell.writeDoubleLE(3, 1);
    assert.throws(
        () => parseCapture(Buffer.concat([header2, Buffer.from([0]), cell, Buffer.from([0xff])]), metadata),
        /invalid/i
    );
});

test('rejects a capture whose numeric variable has a non-numeric storage type', () => {
    const header = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(header, 0);
    header.writeBigUInt64LE(1n, 8);
    header.writeUInt32LE(1, 16);
    const cell = Buffer.alloc(9);
    cell[0] = 0;
    cell.writeDoubleLE(3, 1);
    assert.throws(
        () => parseCapture(Buffer.concat([header, Buffer.from([0]), cell]), {
            headers: ['s'],
            types: ['str10'],
            formats: ['%10s'],
            labels: ['']
        }),
        /match|metadata/i
    );
});

test('accepts a dataset with variables but zero observations', () => {
    const buffer = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(buffer, 0);
    buffer.writeBigUInt64LE(0n, 8);
    buffer.writeUInt32LE(2, 16);
    const data = parseCapture(Buffer.concat([buffer, Buffer.from([0]), Buffer.from([1])]), {
        headers: ['x', 'name'],
        types: ['double', 'str10'],
        formats: ['%9.0g', '%10s'],
        labels: ['', '']
    });
    assert.equal(data.meta.nobs, 0);
    assert.deepEqual(data.meta.headers, ['x', 'name']);
    assert.equal(classifySnapshot({ meta: data.meta, info: { observations: 0 } }), VIEWER_STATUS.ZERO_OBSERVATIONS);
});
