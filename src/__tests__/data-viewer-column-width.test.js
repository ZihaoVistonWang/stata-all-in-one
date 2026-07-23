const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const panelSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/runCode/embeddedConsole/dataViewer/panel.js'),
    'utf8'
);
const commonSource = fs.readFileSync(
    path.resolve(__dirname, '../utils/common.js'),
    'utf8'
);

test('uses the requested hard minimum and automatic maximum column widths', () => {
    assert.match(panelSource, /var colMinWidth = 72;/);
    assert.match(panelSource, /var autoColMaxWidth = 210;/);
    assert.match(panelSource, /var varsAutoColMaxWidths = \[156, 100, 100, 210\];/);
    assert.match(
        panelSource,
        /Math\.max\(colMinWidth, Math\.min\(limit, Math\.ceil\(width \|\| 0\)\)\)/
    );
    assert.match(
        panelSource,
        /clampAutoColumnWidth\(naturalWidth, varsAutoColMaxWidths\[col\]\)/
    );
});

test('keeps manual resizing independent from the automatic maximum', () => {
    assert.match(panelSource, /var newWidth = Math\.max\(colMinWidth, resizeStartWidth \+ delta\);/);
    assert.match(panelSource, /varsColumnManualWidths\[resizeCol\] = true;/);
    assert.match(panelSource, /columnManualWidths\[resizeCol\] = true;/);
});

test('shows the custom full-text tooltip only when the hovered cell overflows', () => {
    assert.match(panelSource, /id="cell-overflow-tooltip"/);
    assert.match(panelSource, /function cellHasOverflow\(cell\)/);
    assert.match(panelSource, /cell\.scrollWidth > cell\.clientWidth \+ 1/);
    assert.match(panelSource, /function showOverflowTooltip\(cell\)/);
    assert.match(panelSource, /showTooltipForTarget\(cell, fullText, true\)/);
    assert.match(panelSource, /document\.addEventListener\('mouseover'/);
    assert.match(panelSource, /document\.addEventListener\('mouseout'/);
    assert.match(panelSource, /#table-vars tbody td\[data-full-text\]/);
    assert.match(panelSource, /#table-data tbody td\[data-full-text\]/);
    assert.doesNotMatch(panelSource, /th2\.setAttribute\('data-full-text'/);
    assert.doesNotMatch(panelSource, /ths\[i\]\.setAttribute\('data-full-text'/);
    assert.match(panelSource, /showTooltipForTarget\(handle, autoFitColumnLabel, false\)/);
    assert.doesNotMatch(panelSource, /handle\.setAttribute\('title', autoFitColumnLabel\)/);
});

test('copies the full cell text through the VS Code clipboard on double click', () => {
    assert.match(panelSource, /document\.addEventListener\('dblclick'/);
    assert.match(panelSource, /type: 'copyCell'/);
    assert.match(panelSource, /column: column/);
    assert.match(panelSource, /cell\.getAttribute\('data-full-text'\)/);
    assert.match(panelSource, /vscode\.env\.clipboard\.writeText/);
    assert.match(panelSource, /vscode\.window\.showInformationMessage/);
    assert.doesNotMatch(panelSource, /type: 'copyCellResult'/);
});

test('localizes the Stata memory footer as a double-click copy hint', () => {
    assert.match(panelSource, /info\.source === 'Stata memory'/);
    assert.match(panelSource, /msg\('dataViewerDoubleClickCopyHint'\)/);
    assert.match(commonSource, /dataViewerDoubleClickCopyHint: 'Double-click a cell to copy its content'/);
    assert.match(commonSource, /dataViewerDoubleClickCopyHint: '双击单元格可复制内容'/);
    assert.match(commonSource, /dataViewerCellCopied: \(\{ column, value \}\) => `Copied \$\{column\}: \$\{value\}`/);
    assert.match(commonSource, /dataViewerCellCopied: \(\{ column, value \}\) => `已复制\$\{column\}：\$\{value\}`/);
});

test('auto-fits a column to its measured maximum when its resize handle is double clicked', () => {
    assert.match(panelSource, /function onResizeHandleDoubleClick\(e\)/);
    assert.match(panelSource, /function measureStyledText\(text, sourceEl\)/);
    assert.match(panelSource, /function measureVarsColumnForAutoFit\(colIndex\)/);
    assert.match(panelSource, /function measureDataColumnForAutoFit\(colIndex, headerCell, fullColumnValue\)/);
    assert.match(panelSource, /measureVarsColumnForAutoFit\(colIndex\)/);
    assert.match(panelSource, /measureDataColumnForAutoFit\(\s*colIndex,\s*handle\.parentElement/);
    assert.match(panelSource, /for \(var rowIndex = 0; rowIndex < dataRowsCache\.length; rowIndex\+\+\)/);
    assert.match(panelSource, /type: 'autoFitColumn'/);
    assert.match(panelSource, /message\.type === 'autoFitColumnResult'/);
    assert.match(panelSource, /addEventListener\('dblclick', onResizeHandleDoubleClick\)/);
    assert.match(commonSource, /dataViewerAutoFitColumn: 'Double-click to fit column width'/);
    assert.match(commonSource, /dataViewerAutoFitColumn: '双击自动调整列宽'/);
});

test('resets manual column widths before the refresh button reloads data', () => {
    assert.match(
        panelSource,
        /getElementById\('refresh-btn'\)\.addEventListener\('click', function \(\) \{\s*resetColumnWidthsForRefresh\(\);\s*requestRefresh\(\);/
    );
    assert.match(panelSource, /function resetColumnWidthsForRefresh\(\)/);
    assert.match(panelSource, /varsColumnManualWidths = \[false, false, false, false\];/);
    assert.match(panelSource, /columnManualWidths\[col\] = false;/);
});
