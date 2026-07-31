const test = require('node:test');
const assert = require('node:assert/strict');

const {
    MARKETPLACE_URL,
    createExportFilename,
    groupConsoleHistory,
    serializeConsoleExport
} = require('../modules/runCode/embeddedConsole/consoleExport');

function line(kind, text, style = {}) {
    return {
        kind,
        segments: text === '' ? [] : [{ text, tokenType: 'plain', style }]
    };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10"/></svg>';
const SOURCE_OPTIONS = {
    language: 'zh-cn',
    sourceBefore: '本结果文件由 ',
    sourceAfter: ' 导出。',
    graphUnavailable: name => `[图形不可用：${name}]`,
    readFile: async filePath => {
        if (filePath === '/tmp/chart.png') return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        throw new Error('missing');
    }
};

function sampleHistory() {
    return [
        line('command', '. sysuse auto'),
        line('command', '> summarize price'),
        line('default', '    Variable | Obs Mean'),
        line('blank', ''),
        {
            kind: 'graph',
            graphName: 'Price chart',
            format: 'svg',
            filePath: '/tmp/chart.svg',
            svgText: SVG,
            segments: []
        },
        line('blank', ''),
        line('footer', 'Worked for 1.2s'),
        line('blank', ''),
        {
            kind: 'command',
            segments: [
                { text: '. ', tokenType: 'prompt', style: { bold: true } },
                { text: 'display', tokenType: 'command', style: { bold: true } },
                { text: ' ', tokenType: 'plain', style: {} },
                { text: '"```"', tokenType: 'string', style: {} }
            ]
        },
        {
            kind: 'comment-command',
            segments: [
                { text: '> ', tokenType: 'prompt', style: { bold: true } },
                { text: '** =========================================================', tokenType: 'comment', style: { italic: true } }
            ]
        },
        line('error', 'error: intentional <error>', { color: '#ff0000', bold: true }),
        {
            kind: 'graph',
            graphName: 'PNG chart',
            format: 'png',
            filePath: '/tmp/chart.png',
            segments: []
        },
        line('footer', 'Worked for 250ms')
    ];
}

test('groups console history into runs and removes Stata prompts from code', () => {
    const runs = groupConsoleHistory(sampleHistory());
    assert.equal(runs.length, 2);
    assert.equal(runs[0].code, 'sysuse auto\nsummarize price');
    assert.equal(runs[0].footer, 'Worked for 1.2s');
    assert.equal(runs[1].code, 'display "```"\n** =========================================================');
    assert.equal(runs[1].footer, 'Worked for 250ms');
});

test('uses submission code as exported input while keeping native command echoes in output', () => {
    const runs = groupConsoleHistory([
        {
            kind: 'submission',
            code: "forvalues i = 1/2 {\n    display `i'\n}",
            executionNumber: 1,
            status: 'success',
            lines: [
                line('command', 'forvalues i = 1/2 {'),
                line('command', "    display `i'"),
                line('command', '}')
            ]
        },
        line('command', '. forvalues i = 1/2 {'),
        line('command', "  2.     display `i'"),
        line('command', '  3. }'),
        line('default', '1'),
        line('default', '2'),
        line('footer', 'Worked for 10ms')
    ]);

    assert.equal(runs.length, 1);
    assert.equal(runs[0].code, "forvalues i = 1/2 {\n    display `i'\n}");
    assert.deepEqual(
        runs[0].outputEntries.map(entry =>
            entry.segments.map(segment => segment.text).join('')
        ),
        [". forvalues i = 1/2 {", "  2.     display `i'", '  3. }', '1', '2']
    );
});

test('keeps native numbered do-file continuation lines in exported input', () => {
    const runs = groupConsoleHistory([
        line('command', '. forvalues i = 1/2 {'),
        line('command', "  2.     display `i'"),
        line('command', '  3. }'),
        line('default', '1'),
        line('default', '2'),
        line('footer', 'Worked for 10ms')
    ]);

    assert.equal(runs.length, 1);
    assert.equal(runs[0].code, "forvalues i = 1/2 {\n    display `i'\n}");
    assert.deepEqual(
        runs[0].outputEntries.map(entry =>
            entry.segments.map(segment => segment.text).join('')
        ),
        ['1', '2']
    );
});

test('creates timestamped export filenames', () => {
    const date = new Date(2026, 6, 17, 9, 8, 7);
    assert.equal(createExportFilename(date, 'md'), 'stata-all-in-one-export-20260717-090807.md');
});

test('exports self-contained Markdown with quoted Stata input, inline images, footers, and separators', async () => {
    const result = await serializeConsoleExport(sampleHistory(), 'md', SOURCE_OPTIONS);
    assert.ok(result.content.startsWith(`本结果文件由 [Stata All in One](${MARKETPLACE_URL}) 导出。`));
    assert.match(result.content, /> ```stata\n> sysuse auto\n> summarize price\n> ```/);
    assert.match(result.content, /```text\n    Variable \| Obs Mean\n```/);
    assert.match(result.content, /!\[Price chart\]\(data:image\/svg\+xml;base64,/);
    assert.match(result.content, /!\[PNG chart\]\(data:image\/png;base64,/);
    assert.match(result.content, /\*Worked for 1\.2s\*\n\n---/);
    assert.match(result.content, /> ````stata\n> display "```"\n> \*\* =========================================================\n> ````/);
    assert.equal(result.content.includes('/tmp/chart.'), false);
    assert.deepEqual(result.missingGraphs, []);
});

test('exports standalone HTML with escaped output, source link, styles, and embedded graphs', async () => {
    const result = await serializeConsoleExport(sampleHistory(), 'html', SOURCE_OPTIONS);
    assert.match(result.content, /^<!DOCTYPE html>/);
    assert.match(result.content, new RegExp(`href="${MARKETPLACE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    const tabIcon = result.content.match(/<link id="tab-icon" rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml;base64,([^"]+)" data-light="[^"]+" data-dark="data:image\/svg\+xml;base64,([^"]+)">/);
    assert.ok(tabIcon);
    assert.match(Buffer.from(tabIcon[1], 'base64').toString('utf8'), /<svg width="16" height="16"/);
    assert.match(Buffer.from(tabIcon[2], 'base64').toString('utf8'), /<svg width="16" height="16"/);
    assert.match(result.content, /tabIcon\.href = theme === 'dark' \? tabIcon\.dataset\.dark : tabIcon\.dataset\.light/);
    assert.match(result.content, /error: intentional &lt;error&gt;/);
    assert.match(result.content, /font-weight:700/);
    assert.match(result.content, /class="execution-count">\[1\]<\/div>/);
    assert.doesNotMatch(result.content, /class="execution-count">\[\d+\]:/);
    assert.doesNotMatch(result.content, /class="nav-tooltip-count">\[\d+\]:/);
    assert.match(result.content, /class="token token-command"/);
    assert.match(result.content, /class="token token-string"/);
    assert.match(result.content, /class="token token-comment"/);
    assert.match(result.content, /\.token-comment \{ color: var\(--syntax-comment\); font-style: italic; \}/);
    assert.match(result.content, /class="input-nav"/);
    assert.match(result.content, /data-target="input-2"/);
    assert.match(result.content, /aria-label="\[2\] display/);
    assert.match(result.content, /data-tooltip="\[2\] display/);
    assert.match(result.content, /data-tooltip="\[1\] sysuse auto\nsummarize price"/);
    assert.match(result.content, /id="nav-tooltip" class="nav-tooltip"/);
    assert.match(result.content, /width: min\(340px, calc\(100vw - 80px\)\);/);
    assert.match(result.content, /class="nav-tooltip-count">\[1\]<\/div>/);
    assert.match(result.content, /class="nav-tooltip-code"/);
    assert.match(result.content, /class="nav-preview-line"><span class="token token-plain">sysuse auto<\/span>/);
    assert.match(result.content, /\.nav-preview-line \{[\s\S]*white-space: pre-wrap;[\s\S]*overflow-wrap: anywhere;/);
    assert.match(result.content, /preview\.content\.cloneNode\(true\)/);
    assert.match(result.content, /\.input-nav \{[\s\S]*width: 46px;/);
    assert.match(result.content, /function findNearestMarker\(clientY\)/);
    assert.match(result.content, /inputNav\.addEventListener\('mousemove'/);
    assert.match(result.content, /inputNav\.addEventListener\('click'/);
    assert.match(result.content, /target\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
    assert.match(result.content, /id="theme-toggle"/);
    assert.match(result.content, /data-theme="dark"/);
    assert.match(result.content, /IntersectionObserver/);
    assert.match(result.content, /fontsapi\.zeoseven\.com\/442\/main\/result\.css/);
    assert.match(result.content, /fontsource\/fonts\/maple-mono@latest\/latin-400-normal\.woff2/);
    assert.match(result.content, /local\("Maple Mono"\)/);
    assert.match(result.content, /--export-mono-font: "Maple Mono", "Maple Mono NF CN"/);
    assert.match(result.content, /\.command \{[\s\S]*font-family: var\(--export-mono-font\);/);
    assert.match(result.content, /\.output-line \{[\s\S]*font-family: var\(--export-mono-font\);/);
    assert.match(result.content, /\.command \{[\s\S]*white-space: pre-wrap;[\s\S]*overflow-x: hidden;[\s\S]*overflow-wrap: anywhere;/);
    assert.match(result.content, /--export-run-gutter:\s*40px/);
    assert.match(result.content, /\.input-cell \{[\s\S]*grid-template-columns: var\(--export-run-gutter\) minmax\(0, 1fr\)/);
    assert.match(result.content, /\.execution-count \{[\s\S]*padding: 14px 1ch 0 0;[\s\S]*text-align: right/);
    assert.match(result.content, /\.output-line \{[\s\S]*padding-left: var\(--export-run-gutter\)/);
    assert.match(result.content, /\.run-output:not\(\.output-only\) \.output-command,[\s\S]*text-indent: -2ch/);
    assert.match(result.content, /\.run-output \{[\s\S]*overflow-x: auto;[\s\S]*overflow-y: hidden;/);
    assert.match(result.content, /class="run-output-shell"><div class="run-output/);
    assert.match(result.content, /\.run-output-shell::before,[\s\S]*width: 30px;[\s\S]*transition: opacity 140ms ease/);
    assert.match(result.content, /\.run-output\.has-horizontal-overflow \{[\s\S]*padding-bottom: 14px/);
    assert.match(result.content, /shell\.classList\.toggle\('has-hidden-left', output\.scrollLeft > 1\)/);
    assert.match(result.content, /shell\.classList\.toggle\([\s\S]*'has-hidden-right'/);
    assert.match(result.content, /document\.fonts\.ready\.then\(configureRunOutputHints\)/);
    assert.match(result.content, /\.output-line \{[\s\S]*width: max-content;[\s\S]*white-space: pre;/);
    assert.match(result.content, /\.run-output::-webkit-scrollbar \{ height: 10px; \}/);
    assert.match(result.content, /src="data:image\/svg\+xml;base64,/);
    assert.match(result.content, /src="data:image\/png;base64,/);
    assert.equal(result.content.includes('/tmp/chart.'), false);
});

test('limits HTML navigation input previews to the first three lines', async () => {
    const history = [
        line('command', '. first'),
        line('command', '> second'),
        line('comment-command', '> third'),
        line('command', '> fourth'),
        line('footer', 'Done')
    ];
    const result = await serializeConsoleExport(history, 'html', SOURCE_OPTIONS);
    const tooltip = result.content.match(/data-tooltip="([^"]+)"/);

    assert.ok(tooltip);
    assert.equal(tooltip[1], '[1] first\nsecond\nthird\n...');
    assert.match(result.content, /<div class="nav-preview-ellipsis">\.\.\.<\/div>/);
});

test('exports an nbstata notebook with source Markdown cell, code cells, stream output, and inline images but no footers', async () => {
    const result = await serializeConsoleExport(sampleHistory(), 'ipynb', SOURCE_OPTIONS);
    const notebook = JSON.parse(result.content);
    assert.equal(notebook.nbformat, 4);
    assert.equal(notebook.nbformat_minor, 5);
    assert.deepEqual(notebook.metadata.kernelspec, {
        display_name: 'Stata (nbstata)',
        language: 'stata',
        name: 'nbstata'
    });
    assert.equal(notebook.cells[0].cell_type, 'markdown');
    assert.match(notebook.cells[0].source, new RegExp(MARKETPLACE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(notebook.cells[1].source, 'sysuse auto\nsummarize price');
    assert.equal(notebook.cells[1].execution_count, 1);
    assert.equal(notebook.cells[1].outputs[0].output_type, 'stream');
    assert.equal(notebook.cells[1].outputs[1].output_type, 'display_data');
    assert.equal(notebook.cells[1].outputs[1].data['image/svg+xml'], SVG);
    assert.equal(notebook.cells[2].source, 'display "```"\n** =========================================================');
    assert.equal(notebook.cells[2].outputs[1].data['image/png'], Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'));
    assert.equal(result.content.includes('Worked for'), false);
});

test('keeps output-only history and replaces unreadable graphs with localized placeholders', async () => {
    const entries = [
        line('warning', 'Session notice'),
        {
            kind: 'graph',
            graphName: 'Missing graph',
            format: 'svg',
            filePath: '/tmp/missing.svg',
            segments: []
        }
    ];
    const result = await serializeConsoleExport(entries, 'ipynb', SOURCE_OPTIONS);
    const notebook = JSON.parse(result.content);
    assert.equal(notebook.cells[1].cell_type, 'code');
    assert.equal(notebook.cells[1].source, '');
    assert.match(notebook.cells[1].outputs[0].text, /Session notice/);
    assert.match(notebook.cells[1].outputs.map(output => output.text || '').join(''), /图形不可用：Missing graph/);
    assert.deepEqual(result.missingGraphs, ['Missing graph']);
});
