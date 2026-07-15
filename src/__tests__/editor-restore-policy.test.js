const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getOpenDataViewerTabs,
    hasOpenStataSourceTab,
    isStataSourceTab
} = require('../modules/runCode/embeddedConsole/editorRestorePolicy');

function tab(filePath, viewType) {
    return {
        input: viewType
            ? { viewType, uri: { fsPath: filePath } }
            : { uri: { fsPath: filePath } }
    };
}

test('recognizes do, ado, and mata editor tabs case-insensitively', () => {
    assert.equal(isStataSourceTab(tab('/tmp/example.do')), true);
    assert.equal(isStataSourceTab(tab('/tmp/example.ADO')), true);
    assert.equal(isStataSourceTab(tab('/tmp/example.Mata')), true);
    assert.equal(isStataSourceTab(tab('/tmp/example.dta')), false);
    assert.equal(isStataSourceTab(tab('/tmp/example.txt')), false);
});

test('finds a Stata source tab in any editor group regardless of focus', () => {
    const groups = [
        { tabs: [tab('/tmp/readme.md')] },
        { tabs: [tab('/tmp/background.ado')] }
    ];

    assert.equal(hasOpenStataSourceTab(groups), true);
    assert.equal(hasOpenStataSourceTab([{ tabs: [tab('/tmp/data.dta')] }]), false);
});

test('collects both console-data and dta custom data viewer tabs', () => {
    const consoleViewer = tab('', 'stata-all-in-one.dataViewer');
    const dtaViewer = tab('/tmp/data.dta', 'stata-all-in-one.dtaViewer');
    const console = tab('', 'stata-all-in-one.webviewTerminal');
    const groups = [{ tabs: [consoleViewer, console, dtaViewer] }];

    assert.deepEqual(getOpenDataViewerTabs(groups), [consoleViewer, dtaViewer]);
});
