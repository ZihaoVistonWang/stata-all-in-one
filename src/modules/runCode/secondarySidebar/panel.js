const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const config = require('../../../utils/config');
const { msg, showInfo, showWarn, showError } = require('../../../utils/common');
const { createExportFilename, serializeConsoleExport } = require('../embeddedConsole/consoleExport');
const { getConsoleFontWebviewOptions } = require('../../../utils/consoleFonts');
const variableSuggestions = require('../../variableSuggestionService');
const { SecondarySidebarConsole } = require('./console');
const { SecondarySidebarDataViewer } = require('./dataViewer');
const { highlightText, highlightFilterText, getConsoleAutocomplete } = require('./interactions');
const { getSecondarySidebarHtml } = require('./webview');

const VIEW_ID = 'stata-all-in-one.secondarySidebar';
const CONTAINER_COMMAND = 'workbench.view.extension.stata-all-in-one-secondarySidebarContainer';
const CODICON_RESOURCE_ROOT = vscode.Uri.joinPath(vscode.Uri.file(vscode.env.appRoot), 'out', 'media');

let _context = null;
let _view = null;
let _ready = false;
let _activeTab = 'console';
let _commandHandler = null;
let _actionHandler = null;
let _graphResourceRoot = null;
let _requestSeq = 0;
const _pendingGraphRequests = new Map();
const _readyWaiters = new Set();

function postMessage(message) {
    if (_view && _ready) {
        _view.webview.postMessage(message);
    }
}

function postFrameMessage(frame, message) {
    postMessage({ type: 'secondarySidebar.frameHostMessage', frame, message });
}

const _console = new SecondarySidebarConsole(message => {
    if (message.type === 'console.append') {
        postMessage({ ...message, entries: hydrateEntries(message.entries) });
    } else {
        postMessage(message);
    }
});
const _dataViewer = new SecondarySidebarDataViewer(postMessage);

function localResourceRoots() {
    const roots = [CODICON_RESOURCE_ROOT];
    if (_graphResourceRoot) roots.push(vscode.Uri.file(_graphResourceRoot));
    return roots;
}

function hydrateEntries(entries) {
    return (Array.isArray(entries) ? entries : []).map(entry => {
        if (!entry || entry.kind !== 'graph' || !entry.filePath || !_view) return entry;
        try {
            const extension = path.extname(entry.filePath).slice(1).toLowerCase();
            if (extension === 'svg') {
                return {
                    ...entry,
                    src: '',
                    svgText: fs.readFileSync(entry.filePath, 'utf8')
                };
            }
            const mimeTypes = {
                png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp'
            };
            const imageBytes = fs.readFileSync(entry.filePath);
            const hydrated = {
                ...entry,
                src: `data:${mimeTypes[extension] || 'application/octet-stream'};base64,${imageBytes.toString('base64')}`
            };
            return hydrated;
        } catch (_error) {
            return entry;
        }
    });
}

function postState() {
    if (!_ready) return;
    postMessage({
        type: 'sidebar.state',
        activeTab: _activeTab,
        console: {
            ..._console.getState(),
            entries: hydrateEntries(_console.history),
            composerTips: [...msg('composerTips')],
            overflowNoticeSuppressed: _console.overflowNoticeSuppressed
        },
        dataViewer: _dataViewer.getState()
    });
}

async function reveal(tab = 'console', preserveFocus = true) {
    _activeTab = tab === 'dataViewer' ? 'dataViewer' : 'console';
    if (!_view) {
        await vscode.commands.executeCommand(CONTAINER_COMMAND);
    }
    if (_view) {
        _view.show(Boolean(preserveFocus));
        postMessage({ type: 'sidebar.tab', tab: _activeTab });
    }
    if (preserveFocus) {
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    }
    return _view;
}

function waitUntilReady(timeoutMs = 5000) {
    if (_ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
        let timeout = null;
        const waiter = () => {
            clearTimeout(timeout);
            resolve();
        };
        timeout = setTimeout(() => {
            _readyWaiters.delete(waiter);
            reject(new Error('SAiO secondary sidebar did not become ready.'));
        }, timeoutMs);
        _readyWaiters.add(waiter);
    });
}

async function revealConsole(preserveFocus = true) {
    return reveal('console', preserveFocus);
}

async function revealDataViewer(filterText = '') {
    await reveal('dataViewer', true);
    await _dataViewer.showConsole(filterText);
    return _view;
}

async function openDtaFileInDataViewer(context, uri) {
    if (!uri || uri.scheme !== 'file') return null;
    await reveal('dataViewer', true);
    await _dataViewer.showFile(uri.fsPath);
    return _view;
}

function setWebviewCommandHandler(handler) {
    _commandHandler = typeof handler === 'function' ? handler : null;
}

function setWebviewActionHandler(handler) {
    _actionHandler = typeof handler === 'function' ? handler : null;
}

function setGraphResourceRoot(resourceRoot) {
    _graphResourceRoot = resourceRoot || null;
    if (_view) {
        _view.webview.options = {
            ..._view.webview.options,
            localResourceRoots: localResourceRoots()
        };
    }
}

function setOverflowNoticeSuppressed(suppressed) {
    _console.overflowNoticeSuppressed = Boolean(suppressed);
    postMessage({ type: 'overflowNoticePreference', suppressed: Boolean(suppressed) });
}

function resolveGraphRequest(message) {
    const pending = _pendingGraphRequests.get(String(message.requestId || ''));
    if (!pending) return;
    clearTimeout(pending.timeout);
    _pendingGraphRequests.delete(String(message.requestId || ''));
    if (message.type === 'graphImageDataUrl') {
        pending.resolve(String(message.dataUrl || ''));
    } else {
        pending.reject(new Error(String(message.message || msg('graphImageConversionFailed'))));
    }
}

async function convertGraphSvgToBitmap(sourcePath, targetPath, request = {}) {
    await revealConsole(true);
    await waitUntilReady();
    const requestId = `secondary-graph-${Date.now()}-${_requestSeq += 1}`;
    const svgText = await fs.promises.readFile(sourcePath, 'utf8');
    const format = String(request.format || path.extname(targetPath).slice(1) || 'png').toLowerCase();
    const dataUrl = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            _pendingGraphRequests.delete(requestId);
            reject(new Error(msg('graphImageRequestTimeout')));
        }, 15000);
        _pendingGraphRequests.set(requestId, { resolve, reject, timeout });
        postMessage({
            type: 'requestGraphImageDataUrl',
            requestId,
            svgText,
            format,
            dpi: config.getGraphPngDpi(),
            width: request.width || 0,
            height: request.height || 0
        });
    });
    const match = dataUrl.match(/^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error(msg('graphInvalidImageData'));
    await fs.promises.writeFile(targetPath, Buffer.from(match[1], 'base64'));
}

async function saveGraphAs(filePath, graphName) {
    const sourcePath = String(filePath || '');
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        showWarn(msg('graphFileUnavailable'));
        return;
    }
    const dpi = config.getGraphPngDpi();
    const picked = await vscode.window.showQuickPick([
        { label: msg('graphFormatSvg'), description: msg('graphFormatSvgDescription'), value: 'svg' },
        { label: msg('graphFormatPng'), description: msg('graphFormatPngDescription', { dpi }), value: 'png' },
        { label: msg('graphFormatJpg'), description: msg('graphFormatJpgDescription', { dpi }), value: 'jpg' }
    ], { placeHolder: msg('graphSaveFormatPlaceholder') });
    if (!picked) return;
    const safeName = String(graphName || path.basename(sourcePath, path.extname(sourcePath)) || 'graph')
        .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'graph';
    const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(path.dirname(sourcePath), `${safeName}.${picked.value}`)),
        filters: { [msg('graphImageFilter')]: [picked.value], 'All Files': ['*'] }
    });
    if (!target) return;
    try {
        if (picked.value === 'svg') await fs.promises.copyFile(sourcePath, target.fsPath);
        else await convertGraphSvgToBitmap(sourcePath, target.fsPath, { format: picked.value });
    } catch (error) {
        showError(msg('graphSaveFailed', { message: error.message || String(error) }));
    }
}

async function exportConsoleHistory() {
    if (_console.status === 'running') {
        showWarn(msg('consoleExportWhileRunning'));
        return;
    }
    if (!_console.history.length) {
        showWarn(msg('consoleExportNoHistory'));
        return;
    }
    const picked = await vscode.window.showQuickPick([
        { label: msg('consoleExportHtml'), value: 'html', extension: 'html' },
        { label: msg('consoleExportMarkdown'), value: 'markdown', extension: 'md' },
        { label: msg('consoleExportNotebook'), value: 'notebook', extension: 'ipynb' }
    ], { placeHolder: msg('consoleExportFormatPlaceholder') });
    if (!picked) return;
    const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
            createExportFilename(new Date(), picked.extension)
        )),
        filters: { [msg('consoleExportFileFilter')]: [picked.extension] }
    });
    if (!target) return;
    try {
        const exported = await serializeConsoleExport(_console.history.slice(), picked.value, {
            language: vscode.env.language,
            sourceBefore: msg('consoleExportSourceBefore'),
            sourceAfter: msg('consoleExportSourceAfter'),
            graphUnavailable: graphName => msg('consoleExportGraphUnavailable', { graphName })
        });
        await vscode.workspace.fs.writeFile(target, Buffer.from(exported.content, 'utf8'));
        if (exported.missingGraphs.length) {
            showWarn(msg('consoleExportMissingGraphs', { count: exported.missingGraphs.length }));
        }
    } catch (error) {
        showError(msg('consoleExportFailed', { message: error.message || String(error) }));
    }
}

async function handleMessage(message) {
    if (!message) return;
    if (message.type === 'secondarySidebar.frameMessage') {
        const frame = message.frame === 'dataViewer' ? 'dataViewer' : 'console';
        const frameMessage = message.message || {};
        if (frame === 'console') {
            if (frameMessage.type === 'ready' || frameMessage.type === 'requestVariables') {
                postFrameMessage('console', {
                    type: 'variablesUpdate',
                    variables: variableSuggestions.getActiveVariables()
                });
                if (frameMessage.type === 'ready') postState();
            } else if (frameMessage.type === 'highlightInput') {
                postFrameMessage('console', {
                    type: 'highlightResult',
                    segments: highlightText(String(frameMessage.text || ''))
                });
            } else if (frameMessage.type === 'autocompleteInput') {
                const result = getConsoleAutocomplete(String(frameMessage.text || ''), Number(frameMessage.cursor));
                postFrameMessage('console', {
                    type: 'autocompleteResult',
                    requestId: frameMessage.requestId,
                    matches: result.matches,
                    wordStart: result.context.wordStart
                });
            } else if (frameMessage.type === 'executeInput' && _commandHandler) {
                if (_console.status === 'running') showWarn(msg('consoleBusyAction'));
                else await _commandHandler(String(frameMessage.code || ''));
            } else if (frameMessage.type === 'exportConsole') {
                await exportConsoleHistory();
            } else if (frameMessage.type === 'saveGraph') {
                await saveGraphAs(frameMessage.filePath, frameMessage.graphName);
            } else if (frameMessage.type === 'copyGraphCopied') {
                showInfo(msg('graphCopyPngSuccess'));
            } else if (frameMessage.type === 'copyGraphFailed') {
                const detail = String(frameMessage.message || '').trim();
                showWarn(msg('graphCopyPngFailed', { detail: detail ? ` ${detail}` : '' }));
            } else if (frameMessage.type === 'graphImageDataUrl' || frameMessage.type === 'graphImageDataUrlFailed') {
                resolveGraphRequest(frameMessage);
            } else if (frameMessage.type === 'clearConsole') {
                _console.clear();
            } else if ((frameMessage.type === 'stopExecution' || frameMessage.type === 'showOverflowNotice') && _actionHandler) {
                await _actionHandler(frameMessage.type);
            }
        } else if (frameMessage.type === 'ready') {
            if (_dataViewer.snapshot) {
                postFrameMessage('dataViewer', { type: 'setData', data: _dataViewer.snapshot });
            } else if (_activeTab === 'dataViewer') {
                await _dataViewer.refresh();
            }
            postFrameMessage('dataViewer', {
                type: 'variablesUpdate',
                variables: variableSuggestions.getActiveVariables()
            });
        } else if (frameMessage.type === 'refresh') {
            await _dataViewer.refresh(frameMessage.filterText || '');
        } else if (frameMessage.type === 'highlightFilter') {
            postFrameMessage('dataViewer', {
                type: 'filterHighlightResult',
                segments: highlightFilterText(frameMessage.text || '')
            });
        } else if (frameMessage.type === 'loadMore') {
            await _dataViewer.loadMore(
                Number(frameMessage.startObs) || 0,
                Number(frameMessage.count) || 500,
                frameMessage.filterText || ''
            );
        }
        return;
    }
    if (message.type === 'ready') {
        _ready = true;
        for (const waiter of _readyWaiters) waiter();
        _readyWaiters.clear();
        postState();
        return;
    }
    if (message.type === 'secondarySidebar.switchTab') {
        _activeTab = message.tab === 'dataViewer' ? 'dataViewer' : 'console';
        postMessage({ type: 'sidebar.tab', tab: _activeTab });
        if (_activeTab === 'dataViewer' && !_dataViewer.snapshot) await _dataViewer.refresh();
        return;
    }
    if (message.type === 'executeInput' && _commandHandler) {
        await _commandHandler(String(message.code || ''));
        return;
    }
    if (message.type === 'stopExecution' || message.type === 'clearConsole') {
        if (message.type === 'clearConsole') _console.clear();
        if (message.type === 'stopExecution' && _actionHandler) await _actionHandler(message.type);
        return;
    }
    if (message.type === 'dataViewer.refresh') {
        await _dataViewer.refresh(message.filterText || '');
        return;
    }
    if (message.type === 'exportConsole') {
        await exportConsoleHistory();
        return;
    }
    if (message.type === 'dataViewer.loadMore') {
        await _dataViewer.loadMore(Number(message.startObs) || 0, Number(message.count) || 500, message.filterText || '');
        return;
    }
    if (message.type === 'graphImageDataUrl' || message.type === 'graphImageDataUrlFailed') {
        resolveGraphRequest(message);
    }
}

class SecondarySidebarProvider {
    constructor(context) {
        this.context = context;
    }

    resolveWebviewView(view) {
        _view = view;
        _ready = false;
        view.webview.options = {
            enableScripts: true,
            enableServiceWorker: false,
            localResourceRoots: localResourceRoots()
        };
        view.webview.html = getSecondarySidebarHtml(view.webview, {
            version: this.context.extension.packageJSON.version,
            fontOptions: getConsoleFontWebviewOptions(this.context)
        });
        view.webview.onDidReceiveMessage(handleMessage);
        view.onDidDispose(() => {
            if (_view === view) {
                _view = null;
                _ready = false;
            }
        });
    }
}

function registerSecondarySidebar(context) {
    _context = context;
    const provider = new SecondarySidebarProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
        webviewOptions: { retainContextWhenHidden: true }
    }));
    context.subscriptions.push(variableSuggestions.onDidChangeVariables(() => {
        const variables = variableSuggestions.getActiveVariables();
        postFrameMessage('console', { type: 'variablesUpdate', variables });
        postFrameMessage('dataViewer', { type: 'variablesUpdate', variables });
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (!_view || (!event.affectsConfiguration('editor.fontFamily')
            && !event.affectsConfiguration('stata-all-in-one.consoleFontMode')
            && !event.affectsConfiguration('stata-all-in-one.consoleCustomFontFamily')
            && !event.affectsConfiguration('workbench.colorTheme')
            && !event.affectsConfiguration('workbench.colorCustomizations')
            && !event.affectsConfiguration('editor.tokenColorCustomizations'))) {
            return;
        }
        _ready = false;
        _view.webview.html = getSecondarySidebarHtml(_view.webview, {
            version: context.extension.packageJSON.version,
            fontOptions: getConsoleFontWebviewOptions(context)
        });
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
        if (!_view) return;
        _ready = false;
        _view.webview.html = getSecondarySidebarHtml(_view.webview, {
            version: _context.extension.packageJSON.version,
            fontOptions: getConsoleFontWebviewOptions(_context)
        });
    }));
}

function getWebviewTerminalSink() {
    return _console.createSink(revealConsole);
}

function clearWebviewTerminalPanel() {
    _console.clear();
}

function setWebviewTerminalStatus(status) {
    _console.setStatus(status);
}

async function updateDataViewerData() {
    return _dataViewer.invalidateConsole();
}


module.exports = {
    VIEW_ID,
    registerSecondarySidebar,
    revealConsole,
    revealDataViewer,
    openDtaFileInDataViewer,
    getWebviewTerminalSink,
    setWebviewCommandHandler,
    setWebviewActionHandler,
    clearWebviewTerminalPanel,
    setWebviewTerminalStatus,
    isWebviewTerminalRunning: () => _console.status === 'running',
    setGraphResourceRoot,
    convertGraphSvgToBitmap,
    updateDataViewerData,
    getDataViewerState: () => _dataViewer.getState(),
    setOverflowNoticeSuppressed
};
