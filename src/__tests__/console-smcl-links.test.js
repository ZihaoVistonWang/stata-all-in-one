const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    applySmclLinksToEntries
} = require('../modules/runCode/embeddedConsole/fileLinks');
const {
    SmclSidecar,
    createSmclLogName,
    createSmclLogPath,
    parseSmclLinks,
    pruneOldSmclLogs
} = require('../modules/runCode/embeddedConsole/smclLinks');

function entry(text, kind = 'default') {
    return {
        kind,
        segments: [{
            text,
            tokenType: 'plain',
            className: 'tok tok-plain',
            style: {}
        }]
    };
}

function linkedSegments(entries) {
    return entries.flatMap(item =>
        item.segments.filter(segment => segment.consoleLink)
    );
}

const existingFile = {
    statSync: () => ({
        isFile: () => true,
        isDirectory: () => false
    })
};

test('extracts outreg2 file and directory targets but ignores stata actions', () => {
    const smcl = [
        '{txt}{browse `"./doc/final/statistics.xls"\'}',
        '{browse `"/Users/research/project"\' :dir}{com} : ',
        '{txt}{stata `"seeout using "./doc/final/statistics.txt""\':seeout}'
    ].join('\n');

    assert.deepEqual(parseSmclLinks(smcl), [
        {
            kind: 'path',
            target: './doc/final/statistics.xls',
            label: './doc/final/statistics.xls',
            source: 'smcl-explicit'
        },
        {
            kind: 'directory',
            target: '/Users/research/project',
            label: 'dir',
            source: 'smcl-explicit'
        }
    ]);
});

test('extracts view and HTTP browse links', () => {
    assert.deepEqual(
        parseSmclLinks([
            '{view "/tmp/report.docx":report.docx}',
            '{browse "https://www.stata.com":Stata website}'
        ].join('\n')),
        [
            {
                kind: 'path',
                target: '/tmp/report.docx',
                label: 'report.docx',
                source: 'smcl-explicit'
            },
            {
                kind: 'url',
                target: 'https://www.stata.com',
                label: 'Stata website',
                source: 'smcl-explicit'
            }
        ]
    );
});

test('extracts a complete non-link graph export path from an SMCL paragraph', () => {
    const links = parseSmclLinks([
        '{txt}{p 0 4 2}',
        'file {bf}',
        '/Users/research/project/scatter.png{rm}',
        'saved as',
        'PNG',
        'format',
        '{p_end}'
    ].join('\n'));

    assert.equal(links.length, 1);
    assert.equal(links[0].target, '/Users/research/project/scatter.png');
    assert.equal(links[0].source, 'smcl-output');
});

test('extracts sum2docx and corr2docx written-file output without a hyperlink directive', () => {
    const links = parseSmclLinks([
        '{txt}Summary statistics table has been written to file D:\\OneDrive\\论文\\results\\Summary Statistics.docx',
        '{txt}Correlation matrix has been written to file 基准回归变量相关性分析.docx'
    ].join('\n'));

    assert.deepEqual(links.map(link => link.target), [
        'D:\\OneDrive\\论文\\results\\Summary Statistics.docx',
        '基准回归变量相关性分析.docx'
    ]);
});

test('ignores file-like text inside echoed command comments', () => {
    const links = parseSmclLinks([
        '{com}. cd "$PATH\\results" // 定位结果输出路径 fake.docx',
        '{txt}ordinary output'
    ].join('\n'));

    assert.deepEqual(links, []);
});

test('applies one verified target across a wrapped Windows path', () => {
    const target = 'D:\\OneDrive\\paper\\results\\Summary Statistics.docx';
    const result = applySmclLinksToEntries([
        entry('Summary statistics table has been written to file D:\\OneDrive\\paper\\re'),
        entry('> sults\\Summary Statistics.docx')
    ], [{
        kind: 'path',
        target,
        label: target,
        source: 'smcl-output'
    }], 'D:\\OneDrive\\paper', existingFile);

    const segments = linkedSegments(result.entries);
    assert.equal(result.applied, 1);
    assert.ok(segments.length >= 2);
    assert.ok(segments.every(segment => segment.consoleLink.target === target));
    assert.ok(segments.some(segment => segment.text.includes('D:\\OneDrive')));
    assert.ok(segments.some(segment => segment.text.includes('Summary Statistics.docx')));
});

test('does not link only a trailing filename when a plain SMCL target cannot be matched', () => {
    const target = 'D:\\OneDrive\\paper\\results\\Baseline_results.doc';
    const result = applySmclLinksToEntries([
        entry('Baseline_results.doc')
    ], [{
        kind: 'path',
        target,
        label: target,
        source: 'smcl-output'
    }], 'D:\\OneDrive\\paper', existingFile);

    assert.equal(result.applied, 0);
    assert.equal(linkedSegments(result.entries).length, 0);
});

test('allows an explicit SMCL target to link its displayed basename', () => {
    const target = 'D:\\OneDrive\\paper\\results\\Baseline_results.doc';
    const result = applySmclLinksToEntries([
        entry('Baseline_results.doc'),
        entry('dir : seeout')
    ], [{
        kind: 'path',
        target,
        label: 'Baseline_results.doc',
        source: 'smcl-explicit'
    }], 'D:\\OneDrive\\paper', existingFile);

    assert.equal(result.applied, 1);
    assert.equal(linkedSegments(result.entries)[0].consoleLink.target, target);
});

test('links only the standalone outreg2 dir label for an explicit directory target', () => {
    const target = 'D:\\OneDrive\\paper\\results';
    const result = applySmclLinksToEntries([
        entry('working directory initialized'),
        entry('dir : seeout')
    ], [{
        kind: 'directory',
        target,
        label: 'dir',
        source: 'smcl-explicit'
    }], 'D:\\OneDrive\\paper', {
        statSync: () => ({
            isFile: () => false,
            isDirectory: () => true
        })
    });

    assert.equal(result.applied, 1);
    assert.equal(linkedSegments(result.entries)[0].text, 'dir');
    assert.equal(linkedSegments(result.entries)[0].consoleLink.kind, 'directory');
});

test('uses a dedicated log parent and prunes only old log month directories', () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'saio-smcl-test-'));
    try {
        const logPath = createSmclLogPath({
            tempDirectory,
            now: new Date(2026, 6, 25, 8, 9, 10, 11)
        });
        assert.equal(
            logPath,
            path.join(
                tempDirectory,
                'stata-all-in-one',
                'log',
                '202607',
                '20260725-080910-011.smcl'
            )
        );

        const logRoot = path.join(tempDirectory, 'stata-all-in-one', 'log');
        for (const month of ['202604', '202605', '202606', '202607']) {
            fs.mkdirSync(path.join(logRoot, month), { recursive: true });
        }
        const unrelated = path.join(tempDirectory, 'stata-all-in-one', 'graphs');
        fs.mkdirSync(unrelated, { recursive: true });

        pruneOldSmclLogs({
            tempDirectory,
            now: new Date(2026, 6, 25)
        });

        assert.equal(fs.existsSync(path.join(logRoot, '202604')), false);
        assert.equal(fs.existsSync(path.join(logRoot, '202605')), true);
        assert.equal(fs.existsSync(path.join(logRoot, '202606')), true);
        assert.equal(fs.existsSync(path.join(logRoot, '202607')), true);
        assert.equal(fs.existsSync(unrelated), true);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});

test('opens and closes a dedicated named SMCL sidecar log', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'saio-smcl-sidecar-'));
    const logPath = path.join(tempDirectory, 'run.smcl');
    const commands = [];
    const session = {};
    const executeSilentScript = async (_session, command) => {
        commands.push(command);
        if (command.includes('log using')) {
                fs.writeFileSync(
                    logPath,
                    '{txt}{browse `"./results/table.docx"\'}',
                    'utf8'
                );
        }
        return { success: true, output: '' };
    };
    try {
        const sidecar = new SmclSidecar(session, logPath, {
            logName: '__saio_test123',
            scanIntervalMs: 0,
            executeSilentScript
        });
        assert.equal(await sidecar.start(), true);
        assert.equal((await sidecar.drain())[0].target, './results/table.docx');
        const finalLinks = await sidecar.finish();
        assert.equal(finalLinks[0].target, './results/table.docx');
        assert.equal(commands.length, 2);
        assert.match(commands[0], /^quietly capture log using /);
        assert.match(commands[0], /name\(__saio_test123\) nomsg/);
        assert.match(commands[1], /^quietly capture log close __saio_test123$/);
        assert.ok(commands.every(command => !/log close (?:all|_all)\b/i.test(command)));
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});

test('creates unique Stata-safe sidecar log names', () => {
    const first = createSmclLogName({
        randomBytes: () => Buffer.from('001122334455', 'hex')
    });
    const second = createSmclLogName({
        randomBytes: () => Buffer.from('aabbccddeeff', 'hex')
    });

    assert.equal(first, '__saio_001122334455');
    assert.equal(second, '__saio_aabbccddeeff');
    assert.notEqual(first, second);
    assert.ok(first.length <= 32);
});

test('silently disables the sidecar when Stata does not create the log file', async () => {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'saio-smcl-full-'));
    const logPath = path.join(tempDirectory, 'missing.smcl');
    const commands = [];
    const session = {};
    try {
        const sidecar = new SmclSidecar(session, logPath, {
            logName: '__saio_full',
            executeSilentScript: async (_session, command) => {
                commands.push(command);
                return { success: true, output: '' };
            }
        });
        assert.equal(await sidecar.start(), false);
        assert.equal(commands.length, 1);
        assert.match(commands[0], /^quietly capture log using /);
    } finally {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
});
