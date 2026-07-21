const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            workspace: { getConfiguration: () => ({ get: () => '' }) },
            extensions: { all: [] },
            env: { appRoot: '/tmp/vscode' },
            Uri: {
                file: value => ({ fsPath: value, toString: () => value }),
                joinPath: (base, ...parts) => ({
                    fsPath: path.join(base.fsPath, ...parts),
                    toString: () => path.join(base.fsPath, ...parts)
                })
            }
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { SecondarySidebarConsole } = require('../modules/runCode/secondarySidebar/console');
const { getSecondarySidebarHtml } = require('../modules/runCode/secondarySidebar/webview');
const { getConsoleFrameHtml } = require('../modules/runCode/secondarySidebar/consoleView');
const { getDataViewerFrameHtml } = require('../modules/runCode/secondarySidebar/dataViewerView');
Module._load = originalLoad;

test('manifest contributes one SAiO secondary sidebar webview and defaults to it', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    const containers = manifest.contributes.viewsContainers.secondarySidebar;
    assert.equal(containers.length, 1);
    assert.equal(containers[0].title, 'SAiO');
    assert.match(containers[0].id, /^[A-Za-z0-9_-]+$/);
    const views = manifest.contributes.views[containers[0].id];
    assert.equal(views.length, 1);
    assert.equal(views[0].id, 'stata-all-in-one.secondarySidebar');
    assert.equal(views[0].name, 'SAiO');
    assert.equal(manifest.contributes.configuration.properties['stata-all-in-one.runMode'].default, 'secondarySidebar');
    assert.equal(manifest.engines.vscode, '^1.94.0');
});

test('secondary sidebar console owns its history and status independently', async () => {
    const messages = [];
    const consoleState = new SecondarySidebarConsole(message => messages.push(message));
    const sink = consoleState.createSink(async () => {});

    await sink.prepareForExecution();
    sink.writeCommand('summarize price');
    sink.writeOutputChunk('Obs = 74\n');
    sink.writeRunFooter(125);

    assert.equal(consoleState.status, 'success');
    assert.ok(consoleState.history.length > 0);
    assert.ok(messages.some(message => message.type === 'console.append'));

    consoleState.clear();
    assert.equal(consoleState.history.length, 0);
    assert.equal(consoleState.status, 'idle');
});

test('secondary sidebar carries the embedded Console and Data Viewer visual structure', () => {
    const panelSource = fs.readFileSync(path.join(
        __dirname,
        '../modules/runCode/secondarySidebar/panel.js'
    ), 'utf8');

    assert.match(panelSource, /getSecondarySidebarHtml/);
    const webview = {
        cspSource: 'vscode-webview:',
        asWebviewUri: uri => uri
    };
    const fontOptions = { fontMode: 'editor' };
    const html = getSecondarySidebarHtml(webview, { version: '0.3.3', fontOptions });
    const consoleHtml = getConsoleFrameHtml(webview, fontOptions);
    const dataViewerHtml = getDataViewerFrameHtml(webview);
    assert.match(html, /Stata All in One/);
    assert.match(html, /console-frame/);
    assert.match(html, /dataViewer-frame/);
    assert.match(html, /secondarySidebar\.theme/);
    assert.match(html, /const frameReady = \{ console: false, dataViewer: false \}/);
    assert.match(html, /frameQueues/);
    assert.match(html, /frame === 'console' && !extensionReady/);
    assert.match(html, /loadFrame\('console'\)/);
    // Theme variables are now baked into iframe :root at HTML generation time
    assert.match(html, /--vscode-editor-background/);
    assert.match(html, /--vscode-editor-foreground/);
    assert.match(consoleHtml, /class="statusbar"/);
    assert.match(consoleHtml, /id="export-button"/);
    assert.match(consoleHtml, /function createGraphActionIcon/);
    assert.match(consoleHtml, /graphFullscreenVisual\.replaceChildren\(createGraphVisual/);
    assert.match(consoleHtml, /pointer-events: none/);
    assert.doesNotMatch(consoleHtml, /id="export-button"[\s\S]{0,200}codicon-share/);
    assert.match(consoleHtml, /placeholder-logo-top/);
    assert.match(consoleHtml, /id="working-seconds"/);
    assert.match(consoleHtml, /bootstrapConsoleFont/);
    assert.match(consoleHtml, /applyConsoleFont\('system'\);\s*promoteOnlineConsoleFont\(\)/);
    assert.match(consoleHtml, /function loadOnlineCjkFontStylesheet/);
    assert.doesNotMatch(consoleHtml, /<link rel="stylesheet" href="https:\/\/fontsapi\.zeoseven\.com/);
    assert.match(consoleHtml, /classList\.add\('saio-ready'\)/);
    assert.match(consoleHtml, /ResizeObserver/);
    assert.match(consoleHtml, /applyHostTheme/);
    assert.match(consoleHtml, /fitPlaceholderLogo/);
    assert.match(consoleHtml, /resetResultBlockScrollPositions/);
    assert.doesNotMatch(consoleHtml, /type: 'viewportWidth'/);
    assert.doesNotMatch(consoleHtml, /id="data-button"/);
    assert.match(dataViewerHtml, /class="tab-bar"/);
    assert.match(dataViewerHtml, /codicon-filter/);
    assert.match(dataViewerHtml, /id="info-bar"/);
    assert.match(dataViewerHtml, /applyHostTheme/);
    assert.match(dataViewerHtml, /classList\.add\('saio-ready'\)/);
    assert.match(panelSource, /svgText: fs\.readFileSync\(entry\.filePath, 'utf8'\)/);
    assert.match(panelSource, /data:\$\{mimeTypes\[extension\]/);
    assert.match(consoleHtml, /function createGraphVisual/);
    assert.match(consoleHtml, /new DOMParser\(\)\.parseFromString\(svgText, 'image\/svg\+xml'\)/);

    for (const documentHtml of [html, consoleHtml, dataViewerHtml]) {
        const script = documentHtml.match(/<script nonce="[^"]+">([\s\S]+)<\/script>/);
        assert.ok(script);
        assert.doesNotThrow(() => new Function(script[1]));
    }
});

test('overflow notices are localized and selected by run mode', () => {
    const extensionSource = fs.readFileSync(path.join(__dirname, '../extension.js'), 'utf8');
    const commonSource = fs.readFileSync(path.join(__dirname, '../utils/common.js'), 'utf8');

    assert.match(extensionSource, /config\.getRunMode\(\)/);
    assert.match(extensionSource, /secondarySidebarOverflowNotice/);
    assert.match(extensionSource, /consoleOverflowNoticeResetExternal/);
    assert.match(commonSource, /secondarySidebarConsoleSurfaceName: 'Secondary Sidebar Console'/);
    assert.match(commonSource, /secondarySidebarConsoleSurfaceName: '辅助侧栏控制台'/);
    assert.match(commonSource, /consoleOverflowNoticeReset:/);
});
