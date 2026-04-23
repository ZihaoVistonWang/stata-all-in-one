const vscode = require('vscode');
const { StataTerminalRenderer, getWebviewThemeVariables } = require('../cli/renderer');
const { msg } = require('../../../utils/common');

const PANEL_VIEW_TYPE = 'stata-all-in-one.webviewTerminal';

let _panel = null;
let _history = [];
let _status = 'idle';

function getPanelTitle() {
    return msg('webviewPanelTitle');
}

function ensurePanel() {
    if (_panel) {
        _panel.title = getPanelTitle();
        return _panel;
    }

    _panel = vscode.window.createWebviewPanel(
        PANEL_VIEW_TYPE,
        getPanelTitle(),
        {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: true
        },
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    _panel.webview.html = getWebviewHtml(_panel.webview);
    _panel.onDidDispose(() => {
        _panel = null;
    });
    _panel.webview.onDidReceiveMessage((message) => {
        if (message && message.type === 'ready') {
            postState();
        }
    });

    return _panel;
}

function postState() {
    if (!_panel) {
        return;
    }

    _panel.webview.postMessage({
        type: 'reset',
        status: _status,
        entries: _history
    });
}

async function revealPanel(preserveFocus = true) {
    const panel = ensurePanel();
    panel.reveal(vscode.ViewColumn.Beside, preserveFocus);
    postState();
    return panel;
}

function setStatus(status) {
    _status = status;
    if (_panel) {
        _panel.webview.postMessage({
            type: 'status',
            status
        });
    }
}

function appendEntries(entries) {
    const normalized = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (!normalized.length) {
        return;
    }

    _history.push(...normalized);
    if (_history.length > 1200) {
        _history = _history.slice(-1200);
    }

    if (_panel) {
        _panel.webview.postMessage({
            type: 'append',
            entries: normalized
        });
    }
}

function clearPanel() {
    _history = [];
    if (_panel) {
        _panel.webview.postMessage({
            type: 'clear'
        });
    }
}

class WebviewTerminalSink {
    constructor() {
        this._renderer = new StataTerminalRenderer();
        this._width = 88;
    }

    async prepareForExecution() {
        await revealPanel(true);
        setStatus('running');
    }

    async reveal() {
        await revealPanel(false);
    }

    writeCommand(command) {
        appendEntries(this._renderer.renderCommandSegments(command, this._width));
    }

    writeOutputChunk(text) {
        const rendered = this._renderer.renderOutputChunkSegments(text, this._width);
        if (rendered.length) {
            appendEntries(rendered);
        }
    }

    writeError(text) {
        setStatus('error');
        appendEntries(this._renderer.renderErrorSegments(text));
    }

    writeWarningMessage(text) {
        appendEntries(this._renderer.renderWarningBlockSegments(text));
    }

    writeAccentBlock(text) {
        appendEntries(this._renderer.renderAccentBlockSegments(text));
    }

    writeCommandAccentBlock(text) {
        appendEntries(this._renderer.renderAccentBlockSegments(text));
    }

    writeFunctionAccentBlock(text) {
        appendEntries(this._renderer.renderFunctionAccentBlockSegments(text));
    }

    writePrompt() {
        appendEntries(this._renderer.renderCommandSegments('', this._width));
    }

    writeBreak() {
        appendEntries(this._renderer.renderBreakLineSegments());
        this.writePrompt();
    }

    writeRawChunk(text) {
        const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!normalized) {
            return;
        }
        appendEntries(normalized.split('\n').map(line => ({
            kind: 'raw',
            segments: line
                ? [{
                    text: line,
                    className: '',
                    style: {
                        color: null,
                        backgroundColor: null,
                        bold: false,
                        italic: false,
                        dim: false
                    }
                }]
                : []
        })));
    }

    flushOutput() {
        const flushed = this._renderer.flushPendingOutputSegments(this._width);
        if (flushed.length) {
            appendEntries(flushed);
        }
    }

    writeRunFooter(durationMs) {
        this.flushOutput();
        appendEntries(this._renderer.renderRunFooterSegments(durationMs, this._width));
        setStatus('idle');
    }

    dispose() {}
}

function getWebviewTerminalSink() {
    return new WebviewTerminalSink();
}

function getWebviewHtml() {
    const nonce = String(Date.now());
    const themeVars = getWebviewThemeVariables();
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(getPanelTitle())}</title>
    <style>
        :root {
            color-scheme: light dark;
            --stata-prompt: ${themeVars.prompt || 'var(--vscode-descriptionForeground)'};
            --stata-command: ${themeVars.command || 'var(--vscode-terminal-ansiMagenta)'};
            --stata-keyword: ${themeVars.keyword || 'var(--vscode-terminal-ansiCyan)'};
            --stata-string: ${themeVars.string || 'var(--vscode-terminal-ansiYellow)'};
            --stata-path: ${themeVars.path || 'var(--vscode-terminal-ansiYellow)'};
            --stata-number: ${themeVars.number || 'var(--vscode-terminal-ansiGreen)'};
            --stata-comment: ${themeVars.comment || 'var(--vscode-descriptionForeground)'};
            --stata-function: ${themeVars.function || 'var(--vscode-terminal-ansiBlue)'};
            --stata-option: ${themeVars.option || 'var(--stata-function)'};
            --stata-variable: ${themeVars.variable || 'var(--stata-string)'};
            --stata-macro: ${themeVars.macro || 'var(--stata-variable)'};
            --stata-operator: ${themeVars.operator || 'var(--vscode-terminal-ansiCyan)'};
            --stata-plain: ${themeVars.plain || 'var(--vscode-editor-foreground)'};
            --stata-default: ${themeVars.default || 'var(--vscode-editor-foreground)'};
            --stata-error: ${themeVars.error || 'var(--vscode-errorForeground)'};
            --stata-header: ${themeVars.header || 'var(--vscode-textLink-foreground)'};
            --stata-separator: ${themeVars.separator || 'var(--vscode-panel-border)'};
            --stata-time: ${themeVars.time || 'var(--vscode-editor-foreground)'};
            --stata-time-value: ${themeVars.timeValue || 'var(--stata-number)'};
        }
        html, body {
            height: 100%;
            margin: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
        }
        body {
            display: flex;
            flex-direction: column;
        }
        .statusbar {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-sideBar-background));
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .dot {
            width: 9px;
            height: 9px;
            border-radius: 999px;
            background: var(--vscode-descriptionForeground);
            box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 18%, transparent);
        }
        .dot.running {
            background: #d7ba7d;
        }
        .dot.idle {
            background: #4ec9b0;
        }
        .dot.error {
            background: #f14c4c;
        }
        .label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.02em;
            text-transform: uppercase;
        }
        #output {
            flex: 1;
            overflow: auto;
            padding: 12px;
            font-family: var(--vscode-editor-font-family, var(--vscode-editor-font-family), Menlo, Monaco, monospace);
            font-size: var(--vscode-editor-font-size, 13px);
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }
        #placeholder {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .line {
            min-height: 1.5em;
        }
        .tok {
            color: var(--stata-default);
        }
        .tok-plain,
        .tok-default {
            color: var(--stata-plain);
        }
        .tok-prompt {
            color: var(--stata-prompt);
        }
        .tok-command {
            color: var(--stata-command);
        }
        .tok-keyword {
            color: var(--stata-keyword);
        }
        .tok-string {
            color: var(--stata-string);
        }
        .tok-path {
            color: var(--stata-path);
        }
        .tok-number {
            color: var(--stata-number);
        }
        .tok-comment {
            color: var(--stata-comment);
        }
        .tok-function {
            color: var(--stata-function);
        }
        .tok-option {
            color: var(--stata-option);
        }
        .tok-variable {
            color: var(--stata-variable);
        }
        .tok-macro {
            color: var(--stata-macro);
        }
        .tok-operator {
            color: var(--stata-operator);
        }
        .tok-error {
            color: var(--stata-error);
        }
        .tok-header {
            color: var(--stata-header);
        }
        .tok-separator {
            color: var(--stata-separator);
        }
        .tok-time {
            color: var(--stata-time);
        }
        .tok-timeValue {
            color: var(--stata-time-value);
        }
        .is-dim {
            opacity: 0.72;
        }
        .is-bold {
            font-weight: 700;
        }
        .is-italic {
            font-style: italic;
        }
        .line-error,
        .line-break,
        .line-warning {
            color: var(--stata-error);
        }
        .line-footer {
            margin-top: 0.2rem;
        }
        .line-blank {
            min-height: 0.8em;
        }
    </style>
</head>
<body>
    <div class="statusbar">
        <div id="status-dot" class="dot idle"></div>
        <div id="status-label" class="label">${escapeHtml(msg('webviewIdle'))}</div>
    </div>
    <div id="output"><div id="placeholder">${escapeHtml(msg('webviewWaiting'))}</div></div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const output = document.getElementById('output');
        const placeholder = document.getElementById('placeholder');
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('status-label');

        const STATUS_LABELS = {
            idle: ${JSON.stringify(msg('webviewIdle'))},
            running: ${JSON.stringify(msg('webviewRunning'))},
            error: ${JSON.stringify(msg('webviewError'))}
        };

        function setStatus(status) {
            dot.className = 'dot ' + (status || 'idle');
            label.textContent = STATUS_LABELS[status] || STATUS_LABELS.idle;
        }

        function ensurePlaceholderVisibility() {
            placeholder.style.display = output.childElementCount > 1 ? 'none' : '';
        }

        function appendEntries(entries) {
            if (!Array.isArray(entries) || entries.length === 0) {
                return;
            }

            const shouldStick = output.scrollTop + output.clientHeight >= output.scrollHeight - 24;
            const fragment = renderEntriesToFragment(entries);
            output.appendChild(fragment);
            ensurePlaceholderVisibility();
            if (shouldStick) {
                output.scrollTop = output.scrollHeight;
            }
        }

        function resetOutput(entries) {
            while (output.firstChild) {
                output.removeChild(output.firstChild);
            }
            output.appendChild(placeholder);
            appendEntries(entries || []);
            ensurePlaceholderVisibility();
        }

        function renderEntriesToFragment(entries) {
            const fragment = document.createDocumentFragment();
            for (const entry of entries) {
                const line = document.createElement('div');
                line.className = 'line line-' + String((entry && entry.kind) || 'default');
                const segments = Array.isArray(entry && entry.segments) ? entry.segments : [];
                for (const segment of segments) {
                    const span = document.createElement('span');
                    const className = String(segment && segment.className || '').trim();
                    if (className) {
                        span.className = className;
                    }
                    const style = segment && segment.style || {};
                    if (style.color) {
                        span.style.color = style.color;
                    }
                    if (style.backgroundColor) {
                        span.style.backgroundColor = style.backgroundColor;
                    }
                    span.textContent = String(segment && segment.text || '');
                    line.appendChild(span);
                }
                fragment.appendChild(line);
            }
            return fragment;
        }

        window.addEventListener('message', event => {
            const message = event.data || {};
            if (message.type === 'append') {
                appendEntries(message.entries || []);
            } else if (message.type === 'status') {
                setStatus(message.status);
            } else if (message.type === 'clear') {
                resetOutput([]);
            } else if (message.type === 'reset') {
                setStatus(message.status);
                resetOutput(message.entries || []);
            }
        });

        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

module.exports = {
    revealWebviewTerminalPanel: revealPanel,
    getWebviewTerminalSink,
    clearWebviewTerminalPanel: clearPanel,
    setWebviewTerminalStatus: setStatus
};
