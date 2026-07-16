const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const packageDirectory = path.resolve(__dirname, '../../stata/saio');

test('saio confirmation stores console input in the ado local macro', () => {
    const source = fs.readFileSync(path.join(packageDirectory, 'saio.ado'), 'utf8');
    assert.match(source, /_request\(_saio_confirm\)/);
    assert.doesNotMatch(source, /_request\(saio_confirm\)/);
    assert.match(source, /display as result "是否使用当前运行的 Stata 重新配置/);
    assert.match(source, /display as result "Reconfigure it using the currently running Stata/);
    assert.match(source, /local answer = lower\(strtrim\(`"`saio_confirm'"'\)\)/);
});

test('saio package contains only the four distributable files', () => {
    assert.deepEqual(fs.readdirSync(packageDirectory).sort(), [
        'saio.ado',
        'saio.pkg',
        'saio.sthlp',
        'stata.toc'
    ]);
});
