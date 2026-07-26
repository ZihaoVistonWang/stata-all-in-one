const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    applySmclLinksToEntries,
    commandFileCandidates,
    collectVerifiedOutputLinks,
    decorateCommandEntries,
    decorateOutputEntries,
    isImageFilePath,
    isStataFilePath,
    isTextFilePath,
    outputFileCandidates,
    resolveFilePath,
    validateSemanticLinks,
    verifiedLocalLink
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

const existingFile = {
    statSync: () => ({
        isFile: () => true,
        isDirectory: () => false
    })
};

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

test('keeps command paths unlinked and never infers cwd from cd text', () => {
    const start = path.resolve(path.sep, 'project');
    const result = decorateCommandEntries([
        entry('. use "before.dta"'),
        entry('. cd "results"'),
        entry('. cd "$PATH\\results" // 定位结果输出路径'),
        entry('. outreg2 using "statistics.xls", replace')
    ], start);

    assert.equal(links(result).length, 0);
    assert.equal(result.cwd, start);
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
    }], path.join(path.sep, 'project'), existingFile);
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
        entry('. cd "$PATH\\results" // 定位结果输出路径 fake.docx', 'default'),
        entry('file statistics.xls saved', 'default')
    ], path.resolve(path.sep, 'project'), existingFile);

    assert.equal(links(result).length, 1);
    assert.equal(
        links(result)[0].fileLink.path,
        path.resolve(path.sep, 'project', 'statistics.xls')
    );
});

test('recognizes quoted, standalone, explicit, and contextual output paths', () => {
    assert.equal(
        outputFileCandidates('file statistics.xls saved').length,
        1
    );
    assert.equal(
        outputFileCandidates('output written to /tmp/results with spaces/table.xlsx').length,
        1
    );
    assert.equal(outputFileCandidates('statistics.xls').length, 1);
    assert.equal(outputFileCandidates('"results workbook.xlsx"').length, 1);
    assert.equal(outputFileCandidates('./exports/statistics.xls').length, 1);
    assert.deepEqual(outputFileCandidates('value statistics.xls value'), []);
    assert.deepEqual(outputFileCandidates('https://example.com/report.pdf'), []);
    for (const value of ['0.123', 'i.year', 'c.name', 'example.com', 'sum(log)']) {
        assert.deepEqual(outputFileCandidates(value), [], value);
    }
});

test('links standalone outreg2 output against the active Stata directory', () => {
    const cwd = path.resolve(path.sep, 'project', 'tables');
    const result = decorateOutputEntries([
        entry('statistics.xls', 'default')
    ], cwd, existingFile);

    assert.equal(links(result).length, 1);
    assert.equal(
        links(result)[0].fileLink.path,
        path.join(cwd, 'statistics.xls')
    );
});

test('does not infer cwd changes from echoed cd output', () => {
    const result = decorateOutputEntries([
        entry('. global PATH "D:\\OneDrive\\paper"', 'default'),
        entry('. cd "$PATH\\results" // 定位结果输出路径', 'default'),
        entry('file model.csv saved', 'default')
    ], path.resolve(path.sep, 'project'), existingFile);
    assert.equal(
        links(result)[0].fileLink.path,
        path.resolve(path.sep, 'project', 'model.csv')
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
    ], cwd, existingFile);
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

test('keeps extension candidates unlinked when the resolved file does not exist', () => {
    const result = decorateOutputEntries([
        entry('Baseline_results.doc', 'default')
    ], path.resolve(path.sep, 'project'), {
        statSync: () => {
            const error = new Error('missing');
            error.code = 'ENOENT';
            throw error;
        }
    });

    assert.equal(links(result).length, 0);
});

test('reconstructs and verifies an extension path split across Stata continuation lines', () => {
    const target = 'D:\\OneDrive\\paper\\results\\Baseline_results.doc';
    const result = decorateOutputEntries([
        entry('D:\\OneDrive\\paper\\re', 'default'),
        entry('> sults\\Baseline_results.doc', 'default')
    ], 'D:\\OneDrive\\paper', {
        statSync: value => {
            assert.equal(value, target);
            return {
                isFile: () => true,
                isDirectory: () => false
            };
        }
    });

    assert.ok(links(result).length >= 2);
    assert.ok(links(result).every(segment => segment.fileLink.path === target));
    assert.ok(links(result).some(segment => segment.text.includes('D:\\OneDrive')));
    assert.ok(links(result).some(segment => segment.text.includes('Baseline_results.doc')));
});

test('recognizes reported long Windows and Chinese written-file output', () => {
    const cwd = 'D:\\OneDrive\\1.论文';
    const longTarget = [
        cwd,
        '2.Does supply chain support',
        'Summary Statistics.docx'
    ].join('\\');
    const chineseTarget = `${cwd}\\基准回归变量相关性分析.docx`;
    const result = decorateOutputEntries([
        entry(`Summary statistics table has been written to file ${longTarget}`, 'default'),
        entry('Correlation matrix has been written to file 基准回归变量相关性分析.docx', 'default')
    ], cwd, existingFile);

    assert.deepEqual(
        [...new Set(links(result).map(segment => segment.fileLink.path))],
        [longTarget, chineseTarget]
    );
});

test('does not link a reconstructed continuation path when the full file is missing', () => {
    const result = decorateOutputEntries([
        entry('D:\\OneDrive\\paper\\re', 'default'),
        entry('> sults\\Baseline_results.doc', 'default')
    ], 'D:\\OneDrive\\paper', {
        statSync: () => {
            const error = new Error('missing');
            error.code = 'ENOENT';
            throw error;
        }
    });

    assert.equal(links(result).length, 0);
});

test('deduplicates a relative leading directory that repeats the Stata cwd basename', () => {
    const cwd = 'D:\\results';
    const standard = 'D:\\results\\results\\table.docx';
    const deduplicated = 'D:\\results\\table.docx';
    const link = verifiedLocalLink('results\\table.docx', cwd, {
        statSync: value => {
            if (value === deduplicated) {
                return {
                    isFile: () => true,
                    isDirectory: () => false
                };
            }
            assert.equal(value, standard);
            const error = new Error('missing');
            error.code = 'ENOENT';
            throw error;
        }
    });

    assert.equal(link.target, deduplicated);
});

test('does not choose between standard and deduplicated paths when both exist', () => {
    const link = verifiedLocalLink(
        'results\\table.docx',
        'D:\\results',
        existingFile
    );

    assert.equal(link, null);
});

test('asynchronous fallback emits suggestions only for verified existing files', async () => {
    const entries = [
        entry('file existing.docx saved', 'default'),
        entry('file missing.docx saved', 'default')
    ];
    const links = await collectVerifiedOutputLinks(entries, 'D:\\results', {
        stat: async value => {
            if (value === 'D:\\results\\existing.docx') {
                return {
                    isFile: () => true,
                    isDirectory: () => false
                };
            }
            const error = new Error('missing');
            error.code = 'ENOENT';
            throw error;
        }
    });

    assert.deepEqual(links.map(link => link.target), [
        'D:\\results\\existing.docx'
    ]);
    assert.ok(links.every(link => link.verifiedLink.verified));
});

test('applies one verified path to every independently detected output occurrence', async () => {
    const entries = [
        entry('statistics.xls', 'default'),
        entry(
            'Fix applied: Converted XLS to UTF-8 encoding for statistics.xls!',
            'default'
        )
    ];
    let statCalls = 0;
    const suggestions = await collectVerifiedOutputLinks(entries, '/project', {
        stat: async value => {
            statCalls += 1;
            if (value === '/project/statistics.xls') {
                return {
                    isFile: () => true,
                    isDirectory: () => false
                };
            }
            const error = new Error('missing');
            error.code = 'ENOENT';
            throw error;
        }
    });
    const result = applySmclLinksToEntries(entries, suggestions, '/project');

    assert.equal(statCalls, 1);
    assert.equal(suggestions.length, 1);
    assert.deepEqual(
        links(result).map(segment => segment.text),
        ['statistics.xls', 'statistics.xls']
    );
});

test('verifies and links a spaced filename after the repairCN for context', async () => {
    const cwd = 'E:\\OneDrive\\开发\\stata-outline';
    const target = `${cwd}\\statis tics.xls`;
    const entries = [
        entry(
            'Fix applied: Converted XLS to UTF-8 encoding for statis tics.xls!',
            'default'
        )
    ];
    const suggestions = await collectVerifiedOutputLinks(entries, cwd, {
        stat: async value => {
            assert.equal(value, target);
            return {
                isFile: () => true,
                isDirectory: () => false
            };
        }
    });
    const result = applySmclLinksToEntries(entries, suggestions, cwd);

    assert.deepEqual(suggestions.map(link => link.label), ['statis tics.xls']);
    assert.deepEqual(
        links(result).map(segment => segment.text),
        ['statis tics.xls']
    );
});

test('checks backward word groups without keywords and stops at the first existing path', async () => {
    const cwd = 'D:\\results';
    const target = `${cwd}\\西 地 e 爱抚 g.docx`;
    const checked = [];
    const entries = [
        entry('a b 西 地 e 爱抚 g.docx', 'default')
    ];
    const suggestions = await collectVerifiedOutputLinks(entries, cwd, {
        stat: async value => {
            checked.push(value);
            if (value === target) {
                return {
                    isFile: () => true,
                    isDirectory: () => false
                };
            }
            const error = new Error('missing');
            error.code = 'ENOENT';
            throw error;
        }
    });
    const result = applySmclLinksToEntries(entries, suggestions, cwd);

    assert.deepEqual(checked, [
        `${cwd}\\g.docx`,
        `${cwd}\\爱抚 g.docx`,
        `${cwd}\\e 爱抚 g.docx`,
        `${cwd}\\地 e 爱抚 g.docx`,
        target
    ]);
    assert.deepEqual(suggestions.map(link => link.label), ['西 地 e 爱抚 g.docx']);
    assert.deepEqual(
        links(result).map(segment => segment.text),
        ['西 地 e 爱抚 g.docx']
    );
});

test('stops after ten backward word groups when no candidate exists', async () => {
    const cwd = 'D:\\results';
    const checked = [];
    const entries = [
        entry(
            'one two three four five six seven eight nine ten report.docx',
            'default'
        )
    ];
    const suggestions = await collectVerifiedOutputLinks(entries, cwd, {
        stat: async value => {
            checked.push(value);
            const error = new Error('missing');
            error.code = 'ENOENT';
            throw error;
        }
    });

    assert.equal(checked.length, 10);
    assert.equal(
        checked[9],
        `${cwd}\\two three four five six seven eight nine ten report.docx`
    );
    assert.deepEqual(suggestions, []);
});

test('asynchronous SMCL validation drops missing local targets', async () => {
    const links = await validateSemanticLinks([
        {
            kind: 'path',
            target: 'existing.docx',
            label: 'existing.docx',
            source: 'smcl-output'
        },
        {
            kind: 'path',
            target: 'missing.docx',
            label: 'missing.docx',
            source: 'smcl-output'
        }
    ], 'D:\\results', {
        stat: async value => {
            if (value.endsWith('\\existing.docx')) {
                return {
                    isFile: () => true,
                    isDirectory: () => false
                };
            }
            throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        }
    });

    assert.equal(links.length, 1);
    assert.equal(links[0].verifiedLink.target, 'D:\\results\\existing.docx');
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
