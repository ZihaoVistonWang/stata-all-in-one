const test = require('node:test');
const assert = require('node:assert/strict');

const {
    executableApplicationName,
    macDefaultApplicationName,
    windowsDefaultApplicationName
} = require('../modules/runCode/embeddedConsole/externalApplication');

test('extracts readable Windows executable names from association commands', () => {
    assert.equal(
        executableApplicationName(
            '"C:\\Program Files\\Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe" "%1"'
        ),
        'Acrobat'
    );
    assert.equal(
        executableApplicationName('F:\\Stata16\\StataMP-64.exe /e use "%1"'),
        'StataMP-64'
    );
    assert.equal(
        executableApplicationName('C:\\Windows\\System32\\rundll32.exe "%1"'),
        ''
    );
});

test('resolves the Windows default application through assoc and ftype', async () => {
    const calls = [];
    const execFile = (command, args, options, callback) => {
        calls.push([command, args, options]);
        const query = args.at(-1);
        const stdout = query === 'assoc .pdf'
            ? '.pdf=AcroExch.Document.DC\r\n'
            : 'AcroExch.Document.DC="C:\\Program Files\\Adobe\\Acrobat.exe" "%1"\r\n';
        process.nextTick(() => callback(null, stdout, ''));
    };

    assert.equal(await windowsDefaultApplicationName(
        'C:\\Research\\report.pdf',
        {
            execFile,
            comSpec: 'C:\\Windows\\System32\\cmd.exe'
        }
    ), 'Acrobat');
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call[1].includes('/u')));
    assert.ok(calls.every(call => call[2].encoding === 'buffer'));
    assert.deepEqual(calls.map(call => call[1].at(-1)), [
        'assoc .pdf',
        'ftype AcroExch.Document.DC'
    ]);
});

test('resolves the macOS default application through Launch Services', async () => {
    const execFile = (command, args, _options, callback) => {
        assert.equal(command, 'osascript');
        assert.equal(args.at(-1), '/Users/research/report.pdf');
        process.nextTick(() => callback(null, 'Preview\n', ''));
    };

    assert.equal(await macDefaultApplicationName(
        '/Users/research/report.pdf',
        { execFile }
    ), 'Preview');
});
