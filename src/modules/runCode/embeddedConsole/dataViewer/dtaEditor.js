const vscode = require('vscode');
const { openDtaFileInDataViewer } = require('./panel');
const { getOpenDataViewerTabs } = require('../editorRestorePolicy');

const DTA_EDITOR_VIEW_TYPE = 'stata-all-in-one.dtaViewer';

class DtaDataViewerDocument {
    constructor(uri) {
        this.uri = uri;
    }

    dispose() {}
}

class DtaDataViewerProvider {
    constructor(context) {
        this.context = context;
    }

    async openCustomDocument(uri) {
        return new DtaDataViewerDocument(uri);
    }

    async resolveCustomEditor(document, webviewPanel) {
        // Direct .dta parsing is independent of the Embedded Console and Stata.
        await openDtaFileInDataViewer(this.context, document.uri, webviewPanel);
    }
}

function registerDtaDataViewer(context) {
    const provider = new DtaDataViewerProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(DTA_EDITOR_VIEW_TYPE, provider, {
            supportsMultipleEditorsPerDocument: false,
            webviewOptions: {
                enableScripts: true,
                retainContextWhenHidden: false,
                enableServiceWorker: false
            }
        })
    );
}

async function closeRestoredDataViewerTabs() {
    // Data Viewer is intentionally session-only. VS Code restores custom
    // editors automatically, so remove both custom-editor and webview forms
    // once during extension activation. Tabs opened later are unaffected.
    const tabs = getOpenDataViewerTabs(vscode.window.tabGroups.all);
    if (tabs.length > 0) {
        await vscode.window.tabGroups.close(tabs, true);
    }
}

module.exports = {
    closeRestoredDataViewerTabs,
    registerDtaDataViewer,
    DTA_EDITOR_VIEW_TYPE
};
