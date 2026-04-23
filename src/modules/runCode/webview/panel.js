const vscode = require('vscode');
const { StataTerminalRenderer } = require('../cli/renderer');
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
        chunks: _history
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

function appendAnsiChunk(chunk) {
    const normalized = String(chunk || '');
    if (!normalized) {
        return;
    }

    _history.push(normalized);
    if (_history.length > 1200) {
        _history = _history.slice(-1200);
    }

    if (_panel) {
        _panel.webview.postMessage({
            type: 'append',
            chunk: normalized
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
        appendAnsiChunk(this._renderer.renderCommand(command, this._width));
    }

    writeOutputChunk(text) {
        const rendered = this._renderer.renderOutputChunk(text, this._width);
        if (rendered) {
            appendAnsiChunk(rendered);
        }
    }

    writeError(text) {
        setStatus('error');
        appendAnsiChunk(this._renderer.renderError(text));
    }

    writeWarningMessage(text) {
        appendAnsiChunk(this._renderer.renderWarningBlock(text));
    }

    writeAccentBlock(text) {
        appendAnsiChunk(this._renderer.renderAccentBlock(text));
    }

    writeCommandAccentBlock(text) {
        appendAnsiChunk(this._renderer.renderCommandAccentBlock(text));
    }

    writeFunctionAccentBlock(text) {
        appendAnsiChunk(this._renderer.renderFunctionAccentBlock(text));
    }

    writePrompt() {
        appendAnsiChunk('. ');
    }

    writeBreak() {
        appendAnsiChunk(this._renderer.renderBreakLine());
        appendAnsiChunk('. ');
    }

    writeRawChunk(text) {
        appendAnsiChunk(text);
    }

    flushOutput() {
        const flushed = this._renderer.flushPendingOutput(this._width);
        if (flushed) {
            appendAnsiChunk(flushed);
        }
    }

    writeRunFooter(durationMs) {
        this.flushOutput();
        appendAnsiChunk(this._renderer.renderRunFooter(durationMs, this._width));
        setStatus('idle');
    }

    dispose() {}
}

function getWebviewTerminalSink() {
    return new WebviewTerminalSink();
}

function getWebviewHtml() {
    const nonce = String(Date.now());
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
        .dim {
            opacity: 0.72;
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

        function appendAnsiChunk(chunk) {
            if (!chunk) {
                return;
            }

            const shouldStick = output.scrollTop + output.clientHeight >= output.scrollHeight - 24;
            const fragment = renderAnsiToFragment(chunk);
            output.appendChild(fragment);
            ensurePlaceholderVisibility();
            if (shouldStick) {
                output.scrollTop = output.scrollHeight;
            }
        }

        function resetOutput(chunks) {
            while (output.firstChild) {
                output.removeChild(output.firstChild);
            }
            output.appendChild(placeholder);
            for (const chunk of chunks || []) {
                appendAnsiChunk(chunk);
            }
            ensurePlaceholderVisibility();
        }

        function renderAnsiToFragment(text) {
            const fragment = document.createDocumentFragment();
            const normalized = String(text || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
            let line = document.createElement('div');
            line.className = 'line';
            fragment.appendChild(line);

            let style = createDefaultStyle();
            const ansiRegex = /\\x1b\\[([0-9;]*)m/g;
            let lastIndex = 0;
            let match;

            while ((match = ansiRegex.exec(normalized)) !== null) {
                if (match.index > lastIndex) {
                    appendText(line, normalized.slice(lastIndex, match.index), style, fragment);
                    line = getCurrentLine(fragment);
                }
                style = applyAnsiCodes(style, match[1]);
                lastIndex = ansiRegex.lastIndex;
            }

            if (lastIndex < normalized.length) {
                appendText(line, normalized.slice(lastIndex), style, fragment);
            }

            return fragment;
        }

        function appendText(line, text, style, fragment) {
            const parts = String(text).split('\\n');
            for (let index = 0; index < parts.length; index++) {
                const part = parts[index];
                if (part) {
                    const span = document.createElement('span');
                    if (style.color) {
                        span.style.color = style.color;
                    }
                    if (style.backgroundColor) {
                        span.style.backgroundColor = style.backgroundColor;
                    }
                    if (style.bold) {
                        span.style.fontWeight = '700';
                    }
                    if (style.italic) {
                        span.style.fontStyle = 'italic';
                    }
                    if (style.dim) {
                        span.classList.add('dim');
                    }
                    span.textContent = part;
                    line.appendChild(span);
                }
                if (index < parts.length - 1) {
                    line = document.createElement('div');
                    line.className = 'line';
                    fragment.appendChild(line);
                }
            }
        }

        function getCurrentLine(fragment) {
            return fragment.lastChild;
        }

        function createDefaultStyle() {
            return {
                color: '',
                backgroundColor: '',
                bold: false,
                italic: false,
                dim: false
            };
        }

        function applyAnsiCodes(currentStyle, codes) {
            const nextStyle = { ...currentStyle };
            const values = (codes || '0').split(';').filter(Boolean).map(value => Number.parseInt(value, 10));
            if (!values.length) {
                return createDefaultStyle();
            }

            for (let index = 0; index < values.length; index++) {
                const code = values[index];
                if (code === 0) {
                    Object.assign(nextStyle, createDefaultStyle());
                } else if (code === 1) {
                    nextStyle.bold = true;
                } else if (code === 2) {
                    nextStyle.dim = true;
                } else if (code === 3) {
                    nextStyle.italic = true;
                } else if (code === 22) {
                    nextStyle.bold = false;
                    nextStyle.dim = false;
                } else if (code === 23) {
                    nextStyle.italic = false;
                } else if (code === 39) {
                    nextStyle.color = '';
                } else if (code === 49) {
                    nextStyle.backgroundColor = '';
                } else if (code === 38 && values[index + 1] === 2) {
                    nextStyle.color = rgbString(values[index + 2], values[index + 3], values[index + 4]);
                    index += 4;
                } else if (code === 48 && values[index + 1] === 2) {
                    nextStyle.backgroundColor = rgbString(values[index + 2], values[index + 3], values[index + 4]);
                    index += 4;
                } else if (code >= 30 && code <= 37) {
                    nextStyle.color = ANSI_PALETTE[code] || '';
                } else if (code >= 90 && code <= 97) {
                    nextStyle.color = ANSI_PALETTE[code] || '';
                }
            }

            return nextStyle;
        }

        function rgbString(r, g, b) {
            if ([r, g, b].some(value => !Number.isFinite(value))) {
                return '';
            }
            return 'rgb(' + r + ', ' + g + ', ' + b + ')';
        }

        const ANSI_PALETTE = {
            30: '#000000',
            31: '#cd3131',
            32: '#0dbc79',
            33: '#e5e510',
            34: '#2472c8',
            35: '#bc3fbc',
            36: '#11a8cd',
            37: '#e5e5e5',
            90: '#666666',
            91: '#f14c4c',
            92: '#23d18b',
            93: '#f5f543',
            94: '#3b8eea',
            95: '#d670d6',
            96: '#29b8db',
            97: '#ffffff'
        };

        window.addEventListener('message', event => {
            const message = event.data || {};
            if (message.type === 'append') {
                appendAnsiChunk(message.chunk);
            } else if (message.type === 'status') {
                setStatus(message.status);
            } else if (message.type === 'clear') {
                resetOutput([]);
            } else if (message.type === 'reset') {
                setStatus(message.status);
                resetOutput(message.chunks || []);
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
