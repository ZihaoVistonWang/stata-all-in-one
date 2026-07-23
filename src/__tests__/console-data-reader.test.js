const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'vscode') {
        return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const {
    parseCapture,
    parseMetadataOutput
} = require('../modules/runCode/embeddedConsole/dataViewer/consoleDataReader');
const {
    getSnapshotFromData,
    getMoreFromData,
    getColumnAutoFitValueFromData
} = require('../modules/runCode/embeddedConsole/dataViewer/directDtaStore');
Module._load = originalLoad;

test('parses the native Stata data buffer into typed columnar data', () => {
    const chunks = [];
    const header = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(header, 0);
    header.writeBigUInt64LE(2n, 8);
    header.writeUInt32LE(2, 16);
    chunks.push(header, Buffer.from([0]));
    const numeric = Buffer.alloc(18);
    numeric[0] = 0;
    numeric.writeDoubleLE(12.5, 1);
    numeric[9] = 1;
    numeric.writeDoubleLE(0, 10);
    chunks.push(numeric, Buffer.from([1]));
    const text = Buffer.from('中文', 'utf8');
    const strings = Buffer.alloc(4 + text.length + 4);
    strings.writeUInt32LE(text.length, 0);
    text.copy(strings, 4);
    strings.writeUInt32LE(0, 4 + text.length);
    chunks.push(strings);

    const data = parseCapture(Buffer.concat(chunks), {
        headers: ['x', 'name'],
        types: ['double', 'str20'],
        formats: ['%9.0g', '%20s'],
        labels: ['value', 'label']
    });
    assert.deepEqual(Array.from(data.columns.x), [12.5, 0]);
    assert.deepEqual(Array.from(data.missing.x), [0, 1]);
    assert.deepEqual(data.columns.name, ['中文', '']);
    assert.equal(data.meta.nobs, 2);
});

test('keeps long UTF-8 string values intact in the native capture buffer', () => {
    const value = '产业链'.repeat(300);
    const encoded = Buffer.from(value, 'utf8');
    const header = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(header, 0);
    header.writeBigUInt64LE(1n, 8);
    header.writeUInt32LE(1, 16);
    const length = Buffer.alloc(4);
    length.writeUInt32LE(encoded.length, 0);

    const data = parseCapture(
        Buffer.concat([header, Buffer.from([1]), length, encoded]),
        {
            headers: ['long_text'],
            types: ['strL'],
            formats: ['%9s'],
            labels: ['Long text']
        }
    );

    assert.equal(data.columns.long_text[0], value);
});

test('reassembles wrapped UTF-8 variable labels from Stata metadata output', () => {
    const separator = String.fromCharCode(31);
    const output = [
        '__SAIO_NOBS__5263',
        `__SAIO_META_BEGIN__chain_stage${separator}long${separator}%12.0g${separator}产业链环节(1=生产，2=加工，3=制造，4=流通，5=服务，6=其`,
        '> 他)__SAIO_META_E',
        '> ND__'
    ].join('\n');

    assert.deepEqual(parseMetadataOutput(output), {
        headers: ['chain_stage'],
        types: ['long'],
        formats: ['%12.0g'],
        labels: ['产业链环节(1=生产，2=加工，3=制造，4=流通，5=服务，6=其他)'],
        nobs: 5263
    });
});

test('uses the captured Console data for local filtering and paging', () => {
    const data = {
        meta: {
            headers: ['id', 'name'],
            types: ['long', 'str10'],
            formats: ['%9.0g', '%10s'],
            labels: ['', ''],
            nobs: 3
        },
        columns: { id: new Int32Array([1, 2, 3]), name: ['a', 'b', 'c'] },
        missing: { id: new Uint8Array(3), name: new Uint8Array(3) }
    };
    const first = getSnapshotFromData(data, 'Stata memory', 1, 'id name if id >= 2');
    assert.equal(first.info.observations, 2);
    assert.deepEqual(first.dataRows, [{ rowNum: 2, values: [2, 'b'] }]);
    assert.deepEqual(getMoreFromData(data, 1, 10, 'id name if id >= 2'), [
        { rowNum: 3, values: [3, 'c'] }
    ]);
});

test('finds the widest full-column value beyond the currently loaded page', () => {
    const data = {
        meta: {
            headers: ['id', 'name'],
            types: ['long', 'strL'],
            formats: ['%9.0g', '%9s'],
            labels: ['', ''],
            nobs: 3
        },
        columns: {
            id: new Int32Array([1, 2, 3]),
            name: ['短', '中等内容', '尚未加载但属于整列的最长中文内容']
        },
        missing: {
            id: new Uint8Array(3),
            name: new Uint8Array(3)
        }
    };

    const firstPage = getSnapshotFromData(data, 'Stata memory', 1, '');
    assert.equal(firstPage.dataRows[0].values[1], '短');
    assert.equal(
        getColumnAutoFitValueFromData(data, 'name', ''),
        '尚未加载但属于整列的最长中文内容'
    );
});
