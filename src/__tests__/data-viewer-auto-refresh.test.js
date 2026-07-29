const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const panelSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/runCode/embeddedConsole/dataViewer/panel.js'),
    'utf8'
);
const executeSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/runCode/execute/index.js'),
    'utf8'
);

test('marks Console data stale without refreshing an inactive Data Viewer', () => {
    assert.match(panelSource, /_dirty\.console = true;/);
    assert.doesNotMatch(
        panelSource,
        /async function updateData\(\)[\s\S]*?requestPanelRefresh\('console'/
    );
});

test('invalidates Data Viewer data after editor execution on both platforms', () => {
    const runCurrentSectionSource = executeSource.slice(
        executeSource.indexOf('async function runCurrentSection'),
        executeSource.indexOf('async function ensurePlatformExecutionReady')
    );
    assert.equal(
        (runCurrentSectionSource.match(/await invalidateConsoleDataViewer\(\);/g) || []).length,
        2
    );
});

test('refreshes stale Console data when the Data Viewer becomes active', () => {
    assert.match(panelSource, /panel\.onDidChangeViewState\(\(\) => \{/);
    assert.match(
        panelSource,
        /if \(!panel\.active \|\| mode !== 'console' \|\| !_dirty\.console\) return;/
    );
    assert.match(panelSource, /retainContextWhenHidden: true/);
});

test('preserves bare browse position and resets filtered browse views', () => {
    assert.match(
        panelSource,
        /const preservePosition = !_pendingFilter\.console\.trim\(\);/
    );
    assert.match(
        panelSource,
        /requestPanelRefresh\('console', _pendingFilter\.console, preservePosition\);/
    );
    assert.match(panelSource, /function captureViewport\(\)/);
    assert.match(panelSource, /function restoreViewport\(viewport\)/);
    assert.match(panelSource, /vscode\.setState\(webviewState\)/);
    assert.match(panelSource, /type: 'viewportChanged'/);
    assert.match(
        panelSource,
        /viewport: preservePosition \? _lastViewport\[mode\] : null/
    );
    assert.match(panelSource, /viewport: webviewState\.viewport \|\| null/);
});

test('loads a target row window instead of all preceding pages', () => {
    assert.match(panelSource, /const VIEW_WINDOW_SIZE = 700;/);
    assert.match(panelSource, /const VIEW_WINDOW_LEAD = 100;/);
    assert.match(panelSource, /type: 'loadWindow'/);
    assert.match(panelSource, /type: 'setWindow'/);
    assert.match(panelSource, /var dataWindowStart = 0;/);
});

test('restores the vertical viewport only after virtual row spacers exist', () => {
    assert.match(panelSource, /var pendingViewportRestore = null;/);
    const rowsRendered = panelSource.indexOf('tbody.appendChild(fragment);');
    const scrollRestored = panelSource.indexOf(
        'contentEl.scrollTop = viewportRestore.rowIndex * virtualRowHeight'
    );
    assert.ok(rowsRendered >= 0);
    assert.ok(scrollRestored > rowsRendered);
});
