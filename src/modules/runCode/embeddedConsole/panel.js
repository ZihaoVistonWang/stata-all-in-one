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
let _actionHandler = null;
let _asciiLogo53x13Cache = null;
let _lastRunFailed = false;
let _overflowNoticeSuppressed = false;

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
        } else if (message && (message.type === 'stopExecution' || message.type === 'clearConsole') && typeof _actionHandler === 'function') {
            try {
                await _actionHandler(message.type);
            } catch (error) {
                console.error('Stata All in One: Embedded Console action failed:', error.message);
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
        entries: _history,
        overflowNoticeSuppressed: _overflowNoticeSuppressed
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
    _lastRunFailed = false;
    _status = 'idle';
    if (_panel) {
        _panel.webview.postMessage({
            type: 'clear'
        });
        _panel.webview.postMessage({
            type: 'status',
            status: 'idle'
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
        _lastRunFailed = false;
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
        _lastRunFailed = true;
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
        setStatus(_lastRunFailed ? 'error' : 'success');
    }

    dispose() {}
}

function getWebviewTerminalSink() {
    return new WebviewTerminalSink();
}

function setWebviewCommandHandler(handler) {
    _commandHandler = typeof handler === 'function' ? handler : null;
}

function setWebviewActionHandler(handler) {
    _actionHandler = typeof handler === 'function' ? handler : null;
}

function setOverflowNoticeSuppressed(suppressed) {
    _overflowNoticeSuppressed = Boolean(suppressed);
    if (_panel) {
        _panel.webview.postMessage({
            type: 'overflowNoticePreference',
            suppressed: _overflowNoticeSuppressed
        });
    }
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
        body[data-status="running"] .tok-prompt {
            color: #d7ba7d;
            animation: prompt-pulse 1.1s ease-in-out infinite;
        }
        body[data-status="success"] .tok-prompt {
            color: #4ec9b0;
        }
        body[data-status="error"] .tok-prompt {
            color: #f14c4c;
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
            transition: background-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
        }
        .dot.running {
            background: #d7ba7d;
            animation: status-pulse 1.1s ease-in-out infinite;
        }
        .dot.success {
            background: #4ec9b0;
        }
        .dot.idle {
            background: var(--vscode-descriptionForeground);
        }
        .dot.error {
            background: #f14c4c;
        }
        @keyframes status-pulse {
            0%,
            100% {
                opacity: 1;
                box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 18%, transparent);
            }
            50% {
                opacity: 0.42;
                box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 10%, transparent);
            }
        }
        @keyframes prompt-pulse {
            0%,
            100% {
                opacity: 1;
            }
            50% {
                opacity: 0.38;
            }
        }
        .label {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.02em;
            text-transform: uppercase;
        }
        .statusbar-spacer {
            flex: 1;
        }
        .statusbar-actions {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .statusbar-button {
            border: 1px solid var(--vscode-toolbar-hoverBackground);
            background: transparent;
            color: var(--vscode-foreground);
            border-radius: 6px;
            padding: 3px 8px;
            font: inherit;
            font-size: 11px;
            line-height: 1.2;
            cursor: pointer;
        }
        .statusbar-button:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        .statusbar-button:disabled {
            opacity: 0.45;
            cursor: default;
        }
        #output {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 16px 18px 22px 6px;
            font-family: var(--vscode-editor-font-family, var(--vscode-editor-font-family), Menlo, Monaco, monospace);
            font-size: var(--vscode-editor-font-size, 13px);
            line-height: 1.5;
            white-space: normal;
            word-break: normal;
        }
        #output-shell {
            max-width: 100%;
            padding-left: 4px;
            min-height: 100%;
            display: flex;
            flex-direction: column;
        }
        #placeholder {
            min-height: calc(100% - 8px);
            flex: 1;
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
            margin: 0;
            padding-left: 0.9rem;
            white-space: pre-wrap;
            tab-size: 4;
            word-break: break-word;
        }
        .line-command,
        .line-comment-command,
        .line-raw-progress,
        .line-raw-prompt {
            padding-left: 0;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .line-command,
        .line-comment-command {
            padding-left: 1.4rem;
            text-indent: -1.4rem;
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
            margin-top: 0.35rem;
            padding-left: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .line-footer::before,
        .line-footer::after {
            content: '';
            flex: 1 1 auto;
            min-width: 24px;
            border-top: 1px solid color-mix(in srgb, var(--stata-separator) 80%, transparent);
        }
        .line-footer > span {
            flex: 0 0 auto;
        }
        .line-blank {
            min-height: 0.8em;
        }
        .line-command-gap {
            margin-bottom: 0.32rem;
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
        .overflow-notice {
            position: fixed;
            right: 14px;
            bottom: 14px;
            width: min(360px, calc(100vw - 28px));
            padding: 12px 12px 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 10px;
            background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background));
            box-shadow: 0 10px 30px color-mix(in srgb, black 18%, transparent);
            z-index: 4;
        }
        .overflow-notice[hidden] {
            display: none;
        }
        .overflow-notice-copy {
            font-size: 12px;
            line-height: 1.45;
            color: var(--vscode-foreground);
        }
        .overflow-notice-actions {
            margin-top: 10px;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
        .overflow-notice-button {
            border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
            background: transparent;
            color: var(--vscode-foreground);
            border-radius: 6px;
            padding: 4px 10px;
            font: inherit;
            font-size: 11px;
            cursor: pointer;
        }
        .overflow-notice-button:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        .result-block-scroll {
            overflow-x: auto;
            overflow-y: hidden;
            margin: 0.15rem 0 0.35rem;
            padding-bottom: 2px;
        }
        .result-block-scroll .line {
            min-width: max-content;
            white-space: pre;
            word-break: normal;
        }
    </style>
</head>
<body>
    <div class="statusbar">
        <div id="status-dot" class="dot idle"></div>
        <div id="status-label" class="label">${escapeHtml(msg('webviewIdle'))}</div>
        <div class="statusbar-spacer"></div>
        <div class="statusbar-actions">
            <button id="stop-button" class="statusbar-button" type="button">Break</button>
            <button id="clear-button" class="statusbar-button" type="button">Clear</button>
        </div>
    </div>
    <div id="output">
        <div id="output-shell">
            <div id="placeholder">
                <div class="placeholder-shell">
                    <pre class="placeholder-logo placeholder-logo-top">${asciiLogoTop}</pre>
                    <pre class="placeholder-logo placeholder-logo-bottom">${asciiLogoBottom}</pre>
                    <div class="placeholder-copy">${escapeHtml(msg('webviewWaiting'))}</div>
                </div>
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
    <div id="overflow-notice" class="overflow-notice" hidden>
        <div class="overflow-notice-copy">${escapeHtml(msg('webviewOverflowNotice'))}</div>
        <div class="overflow-notice-actions">
            <button id="overflow-ok" class="overflow-notice-button" type="button">${escapeHtml(msg('webviewOverflowConfirm'))}</button>
            <button id="overflow-never" class="overflow-notice-button" type="button">${escapeHtml(msg('webviewOverflowDismissForever'))}</button>
        </div>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const output = document.getElementById('output');
        const outputShell = document.getElementById('output-shell');
        const placeholder = document.getElementById('placeholder');
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('status-label');
        const input = document.getElementById('input');
        const stopButton = document.getElementById('stop-button');
        const clearButton = document.getElementById('clear-button');
        const overflowNotice = document.getElementById('overflow-notice');
        const overflowOk = document.getElementById('overflow-ok');
        const overflowNever = document.getElementById('overflow-never');
        const inputHistory = [];
        let historyIndex = -1;
        let overflowNoticeSuppressed = false;
        let overflowNoticeDismissedForCurrentView = false;
        let renderedEntries = [];

        const STATUS_LABELS = {
            idle: ${JSON.stringify(msg('webviewIdle'))},
            success: ${JSON.stringify(msg('webviewIdle'))},
            running: ${JSON.stringify(msg('webviewRunning'))},
            error: ${JSON.stringify(msg('webviewError'))}
        };

        function setStatus(status) {
            document.body.dataset.status = status || 'idle';
            dot.className = 'dot ' + (status || 'idle');
            label.textContent = STATUS_LABELS[status] || STATUS_LABELS.idle;
            input.disabled = status === 'running';
            stopButton.disabled = status !== 'running';
        }

        function ensurePlaceholderVisibility() {
            placeholder.style.display = outputShell.childElementCount > 1 ? 'none' : '';
        }

        function hasOverflowingScrollableResultBlock() {
            const blocks = outputShell.querySelectorAll('.result-block-scroll');
            for (const block of blocks) {
                if (block.scrollWidth > block.clientWidth + 4) {
                    return true;
                }
            }
            return false;
        }

        function updateOverflowNotice() {
            const shouldShow = !overflowNoticeSuppressed
                && !overflowNoticeDismissedForCurrentView
                && outputShell.childElementCount > 1
                && hasOverflowingScrollableResultBlock();
            overflowNotice.hidden = !shouldShow;
        }

        function appendEntries(entries) {
            if (!Array.isArray(entries) || entries.length === 0) {
                return;
            }

            const shouldStick = output.scrollTop + output.clientHeight >= output.scrollHeight - 24;
            renderedEntries = renderedEntries.concat(entries);
            renderAllEntries();
            if (shouldStick) {
                output.scrollTop = output.scrollHeight;
            }
            requestAnimationFrame(updateOverflowNotice);
        }

        function resetOutput(entries) {
            renderedEntries = Array.isArray(entries) ? entries.slice() : [];
            overflowNoticeDismissedForCurrentView = false;
            renderAllEntries();
            requestAnimationFrame(updateOverflowNotice);
        }

        function renderAllEntries() {
            while (outputShell.firstChild) {
                outputShell.removeChild(outputShell.firstChild);
            }
            outputShell.appendChild(placeholder);
            if (renderedEntries.length) {
                outputShell.appendChild(renderEntriesToFragment(renderedEntries));
            }
            ensurePlaceholderVisibility();
        }

        function renderEntriesToFragment(entries) {
            const fragment = document.createDocumentFragment();
            let index = 0;

            if (entries.length > 0 && !isCommandEntry(entries[0])) {
                const leadingEntries = [];
                while (index < entries.length && !isCommandEntry(entries[index])) {
                    leadingEntries.push(entries[index]);
                    index += 1;
                }
                const leadingBlock = renderResultBlock(leadingEntries);
                if (leadingBlock) {
                    fragment.appendChild(leadingBlock);
                }
            }

            while (index < entries.length) {
                const entry = entries[index];

                if (isCommandEntry(entry)) {
                    fragment.appendChild(renderEntry(entry, entries[index + 1] || null));
                    index += 1;
                    const resultEntries = [];
                    while (index < entries.length && !isCommandEntry(entries[index])) {
                        resultEntries.push(entries[index]);
                        index += 1;
                    }
                    const block = renderResultBlock(resultEntries);
                    if (block) {
                        fragment.appendChild(block);
                    }
                }
            }
            return fragment;
        }

        function isTableEntry(entry) {
            const kind = String((entry && entry.kind) || '');
            return kind === 'separator' || kind === 'table-header' || kind === 'table-data';
        }

        function isCommandEntry(entry) {
            const kind = String((entry && entry.kind) || '');
            return kind === 'command' || kind === 'comment-command' || kind === 'raw-progress' || kind === 'raw-prompt';
        }

        function renderResultBlock(entries) {
            if (!Array.isArray(entries) || entries.length === 0) {
                return null;
            }

            const block = document.createElement('div');
            if (entries.some(isTableEntry)) {
                block.className = 'result-block-scroll';
            }

            for (let index = 0; index < entries.length; index += 1) {
                block.appendChild(renderEntry(entries[index], entries[index + 1] || null));
            }

            return block;
        }

        function renderEntry(entry, nextEntry) {
            const line = document.createElement('div');
            const kind = String((entry && entry.kind) || 'default');
            line.className = 'line line-' + kind;
            if ((kind === 'command' || kind === 'comment-command') && (!nextEntry || !['command', 'comment-command'].includes(String(nextEntry.kind || '')))) {
                line.classList.add('line-command-gap');
            }

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

            return line;
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

        stopButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'stopExecution' });
        });

        clearButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'clearConsole' });
        });

        overflowOk.addEventListener('click', () => {
            overflowNoticeDismissedForCurrentView = true;
            updateOverflowNotice();
        });

        overflowNever.addEventListener('click', () => {
            overflowNoticeDismissedForCurrentView = true;
            overflowNoticeSuppressed = true;
            updateOverflowNotice();
            vscode.postMessage({ type: 'suppressOverflowNoticeForever' });
        });

        window.addEventListener('resize', () => {
            updateOverflowNotice();
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
                overflowNoticeSuppressed = Boolean(message.overflowNoticeSuppressed);
                overflowNoticeDismissedForCurrentView = false;
                resetOutput(message.entries || []);
            } else if (message.type === 'overflowNoticePreference') {
                overflowNoticeSuppressed = Boolean(message.suppressed);
                if (overflowNoticeSuppressed) {
                    overflowNoticeDismissedForCurrentView = true;
                }
                updateOverflowNotice();
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
    setWebviewActionHandler,
    setOverflowNoticeSuppressed,
    registerWebviewPanelSerializer,
    clearWebviewTerminalPanel: clearPanel,
    setWebviewTerminalStatus: setStatus
};
