const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            workspace: { getConfiguration: () => ({ get: () => '' }) },
            extensions: { all: [] }
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { StataTerminalRenderer } = require('../modules/runCode/embeddedConsole/renderer');
Module._load = originalLoad;

test('renders standalone which results as plain text while keeping the command highlighted', () => {
    const renderer = new StataTerminalRenderer();
    const commandEntries = renderer.renderCommandSegments('which reghdfe, all', 88);
    const outputEntries = renderer.renderOutputChunkSegments(
        '/Applications/StataNow/plus/r/reghdfe.ado\n*! version 6.13.1 10Jan2026\n',
        88
    );

    assert.ok(commandEntries[0].segments.some(segment => segment.tokenType === 'command'));
    assert.equal(
        outputEntries.flatMap(entry => entry.segments).some(segment => segment.tokenType === 'number'),
        false
    );
});

test('keeps numeric highlighting for ordinary Stata output', () => {
    const renderer = new StataTerminalRenderer();
    renderer.renderCommandSegments('display 1.25', 88);
    const outputEntries = renderer.renderOutputChunkSegments('value 1.25\n', 88);

    assert.ok(outputEntries[0].segments.some(segment => segment.tokenType === 'number'));
});

test('does not highlight numbers that belong to paths in parenthetical notes', () => {
    const renderer = new StataTerminalRenderer();
    const outputEntries = renderer.renderOutputChunkSegments(
        '(file /tmp/run42/st06431.000001 not found; 3 attempts)\n',
        88
    );
    const numberSegments = outputEntries[0].segments
        .filter(segment => segment.tokenType === 'number')
        .map(segment => segment.text);

    assert.deepEqual(numberSegments, ['3']);
    assert.equal(
        outputEntries[0].segments.some(segment => /run42|06431|000001/.test(segment.text)
            && segment.tokenType === 'number'),
        false
    );
});

test('keeps which errors highlighted as errors', () => {
    const renderer = new StataTerminalRenderer();
    renderer.renderCommandSegments('which missing_command', 88);
    const outputEntries = renderer.renderOutputChunkSegments('command missing_command not found\nr(111);\n', 88);

    assert.equal(outputEntries[0].segments.every(segment => segment.tokenType === 'plain'), true);
    assert.equal(outputEntries[1].kind, 'error');
});

test('keeps comma options in their positional option role after file strings', () => {
    const renderer = new StataTerminalRenderer();
    const commands = [
        'use "/Users/test/panel_data copy.dta", clear',
        'log using "analysis output.smcl", replace',
        'export excel using "results workbook.xlsx", replace',
        'outreg2 using "statistics.xls", replace sum(log)'
    ];

    for (const command of commands) {
        const segments = renderer.renderCommandSegments(command, 88)[0].segments;
        const commaIndex = segments.findIndex(segment => segment.text === ',');
        const positionalTokens = segments
            .slice(commaIndex + 1)
            .filter(segment => /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment.text));

        assert.ok(commaIndex >= 0, command);
        assert.ok(positionalTokens.length >= 1, command);
        assert.equal(positionalTokens[0].tokenType, 'option', command);
        assert.match(positionalTokens[0].className, /\btok-option\b/, command);
    }
});

test('keeps every line of a block comment in the comment style', () => {
    const renderer = new StataTerminalRenderer();
    const entries = renderer.renderCommandSegments(
        [
            '/*',
            'Expected:',
            '- Stop ends the loop.',
            '*/',
            'clear all'
        ].join('\n'),
        88
    );

    assert.deepEqual(entries.map(entry => entry.kind), [
        'comment-command',
        'comment-command',
        'comment-command',
        'comment-command',
        'command'
    ]);
    for (const entry of entries.slice(0, 4)) {
        assert.ok(entry.segments.some(segment => segment.tokenType === 'comment'));
    }
    assert.ok(entries[4].segments.some(segment => segment.tokenType === 'command'));
});

test('classifies ordinary and Section do-file echoes as comment commands', () => {
    const renderer = new StataTerminalRenderer();
    renderer.beginExecution();
    const entries = renderer.renderOutputChunkSegments([
        '. * ordinary comment',
        '. **# Section marker',
        '. display 1'
    ].join('\n') + '\n', 88);

    assert.deepEqual(entries.map(entry => entry.kind), [
        'comment-command',
        'comment-command',
        'command'
    ]);
});

test('does not style URL double slashes as comments in submissions or native echoes', () => {
    const renderer = new StataTerminalRenderer();
    const command = 'use https://www.stata-press.com/data/r18/auto.dta, clear';
    const submission = renderer.renderSubmissionLines(command);

    assert.equal(
        submission.flatMap(entry => entry.segments).some(segment => segment.tokenType === 'comment'),
        false
    );

    renderer.beginExecution();
    const output = renderer.renderOutputChunkSegments(`. ${command}\n`, 88);
    assert.equal(
        output.flatMap(entry => entry.segments).some(segment => segment.tokenType === 'comment'),
        false
    );
});

test('still styles whitespace-delimited double slashes as inline comments', () => {
    const renderer = new StataTerminalRenderer();
    const submission = renderer.renderSubmissionLines('display 1 // valid comment');
    const segments = submission.flatMap(entry => entry.segments);

    assert.ok(segments.some(segment => segment.tokenType === 'comment'));
    assert.equal(
        segments.filter(segment => segment.tokenType === 'comment').map(segment => segment.text).join(''),
        '// valid comment'
    );
});

test('keeps every input-cell block comment line in the comment style', () => {
    const renderer = new StataTerminalRenderer();
    const lines = renderer.renderSubmissionLines(
        [
            '**# 1. Stop',
            '',
            '/*',
            'Expected:',
            '- Stop ends the loop.',
            '*/',
            '',
            'clear all'
        ].join('\n')
    );

    assert.ok(lines[0].segments.some(segment => segment.tokenType === 'comment'));
    for (const line of lines.slice(2, 6)) {
        assert.ok(line.segments.some(segment => segment.tokenType === 'comment'));
        assert.equal(
            line.segments.filter(segment => segment.text.trim()).every(
                segment => segment.tokenType === 'comment'
            ),
            true
        );
    }
    assert.ok(lines[7].segments.some(segment => segment.tokenType === 'command'));
});

test('keeps native do-file block comments styled across output chunks', () => {
    const renderer = new StataTerminalRenderer();
    renderer.beginExecution();

    const firstChunk = renderer.renderOutputChunkSegments('. /*\n> Expected:\n', 88);
    const secondChunk = renderer.renderOutputChunkSegments('> - Stop ends the loop.\n> */\n. clear all\n', 88);
    const entries = [...firstChunk, ...secondChunk];

    assert.deepEqual(entries.map(entry => entry.kind), [
        'comment-command',
        'comment-command',
        'comment-command',
        'comment-command',
        'command'
    ]);
    for (const entry of entries.slice(0, 4)) {
        assert.ok(entry.segments.some(segment => segment.tokenType === 'comment'));
    }
    assert.ok(entries[4].segments.some(segment => segment.tokenType === 'command'));
});

test('recognizes native numbered continuation prompts as command input', () => {
    const renderer = new StataTerminalRenderer();
    renderer.beginExecution();

    const entries = renderer.renderOutputChunkSegments(
        ". forvalues i = 1/2 {\n  2.     display `i'\n  3. }\nresult 1\n",
        88
    );

    assert.deepEqual(entries.map(entry => entry.kind), [
        'command',
        'command',
        'command',
        'default'
    ]);
    assert.equal(entries[1].segments[0].tokenType, 'prompt');
    assert.equal(entries[1].segments[0].text, '  2. ');
    assert.ok(entries[1].segments.some(segment => segment.tokenType === 'command'));
});

test('does not treat numbered result text as a continuation prompt', () => {
    const renderer = new StataTerminalRenderer();
    renderer.beginExecution();

    const entries = renderer.renderOutputChunkSegments('. display "done"\n  2. report.xlsx\n', 88);

    assert.deepEqual(entries.map(entry => entry.kind), ['command', 'default']);
});
