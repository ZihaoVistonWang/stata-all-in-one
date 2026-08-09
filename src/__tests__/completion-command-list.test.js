const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('includes label in the built-in command completion list', () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '../modules/completionProvider.js'),
        'utf8'
    );
    const start = source.indexOf('const StataBuiltinCommands = [');
    const end = source.indexOf('// Additional keywords and functions for autocomplete');
    const commandListSource = source.slice(start, end);

    assert.ok(start >= 0 && end > start);
    assert.match(commandListSource, /'label'/);
});
