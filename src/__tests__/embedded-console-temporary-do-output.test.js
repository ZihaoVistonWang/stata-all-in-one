const test = require('node:test');
const assert = require('node:assert/strict');

const {
    TemporaryDoFileOutputFilter,
    normalizeComparablePath
} = require('../modules/runCode/embeddedConsole/temporaryDoFileOutput');

test('hides only the generated temporary do wrapper across streamed chunks', () => {
    const filter = new TemporaryDoFileOutputFilter('/var/folders/example/T/SD08562.000000');
    const output = [
        filter.push('. do "/var/folders/example/T//SD085'),
        filter.push("62.000000\"\n\n. forvalues i = 1/2 {\n  2. display `i'\n  3. }\n1\n2\n"),
        filter.push('\nend of do-file\n\n. \n'),
        filter.finish()
    ].join('');

    assert.equal(output.includes('SD08562.000000'), false);
    assert.equal(output.includes('end of do-file'), false);
    assert.match(output, /\. forvalues i = 1\/2 \{/);
    assert.match(output, /  2\. display `i'/);
    assert.match(output, /\n1\n2\n/);
    assert.match(output, /\n\. \n$/);
});

test('preserves user-authored do commands and nested end markers', () => {
    const filter = new TemporaryDoFileOutputFilter('/tmp/generated.do');
    const output = [
        filter.push('. do "/tmp/generated.do"\n'),
        filter.push('. do "/projects/user.do"\nuser output\nend of do-file\n'),
        filter.push('. display "after nested do"\nafter nested do\nend of do-file\n'),
        filter.finish()
    ].join('');

    assert.match(output, /\. do "\/projects\/user\.do"/);
    assert.match(output, /user output\nend of do-file\n\. display/);
    assert.equal((output.match(/end of do-file/g) || []).length, 1);
});

test('does not suppress a user do command when its path differs from the generated file', () => {
    const filter = new TemporaryDoFileOutputFilter('/tmp/generated.do');
    const output = filter.push('. do "/tmp/user.do"\nend of do-file\n') + filter.finish();

    assert.equal(output, '. do "/tmp/user.do"\nend of do-file\n');
    assert.equal(
        normalizeComparablePath('C:\\\\Temp\\\\SD0001.do'),
        'c:/temp/sd0001.do'
    );
});
