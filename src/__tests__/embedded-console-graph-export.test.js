const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    beginGraphCapture,
    executeBitmapGraphExport,
    exportCapturedGraphs
} = require('../modules/runCode/embeddedConsole/graphs');

const TEST_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="white"/></svg>';

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'stata-graph-export-test-'));
}

function removeTempDir(tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
}

function createMockConsoleSession() {
    return {
        executedCommands: [],
        async execute(command) {
            this.executedCommands.push(command);
            const match = String(command).match(/graph export "((?:[^"]|"")+)"/i);
            if (!match) {
                return {
                    success: false,
                    returnCode: 198,
                    output: '',
                    error: 'unexpected command'
                };
            }

            fs.writeFileSync(match[1].replace(/""/g, '"'), TEST_SVG);
            return {
                success: true,
                returnCode: 0,
                output: '',
                error: ''
            };
        }
    };
}

test('bitmap graph export uses injected converter and removes temporary SVG', async () => {
    const tempDir = makeTempDir();
    try {
        const consoleSession = createMockConsoleSession();
        const targetPath = path.join(tempDir, 'foreign.jpg');
        let converterRequest = null;
        let tempSvgPath = '';

        const result = await executeBitmapGraphExport(
            consoleSession,
            tempDir,
            'graph export "foreign.jpg", width(320) height(240) replace',
            tempDir,
            async (svgPath, target, request) => {
                tempSvgPath = svgPath;
                converterRequest = request;
                assert.equal(target, targetPath);
                assert.equal(fs.readFileSync(svgPath, 'utf8'), TEST_SVG);
                fs.writeFileSync(target, 'fake-jpeg');
            }
        );

        assert.equal(result.success, true);
        assert.equal(result.returnCode, 0);
        assert.match(result.output, /JPG format/);
        assert.equal(fs.readFileSync(targetPath, 'utf8'), 'fake-jpeg');
        assert.equal(converterRequest.format, 'jpg');
        assert.equal(converterRequest.width, 320);
        assert.equal(converterRequest.height, 240);
        assert.equal(fs.existsSync(tempSvgPath), false);
        assert.equal(consoleSession.executedCommands.length, 1);
        assert.match(consoleSession.executedCommands[0], /^quietly graph export "/);
    } finally {
        removeTempDir(tempDir);
    }
});

test('bitmap graph export keeps Stata-style file exists behavior without replace', async () => {
    const tempDir = makeTempDir();
    try {
        const consoleSession = createMockConsoleSession();
        const existingPath = path.join(tempDir, 'existing.png');
        fs.writeFileSync(existingPath, 'old');

        const result = await executeBitmapGraphExport(
            consoleSession,
            tempDir,
            'graph export existing.png',
            tempDir,
            async () => {
                throw new Error('converter should not run');
            }
        );

        assert.equal(result.success, false);
        assert.equal(result.returnCode, 602);
        assert.match(result.error, /already exists/);
        assert.equal(fs.readFileSync(existingPath, 'utf8'), 'old');
        assert.equal(consoleSession.executedCommands.length, 0);
    } finally {
        removeTempDir(tempDir);
    }
});

test('non-bitmap graph export is left for native Stata execution', async () => {
    const result = await executeBitmapGraphExport(
        createMockConsoleSession(),
        os.tmpdir(),
        'graph export foreign.pdf, replace',
        os.tmpdir(),
        async () => {
            throw new Error('converter should not run');
        }
    );

    assert.equal(result, null);
});

test('reset capture windows preserve repeated identical graphs without probing old graphs again', async () => {
    const tempDir = makeTempDir();
    try {
        let graphNames = ['Graph'];
        const executedCommands = [];
        const consoleSession = {
            async execute(command) {
                executedCommands.push(command);
                if (command === 'quietly _gr_list on') {
                    return { success: true, returnCode: 0, output: '' };
                }
                if (command === 'quietly _gr_list off') {
                    graphNames = [];
                    return { success: true, returnCode: 0, output: '' };
                }
                if (command === 'quietly _gr_list list') {
                    return { success: true, returnCode: 0, output: '' };
                }
                if (command === 'display "`r(_grlist)\'"') {
                    return { success: true, returnCode: 0, output: graphNames.join(' ') };
                }

                const match = String(command).match(/graph export "((?:[^"]|"")+)"/i);
                assert.ok(match, `unexpected command: ${command}`);
                fs.writeFileSync(match[1].replace(/""/g, '"'), TEST_SVG);
                return { success: true, returnCode: 0, output: '' };
            }
        };

        const captureState = await beginGraphCapture(consoleSession);
        const first = await exportCapturedGraphs(
            consoleSession,
            tempDir,
            captureState,
            { resetAfterExport: true }
        );
        graphNames = ['Graph'];
        const repeated = await exportCapturedGraphs(
            consoleSession,
            tempDir,
            captureState,
            { resetAfterExport: true }
        );
        const afterReset = await exportCapturedGraphs(
            consoleSession,
            tempDir,
            captureState,
            { resetAfterExport: true }
        );

        assert.equal(first.length, 1);
        assert.equal(repeated.length, 1);
        assert.equal(afterReset.length, 0);
        assert.notEqual(first[0].filePath, repeated[0].filePath);
        assert.equal(executedCommands.filter(command => command === 'quietly _gr_list off').length, 2);
        assert.equal(captureState.enabled, true);
    } finally {
        removeTempDir(tempDir);
    }
});
