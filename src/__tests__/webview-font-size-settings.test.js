const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

function read(relativePath) {
    return fs.readFileSync(path.join(__dirname, '../..', relativePath), 'utf8');
}

const manifest = JSON.parse(read('package.json'));
const english = JSON.parse(read('package.nls.json'));
const chinese = JSON.parse(read('package.nls.zh-cn.json'));
const extensionSource = read('src/extension.js');
const configSource = read('src/utils/config.js');
const commonSource = read('src/utils/common.js');
const consoleSource = read('src/modules/runCode/embeddedConsole/panel.js');
const dataViewerSource = read('src/modules/runCode/embeddedConsole/dataViewer/panel.js');

function loadConfig({ editorFontSize, globalValue, workspaceValue, workspaceFolderValue }) {
    const modulePath = path.join(__dirname, '../utils/config.js');
    delete require.cache[modulePath];
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === 'vscode' && parent && parent.filename === modulePath) {
            return {
                workspace: {
                    getConfiguration(namespace) {
                        if (namespace === 'editor') {
                            return { get: (_key, fallback) => editorFontSize ?? fallback };
                        }
                        return {
                            get: (_key, fallback) => fallback,
                            inspect: () => ({ globalValue, workspaceValue, workspaceFolderValue })
                        };
                    }
                }
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        return require(modulePath);
    } finally {
        Module._load = originalLoad;
    }
}

test('uses one localized font-size setting for Console and Data Viewer', () => {
    const setting = manifest.contributes.configuration.properties[
        'stata-all-in-one.consoleAndDataViewerFontSize'
    ];
    assert.deepEqual(setting, {
        type: ['number', 'null'],
        default: null,
        minimum: 6,
        maximum: 72,
        markdownDescription: '%config.consoleAndDataViewerFontSize.description%'
    });
    assert.match(english['config.consoleAndDataViewerFontSize.description'], /Console and Data Viewer/);
    assert.match(english['config.consoleAndDataViewerFontSize.description'], /Leave empty.*Editor: Font Size/);
    assert.match(chinese['config.consoleAndDataViewerFontSize.description'], /Console 和 Data Viewer/);
    assert.match(chinese['config.consoleAndDataViewerFontSize.description'], /留空（默认）.*Editor: Font Size/);
    assert.match(configSource, /inspect\('consoleAndDataViewerFontSize'\)/);
    assert.match(configSource, /getConfiguration\('editor'\)\.get\('fontSize', 14\)/);
});

test('reads the current VS Code editor size until the shared size is explicitly configured', () => {
    assert.equal(loadConfig({ editorFontSize: 17 }).getConsoleAndDataViewerFontSize(), 17);
    assert.equal(
        loadConfig({ editorFontSize: 17, globalValue: 15 }).getConsoleAndDataViewerFontSize(),
        15
    );
    assert.equal(
        loadConfig({ editorFontSize: 17, globalValue: 15, workspaceValue: 16 })
            .getConsoleAndDataViewerFontSize(),
        16
    );
});

test('treats an empty shared setting as the current editor size', () => {
    assert.equal(
        loadConfig({ editorFontSize: 17, globalValue: null }).getConsoleAndDataViewerFontSize(),
        17
    );
});

test('applies the shared default editor size live without a zero sentinel', () => {
    assert.match(consoleSource, /--console-font-size:\s*\$\{fontOptions\.fontSize\}px/);
    assert.match(consoleSource, /font-size:\s*var\(--console-font-size\)/);
    assert.match(dataViewerSource, /--data-viewer-font-size:.*fontSizeCss/);
    assert.match(dataViewerSource, /font-size:\s*var\(--data-viewer-font-size\)/);
    assert.match(dataViewerSource, /virtualRowHeight = Math\.max\(28, Math\.ceil\(tableFontSize \* 1\.5 \+ 8\)\)/);
    assert.match(consoleSource, /type:\s*'fontSize',[\s\S]*next\.fontSize/);
    assert.match(consoleSource, /message\.type === 'fontSize'[\s\S]*--console-font-size/);
    assert.match(dataViewerSource, /function applyFontSize\(value\)[\s\S]*--data-viewer-font-size/);
    assert.match(dataViewerSource, /type:\s*'fontSize',[\s\S]*_fontSize/);
    assert.doesNotMatch(
        dataViewerSource,
        /function setDataViewerFontSize\(fontSize\)\s*\{[\s\S]*?_ready\[mode\] = false;/
    );
    assert.equal(extensionSource.includes("event.affectsConfiguration('editor.fontSize')"), true);
    assert.equal(
        extensionSource.includes("event.affectsConfiguration('stata-all-in-one.consoleAndDataViewerFontSize')"),
        true
    );
    assert.equal(extensionSource.includes('setDataViewerFontSize(options.fontSize)'), true);
    assert.equal(extensionSource.includes('ensureConsoleAndDataViewerFontSize'), false);
    assert.match(extensionSource, /showInfo\(msg\('webviewFontSizeUpdated'/);
    assert.match(commonSource, /font size adjusted from \$\{previousSize\} to \$\{fontSize\}/);
    assert.match(commonSource, /字号已由 \$\{previousSize\} 调整为 \$\{fontSize\}/);
});
