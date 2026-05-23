const vscode = require('vscode');
const { fetchDataSnapshot, fetchMoreRows } = require('./provider');
const config = require('../../../../utils/config');
const { msg } = require('../../../../utils/common');
const { StataTerminalRenderer, getWebviewThemeVariables } = require('../renderer');

const PANEL_VIEW_TYPE = 'stata-all-in-one.dataViewer';

let _panel = null;
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
            padding: 4px 12px;
            cursor: pointer;
            color: var(--vscode-input-foreground);
        }
        .filter-autocomplete-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
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
        th, td {
            padding: 4px 10px;
            text-align: left;
            white-space: nowrap;
            line-height: 20px;
            box-sizing: border-box;
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
        td {
            font-family: var(--vscode-editor-font-family, monospace);
        }
        tbody tr:nth-child(even) td {
            background: color-mix(in srgb, var(--vscode-list-hoverBackground) 28%, transparent);
        }
        td.num {
            text-align: right;
            font-variant-numeric: tabular-nums;
        }
        td.row-num {
            color: var(--vscode-descriptionForeground);
            text-align: right;
            user-select: none;
            min-width: 40px;
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
                <button class="filter-input-button" id="filter-apply-btn" title="${escHtml(msg('dataViewerFilter'))}" aria-label="${escHtml(msg('dataViewerFilter'))}">
                    <span class="refresh-icon codicon-search" aria-hidden="true"></span>
                </button>
                <button class="filter-input-button" id="filter-clear-btn" title="${escHtml(msg('dataViewerClearFilter'))}" aria-label="${escHtml(msg('dataViewerClearFilter'))}">
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
                document.body.classList.remove('filter-open');
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

        function showFilterAutocomplete(matches, wordStart) {
            if (!matches.length) {
                hideFilterAutocomplete();
                return;
            }
            filterAutocomplete.innerHTML = '';
            for (var i = 0; i < matches.length; i++) {
                var item = document.createElement('div');
                item.className = 'filter-autocomplete-item';
                item.textContent = matches[i];
                item.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    applyFilterAutocomplete(this.textContent, wordStart);
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
            var candidates = ['if', 'in', 'nolabel'].concat(autocompleteVariables);
            var matches = [];
            for (var i = 0; i < candidates.length && matches.length < 8; i++) {
                var c = candidates[i];
                if (c.toLowerCase().indexOf(prefix) === 0 && matches.indexOf(c) < 0) {
                    matches.push(c);
                }
            }
            if (matches.length === 1 && matches[0].toLowerCase() === prefix) {
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
                applyFilterAutocomplete(items[filterAutocompleteIndex].textContent, getCurrentFilterWord().start);
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
            for (var i = 0; i < autocompleteVariables.length; i++) {
                if (autocompleteVariables[i].toLowerCase() === word.toLowerCase()) return true;
            }
            return false;
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
        var totalObs = 0;
        var loadedRows = 0;
        var loadingMore = false;
        var hasMoreRows = true;
        var preloadRowBuffer = 40;

        function renderDataHeader(columns, typeMap) {
            dataColumnsCache = columns;
            dataColumnTypesCache = [];
            var thead = document.getElementById('table-data').querySelector('thead');
            var tbody = document.getElementById('table-data').querySelector('tbody');
            thead.innerHTML = '';
            tbody.innerHTML = '';
            var headerRow = document.createElement('tr');
            var th = document.createElement('th');
            th.className = 'row-num';
            th.textContent = '#';
            headerRow.appendChild(th);
            for (var i = 0; i < columns.length; i++) {
                var th2 = document.createElement('th');
                th2.textContent = columns[i];
                headerRow.appendChild(th2);
                dataColumnTypesCache.push(typeMap[columns[i]] || '');
            }
            thead.appendChild(headerRow);
            loadedRows = 0;
            hasMoreRows = true;
            setLoadingMore(false);
        }

        function appendDataRows(rows) {
            var tbody = document.getElementById('table-data').querySelector('tbody');
            var cols = dataColumnsCache;
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                var tr = document.createElement('tr');
                var tdNum = document.createElement('td');
                tdNum.className = 'row-num';
                tdNum.textContent = row.rowNum;
                tr.appendChild(tdNum);
                var vals = Array.isArray(row.values) ? row.values : [];
                for (var v = 0; v < cols.length; v++) {
                    var td = document.createElement('td');
                    var val = v < vals.length ? displayValue(vals[v]) : '';
                    td.textContent = val;
                    var isString = /^str/i.test(dataColumnTypesCache[v] || '');
                    td.className = isString ? 'data-string' : 'num data-number';
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            loadedRows += rows.length;
            setLoadingMore(false);
            scheduleAutoLoadCheck();
        }

        function requestLoadMore() {
            if (loadingMore || !hasMoreRows || (totalObs > 0 && loadedRows >= totalObs)) return;
            setLoadingMore(true);
            vscode.postMessage({ type: 'loadMore', startObs: loadedRows, count: 100, filterText: filterInput.value || '' });
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
            var rows = document.getElementById('table-data').querySelectorAll('tbody tr');
            if (!rows.length) return 0;
            var contentTop = contentEl.getBoundingClientRect().top;
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].getBoundingClientRect().bottom > contentTop) {
                    var cell = rows[i].querySelector('.row-num');
                    return cell ? Number(cell.textContent) || 0 : 0;
                }
            }
            return loadedRows;
        }
        contentEl.addEventListener('scroll', scheduleAutoLoadCheck, { passive: true });
        contentEl.addEventListener('wheel', scheduleAutoLoadCheck, { passive: true });
        window.addEventListener('resize', scheduleAutoLoadCheck);

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
            var hasData = data.vars && data.vars.length > 0;
            showEmpty(hasData);
            if (!hasData) {
                document.getElementById('info-bar').textContent = ${JSON.stringify(msg('dataViewerNoDataset'))};
                return;
            }
            renderVars(data.vars);
            autocompleteVariables = data.allVarNames || data.dataColumns || [];
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
    _panel.title = getPanelTitle();
    _panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [CODICON_RESOURCE_ROOT]
    };
    _panel.webview.html = getDataViewerHtml(_panel.webview);
    _panel.onDidDispose(() => {
        if (_panel === panel) {
            _panel = null;
        }
    });
    _panel.webview.onDidReceiveMessage(async (message) => {
        if (message && message.type === 'ready') {
            await refresh();
        } else if (message && message.type === 'refresh') {
            await refresh(message.filterText || '');
        } else if (message && message.type === 'highlightFilter') {
            if (_panel) {
                _panel.webview.postMessage({ type: 'filterHighlightResult', segments: highlightFilterText(message.text || '') });
            }
        } else if (message && message.type === 'loadMore') {
            const startObs = (message.startObs || 0) + 1;
            const count = message.count || 100;
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

function ensurePanel() {
    if (_panel) {
        _panel.title = getPanelTitle();
        _panel.webview.html = getDataViewerHtml(_panel.webview);
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
    if (!_panel) return;
    _panel.webview.postMessage({ type: 'setStatus', status: 'loading' });
    try {
        const data = await fetchDataSnapshot(undefined, filterText || '');
        _panel.webview.postMessage({ type: 'setData', data });
    } catch (e) {
        console.error('[dataViewer] refresh failed:', e.message);
        _panel.webview.postMessage({ type: 'setData', data: { error: e.message } });
    }
    _panel.webview.postMessage({ type: 'setStatus', status: 'ready' });
}

async function reveal() {
    if (config.getRunMode() !== 'embeddedConsole') {
        vscode.window.showInformationMessage(msg('dataViewerEmbeddedOnly'));
        return null;
    }
    const panel = ensurePanel();
    panel.reveal(vscode.ViewColumn.Two, true);
    return panel;
}

async function updateData() {
    await refresh();
}

module.exports = {
    revealDataViewer: reveal,
    updateDataViewerData: updateData,
    getDataViewerPanel: () => _panel,
    getPanelViewType: () => PANEL_VIEW_TYPE
};
