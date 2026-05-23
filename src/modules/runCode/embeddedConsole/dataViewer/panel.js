const vscode = require('vscode');
const { fetchDataSnapshot, fetchMoreRows } = require('./provider');
const config = require('../../../../utils/config');

const PANEL_VIEW_TYPE = 'stata-all-in-one.dataViewer';

let _panel = null;

function getPanelTitle() {
    return 'Stata Data Viewer';
}

function getDataViewerHtml() {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stata Data Viewer</title>
    <style>
        :root {
            color-scheme: light dark;
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
            color: var(--vscode-foreground);
        }
        .tab.active {
            color: var(--vscode-textLink-foreground);
            border-bottom-color: var(--vscode-textLink-foreground);
        }
        .tab-bar-spacer {
            flex: 1;
        }
        .refresh-btn {
            padding: 4px 10px;
            cursor: pointer;
            background: none;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            color: var(--vscode-foreground);
            font-size: 11px;
            outline: none;
        }
        .refresh-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        .content {
            flex: 1;
            overflow: auto;
            padding: 12px 16px;
        }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: var(--vscode-editor-font-size, 13px);
        }
        th, td {
            padding: 4px 10px;
            text-align: left;
            border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 60%, transparent);
            white-space: nowrap;
        }
        th {
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            z-index: 1;
        }
        td {
            font-family: var(--vscode-editor-font-family, monospace);
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
        tr:hover td {
            background: color-mix(in srgb, var(--vscode-list-hoverBackground) 50%, transparent);
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
            height: 100%;
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }
        .loading-state {
            display: none;
        }
        body.loading .loading-state { display: flex; }
        body.loading .empty-state { display: none; }
        body.loading .tab-content table { display: none; }
    </style>
</head>
<body class="loading">
    <div class="tab-bar">
        <button class="tab active" data-tab="vars" id="tab-vars">Variables</button>
        <button class="tab" data-tab="data" id="tab-data">Data</button>
        <button class="tab" data-tab="summary" id="tab-summary">Summary</button>
        <span class="tab-bar-spacer"></span>
        <button class="refresh-btn" id="refresh-btn" title="Refresh">&#x21bb; Refresh</button>
    </div>
    <div class="content" id="content">
        <div class="loading-state" id="loading-msg">Loading...</div>
        <div class="tab-content active" id="content-vars">
            <div class="empty-state" id="empty-vars">No dataset loaded</div>
            <table id="table-vars" style="display:none">
                <thead><tr><th>Name</th><th>Type</th><th>Format</th><th>Label</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
        <div class="tab-content" id="content-data">
            <div class="empty-state" id="empty-data">No dataset loaded</div>
            <div id="data-table-container" style="display:none; overflow-x: auto;">
                <table id="table-data">
                    <thead></thead>
                    <tbody></tbody>
                </table>
                <div id="load-more-row" style="display:none; text-align:center; padding:10px 20px; cursor:pointer; color:var(--vscode-textLink-foreground); background:color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent); border-radius:4px; margin:8px 0; user-select:none;">
                    Load more rows...
                </div>
            </div>
        </div>
        <div class="tab-content" id="content-summary">
            <div class="empty-state" id="empty-summary">No dataset loaded</div>
            <table id="table-summary" style="display:none">
                <thead><tr><th>Variable</th><th class="num">Obs</th><th class="num">Mean</th><th class="num">Std. Dev.</th><th class="num">Min</th><th class="num">Max</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
    </div>
    <div class="info-bar" id="info-bar"></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let currentTab = 'vars';
        const contentEl = document.getElementById('content');

        document.querySelectorAll('.tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                switchTab(this.dataset.tab);
            });
        });

        document.getElementById('refresh-btn').addEventListener('click', function () {
            vscode.postMessage({ type: 'refresh' });
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

        function setLoadingMore(v) {
            loadingMore = v;
            var el = document.getElementById('load-more-row');
            if (v) {
                el.textContent = 'Loading more...';
                el.style.display = '';
            } else if (!hasMoreRows || (loadedRows >= totalObs && totalObs > 0)) {
                el.style.display = 'none';
            } else if (loadedRows > 0) {
                el.textContent = 'Scroll for more...';
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
            scheduleAutoLoadCheck();
        }

        function showEmpty(hasData) {
            document.getElementById('empty-vars').style.display = hasData ? 'none' : '';
            document.getElementById('table-vars').style.display = hasData ? '' : 'none';
            document.getElementById('empty-data').style.display = hasData ? 'none' : '';
            document.getElementById('data-table-container').style.display = hasData ? '' : 'none';
            document.getElementById('empty-summary').style.display = hasData ? 'none' : '';
            document.getElementById('table-summary').style.display = hasData ? '' : 'none';
        }

        function renderVars(vars) {
            var tbody = document.getElementById('table-vars').querySelector('tbody');
            tbody.innerHTML = '';
            for (var i = 0; i < vars.length; i++) {
                var v = vars[i];
                var tr = document.createElement('tr');
                tr.innerHTML = '<td>' + esc(v.name) + '</td>' +
                    '<td>' + esc(v.type || '') + '</td>' +
                    '<td>' + esc(v.format || '') + '</td>' +
                    '<td>' + esc(v.label || v.valueLabel || '') + '</td>';
                tbody.appendChild(tr);
            }
        }

        var dataColumnsCache = [];
        var totalObs = 0;
        var loadedRows = 0;
        var loadingMore = false;
        var hasMoreRows = true;
        var preloadRowBuffer = 40;

        function renderDataHeader(columns) {
            dataColumnsCache = columns;
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
                    var val = v < vals.length ? String(vals[v]) : '';
                    td.textContent = val;
                    if (/^[-+]?\\d/.test(val.trim())) {
                        td.className = 'num';
                    }
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
            vscode.postMessage({ type: 'loadMore', startObs: loadedRows, count: 100 });
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

        function renderSummary(summary) {
            var tbody = document.getElementById('table-summary').querySelector('tbody');
            tbody.innerHTML = '';
            for (var i = 0; i < summary.length; i++) {
                var s = summary[i];
                var tr = document.createElement('tr');
                tr.innerHTML = '<td>' + esc(s.name) + '</td>' +
                    '<td class="num">' + fmt(s.obs) + '</td>' +
                    '<td class="num">' + fmt(s.mean) + '</td>' +
                    '<td class="num">' + fmt(s.stdDev) + '</td>' +
                    '<td class="num">' + fmt(s.min) + '</td>' +
                    '<td class="num">' + fmt(s.max) + '</td>';
                tbody.appendChild(tr);
            }
        }

        function renderInfo(info) {
            var bar = document.getElementById('info-bar');
            var parts = [];
            if (info.observations > 0) parts.push('Obs: ' + info.observations);
            if (info.variables > 0) parts.push('Vars: ' + info.variables);
            if (info.source) parts.push(info.source);
            if (info.sortedBy) parts.push('Sorted by: ' + info.sortedBy);
            bar.innerHTML = parts.map(function (p) { return '<span>' + esc(p) + '</span>'; }).join('');
        }

        function esc(s) {
            if (!s) return '';
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function fmt(n) {
            if (n === null || n === undefined) return '';
            if (typeof n === 'string') return n;
            if (Number.isInteger(n)) return String(n);
            return n.toFixed(6);
        }

        function setData(data) {
            document.body.classList.remove('loading');
            document.getElementById('loading-msg').style.display = 'none';
            var hasData = data.vars && data.vars.length > 0;
            showEmpty(hasData);
            if (!hasData) {
                document.getElementById('info-bar').textContent = 'No dataset loaded';
                return;
            }
            renderVars(data.vars);
            renderDataHeader(data.dataColumns);
            totalObs = (data.info && data.info.observations) || 0;
            appendDataRows(data.dataRows || []);
            setLoadingMore(false);
            renderSummary(data.summary);
            renderInfo(data.info || {});
            scheduleAutoLoadCheck();
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
            } else if (message.type === 'setStatus') {
                // Could show loading indicator
            }
        });

        setTimeout(function () {
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
        enableScripts: true
    };
    _panel.webview.html = getDataViewerHtml();
    _panel.onDidDispose(() => {
        if (_panel === panel) {
            _panel = null;
        }
    });
    _panel.webview.onDidReceiveMessage(async (message) => {
        if (message && message.type === 'ready') {
            await refresh();
        } else if (message && message.type === 'refresh') {
            await refresh();
        } else if (message && message.type === 'loadMore') {
            const startObs = (message.startObs || 0) + 1;
            const count = message.count || 100;
            try {
                const rows = await fetchMoreRows(startObs, count);
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
        _panel.webview.html = getDataViewerHtml();
        return _panel;
    }
    const panel = vscode.window.createWebviewPanel(
        PANEL_VIEW_TYPE,
        getPanelTitle(),
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: false
        }
    );
    return attachPanel(panel);
}

async function refresh() {
    if (!_panel) return;
    _panel.webview.postMessage({ type: 'setStatus', status: 'loading' });
    try {
        const data = await fetchDataSnapshot();
        _panel.webview.postMessage({ type: 'setData', data });
    } catch (e) {
        console.error('[dataViewer] refresh failed:', e.message);
        _panel.webview.postMessage({ type: 'setData', data: { error: e.message } });
    }
    _panel.webview.postMessage({ type: 'setStatus', status: 'ready' });
}

async function reveal() {
    if (config.getRunMode() !== 'embeddedConsole') {
        vscode.window.showInformationMessage('Data Viewer is only available in Embedded Console mode.');
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
