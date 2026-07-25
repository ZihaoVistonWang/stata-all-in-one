const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    ensureSessionWorkingDirectory,
    syncSessionWorkingDirectory
} = require('../modules/runCode/embeddedConsole/workingDirectory');
const {
    executeSilentStataScript
} = require('../modules/runCode/embeddedConsole/silentStataCommand');

function createSession(options = {}) {
    let workingDirectory = options.workingDirectory || null;
    const commands = [];
    return {
        commands,
        getWorkingDirectory: () => workingDirectory,
        setWorkingDirectory: value => {
            workingDirectory = value;
        },
        execute: async (command, echo) => {
            const runMatch = command.match(/^run "([^"]+)"$/);
            const executed = runMatch
                ? fs.readFileSync(runMatch[1], 'utf8')
                : command;
            commands.push(executed);
            if (options.result && !options.result.success) return options.result;
            const match = executed.match(/file open \S+ using "([^"]+)"/);
            if (match) {
                fs.writeFileSync(
                    match[1],
                    options.value || 'C:\\Users\\research project',
                    'utf8'
                );
            }
            assert.equal(echo, false);
            return options.result || { success: true, output: '' };
        }
    };
}

test('reads c(pwd) when the session has no tracked working directory', async () => {
    const session = createSession();
    const result = await ensureSessionWorkingDirectory(session, null, true);

    assert.equal(result, 'C:\\Users\\research project');
    assert.equal(session.getWorkingDirectory(), result);
    assert.match(session.commands[0], /c\(pwd\)/);
    assert.doesNotMatch(session.commands[0], /\bdisplay\b/);
    assert.ok(session.commands[0].split('\n').every(line =>
        line.startsWith('quietly capture ')
    ));
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

test('refreshes a known directory from Stata instead of inferring cd or globals', async () => {
    const session = createSession({
        workingDirectory: 'D:\\Project',
        value: 'D:\\OneDrive\\paper\\results'
    });

    assert.equal(
        await syncSessionWorkingDirectory(session),
        'D:\\OneDrive\\paper\\results'
    );
    assert.equal(session.getWorkingDirectory(), 'D:\\OneDrive\\paper\\results');
    assert.match(session.commands[0], /c\(pwd\)/);
});

test('keeps the last confirmed directory when Stata cannot answer pwd', async () => {
    const session = createSession({
        workingDirectory: 'D:\\Known',
        result: { success: false, output: '', error: 'session busy' }
    });

    assert.equal(await syncSessionWorkingDirectory(session), 'D:\\Known');
    assert.equal(session.getWorkingDirectory(), 'D:\\Known');
});

test('repeated pwd synchronization never appends the global-based directory twice', async () => {
    const session = createSession({
        workingDirectory: 'D:\\OneDrive\\paper\\results',
        value: 'D:\\OneDrive\\paper\\results'
    });

    await syncSessionWorkingDirectory(session);
    await syncSessionWorkingDirectory(session);
    assert.equal(session.getWorkingDirectory(), 'D:\\OneDrive\\paper\\results');
});

test('silent control scripts use run without echo and are deleted after execution', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saio-silent-test-'));
    let scriptPath = null;
    let scriptText = null;
    try {
        const session = {
            execute: async (command, echo) => {
                const match = String(command).match(/^run "([^"]+)"$/);
                assert.ok(match);
                assert.equal(echo, false);
                scriptPath = match[1];
                assert.equal(fs.existsSync(scriptPath), true);
                scriptText = fs.readFileSync(scriptPath, 'utf8');
                return { success: true, output: '' };
            }
        };

        const result = await executeSilentStataScript(
            session,
            'quietly capture log close __saio_test',
            {
                directory,
                randomBytes: () => Buffer.from('123456789012', 'hex')
            }
        );

        assert.equal(result.success, true);
        assert.equal(scriptText, 'quietly capture log close __saio_test');
        assert.equal(fs.existsSync(scriptPath), false);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
