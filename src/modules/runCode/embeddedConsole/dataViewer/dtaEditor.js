const vscode = require('vscode');
const { openDtaFileInDataViewer } = require('./panel');

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
        await openDtaFileInDataViewer(this.context, document.uri, webviewPanel);
    }
}

function registerDtaDataViewer(context) {
    const provider = new DtaDataViewerProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(DTA_EDITOR_VIEW_TYPE, provider, {
            supportsMultipleEditorsPerDocument: false,
            webviewOptions: {
                retainContextWhenHidden: false
            }
        })
    );
}

module.exports = {
    registerDtaDataViewer,
    DTA_EDITOR_VIEW_TYPE
};
