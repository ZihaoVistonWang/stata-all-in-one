const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
        return { env: { language: 'en' }, workspace: { getConfiguration: () => ({ get: () => '' }) } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { parseCapture } = require(
    '../modules/runCode/embeddedConsole/dataViewer/consoleDataReader'
);
Module._load = originalLoad;

const pluginSource = fs.readFileSync(
    path.join(__dirname, '../../native/stata_data_plugin/stata_data_plugin.c'),
    'utf8'
);

/**
 * Build a SAIODV1 capture holding one strL variable.
 * `values` are the already-encoded byte strings the plugin would write.
 */
function captureWithStrL(values) {
    const header = Buffer.alloc(20);
    Buffer.from('SAIODV1\0', 'ascii').copy(header, 0);
    header.writeBigUInt64LE(BigInt(values.length), 8);
    header.writeUInt32LE(1, 16);

    const chunks = [header, Buffer.from([1])];
    for (const value of values) {
        const encoded = Buffer.from(value, 'utf8');
        const length = Buffer.alloc(4);
        length.writeUInt32LE(encoded.length, 0);
        chunks.push(length, encoded);
    }
    return parseCapture(Buffer.concat(chunks), {
        headers: ['remark'],
        types: ['strL'],
        formats: ['%9s'],
        labels: ['备注']
    });
}

test('parses every strL cell shape the plugin can write', () => {
    // The plugin writes a 4-byte length followed by that many bytes, and an
    // empty strL is a length of 0 with no bytes at all. Getting the length
    // wrong desynchronises the reader for the whole rest of the buffer.
    const data = captureWithStrL(['正常经营', '', '世界你好世界', '']);

    assert.deepEqual(data.columns.remark, ['正常经营', '', '世界你好世界', '']);
    assert.equal(data.meta.nobs, 4);
    // An empty strL is an empty string, not a missing value.
    assert.deepEqual(Array.from(data.missing.remark), [0, 0, 0, 0]);
});

test('keeps a strL value longer than any str# width intact', () => {
    // str# tops out at 2045 bytes; strL exists precisely to exceed that, so a
    // reader that caps or truncates here would silently corrupt the value.
    const long = 'A'.repeat(5000) + '结尾';
    const data = captureWithStrL([long, 'x']);

    assert.equal(data.columns.remark[0], long);
    assert.equal(data.columns.remark[0].length, 5002);
    assert.equal(data.columns.remark[1], 'x');
});

test('reads strL through SF_strldata and never treats its return value as a status', () => {
    const strlCall = pluginSource.indexOf('SF_strldata(');
    assert.ok(strlCall !== -1, 'the plugin must read strL variables through SF_strldata');

    // SF_sdata writes into a fixed 2046-byte buffer, which overflows on the long
    // values strL is meant to hold — the strL branch must not fall back to it.
    const strlBranch = pluginSource.slice(
        pluginSource.indexOf('if (SF_var_is_strl(variable))'),
        pluginSource.indexOf('} else {', strlCall)
    );
    assert.ok(strlBranch.includes('SF_var_is_strl(variable)'));
    assert.ok(!strlBranch.includes('SF_sdata('));

    // SF_strldata returns the written byte count, not a status code: it is the
    // string length for a non-empty value and 0 for an empty one. Branching on
    // it as if non-zero meant failure silently turned every non-empty strL value
    // into "" while empty ones kept working.
    const strlRead = pluginSource.slice(strlCall, pluginSource.indexOf(';', strlCall));
    assert.doesNotMatch(
        strlRead,
        /\bvrc?\s*\?\s*0\b/,
        'the strL length must not be derived from SF_strldata\'s return value'
    );
    assert.match(pluginSource, /length = vrc < 0 \? 0 : \(uint32_t\)strlen\(text\);/);
});
