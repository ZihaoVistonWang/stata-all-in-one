#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DYLIB = '/Applications/StataNow/StataMP.app/Contents/MacOS/libstata-mp.dylib';

const CASES = [
    {
        name: 'baseline_summarize',
        commands: [
            'sysuse nlsw88, clear',
            'summarize wage'
        ]
    },
    {
        name: 'scatter_no_capture',
        commands: [
            'sysuse nlsw88, clear',
            'scatter wage age'
        ]
    },
    {
        name: 'scatter_with_grlist_on',
        commands: [
            'quietly _gr_list on',
            'sysuse nlsw88, clear',
            'scatter wage age',
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            'quietly _gr_list off'
        ]
    },
    {
        name: 'scatter_export_svg',
        commands: [
            'quietly _gr_list on',
            'sysuse nlsw88, clear',
            'scatter wage age',
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            ({ outDir }) => `quietly graph export "${stataQuote(path.join(outDir, 'scatter.svg'))}", name(Graph) replace`,
            'quietly _gr_list off'
        ]
    },
    {
        name: 'pvenn_no_capture',
        commands: [
            'sysuse nlsw88, clear',
            'pvenn married collgrad south'
        ]
    },
    {
        name: 'pvenn_with_grlist_on',
        commands: [
            'quietly _gr_list on',
            'sysuse nlsw88, clear',
            'pvenn married collgrad south',
            'quietly _gr_list off'
        ]
    },
    {
        name: 'pvenn_then_list',
        commands: [
            'quietly _gr_list on',
            'sysuse nlsw88, clear',
            'pvenn married collgrad south',
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            'quietly _gr_list off'
        ]
    },
    {
        name: 'pvenn_export_svg',
        commands: [
            'quietly _gr_list on',
            'sysuse nlsw88, clear',
            'pvenn married collgrad south',
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            ({ outDir }) => `quietly graph export "${stataQuote(path.join(outDir, 'pvenn.svg'))}", name(Graph) replace`,
            'quietly _gr_list off'
        ]
    },
    {
        name: 'pvenn_export_png',
        commands: [
            'quietly _gr_list on',
            'sysuse nlsw88, clear',
            'pvenn married collgrad south',
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            ({ outDir }) => `quietly graph export "${stataQuote(path.join(outDir, 'pvenn.png'))}", name(Graph) replace`,
            'quietly _gr_list off'
        ]
    },
    {
        name: 'pvenn_extension_like_async',
        commands: [
            'quietly _gr_list on',
            ({ outDir }) => ({
                async: true,
                echo: true,
                command: makeDoCommand(outDir, 'pvenn_extension_like.do', [
                    'sysuse nlsw88, clear',
                    'pvenn married collgrad south'
                ])
            }),
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            ({ outDir }) => ({
                async: true,
                echo: false,
                command: `quietly graph export "${stataQuote(path.join(outDir, 'pvenn-extension.svg'))}", name(Graph) replace`
            }),
            'quietly _gr_list off'
        ]
    },
    {
        name: 'pvenn_line_by_line_async_with_export',
        commands: [
            'quietly _gr_list on',
            {
                async: true,
                echo: true,
                command: 'sysuse nlsw88, clear'
            },
            {
                async: true,
                echo: true,
                command: 'pvenn married collgrad south'
            },
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            ({ outDir }) => ({
                async: true,
                echo: false,
                command: `quietly graph export "${stataQuote(path.join(outDir, 'pvenn-line-by-line.svg'))}", name(Graph) replace`
            }),
            'quietly _gr_list off'
        ]
    },
    {
        name: 'pvenn_line_by_line_async_with_comment_export',
        commands: [
            'quietly _gr_list on',
            {
                async: true,
                echo: true,
                command: 'sysuse nlsw88, clear'
            },
            {
                async: true,
                echo: true,
                command: 'pvenn married collgrad south //韦恩图, R1_regression.do'
            },
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            ({ outDir }) => ({
                async: true,
                echo: false,
                command: `quietly graph export "${stataQuote(path.join(outDir, 'pvenn-line-by-line-comment.svg'))}", name(Graph) replace`
            }),
            'quietly _gr_list off'
        ]
    },
    {
        name: 'scatter_extension_like_async',
        commands: [
            'quietly _gr_list on',
            ({ outDir }) => ({
                async: true,
                echo: true,
                command: makeDoCommand(outDir, 'scatter_extension_like.do', [
                    'sysuse nlsw88, clear',
                    'scatter wage age'
                ])
            }),
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            'quietly _gr_list off'
        ]
    },
    {
        name: 'pvenn_async_do_no_capture',
        commands: [
            ({ outDir }) => ({
                async: true,
                echo: true,
                command: makeDoCommand(outDir, 'pvenn_async_do_no_capture.do', [
                    'sysuse nlsw88, clear',
                    'pvenn married collgrad south'
                ])
            })
        ]
    },
    {
        name: 'pvenn_async_single_no_capture',
        commands: [
            'sysuse nlsw88, clear',
            {
                async: true,
                echo: true,
                command: 'pvenn married collgrad south'
            }
        ]
    },
    {
        name: 'pvenn_extension_like_async_no_export',
        commands: [
            'quietly _gr_list on',
            ({ outDir }) => ({
                async: true,
                echo: true,
                command: makeDoCommand(outDir, 'pvenn_extension_like_no_export.do', [
                    'sysuse nlsw88, clear',
                    'pvenn married collgrad south'
                ])
            }),
            'quietly _gr_list list',
            'display "`r(_grlist)\'"',
            'quietly _gr_list off'
        ]
    }
];

function main() {
    const mode = process.argv[2] || 'parent';
    if (mode === 'child') {
        runChild(process.argv[3]).catch(error => {
            console.error(error && error.stack ? error.stack : String(error));
            process.exit(1);
        });
        return;
    }

    runParent();
}

function runParent() {
    const dylib = process.env.STATA_DYLIB || DEFAULT_DYLIB;
    if (!fs.existsSync(dylib)) {
        console.error(`Stata dylib not found: ${dylib}`);
        console.error('Set STATA_DYLIB=/path/to/libstata-*.dylib and rerun this script.');
        process.exit(1);
    }

    console.log(`Using dylib: ${dylib}`);
    console.log('');

    for (const testCase of CASES) {
        const result = spawnSync(
            process.execPath,
            [__filename, 'child', testCase.name],
            {
                cwd: REPO_ROOT,
                env: {
                    ...process.env,
                    STATA_DYLIB: dylib
                },
                encoding: 'utf8',
                maxBuffer: 1024 * 1024 * 10
            }
        );

        const crashed = result.signal || result.status === null;
        const statusText = crashed
            ? `CRASH signal=${result.signal || 'unknown'}`
            : (result.status === 0 ? 'PASS' : `FAIL exit=${result.status}`);
        console.log(`=== ${testCase.name}: ${statusText} ===`);
        if (result.stdout) {
            console.log(trimForReport(result.stdout));
        }
        if (result.stderr) {
            console.error(trimForReport(result.stderr));
        }
        console.log('');
    }
}

async function runChild(caseName) {
    const testCase = CASES.find(item => item.name === caseName);
    if (!testCase) {
        throw new Error(`Unknown case: ${caseName}`);
    }

    const native = require(path.join(REPO_ROOT, 'bin', 'stata_bridge.node'));
    const dylib = process.env.STATA_DYLIB || DEFAULT_DYLIB;
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `stata-graph-${caseName}-`));
    const stHome = inferStataHome(dylib);

    console.log(`outDir=${outDir}`);
    console.log(`stHome=${stHome}`);

    const initialized = native.initSession(dylib, false, process.execPath, stHome);
    console.log(`initSession=${initialized}`);
    if (!initialized) {
        process.exit(2);
    }

    try {
        for (const commandSpec of testCase.commands) {
            const command = typeof commandSpec === 'function' ? commandSpec({ outDir }) : commandSpec;
            console.log(`>>> ${typeof command === 'object' ? command.command : command}`);
            const result = typeof command === 'object' && command.async
                ? await executeAsync(native, command.command, Boolean(command.echo))
                : native.executeSync(command, false);
            console.log(`rc=${result.returnCode}`);
            const output = String(result.output || '').trim();
            if (output) {
                console.log(output);
            }
            if (result.returnCode !== 0) {
                process.exitCode = 3;
                break;
            }
        }
    } finally {
        try {
            native.shutdown();
        } catch (error) {
            console.error(`shutdown failed: ${error.message}`);
        }
    }
}

function executeAsync(native, command, echo) {
    return new Promise((resolve, reject) => {
        let latestOutput = '';
        try {
            native.execute(command, echo, payload => {
                if (!payload || typeof payload !== 'object') {
                    return;
                }
                if (payload.type === 'output') {
                    latestOutput += payload.data || '';
                    return;
                }
                if (payload.type === 'done') {
                    resolve({
                        returnCode: payload.returnCode,
                        output: payload.output || latestOutput || '',
                        error: payload.error || ''
                    });
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

function makeDoCommand(outDir, filename, lines) {
    const filePath = path.join(outDir, filename);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return `do "${stataQuote(filePath)}"`;
}

function inferStataHome(dylib) {
    const marker = '/StataMP.app/Contents/MacOS/';
    const markerIndex = dylib.indexOf(marker);
    if (markerIndex !== -1) {
        return dylib.slice(0, markerIndex);
    }
    return path.dirname(path.dirname(path.dirname(path.dirname(dylib))));
}

function stataQuote(value) {
    return String(value || '').replace(/"/g, '""');
}

function trimForReport(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const maxLines = 80;
    if (lines.length <= maxLines) {
        return lines.join('\n').trimEnd();
    }
    return lines.slice(0, maxLines).join('\n').trimEnd() + `\n... (${lines.length - maxLines} more lines)`;
}

main();
