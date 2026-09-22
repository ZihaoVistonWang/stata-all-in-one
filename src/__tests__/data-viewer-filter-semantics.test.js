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
const { compileFilter } = require(
    '../modules/runCode/embeddedConsole/dataViewer/dtaFilterCompiler'
);
const { splitFilterSpec } = require(
    '../modules/runCode/embeddedConsole/dataViewer/provider'
);
const { getSnapshotFromData } = require(
    '../modules/runCode/embeddedConsole/dataViewer/directDtaStore'
);
Module._load = originalLoad;

/**
 * Columnar dataset in the shape both read paths produce.
 * `x` has a large positive value that Stata stores as a missing value; `s` has
 * an empty string, which Stata treats as a missing string.
 */
function makeData() {
    const headers = ['x', 's', 'grp'];
    const nobs = 5;
    return {
        meta: {
            headers,
            types: ['double', 'str10', 'byte'],
            formats: ['%9.0g', '%10s', '%8.0g'],
            labels: ['', '', ''],
            nobs
        },
        columns: {
            // row 4 is Stata's . (the largest double)
            x: Float64Array.from([1, 2, 3, 8.98846567431158e307, 5]),
            // row 1 is "" which Stata treats as missing for string functions
            s: ['', 'b', 'c', 'd', ''],
            grp: Int8Array.from([0, 1, 1, 0, 1])
        },
        missing: {
            x: new Uint8Array([0, 0, 0, 1, 0]),
            s: new Uint8Array([1, 0, 0, 0, 1]),
            grp: new Uint8Array([0, 0, 0, 0, 0])
        }
    };
}

function rowsMatching(expression) {
    const data = makeData();
    const { fn } = compileFilter(expression, data);
    const rows = [];
    for (let row = 0; row < data.meta.nobs; row += 1) {
        if (fn(row)) rows.push(row);
    }
    return rows;
}

test('if x > 0 keeps observations whose x is missing, like Stata', () => {
    // Stata: missing is larger than every non-missing numeric value.
    assert.deepEqual(rowsMatching('x > 0'), [0, 1, 2, 3, 4]);
    assert.deepEqual(rowsMatching('x < .'), [0, 1, 2, 4]);
    assert.deepEqual(rowsMatching('x == .'), [3]);
    assert.deepEqual(rowsMatching('x >= .'), [3]);
    assert.deepEqual(rowsMatching('x > 100'), [3]);
    assert.deepEqual(rowsMatching('x < 3'), [0, 1]);
});

test('missing() matches both numeric and string missing values', () => {
    assert.deepEqual(rowsMatching('missing(x)'), [3]);
    assert.deepEqual(rowsMatching('missing(s)'), [0, 4]);
    assert.deepEqual(rowsMatching('!missing(x)'), [0, 1, 2, 4]);
    assert.deepEqual(rowsMatching('missing(x, s)'), [0, 3, 4]);
});

test('string comparisons treat the empty string as missing', () => {
    assert.deepEqual(rowsMatching('s == ""'), [0, 4]);
    assert.deepEqual(rowsMatching('s != ""'), [1, 2, 3]);
    assert.deepEqual(rowsMatching('s == "b"'), [1]);
});

test('if _n and in ranges select observations by position', () => {
    const data = makeData();
    const firstTwo = compileFilter('_n <= 2', data).fn;
    assert.deepEqual(
        [0, 1, 2, 3, 4].filter((row) => firstTwo(row)),
        [0, 1],
        '_n must start at 1'
    );
    const even = compileFilter('mod(_n, 2) == 0', data).fn;
    assert.deepEqual([0, 1, 2, 3, 4].filter((row) => even(row)), [1, 3]);
});

test('if _merge == 1 works for the reported merge workflow', () => {
    const data = {
        meta: {
            headers: ['_merge', 'id'],
            types: ['byte', 'long'],
            formats: ['%8.0g', '%9.0g'],
            labels: ['', ''],
            nobs: 4
        },
        columns: { _merge: Int8Array.from([1, 2, 3, 1]), id: Int32Array.from([10, 20, 30, 40]) },
        missing: { _merge: new Uint8Array(4), id: new Uint8Array(4) }
    };
    const { fn } = compileFilter('_merge==1', data);
    assert.deepEqual([0, 1, 2, 3].filter((row) => fn(row)), [0, 3]);
});

test('unsupported expressions raise a clear error instead of silently meaning something else', () => {
    const data = makeData();
    assert.throws(() => compileFilter('x + ', data), /error|expected|unexpected/i);
    assert.throws(() => compileFilter('nosuchvar > 1', data), /Unknown variable/i);
    assert.throws(() => compileFilter('nosuchfun(x)', data), /Unknown function/i);
});

test('variable lists accept _all, ranges and wildcards', () => {
    assert.deepEqual(splitFilterSpec('_all if x > 0').varList, '_all');
    assert.deepEqual(splitFilterSpec('x-s if x > 0').varList, 'x-s');
    assert.deepEqual(splitFilterSpec('s* if x > 0').varList, 's*');
});

test('a snapshot reports the unfiltered dataset size alongside the match count', () => {
    const data = makeData();
    const all = getSnapshotFromData(data, 'Stata memory', 500, '');
    assert.equal(all.info.observations, 5);
    assert.equal(all.info.totalObservations, 5);

    // Stata's missing value is larger than every non-missing value, so a filter
    // that only excludes small values still keeps it — and a filter that no
    // observation can satisfy reports zero matches, not an empty dataset.
    assert.equal(getSnapshotFromData(data, 'Stata memory', 500, 'if x > 100000').info.observations, 1);
    const none = getSnapshotFromData(data, 'Stata memory', 500, 'if x < 0');
    assert.equal(none.info.observations, 0);
    assert.equal(none.info.totalObservations, 5, 'zero matches is not an empty dataset');
    assert.equal(none.hasFilter, true);
});

test('an in-range window restricts which observations are candidates', () => {
    const data = makeData();
    const window = getSnapshotFromData(data, 'Stata memory', 500, 'in 2/4');
    assert.deepEqual(window.dataRows.map((row) => row.rowNum), [2, 3, 4]);
    assert.equal(window.info.observations, 3);
    assert.equal(window.info.totalObservations, 5);
});

test('common Stata varlist and observation syntax is accepted', () => {
    const data = makeData();

    // br _all
    const all = getSnapshotFromData(data, 'Stata memory', 500, '_all');
    assert.deepEqual(all.dataColumns, ['x', 's', 'grp']);

    // variable range
    const range = getSnapshotFromData(data, 'Stata memory', 500, 'x-s');
    assert.deepEqual(range.dataColumns, ['x', 's']);

    // wildcard
    const wildcard = getSnapshotFromData(data, 'Stata memory', 500, 's*');
    assert.deepEqual(wildcard.dataColumns, ['s']);

    // if _n <= 2
    const firstTwo = getSnapshotFromData(data, 'Stata memory', 500, 'if _n <= 2');
    assert.deepEqual(firstTwo.dataRows.map((row) => row.rowNum), [1, 2]);

    // if x < .
    const belowMissing = getSnapshotFromData(data, 'Stata memory', 500, 'if x < .');
    assert.deepEqual(belowMissing.dataRows.map((row) => row.rowNum), [1, 2, 3, 5]);

    // in 1/l covers everything
    const everything = getSnapshotFromData(data, 'Stata memory', 500, 'in 1/l');
    assert.equal(everything.dataRows.length, 5);
    assert.equal(everything.info.observations, 5);

    // combined varlist + if + in
    const combined = getSnapshotFromData(data, 'Stata memory', 500, 'x grp if grp == 1 in 2/5');
    assert.deepEqual(combined.dataColumns, ['x', 'grp']);
    assert.deepEqual(combined.dataRows.map((row) => row.rowNum), [2, 3, 5]);
});

test('an unsupported filter reports the expression instead of showing wrong rows', () => {
    const data = makeData();
    assert.throws(
        () => getSnapshotFromData(data, 'Stata memory', 500, 'if x > '),
        /filter|supported|expression/i
    );
    assert.throws(
        () => getSnapshotFromData(data, 'Stata memory', 500, 'if nosuchvar > 1'),
        /filter|supported|expression/i
    );
    assert.throws(
        () => getSnapshotFromData(data, 'Stata memory', 500, 'nosuchvar'),
        /filter|supported|expression/i
    );
    assert.throws(
        () => getSnapshotFromData(data, 'Stata memory', 500, 'in 3/x'),
        /filter|supported|expression/i
    );
});
