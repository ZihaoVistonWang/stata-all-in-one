const vscode = require('vscode');
const path = require('path');
const { fetchDataSnapshot, fetchMoreRows } = require('./provider');
const config = require('../../../../utils/config');
const { isWindows, isMacOS, msg, showInfo, showError } = require('../../../../utils/common');
const { StataTerminalRenderer, getWebviewThemeVariables } = require('../renderer');
const variableSuggestions = require('../../../variableSuggestionService');

const PANEL_VIEW_TYPE = 'stata-all-in-one.dataViewer';

let _panel = null;
let _pendingFilterText = '';
let _webviewReady = false;
const _renderer = new StataTerminalRenderer();

const CODICON_RESOURCE_ROOT = vscode.Uri.joinPath(vscode.Uri.file(vscode.env.appRoot), 'out', 'media');

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
            padding: 8px 0;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            margin-top: 8px;
            flex-shrink: 0;
            padding: 8px 16px;
        }
        .info-bar span {
            margin-right: 16px;
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
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let currentTab = 'vars';
        const contentEl = document.getElementById('content');
        const filterInput = document.getElementById('filter-input');
        const filterHighlight = document.getElementById('filter-highlight');
        const filterAutocomplete = document.getElementById('filter-autocomplete');
        const filterIcon = document.getElementById('filter-icon');
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
                tr.innerHTML = '<td class="var-name">' + esc(v.name) + '</td>' +
                    '<td class="var-type">' + esc(displayValue(v.type)) + '</td>' +
                    '<td class="var-format">' + esc(displayValue(v.format)) + '</td>' +
                    '<td class="var-label">' + esc(displayValue(v.label || v.valueLabel)) + '</td>';
                tbody.appendChild(tr);
            }
        }

        var dataColumnsCache = [];
        var dataColumnTypesCache = [];
        var dataRowsCache = [];
        var virtualRowHeight = 28;
        var virtualOverscan = 80;
        var columnWidths = [];
        var defaultColWidth = 120;
        var colMinWidth = 40;
        var colMaxWidth = 500;
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
            for (var i = 0; i < columns.length; i++) {
                dataColumnTypesCache.push(typeMap[columns[i]] || '');
                columnWidths.push(defaultColWidth);
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
                setVirtualColumnWidth(th2, i);
                // Resize handle
                var handle = document.createElement('div');
                handle.className = 'col-resize-handle';
                handle.setAttribute('data-col', i);
                th2.appendChild(handle);
                headerRow.appendChild(th2);
            }
            var rightSpacer = Math.max(0, getCumulWidth(dataColumnsCache.length) - getCumulWidth(colEnd));
            appendColumnSpacer(headerRow, rightSpacer, 'th');
            thead.innerHTML = '';
            thead.appendChild(headerRow);
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
        (function initVarsResize() {
            var varsTheadRow = document.querySelector('#table-vars thead tr');
            if (!varsTheadRow) return;
            var defaultWidths = [140, 80, 100, 200];
            var ths = varsTheadRow.querySelectorAll('th');
            for (var i = 0; i < ths.length; i++) {
                var w = defaultWidths[i] || 120;
                ths[i].style.width = w + 'px';
                ths[i].style.minWidth = w + 'px';
                var handle = document.createElement('div');
                handle.className = 'col-resize-handle';
                handle.setAttribute('data-table', 'vars');
                handle.setAttribute('data-col', i);
                ths[i].appendChild(handle);
            }
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
                if (h.getAttribute('data-table') === resizeTable && parseInt(h.getAttribute('data-col'), 10) === resizeCol) {
                    h.classList.add('active');
                }
            });
        }

        document.getElementById('table-data').addEventListener('mousedown', onResizeStart);
        document.getElementById('table-vars').addEventListener('mousedown', onResizeStart);

        document.addEventListener('mousemove', function (e) {
            if (resizeCol < 0 || !resizeTable) return;
            var delta = e.clientX - resizeStartX;
            var newWidth = Math.max(colMinWidth, Math.min(colMaxWidth, resizeStartWidth + delta));
            if (resizeTable === 'vars') {
                if (resizeTh) {
                    resizeTh.style.width = newWidth + 'px';
                    resizeTh.style.minWidth = newWidth + 'px';
                }
            } else {
                if (columnWidths[resizeCol] !== newWidth) {
                    columnWidths[resizeCol] = newWidth;
                    updateDataTableWidth();
                    lastVirtualColStart = -1;
                    lastVirtualColEnd = -1;
                    scheduleDataRender(true);
                }
            }
        });

        document.addEventListener('mouseup', function () {
            if (resizeCol < 0) return;
            document.body.classList.remove('col-resizing');
            document.querySelectorAll('.col-resize-handle.active').forEach(function (h) { h.classList.remove('active'); });
            resizeTable = null;
            resizeCol = -1;
            resizeTh = null;
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
            scheduleDataRender(true);
            scheduleAutoLoadCheck();
        });

        function renderInfo(info) {
            var bar = document.getElementById('info-bar');
            var parts = [];
            if (info.observations > 0) parts.push(${JSON.stringify(msg('dataViewerObs'))} + ': ' + info.observations);
            if (info.variables > 0) parts.push(${JSON.stringify(msg('dataViewerVars'))} + ': ' + info.variables);
            if (info.source) parts.push(info.source);
            if (info.sortedBy) parts.push(${JSON.stringify(msg('dataViewerSortedBy'))} + ': ' + info.sortedBy);
            bar.innerHTML = parts.map(function (p) { return '<span>' + esc(p) + '</span>'; }).join('');
        }

        function esc(s) {
            if (!s) return '';
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function displayValue(value) {
            if (value === null || value === undefined) return '';
            var s = String(value);
            return /^nan$/i.test(s.trim()) ? '.' : s;
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

function attachPanel(panel) {
    _panel = panel;
    _webviewReady = false;
    _panel.title = getPanelTitle();
    _panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [CODICON_RESOURCE_ROOT]
    };
    _panel.webview.html = getDataViewerHtml(_panel.webview);
    _panel.onDidDispose(() => {
        if (_panel === panel) {
            _panel = null;
            _webviewReady = false;
        }
    });
    _panel.webview.onDidReceiveMessage(async (message) => {
        if (message && message.type === 'ready') {
            _webviewReady = true;
            await refresh(_pendingFilterText);
        } else if (message && message.type === 'refresh') {
            await refresh(message.filterText || '');
        } else if (message && message.type === 'highlightFilter') {
            if (_panel) {
                _panel.webview.postMessage({ type: 'filterHighlightResult', segments: highlightFilterText(message.text || '') });
            }
        } else if (message && message.type === 'loadMore') {
            const startObs = (message.startObs || 0) + 1;
            const count = message.count || 500;
            try {
                const rows = await fetchMoreRows(startObs, count, message.filterText || '');
                if (_panel) {
                    if (rows && rows.length > 0) {
                        _panel.webview.postMessage({ type: 'appendRows', rows, hasMore: rows.length >= count });
                    } else {
                        _panel.webview.postMessage({ type: 'loadMoreDone', hasMore: false });
                    }
                }
            } catch (e) {
                console.error('[dataViewer] loadMore failed:', e.message);
                if (_panel) {
                    _panel.webview.postMessage({ type: 'loadMoreDone', hasMore: true });
                }
            }
        }
    });
    return _panel;
}

function postVariables() {
    if (!_panel) return;
    try {
        _panel.webview.postMessage({ type: 'variablesUpdate', variables: variableSuggestions.getActiveVariables() });
    } catch (_e) {}
}

const variableSuggestionSubscription = variableSuggestions.onDidChangeVariables(() => {
    postVariables();
});

function ensurePanel() {
    if (_panel) {
        _panel.title = getPanelTitle();
        return _panel;
    }
    const panel = vscode.window.createWebviewPanel(
        PANEL_VIEW_TYPE,
        getPanelTitle(),
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: false,
            localResourceRoots: [CODICON_RESOURCE_ROOT]
        }
    );
    return attachPanel(panel);
}

async function refresh(filterText) {
    if (!_panel || !_webviewReady) return;
    _pendingFilterText = filterText || '';
    _panel.webview.postMessage({ type: 'setStatus', status: 'loading' });
    try {
        const data = await fetchDataSnapshot(undefined, filterText || '');
        if (data && Array.isArray(data.allVarNames) && data.allVarNames.length) {
            variableSuggestions.setMemoryVars(data.allVarNames);
        }
        data.variableSuggestions = variableSuggestions.getActiveVariables();
        _panel.webview.postMessage({ type: 'setData', data });
    } catch (e) {
        console.error('[dataViewer] refresh failed:', e.message);
        _panel.webview.postMessage({ type: 'setData', data: { error: e.message } });
    }
    _panel.webview.postMessage({ type: 'setStatus', status: 'ready' });
}

async function reveal(filterText) {
    if (config.getRunMode() !== 'embeddedConsole') {
        showInfo(msg('dataViewerEmbeddedOnly'));
        return null;
    }
    _pendingFilterText = filterText || '';
    const panel = ensurePanel();
    panel.reveal(vscode.ViewColumn.Two, true);
    if (_webviewReady) {
        await refresh(_pendingFilterText);
    }
    return panel;
}

async function updateData() {
    await refresh();
}

function escapeStataPath(filePath) {
    return String(filePath || '').replace(/\\/g, '/').replace(/"/g, '""');
}

async function ensureSilentSession(context) {
    const session = require('../session');
    if (session.hasActiveConsoleSession()) {
        return { success: true, session: session.getConsoleSession(context) };
    }

    let libraryPath;
    let libraryKey;

    if (isMacOS()) {
        const { findStataDylib } = require('../mac');
        const savedPath = context ? context.globalState.get('stataConsoleDylibPath') : null;
        const dylibInfo = findStataDylib(null, savedPath);
        if (!dylibInfo.path) {
            return { success: false, reason: 'Unable to find Stata. Please make sure Stata is installed in /Applications.' };
        }
        libraryPath = dylibInfo.path;
        libraryKey = 'stataConsoleDylibPath';
    } else if (isWindows()) {
        const { findStataDll } = require('../windows');
        const savedPath = context ? context.globalState.get('stataConsoleDllPath') : null;
        const dllInfo = findStataDll(null, savedPath);
        if (!dllInfo.path) {
            return { success: false, reason: 'Unable to find Stata DLL. Please set stata-all-in-one.stataPathOnWindows in settings.' };
        }
        libraryPath = dllInfo.path;
        libraryKey = 'stataConsoleDllPath';
    } else {
        return { success: false, reason: 'Data Viewer is not supported on this platform.' };
    }

    if (context) {
        await context.globalState.update(libraryKey, libraryPath);
    }

    const ok = await session.initConsoleSession(context, libraryPath);
    if (!ok) {
        return { success: false, reason: 'Failed to initialize Stata session.' };
    }

    return { success: true, session: session.getConsoleSession(context) };
}

async function openDtaFile(context, uri, panel) {
    if (!uri || uri.scheme !== 'file') {
        return null;
    }
    if (config.getRunMode() !== 'embeddedConsole') {
        showInfo(msg('dataViewerEmbeddedOnly'));
        return null;
    }

    const targetPanel = panel ? attachPanel(panel) : ensurePanel();
    targetPanel.reveal(undefined, true);

    const filePath = uri.fsPath;
    const initResult = await ensureSilentSession(context);
    if (!initResult.success || !initResult.session) {
        showError(initResult.reason || 'Failed to initialize Stata session.');
        return targetPanel;
    }

    const cdResult = await initResult.session.execute('cd "' + escapeStataPath(path.dirname(filePath)) + '"', false);
    if (!cdResult.success) {
        showError(cdResult.error || 'Failed to set Stata working directory.');
        return targetPanel;
    }
    initResult.session.setWorkingDirectory(path.dirname(filePath));

    const result = await initResult.session.execute('use "' + escapeStataPath(filePath) + '", clear', false);
    if (!result.success) {
        showError(result.error || 'Failed to open Stata dataset in Data Viewer.');
        return targetPanel;
    }

    variableSuggestions.refreshMemoryVars(context).catch(() => {});
    await refresh();
    return targetPanel;
}

module.exports = {
    revealDataViewer: reveal,
    openDtaFileInDataViewer: openDtaFile,
    updateDataViewerData: updateData,
    getDataViewerPanel: () => _panel,
    getPanelViewType: () => PANEL_VIEW_TYPE,
    postDataViewerVariables: postVariables,
    disposeVariableSuggestionSubscription: () => variableSuggestionSubscription.dispose()
};
