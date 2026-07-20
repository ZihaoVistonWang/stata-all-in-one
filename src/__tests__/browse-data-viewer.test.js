const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseBrowseCommand,
    shouldRouteBrowseCommand,
    splitBrowseCommandSegments,
    routeBrowseCommand
} = require('../modules/runCode/browseCommand');
const { splitFilterSpec } = require('../modules/runCode/embeddedConsole/dataViewer/provider');

test('recognizes br and browse as standalone data viewer commands', () => {
    assert.deepEqual(parseBrowseCommand('br'), { command: 'br', filterText: '' });
    assert.deepEqual(parseBrowseCommand('  browse price mpg if foreign == 1 in 1/20, nolabel  '), {
        command: 'browse',
        filterText: 'price mpg if foreign == 1 in 1/20, nolabel'
    });
});

test('does not redirect other commands or multi-line selections', () => {
    assert.equal(parseBrowseCommand('break'), null);
    assert.equal(parseBrowseCommand('quietly browse price'), null);
    assert.equal(parseBrowseCommand('browse price\nsummarize price'), null);
});

test('splits browse commands from every matching line and preserves execution order', () => {
    assert.deepEqual(
        splitBrowseCommandSegments('sysuse "auto.dta", clear\nbrowse price mpg rep78\nsummarize price\nbr if foreign\ncount'),
        [
            { type: 'code', code: 'sysuse "auto.dta", clear' },
            { type: 'browse', commandText: 'browse price mpg rep78', filterText: 'price mpg rep78' },
            { type: 'code', code: 'summarize price' },
            { type: 'browse', commandText: 'br if foreign', filterText: 'if foreign' },
            { type: 'code', code: 'count' }
        ]
    );
});

test('keeps browse text in Stata code when it follows a continuation marker', () => {
    assert.deepEqual(
        splitBrowseCommandSegments('display 1 ///\n\nbrowse price\nsummarize price'),
        [{ type: 'code', code: 'display 1 ///\n\nbrowse price\nsummarize price' }]
    );
});

test('routes browse only in Embedded Console mode', () => {
    assert.equal(shouldRouteBrowseCommand('embeddedConsole'), true);
    assert.equal(shouldRouteBrowseCommand('externalApp'), false);
});

test('writes the browse command and localized confirmation to the Console', async () => {
    const events = [];
    const sink = {
        async prepareForExecution() { events.push(['prepare']); },
        writeCommand(command) { events.push(['command', command]); },
        writeRawChunk(output) { events.push(['raw', output]); },
        flushOutput() { events.push(['flush']); },
        setStatus(status) { events.push(['status', status]); }
    };

    const result = await routeBrowseCommand('browse price if foreign, nolabel', {
        getTerminalSink: () => sink,
        revealDataViewer: async (filterText) => { events.push(['reveal', filterText]); },
        openedMessage: 'Opened in the "Data Viewer | Stata All in One" tab.'
    });

    assert.equal(result.routedToDataViewer, true);
    assert.deepEqual(events, [
        ['prepare'],
        ['command', 'browse price if foreign, nolabel'],
        ['reveal', 'price if foreign, nolabel'],
        ['raw', 'Opened in the "Data Viewer | Stata All in One" tab.'],
        ['flush'],
        ['status', 'success']
    ]);
});

test('parses browse filters without splitting commas inside expressions', () => {
    assert.deepEqual(splitFilterSpec('price mpg if inlist(foreign, 0, 1), nolabel'), {
        raw: 'price mpg if inlist(foreign, 0, 1), nolabel',
        varList: 'price mpg',
        ifClause: 'inlist(foreign, 0, 1)',
        inClause: '',
        nolabel: true
    });
});

test('ignores if and in tokens inside strings and nested expressions', () => {
    assert.deepEqual(splitFilterSpec('name if name == "in" & strpos(name, "if") in 2/10'), {
        raw: 'name if name == "in" & strpos(name, "if") in 2/10',
        varList: 'name',
        ifClause: 'name == "in" & strpos(name, "if")',
        inClause: '2/10',
        nolabel: false
    });
});
