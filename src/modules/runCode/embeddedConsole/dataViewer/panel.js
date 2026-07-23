const vscode = require('vscode');
const directDtaStore = require('./directDtaStore');
const consoleStore = require('./consoleStore');
const { msg, showInfo, showError } = require('../../../../utils/common');
const { StataTerminalRenderer, getWebviewThemeVariables } = require('../renderer');
const variableSuggestions = require('../../../variableSuggestionService');

const PANEL_VIEW_TYPE = 'stata-all-in-one.dataViewer';

// Two independent panels: 'console' (from console data button) and 'file' (from .dta click)
const _panels = { console: null, file: null };
const _ready = { console: false, file: false };
const _pendingFilter = { console: '', file: '' };
const _consoleSnapshot = { pinned: false, data: null, entry: null };
const _filePaths = new WeakMap();
const _renderer = new StataTerminalRenderer();

const CODICON_RESOURCE_ROOT = vscode.Uri.joinPath(vscode.Uri.file(vscode.env.appRoot), 'out', 'media');

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
    const iconUri = vscode.Uri.joinPath(extUri, 'img', 'tab-icon.svg');
    return { light: iconUri, dark: iconUri };
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
    const codiconFontUri = getCodiconFontUri(webview);
    const themeVars = getWebviewThemeVariables();
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escHtml(msg('dataViewerPanelTitle'))}</title>
    <style>
        :root {
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
            font-size: var(--vscode-editor-font-size, 13px);
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
            font-size: var(--vscode-editor-font-size, 13px);
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
            font-size: var(--vscode-editor-font-size, 13px);
            line-height: 1.5;
            min-width: 160px;
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
            font-size: var(--vscode-editor-font-size, 13px);
        }
        #table-data, #table-vars {
            table-layout: fixed;
        }
        #table-vars {
            min-width: unset;
        }
        #table-vars th {
            /* sticky from th rule; absolute children position against sticky too */
        }
        th, td {
            padding: 4px 10px;
            text-align: left;
            white-space: nowrap;
            line-height: 20px;
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
            width: 56px;
            min-width: 56px;
            max-width: 56px;
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
        body:not(.data-tab-active) #filter-btn {
            display: none;
        }
        body:not(.data-tab-active) .filter-row {
            display: none;
        }
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
            font-size: var(--vscode-editor-font-size, 13px);
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
        <div class="loading-state" id="loading-msg">${escHtml(msg('dataViewerLoading'))}</div>
        <div class="tab-content active" id="content-vars">
            <div class="empty-state" id="empty-vars">${escHtml(msg('dataViewerNoDataset'))}</div>
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

        document.querySelectorAll('.tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                switchTab(this.dataset.tab);
            });
        });

        document.getElementById('refresh-btn').addEventListener('click', function () {
            resetColumnWidthsForRefresh();
            requestRefresh();
        });
        document.getElementById('filter-btn').addEventListener('click', function () {
            document.body.classList.toggle('filter-open');
            if (document.body.classList.contains('filter-open')) {
                filterInput.focus();
                updateFilterHighlight();
            } else {
                hideFilterAutocomplete();
            }
            syncFilterUi();
        });
        document.getElementById('filter-apply-btn').addEventListener('click', function () {
            requestRefresh();
            filterInput.focus();
        });
        document.getElementById('filter-clear-btn').addEventListener('click', function () {
            filterInput.value = '';
            updateFilterHighlight();
            hideFilterAutocomplete();
            requestRefresh();
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
            updateFilterHighlight();
            triggerFilterAutocomplete();
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
                    updateFilterHighlight();
                    requestRefresh();
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
                requestRefresh();
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
            currentTab = name;
            document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
            document.getElementById('tab-' + name).classList.add('active');
            document.getElementById('content-' + name).classList.add('active');
            if (name !== 'data') {
                hideFilterAutocomplete();
            }
            syncFilterUi();
            scheduleDataRender(false);
            scheduleAutoLoadCheck();
            scheduleOverflowTitleUpdate();
        }

        function syncFilterUi() {
            document.body.classList.toggle('data-tab-active', currentTab === 'data');
            filterIcon.className = 'refresh-icon ' + (document.body.classList.contains('filter-open') ? 'codicon-filter-filled' : 'codicon-filter');
        }

        function requestRefresh() {
            loadedRows = 0;
            hasMoreRows = true;
            vscode.postMessage({ type: 'refresh', filterText: filterInput.value || '' });
        }

        function getCurrentFilterWord() {
            var text = filterInput.value || '';
            var pos = filterInput.selectionStart || 0;
            var start = pos;
            while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) start--;
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
            filterAutocomplete.innerHTML = '';
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
                text.textContent = label;
                item.appendChild(text);
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

        function hideFilterAutocomplete() {
            filterAutocomplete.classList.remove('visible');
            filterAutocomplete.innerHTML = '';
            filterAutocompleteIndex = -1;
            filterAutocompleteVisible = false;
        }

        function applyFilterAutocomplete(value, wordStart) {
            var text = filterInput.value || '';
            var pos = filterInput.selectionStart || 0;
            var wordEnd = pos;
            while (wordEnd < text.length && /[A-Za-z0-9_]/.test(text[wordEnd])) wordEnd++;
            filterInput.value = text.slice(0, wordStart) + value + ' ' + text.slice(wordEnd);
            filterInput.selectionStart = filterInput.selectionEnd = wordStart + value.length + 1;
            hideFilterAutocomplete();
            updateFilterHighlight();
        }

        function triggerFilterAutocomplete() {
            var current = getCurrentFilterWord();
            if (!current.word) {
                hideFilterAutocomplete();
                return;
            }
            var prefix = current.word.toLowerCase();
            var keywords = ['if', 'in', 'nolabel'];
            var variables = mergeVariableLists(autocompleteVariables, sharedAutocompleteVariables);
            var matches = [];
            var seen = {};
            for (var i = 0; i < keywords.length && matches.length < 8; i++) {
                var kw = keywords[i];
                var kwk = kw.toLowerCase();
                if (kwk.indexOf(prefix) === 0 && !seen[kwk]) {
                    seen[kwk] = true;
                    matches.push({ label: kw, kind: 'cmd' });
                }
            }
            for (var i = 0; i < variables.length && matches.length < 8; i++) {
                var v = variables[i];
                var vk = v.toLowerCase();
                if (vk.indexOf(prefix) === 0 && !seen[vk]) {
                    seen[vk] = true;
                    matches.push({ label: v, kind: 'var' });
                }
            }
            if (matches.length === 1 && matches[0].label.toLowerCase() === prefix) {
                hideFilterAutocomplete();
                return;
            }
            showFilterAutocomplete(matches, current.start);
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
            var parts = text.split(/([A-Za-z_][A-Za-z0-9_]*)/);
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
            document.getElementById('table-vars').style.display = hasData ? '' : 'none';
            document.getElementById('empty-data').style.display = hasData ? 'none' : '';
            document.getElementById('data-table-container').style.display = hasData ? '' : 'none';
        }

        function renderVars(vars) {
            var tbody = document.getElementById('table-vars').querySelector('tbody');
            tbody.innerHTML = '';
            for (var i = 0; i < vars.length; i++) {
                var v = vars[i];
                var tr = document.createElement('tr');
                appendVarsCell(tr, 'var-name', v.name);
                appendVarsCell(tr, 'var-type', displayValue(v.type));
                appendVarsCell(tr, 'var-format', displayValue(v.format));
                appendVarsCell(tr, 'var-label', displayValue(v.label || v.valueLabel));
                tbody.appendChild(tr);
            }
            autoSizeVarsColumns();
            scheduleOverflowTitleUpdate();
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
        var virtualRowHeight = 28;
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
        var rowNumberColumnWidth = 56;
        function getColWidth(i) { return i >= 0 && i < columnWidths.length ? columnWidths[i] : defaultColWidth; }
        function getCumulWidth(end) { var s = 0; for (var i = 0; i < end && i < dataColumnsCache.length; i++) s += getColWidth(i); return s; }
        function getColumnAtX(x) { var cumul = 0; for (var i = 0; i < dataColumnsCache.length; i++) { cumul += getColWidth(i); if (cumul > x) return i; } return Math.max(0, dataColumnsCache.length - 1); }
        var virtualRenderQueued = false;
        var lastVirtualStart = -1;
        var lastVirtualEnd = -1;
        var lastVirtualColStart = -1;
        var lastVirtualColEnd = -1;
        var totalObs = 0;
        var loadedRows = 0;
        var loadingMore = false;
        var hasMoreRows = true;
        var pageSize = 500;
        var preloadRowBuffer = 100;

        function resetColumnWidthsForRefresh() {
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
                    var value = col < values.length ? displayValue(values[col]) : '';
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
            contentEl.scrollTop = 0;
            contentEl.scrollLeft = 0;
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
            hasMoreRows = true;
            setLoadingMore(false);
        }

        function updateDataTableWidth(table) {
            var dataTable = table || document.getElementById('table-data');
            dataTable.style.width = Math.max(contentEl.clientWidth, rowNumberColumnWidth + getCumulWidth(dataColumnsCache.length)) + 'px';
        }

        function appendDataRows(rows) {
            if (!Array.isArray(rows) || !rows.length) {
                setLoadingMore(false);
                return;
            }
            Array.prototype.push.apply(dataRowsCache, rows);
            loadedRows += rows.length;
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
            var firstVisible = Math.floor(contentEl.scrollTop / virtualRowHeight);
            var visibleCount = Math.ceil(contentEl.clientHeight / virtualRowHeight) + virtualOverscan * 2;
            var start = Math.max(0, firstVisible - virtualOverscan);
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
            appendSpacerRow(fragment, start * virtualRowHeight, columnRange.start, columnRange.end);
            for (var r = start; r < end; r++) {
                fragment.appendChild(createDataRow(dataRowsCache[r], columnRange.start, columnRange.end));
            }
            appendSpacerRow(fragment, Math.max(0, (dataRowsCache.length - end) * virtualRowHeight), columnRange.start, columnRange.end);
            tbody.innerHTML = '';
            tbody.appendChild(fragment);
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
                var val = v < vals.length ? displayValue(vals[v]) : '';
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
                var value = colIndex < values.length ? displayValue(values[colIndex]) : '';
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
            var newWidth = Math.max(colMinWidth, resizeStartWidth + delta);
            if (resizeTable === 'vars') {
                varsColumnManualWidths[resizeCol] = true;
                setVarsColumnWidth(resizeCol, newWidth);
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
            if (resizeTable === 'data') {
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
            if (loadingMore || !hasMoreRows || (totalObs > 0 && loadedRows >= totalObs)) return;
            setLoadingMore(true);
            vscode.postMessage({ type: 'loadMore', startObs: loadedRows, count: pageSize, filterText: filterInput.value || '' });
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
            if (loadingMore || !hasMoreRows || (totalObs > 0 && loadedRows >= totalObs)) return;
            var firstVisibleRow = getFirstVisibleDataRow();
            if (firstVisibleRow > 0 && firstVisibleRow >= loadedRows - preloadRowBuffer) {
                requestLoadMore();
                return;
            }
            var distanceToBottom = contentEl.scrollHeight - contentEl.scrollTop - contentEl.clientHeight;
            if (distanceToBottom <= 300) {
                requestLoadMore();
            }
        }

        function getFirstVisibleDataRow() {
            if (!dataRowsCache.length) return 0;
            return Math.min(dataRowsCache.length, Math.max(1, Math.floor(contentEl.scrollTop / virtualRowHeight) + 1));
        }
        contentEl.addEventListener('scroll', function () {
            renderVisibleDataRows();
            scheduleAutoLoadCheck();
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

        function displayValue(value) {
            if (value === null || value === undefined) return '.';
            var s = String(value).trim();
            if (s === '' || /^nan$/i.test(s)) return '.';
            return String(value);
        }

        function setData(data) {
            document.body.classList.remove('loading');
            document.getElementById('loading-msg').style.display = 'none';
            if (data.filterText !== undefined) {
                filterInput.value = data.filterText || '';
                document.body.classList.toggle('filter-open', !!filterInput.value);
                if (filterInput.value) {
                    switchTab('data');
                }
                updateFilterHighlight();
            }
            var hasData = data.vars && data.vars.length > 0;
            showEmpty(hasData);
            if (!hasData) {
                sharedAutocompleteVariables = data.variableSuggestions || sharedAutocompleteVariables;
                autocompleteVariables = mergeVariableLists(sharedAutocompleteVariables);
                updateFilterHighlight();
                document.getElementById('info-bar').textContent = ${JSON.stringify(msg('dataViewerNoDataset'))};
                return;
            }
            renderVars(data.vars);
            sharedAutocompleteVariables = data.variableSuggestions || sharedAutocompleteVariables;
            autocompleteVariables = mergeVariableLists(data.allVarNames || data.dataColumns || [], sharedAutocompleteVariables);
            updateFilterHighlight();
            renderDataHeader(data.dataColumns, getVarTypeMap(data.vars || []));
            totalObs = (data.info && data.info.observations) || 0;
            appendDataRows(data.dataRows || []);
            setLoadingMore(false);
            renderInfo(data.info || {});
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
                setData(message.data || {});
            } else if (message.type === 'appendRows') {
                hasMoreRows = message.hasMore !== false;
                appendDataRows(message.rows || []);
            } else if (message.type === 'loadMoreDone') {
                hasMoreRows = message.hasMore !== false;
                setLoadingMore(false);
            } else if (message.type === 'filterHighlightResult') {
                renderFilterHighlight(message.segments || []);
            } else if (message.type === 'setStatus') {
                // Could show loading indicator
            } else if (message.type === 'variablesUpdate') {
                sharedAutocompleteVariables = message.variables || [];
                autocompleteVariables = mergeVariableLists(dataColumnsCache, sharedAutocompleteVariables);
                updateFilterHighlight();
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
            syncFilterUi();
            vscode.postMessage({ type: 'ready' });
        }, 100);
    </script>
</body>
</html>`;
}

// ── attach a webview panel with mode-specific message handlers ─────────────────
function attachPanel(panel, mode) {
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

    panel.onDidDispose(() => {
        if (_panels[mode] === panel) {
            _panels[mode] = null;
            _ready[mode] = false;
            if (mode === 'file') {
                const filePath = _filePaths.get(panel);
                if (filePath) directDtaStore.dispose(filePath);
                _filePaths.delete(panel);
            } else {
                _consoleSnapshot.pinned = false;
                _consoleSnapshot.data = null;
                if (_consoleSnapshot.entry) consoleStore.dispose(_consoleSnapshot.entry).catch(() => {});
                _consoleSnapshot.entry = null;
                consoleStore.invalidateLive().catch(() => {});
            }
        }
    });

    panel.webview.onDidReceiveMessage(async (message) => {
        if (!message) return;

        if (message.type === 'ready') {
            _ready[mode] = true;
            await refreshDataViewer(mode, _pendingFilter[mode], panel);
        } else if (message.type === 'refresh') {
            const terminal = require('../panel');
            if (mode === 'console' && !(_consoleSnapshot.pinned) && terminal.isWebviewTerminalRunning && terminal.isWebviewTerminalRunning()) {
                showInfo(msg('consoleBusyAction'));
                return;
            }
            await refreshDataViewer(mode, message.filterText || '', panel);
        } else if (message.type === 'highlightFilter') {
            const p = _panels[mode];
            if (p) {
                p.webview.postMessage({ type: 'filterHighlightResult', segments: highlightFilterText(message.text || '') });
            }
        } else if (message.type === 'loadMore') {
            await handleLoadMore(mode, message);
        } else if (message.type === 'copyCell') {
            const column = String(message.column || '');
            const value = String(message.text || '');
            try {
                await vscode.env.clipboard.writeText(value);
                vscode.window.showInformationMessage(msg('dataViewerCellCopied', { column, value }));
            } catch (error) {
                showError(msg('dataViewerCellCopyFailed', { error: error.message }));
            }
        } else if (message.type === 'autoFitColumn') {
            try {
                let value;
                if (mode === 'file') {
                    value = await directDtaStore.getColumnAutoFitValue(
                        _filePaths.get(panel),
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
                panel.webview.postMessage({
                    type: 'autoFitColumnResult',
                    column: message.column,
                    colIndex: message.colIndex,
                    value
                });
            } catch (error) {
                console.error('Stata All in One: auto-fit column failed:', error.message);
            }
        }
    });

    return panel;
}

// ── handle lazy-load more rows ─────────────────────────────────────────────────
async function handleLoadMore(mode, message) {
    const panel = _panels[mode];
    if (!panel) return;

    const terminal = require('../panel');
    if (mode === 'console' && !_consoleSnapshot.pinned && terminal.isWebviewTerminalRunning && terminal.isWebviewTerminalRunning()) {
        showInfo(msg('consoleBusyAction'));
        return;
    }

    // File mode is backed by the local DTA parser and never calls Stata.
    if (mode === 'file') {
        try {
            const rows = await directDtaStore.getMore(_filePaths.get(panel), message.startObs || 0, message.count || 500, message.filterText || '');
            panel.webview.postMessage({ type: rows.length ? 'appendRows' : 'loadMoreDone', rows, hasMore: rows.length >= (message.count || 500) });
        } catch (error) {
            panel.webview.postMessage({ type: 'loadMoreDone', hasMore: false });
            showError(error.message);
        }
        return;
    }

    // Console mode: fetch more rows from the active Stata session
    const startObs = (message.startObs || 0) + 1;
    const count = message.count || 500;
    try {
        const rows = _consoleSnapshot.pinned && _consoleSnapshot.entry
            ? await consoleStore.getMore(_consoleSnapshot.entry, startObs, count, message.filterText || '')
            : await consoleStore.getLiveMore(startObs, count, message.filterText || '');
        if (_panels[mode]) {
            if (rows && rows.length > 0) {
                _panels[mode].webview.postMessage({ type: 'appendRows', rows, hasMore: rows.length >= count });
            } else {
                _panels[mode].webview.postMessage({ type: 'loadMoreDone', hasMore: false });
            }
        }
    } catch (e) {
        console.error('Stata All in One: loadMore failed:', e.message);
        if (_panels[mode]) {
            _panels[mode].webview.postMessage({ type: 'loadMoreDone', hasMore: true });
        }
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

// ── get or create a panel for the given mode ───────────────────────────────────
function ensurePanel(mode) {
    if (_panels[mode]) {
        _panels[mode].title = getPanelTitle();
        return _panels[mode];
    }
    const panel = vscode.window.createWebviewPanel(
        PANEL_VIEW_TYPE,
        getPanelTitle(),
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: false,
            enableServiceWorker: false,
            localResourceRoots: [CODICON_RESOURCE_ROOT]
        }
    );
    return attachPanel(panel, mode);
}

// ── refresh data for a specific mode ───────────────────────────────────────────
async function refreshDataViewer(mode, filterText, targetPanel) {
    const panel = targetPanel || _panels[mode];
    if (!panel || !_ready[mode]) return;
    _pendingFilter[mode] = filterText || '';
    panel.webview.postMessage({ type: 'setStatus', status: 'loading' });

    try {
        let data;
        if (mode === 'file') {
            data = await directDtaStore.getSnapshot(_filePaths.get(panel), 500, filterText || '');
        } else if (_consoleSnapshot.pinned && _consoleSnapshot.entry) {
            data = await consoleStore.getSnapshot(_consoleSnapshot.entry, filterText || '');
        } else {
            // Console mode: capture once, then use the same local DTA engine
            // as external files for paging and filtering.
            data = await consoleStore.getLiveSnapshot(filterText || '');
            if (data && Array.isArray(data.allVarNames) && data.allVarNames.length) {
                variableSuggestions.setMemoryVars(data.allVarNames);
            }
        }
        data.variableSuggestions = variableSuggestions.getActiveVariables();
        panel.webview.postMessage({ type: 'setData', data });
    } catch (e) {
        console.error('Stata All in One: refresh failed:', e.message);
        panel.webview.postMessage({ type: 'setData', data: { error: e.message } });
    }
    panel.webview.postMessage({ type: 'setStatus', status: 'ready' });
}

// ── console data viewer entry point ────────────────────────────────────────────
async function reveal(filterText, options = {}) {
    const terminalPanel = require('../panel');
    if (!options.allowWhileRunning && terminalPanel.isWebviewTerminalRunning && terminalPanel.isWebviewTerminalRunning()) {
        showInfo(msg('consoleBusyAction'));
        return null;
    }
    _pendingFilter['console'] = filterText || '';
    if (!options.captureSnapshot) {
        _consoleSnapshot.pinned = false;
        _consoleSnapshot.data = null;
        if (_consoleSnapshot.entry) consoleStore.dispose(_consoleSnapshot.entry).catch(() => {});
        _consoleSnapshot.entry = null;
    }
    if (options.captureSnapshot) {
        try {
            if (_consoleSnapshot.entry) await consoleStore.dispose(_consoleSnapshot.entry);
            _consoleSnapshot.entry = await consoleStore.captureSnapshot(_pendingFilter['console']);
            _consoleSnapshot.data = _consoleSnapshot.entry.view;
            _consoleSnapshot.pinned = Boolean(_consoleSnapshot.data && !_consoleSnapshot.data.error);
        } catch (error) {
            _consoleSnapshot.pinned = false;
            _consoleSnapshot.data = { error: error.message };
            _consoleSnapshot.entry = null;
        }
    }
    const panel = ensurePanel('console');
    panel.reveal(vscode.ViewColumn.Two, true);
    if (_ready['console']) {
        if (options.captureSnapshot) {
            panel.webview.postMessage({ type: 'setData', data: _consoleSnapshot.data || { error: msg('dataViewerNoDataset') } });
        } else {
            await refreshDataViewer('console', _pendingFilter['console']);
        }
    }
    return panel;
}

// ── external update trigger (e.g., after running code in console) ──────────────
async function updateData() {
    await consoleStore.invalidateLive();
    if (_consoleSnapshot.pinned) return;
    await refreshDataViewer('console', _pendingFilter['console']);
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
    _filePaths.set(targetPanel, filePath);
    try {
        const data = await directDtaStore.getSnapshot(filePath, 500, '');
        if (data && !data.error) {
            data.variableSuggestions = variableSuggestions.getActiveVariables();
            // Send initial data immediately — webview processes setData before ready message
            if (targetPanel) {
                targetPanel.webview.postMessage({ type: 'setData', data });
            }
        } else if (data && data.error) {
            showError(data.error);
        }
    } catch (e) {
        console.error('Stata All in One: Failed to export file data:', e.message);
    }

    variableSuggestions.refreshMemoryVars(context).catch(() => {});
    return targetPanel;
}

// ── exports ────────────────────────────────────────────────────────────────────
module.exports = {
    revealDataViewer: reveal,
    openDtaFileInDataViewer: openDtaFile,
    updateDataViewerData: updateData,
    resetConsoleDataViewer: resetConsoleData,
    getDataViewerPanel: () => _panels['console'],
    getPanelViewType: () => PANEL_VIEW_TYPE,
    postDataViewerVariables: postVariables,
    disposeVariableSuggestionSubscription: () => variableSuggestionSubscription.dispose()
};
