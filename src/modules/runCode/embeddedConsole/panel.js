const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { StataTerminalRenderer, getWebviewThemeVariables } = require('./renderer');
const { msg } = require('../../../utils/common');

const PANEL_VIEW_TYPE = 'stata-all-in-one.webviewTerminal';

let _panel = null;
let _history = [];
let _status = 'idle';
let _commandHandler = null;
let _asciiLogo53x13Cache = null;

function getPanelTitle() {
    return msg('webviewPanelTitle');
}

function attachPanel(panel) {
    _panel = panel;
    _panel.title = getPanelTitle();
    _panel.webview.options = {
        enableScripts: true,
        retainContextWhenHidden: true
    };
    _panel.webview.html = getWebviewHtml(_panel.webview);
    _panel.onDidDispose(() => {
        if (_panel === panel) {
            _panel = null;
        }
    });
    _panel.webview.onDidReceiveMessage(async (message) => {
        if (message && message.type === 'ready') {
            postState();
        } else if (message && message.type === 'executeInput' && typeof _commandHandler === 'function') {
            try {
                await _commandHandler(String(message.code || ''));
            } catch (error) {
                console.error('Stata All in One: Embedded Console input execution failed:', error.message);
            }
        }
    });
    return _panel;
}

function ensurePanel() {
    if (_panel) {
        _panel.title = getPanelTitle();
        return _panel;
    }

    const panel = vscode.window.createWebviewPanel(
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

    return attachPanel(panel);
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
            kind: /^[.]+$/.test(line)
                ? 'raw-progress'
                : (/^>\s?$/.test(line) ? 'raw-prompt' : 'raw'),
            segments: line
                ? [{
                    text: line,
                    tokenType: /^>\s?$/.test(line) ? 'prompt' : 'plain',
                    className: /^>\s?$/.test(line) ? 'tok tok-prompt is-bold' : 'tok tok-plain',
                    style: {
                        color: null,
                        backgroundColor: null,
                        bold: /^>\s?$/.test(line),
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

function setWebviewCommandHandler(handler) {
    _commandHandler = typeof handler === 'function' ? handler : null;
}

function registerWebviewPanelSerializer(context) {
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer(PANEL_VIEW_TYPE, {
            async deserializeWebviewPanel(panel) {
                attachPanel(panel);
                postState();
            }
        })
    );
}

function getAsciiLogo53x13() {
    if (_asciiLogo53x13Cache) {
        return _asciiLogo53x13Cache;
    }

    const logoDir = path.resolve(__dirname, '../../../../ascii_logo/53x13');
    const fallback = { up: 'STATA', down: 'ALL IN ONE' };

    try {
        _asciiLogo53x13Cache = {
            up: fs.readFileSync(path.join(logoDir, 'up.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, ''),
            down: fs.readFileSync(path.join(logoDir, 'down.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '')
        };
        return _asciiLogo53x13Cache;
    } catch (error) {
        console.error('Stata All in One: Failed to load ascii_logo/53x13:', error.message);
        _asciiLogo53x13Cache = fallback;
        return _asciiLogo53x13Cache;
    }
}

function getWebviewHtml() {
    const nonce = String(Date.now());
    const themeVars = getWebviewThemeVariables();
    const asciiLogo = getAsciiLogo53x13();
    const asciiLogoTop = escapeHtml(asciiLogo.up);
    const asciiLogoBottom = escapeHtml(asciiLogo.down);
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
            min-height: calc(100% - 8px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px 8px 24px;
            box-sizing: border-box;
        }
        .placeholder-shell {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            max-width: 100%;
            color: var(--vscode-descriptionForeground);
        }
        .placeholder-logo {
            margin: 0;
            font-family: var(--vscode-editor-font-family, Menlo, Monaco, monospace);
            font-size: clamp(7px, 1.15vw, 11px);
            line-height: 1.12;
            white-space: pre;
            letter-spacing: 0;
            user-select: none;
            text-shadow: 0 0 18px color-mix(in srgb, currentColor 10%, transparent);
        }
        .placeholder-logo-top {
            color: var(--stata-command);
        }
        .placeholder-logo-bottom {
            color: var(--stata-function);
        }
        .placeholder-copy {
            font-style: italic;
            text-align: center;
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
        .line-raw-progress {
            color: var(--stata-comment);
        }
        .line-raw-prompt {
            color: var(--stata-prompt);
        }
        .composer {
            border-top: 1px solid var(--vscode-panel-border);
            background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background));
            padding: 10px 12px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .composer-label {
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            font-weight: 700;
        }
        #input {
            width: 100%;
            min-height: 72px;
            max-height: 240px;
            resize: vertical;
            box-sizing: border-box;
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 8px;
            padding: 10px 12px;
            outline: none;
            font: inherit;
            line-height: 1.5;
        }
        #input:focus {
            border-color: var(--vscode-focusBorder);
        }
        .composer-meta {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .composer-meta code {
            font-family: inherit;
            font-size: inherit;
        }
    </style>
</head>
<body>
    <div class="statusbar">
        <div id="status-dot" class="dot idle"></div>
        <div id="status-label" class="label">${escapeHtml(msg('webviewIdle'))}</div>
    </div>
    <div id="output">
        <div id="placeholder">
            <div class="placeholder-shell">
                <pre class="placeholder-logo placeholder-logo-top">${asciiLogoTop}</pre>
                <pre class="placeholder-logo placeholder-logo-bottom">${asciiLogoBottom}</pre>
                <div class="placeholder-copy">${escapeHtml(msg('webviewWaiting'))}</div>
            </div>
        </div>
    </div>
    <div class="composer">
        <div class="composer-label">Stata Input</div>
        <textarea id="input" spellcheck="false" placeholder=". regress y x1 x2"></textarea>
        <div class="composer-meta">
            <span><code>Enter</code> run, <code>Shift+Enter</code> newline</span>
            <span><code>Up/Down</code> history</span>
        </div>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const output = document.getElementById('output');
        const placeholder = document.getElementById('placeholder');
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('status-label');
        const input = document.getElementById('input');
        const inputHistory = [];
        let historyIndex = -1;

        const STATUS_LABELS = {
            idle: ${JSON.stringify(msg('webviewIdle'))},
            running: ${JSON.stringify(msg('webviewRunning'))},
            error: ${JSON.stringify(msg('webviewError'))}
        };

        function setStatus(status) {
            dot.className = 'dot ' + (status || 'idle');
            label.textContent = STATUS_LABELS[status] || STATUS_LABELS.idle;
            input.disabled = status === 'running';
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

        function pushHistory(code) {
            const normalized = String(code || '').trim();
            if (!normalized) {
                return;
            }
            if (inputHistory[0] !== normalized) {
                inputHistory.unshift(normalized);
            }
            if (inputHistory.length > 100) {
                inputHistory.length = 100;
            }
            historyIndex = -1;
        }

        function replaceInputFromHistory(direction) {
            if (!inputHistory.length) {
                return;
            }
            if (direction < 0) {
                historyIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
            } else if (historyIndex > -1) {
                historyIndex -= 1;
            }

            if (historyIndex === -1) {
                input.value = '';
                return;
            }

            input.value = inputHistory[historyIndex] || '';
            input.selectionStart = input.value.length;
            input.selectionEnd = input.value.length;
        }

        function executeInput() {
            const code = String(input.value || '');
            if (!code.trim() || input.disabled) {
                return;
            }
            pushHistory(code);
            vscode.postMessage({
                type: 'executeInput',
                code
            });
            input.value = '';
        }

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                executeInput();
                return;
            }

            if (event.key === 'ArrowUp' && input.selectionStart === 0 && input.selectionEnd === 0) {
                event.preventDefault();
                replaceInputFromHistory(-1);
                return;
            }

            if (event.key === 'ArrowDown' && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
                event.preventDefault();
                replaceInputFromHistory(1);
            }
        });

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
    setWebviewCommandHandler,
    registerWebviewPanelSerializer,
    clearWebviewTerminalPanel: clearPanel,
    setWebviewTerminalStatus: setStatus
};
