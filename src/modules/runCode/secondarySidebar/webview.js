const { msg } = require('../../../utils/common');
const { getConsoleFrameHtml } = require('./consoleView');
const { getDataViewerFrameHtml } = require('./dataViewerView');

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function jsonForInlineScript(value) {
    return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
}

function getSecondarySidebarHtml(webview, options = {}) {
    const nonce = String(Date.now());
    const consoleHtml = getConsoleFrameHtml(webview, options.fontOptions || {});
    const dataViewerHtml = getDataViewerFrameHtml(webview);
    const themeVariableNames = [...new Set(
        (consoleHtml + dataViewerHtml).match(/--vscode-[A-Za-z0-9-]+/g) || []
    )];
    const labels = {
        console: msg('secondarySidebarConsoleTab'),
        dataViewer: msg('secondarySidebarDataViewerTab')
    };
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'self' ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root { color-scheme: light dark; }
        * { box-sizing: border-box; }
        html, body { height: 100%; margin: 0; overflow: hidden; }
        body {
            display: flex;
            flex-direction: column;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
        }
        .shell-header {
            flex: 0 0 auto;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .shell-title {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            padding: 10px 12px 4px;
            font-size: 12px;
            font-weight: 600;
        }
        .version {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            font-weight: 400;
        }
        .main-tabs { display: flex; align-items: center; padding: 0 8px; }
        .main-tab {
            padding: 8px 12px;
            border: 0;
            border-bottom: 2px solid transparent;
            background: none;
            color: var(--vscode-descriptionForeground);
            font: 500 12px var(--vscode-font-family);
            cursor: pointer;
        }
        .main-tab:hover { color: var(--vscode-textLink-foreground); }
        .main-tab.active {
            color: var(--vscode-textLink-foreground);
            border-bottom-color: var(--vscode-textLink-foreground);
        }
        .frames { position: relative; flex: 1 1 auto; min-height: 0; }
        .view-frame {
            position: absolute;
            inset: 0;
            display: none;
            width: 100%;
            height: 100%;
            border: 0;
            background: var(--vscode-editor-background);
        }
        .view-frame.active { display: block; }
    </style>
</head>
<body>
    <header class="shell-header">
        <div class="shell-title"><span>Stata All in One</span><span class="version">v${escapeHtml(options.version)}</span></div>
        <nav class="main-tabs">
            <button class="main-tab active" data-main="console">${escapeHtml(labels.console)}</button>
            <button class="main-tab" data-main="dataViewer">${escapeHtml(labels.dataViewer)}</button>
        </nav>
    </header>
    <main class="frames">
        <iframe id="console-frame" class="view-frame active" title="${escapeHtml(labels.console)}"></iframe>
        <iframe id="dataViewer-frame" class="view-frame" title="${escapeHtml(labels.dataViewer)}"></iframe>
    </main>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const saved = vscode.getState() || {};
        let activeMain = saved.activeMain === 'dataViewer' ? 'dataViewer' : 'console';
        const frames = {
            console: document.getElementById('console-frame'),
            dataViewer: document.getElementById('dataViewer-frame')
        };
        const frameHtml = {
            console: ${jsonForInlineScript(consoleHtml)},
            dataViewer: ${jsonForInlineScript(dataViewerHtml)}
        };
        const frameReady = { console: false, dataViewer: false };
        const frameQueues = { console: [], dataViewer: [] };
        const frameTimers = { console: null, dataViewer: null };
        const frameRetries = { console: 0, dataViewer: 0 };
        let extensionReady = false;
        const themeVariableNames = ${JSON.stringify(themeVariableNames)};

        function switchMain(tab, notify = true) {
            activeMain = tab === 'dataViewer' ? 'dataViewer' : 'console';
            document.querySelectorAll('.main-tab').forEach(button => {
                button.classList.toggle('active', button.dataset.main === activeMain);
            });
            Object.entries(frames).forEach(([name, frame]) => frame.classList.toggle('active', name === activeMain));
            vscode.setState({ activeMain });
            if (notify) vscode.postMessage({ type: 'secondarySidebar.switchTab', tab: activeMain });
        }

        function sendToFrame(frame, message) {
            const target = frames[frame];
            if (!target) return;
            if (!frameReady[frame] || !target.contentWindow) {
                frameQueues[frame].push(message);
                return;
            }
            target.contentWindow.postMessage(message, '*');
        }

        function flushFrameQueue(frame) {
            const target = frames[frame];
            if (!target || !target.contentWindow || !frameReady[frame]) return;
            const pending = frameQueues[frame].splice(0);
            pending.forEach(message => target.contentWindow.postMessage(message, '*'));
        }

        function postDirectToFrame(frame, message) {
            const target = frames[frame];
            if (target && target.contentWindow) target.contentWindow.postMessage(message, '*');
        }

        function readThemeVariables() {
            const variables = {};
            const rootStyles = getComputedStyle(document.documentElement);
            const bodyStyles = getComputedStyle(document.body);
            themeVariableNames.forEach(name => {
                const value = bodyStyles.getPropertyValue(name).trim()
                    || rootStyles.getPropertyValue(name).trim();
                if (value) variables[name] = value;
            });
            return variables;
        }

        function syncTheme(frame) {
            const message = { type: 'secondarySidebar.theme', variables: readThemeVariables() };
            if (frame) postDirectToFrame(frame, message);
            else Object.keys(frames).forEach(name => postDirectToFrame(name, message));
        }

        function themedSrcdoc(html) {
            const declarations = Object.entries(readThemeVariables())
                .map(([name, value]) => name + ':' + value)
                .join(';');
            const style = '<style id="saio-host-theme">:root{' + declarations + '}</style>';
            return String(html || '').replace('</head>', style + '</head>');
        }

        function loadFrame(frame) {
            frameReady[frame] = false;
            frames[frame].srcdoc = themedSrcdoc(frameHtml[frame]);
            clearTimeout(frameTimers[frame]);
            frameTimers[frame] = setTimeout(() => {
                if (frameReady[frame] || frameRetries[frame] >= 1) return;
                frameRetries[frame] += 1;
                loadFrame(frame);
            }, 4000);
        }

        Object.entries(frames).forEach(([name, frame]) => {
            frame.addEventListener('load', () => syncTheme(name));
        });
        const themeObserver = new MutationObserver(() => syncTheme());
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

        document.querySelectorAll('.main-tab').forEach(button => {
            button.addEventListener('click', () => switchMain(button.dataset.main));
        });
        window.addEventListener('message', event => {
            const frame = event.source === frames.console.contentWindow
                ? 'console'
                : event.source === frames.dataViewer.contentWindow ? 'dataViewer' : null;
            if (!frame || !event.data || event.data.__saioFrame !== frame) return;
            if (event.data.message && event.data.message.type === 'themeRequest') syncTheme(frame);
            if (event.data.message && event.data.message.type === 'ready') {
                frameReady[frame] = true;
                clearTimeout(frameTimers[frame]);
                flushFrameQueue(frame);
                if (frame === 'console' && !extensionReady) {
                    extensionReady = true;
                    vscode.postMessage({ type: 'ready' });
                }
            }
            vscode.postMessage({ type: 'secondarySidebar.frameMessage', frame, message: event.data.message || {} });
        });
        window.addEventListener('message', event => {
            const message = event.data || {};
            if (message.type === 'sidebar.state') {
                switchMain(message.activeTab, false);
                sendToFrame('console', {
                    type: 'reset',
                    status: message.console.status,
                    entries: message.console.entries || [],
                    overflowNoticeSuppressed: false,
                    workingDetail: message.console.workingDetail || null,
                    composerTips: message.console.composerTips || []
                });
                if (message.dataViewer && message.dataViewer.data) {
                    sendToFrame('dataViewer', { type: 'setData', data: message.dataViewer.data });
                }
            } else if (message.type === 'sidebar.tab') {
                switchMain(message.tab, false);
            } else if (message.type === 'console.append') {
                sendToFrame('console', { type: 'append', entries: message.entries || [] });
            } else if (message.type === 'console.status') {
                sendToFrame('console', { type: 'status', status: message.status });
            } else if (message.type === 'console.workingDetail') {
                sendToFrame('console', { type: 'workingDetail', detail: message.detail || null });
            } else if (message.type === 'console.reset') {
                sendToFrame('console', {
                    type: 'reset', status: message.status, entries: message.entries || [],
                    overflowNoticeSuppressed: false, workingDetail: message.workingDetail || null,
                    composerTips: message.composerTips || []
                });
            } else if (message.type === 'dataViewer.loading') {
                sendToFrame('dataViewer', { type: 'setStatus', status: 'loading' });
            } else if (message.type === 'dataViewer.data') {
                sendToFrame('dataViewer', { type: 'setData', data: message.data || {} });
            } else if (message.type === 'dataViewer.more') {
                sendToFrame('dataViewer', { type: 'appendRows', rows: message.rows || [], hasMore: message.hasMore !== false });
                sendToFrame('dataViewer', { type: 'loadMoreDone', hasMore: message.hasMore !== false });
            } else if (message.type === 'dataViewer.error') {
                sendToFrame('dataViewer', { type: 'setData', data: { error: message.message || '' } });
            } else if (message.type === 'secondarySidebar.frameHostMessage') {
                sendToFrame(message.frame, message.message || {});
            } else if (message.type === 'requestGraphImageDataUrl') {
                sendToFrame('console', message);
            }
        });
        switchMain(activeMain, false);
        loadFrame('console');
        loadFrame('dataViewer');
    </script>
</body>
</html>`;
}

module.exports = { getSecondarySidebarHtml };
