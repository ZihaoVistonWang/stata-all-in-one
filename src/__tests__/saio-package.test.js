const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const packageDirectory = path.resolve(__dirname, '../../stata/saio');

test('saio confirmation stores console input in the ado local macro', () => {
    const source = fs.readFileSync(path.join(packageDirectory, 'saio.ado'), 'utf8');
    assert.match(source, /_request\(_saio_confirm\)/);
    assert.doesNotMatch(source, /_request\(saio_confirm\)/);
    assert.match(source, /继续请输入 y，取消请输入 n/);
    assert.match(source, /Enter y to continue or n to cancel/);
    assert.match(source, /local answer = lower\(strtrim\(`"`saio_confirm'"'\)\)/);
});

test('saio reports the real Stata edition instead of the legacy flavor value', () => {
    const source = fs.readFileSync(path.join(packageDirectory, 'saio.ado'), 'utf8');
    assert.match(source, /quietly _saio_detect_flavor/);
    assert.match(source, /if c\(MP\)/);
    assert.match(source, /else if c\(SE\)/);
    assert.match(source, /c\(edition_real\)/);
    assert.doesNotMatch(source, /local stata_flavor `"`c\(flavor\)'"'/);
});

test('saio package contains only the four distributable files', () => {
    assert.deepEqual(fs.readdirSync(packageDirectory).sort(), [
        'saio.ado',
        'saio.pkg',
        'saio.sthlp',
        'stata.toc'
    ]);
});
