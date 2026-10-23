const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    BUNDLED_CODICON_DIRECTORY,
    resolveCodiconFontDirectory
} = require('../modules/runCode/embeddedConsole/codiconFont');

function withDirectories(run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codicon-font-'));
    const appRoot = path.join(root, 'app');
    const bundled = path.join(root, 'bundled');
    fs.mkdirSync(path.join(appRoot, 'out', 'media'), { recursive: true });
    fs.mkdirSync(bundled);
    try {
        run({ appRoot, bundled });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('a local VS Code install keeps using its own codicon font', () => {
    withDirectories(({ appRoot, bundled }) => {
        fs.writeFileSync(path.join(appRoot, 'out', 'media', 'codicon.ttf'), 'font');
        fs.writeFileSync(path.join(bundled, 'codicon.ttf'), 'font');
        assert.equal(
            resolveCodiconFontDirectory(appRoot, { bundledDirectory: bundled }),
            path.join(appRoot, 'out', 'media')
        );
    });
});

test('VS Code Server without out/media/codicon.ttf falls back to the bundled font', () => {
    withDirectories(({ appRoot, bundled }) => {
        fs.writeFileSync(path.join(bundled, 'codicon.ttf'), 'font');
        assert.equal(resolveCodiconFontDirectory(appRoot, { bundledDirectory: bundled }), bundled);
        assert.equal(resolveCodiconFontDirectory(undefined, { bundledDirectory: bundled }), bundled);
    });
});

test('with no font anywhere the previous VS Code location is kept', () => {
    withDirectories(({ appRoot, bundled }) => {
        assert.equal(
            resolveCodiconFontDirectory(appRoot, { bundledDirectory: bundled }),
            path.join(appRoot, 'out', 'media')
        );
    });
});

test('the bundled codicon font is installed and contains every icon the webviews use', () => {
    const fontPath = path.join(BUNDLED_CODICON_DIRECTORY, 'codicon.ttf');
    assert.ok(fs.statSync(fontPath).size > 10000, 'run npm ci to install @vscode/codicons');
    const css = fs.readFileSync(path.join(BUNDLED_CODICON_DIRECTORY, 'codicon.css'), 'utf8');
    const available = new Set([...css.matchAll(/content:\s*"\\([0-9a-f]+)"/g)].map(match => match[1]));
    const sources = [
        '../modules/runCode/embeddedConsole/panel.js',
        '../modules/runCode/embeddedConsole/dataViewer/panel.js'
    ].map(file => fs.readFileSync(path.join(__dirname, file), 'utf8'));
    const used = new Set(sources.flatMap(source => [...source.matchAll(/\\\\(e[0-9a-f]{3})\b/g)].map(match => match[1])));
    assert.ok(used.size >= 10, 'the scan should find the icon codes');
    assert.deepEqual([...used].filter(code => !available.has(code)), []);
});
