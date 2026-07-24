const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    commandFileCandidates,
    decorateCommandEntries,
    decorateOutputEntries,
    isImageFilePath,
    isStataFilePath,
    isTextFilePath,
    outputFileCandidates,
    resolveFilePath
} = require('../modules/runCode/embeddedConsole/fileLinks');

function entry(text, kind = 'command') {
    return {
        kind,
        segments: [{ text, tokenType: 'plain', className: 'tok tok-plain', style: {} }]
    };
}

function links(result) {
    return result.entries.flatMap(item =>
        item.segments.filter(segment => segment.fileLink)
    );
}

test('recognizes common and community-command file arguments', () => {
    const cases = [
        '. use "./panel_data.dta"',
        '. save "results/final data.dta", replace',
        '. import excel "raw/input.xlsx", firstrow',
        '. export delimited using "output/results.csv", replace',
        '. do "scripts/clean.do"',
        '. include config/setup.do',
        '. log using "logs/model.log", replace',
        '. graph export "figures/result.png", replace',
        '. putexcel set "tables/results.xlsx", replace',
        '. outreg2 using "statistics.xls", replace',
        '. repairCN statistics.xls',
        '. collect export "tables/table.docx", replace',
        '. translate "logs/run.smcl" "reports/run.pdf", replace',
        '. copy "raw/source.csv" "processed/copy.csv", replace',
        '. putdocx save "reports/results.docx", replace',
        '. estimates save "models/model.ster", replace'
    ];
    for (const value of cases) {
        assert.ok(commandFileCandidates(value).length >= 1, value);
    }
});

test('rejects ordinary strings, wildcards, and unexpanded Stata macros', () => {
    const cases = [
        '. display "statistics.xls"',
        '. local report "statistics.xls"',
        '. global report "statistics.xls"',
        '. use "*.dta"',
        '. use "$data/panel.dta"',
        '. use "`datafile\'"'
    ];
    for (const value of cases) {
        assert.deepEqual(commandFileCandidates(value), [], value);
    }
});

test('keeps command paths unlinked while tracking cd changes', () => {
    const start = path.resolve(path.sep, 'project');
    const result = decorateCommandEntries([
        entry('. use "before.dta"'),
        entry('. cd "results"'),
        entry('. outreg2 using "statistics.xls", replace')
    ], start);

    assert.equal(links(result).length, 0);
    assert.equal(result.cwd, path.join(start, 'results'));
});

test('preserves normal command string styling without file links', () => {
    const segments = [
        { text: '. use "', tokenType: 'command', className: 'tok tok-command', style: { color: '#ff00ff' } },
        { text: 'results/', tokenType: 'string', className: 'tok tok-string', style: { color: '#ffff00' } },
        { text: 'panel data.dta', tokenType: 'string', className: 'tok tok-string', style: { color: '#ffff00' } },
        { text: '"', tokenType: 'string', className: 'tok tok-string', style: { color: '#ffff00' } }
    ];
    const result = decorateCommandEntries([{
        kind: 'command',
        segments
    }], path.join(path.sep, 'project'));

    assert.equal(links(result).length, 0);
    assert.deepEqual(result.entries[0].segments, segments);
});

test('uses the theme string color for every segment inside an output file link', () => {
    const result = decorateOutputEntries([{
        kind: 'default',
        segments: [
            { text: 'file ', tokenType: 'plain', className: 'tok tok-plain', style: { color: '#ffffff' } },
            { text: 'results/', tokenType: 'path', className: 'tok tok-path', style: { color: '#ffffff' } },
            { text: 'panel data.dta', tokenType: 'plain', className: 'tok tok-plain', style: { color: '#ffff00' } },
            { text: ' saved', tokenType: 'plain', className: 'tok tok-plain', style: { color: '#ffffff' } }
        ]
    }], path.join(path.sep, 'project'));
    const linkedSegments = links(result);

    assert.equal(linkedSegments.length, 2);
    for (const segment of linkedSegments) {
        assert.equal(segment.tokenType, 'string');
        assert.equal(segment.className, 'tok tok-string');
        assert.equal(segment.style.color, null);
    }
});

test('does not link command echoes routed through the output renderer', () => {
    const result = decorateOutputEntries([
        entry('. outreg2 using "statistics.xls", replace', 'command'),
        entry('> repairCN "statistics.xls"', 'raw'),
        entry('file statistics.xls saved', 'default')
    ], path.resolve(path.sep, 'project'));

    assert.equal(links(result).length, 1);
    assert.equal(
        links(result)[0].fileLink.path,
        path.resolve(path.sep, 'project', 'statistics.xls')
    );
});

test('recognizes explicit output paths and file-context output', () => {
    assert.equal(
        outputFileCandidates('file statistics.xls saved').length,
        1
    );
    assert.equal(
        outputFileCandidates('output written to /tmp/results with spaces/table.xlsx').length,
        1
    );
    assert.deepEqual(outputFileCandidates('statistics.xls'), []);
    assert.deepEqual(outputFileCandidates('https://example.com/report.pdf'), []);
});

test('tracks echoed cd output before resolving later relative paths', () => {
    const result = decorateOutputEntries([
        entry('. cd "exports"', 'default'),
        entry('file model.csv saved', 'default')
    ], path.resolve(path.sep, 'project'));
    assert.equal(
        links(result)[0].fileLink.path,
        path.resolve(path.sep, 'project', 'exports', 'model.csv')
    );
});

test('recognizes file lines emitted by a real Stata session', () => {
    const cwd = path.resolve(path.sep, 'private', 'tmp', 'stata-console-links');
    const result = decorateOutputEntries([
        entry('(file panel data.dta not found)', 'default'),
        entry('file panel data.dta saved', 'default'),
        entry('file statistics.xlsx saved', 'default'),
        entry(`       log:  ${cwd}/analysis output.smcl`, 'default'),
        entry('file results workbook.xlsx saved', 'default'),
        entry('file analysis output.pdf saved as PDF format', 'default'),
        entry('Fix applied: Converted XLS to UTF-8 encoding for statistics.xls!', 'default')
    ], cwd);
    assert.deepEqual(
        links(result).map(segment => segment.fileLink.path),
        [
            path.join(cwd, 'panel data.dta'),
            path.join(cwd, 'panel data.dta'),
            path.join(cwd, 'statistics.xlsx'),
            path.join(cwd, 'analysis output.smcl'),
            path.join(cwd, 'results workbook.xlsx'),
            path.join(cwd, 'analysis output.pdf'),
            path.join(cwd, 'statistics.xls')
        ]
    );
});

test('supports Windows absolute paths independently of host platform', () => {
    assert.equal(
        resolveFilePath('C:\\Data Files\\panel.dta', 'C:\\Project'),
        'C:\\Data Files\\panel.dta'
    );
});

test('classifies files that should open in the VS Code editor', () => {
    for (const value of ['analysis.do', 'command.ado', 'notes.txt', 'table.csv', 'report.md']) {
        assert.equal(isTextFilePath(value), true, value);
    }
    for (const value of ['data.dta', 'results.smcl', 'table.xlsx', 'report.docx', 'report.pdf', 'image.png']) {
        assert.equal(isTextFilePath(value), false, value);
    }
    assert.equal(isStataFilePath('results.smcl'), true);
    assert.equal(isStataFilePath('results.log'), false);
    assert.equal(isImageFilePath('figure.png'), true);
    assert.equal(isImageFilePath('figure.svg'), true);
    assert.equal(isImageFilePath('figure.webp'), true);
    assert.equal(isImageFilePath('figure.avif'), true);
    assert.equal(isImageFilePath('figure.tiff'), false);
    assert.equal(isImageFilePath('figure.pdf'), false);
});

test('recognizes common Stata, Office, document, and archive extensions', () => {
    for (const extension of [
        'dta', 'do', 'ado', 'ster', 'gph', 'smcl', 'xls', 'xlsx', 'doc',
        'docx', 'pptx', 'tex', 'md', 'pdf', 'csv', 'svg', 'zip'
    ]) {
        assert.equal(
            commandFileCandidates(`. customexport result.${extension}`).length,
            1,
            extension
        );
    }
});
