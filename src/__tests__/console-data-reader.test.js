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
const { parseCapture } = require('../modules/runCode/embeddedConsole/dataViewer/consoleDataReader');
const { getSnapshotFromData, getMoreFromData } = require('../modules/runCode/embeddedConsole/dataViewer/directDtaStore');
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
