const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeNativeCommandWhitespace
} = require('../modules/runCode/embeddedConsole/session');

test('normalizes tabs between Stata command tokens for native execution', () => {
    assert.equal(normalizeNativeCommandWhitespace('clear\tall'), 'clear all');
    assert.equal(normalizeNativeCommandWhitespace('set\tobs\t1'), 'set obs 1');
    assert.equal(normalizeNativeCommandWhitespace('generate\tx\t=\t1'), 'generate x = 1');
});

test('normalizes command tabs across multiple lines', () => {
    const code = 'clear\tall\nset\tobs\t1\ngenerate\tx\t=\t1';
    const expected = 'clear all\nset obs 1\ngenerate x = 1';

    assert.equal(normalizeNativeCommandWhitespace(code), expected);
});

test('preserves literal tabs inside quoted Stata strings', () => {
    assert.equal(
        normalizeNativeCommandWhitespace('display "left\tright"\tif\t1'),
        'display "left\tright" if 1'
    );
    assert.equal(
        normalizeNativeCommandWhitespace('display `"left\tright"\''),
        'display `"left\tright"\''
    );
});
