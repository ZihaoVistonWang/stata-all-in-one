const test = require('node:test');
const assert = require('node:assert/strict');

const {
    ensureSessionWorkingDirectory,
    parseStataWorkingDirectory
} = require('../modules/runCode/embeddedConsole/workingDirectory');

function createSession(options = {}) {
    let workingDirectory = options.workingDirectory || null;
    const commands = [];
    return {
        commands,
        getWorkingDirectory: () => workingDirectory,
        setWorkingDirectory: value => {
            workingDirectory = value;
        },
        execute: async command => {
            commands.push(command);
            return options.result || {
                success: true,
                output: '__SAIO_PWD_BEGIN__C:\\Users\\research project__SAIO_PWD_END__'
            };
        }
    };
}

test('parses marked macOS and Windows Stata working directories', () => {
    assert.equal(
        parseStataWorkingDirectory('__SAIO_PWD_BEGIN__/Users/test/project__SAIO_PWD_END__'),
        '/Users/test/project'
    );
    assert.equal(
        parseStataWorkingDirectory('__SAIO_PWD_BEGIN__C:\\Users\\test project__SAIO_PWD_END__'),
        'C:\\Users\\test project'
    );
});

test('reads c(pwd) when the session has no tracked working directory', async () => {
    const session = createSession();
    const result = await ensureSessionWorkingDirectory(session, null, true);

    assert.equal(result, 'C:\\Users\\research project');
    assert.equal(session.getWorkingDirectory(), result);
    assert.match(session.commands[0], /c\(pwd\)/);
});

test('keeps the do-file directory preference when enabled', async () => {
    const session = createSession();
    const result = await ensureSessionWorkingDirectory(
        session,
        'C:\\Research\\paper',
        true
    );

    assert.equal(result, 'C:\\Research\\paper');
    assert.equal(session.commands[0], 'quietly cd "C:\\Research\\paper"');
});

test('does not query Stata again after the working directory is known', async () => {
    const session = createSession({ workingDirectory: 'C:\\Known' });
    assert.equal(
        await ensureSessionWorkingDirectory(session, 'C:\\Other', true),
        'C:\\Known'
    );
    assert.deepEqual(session.commands, []);
});
