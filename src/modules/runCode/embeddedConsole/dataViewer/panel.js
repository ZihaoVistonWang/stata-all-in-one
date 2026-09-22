const vscode = require('vscode');
const directDtaStore = require('./directDtaStore');
// Injected into the webview so display and copy share one formatter.
const formatCellValue = typeof directDtaStore.formatCellValue === 'function'
    ? directDtaStore.formatCellValue
    : fallbackCellValueFormatter;
const consoleStore = require('./consoleStore');
const { isFilterMissingIf } = require('./provider');
const {
    VIEWER_STATUS,
    classifySnapshot,
    classifyError,
    keepsPreviousView
} = require('./status');
const {
    REQUEST_KINDS,
    ViewerRequestTrackerRegistry
} = require('./viewerRequestTracker');
const { msg, showInfo, showError } = require('../../../../utils/common');
const { StataTerminalRenderer, getWebviewThemeVariables } = require('../renderer');
const variableSuggestions = require('../../../variableSuggestionService');
const {
    mergeVariableCandidates: mergeAutocompleteVariableCandidates,
    selectDataViewerCandidates,
    selectVariableTableCandidates,
    expandVariableTableVarlist
} = require('./autocomplete');

const PANEL_VIEW_TYPE = 'stata-all-in-one.dataViewer';

// Two independent panels: 'console' (from console data button) and 'file' (from .dta click)
const _panels = { console: null, file: null };
const _ready = { console: false, file: false };
// Per-panel readiness: `_ready` only tracks the most recently attached panel of
// each mode, but several .dta custom editors can be open at the same time.
const _readyForSet = new WeakSet();

function _readyFor(panel) {
    return _readyForSet.has(panel);
}
const _pendingFilter = { console: '', file: '' };
const _dirty = { console: true, file: false };
const _nextActivationPreserve = { console: true, file: true };
const _lastViewport = { console: null, file: null };
const _consoleSnapshot = { pinned: false, data: null, entry: null };
// Per-panel view state (its own file, filter, data version and request
// sequence). A single global `_panels.file` could not represent two open .dta
// files, so a pagination request from one file could read the other.
const _viewTrackers = new ViewerRequestTrackerRegistry();

/**
 * A panel is live when it still owns an unclosed view. This is deliberately not
 * `_panels[mode] === panel`: `_panels.file` only remembers the most recently
 * attached .dta panel, so a second file panel would otherwise be considered dead
 * and its pagination requests silently dropped.
 */
/**
 * The dataset version a viewer read is based on. Console reads follow the
 * console store's generation; file reads follow the file's mtime/size stamp.
 * Requests are stamped with it so a response computed from an older dataset can
 * never be rendered as current.
 */
let _dataVersion = 0;

function _dataVersionFor() {
    return _dataVersion;
}

/**
 * Bump the data version. Called whenever a command that may have changed Stata's
 * data started running, so every in-flight viewer request becomes stale.
 */
function bumpDataVersion() {
    _dataVersion += 1;
    for (const panel of [_panels.console, _panels.file]) {
        const tracker = panel ? _viewTrackers.peek(panel) : null;
        // A pinned browse view owns a complete, immutable copy. Later Stata
        // commands cannot make a request against that copy stale.
        if (tracker && !(panel === _panels.console && _consoleSnapshot.pinned)) {
            tracker.setDataVersion(_dataVersion);
        }
    }
    return _dataVersion;
}

const _abortControllers = new WeakMap();

/**
 * Cancel whatever the panel is currently reading. Called when a newer request
 * replaces the old one, when the panel closes, and when the data changes — there
 * is no point fetching a whole window that will be thrown away.
 */
function cancelPanelWork(panel) {
    const controller = _abortControllers.get(panel);
    if (controller) {
        _abortControllers.delete(panel);
        try {
            controller.abort();
        } catch (_error) {
            // Aborting an already-aborted controller is harmless.
        }
    }
}

function beginPanelWork(panel) {
    cancelPanelWork(panel);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller) {
        _abortControllers.set(panel, controller);
    }
    return controller ? controller.signal : null;
}

function isLivePanel(panel) {
    const tracker = _viewTrackers.peek(panel);
    return Boolean(tracker && !tracker.isClosed());
}

/**
 * The Console terminal panel module. Loaded lazily (and defensively) so the Data
 * Viewer logic stays importable in environments without the VS Code API.
 */
let _consolePanelModule = null;
let _consolePanelLoadFailed = false;

function getConsolePanel() {
    if (_consolePanelModule || _consolePanelLoadFailed) {
        return _consolePanelModule;
    }
    try {
        _consolePanelModule = require('../panel');
    } catch (error) {
        _consolePanelLoadFailed = true;
        console.error('Stata All in One: Console panel unavailable:', error.message);
    }
    return _consolePanelModule;
}

function getConsoleViewColumn() {
    const terminal = getConsolePanel();
    const column = terminal && typeof terminal.getWebviewTerminalViewColumn === 'function'
        ? terminal.getWebviewTerminalViewColumn()
        : null;
    return column || vscode.ViewColumn.Active;
}

function activateDataViewerTab() {
    const panel = _panels.console;
    if (!panel) return false;
    panel.reveal(getConsoleViewColumn(), false);
    return true;
}

function isConsoleRunning() {
    const terminal = getConsolePanel();
    return Boolean(terminal && typeof terminal.isWebviewTerminalRunning === 'function'
        && terminal.isWebviewTerminalRunning());
}
const _datasetAutocompleteVariables = { console: [], file: [] };
const _renderer = new StataTerminalRenderer();
let _fontSize = 14;
const VIEW_WINDOW_SIZE = 700;
const VIEW_WINDOW_LEAD = 100;

const CODICON_RESOURCE_ROOT = vscode.Uri.joinPath(vscode.Uri.file(vscode.env.appRoot), 'out', 'media');

/**
 * Last-resort cell formatter, used only if the store does not export one.
 * Null/undefined become Stata's "." and everything else is stringified as-is,
 * which keeps display lossless even without the shared formatter.
 */
function fallbackCellValueFormatter(value) {
    if (value === null || value === undefined) return '.';
    const text = String(value);
    return text.trim() === '' ? '.' : text;
}

function getDatasetVariableCandidates(data) {
    const metadata = Array.isArray(data && data.vars) ? data.vars : [];
    const labelsByName = new Map(metadata.map(variable => [
        String(variable && variable.name || '').toLowerCase(),
        String(variable && (variable.label || variable.variableLabel) || '')
    ]));
    const names = (data && (data.allVarNames || data.dataColumns))
        || metadata.map(variable => variable.name);
    return mergeAutocompleteVariableCandidates(names.map(name => ({
        name,
        variableLabel: labelsByName.get(String(name || '').toLowerCase()) || ''
    })), metadata);
}

function getExtensionUri() {
    try {
        return vscode.extensions.getExtension('ZihaoVistonWang.stata-all-in-one').extensionUri;
    } catch (_e) {
        return undefined;
    }
}

function getPanelIconPath() {
    const extUri = getExtensionUri();
    if (!extUri) return undefined;
    return {
        light: vscode.Uri.joinPath(extUri, 'img', 'tab-icon-light.svg'),
        dark: vscode.Uri.joinPath(extUri, 'img', 'tab-icon-dark.svg')
    };
}

function getPanelTitle() {
    return msg('dataViewerPanelTitle');
}

function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getCodiconFontUri(webview) {
    return webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(vscode.env.appRoot), 'out', 'media', 'codicon.ttf'));
}

function highlightFilterText(text) {
    const prefix = 'browse ';
    const line = prefix + String(text || '');
    try {
        const entry = _renderer._segmentCommandLine(line);
        const segments = entry && Array.isArray(entry.segments) ? entry.segments : [];
        let remainingPrefix = prefix.length;
        const result = [];
        for (const seg of segments) {
            const segText = String(seg.text || '');
            if (remainingPrefix >= segText.length) {
                remainingPrefix -= segText.length;
                continue;
            }
            const textPart = remainingPrefix > 0 ? segText.slice(remainingPrefix) : segText;
            remainingPrefix = 0;
            result.push({ ...seg, text: textPart });
        }
        return result;
    } catch (_e) {
        return [{ text: String(text || ''), tokenType: 'plain', className: 'tok tok-plain', style: {} }];
    }
}

function getDataViewerHtml(webview) {
    const nonce = String(Date.now());
    // Serialize the shared formatter for the webview context.
    const formatCellValueSource = formatCellValue.toString();
    const codiconFontUri = getCodiconFontUri(webview);
    const themeVars = getWebviewThemeVariables();
    const fontSizeCss = `${_fontSize}px`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escHtml(msg('dataViewerPanelTitle'))}</title>
    <style>
        :root {
            --data-viewer-font-size: ${fontSizeCss};
            color-scheme: light dark;
            --stata-command: ${themeVars.command || 'var(--vscode-editor-foreground)'};
            --stata-function: ${themeVars.function || 'var(--vscode-editor-foreground)'};
            --stata-option: ${themeVars.option || 'var(--stata-function)'};
            --stata-keyword: ${themeVars.keyword || 'var(--vscode-editor-foreground)'};
            --stata-string: ${themeVars.string || 'var(--vscode-editor-foreground)'};
            --stata-number: ${themeVars.number || 'var(--vscode-editor-foreground)'};
            --stata-comment: ${themeVars.comment || 'var(--vscode-descriptionForeground)'};
            --stata-variable: ${themeVars.variable || 'var(--vscode-editor-foreground)'};
            --stata-macro: ${themeVars.macro || 'var(--stata-variable)'};
            --stata-operator: ${themeVars.operator || 'var(--vscode-editor-foreground)'};
            --stata-plain: ${themeVars.plain || 'var(--vscode-editor-foreground)'};
        }
        @font-face {
            font-family: "codicon";
            font-display: block;
            src: url("${codiconFontUri}") format("truetype");
        }
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--data-viewer-font-size);
            display: flex;
            flex-direction: column;
        }
        .tab-bar {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-background);
            padding: 0 8px;
            flex-shrink: 0;
            align-items: center;
        }
        .tab {
            padding: 8px 16px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            font-weight: 500;
            background: none;
            border-top: none;
            border-left: none;
            border-right: none;
            outline: none;
        }
        .tab:hover {
            color: var(--stata-command);
        }
        .tab.active {
            color: var(--stata-command);
            border-bottom-color: var(--stata-command);
        }
        .tab-bar-spacer {
            flex: 1;
        }
        .refresh-btn {
            width: 26px;
            height: 26px;
            padding: 0;
            cursor: pointer;
            background: none;
            border: none;
            border-radius: 4px;
            color: var(--vscode-foreground);
            outline: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .refresh-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        .refresh-icon {
            font-family: "codicon";
            font-size: 16px;
            line-height: 1;
            pointer-events: none;
        }
        .codicon-refresh::before {
            content: "\\eb37";
        }
        .codicon-filter::before {
            content: "\\eaf1";
        }
        .codicon-filter-filled::before {
            content: "\\ebce";
        }
        .codicon-search::before {
            content: "\\ea6d";
        }
        .codicon-eraser::before {
            content: "\\ec5d";
        }
        .filter-row {
            display: none;
            border-top: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-background);
            padding: 8px 12px;
            flex-shrink: 0;
            position: relative;
        }
        body.filter-open .filter-row {
            display: block;
        }
        .filter-input-shell {
            display: grid;
            position: relative;
            width: 100%;
        }
        .filter-input-shell > * {
            grid-area: 1 / 1;
        }
        #filter-highlight,
        #filter-input {
            box-sizing: border-box;
            width: 100%;
            min-height: 28px;
            margin: 0;
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 4px;
            padding: 5px 64px 5px 8px;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--data-viewer-font-size);
            line-height: 18px;
            white-space: pre;
            overflow: hidden;
        }
        #filter-highlight {
            color: var(--vscode-input-foreground);
            background: var(--vscode-input-background);
            pointer-events: none;
        }
        #filter-input {
            color: transparent;
            background: transparent;
            caret-color: var(--vscode-input-foreground);
            outline: none;
            resize: none;
        }
        #filter-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        .filter-input-actions {
            grid-area: 1 / 1;
            justify-self: end;
            align-self: center;
            display: flex;
            gap: 2px;
            padding-right: 4px;
            z-index: 2;
        }
        .filter-input-button {
            width: 22px;
            height: 22px;
            padding: 0;
            border: none;
            border-radius: 4px;
            background: transparent;
            color: var(--vscode-foreground);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }
        .filter-input-button:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        .filter-autocomplete {
            position: absolute;
            z-index: 100;
            top: 100%;
            left: 12px;
            margin-top: 2px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 6px;
            max-height: 180px;
            overflow-y: auto;
            box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--data-viewer-font-size);
            line-height: 1.5;
            min-width: 160px;
            width: calc(100% - 24px);
            max-width: 720px;
            display: none;
        }
        .filter-autocomplete.visible {
            display: block;
        }
        .filter-autocomplete-item {
            padding: 3px 10px;
            cursor: pointer;
            color: var(--vscode-input-foreground);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .filter-autocomplete-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .filter-autocomplete-match {
            color: var(--vscode-list-highlightForeground);
            font-weight: 600;
        }
        .filter-autocomplete-label {
            flex: 0 0 auto;
            white-space: nowrap;
        }
        .filter-autocomplete-variable-label {
            flex: 1 1 auto;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--vscode-descriptionForeground);
        }
        .filter-autocomplete-kind {
            flex: 0 0 auto;
            margin-left: auto;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
        }
        .filter-autocomplete-icon {
            font-family: "codicon";
            font-size: 16px;
            line-height: 1;
            width: 20px;
            text-align: center;
            flex-shrink: 0;
        }
        .filter-autocomplete-icon.var-icon::before { content: "\\ea88"; }
        .filter-autocomplete-icon.cmd-icon::before { content: "\\eb62"; }
        .filter-autocomplete-icon.var-icon { color: var(--vscode-symbolIcon-variableForeground, var(--stata-variable)); }
        .filter-autocomplete-icon.cmd-icon { color: var(--vscode-symbolIcon-keywordForeground, var(--stata-keyword)); }
        .tok-plain, .tok-default { color: var(--stata-plain); }
        .tok-command { color: var(--stata-keyword); }
        .tok-keyword { color: var(--stata-keyword); }
        .tok-string { color: var(--stata-string); }
        .tok-number { color: var(--stata-number); }
        .tok-comment { color: var(--stata-comment); }
        .tok-function { color: var(--stata-function); }
        .tok-option { color: var(--stata-option); }
        .tok-variable { color: var(--stata-variable); }
        .tok-macro { color: var(--stata-macro); }
        .tok-operator { color: var(--stata-operator); }
        .content {
            flex: 1;
            overflow: auto;
            padding: 0 16px 12px;
        }
        .tab-content { display: none; }
        .tab-content.active {
            display: flex;
            flex-direction: column;
            min-height: 100%;
        }
        table {
            min-width: 100%;
            width: max-content;
            border-collapse: separate;
            border-spacing: 0;
            font-size: var(--data-viewer-font-size);
        }
        #table-data, #table-vars {
            table-layout: fixed;
        }
        #table-vars {
            min-width: unset;
        }
        #table-data {
            min-width: unset;
        }
        #table-vars th {
            /* sticky from th rule; absolute children position against sticky too */
        }
        th, td {
            padding: 4px 10px;
            text-align: left;
            white-space: nowrap;
            line-height: 1.5;
            box-sizing: border-box;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        th {
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            font-weight: 600;
            color: var(--stata-comment);
            z-index: 10;
            box-shadow: 0 1px 0 color-mix(in srgb, var(--vscode-panel-border) 85%, transparent);
        }
        .col-resize-handle {
            position: absolute;
            right: -3px;
            top: 0;
            bottom: 0;
            width: 7px;
            cursor: col-resize;
            user-select: none;
            z-index: 11;
            background: transparent;
            transition: background 0.15s;
        }
        .col-resize-handle::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 4px;
            bottom: 4px;
            width: 1px;
            background: var(--vscode-panel-border);
        }
        .col-resize-handle:hover,
        .col-resize-handle.active {
            background: color-mix(in srgb, var(--stata-command) 30%, transparent);
        }
        .col-resize-handle:hover::after,
        .col-resize-handle.active::after {
            background: var(--stata-command);
        }
        body.col-resizing {
            cursor: col-resize;
            user-select: none;
        }
        td {
            font-family: var(--vscode-editor-font-family, monospace);
        }
        tbody tr:nth-child(even) td {
            background: color-mix(in srgb, var(--vscode-list-hoverBackground) 28%, transparent);
        }
        tr.virtual-spacer td {
            height: 0;
            padding: 0;
            border: 0;
            line-height: 0;
        }
        th.col-spacer, td.col-spacer {
            padding: 0;
            border: 0;
            min-width: 0;
            overflow: hidden;
        }
        td.num {
            text-align: right;
            font-variant-numeric: tabular-nums;
        }
        th.row-num, td.row-num {
            color: var(--vscode-descriptionForeground);
            text-align: right;
            user-select: none;
            width: var(--row-number-column-width, 56px);
            min-width: var(--row-number-column-width, 56px);
            max-width: var(--row-number-column-width, 56px);
        }
        td.var-name, td.data-variable {
            color: var(--stata-variable);
        }
        td.var-type {
            color: var(--stata-command);
        }
        td.var-format, td.data-number {
            color: var(--stata-number);
        }
        td.var-label, td.data-string {
            color: var(--stata-string);
        }
        tr:hover td {
            background: color-mix(in srgb, var(--vscode-list-hoverBackground) 70%, transparent);
        }
        .info-bar {
            display: flex;
            align-items: center;
            gap: 16px;
            width: 100%;
            box-sizing: border-box;
            overflow: hidden;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            margin-top: 8px;
            flex-shrink: 0;
            padding: 8px 16px;
            min-width: 0;
        }
        .info-bar span {
            flex: 0 0 auto;
            min-width: 0;
            white-space: nowrap;
        }
        .info-bar .source-path {
            flex: 1 1 auto;
            display: block;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-align: right;
        }
        .status-banner {
            margin: 8px 12px 0;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: var(--viewer-font-size, 14px);
            border: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
            background: var(--vscode-inputValidation-warningBackground, rgba(184, 149, 0, 0.12));
            color: var(--vscode-foreground);
            white-space: pre-wrap;
        }
        .status-banner.error {
            border-color: var(--vscode-inputValidation-errorBorder, #be1100);
            background: var(--vscode-inputValidation-errorBackground, rgba(190, 17, 0, 0.12));
        }
        .cancel-read-btn {
            margin-left: 10px;
            padding: 2px 10px;
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 3px;
            background: var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.12));
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            cursor: pointer;
            font-size: inherit;
        }
        .cancel-read-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground, rgba(255, 255, 255, 0.2));
        }
        .cancel-read-btn[hidden] { display: none; }
        .empty-state, .loading-state {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100%;
            flex: 1;
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }
        .loading-state {
            display: none;
        }
        body.loading .loading-state { display: flex; }
        body.loading .empty-state { display: none; }
        body.loading .tab-content table { display: none; }
        .cell-overflow-tooltip {
            position: fixed;
            z-index: 1000;
            display: none;
            max-width: min(720px, calc(100vw - 24px));
            max-height: min(360px, calc(100vh - 24px));
            padding: 7px 10px;
            overflow: auto;
            color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
            background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
            border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border));
            border-radius: 4px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: var(--data-viewer-font-size);
            line-height: 1.45;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            pointer-events: none;
        }
        .cell-overflow-tooltip.visible {
            display: block;
        }
    </style>
</head>
<body class="loading">
    <div class="tab-bar">
        <button class="tab active" data-tab="vars" id="tab-vars">${escHtml(msg('dataViewerTabVariables'))}</button>
        <button class="tab" data-tab="data" id="tab-data">${escHtml(msg('dataViewerTabData'))}</button>
        <span class="tab-bar-spacer"></span>
        <button class="refresh-btn" id="filter-btn" title="${escHtml(msg('dataViewerFilter'))}" aria-label="${escHtml(msg('dataViewerFilter'))}">
            <span class="refresh-icon codicon-filter" id="filter-icon" aria-hidden="true"></span>
        </button>
        <button class="refresh-btn" id="refresh-btn" title="${escHtml(msg('dataViewerRefresh'))}" aria-label="${escHtml(msg('dataViewerRefresh'))}">
            <span class="refresh-icon codicon-refresh" aria-hidden="true"></span>
        </button>
    </div>
    <div class="filter-row" id="filter-row">
        <div class="filter-input-shell">
            <pre id="filter-highlight" aria-hidden="true"></pre>
            <input id="filter-input" spellcheck="false" placeholder="${escHtml(msg('dataViewerFilterPlaceholder'))}">
            <div class="filter-input-actions">
                <button class="filter-input-button" id="filter-apply-btn" title="${escHtml(msg('dataViewerApplyFilter'))}" aria-label="${escHtml(msg('dataViewerApplyFilter'))}">
                    <span class="refresh-icon codicon-search" aria-hidden="true"></span>
                </button>
                <button class="filter-input-button" id="filter-clear-btn" title="${escHtml(msg('dataViewerClearFilterShortcut'))}" aria-label="${escHtml(msg('dataViewerClearFilterShortcut'))}">
                    <span class="refresh-icon codicon-eraser" aria-hidden="true"></span>
                </button>
            </div>
        </div>
        <div class="filter-autocomplete" id="filter-autocomplete"></div>
    </div>
    <div class="content" id="content">
        <div class="loading-state" id="loading-msg">
            <span>${escHtml(msg('dataViewerLoading'))}</span>
            <button type="button" class="cancel-read-btn" id="cancel-read-btn">${escHtml(msg('dataViewerCancelRead'))}</button>
        </div>
        <div class="status-banner" id="status-banner" role="status" style="display:none"><span id="status-banner-text"></span></div>
        <div class="tab-content active" id="content-vars">
            <div class="empty-state" id="empty-vars">${escHtml(msg('dataViewerNoDataset'))}</div>
            <div class="empty-state" id="empty-vars-filter" style="display:none">${escHtml(msg('dataViewerNoVariableMatches'))}</div>
            <table id="table-vars" style="display:none">
                <thead><tr><th>${escHtml(msg('dataViewerColumnName'))}</th><th>${escHtml(msg('dataViewerColumnType'))}</th><th>${escHtml(msg('dataViewerColumnFormat'))}</th><th>${escHtml(msg('dataViewerColumnLabel'))}</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
        <div class="tab-content" id="content-data">
            <div class="empty-state" id="empty-data">${escHtml(msg('dataViewerNoDataset'))}</div>
            <div id="data-table-container" style="display:none">
                <table id="table-data">
                    <thead></thead>
                    <tbody></tbody>
                </table>
                <div id="load-more-row" style="display:none; text-align:center; padding:10px 20px; cursor:pointer; color:var(--vscode-textLink-foreground); background:color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent); border-radius:4px; margin:8px 0; user-select:none;">
                    ${escHtml(msg('dataViewerLoadMore'))}
                </div>
            </div>
        </div>
    </div>
    <div class="info-bar" id="info-bar"></div>
    <div class="cell-overflow-tooltip" id="cell-overflow-tooltip" role="tooltip" aria-hidden="true"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        var webviewState = vscode.getState() || {};
        let currentTab = 'vars';
        const contentEl = document.getElementById('content');
        const filterInput = document.getElementById('filter-input');
        const filterHighlight = document.getElementById('filter-highlight');
        const filterAutocomplete = document.getElementById('filter-autocomplete');
        const filterIcon = document.getElementById('filter-icon');
        const overflowTooltipEl = document.getElementById('cell-overflow-tooltip');
        const autoFitColumnLabel = ${JSON.stringify(msg('dataViewerAutoFitColumn'))};
        var autocompleteVariables = [];
        var sharedAutocompleteVariables = [];
        var filterAutocompleteIndex = -1;
        var filterAutocompleteVisible = false;
        var filterAutocompleteRequestId = 0;
        var variableAutocompleteRequestId = 0;
        var variableApplyRequestId = 0;
        var dataFilterText = '';
        var variableFilterText = String(webviewState.variableFilterText || '');
        var filterOpenByTab = {
            vars: !!webviewState.variableFilterOpen,
            data: false
        };
        var allVarsCache = [];
        filterInput.value = variableFilterText;

        document.querySelectorAll('.tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                switchTab(this.dataset.tab);
            });
        });

        document.getElementById('refresh-btn').addEventListener('click', function () {
            resetColumnWidthsForRefresh();
            requestRefresh(true);
        });
        document.getElementById('filter-btn').addEventListener('click', function () {
            document.body.classList.toggle('filter-open');
            filterOpenByTab[currentTab] = document.body.classList.contains('filter-open');
            persistFilterState();
            if (document.body.classList.contains('filter-open')) {
                filterInput.focus();
                updateFilterHighlight();
            } else {
                hideFilterAutocomplete();
            }
            syncFilterUi();
        });
        document.getElementById('filter-apply-btn').addEventListener('click', function () {
            if (currentTab === 'vars') {
                applyVariableTableFilter();
            } else {
                requestRefresh(false);
            }
            filterInput.focus();
        });
        document.getElementById('filter-clear-btn').addEventListener('click', function () {
            filterInput.value = '';
            saveCurrentFilterText();
            updateFilterHighlight();
            hideFilterAutocomplete();
            if (currentTab === 'vars') {
                variableAutocompleteRequestId++;
                variableApplyRequestId++;
                renderVariableTableNames([]);
            } else {
                requestRefresh(false);
            }
            filterInput.focus();
        });

        var loadMoreEl = document.getElementById('load-more-row');
        loadMoreEl.addEventListener('click', function () {
            requestLoadMore();
        });
        loadMoreEl.addEventListener('mouseover', function () {
            loadMoreEl.style.background = 'color-mix(in srgb, var(--vscode-textLink-foreground) 15%, transparent)';
        });
        loadMoreEl.addEventListener('mouseout', function () {
            loadMoreEl.style.background = 'color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent)';
        });
        loadMoreEl.style.cursor = 'pointer';

        filterInput.addEventListener('input', function () {
            saveCurrentFilterText();
            updateFilterHighlight();
            if (currentTab === 'vars') {
                triggerVariableTableAutocomplete();
            } else {
                triggerFilterAutocomplete();
            }
        });
        filterInput.addEventListener('scroll', function () {
            filterHighlight.scrollLeft = filterInput.scrollLeft;
        });
        filterInput.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                if (filterAutocompleteVisible) {
                    event.preventDefault();
                    hideFilterAutocomplete();
                    return;
                }
                if (filterInput.value) {
                    event.preventDefault();
                    filterInput.value = '';
                    saveCurrentFilterText();
                    updateFilterHighlight();
                    if (currentTab === 'vars') {
                        variableAutocompleteRequestId++;
                        variableApplyRequestId++;
                        renderVariableTableNames([]);
                    } else {
                        requestRefresh(false);
                    }
                }
                return;
            }
            if (filterAutocompleteVisible && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                event.preventDefault();
                navigateFilterAutocomplete(event.key === 'ArrowUp' ? -1 : 1);
                return;
            }
            if (event.key === 'Tab') {
                if (filterAutocompleteVisible) {
                    event.preventDefault();
                    selectFilterAutocomplete();
                    return;
                }
            }
            if (event.key === 'Enter') {
                if (filterAutocompleteVisible) {
                    event.preventDefault();
                    selectFilterAutocomplete();
                    return;
                }
                event.preventDefault();
                if (currentTab === 'vars') {
                    applyVariableTableFilter();
                } else {
                    requestRefresh(false);
                }
            }
        });

        function setLoadingMore(v) {
            loadingMore = v;
            var el = document.getElementById('load-more-row');
            if (v) {
                el.textContent = ${JSON.stringify(msg('dataViewerLoadingMore'))};
                el.style.display = '';
            } else if (!hasMoreRows || (loadedRows >= totalObs && totalObs > 0)) {
                el.style.display = 'none';
            } else if (loadedRows > 0) {
                el.textContent = ${JSON.stringify(msg('dataViewerScrollForMore'))};
                el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        }

        function switchTab(name) {
            saveCurrentFilterText();
            filterOpenByTab[currentTab] = document.body.classList.contains('filter-open');
            currentTab = name;
            webviewState.currentTab = name;
            document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
            document.getElementById('tab-' + name).classList.add('active');
            document.getElementById('content-' + name).classList.add('active');
            filterInput.value = name === 'vars' ? variableFilterText : dataFilterText;
            filterInput.placeholder = name === 'vars'
                ? ${JSON.stringify(msg('dataViewerVariableFilterPlaceholder'))}
                : ${JSON.stringify(msg('dataViewerFilterPlaceholder'))};
            document.body.classList.toggle('filter-open', !!filterOpenByTab[name]);
            hideFilterAutocomplete();
            updateFilterHighlight();
            persistFilterState();
            syncFilterUi();
            scheduleDataRender(false);
            scheduleAutoLoadCheck();
            scheduleOverflowTitleUpdate();
        }

        function syncFilterUi() {
            document.body.classList.toggle('data-tab-active', currentTab === 'data');
            filterIcon.className = 'refresh-icon ' + (document.body.classList.contains('filter-open') ? 'codicon-filter-filled' : 'codicon-filter');
        }

        function saveCurrentFilterText() {
            if (currentTab === 'vars') {
                variableFilterText = filterInput.value || '';
            } else {
                dataFilterText = filterInput.value || '';
            }
            persistFilterState();
        }

        function persistFilterState() {
            webviewState.variableFilterText = variableFilterText;
            webviewState.variableFilterOpen = !!filterOpenByTab.vars;
            vscode.setState(webviewState);
        }

        function captureViewport() {
            var rowIndex = Math.max(0, Math.floor(contentEl.scrollTop / virtualRowHeight));
            var columnIndex = dataColumnsCache.length
                ? getColumnAtX(Math.max(0, contentEl.scrollLeft))
                : 0;
            return {
                rowIndex: rowIndex,
                rowOffset: Math.max(0, contentEl.scrollTop - rowIndex * virtualRowHeight),
                columnName: dataColumnsCache[columnIndex] || '',
                columnIndex: columnIndex,
                columnOffset: Math.max(0, contentEl.scrollLeft - getCumulWidth(columnIndex))
            };
        }

        function applyFontSize(value) {
            var viewport = currentTab === 'data' ? captureViewport() : null;
            document.documentElement.style.setProperty(
                '--data-viewer-font-size',
                String(value || 'var(--vscode-editor-font-size, 13px)')
            );
            requestAnimationFrame(function () {
                tableFontSize = parseFloat(window.getComputedStyle(document.body).fontSize) || 13;
                virtualRowHeight = Math.max(28, Math.ceil(tableFontSize * 1.5 + 8));
                measureTableText._fonts = {};
                for (var col = 0; col < columnNaturalWidths.length; col++) {
                    if (!columnManualWidths[col]) columnNaturalWidths[col] = colMinWidth;
                }
                for (var varsCol = 0; varsCol < varsColumnNaturalWidths.length; varsCol++) {
                    if (!varsColumnManualWidths[varsCol]) varsColumnNaturalWidths[varsCol] = colMinWidth;
                }
                autoSizeVarsColumns();
                autoSizeDataColumns(dataRowsCache);
                if (viewport) pendingViewportRestore = viewport;
                scheduleDataRender(true);
                fitInfoSourcePath();
                scheduleOverflowTitleUpdate();
            });
        }

        var viewportPersistQueued = false;
        function persistViewport() {
            if (currentTab !== 'data') return;
            var viewport = captureViewport();
            webviewState.viewport = viewport;
            vscode.setState(webviewState);
            vscode.postMessage({ type: 'viewportChanged', viewport: viewport });
        }

        function scheduleViewportPersist() {
            if (viewportPersistQueued || currentTab !== 'data') return;
            viewportPersistQueued = true;
            requestAnimationFrame(function () {
                viewportPersistQueued = false;
                persistViewport();
            });
        }

        function setReadInProgress(inProgress) {
            var button = document.getElementById('cancel-read-btn');
            if (!button) return;
            button.hidden = !inProgress;
        }

        document.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || target.id !== 'cancel-read-btn') return;
            // The backend aborts the read for this panel; the panel itself just
            // stops showing progress and reports the cancellation.
            vscode.postMessage({ type: 'cancelRead' });
            setReadInProgress(false);
            showStatusBanner('info', ${JSON.stringify(msg('dataViewerReadCancelled'))});
            document.body.classList.remove('loading');
            document.getElementById('loading-msg').style.display = 'none';
        });

        function requestRefresh(preservePosition, requestedFilterText, savedViewport) {
            var viewport = preservePosition
                ? (savedViewport || (currentTab === 'data' ? captureViewport() : webviewState.viewport || null))
                : null;
            if (requestedFilterText !== undefined) {
                dataFilterText = requestedFilterText || '';
                filterOpenByTab.data = !!dataFilterText;
                if (currentTab === 'data') {
                    filterInput.value = dataFilterText;
                    document.body.classList.toggle('filter-open', filterOpenByTab.data);
                    updateFilterHighlight();
                }
            } else if (currentTab === 'data') {
                dataFilterText = filterInput.value || '';
            }
            vscode.postMessage({
                type: 'refresh',
                filterText: dataFilterText,
                viewport: viewport
            });
        }

        function isFilterWordCharacter(character) {
            return !!character && /[\\p{L}\\p{M}\\p{N}_]/u.test(character);
        }

        function getCurrentFilterWord() {
            var text = filterInput.value || '';
            var pos = filterInput.selectionStart || 0;
            var start = pos;
            while (start > 0 && isFilterWordCharacter(text[start - 1])) start--;
            return { word: text.slice(start, pos), start: start };
        }

        function getFilterAutocompleteIconClass(kind) {
            return kind === 'var' ? 'var-icon' : 'cmd-icon';
        }
        function showFilterAutocomplete(matches, wordStart) {
            if (!matches.length) {
                hideFilterAutocomplete();
                return;
            }
            filterAutocomplete.replaceChildren();
            for (var i = 0; i < matches.length; i++) {
                var m = matches[i];
                var label = typeof m === 'string' ? m : m.label;
                var kind = (typeof m === 'object' && m.kind) ? m.kind : 'cmd';
                var item = document.createElement('div');
                item.className = 'filter-autocomplete-item';
                item.dataset.label = label;
                var icon = document.createElement('span');
                icon.className = 'filter-autocomplete-icon ' + getFilterAutocompleteIconClass(kind);
                item.appendChild(icon);
                var text = document.createElement('span');
                text.className = 'filter-autocomplete-label';
                appendFilterAutocompleteLabel(
                    text,
                    label,
                    (typeof m === 'object' && m.matchedOn !== 'label' && m.matchIndexes) || []
                );
                item.appendChild(text);
                if (kind === 'var') {
                    if (m.variableLabel) {
                        var variableLabel = document.createElement('span');
                        variableLabel.className = 'filter-autocomplete-variable-label';
                        appendFilterAutocompleteLabel(
                            variableLabel,
                            m.labelDisplay || m.variableLabel,
                            m.labelDisplayMatchIndexes || []
                        );
                        item.appendChild(variableLabel);
                    }
                    var variableKind = document.createElement('span');
                    variableKind.className = 'filter-autocomplete-kind';
                    variableKind.textContent = 'Variable';
                    item.appendChild(variableKind);
                }
                item.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    applyFilterAutocomplete(this.dataset.label, wordStart);
                });
                filterAutocomplete.appendChild(item);
            }
            filterAutocompleteIndex = 0;
            filterAutocomplete.firstChild.classList.add('active');
            filterAutocomplete.classList.add('visible');
            filterAutocompleteVisible = true;
        }

        function appendFilterAutocompleteLabel(container, label, matchIndexes) {
            var matched = {};
            for (var i = 0; i < matchIndexes.length; i++) {
                matched[matchIndexes[i]] = true;
            }
            var start = 0;
            while (start < label.length) {
                var isMatch = !!matched[start];
                var end = start + 1;
                while (end < label.length && !!matched[end] === isMatch) end++;
                var span = document.createElement('span');
                if (isMatch) span.className = 'filter-autocomplete-match';
                span.textContent = label.slice(start, end);
                container.appendChild(span);
                start = end;
            }
        }

        function hideFilterAutocomplete() {
            filterAutocomplete.classList.remove('visible');
            filterAutocomplete.replaceChildren();
            filterAutocompleteIndex = -1;
            filterAutocompleteVisible = false;
        }

        function applyFilterAutocomplete(value, wordStart) {
            var text = filterInput.value || '';
            var pos = filterInput.selectionStart || 0;
            var wordEnd = pos;
            while (wordEnd < text.length && isFilterWordCharacter(text[wordEnd])) wordEnd++;
            filterInput.value = text.slice(0, wordStart) + value + ' ' + text.slice(wordEnd);
            filterInput.selectionStart = filterInput.selectionEnd = wordStart + value.length + 1;
            hideFilterAutocomplete();
            updateFilterHighlight();
        }

        function triggerFilterAutocomplete() {
            if (currentTab !== 'data') return;
            var current = getCurrentFilterWord();
            filterAutocompleteRequestId++;
            if (!current.word) {
                hideFilterAutocomplete();
                return;
            }
            hideFilterAutocomplete();
            vscode.postMessage({
                type: 'filterAutocomplete',
                requestId: filterAutocompleteRequestId,
                prefix: current.word,
                wordStart: current.start
            });
        }

        function triggerVariableTableAutocomplete() {
            if (currentTab !== 'vars') return;
            var current = getCurrentFilterWord();
            variableAutocompleteRequestId++;
            if (!current.word) {
                hideFilterAutocomplete();
                return;
            }
            hideFilterAutocomplete();
            vscode.postMessage({
                type: 'variableTableAutocomplete',
                requestId: variableAutocompleteRequestId,
                prefix: current.word,
                wordStart: current.start
            });
        }

        function applyVariableTableFilter() {
            if (currentTab !== 'vars') return;
            hideFilterAutocomplete();
            variableFilterText = filterInput.value || '';
            persistFilterState();
            variableApplyRequestId++;
            if (!variableFilterText.trim()) {
                renderVariableTableNames([]);
                return;
            }
            vscode.postMessage({
                type: 'variableTableApply',
                requestId: variableApplyRequestId,
                varList: variableFilterText
            });
        }

        function navigateFilterAutocomplete(direction) {
            if (!filterAutocompleteVisible) return;
            var items = filterAutocomplete.children;
            if (!items.length) return;
            items[filterAutocompleteIndex].classList.remove('active');
            filterAutocompleteIndex += direction;
            if (filterAutocompleteIndex < 0) filterAutocompleteIndex = items.length - 1;
            if (filterAutocompleteIndex >= items.length) filterAutocompleteIndex = 0;
            items[filterAutocompleteIndex].classList.add('active');
            items[filterAutocompleteIndex].scrollIntoView({ block: 'nearest' });
        }

        function selectFilterAutocomplete() {
            if (!filterAutocompleteVisible) return false;
            var items = filterAutocomplete.children;
            if (filterAutocompleteIndex >= 0 && filterAutocompleteIndex < items.length) {
                applyFilterAutocomplete(items[filterAutocompleteIndex].dataset.label, getCurrentFilterWord().start);
                return true;
            }
            return false;
        }

        function updateFilterHighlight() {
            var text = filterInput.value || '';
            if (!text) {
                filterHighlight.textContent = '';
                return;
            }
            vscode.postMessage({ type: 'highlightFilter', text: text });
        }

        function renderFilterHighlight(segments) {
            filterHighlight.innerHTML = '';
            for (var i = 0; i < segments.length; i++) {
                var seg = segments[i];
                appendFilterHighlightSegment(seg);
            }
            filterHighlight.scrollLeft = filterInput.scrollLeft;
        }

        function appendFilterHighlightSegment(seg) {
            var text = String(seg.text || '');
            var className = String(seg.className || '').trim();
            if (/\btok-(string|comment|macro)\b/.test(className)) {
                appendFilterSpan(text, className, seg.style || {});
                return;
            }
            var parts = text.split(/([\\p{L}_][\\p{L}\\p{M}\\p{N}_]*)/gu);
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i];
                if (!part) continue;
                appendFilterSpan(part, isFilterVariable(part) ? 'tok tok-variable' : className, seg.style || {});
            }
        }

        function appendFilterSpan(text, className, style) {
            var span = document.createElement('span');
            if (className) span.className = className;
            if (style.color) span.style.color = style.color;
            if (style.backgroundColor) span.style.backgroundColor = style.backgroundColor;
            if (style.bold) span.style.fontWeight = 'bold';
            if (style.italic) span.style.fontStyle = 'italic';
            span.textContent = text;
            filterHighlight.appendChild(span);
        }

        function isFilterVariable(word) {
            var variables = mergeVariableLists(autocompleteVariables, sharedAutocompleteVariables);
            for (var i = 0; i < variables.length; i++) {
                if (variables[i].toLowerCase() === word.toLowerCase()) return true;
            }
            return false;
        }

        function mergeVariableLists() {
            var result = [];
            var seen = {};
            for (var ai = 0; ai < arguments.length; ai++) {
                var list = arguments[ai] || [];
                for (var i = 0; i < list.length; i++) {
                    var value = String(list[i] || '').trim();
                    if (!value) continue;
                    var key = value.toLowerCase();
                    if (!seen[key]) {
                        seen[key] = true;
                        result.push(value);
                    }
                }
            }
            return result;
        }

        function showEmpty(hasData) {
            document.getElementById('empty-vars').style.display = hasData ? 'none' : '';
            document.getElementById('empty-vars-filter').style.display = 'none';
            document.getElementById('table-vars').style.display = hasData ? '' : 'none';
            document.getElementById('empty-data').style.display = hasData ? 'none' : '';
            document.getElementById('data-table-container').style.display = hasData ? '' : 'none';
        }

        function renderVars(vars, rememberAll) {
            if (rememberAll !== false) allVarsCache = (vars || []).slice();
            var tbody = document.getElementById('table-vars').querySelector('tbody');
            tbody.replaceChildren();
            for (var i = 0; i < vars.length; i++) {
                var v = vars[i];
                var tr = document.createElement('tr');
                appendVarsCell(tr, 'var-name', v.name);
                appendVarsCell(tr, 'var-type', displayValue(v.type));
                appendVarsCell(tr, 'var-format', displayValue(v.format));
                appendVarsCell(tr, 'var-label', displayValue(v.label || v.valueLabel));
                tbody.appendChild(tr);
            }
            var hasFilterMatches = !!variableFilterText && vars.length === 0;
            document.getElementById('empty-vars-filter').style.display = hasFilterMatches ? '' : 'none';
            document.getElementById('table-vars').style.display = hasFilterMatches ? 'none' : (allVarsCache.length ? '' : 'none');
            autoSizeVarsColumns();
            scheduleOverflowTitleUpdate();
        }

        function renderVariableTableNames(names) {
            if (!variableFilterText) {
                renderVars(allVarsCache, false);
                return;
            }
            var varsByName = {};
            for (var i = 0; i < allVarsCache.length; i++) {
                varsByName[String(allVarsCache[i].name || '').toLowerCase()] = allVarsCache[i];
            }
            var filtered = [];
            for (var ni = 0; ni < names.length; ni++) {
                var key = String(names[ni] || '').toLowerCase();
                if (varsByName[key]) {
                    filtered.push(varsByName[key]);
                }
            }
            renderVars(filtered, false);
        }

        function appendVarsCell(row, className, value) {
            var cell = document.createElement('td');
            var text = String(value === null || value === undefined ? '' : value);
            cell.className = className;
            cell.textContent = text;
            cell.setAttribute('data-full-text', text);
            row.appendChild(cell);
        }

        var dataColumnsCache = [];
        var dataColumnTypesCache = [];
        var dataRowsCache = [];
        var tableFontSize = parseFloat(window.getComputedStyle(document.body).fontSize) || 13;
        var virtualRowHeight = Math.max(28, Math.ceil(tableFontSize * 1.5 + 8));
        var virtualOverscan = 80;
        var columnWidths = [];
        var columnNaturalWidths = [];
        var columnManualWidths = [];
        var varsColumnWidths = [72, 72, 72, 72];
        var varsColumnNaturalWidths = [72, 72, 72, 72];
        var varsColumnManualWidths = [false, false, false, false];
        var varsAutoColMaxWidths = [156, 100, 100, 210];
        var defaultColWidth = 72;
        var colMinWidth = 72;
        var autoColMaxWidth = 210;
        var virtualColumnOverscan = 4;
        var defaultRowNumberColumnWidth = 56;
        var rowNumberMinWidth = 44;
        var rowNumberColumnWidth = defaultRowNumberColumnWidth;
        function getColWidth(i) { return i >= 0 && i < columnWidths.length ? columnWidths[i] : defaultColWidth; }
        function getCumulWidth(end) { var s = 0; for (var i = 0; i < end && i < dataColumnsCache.length; i++) s += getColWidth(i); return s; }
        function getColumnAtX(x) { var cumul = 0; for (var i = 0; i < dataColumnsCache.length; i++) { cumul += getColWidth(i); if (cumul > x) return i; } return Math.max(0, dataColumnsCache.length - 1); }
        var virtualRenderQueued = false;
        var lastVirtualStart = -1;
        var lastVirtualEnd = -1;
        var lastVirtualColStart = -1;
        var lastVirtualColEnd = -1;
        var pendingViewportRestore = null;
        var totalObs = 0;
        var loadedRows = 0;
        var dataWindowStart = 0;
        var loadingMore = false;
        var hasMoreRows = true;
        var pageSize = 500;
        var preloadRowBuffer = 100;

        function resetColumnWidthsForRefresh() {
            setRowNumberColumnWidth(defaultRowNumberColumnWidth);
            varsColumnWidths = [72, 72, 72, 72];
            varsColumnNaturalWidths = [72, 72, 72, 72];
            varsColumnManualWidths = [false, false, false, false];
            autoSizeVarsColumns();
            for (var col = 0; col < columnManualWidths.length; col++) {
                columnManualWidths[col] = false;
                columnWidths[col] = clampAutoColumnWidth(columnNaturalWidths[col]);
            }
            updateDataTableWidth();
            lastVirtualColStart = -1;
            lastVirtualColEnd = -1;
            scheduleDataRender(true);
            hideOverflowTooltip();
        }

        function clampAutoColumnWidth(width, maxWidth) {
            var limit = Number.isFinite(maxWidth) ? maxWidth : autoColMaxWidth;
            return Math.max(colMinWidth, Math.min(limit, Math.ceil(width || 0)));
        }

        function measureTableText(text, sourceEl) {
            var value = String(text === null || text === undefined ? '' : text);
            if (!measureTableText._canvas) {
                measureTableText._canvas = document.createElement('canvas');
                measureTableText._fonts = {};
            }
            var context = measureTableText._canvas.getContext('2d');
            if (!context) return colMinWidth;
            var table = sourceEl && sourceEl.closest ? sourceEl.closest('table') : sourceEl;
            var key = table && table.id ? table.id : 'default';
            if (!measureTableText._fonts[key]) {
                var style = window.getComputedStyle(sourceEl || document.body);
                measureTableText._fonts[key] = style.font ||
                    [style.fontSize || '13px', style.fontFamily || 'monospace'].join(' ');
            }
            context.font = measureTableText._fonts[key];
            return Math.ceil(context.measureText(value).width + 28);
        }

        function measureStyledText(text, sourceEl) {
            if (!sourceEl) return measureTableText(text, document.body);
            if (!measureStyledText._el) {
                var measurer = document.createElement('span');
                measurer.style.cssText = 'position:absolute;left:-99999px;top:-99999px;display:inline-block;width:auto;max-width:none;padding:0;white-space:pre;visibility:hidden;pointer-events:none;';
                document.body.appendChild(measurer);
                measureStyledText._el = measurer;
            }
            var style = window.getComputedStyle(sourceEl);
            var el = measureStyledText._el;
            el.style.font = style.font;
            el.style.fontFamily = style.fontFamily;
            el.style.fontSize = style.fontSize;
            el.style.fontStyle = style.fontStyle;
            el.style.fontWeight = style.fontWeight;
            el.style.fontStretch = style.fontStretch;
            el.style.fontVariantNumeric = style.fontVariantNumeric;
            el.style.letterSpacing = style.letterSpacing;
            el.style.textTransform = style.textTransform;
            el.textContent = String(text === null || text === undefined ? '' : text);
            var horizontalPadding = (parseFloat(style.paddingLeft) || 0)
                + (parseFloat(style.paddingRight) || 0);
            return Math.ceil(el.getBoundingClientRect().width + horizontalPadding + 2);
        }

        var overflowTitleUpdateQueued = false;
        var overflowTooltipTarget = null;
        var overflowTooltipRequiresOverflow = false;

        function cellHasOverflow(cell) {
            return Boolean(
                cell
                && cell.offsetParent !== null
                && cell.scrollWidth > cell.clientWidth + 1
            );
        }

        function hideOverflowTooltip() {
            overflowTooltipTarget = null;
            overflowTooltipRequiresOverflow = false;
            overflowTooltipEl.classList.remove('visible');
            overflowTooltipEl.setAttribute('aria-hidden', 'true');
            overflowTooltipEl.textContent = '';
        }

        function positionOverflowTooltip(cell) {
            var cellRect = cell.getBoundingClientRect();
            var tooltipRect = overflowTooltipEl.getBoundingClientRect();
            var viewportPadding = 8;
            var left = Math.max(
                viewportPadding,
                Math.min(cellRect.left, window.innerWidth - tooltipRect.width - viewportPadding)
            );
            var below = cellRect.bottom + viewportPadding;
            var top = below + tooltipRect.height <= window.innerHeight - viewportPadding
                ? below
                : Math.max(viewportPadding, cellRect.top - tooltipRect.height - viewportPadding);
            overflowTooltipEl.style.left = Math.round(left) + 'px';
            overflowTooltipEl.style.top = Math.round(top) + 'px';
        }

        function showTooltipForTarget(target, text, requiresOverflow) {
            if (!target || !text || (requiresOverflow && !cellHasOverflow(target))) {
                hideOverflowTooltip();
                return;
            }
            overflowTooltipTarget = target;
            overflowTooltipRequiresOverflow = Boolean(requiresOverflow);
            overflowTooltipEl.textContent = text;
            overflowTooltipEl.classList.add('visible');
            overflowTooltipEl.setAttribute('aria-hidden', 'false');
            positionOverflowTooltip(target);
        }

        function showOverflowTooltip(cell) {
            var fullText = cell.getAttribute('data-full-text') || '';
            showTooltipForTarget(cell, fullText, true);
        }

        function scheduleOverflowTitleUpdate() {
            if (overflowTitleUpdateQueued) return;
            overflowTitleUpdateQueued = true;
            requestAnimationFrame(function () {
                overflowTitleUpdateQueued = false;
                document.querySelectorAll('#table-vars tbody td[data-full-text], #table-data tbody td[data-full-text]').forEach(function (cell) {
                    cell.toggleAttribute('data-overflow', cellHasOverflow(cell));
                });
                if (overflowTooltipTarget) {
                    if (
                        overflowTooltipTarget.isConnected
                        && (
                            !overflowTooltipRequiresOverflow
                            || cellHasOverflow(overflowTooltipTarget)
                        )
                    ) {
                        positionOverflowTooltip(overflowTooltipTarget);
                    } else {
                        hideOverflowTooltip();
                    }
                }
            });
        }

        document.addEventListener('mouseover', function (event) {
            var handle = event.target.closest
                ? event.target.closest('.col-resize-handle')
                : null;
            if (handle) {
                if (handle !== overflowTooltipTarget) {
                    showTooltipForTarget(handle, autoFitColumnLabel, false);
                }
                return;
            }
            var cell = event.target.closest
                ? event.target.closest('#table-vars tbody td[data-full-text], #table-data tbody td[data-full-text]')
                : null;
            if (!cell || cell === overflowTooltipTarget) return;
            showOverflowTooltip(cell);
        });

        document.addEventListener('mouseout', function (event) {
            if (!overflowTooltipTarget) return;
            var next = event.relatedTarget;
            if (next && overflowTooltipTarget.contains(next)) return;
            hideOverflowTooltip();
        });

        document.addEventListener('scroll', hideOverflowTooltip, true);
        window.addEventListener('resize', hideOverflowTooltip);

        document.addEventListener('dblclick', function (event) {
            var cell = event.target.closest
                ? event.target.closest('#table-vars tbody td[data-full-text], #table-data tbody td[data-full-text]')
                : null;
            if (!cell || (event.target.closest && event.target.closest('.col-resize-handle'))) return;
            event.preventDefault();
            hideOverflowTooltip();
            var table = cell.closest('table');
            var column = '';
            if (table && table.id === 'table-data') {
                var columnIndex = parseInt(cell.getAttribute('data-col-index'), 10);
                column = Number.isFinite(columnIndex) ? (dataColumnsCache[columnIndex] || '') : '';
            } else if (table) {
                var heading = table.querySelector(
                    'thead tr > *:nth-child(' + (cell.cellIndex + 1) + ')'
                );
                column = heading ? String(heading.textContent || '').trim() : '';
            }
            vscode.postMessage({
                type: 'copyCell',
                column: column,
                text: cell.getAttribute('data-full-text') || ''
            });
        });

        function autoSizeVarsColumns() {
            var table = document.getElementById('table-vars');
            for (var col = 0; col < varsColumnWidths.length; col++) {
                var cells = table.querySelectorAll('tr > *:nth-child(' + (col + 1) + ')');
                var naturalWidth = colMinWidth;
                cells.forEach(function (cell) {
                    var text = cell.getAttribute('data-full-text');
                    if (text === null) text = cell.textContent || '';
                    naturalWidth = Math.max(naturalWidth, measureTableText(text, cell));
                });
                varsColumnNaturalWidths[col] = naturalWidth;
                if (!varsColumnManualWidths[col]) {
                    setVarsColumnWidth(
                        col,
                        clampAutoColumnWidth(naturalWidth, varsAutoColMaxWidths[col])
                    );
                } else {
                    setVarsColumnWidth(col, varsColumnWidths[col]);
                }
            }
        }

        function autoSizeDataColumns(rows) {
            if (!Array.isArray(rows) || !rows.length) return;
            var changed = false;
            for (var col = 0; col < dataColumnsCache.length; col++) {
                var naturalWidth = columnNaturalWidths[col] || colMinWidth;
                for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                    var values = Array.isArray(rows[rowIndex].values) ? rows[rowIndex].values : [];
                    var value = col < values.length ? displayCell(values[col], col) : '';
                    naturalWidth = Math.max(
                        naturalWidth,
                        measureTableText(value, document.getElementById('table-data'))
                    );
                }
                columnNaturalWidths[col] = naturalWidth;
                if (!columnManualWidths[col]) {
                    var width = clampAutoColumnWidth(naturalWidth);
                    if (columnWidths[col] !== width) {
                        columnWidths[col] = width;
                        changed = true;
                    }
                }
            }
            if (changed) {
                updateDataTableWidth();
                lastVirtualColStart = -1;
                lastVirtualColEnd = -1;
            }
        }

        function renderDataHeader(columns, typeMap) {
            dataColumnsCache = columns;
            dataColumnTypesCache = [];
            var thead = document.getElementById('table-data').querySelector('thead');
            var tbody = document.getElementById('table-data').querySelector('tbody');
            var table = document.getElementById('table-data');
            thead.innerHTML = '';
            tbody.innerHTML = '';
            dataRowsCache = [];
            lastVirtualStart = -1;
            lastVirtualEnd = -1;
            lastVirtualColStart = -1;
            lastVirtualColEnd = -1;
            columnWidths = [];
            columnNaturalWidths = [];
            columnManualWidths = [];
            for (var i = 0; i < columns.length; i++) {
                dataColumnTypesCache.push(typeMap[columns[i]] || '');
                var naturalWidth = measureTableText(columns[i], table);
                columnNaturalWidths.push(naturalWidth);
                columnManualWidths.push(false);
                columnWidths.push(clampAutoColumnWidth(naturalWidth));
            }
            updateDataTableWidth(table);
            renderVisibleDataHeader(0, Math.min(columns.length, getVisibleColumnCount()));
            loadedRows = 0;
            dataWindowStart = 0;
            hasMoreRows = true;
            setLoadingMore(false);
        }

        function updateDataTableWidth(table) {
            var dataTable = table || document.getElementById('table-data');
            dataTable.style.width = rowNumberColumnWidth + getCumulWidth(dataColumnsCache.length) + 'px';
        }

        function setRowNumberColumnWidth(width) {
            rowNumberColumnWidth = Math.max(rowNumberMinWidth, Math.ceil(width || 0));
            var table = document.getElementById('table-data');
            table.style.setProperty('--row-number-column-width', rowNumberColumnWidth + 'px');
            updateDataTableWidth(table);
        }

        function cellTypeAt(columnIndex) {
            return dataColumnTypesCache[columnIndex] || '';
        }

        function displayCell(value, columnIndex) {
            return displayValue(value, cellTypeAt(columnIndex));
        }

        function replaceDataRows(rows, windowStart) {
            dataRowsCache = Array.isArray(rows) ? rows.slice() : [];
            dataWindowStart = Math.max(0, Number(windowStart) || 0);
            loadedRows = dataRowsCache.length;
            autoSizeDataColumns(rows);
            setLoadingMore(false);
            scheduleDataRender(true);
            scheduleAutoLoadCheck();
        }

        function scheduleDataRender(force) {
            if (currentTab !== 'data') return;
            if (force) {
                lastVirtualStart = -1;
                lastVirtualEnd = -1;
                lastVirtualColStart = -1;
                lastVirtualColEnd = -1;
            }
            if (virtualRenderQueued) return;
            virtualRenderQueued = true;
            requestAnimationFrame(function () {
                virtualRenderQueued = false;
                renderVisibleDataRows();
            });
        }

        function renderVisibleDataRows() {
            var tbody = document.getElementById('table-data').querySelector('tbody');
            var cols = dataColumnsCache;
            if (!cols.length || !dataRowsCache.length) {
                tbody.innerHTML = '';
                return;
            }
            var firstVisible = pendingViewportRestore
                ? pendingViewportRestore.rowIndex
                : Math.floor(contentEl.scrollTop / virtualRowHeight);
            var visibleCount = Math.ceil(contentEl.clientHeight / virtualRowHeight) + virtualOverscan * 2;
            var firstVisibleLocal = firstVisible - dataWindowStart;
            var start = Math.min(
                dataRowsCache.length,
                Math.max(0, firstVisibleLocal - virtualOverscan)
            );
            var end = Math.min(dataRowsCache.length, start + visibleCount);
            var columnRange = getVisibleColumnRange();
            if (start === lastVirtualStart && end === lastVirtualEnd &&
                columnRange.start === lastVirtualColStart && columnRange.end === lastVirtualColEnd) {
                return;
            }
            lastVirtualStart = start;
            lastVirtualEnd = end;
            lastVirtualColStart = columnRange.start;
            lastVirtualColEnd = columnRange.end;
            renderVisibleDataHeader(columnRange.start, columnRange.end);
            var fragment = document.createDocumentFragment();
            appendSpacerRow(
                fragment,
                (dataWindowStart + start) * virtualRowHeight,
                columnRange.start,
                columnRange.end
            );
            for (var r = start; r < end; r++) {
                fragment.appendChild(createDataRow(dataRowsCache[r], columnRange.start, columnRange.end));
            }
            appendSpacerRow(
                fragment,
                Math.max(0, (totalObs - dataWindowStart - end) * virtualRowHeight),
                columnRange.start,
                columnRange.end
            );
            tbody.innerHTML = '';
            tbody.appendChild(fragment);
            if (pendingViewportRestore) {
                var viewportRestore = pendingViewportRestore;
                pendingViewportRestore = null;
                contentEl.scrollTop = viewportRestore.rowIndex * virtualRowHeight
                    + viewportRestore.rowOffset;
                scheduleViewportPersist();
            }
            scheduleOverflowTitleUpdate();
        }

        function getVisibleColumnCount() {
            var avail = Math.max(contentEl.clientWidth - rowNumberColumnWidth, 0);
            var count = 0;
            var cumul = 0;
            for (var i = 0; i < dataColumnsCache.length; i++) {
                cumul += getColWidth(i);
                count++;
                if (cumul >= avail) break;
            }
            return Math.max(count + virtualColumnOverscan * 2, virtualColumnOverscan * 4);
        }

        function getVisibleColumnRange() {
            var scrollLeft = Math.max(0, contentEl.scrollLeft);
            var colStart = getColumnAtX(scrollLeft);
            var colEnd = Math.min(dataColumnsCache.length, getColumnAtX(scrollLeft + contentEl.clientWidth) + 1);
            colEnd = Math.max(colEnd, colStart + getVisibleColumnCount() - virtualColumnOverscan * 2);
            colEnd = Math.min(dataColumnsCache.length, colEnd);
            return { start: Math.max(0, colStart - virtualColumnOverscan), end: colEnd };
        }

        function renderVisibleDataHeader(colStart, colEnd) {
            var thead = document.getElementById('table-data').querySelector('thead');
            var headerRow = document.createElement('tr');
            var th = document.createElement('th');
            th.className = 'row-num';
            th.textContent = '#';
            var rowNumberHandle = document.createElement('div');
            rowNumberHandle.className = 'col-resize-handle';
            rowNumberHandle.setAttribute('data-table', 'row-number');
            rowNumberHandle.setAttribute('data-col', 0);
            rowNumberHandle.setAttribute('aria-label', autoFitColumnLabel);
            th.appendChild(rowNumberHandle);
            headerRow.appendChild(th);
            appendColumnSpacer(headerRow, getCumulWidth(colStart), 'th');
            for (var i = colStart; i < colEnd; i++) {
                var th2 = document.createElement('th');
                th2.textContent = dataColumnsCache[i];
                th2.setAttribute('data-col-index', i);
                setVirtualColumnWidth(th2, i);
                // Resize handle
                var handle = document.createElement('div');
                handle.className = 'col-resize-handle';
                handle.setAttribute('data-col', i);
                handle.setAttribute('aria-label', autoFitColumnLabel);
                th2.appendChild(handle);
                headerRow.appendChild(th2);
            }
            var rightSpacer = Math.max(0, getCumulWidth(dataColumnsCache.length) - getCumulWidth(colEnd));
            appendColumnSpacer(headerRow, rightSpacer, 'th');
            thead.innerHTML = '';
            thead.appendChild(headerRow);
            scheduleOverflowTitleUpdate();
        }

        function appendSpacerRow(fragment, height, colStart, colEnd) {
            if (height <= 0) return;
            var tr = document.createElement('tr');
            tr.className = 'virtual-spacer';
            var td = document.createElement('td');
            td.colSpan = Math.max(1, (colEnd - colStart) + 3);
            td.style.height = height + 'px';
            tr.appendChild(td);
            fragment.appendChild(tr);
        }

        function appendColumnSpacer(row, width, tagName) {
            if (width <= 0) return;
            var cell = document.createElement(tagName || 'td');
            cell.className = 'col-spacer';
            cell.style.width = width + 'px';
            cell.style.minWidth = width + 'px';
            cell.style.maxWidth = width + 'px';
            row.appendChild(cell);
        }

        function setVirtualColumnWidth(cell, colIndex) {
            var w = getColWidth(colIndex);
            cell.style.width = w + 'px';
            cell.style.minWidth = w + 'px';
            cell.style.maxWidth = w + 'px';
        }

        function applyVisibleDataColumnWidth(colIndex, width) {
            document.querySelectorAll('#table-data [data-col-index="' + colIndex + '"]').forEach(function (cell) {
                cell.style.width = width + 'px';
                cell.style.minWidth = width + 'px';
                cell.style.maxWidth = width + 'px';
            });
        }

        function createDataRow(row, colStart, colEnd) {
            var tr = document.createElement('tr');
            var tdNum = document.createElement('td');
            tdNum.className = 'row-num';
            tdNum.textContent = row.rowNum;
            tr.appendChild(tdNum);
            appendColumnSpacer(tr, getCumulWidth(colStart), 'td');
            var vals = Array.isArray(row.values) ? row.values : [];
            for (var v = colStart; v < colEnd; v++) {
                var td = document.createElement('td');
                var val = v < vals.length ? displayCell(vals[v], v) : '';
                td.textContent = val;
                td.setAttribute('data-col-index', v);
                td.setAttribute('data-full-text', val);
                var isString = /^str/i.test(dataColumnTypesCache[v] || '');
                td.className = isString ? 'data-string' : 'num data-number';
                setVirtualColumnWidth(td, v);
                tr.appendChild(td);
            }
            var rightSpacer = Math.max(0, getCumulWidth(dataColumnsCache.length) - getCumulWidth(colEnd));
            appendColumnSpacer(tr, rightSpacer, 'td');
            return tr;
        }

        // ── Add resize handles to variables table ────────────────────────
        function updateVarsTableWidth() {
            var table = document.getElementById('table-vars');
            var total = 0;
            for (var i = 0; i < varsColumnWidths.length; i++) total += varsColumnWidths[i];
            table.style.width = total + 'px';
        }

        function setVarsColumnWidth(colIndex, width) {
            varsColumnWidths[colIndex] = width;
            var selector = '#table-vars tr > *:nth-child(' + (colIndex + 1) + ')';
            document.querySelectorAll(selector).forEach(function (cell) {
                cell.style.width = width + 'px';
                cell.style.minWidth = width + 'px';
                cell.style.maxWidth = width + 'px';
            });
            updateVarsTableWidth();
        }

        (function initVarsResize() {
            var varsTheadRow = document.querySelector('#table-vars thead tr');
            if (!varsTheadRow) return;
            var ths = varsTheadRow.querySelectorAll('th');
            for (var i = 0; i < ths.length; i++) {
                setVarsColumnWidth(i, varsColumnWidths[i] || defaultColWidth);
                var handle = document.createElement('div');
                handle.className = 'col-resize-handle';
                handle.setAttribute('data-table', 'vars');
                handle.setAttribute('data-col', i);
                handle.setAttribute('aria-label', autoFitColumnLabel);
                ths[i].appendChild(handle);
            }
            updateVarsTableWidth();
        })();

        // ── Column resize via drag ──────────────────────────────────────
        var resizeTable = null;  // 'data' or 'vars'
        var resizeCol = -1;
        var resizeStartX = 0;
        var resizeStartWidth = 0;
        var resizeTh = null;

        function onResizeStart(e) {
            var handle = e.target.closest ? e.target.closest('.col-resize-handle') : null;
            if (!handle) return;
            e.preventDefault();
            resizeTable = handle.getAttribute('data-table') || 'data';
            resizeCol = parseInt(handle.getAttribute('data-col'), 10);
            if (isNaN(resizeCol) || resizeCol < 0) { resizeCol = -1; resizeTable = null; return; }
            resizeStartX = e.clientX;
            if (resizeTable === 'vars') {
                resizeTh = handle.parentElement;
                resizeStartWidth = resizeTh ? resizeTh.offsetWidth : defaultColWidth;
            } else if (resizeTable === 'row-number') {
                resizeStartWidth = rowNumberColumnWidth;
            } else {
                resizeStartWidth = getColWidth(resizeCol);
            }
            document.body.classList.add('col-resizing');
            document.querySelectorAll('.col-resize-handle').forEach(function (h) {
                var tableName = h.getAttribute('data-table') || 'data';
                if (tableName === resizeTable && parseInt(h.getAttribute('data-col'), 10) === resizeCol) {
                    h.classList.add('active');
                }
            });
        }

        document.getElementById('table-data').addEventListener('mousedown', onResizeStart);
        document.getElementById('table-vars').addEventListener('mousedown', onResizeStart);

        function measureVarsColumnForAutoFit(colIndex) {
            var naturalWidth = colMinWidth;
            var cells = document.querySelectorAll(
                '#table-vars tr > *:nth-child(' + (colIndex + 1) + ')'
            );
            cells.forEach(function (cell) {
                var text = cell.getAttribute('data-full-text');
                if (text === null) text = cell.textContent || '';
                naturalWidth = Math.max(naturalWidth, measureStyledText(text, cell));
            });
            varsColumnNaturalWidths[colIndex] = naturalWidth;
            return naturalWidth;
        }

        function measureDataColumnForAutoFit(colIndex, headerCell, fullColumnValue) {
            var naturalWidth = measureStyledText(
                dataColumnsCache[colIndex] || '',
                headerCell
            );
            var bodyCell = document.querySelector(
                '#table-data tbody td[data-col-index="' + colIndex + '"]'
            ) || document.querySelector('#table-data tbody td[data-full-text]');
            var sourceCell = bodyCell || headerCell;
            for (var rowIndex = 0; rowIndex < dataRowsCache.length; rowIndex++) {
                var values = Array.isArray(dataRowsCache[rowIndex].values)
                    ? dataRowsCache[rowIndex].values
                    : [];
                var value = colIndex < values.length ? displayCell(values[colIndex], colIndex) : '';
                naturalWidth = Math.max(
                    naturalWidth,
                    measureStyledText(value, sourceCell)
                );
            }
            if (fullColumnValue !== undefined && fullColumnValue !== null) {
                naturalWidth = Math.max(
                    naturalWidth,
                    measureStyledText(fullColumnValue, sourceCell)
                );
            }
            naturalWidth = Math.max(colMinWidth, naturalWidth);
            columnNaturalWidths[colIndex] = naturalWidth;
            return naturalWidth;
        }

        function measureRowNumberColumnForAutoFit(headerCell) {
            var bodyCell = document.querySelector('#table-data tbody td.row-num');
            var sourceCell = bodyCell || headerCell;
            var naturalWidth = Math.max(
                rowNumberMinWidth,
                measureStyledText('#', headerCell)
            );
            // A filtered or ranged browse can contain only a few matches while
            // retaining large absolute observation numbers. totalObs is then
            // smaller than the displayed row numbers, so measure the actual
            // cached row labels as well.
            for (var rowIndex = 0; rowIndex < dataRowsCache.length; rowIndex++) {
                naturalWidth = Math.max(
                    naturalWidth,
                    measureStyledText(dataRowsCache[rowIndex].rowNum, sourceCell)
                );
            }
            return naturalWidth;
        }

        function onResizeHandleDoubleClick(e) {
            var handle = e.target.closest ? e.target.closest('.col-resize-handle') : null;
            if (!handle) return;
            e.preventDefault();
            e.stopPropagation();
            var tableName = handle.getAttribute('data-table') || 'data';
            var colIndex = parseInt(handle.getAttribute('data-col'), 10);
            if (!Number.isFinite(colIndex) || colIndex < 0) return;
            if (tableName === 'vars') {
                varsColumnManualWidths[colIndex] = true;
                setVarsColumnWidth(
                    colIndex,
                    measureVarsColumnForAutoFit(colIndex)
                );
            } else if (tableName === 'row-number') {
                setRowNumberColumnWidth(
                    measureRowNumberColumnForAutoFit(handle.parentElement)
                );
                lastVirtualColStart = -1;
                lastVirtualColEnd = -1;
                scheduleDataRender(true);
            } else {
                columnManualWidths[colIndex] = true;
                columnWidths[colIndex] = measureDataColumnForAutoFit(
                    colIndex,
                    handle.parentElement,
                    null
                );
                updateDataTableWidth();
                lastVirtualColStart = -1;
                lastVirtualColEnd = -1;
                scheduleDataRender(true);
                vscode.postMessage({
                    type: 'autoFitColumn',
                    column: dataColumnsCache[colIndex] || '',
                    colIndex: colIndex,
                    filterText: filterInput.value || ''
                });
            }
            scheduleOverflowTitleUpdate();
        }

        document.getElementById('table-data').addEventListener('dblclick', onResizeHandleDoubleClick);
        document.getElementById('table-vars').addEventListener('dblclick', onResizeHandleDoubleClick);

        document.addEventListener('mousemove', function (e) {
            if (resizeCol < 0 || !resizeTable) return;
            var delta = e.clientX - resizeStartX;
            var minimumWidth = resizeTable === 'row-number' ? rowNumberMinWidth : colMinWidth;
            var newWidth = Math.max(minimumWidth, resizeStartWidth + delta);
            if (resizeTable === 'vars') {
                varsColumnManualWidths[resizeCol] = true;
                setVarsColumnWidth(resizeCol, newWidth);
            } else if (resizeTable === 'row-number') {
                setRowNumberColumnWidth(newWidth);
            } else {
                columnManualWidths[resizeCol] = true;
                if (columnWidths[resizeCol] !== newWidth) {
                    columnWidths[resizeCol] = newWidth;
                    updateDataTableWidth();
                    applyVisibleDataColumnWidth(resizeCol, newWidth);
                }
            }
            scheduleOverflowTitleUpdate();
        });

        document.addEventListener('mouseup', function () {
            if (resizeCol < 0) return;
            if (resizeTable === 'data' || resizeTable === 'row-number') {
                lastVirtualColStart = -1;
                lastVirtualColEnd = -1;
                scheduleDataRender(true);
            }
            document.body.classList.remove('col-resizing');
            document.querySelectorAll('.col-resize-handle.active').forEach(function (h) { h.classList.remove('active'); });
            resizeTable = null;
            resizeCol = -1;
            resizeTh = null;
            scheduleOverflowTitleUpdate();
        });

        function requestLoadMore() {
            if (loadingMore || totalObs <= 0 || loadedRows >= totalObs) return;
            var firstVisibleRow = getFirstVisibleDataRow();
            var requestedStart = Math.max(0, firstVisibleRow - preloadRowBuffer);
            if (requestedStart === dataWindowStart
                && dataWindowStart + loadedRows < totalObs) {
                requestedStart = Math.max(
                    0,
                    Math.min(totalObs - 1, dataWindowStart + loadedRows - preloadRowBuffer)
                );
            }
            setLoadingMore(true);
            vscode.postMessage({
                type: 'loadWindow',
                startObs: requestedStart,
                count: pageSize,
                filterText: filterInput.value || ''
            });
        }

        var autoLoadCheckQueued = false;
        function scheduleAutoLoadCheck() {
            if (autoLoadCheckQueued) return;
            autoLoadCheckQueued = true;
            requestAnimationFrame(function () {
                autoLoadCheckQueued = false;
                checkAutoLoad();
            });
        }

        function checkAutoLoad() {
            if (currentTab !== 'data') return;
            if (loadingMore || totalObs <= 0 || loadedRows >= totalObs) return;
            var firstVisibleRow = getFirstVisibleDataRow();
            var windowEnd = dataWindowStart + loadedRows;
            if (firstVisibleRow < dataWindowStart + preloadRowBuffer
                || firstVisibleRow >= windowEnd - preloadRowBuffer) {
                var requestedStart = Math.max(0, firstVisibleRow - preloadRowBuffer);
                if (requestedStart !== dataWindowStart) {
                    setLoadingMore(true);
                    vscode.postMessage({
                        type: 'loadWindow',
                        startObs: requestedStart,
                        count: pageSize,
                        filterText: filterInput.value || ''
                    });
                }
            }
        }

        function getFirstVisibleDataRow() {
            if (totalObs <= 0) return 0;
            return Math.min(
                totalObs - 1,
                Math.max(0, Math.floor(contentEl.scrollTop / virtualRowHeight))
            );
        }
        contentEl.addEventListener('scroll', function () {
            renderVisibleDataRows();
            scheduleAutoLoadCheck();
            scheduleViewportPersist();
        }, { passive: true });
        contentEl.addEventListener('wheel', function () {
            renderVisibleDataRows();
            scheduleAutoLoadCheck();
        }, { passive: true });
        window.addEventListener('resize', function () {
            updateDataTableWidth();
            fitInfoSourcePath();
            scheduleDataRender(true);
            scheduleAutoLoadCheck();
        });

        // ── Source path display: right-aligned, truncate left at / or \ ────

        /**
         * Hidden off-screen <span> that mirrors .source-path font for
         * pixel-perfect DOM text measurement (no canvas CJK errors).
         */
        function getPathMeasurer(sourceEl) {
            if (!getPathMeasurer._el) {
                var el = document.createElement('span');
                el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;white-space:nowrap;opacity:0;pointer-events:none;';
                el.id = '__stata_path_measurer';
                document.body.appendChild(el);
                getPathMeasurer._el = el;
            }
            var m = getPathMeasurer._el;
            var cs = window.getComputedStyle(sourceEl);
            m.style.font = cs.font;
            m.style.fontSize = cs.fontSize;
            m.style.fontFamily = cs.fontFamily;
            return m;
        }

        function measureDomText(text, sourceEl) {
            var m = getPathMeasurer(sourceEl);
            m.textContent = text;
            return m.getBoundingClientRect().width;
        }

        /**
         * Available pixel width for .source-path = bar content width
         * minus all fixed sibling spans and flex gaps.
         */
        function getSourcePathAvailableWidth(source) {
            var bar = document.getElementById('info-bar');
            if (!bar) return 0;
            var barRect = bar.getBoundingClientRect();
            var barStyle = window.getComputedStyle(bar);
            var padLeft = parseFloat(barStyle.paddingLeft) || 0;
            var padRight = parseFloat(barStyle.paddingRight) || 0;
            var gap = parseFloat(barStyle.columnGap || barStyle.gap || '0') || 0;
            var avail = barRect.width - padLeft - padRight;

            var children = bar.children;
            for (var i = 0; i < children.length; i++) {
                if (children[i] === source) continue;
                avail -= children[i].getBoundingClientRect().width;
            }
            avail -= gap * (children.length - 1);
            return Math.max(0, avail);
        }

        /**
         * Shorten source path: keep rightmost segments, truncate from left
         * at nearest / or \, replace left portion with "...".
         *
         * CSS text-align:right handles right-alignment;
         * text-overflow:ellipsis is the safety net.
         */
        function fitInfoSourcePath() {
            var source = document.querySelector('#info-bar .source-path');
            if (!source) return;

            var fullPath = source.getAttribute('data-full-path') || '';
            var avail = getSourcePathAvailableWidth(source);

            if (avail <= 4) {
                requestAnimationFrame(fitInfoSourcePath);
                return;
            }

            // Full path fits — done
            if (measureDomText(fullPath, source) <= avail) {
                source.textContent = fullPath;
                return;
            }

            // Parse into segments
            var raw = String(fullPath || '');
            var sep = raw.indexOf('\\\\') >= 0 ? '\\\\' : '/';
            var parts = raw.replace(/^[A-Za-z]:/, '').split(/[\\\\/]+/).filter(function (p) { return p !== ''; });
            if (!parts.length) return;

            // Walk from right (filename) to left, keep as many segments as fit
            var result = parts[parts.length - 1];
            for (var i = parts.length - 2; i >= 0; i--) {
                var candidate = '...' + sep + parts[i] + sep + result;
                if (measureDomText(candidate, source) <= avail) {
                    result = parts[i] + sep + result;
                } else {
                    break;
                }
            }

            source.textContent = '...' + sep + result;
        }

        var _infoSourceResizeObserver = null;

        function observeInfoSourcePath() {
            if (_infoSourceResizeObserver) {
                _infoSourceResizeObserver.disconnect();
                _infoSourceResizeObserver = null;
            }
            var source = document.querySelector('#info-bar .source-path');
            if (!source || typeof ResizeObserver === 'undefined') return;
            _infoSourceResizeObserver = new ResizeObserver(function () {
                fitInfoSourcePath();
            });
            _infoSourceResizeObserver.observe(document.getElementById('info-bar'));
        }

        function renderInfo(info) {
            var bar = document.getElementById('info-bar');
            var html = [];
            var sourceText = info.source === 'Stata memory'
                ? ${JSON.stringify(msg('dataViewerDoubleClickCopyHint'))}
                : info.source;
            if (info.observations > 0) html.push('<span>' + esc(${JSON.stringify(msg('dataViewerObs'))} + ': ' + info.observations) + '</span>');
            if (info.variables > 0) html.push('<span>' + esc(${JSON.stringify(msg('dataViewerVars'))} + ': ' + info.variables) + '</span>');
            if (sourceText) html.push('<span class="source-path" title="' + esc(sourceText) + '" data-full-path="' + esc(sourceText) + '">' + esc(sourceText) + '</span>');
            if (info.sortedBy) html.push('<span>' + esc(${JSON.stringify(msg('dataViewerSortedBy'))} + ': ' + info.sortedBy) + '</span>');
            bar.innerHTML = html.join('');
            observeInfoSourcePath();
            requestAnimationFrame(fitInfoSourcePath);
            setTimeout(fitInfoSourcePath, 80);
        }

        function esc(s) {
            if (!s) return '';
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // Presentation only: the raw stored value stays untouched in the data
        // layer, and copy uses this same text so the clipboard matches the view.
        var formatCellValue = ${formatCellValueSource};
        function displayValue(value, type) {
            return formatCellValue(value, type);
        }

        function restoreViewport(viewport) {
            if (!viewport) {
                contentEl.scrollLeft = 0;
                pendingViewportRestore = { rowIndex: 0, rowOffset: 0 };
                scheduleDataRender(true);
                return;
            }
            var rowIndex = totalObs > 0
                ? Math.min(totalObs - 1, Math.max(0, Number(viewport.rowIndex) || 0))
                : 0;
            var rowOffset = Math.max(0, Number(viewport.rowOffset) || 0);
            var columnIndex = dataColumnsCache.indexOf(String(viewport.columnName || ''));
            if (columnIndex < 0) {
                columnIndex = Math.min(
                    Math.max(0, Number(viewport.columnIndex) || 0),
                    Math.max(0, dataColumnsCache.length - 1)
                );
            }
            contentEl.scrollLeft = getCumulWidth(columnIndex)
                + Math.max(0, Number(viewport.columnOffset) || 0);
            pendingViewportRestore = { rowIndex: rowIndex, rowOffset: rowOffset };
            scheduleDataRender(true);
        }

        var VIEWER_STATUS = ${JSON.stringify(VIEWER_STATUS)};

        function showStatusBanner(kind, text) {
            var banner = document.getElementById('status-banner');
            var label = document.getElementById('status-banner-text');
            if (!banner || !label) return;
            if (!text) {
                banner.style.display = 'none';
                label.textContent = '';
                banner.classList.remove('error');
                return;
            }
            banner.style.display = '';
            label.textContent = text;
            banner.classList.toggle('error', kind === 'error');
        }

        function clearStatusBanner() {
            showStatusBanner('info', '');
        }

        function emptyStateMessage(status) {
            if (status === VIEWER_STATUS.ZERO_OBSERVATIONS) {
                return ${JSON.stringify(msg('dataViewerZeroObservations'))};
            }
            if (status === VIEWER_STATUS.NO_MATCHES) {
                return ${JSON.stringify(msg('dataViewerNoMatches'))};
            }
            return ${JSON.stringify(msg('dataViewerNoDataset'))};
        }

        // Reflects what is currently on screen: either fresh data or a view that
        // could not be updated.
        var currentViewStatus = VIEWER_STATUS.OK;
        // Whether a real table is on screen right now. A failed refresh may keep
        // it, but only while labelling it as not updated.
        var hasRenderedData = false;

        function renderEmptyStatus(status, data) {
            hasRenderedData = false;
            showEmpty(false);
            allVarsCache = [];
            sharedAutocompleteVariables = (data && data.variableSuggestions) || sharedAutocompleteVariables;
            autocompleteVariables = mergeVariableLists(sharedAutocompleteVariables);
            updateFilterHighlight();
            var message = emptyStateMessage(status);
            document.getElementById('empty-vars').textContent = message;
            document.getElementById('empty-data').textContent = message;
            document.getElementById('info-bar').textContent = message;
            totalObs = 0;
            dataColumnsCache = [];
            replaceDataRows([], 0);
            setLoadingMore(false);
        }

        function setData(data, viewport) {
            document.body.classList.remove('loading');
            document.getElementById('loading-msg').style.display = 'none';
            setReadInProgress(false);

            // A failed refresh must never be rendered as "no dataset loaded".
            if (data.status && data.status !== VIEWER_STATUS.OK) {
                currentViewStatus = data.status;
                var failed = data.status === VIEWER_STATUS.READ_FAILED
                    || data.status === VIEWER_STATUS.SESSION_UNAVAILABLE
                    || data.status === VIEWER_STATUS.FILE_UNAVAILABLE;
                if (failed) {
                    showStatusBanner('error', data.error || ${JSON.stringify(msg('dataViewerReadFailed'))});
                    if (data.keepPreviousView !== false && hasRenderedData) {
                        // Keep the last good table but say clearly that it is stale.
                        return;
                    }
                    hasRenderedData = false;
                    renderEmptyStatus(data.status);
                    return;
                }
                clearStatusBanner();
                hasRenderedData = false;
                renderEmptyStatus(data.status);
                return;
            }

            clearStatusBanner();
            currentViewStatus = VIEWER_STATUS.OK;
            if (data.filterText !== undefined) {
                dataFilterText = data.filterText || '';
                filterOpenByTab.data = !!dataFilterText;
                // Calling switchTab while already on the data tab saves the
                // input's OLD value back into dataFilterText. That made a
                // second browse command keep showing the first command's filter.
                if (dataFilterText && currentTab !== 'data') {
                    switchTab('data');
                }
                if (currentTab === 'data') {
                    filterInput.value = dataFilterText;
                    document.body.classList.toggle('filter-open', filterOpenByTab.data);
                    updateFilterHighlight();
                }
            }
            var hasData = data.vars && data.vars.length > 0;
            if (!hasData) {
                hasRenderedData = false;
                renderEmptyStatus(data.status || VIEWER_STATUS.NO_DATASET, data);
                return;
            }
            hasRenderedData = true;
            showEmpty(true);
            renderVars(data.vars, true);
            if (currentTab === 'vars' && variableFilterText) {
                applyVariableTableFilter();
            }
            sharedAutocompleteVariables = data.variableSuggestions || sharedAutocompleteVariables;
            autocompleteVariables = mergeVariableLists(data.allVarNames || data.dataColumns || [], sharedAutocompleteVariables);
            updateFilterHighlight();
            renderDataHeader(data.dataColumns, getVarTypeMap(data.vars || []));
            totalObs = (data.info && data.info.observations) || 0;
            replaceDataRows(data.dataRows || [], data.windowStart || 0);
            restoreViewport(viewport);
            setLoadingMore(false);
            renderInfo(data.info || {});
            scheduleDataRender(true);
            scheduleAutoLoadCheck();
        }

        function getVarTypeMap(vars) {
            var map = {};
            for (var i = 0; i < vars.length; i++) {
                map[vars[i].name] = vars[i].type || '';
            }
            return map;
        }

        window.addEventListener('message', function (event) {
            var message = event.data || {};
            if (message.type === 'setData') {
                setData(message.data || {}, message.viewport || null);
            } else if (message.type === 'setWindow') {
                hasMoreRows = message.hasMore !== false;
                replaceDataRows(message.rows || [], message.windowStart || 0);
            } else if (message.type === 'loadMoreDone') {
                hasMoreRows = message.hasMore !== false;
                setLoadingMore(false);
            } else if (message.type === 'requestRefresh') {
                requestRefresh(
                    message.preservePosition !== false,
                    message.filterText,
                    message.viewport || null
                );
            } else if (message.type === 'filterHighlightResult') {
                renderFilterHighlight(message.segments || []);
            } else if (
                message.type === 'filterAutocompleteResult'
                && message.requestId === filterAutocompleteRequestId
            ) {
                var matches = message.matches || [];
                var prefix = String(message.prefix || '').toLowerCase();
                if (matches.length === 1 && matches[0].label.toLowerCase() === prefix) {
                    hideFilterAutocomplete();
                } else {
                    showFilterAutocomplete(matches, message.wordStart || 0);
                }
            } else if (
                message.type === 'variableTableAutocompleteResult'
                && message.requestId === variableAutocompleteRequestId
                && currentTab === 'vars'
            ) {
                var variableMatches = message.matches || [];
                var variablePrefix = String(message.prefix || '').toLowerCase();
                if (variableMatches.length === 1 && variableMatches[0].label.toLowerCase() === variablePrefix) {
                    hideFilterAutocomplete();
                } else {
                    showFilterAutocomplete(variableMatches, message.wordStart || 0);
                }
            } else if (
                message.type === 'variableTableApplyResult'
                && message.requestId === variableApplyRequestId
                && currentTab === 'vars'
                && String(message.varList || '') === variableFilterText
            ) {
                renderVariableTableNames(message.names || []);
            } else if (message.type === 'setStatus') {
                if (message.status === 'loading') {
                    setReadInProgress(true);
                } else {
                    setReadInProgress(false);
                }
            } else if (message.type === 'variablesUpdate') {
                sharedAutocompleteVariables = message.variables || [];
                autocompleteVariables = mergeVariableLists(dataColumnsCache, sharedAutocompleteVariables);
                updateFilterHighlight();
            } else if (message.type === 'fontSize') {
                applyFontSize(message.value);
            } else if (
                message.type === 'autoFitColumnResult'
                && dataColumnsCache[message.colIndex] === message.column
            ) {
                var headerCell = document.querySelector(
                    '#table-data thead [data-col-index="' + message.colIndex + '"]'
                ) || document.getElementById('table-data');
                columnManualWidths[message.colIndex] = true;
                columnWidths[message.colIndex] = measureDataColumnForAutoFit(
                    message.colIndex,
                    headerCell,
                    message.value
                );
                updateDataTableWidth();
                lastVirtualColStart = -1;
                lastVirtualColEnd = -1;
                scheduleDataRender(true);
                scheduleOverflowTitleUpdate();
            }
        });

        setTimeout(function () {
            switchTab(webviewState.currentTab === 'data' ? 'data' : 'vars');
            syncFilterUi();
            vscode.postMessage({
                type: 'ready',
                viewport: webviewState.viewport || null
            });
        }, 100);
    </script>
</body>
</html>`;
}

// ── attach a webview panel with mode-specific message handlers ─────────────────
function attachPanel(panel, mode) {
    // A custom-editor .dta panel is attached when it is created and the webview
    // then reconnects: re-assigning the HTML and re-registering the listeners
    // would drop the in-flight request tracking of the very same panel.
    const existingTracker = _viewTrackers.peek(panel);
    if (existingTracker && existingTracker.mode === mode && _panels[mode] === panel) {
        panel.title = getPanelTitle();
        panel.iconPath = getPanelIconPath();
        return panel;
    }
    if (existingTracker) {
        _viewTrackers.release(panel);
    }

    _panels[mode] = panel;
    _ready[mode] = false;
    panel.title = getPanelTitle();
    panel.iconPath = getPanelIconPath();
    panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [CODICON_RESOURCE_ROOT],
        enableServiceWorker: false
    };
    panel.webview.html = getDataViewerHtml(panel.webview);

    panel.onDidChangeViewState(() => {
        if (!panel.active || mode !== 'console' || !_dirty.console) return;
        const preservePosition = _nextActivationPreserve.console;
        _nextActivationPreserve.console = true;
        requestPanelRefresh('console', _pendingFilter.console, preservePosition);
    });

    panel.onDidDispose(() => {
        _readyForSet.delete(panel);
        // Stop any read this panel still has in flight.
        cancelPanelWork(panel);
        // Cancel every in-flight request for THIS panel and release ITS
        // resources. This must not depend on `_panels[mode] === panel`: with two
        // .dta panels open, closing the first one would otherwise leave its
        // parsed columns in the cache forever.
        const releasedTracker = _viewTrackers.release(panel);
        if (mode === 'file') {
            const filePath = releasedTracker && releasedTracker.filePath
                ? releasedTracker.filePath
                : null;
            // Only this file's parsed columns are dropped; other open .dta
            // panels keep theirs.
            if (filePath) directDtaStore.dispose(filePath);
            if (!_panels.file) {
                _datasetAutocompleteVariables.file = [];
            }
        }
        if (_panels[mode] !== panel) {
            return;
        }
        _panels[mode] = null;
        _ready[mode] = false;
        if (mode !== 'file') {
            _consoleSnapshot.pinned = false;
            _consoleSnapshot.data = null;
            if (_consoleSnapshot.entry) consoleStore.dispose(_consoleSnapshot.entry).catch(() => {});
            _consoleSnapshot.entry = null;
            consoleStore.invalidateLive().catch(() => {});
            _lastViewport.console = null;
            _datasetAutocompleteVariables.console = [];
            // The live capture is dropped, so the next read must recapture.
            _dirty.console = true;
        }
    });

    const tracker = _viewTrackers.acquire(panel, { mode });
    tracker.setDataVersion(_dataVersion);
    ensureDataChangeSubscription();
    panel.webview.onDidReceiveMessage(async (message) => {
        if (!message) return;

        if (message.type === 'ready') {
            _ready[mode] = true;
            if (message.viewport) {
                _lastViewport[mode] = message.viewport;
            }
            _readyForSet.add(panel);
            const restoreViewport = mode !== 'console'
                || _nextActivationPreserve.console;
            await refreshDataViewer(mode, _pendingFilter[mode], panel, {
                viewport: restoreViewport ? _lastViewport[mode] : null
            });
            _nextActivationPreserve[mode] = true;
        } else if (message.type === 'refresh') {
            if (mode === 'console' && !_consoleSnapshot.pinned && isConsoleRunning()) {
                showInfo(msg('consoleBusyAction'));
                return;
            }
            await refreshDataViewer(mode, message.filterText || '', panel, {
                viewport: message.viewport || null
            });
        } else if (message.type === 'viewportChanged') {
            _lastViewport[mode] = message.viewport || null;
        } else if (message.type === 'highlightFilter') {
            const p = _panels[mode];
            if (p) {
                p.webview.postMessage({ type: 'filterHighlightResult', segments: highlightFilterText(message.text || '') });
            }
        } else if (message.type === 'filterAutocomplete') {
            const prefix = String(message.prefix || '');
            const variables = mergeAutocompleteVariableCandidates(
                _datasetAutocompleteVariables[mode],
                variableSuggestions.getActiveVariableCandidates()
            );
            const matches = selectDataViewerCandidates(prefix, variables);
            if (_panels[mode] === panel) {
                panel.webview.postMessage({
                    type: 'filterAutocompleteResult',
                    requestId: message.requestId,
                    prefix,
                    wordStart: message.wordStart,
                    matches
                });
            }
        } else if (message.type === 'variableTableAutocomplete') {
            const prefix = String(message.prefix || '');
            const matches = selectVariableTableCandidates(
                prefix,
                _datasetAutocompleteVariables[mode]
            );
            if (_panels[mode] === panel) {
                panel.webview.postMessage({
                    type: 'variableTableAutocompleteResult',
                    requestId: message.requestId,
                    prefix,
                    wordStart: message.wordStart,
                    matches
                });
            }
        } else if (message.type === 'variableTableApply') {
            const varList = String(message.varList || '');
            const names = expandVariableTableVarlist(
                varList,
                _datasetAutocompleteVariables[mode]
            );
            if (_panels[mode] === panel) {
                panel.webview.postMessage({
                    type: 'variableTableApplyResult',
                    requestId: message.requestId,
                    varList,
                    names
                });
            }
        } else if (message.type === 'cancelRead') {
            // The user closed an unwanted read: stop the work this panel started.
            cancelPanelWork(panel);
            tracker.supersede();
        } else if (message.type === 'loadWindow') {
            // The panel that ASKED is the panel that gets the rows. Reading the
            // mode-global panel here is what sent file A's rows to file B.
            await handleLoadWindow(mode, message, panel);
        } else if (message.type === 'copyCell') {
            const column = String(message.column || '');
            const value = String(message.text || '');
            try {
                await vscode.env.clipboard.writeText(value);
                showInfo(msg('dataViewerCellCopied', { column, value }));
            } catch (error) {
                showError(msg('dataViewerCellCopyFailed', { error: error.message }));
            }
        } else if (message.type === 'autoFitColumn') {
            const fitTicket = tracker.begin(REQUEST_KINDS.AUTOFIT, {
                filterText: message.filterText || ''
            });
            try {
                let value;
                if (mode === 'file') {
                    value = await directDtaStore.getColumnAutoFitValue(
                        tracker.filePath,
                        message.column,
                        message.filterText || ''
                    );
                } else if (_consoleSnapshot.pinned && _consoleSnapshot.entry) {
                    value = await consoleStore.getColumnAutoFitValue(
                        _consoleSnapshot.entry,
                        message.column,
                        message.filterText || ''
                    );
                } else {
                    value = await consoleStore.getLiveColumnAutoFitValue(
                        message.column,
                        message.filterText || ''
                    );
                }
                // Discard an auto-fit computed for a filter/dataset/file the
                // panel is no longer showing. This is deliberately per panel:
                // two .dta panels may be open at once.
                if (!tracker.isCurrent(fitTicket)) {
                    return;
                }
                tracker.apply(fitTicket);
                panel.webview.postMessage({
                    type: 'autoFitColumnResult',
                    column: message.column,
                    colIndex: message.colIndex,
                    value
                });
            } catch (error) {
                console.error('Stata All in One: auto-fit column failed:', error.message);
                tracker.apply(fitTicket);
            }
        }
    });

    return panel;
}

// ── handle lazy-load more rows ─────────────────────────────────────────────────
async function handleLoadWindow(mode, message, targetPanel) {
    // The panel that issued the request is passed in explicitly; falling back to
    // the mode-global panel is only a safety net for legacy callers.
    const panel = targetPanel || _panels[mode];
    if (!panel) return;

    const tracker = _viewTrackers.peek(panel);
    if (!tracker || tracker.isClosed()) return;

    if (mode === 'console' && !_consoleSnapshot.pinned && isConsoleRunning()) {
        showInfo(msg('consoleBusyAction'));
        return;
    }

    const startObs = Number(message.startObs) || 0;
    const count = Number(message.count) || 500;
    const filterText = message.filterText || '';
    // Do not fetch the same window twice while it is already loading, and do not
    // fetch at all once the view moved on to another filter/data version.
    const windowKey = `${filterText}\u0000${startObs}\u0000${count}\u0000${tracker.dataVersion}`;
    if (!tracker.beginWindow(windowKey)) {
        return;
    }
    const pageTicket = tracker.begin(REQUEST_KINDS.PAGE, { filterText });

    const currentView = () => tracker.isCurrent(pageTicket);

    // File mode is backed by the local DTA parser and never calls Stata.
    if (mode === 'file') {
        try {
            const rows = await directDtaStore.getMore(tracker.filePath, startObs, count, filterText);
            if (!currentView()) return;
            tracker.apply(pageTicket);
            panel.webview.postMessage({
                type: rows.length ? 'setWindow' : 'loadMoreDone',
                rows,
                windowStart: startObs,
                hasMore: rows.length >= count
            });
        } catch (error) {
            if (!currentView()) return;
            tracker.apply(pageTicket);
            panel.webview.postMessage({ type: 'loadMoreDone', hasMore: false });
            showError(error.message);
        } finally {
            tracker.endWindow(windowKey);
        }
        return;
    }

    // Console mode: fetch more rows from the active Stata session
    try {
        const rows = _consoleSnapshot.pinned && _consoleSnapshot.entry
            ? await consoleStore.getMore(_consoleSnapshot.entry, startObs, count, filterText)
            : await consoleStore.getLiveMore(startObs, count, filterText);
        if (!currentView()) return;
        tracker.apply(pageTicket);
        if (rows && rows.length > 0) {
            panel.webview.postMessage({
                type: 'setWindow',
                rows,
                windowStart: startObs,
                hasMore: rows.length >= count
            });
        } else {
            panel.webview.postMessage({ type: 'loadMoreDone', hasMore: false });
        }
    } catch (e) {
        console.error('Stata All in One: loadMore failed:', e.message);
        if (!currentView()) return;
        tracker.apply(pageTicket);
        panel.webview.postMessage({ type: 'loadMoreDone', hasMore: false });
    } finally {
        tracker.endWindow(windowKey);
    }
}

// ── broadcast variables to all active panels ───────────────────────────────────
function postVariables() {
    const vars = variableSuggestions.getActiveVariables();
    for (const mode of ['console', 'file']) {
        const p = _panels[mode];
        if (p) {
            try { p.webview.postMessage({ type: 'variablesUpdate', variables: vars }); } catch (_e) {}
        }
    }
}

const variableSuggestionSubscription = variableSuggestions.onDidChangeVariables(() => {
    postVariables();
});

function requestPanelRefresh(mode, filterText, preservePosition) {
    const panel = _panels[mode];
    if (!panel || !_ready[mode]) return false;
    if (mode === 'console') {
        _dirty.console = false;
    }
    panel.webview.postMessage({
        type: 'requestRefresh',
        filterText: filterText || '',
        preservePosition: Boolean(preservePosition),
        viewport: preservePosition ? _lastViewport[mode] : null
    });
    return true;
}

// ── get or create a panel for the given mode ───────────────────────────────────
function ensurePanel(mode) {
    if (_panels[mode]) {
        _panels[mode].title = getPanelTitle();
        return _panels[mode];
    }
    const panel = vscode.window.createWebviewPanel(
        PANEL_VIEW_TYPE,
        getPanelTitle(),
        mode === 'console' ? getConsoleViewColumn() : vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            enableServiceWorker: false,
            localResourceRoots: [CODICON_RESOURCE_ROOT]
        }
    );
    return attachPanel(panel, mode);
}

// ── refresh data for a specific mode ───────────────────────────────────────────
//
// Returns a structured result so callers (the Data Viewer button and the browse
// command router) can distinguish "the panel opened" from "the data was read",
// and can tell a failed read apart from an empty dataset.
async function refreshDataViewer(mode, filterText, targetPanel, options = {}) {
    const panel = targetPanel || _panels[mode];
    if (!panel) {
        return { success: false, status: VIEWER_STATUS.READ_FAILED, reason: 'panel-not-ready', mode };
    }
    const tracker = _viewTrackers.peek(panel);
    if (!tracker || tracker.isClosed()) {
        return { success: false, status: VIEWER_STATUS.READ_FAILED, reason: 'panel-closed', mode };
    }
    if (!_readyFor(panel)) {
        return { success: false, status: VIEWER_STATUS.READ_FAILED, reason: 'panel-not-ready', mode };
    }
    if (isFilterMissingIf(filterText)) {
        showError(msg('dataViewerFilterRequiresIf', { expression: filterText }));
        panel.webview.postMessage({ type: 'setStatus', status: 'ready' });
        panel.webview.postMessage({
            type: 'setData',
            data: {
                status: VIEWER_STATUS.READ_FAILED,
                error: msg('dataViewerFilterRequiresIf', { expression: filterText }),
                filterText: _pendingFilter[mode],
                keepPreviousView: true
            }
        });
        return {
            success: false,
            status: VIEWER_STATUS.READ_FAILED,
            reason: 'invalid-filter',
            error: msg('dataViewerFilterRequiresIf', { expression: filterText }),
            mode
        };
    }
    _pendingFilter[mode] = filterText || '';

    // Collapse a burst of refreshes for the SAME view (a doubled scroll, a
    // resize, a re-entrant activation) into the read that is already running.
    // Different filters still supersede each other below, which is what makes an
    // older read unable to overwrite a newer one.
    const requestedFilter = filterText || '';
    if (tracker.isPending(REQUEST_KINDS.REFRESH)
        && tracker.filterText === requestedFilter
        && tracker.dataVersion === _dataVersionFor(mode)) {
        return {
            success: false,
            status: VIEWER_STATUS.STALE,
            mode,
            filterText: requestedFilter,
            reason: 'already-loading'
        };
    }

    // A new refresh supersedes pagination and auto-fit for the same panel, and
    // cancels the read the old request had already started.
    tracker.supersede([REQUEST_KINDS.PAGE, REQUEST_KINDS.AUTOFIT]);
    const signal = beginPanelWork(panel);
    const refreshTicket = tracker.begin(REQUEST_KINDS.REFRESH, { filterText: requestedFilter });
    panel.webview.postMessage({ type: 'setStatus', status: 'loading' });
    const viewport = options.viewport || null;
    const requestedRow = viewport
        ? Math.max(0, Math.floor(Number(viewport.rowIndex) || 0))
        : 0;
    const windowStart = Math.max(0, requestedRow - VIEW_WINDOW_LEAD);

    // This read is retried once when a data change superseded it, so a panel can
    // never be stranded on "Loading..." with a result that was thrown away.
    let retriedAfterSupersede = Boolean(options.retriedAfterSupersede);
    const finishSuperseded = () => {
        // A newer refresh already owns this panel: stay quiet so it can render.
        if (tracker.hasNewerPending(REQUEST_KINDS.REFRESH, refreshTicket)) {
            return {
                success: false,
                status: VIEWER_STATUS.STALE,
                mode,
                filterText: filterText || '',
                reason: 'superseded'
            };
        }
        // A data-version change can stale this very request without creating
        // a replacement. Clear its pending slot before retrying; otherwise the
        // duplicate-read guard rejects the retry and leaves "Loading" visible.
        if (tracker.isPending(REQUEST_KINDS.REFRESH)) {
            tracker.supersede([REQUEST_KINDS.REFRESH]);
        }
        panel.webview.postMessage({ type: 'setStatus', status: 'ready' });
        if (retriedAfterSupersede || tracker.isClosed()) {
            // Giving up: tell the panel explicitly instead of leaving a spinner.
            panel.webview.postMessage({
                type: 'setData',
                data: {
                    status: VIEWER_STATUS.STALE,
                    error: msg('dataViewerReadCancelled'),
                    filterText: _pendingFilter[mode],
                    keepPreviousView: true
                }
            });
            return {
                success: false,
                status: VIEWER_STATUS.STALE,
                mode,
                filterText: filterText || '',
                reason: 'superseded'
            };
        }
        // The data changed underneath this read (or the user moved on to another
        // filter): read the CURRENT state rather than this read's stale one.
        retriedAfterSupersede = true;
        return refreshDataViewer(mode, tracker.filterText, panel, {
            ...options,
            retriedAfterSupersede: true
        });
    };

    try {
        let data;
        if (mode === 'file') {
            data = await directDtaStore.getSnapshot(
                tracker.filePath,
                VIEW_WINDOW_SIZE,
                filterText || '',
                false,
                windowStart,
                { signal }
            );
        } else if (_consoleSnapshot.pinned && _consoleSnapshot.entry) {
            data = await consoleStore.getSnapshot(
                _consoleSnapshot.entry,
                filterText || '',
                windowStart,
                VIEW_WINDOW_SIZE
            );
        } else {
            // Console mode: read a bounded window out of Stata's memory and use
            // the same local engine as external files for paging and filtering.
            data = await consoleStore.getLiveSnapshot(
                filterText || '',
                windowStart,
                VIEW_WINDOW_SIZE
            );
        }
        // Drop a result that a newer refresh, a filter change or a close has
        // already superseded: an older response must never overwrite a newer one.
        if (!tracker.apply(refreshTicket)) {
            return finishSuperseded();
        }
        const status = classifySnapshot(data, { filterText });
        if (mode === 'console' && data && Array.isArray(data.allVarNames) && data.allVarNames.length) {
            variableSuggestions.setMemoryVars(getDatasetVariableCandidates(data));
        }
        if (data) {
            _datasetAutocompleteVariables[mode] = getDatasetVariableCandidates(data);
            data.variableSuggestions = variableSuggestions.getActiveVariables();
            data.status = status;
        }
        panel.webview.postMessage({ type: 'setData', data, viewport });
        if (mode === 'console') {
            _dirty.console = false;
        }
        panel.webview.postMessage({ type: 'setStatus', status: 'ready' });
        return {
            // Only a status that keeps showing a previous view means the READ
            // failed. An empty dataset, zero observations and an empty filter
            // match are successful reads of an empty view, and must not be
            // reported as failures (which would abort the surrounding run).
            success: !keepsPreviousView(status),
            status,
            readFailed: keepsPreviousView(status),
            mode,
            filterText: filterText || '',
            data
        };
    } catch (e) {
        // A superseded request reports nothing: its failure is no longer
        // relevant to what the panel is showing.
        if (!tracker.isCurrent(refreshTicket)) {
            return finishSuperseded();
        }
        tracker.apply(refreshTicket);
        if (e && e.cancelled) {
            // Superseded work reports nothing; the replacing request owns the UI.
            return finishSuperseded();
        }
        const status = classifyError(e);
        console.error('Stata All in One: refresh failed:', status, e.message);
        // Keep whatever is on screen, but tell the user it was not updated.
        panel.webview.postMessage({
            type: 'setData',
            data: {
                status,
                error: e.message || msg('dataViewerReadFailed'),
                filterText: _pendingFilter[mode],
                keepPreviousView: true
            }
        });
        if (mode === 'console') {
            _dirty.console = true;
        }
        panel.webview.postMessage({ type: 'setStatus', status: 'ready' });
        return {
            success: false,
            status,
            readFailed: true,
            mode,
            filterText: filterText || '',
            error: e.message || msg('dataViewerReadFailed'),
            keepPreviousView: true
        };
    }
}

// ── console data viewer entry point ────────────────────────────────────────────
async function reveal(filterText, options = {}) {
    revealSequence += 1;
    const sequence = revealSequence;
    lastRevealResult = null;
    if (!options.allowWhileRunning && isConsoleRunning()) {
        showInfo(msg('consoleBusyAction'));
        lastRevealResult = {
            success: false,
            status: VIEWER_STATUS.READ_FAILED,
            mode: 'console',
            reason: 'console-busy',
            error: msg('consoleBusyAction'),
            sequence
        };
        return null;
    }
    _pendingFilter.console = filterText || '';
    const preservePosition = !_pendingFilter.console.trim();
    if (!preservePosition) {
        _lastViewport.console = null;
    }
    _dirty.console = true;
    if (!options.captureSnapshot) {
        _consoleSnapshot.pinned = false;
        _consoleSnapshot.data = null;
        if (_consoleSnapshot.entry) consoleStore.dispose(_consoleSnapshot.entry).catch(() => {});
        _consoleSnapshot.entry = null;
    }
    let snapshotFailure = null;
    if (options.captureSnapshot) {
        try {
            if (_consoleSnapshot.entry) await consoleStore.dispose(_consoleSnapshot.entry);
            _consoleSnapshot.entry = await consoleStore.captureSnapshot(_pendingFilter['console']);
            _consoleSnapshot.data = _consoleSnapshot.entry.view;
            _consoleSnapshot.pinned = Boolean(_consoleSnapshot.data && !_consoleSnapshot.data.error);
        } catch (error) {
            _consoleSnapshot.pinned = false;
            _consoleSnapshot.data = null;
            _consoleSnapshot.entry = null;
            snapshotFailure = {
                status: classifyError(error),
                error: error.message || msg('dataViewerReadFailed')
            };
        }
    }
    const panel = ensurePanel('console');
    ensureDataChangeSubscription();
    _nextActivationPreserve.console = preservePosition;
    activateDataViewerTab();
    if (_ready.console && _dirty.console) {
        const refreshResult = await refreshDataViewer(
            'console',
            _pendingFilter.console,
            panel,
            { viewport: preservePosition ? _lastViewport.console : null }
        );
        lastRevealResult = {
            ...(snapshotFailure
                ? { success: false, mode: 'console', ...snapshotFailure }
                : refreshResult),
            sequence
        };
        return panel;
    }
    lastRevealResult = {
        ...(snapshotFailure
            ? { success: false, mode: 'console', ...snapshotFailure }
            // Panel opened; its data arrives on the webview 'ready' round-trip.
            : { success: true, status: VIEWER_STATUS.OK, mode: 'console', pending: true }),
        sequence
    };
    return panel;
}

/**
 * Result of the most recent console reveal/refresh.
 *
 * revealDataViewer keeps returning the panel (existing callers depend on it),
 * and the browse command router reads this to learn whether the read that backs
 * the freshly opened panel actually succeeded.
 */
let lastRevealResult = null;
let revealSequence = 0;

/**
 * Result of the most recent reveal, or null when the reveal did not run to
 * completion (for example the Console was busy). Callers compare `sequence`
 * against the value they read before requesting the reveal, so an earlier
 * request's outcome can never be attributed to a later one.
 */
function getLastRevealResult() {
    return lastRevealResult;
}

function getRevealSequence() {
    return revealSequence;
}

// ── external update trigger (e.g., after running code in console) ──────────────

/**
 * Mark the Console data as no longer current, CHEAPLY and idempotently.
 *
 * Called whenever a command that may have changed Stata's data starts running —
 * including commands that fail or are interrupted, because a partially applied
 * command has already changed the data. This only bumps the cache generation
 * and flags the panel dirty; the actual capture happens on the next read.
 */
function markConsoleDataStale() {
    // Every open view (console AND file panels) may be affected: a command that
    // changed Stata's memory also invalidates any pending file read result that
    // was computed against the older data version.
    const hasPinnedSnapshot = Boolean(_consoleSnapshot.pinned && _consoleSnapshot.entry);
    bumpDataVersion();
    for (const panel of [_panels.console, _panels.file]) {
        if (panel && !(panel === _panels.console && hasPinnedSnapshot)) {
            cancelPanelWork(panel);
        }
    }
    consoleStore.invalidateLive().catch(() => {});
    if (!hasPinnedSnapshot) {
        if (_consoleSnapshot.entry) {
            consoleStore.dispose(_consoleSnapshot.entry).catch(() => {});
        }
        _consoleSnapshot.pinned = false;
        _consoleSnapshot.data = null;
        _consoleSnapshot.entry = null;
        _dirty.console = true;
    }
}

async function updateData() {
    markConsoleDataStale();
    await consoleStore.invalidateLive();
}

// Subscribe once per extension host: any command that reaches the engine can
// change the data the viewer is showing.
let _dataChangeSubscription = null;
let _sessionLostSubscription = null;

function ensureDataChangeSubscription() {
    if (_dataChangeSubscription) {
        return _dataChangeSubscription;
    }
    try {
        const session = require('../session');
        if (typeof session.onDidChangeData === 'function') {
            _dataChangeSubscription = session.onDidChangeData(() => {
                markConsoleDataStale();
            });
        }
        if (typeof session.onDidLoseSession === 'function') {
            // A lost session is NOT the same as a brand-new empty one: say so
            // instead of letting an empty viewer look like the old dataset.
            _sessionLostSubscription = session.onDidLoseSession(() => {
                markConsoleDataStale();
                const panel = _panels.console;
                if (!panel) return;
                panel.webview.postMessage({
                    type: 'setData',
                    data: {
                        status: VIEWER_STATUS.SESSION_UNAVAILABLE,
                        error: msg('dataViewerSessionLost'),
                        filterText: _pendingFilter.console,
                        keepPreviousView: true
                    }
                });
            });
        }
    } catch (_error) {
        _dataChangeSubscription = _dataChangeSubscription || null;
    }
    return _dataChangeSubscription;
}

async function resetConsoleData() {
    await consoleStore.resetLive();
    if (_consoleSnapshot.entry) {
        await consoleStore.dispose(_consoleSnapshot.entry);
    }
    _consoleSnapshot.pinned = false;
    _consoleSnapshot.data = null;
    _consoleSnapshot.entry = null;
    _pendingFilter.console = '';
    _dirty.console = false;
    _lastViewport.console = null;
    _datasetAutocompleteVariables.console = [];

    const panel = _panels.console;
    if (panel) {
        panel.webview.postMessage({
            type: 'setData',
            data: {
                info: { observations: 0, variables: 0 },
                vars: [],
                dataColumns: [],
                dataRows: [],
                filterText: ''
            }
        });
    }
}

function setDataViewerFontSize(fontSize) {
    const value = Number(fontSize);
    _fontSize = Number.isFinite(value) && value >= 6 ? Math.min(72, value) : 14;
    for (const mode of ['console', 'file']) {
        const panel = _panels[mode];
        if (!panel) continue;
        panel.webview.postMessage({
            type: 'fontSize',
            value: `${_fontSize}px`
        });
    }
}

// ── open a .dta file in its own independent data viewer ────────────────────────
async function openDtaFile(context, uri, panel) {
    if (!uri || uri.scheme !== 'file') {
        return null;
    }

    // File mode gets its own panel, independent of the console data viewer
    const targetPanel = panel
        ? attachPanel(panel, 'file')
        : ensurePanel('file');
    targetPanel.reveal(undefined, true);

    const filePath = uri.fsPath;
    const tracker = _viewTrackers.acquire(targetPanel, { mode: 'file', filePath });
    tracker.setDataVersion(_dataVersion);
    const ticket = tracker.begin(REQUEST_KINDS.REFRESH, { filterText: '' });
    try {
        const data = await directDtaStore.getSnapshot(filePath, 500, '');
        if (!tracker.apply(ticket)) {
            // The panel moved on (another file, another filter, or it closed).
            // Note: NOT `_panels.file !== targetPanel` — `_panels.file` only
            // remembers the most recently attached .dta panel, so opening a
            // second file would strand the first one on its loading screen.
            return targetPanel;
        }
        if (data && !data.error) {
            _datasetAutocompleteVariables.file = getDatasetVariableCandidates(data);
            data.variableSuggestions = variableSuggestions.getActiveVariables();
            data.status = classifySnapshot(data, { filterText: '' });
            // Send initial data immediately — webview processes setData before ready message
            targetPanel.webview.postMessage({ type: 'setData', data });
        } else if (data && data.error) {
            showError(data.error);
        }
    } catch (e) {
        if (tracker.isCurrent(ticket)) {
            tracker.apply(ticket);
            const status = classifyError(e);
            console.error('Stata All in One: Failed to open .dta file:', status, e.message);
            targetPanel.webview.postMessage({
                type: 'setData',
                data: {
                    status,
                    error: e.message || msg('dataViewerReadFailed'),
                    keepPreviousView: false
                }
            });
        }
    }

    variableSuggestions.refreshMemoryVars(context).catch(() => {});
    return targetPanel;
}

// ── exports ────────────────────────────────────────────────────────────────────
module.exports = {
    revealDataViewer: reveal,
    activateDataViewerTab,
    getLastRevealResult,
    getRevealSequence,
    openDtaFileInDataViewer: openDtaFile,
    updateDataViewerData: updateData,
    resetConsoleDataViewer: resetConsoleData,
    markConsoleDataStale,
    setDataViewerFontSize,
    getDataViewerPanel: () => _panels['console'],
    getPanelViewType: () => PANEL_VIEW_TYPE,
    postDataViewerVariables: postVariables,
    disposeVariableSuggestionSubscription: () => variableSuggestionSubscription.dispose(),
    cancelPanelWork
};
