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
const {
    getSnapshotFromData,
    getMoreFromData,
    formatCellValue
} = require('../modules/runCode/embeddedConsole/dataViewer/directDtaStore');
Module._load = originalLoad;

function makeData(values, { type = 'double', format = '%9.0g' } = {}) {
    const nobs = values.length;
    return {
        meta: {
            headers: ['v'],
            types: [type],
            formats: [format],
            labels: [''],
            nobs
        },
        columns: { v: type === 'double' ? Float64Array.from(values) : values.slice() },
        missing: { v: new Uint8Array(nobs) }
    };
}

function firstValue(data) {
    return getSnapshotFromData(data, 'Stata memory', 10, '').dataRows[0].values[0];
}

test('very small numbers keep their precision instead of being rounded to zero', () => {
    const value = firstValue(makeData([1e-8]));
    assert.equal(value, 1e-8);
    assert.notEqual(value, 0);
});

test('six-decimal magnitude is not a display bottleneck for stored values', () => {
    const samples = [
        0.123456789012345,
        123456789.123456789,
        1.7976931348623157e308,
        5e-324,
        -0.0000001234
    ];
    const data = makeData(samples);
    const snapshot = getSnapshotFromData(data, 'Stata memory', 10, '');
    assert.deepEqual(snapshot.dataRows[0].values, [samples[0]]);
    assert.deepEqual(
        snapshot.dataRows.map((row) => row.values[0]),
        samples,
        'the data layer must not round stored values'
    );
});

test('large values are not multiplied out of range', () => {
    const huge = 8.98e307;
    const value = firstValue(makeData([huge]));
    assert.equal(value, huge);
    assert.ok(Number.isFinite(value));
});

test('display formatting is separate from the stored value', () => {
    // The snapshot keeps the raw number...
    const raw = firstValue(makeData([1e-8]));
    assert.equal(raw, 1e-8);
    // ...while display formatting is an explicit, presentation-only step.
    assert.equal(typeof formatCellValue, 'function');
    // Exponential notation outside the readable fixed-notation range, plain
    // decimal inside it, and integers without a decimal point.
    assert.equal(formatCellValue(1e-8), '1.00e-8');
    assert.equal(formatCellValue(0.1 + 0.2), '0.3');
    assert.equal(formatCellValue(123456789.12345679), '123456789.123');
    assert.equal(formatCellValue(1.5e13), '1.50e+13');
    assert.equal(formatCellValue(42), '42');
    assert.equal(formatCellValue(-0.0000001234), '-1.23e-7');
    // Stata's "." is never printed as a number.
    assert.equal(formatCellValue(8.98846567431158e307), '.');
    // A `float` column is shown at float precision, a `double` at double
    // precision: Stata's own default display behaves the same way.
    assert.equal(formatCellValue(3.5799999237060547, 'float'), '3.58');
    assert.equal(formatCellValue(3.5799999237060547, 'double'), '3.57999992371');
});

test('copying a cell uses the displayed value the user can see', () => {
    const data = makeData([0.30000000000000004, 1e-8]);
    const snapshot = getSnapshotFromData(data, 'Stata memory', 10, '');
    const copied = snapshot.dataRows.map((row) => formatCellValue(row.values[0]));
    assert.deepEqual(copied, ['0.3', '1.00e-8']);
});

test('missing values are shown as "." and never as a rounded number', () => {
    const data = makeData([1, 2]);
    data.missing.v[1] = 1;
    const snapshot = getSnapshotFromData(data, 'Stata memory', 10, '');
    assert.equal(snapshot.dataRows[1].values[0], null, 'the data layer reports null for missing');
    assert.equal(formatCellValue(snapshot.dataRows[1].values[0]), '.');
});

test('paging keeps the same precision as the first page', () => {
    const data = makeData([1e-8, 2e-8, 3e-8]);
    const more = getMoreFromData(data, 1, 10, '');
    assert.deepEqual(more.map((row) => row.values[0]), [2e-8, 3e-8]);
});

test('the formatter survives serialization into the webview', () => {
    // The webview runs its own copy of this function, produced by toString(),
    // so it must not depend on any module-scope helper.
    const { formatCellValue: shared } = require(
        '../modules/runCode/embeddedConsole/dataViewer/directDtaStore'
    );
    const inWebview = new Function(`return ${shared.toString()}`)();
    const samples = [null, undefined, 0, 42, 1e-8, 0.1 + 0.2, 123456789.12345679, 8.98846567431158e307, '', '中文'];
    for (const sample of samples) {
        assert.equal(inWebview(sample), shared(sample), `mismatch for ${JSON.stringify(sample)}`);
    }
});
