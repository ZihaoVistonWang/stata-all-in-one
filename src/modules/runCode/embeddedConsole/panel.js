const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { StataTerminalRenderer, getWebviewThemeVariables } = require('./renderer');
const { msg } = require('../../../utils/common');
const { StataBuiltinCommands, StataKeywords, StataFunctions, extractVariableNames } = require('../../completionProvider');
const config = require('../../../utils/config');

const _renderer = new StataTerminalRenderer();

const PANEL_VIEW_TYPE = 'stata-all-in-one.webviewTerminal';

let _panel = null;
let _history = [];
let _status = 'idle';
let _commandHandler = null;
let _actionHandler = null;
let _asciiLogo53x13Cache = null;
let _lastRunFailed = false;
let _overflowNoticeSuppressed = false;
let _extensionUri = null;
let _workingDetail = null;
let _consoleFontOptions = {
    fontMode: 'editor',
    editorFontFamily: '',
    customFontFamily: '',
    systemFallbackFamily: 'monospace'
};

function getPanelTitle() {
    return msg('webviewPanelTitle');
}

function getPanelIconPath() {
    if (!_extensionUri) {
        return undefined;
    }

    const iconUri = vscode.Uri.joinPath(_extensionUri, 'img', 'console-tab.svg');
    return {
        light: iconUri,
        dark: iconUri
    };
}

function highlightInputText(text) {
    if (!text) {
        return [];
    }
    const lines = text.split('\\n');
    const result = [];
    for (let li = 0; li < lines.length; li++) {
        if (li > 0) {
            result.push({ text: '\\n', tokenType: 'plain', className: 'tok tok-plain', style: {} });
        }
        const line = lines[li];
        if (!line) {
            continue;
        }
        try {
            const entry = _renderer._segmentCommandLine(line);
            if (entry && Array.isArray(entry.segments)) {
                for (const seg of entry.segments) {
                    result.push(seg);
                }
            }
        } catch (_e) {
            result.push({ text: line, tokenType: 'plain', className: 'tok tok-plain', style: {} });
        }
    }
    return result;
}

function attachPanel(panel) {
    _panel = panel;
    _panel.title = getPanelTitle();
    _panel.iconPath = getPanelIconPath();
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
            postVariables();
        } else if (message && message.type === 'requestVariables') {
            postVariables();
        } else if (message && message.type === 'executeInput' && typeof _commandHandler === 'function') {
            try {
                await _commandHandler(String(message.code || ''));
            } catch (error) {
                console.error('Stata All in One: Embedded Console input execution failed:', error.message);
            }
        } else if (message && message.type === 'highlightInput') {
            if (_panel) {
                const segments = highlightInputText(String(message.text || ''));
                _panel.webview.postMessage({ type: 'highlightResult', segments });
            }
        } else if (message && message.type === 'showDataViewer') {
            const config = require('../../../utils/config');
            if (config.getRunMode() === 'embeddedConsole') {
                const { revealDataViewer } = require('./dataViewer/panel');
                revealDataViewer();
            }
        } else if (message && (message.type === 'stopExecution' || message.type === 'clearConsole' || message.type === 'showOverflowNotice') && typeof _actionHandler === 'function') {
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
        _panel.iconPath = getPanelIconPath();
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
        overflowNoticeSuppressed: _overflowNoticeSuppressed,
        workingDetail: _workingDetail
    });
}

function postVariables() {
    if (!_panel) return;
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'stata') {
        try {
            const vars = [...extractVariableNames(editor.document)];
            _panel.webview.postMessage({ type: 'variablesUpdate', variables: vars });
        } catch (_e) {}
    }
}

async function revealPanel(preserveFocus = true) {
    const existingPanel = _panel;
    const panel = ensurePanel();
    if (!(existingPanel && existingPanel.visible)) {
        panel.reveal(vscode.ViewColumn.Beside, preserveFocus);
    }
    postState();
    return panel;
}

function setStatus(status) {
    _status = status;
    if (status !== 'running') {
        _workingDetail = null;
    }
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
    _workingDetail = null;
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
        _lastRunFailed = false;
        setWorkingDetail(null);
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
        _lastRunFailed = true;
        setStatus('error');
        appendEntries(this._renderer.renderErrorSegments(text));
    }

    writeWarningMessage(text) {
        appendEntries(this._renderer.renderWarningBlockSegments(text));
    }

    setStatus(status) {
        setStatus(status);
    }

    setWorkingDetail(detail) {
        setWorkingDetail(detail);
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

    discardBufferedOutput() {
        this._renderer.discardPendingOutput();
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

function setWorkingDetail(detail) {
    if (detail && typeof detail === 'object') {
        _workingDetail = detail;
    } else if (detail) {
        _workingDetail = String(detail);
    } else {
        _workingDetail = null;
    }
    if (_panel) {
        _panel.webview.postMessage({
            type: 'workingDetail',
            detail: _workingDetail
        });
    }
}

function registerWebviewPanelSerializer(context) {
    _extensionUri = context.extensionUri;
    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer(PANEL_VIEW_TYPE, {
            async deserializeWebviewPanel(panel) {
                clearPanel();
                attachPanel(panel);
            }
        })
    );
}

function setConsoleFontOptions(options) {
    _consoleFontOptions = Object.assign({}, _consoleFontOptions, options || {});
    if (_panel) {
        _panel.webview.html = getWebviewHtml(_panel.webview);
        postState();
    }
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
    const fontOptions = {
        fontMode: String(_consoleFontOptions.fontMode || 'editor'),
        editorFontFamily: String(_consoleFontOptions.editorFontFamily || ''),
        customFontFamily: String(_consoleFontOptions.customFontFamily || ''),
        systemFallbackFamily: String(_consoleFontOptions.systemFallbackFamily || 'monospace')
    };
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
            --stata-command: ${themeVars.command || 'var(--vscode-editor-foreground)'};
            --stata-keyword: ${themeVars.keyword || 'var(--vscode-editor-foreground)'};
            --stata-string: ${themeVars.string || 'var(--vscode-editor-foreground)'};
            --stata-path: ${themeVars.path || 'var(--vscode-editor-foreground)'};
            --stata-number: ${themeVars.number || 'var(--vscode-editor-foreground)'};
            --stata-comment: ${themeVars.comment || 'var(--vscode-descriptionForeground)'};
            --stata-function: ${themeVars.function || 'var(--vscode-editor-foreground)'};
            --stata-option: ${themeVars.option || 'var(--stata-function)'};
            --stata-variable: ${themeVars.variable || 'var(--vscode-editor-foreground)'};
            --stata-macro: ${themeVars.macro || 'var(--stata-variable)'};
            --stata-operator: ${themeVars.operator || 'var(--vscode-editor-foreground)'};
            --stata-plain: ${themeVars.plain || 'var(--vscode-editor-foreground)'};
            --stata-default: ${themeVars.default || 'var(--vscode-editor-foreground)'};
            --stata-error: ${themeVars.error || 'var(--vscode-errorForeground)'};
            --stata-header: ${themeVars.header || 'var(--vscode-textLink-foreground)'};
            --stata-separator: ${themeVars.separator || 'var(--vscode-panel-border)'};
            --stata-time: ${themeVars.time || 'var(--vscode-editor-foreground)'};
            --stata-time-value: ${themeVars.timeValue || 'var(--stata-number)'};
            --console-editor-font-family: var(--vscode-editor-font-family, monospace);
            --console-custom-font-family: var(--console-editor-font-family);
            --console-system-fallback-family: ${escapeHtml(fontOptions.systemFallbackFamily)};
            --console-active-font-family: var(--console-editor-font-family);
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
            border: none;
            background: transparent;
            color: var(--vscode-foreground);
            border-radius: 6px;
            width: 24px;
            height: 24px;
            padding: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }
        .statusbar-button:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 1px;
        }
        .statusbar-icon {
            width: 18px;
            height: 18px;
            fill: currentColor;
            pointer-events: none;
        }
        .statusbar-button:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        .statusbar-button:disabled {
            opacity: 0.45;
            cursor: default;
        }
        #clear-button {
            color: color-mix(in srgb, var(--vscode-foreground) 72%, transparent);
            transition: color 120ms ease, background-color 120ms ease;
        }
        #clear-button:hover {
            color: var(--vscode-foreground);
        }
        #stop-button {
            color: #f14c4c66;
            transition: color 120ms ease;
        }
        body[data-status="running"] #stop-button {
            color: #f14c4c;
        }
        #output {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 16px 18px 22px 6px;
            font-family: var(--console-active-font-family);
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
            font-family: var(--console-active-font-family);
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
            padding-left: 2ch;
            text-indent: -2ch;
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
            padding-left: 2ch;
            padding-right: 2ch;
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
        #working-indicator {
            display: none;
            align-items: center;
            gap: 10px;
            padding: 0 2ch;
            min-height: 1.5em;
            color: var(--vscode-descriptionForeground);
        }
        body[data-status="running"] #working-indicator {
            display: flex;
        }
        .working-bullet {
            color: var(--stata-comment);
            flex: 0 0 auto;
        }
        .working-text {
            font-weight: 700;
            color: var(--stata-option);
        }
        .working-meta {
            color: var(--stata-comment);
        }
        body[data-status="running"] .working-text {
            animation: working-pulse 1.1s ease-in-out infinite;
        }
        @keyframes working-pulse {
            0% {
                opacity: 0.76;
                transform: translateX(0);
                text-shadow: none;
            }
            50% {
                opacity: 1;
                transform: translateX(0.6px);
                text-shadow: 0 0 10px color-mix(in srgb, var(--stata-option) 55%, transparent);
            }
            100% {
                opacity: 0.76;
                transform: translateX(0);
                text-shadow: none;
            }
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
        .composer-input-wrapper {
            display: grid;
            width: 100%;
            position: relative;
        }
        .composer-input-wrapper > * {
            grid-area: 1 / 1;
        }
        #input-highlight {
            width: 100%;
            min-height: 72px;
            max-height: 240px;
            box-sizing: border-box;
            border: 1px solid transparent;
            border-radius: 8px;
            padding: 10px 12px;
            margin: 0;
            font-family: var(--console-active-font-family);
            font-size: var(--vscode-editor-font-size, 13px);
            line-height: 1.5;
            tab-size: 4;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow-y: auto;
            background: var(--vscode-input-background);
            pointer-events: none;
            z-index: 0;
        }
        #input {
            z-index: 1;
            width: 100%;
            min-height: 72px;
            max-height: 240px;
            resize: vertical;
            box-sizing: border-box;
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            background: transparent;
            color: transparent;
            caret-color: var(--vscode-input-foreground);
            border-radius: 8px;
            padding: 10px 12px;
            outline: none;
            font-family: var(--console-active-font-family);
            font-size: var(--vscode-editor-font-size, 13px);
            line-height: 1.5;
            tab-size: 4;
            overflow-y: auto;
        }
        #input:focus {
            border-color: var(--vscode-focusBorder);
        }
        #input:disabled {
            opacity: 0.5;
        }
        .autocomplete-dropdown {
            position: absolute;
            z-index: 10;
            bottom: 100%;
            left: 12px;
            margin-bottom: 2px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 6px;
            max-height: 180px;
            overflow-y: auto;
            box-shadow: 0 -2px 12px rgba(0,0,0,0.3);
            font-family: var(--console-active-font-family);
            font-size: var(--vscode-editor-font-size, 13px);
            line-height: 1.5;
            min-width: 160px;
            display: none;
        }
        .autocomplete-dropdown.visible {
            display: block;
        }
        .autocomplete-item {
            padding: 4px 12px;
            cursor: pointer;
            color: var(--vscode-input-foreground);
        }
        .autocomplete-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
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
            <button id="stop-button" class="statusbar-button" type="button" title="${escapeHtml(msg('webviewStop'))}">
                <svg class="statusbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5A6.5 6.5 0 0 0 8 1.5zm0 12a5.5 5.5 0 1 1 5.5-5.5A5.5 5.5 0 0 1 8 13.5z"></path>
                    <rect x="5.5" y="5.5" width="5" height="5" rx="1"></rect>
                </svg>
            </button>
            <button id="clear-button" class="statusbar-button" type="button" title="${escapeHtml(msg('webviewClear'))}">
                <svg class="statusbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2 3h12v1H2V3zm0 4h12v1H2V7zm0 4h7v1H2v-1zm9.85-1.71 1.15-1.15.71.71-1.14 1.15 1.14 1.14-.71.71-1.15-1.14-1.14 1.14-.71-.71 1.14-1.14-1.14-1.15.71-.71 1.14 1.15z"></path>
                </svg>
            </button>
            <button id="data-button" class="statusbar-button" type="button" title="${escapeHtml(msg('dataViewerPanelTitle'))}">
                <svg class="statusbar-icon" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2 2h12l1 1v10l-1 1H2l-1-1V3l1-1zm0 1v2h12V3H2zm0 3v3h3V6H2zm4 0v3h4V6H6zm5 0v3h3V6h-3zm-9 4v3h3v-3H2zm4 0v3h4v-3H6zm5 0v3h3v-3h-3z"></path>
                </svg>
            </button>
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
        <div id="working-indicator" aria-hidden="true">
            <span class="working-bullet">•</span>
            <span class="working-text">Working</span>
            <span class="working-meta">(<span id="working-seconds">0s</span><span id="working-detail-shell" hidden> • <span id="working-detail"></span></span> • esc to interrupt)</span>
        </div>
    </div>
    <div class="composer">
        <div class="composer-label">${escapeHtml(msg('webviewInputLabel'))}</div>
        <div class="composer-input-wrapper">
            <pre id="input-highlight" aria-hidden="true"></pre>
            <textarea id="input" spellcheck="false"></textarea>
            <div class="autocomplete-dropdown" id="autocomplete-dropdown"></div>
        </div>
        <div class="composer-meta">
            <span><code>Enter</code> ${escapeHtml(msg('webviewRun'))}, <code>Shift+Enter</code> ${escapeHtml(msg('webviewNewline'))}</span>
            <span><code>Up/Down</code> ${escapeHtml(msg('webviewHistory'))}</span>
        </div>
    </div>
    <script nonce="${nonce}">
        document.body.dataset.scriptStarted = '1';
        const vscode = acquireVsCodeApi();
        const output = document.getElementById('output');
        const outputShell = document.getElementById('output-shell');
        const workingIndicator = document.getElementById('working-indicator');
        const workingSeconds = document.getElementById('working-seconds');
        const workingDetailShell = document.getElementById('working-detail-shell');
        const workingDetail = document.getElementById('working-detail');
        const placeholder = document.getElementById('placeholder');
        const dot = document.getElementById('status-dot');
        const label = document.getElementById('status-label');
        const input = document.getElementById('input');
        const stopButton = document.getElementById('stop-button');
        const clearButton = document.getElementById('clear-button');
        const dataButton = document.getElementById('data-button');
        const inputHighlight = document.getElementById('input-highlight');
        const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
        const inputHistory = [];
        let historyIndex = -1;
        let overflowNoticeSuppressed = false;
        let overflowNoticeDismissedForCurrentView = false;
        let renderedEntries = [];
        let activeResultBlock = null;
        let runningStartedAt = 0;
        let workingTimer = null;
        let currentWorkingDetail = null;
        let estimatedFinishAt = 0;
        let displayedRemainingSeconds = 0;
        let highlightSuppressed = false;
        let pendingFocus = false;
        let wasRunning = false;

        const STATUS_LABELS = {
            idle: ${JSON.stringify(msg('webviewIdle'))},
            success: ${JSON.stringify(msg('webviewIdle'))},
            running: ${JSON.stringify(msg('webviewRunning'))},
            error: ${JSON.stringify(msg('webviewError'))}
        };
        const FONT_BOOTSTRAP = ${JSON.stringify(fontOptions)};
        const StataCommands = ${JSON.stringify([...new Set([...StataBuiltinCommands, ...StataKeywords, ...StataFunctions, ...config.getCustomCommands()])])};
        var AutocompleteVariables = [];

        var autocompleteActiveIndex = -1;
        var autocompleteVisible = false;

        function getCurrentWord() {
            var text = input.value || '';
            var pos = input.selectionStart || 0;
            var start = pos;
            while (start > 0 && /[A-Za-z_]/.test(text[start - 1])) {
                start--;
            }
            return { word: text.slice(start, pos), start: start, end: pos };
        }

        function showAutocomplete(matches, wordStart) {
            if (!matches.length) {
                hideAutocomplete();
                return;
            }
            autocompleteDropdown.innerHTML = '';
            for (var i = 0; i < matches.length; i++) {
                var item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.textContent = matches[i];
                item.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    applyAutocomplete(this.textContent, wordStart);
                });
                autocompleteDropdown.appendChild(item);
            }
            autocompleteActiveIndex = 0;
            if (autocompleteDropdown.firstChild) {
                autocompleteDropdown.firstChild.className = 'autocomplete-item active';
            }
            autocompleteDropdown.classList.add('visible');
            autocompleteVisible = true;
        }

        function hideAutocomplete() {
            autocompleteDropdown.classList.remove('visible');
            autocompleteDropdown.innerHTML = '';
            autocompleteActiveIndex = -1;
            autocompleteVisible = false;
        }

        function applyAutocomplete(command, wordStart) {
            var text = input.value || '';
            var pos = input.selectionStart || 0;
            var wordEnd = pos;
            while (wordEnd < text.length && /[A-Za-z_]/.test(text[wordEnd])) {
                wordEnd++;
            }
            input.value = text.slice(0, wordStart) + command + ' ' + text.slice(wordEnd);
            input.selectionStart = input.selectionEnd = wordStart + command.length + 1;
            hideAutocomplete();
            updateInputHighlight();
        }

        function triggerAutocomplete() {
            if (input.disabled) return;
            var current = getCurrentWord();
            if (!current.word || current.word.length < 2) {
                hideAutocomplete();
                return;
            }
            var prefix = current.word.toLowerCase();
            var matches = [];
            for (var i = 0; i < StataCommands.length && matches.length < 8; i++) {
                if (StataCommands[i].toLowerCase().indexOf(prefix) === 0) {
                    matches.push(StataCommands[i]);
                }
            }
            for (var i = 0; i < AutocompleteVariables.length && matches.length < 8; i++) {
                if (AutocompleteVariables[i].toLowerCase().indexOf(prefix) === 0 && matches.indexOf(AutocompleteVariables[i]) < 0) {
                    matches.push(AutocompleteVariables[i]);
                }
            }
            if (matches.length === 1 && matches[0].toLowerCase() === prefix) {
                hideAutocomplete();
                return;
            }
            showAutocomplete(matches, current.start);
        }

        function navigateAutocomplete(direction) {
            if (!autocompleteVisible) return;
            var items = autocompleteDropdown.children;
            if (!items.length) return;
            items[autocompleteActiveIndex].classList.remove('active');
            autocompleteActiveIndex += direction;
            if (autocompleteActiveIndex < 0) autocompleteActiveIndex = items.length - 1;
            if (autocompleteActiveIndex >= items.length) autocompleteActiveIndex = 0;
            items[autocompleteActiveIndex].classList.add('active');
            items[autocompleteActiveIndex].scrollIntoView({ block: 'nearest' });
        }

        function selectAutocomplete() {
            if (!autocompleteVisible) return false;
            var items = autocompleteDropdown.children;
            if (autocompleteActiveIndex >= 0 && autocompleteActiveIndex < items.length) {
                var current = getCurrentWord();
                applyAutocomplete(items[autocompleteActiveIndex].textContent, current.start);
                return true;
            }
            return false;
        }

        function requestHighlight() {
            vscode.postMessage({ type: 'highlightInput', text: input.value || '' });
        }

        function renderHighlightSegments(segments) {
            if (!inputHighlight) {
                return;
            }
            inputHighlight.innerHTML = '';
            if (highlightSuppressed || !segments || !segments.length) {
                return;
            }
            for (var i = 0; i < segments.length; i++) {
                var seg = segments[i];
                var span = document.createElement('span');
                var className = String(seg.className || '').trim();
                if (className) {
                    span.className = className;
                }
                var style = seg.style || {};
                if (style.color) {
                    span.style.color = style.color;
                }
                if (style.backgroundColor) {
                    span.style.backgroundColor = style.backgroundColor;
                }
                if (style.bold) {
                    span.style.fontWeight = 'bold';
                }
                if (style.italic) {
                    span.style.fontStyle = 'italic';
                }
                span.textContent = String(seg.text || '');
                inputHighlight.appendChild(span);
            }
            inputHighlight.scrollTop = input.scrollTop;
            inputHighlight.scrollLeft = input.scrollLeft;
        }

        function updateInputHighlight() {
            if (!inputHighlight) return;
            var text = input.value || '';
            if (!text) {
                inputHighlight.innerHTML = '';
                return;
            }
            requestHighlight();
        }

        function formatDurationSeconds(seconds, options = {}) {
            const safeSeconds = Math.max(0, Number(seconds) || 0);
            const hours = Math.floor(safeSeconds / 3600);
            const minutes = Math.floor((safeSeconds % 3600) / 60);
            const wholeSeconds = Math.floor(safeSeconds % 60);

            if (hours > 0) {
                return hours + 'h ' + minutes + 'm ' + wholeSeconds + 's';
            }

            if (minutes > 0) {
                return minutes + 'm ' + wholeSeconds + 's';
            }

            return safeSeconds.toFixed(1) + 's';
        }

        function formatCount(value) {
            return Math.max(0, Number(value) || 0).toLocaleString('en-US');
        }

        function getWorkingDetailDisplay() {
            if (!currentWorkingDetail) {
                return '';
            }

            if (typeof currentWorkingDetail === 'string') {
                return currentWorkingDetail;
            }

            if (currentWorkingDetail.kind === 'progress') {
                const current = Number(currentWorkingDetail.current) || 0;
                const total = Number(currentWorkingDetail.total) || 0;
                if (current <= 0 || total <= 0) {
                    return '';
                }

                return formatCount(current) + '/' + formatCount(total) + ' [' + formatDurationSeconds(displayedRemainingSeconds) + ']';
            }

            return '';
        }

        function updateEstimatedFinishTime() {
            if (!currentWorkingDetail || currentWorkingDetail.kind !== 'progress' || !runningStartedAt) {
                estimatedFinishAt = 0;
                displayedRemainingSeconds = 0;
                return;
            }

            const current = Number(currentWorkingDetail.current) || 0;
            const total = Number(currentWorkingDetail.total) || 0;
            if (current <= 0 || total <= 0 || current >= total) {
                estimatedFinishAt = 0;
                displayedRemainingSeconds = 0;
                return;
            }

            const elapsedSeconds = Math.max(0.1, (Date.now() - runningStartedAt) / 1000);
            const estimatedRemainingSeconds = (elapsedSeconds / current) * (total - current);
            estimatedFinishAt = Date.now() + (estimatedRemainingSeconds * 1000);
        }

        function refreshDisplayedRemainingSeconds() {
            displayedRemainingSeconds = estimatedFinishAt
                ? Math.max(0, (estimatedFinishAt - Date.now()) / 1000)
                : 0;
        }

        function getEditorFontFamilyCssValue() {
            if (FONT_BOOTSTRAP.editorFontFamily && FONT_BOOTSTRAP.editorFontFamily.trim()) {
                return FONT_BOOTSTRAP.editorFontFamily.trim();
            }

            const vscodeEditorFontFamily = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-font-family').trim();
            return vscodeEditorFontFamily || 'monospace';
        }

        function setConsoleFontVariables() {
            const rootStyle = document.documentElement.style;
            rootStyle.setProperty('--console-editor-font-family', getEditorFontFamilyCssValue());
            rootStyle.setProperty('--console-custom-font-family', FONT_BOOTSTRAP.customFontFamily && FONT_BOOTSTRAP.customFontFamily.trim()
                ? FONT_BOOTSTRAP.customFontFamily.trim()
                : getEditorFontFamilyCssValue());
            rootStyle.setProperty('--console-system-fallback-family', FONT_BOOTSTRAP.systemFallbackFamily || 'monospace');
            rootStyle.setProperty('--console-active-font-family', getEditorFontFamilyCssValue());
        }

        function getCanvasContext() {
            const canvas = document.createElement('canvas');
            return canvas.getContext('2d');
        }

        function measureTextWidth(context, fontValue, sample) {
            context.font = '16px ' + fontValue;
            return context.measureText(sample).width;
        }

        function behavesLikeMonospace(fontValue) {
            if (!fontValue || !fontValue.trim()) {
                return false;
            }

            const context = getCanvasContext();
            if (!context) {
                return false;
            }

            const samples = [
                ['iiiiiiiiii', 'WWWWWWWWWW'],
                ['0000000000', '..........'],
                ['..........', '__________']
            ];

            return samples.every(pair => {
                const widthA = measureTextWidth(context, fontValue, pair[0]);
                const widthB = measureTextWidth(context, fontValue, pair[1]);
                return Math.abs(widthA - widthB) <= 0.75;
            });
        }

        function applyConsoleFont(source) {
            const rootStyle = document.documentElement.style;
            if (source === 'custom') {
                rootStyle.setProperty('--console-active-font-family', 'var(--console-custom-font-family)');
                return;
            }
            if (source === 'system') {
                rootStyle.setProperty('--console-active-font-family', 'var(--console-system-fallback-family)');
                return;
            }
            rootStyle.setProperty('--console-active-font-family', 'var(--console-editor-font-family)');
        }

        async function bootstrapConsoleFont() {
            setConsoleFontVariables();

            const editorFontFamily = getComputedStyle(document.documentElement).getPropertyValue('--console-editor-font-family');
            const customFontFamily = getComputedStyle(document.documentElement).getPropertyValue('--console-custom-font-family');

            if (FONT_BOOTSTRAP.fontMode === 'system') {
                applyConsoleFont('system');
                return;
            }

            if (FONT_BOOTSTRAP.fontMode === 'custom') {
                if (behavesLikeMonospace(customFontFamily)) {
                    applyConsoleFont('custom');
                    return;
                }

                if (behavesLikeMonospace(editorFontFamily)) {
                    applyConsoleFont('editor');
                    return;
                }

                applyConsoleFont('system');
                return;
            }

            if (FONT_BOOTSTRAP.fontMode === 'editor') {
                if (behavesLikeMonospace(editorFontFamily)) {
                    applyConsoleFont('editor');
                    return;
                }

                applyConsoleFont('system');
                return;
            }

            applyConsoleFont('system');
        }

        function updateWorkingMeta() {
            if (!runningStartedAt) {
                workingSeconds.textContent = '0s';
            } else {
                const elapsedSeconds = Math.max(0, Math.floor((Date.now() - runningStartedAt) / 1000));
                workingSeconds.textContent = elapsedSeconds + 's';
            }
            workingDetail.textContent = getWorkingDetailDisplay();
            workingDetailShell.hidden = !workingDetail.textContent;
        }

        function startWorkingIndicator() {
            runningStartedAt = Date.now();
            workingIndicator.style.display = 'flex';
            refreshDisplayedRemainingSeconds();
            updateWorkingMeta();
            if (workingTimer) {
                clearInterval(workingTimer);
            }
            workingTimer = setInterval(() => {
                refreshDisplayedRemainingSeconds();
                updateWorkingMeta();
            }, 1000);
        }

        function stopWorkingIndicator() {
            runningStartedAt = 0;
            if (workingTimer) {
                clearInterval(workingTimer);
                workingTimer = null;
            }
            displayedRemainingSeconds = 0;
            updateWorkingMeta();
            workingIndicator.style.display = 'none';
        }

        function scrollOutputToBottom() {
            output.scrollTop = output.scrollHeight;
        }

        function setStatus(status) {
            document.body.dataset.status = status || 'idle';
            dot.className = 'dot ' + (status || 'idle');
            label.textContent = STATUS_LABELS[status] || STATUS_LABELS.idle;
            input.disabled = status === 'running';
            stopButton.disabled = status !== 'running';
            if (status === 'running') {
                wasRunning = true;
                startWorkingIndicator();
                requestAnimationFrame(scrollOutputToBottom);
            } else {
                currentWorkingDetail = null;
                estimatedFinishAt = 0;
                displayedRemainingSeconds = 0;
                stopWorkingIndicator();
                if (pendingFocus && wasRunning) {
                    pendingFocus = false;
                    wasRunning = false;
                    input.focus();
                }
            }
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
            if (!shouldShow) {
                return;
            }

            overflowNoticeDismissedForCurrentView = true;
            vscode.postMessage({ type: 'showOverflowNotice' });
        }

        function appendEntries(entries) {
            if (!Array.isArray(entries) || entries.length === 0) {
                return;
            }

            const shouldStick = output.scrollTop + output.clientHeight >= output.scrollHeight - 24;
            renderedEntries = renderedEntries.concat(entries);
            appendRenderedEntries(entries);
            ensurePlaceholderVisibility();
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
            activeResultBlock = null;
            if (renderedEntries.length) {
                appendRenderedEntries(renderedEntries);
            }
            ensurePlaceholderVisibility();
        }

        function appendRenderedEntries(entries) {
            const fragment = document.createDocumentFragment();
            let currentResultBlock = activeResultBlock;

            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index];

                if (isCommandEntry(entry)) {
                    currentResultBlock = null;
                    fragment.appendChild(renderEntry(entry, entries[index + 1] || null));
                    continue;
                }

                if (!currentResultBlock) {
                    currentResultBlock = document.createElement('div');
                    fragment.appendChild(currentResultBlock);
                }

                if (isTableEntry(entry)) {
                    currentResultBlock.className = 'result-block-scroll';
                }

                currentResultBlock.appendChild(renderEntry(entry, entries[index + 1] || null));
            }

            outputShell.appendChild(fragment);
            activeResultBlock = currentResultBlock;
        }

        function isTableEntry(entry) {
            const kind = String((entry && entry.kind) || '');
            return kind === 'separator' || kind === 'table-header' || kind === 'table-data';
        }

        function isCommandEntry(entry) {
            const kind = String((entry && entry.kind) || '');
            return kind === 'command' || kind === 'comment-command' || kind === 'raw-progress' || kind === 'raw-prompt';
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
                highlightSuppressed = false;
                updateInputHighlight();
                return;
            }

            input.value = inputHistory[historyIndex] || '';
            input.selectionStart = input.value.length;
            input.selectionEnd = input.value.length;
            highlightSuppressed = false;
            updateInputHighlight();
        }

        function executeInput() {
            const code = String(input.value || '');
            if (!code.trim() || input.disabled) {
                return;
            }
            if (/^\s*(browse|br)\b/i.test(code)) {
                vscode.postMessage({ type: 'showDataViewer' });
                input.value = '';
                updateInputHighlight();
                return;
            }
            pushHistory(code);
            scrollOutputToBottom();
            vscode.postMessage({
                type: 'executeInput',
                code
            });
            input.value = '';
            highlightSuppressed = true;
            pendingFocus = true;
            wasRunning = false;
            updateInputHighlight();
        }

        input.addEventListener('keydown', (event) => {
            if (event.isComposing) {
                return;
            }
            if (event.key === 'Tab') {
                if (autocompleteVisible) {
                    event.preventDefault();
                    selectAutocomplete();
                    return;
                }
            }
            if (event.key === 'Escape') {
                if (autocompleteVisible) {
                    event.preventDefault();
                    hideAutocomplete();
                    return;
                }
            }
            if (autocompleteVisible && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                event.preventDefault();
                navigateAutocomplete(event.key === 'ArrowUp' ? -1 : 1);
                return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
                if (autocompleteVisible) {
                    event.preventDefault();
                    selectAutocomplete();
                    return;
                }
                event.preventDefault();
                executeInput();
                input.focus();
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

        input.addEventListener('input', () => {
            highlightSuppressed = false;
            updateInputHighlight();
            triggerAutocomplete();
        });

        input.addEventListener('blur', () => {
            setTimeout(function () { hideAutocomplete(); }, 150);
        });

        input.addEventListener('scroll', () => {
            inputHighlight.scrollTop = input.scrollTop;
            inputHighlight.scrollLeft = input.scrollLeft;
        });

        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => {
                inputHighlight.style.height = input.clientHeight + 'px';
            }).observe(input);
        }

        stopButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'stopExecution' });
        });

        clearButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'clearConsole' });
        });

        dataButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'showDataViewer' });
        });

        window.addEventListener('resize', () => {
            updateOverflowNotice();
        });

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && document.body.dataset.status === 'running') {
                event.preventDefault();
                vscode.postMessage({ type: 'stopExecution' });
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
                overflowNoticeSuppressed = Boolean(message.overflowNoticeSuppressed);
                overflowNoticeDismissedForCurrentView = false;
                currentWorkingDetail = message.workingDetail || null;
                updateEstimatedFinishTime();
                refreshDisplayedRemainingSeconds();
                updateWorkingMeta();
                resetOutput(message.entries || []);
            } else if (message.type === 'workingDetail') {
                currentWorkingDetail = message.detail || null;
                updateEstimatedFinishTime();
                if (!displayedRemainingSeconds) {
                    refreshDisplayedRemainingSeconds();
                }
                updateWorkingMeta();
            } else if (message.type === 'highlightResult') {
                renderHighlightSegments(message.segments || []);
            } else if (message.type === 'variablesUpdate') {
                AutocompleteVariables = message.variables || [];
            } else if (message.type === 'overflowNoticePreference') {
                overflowNoticeSuppressed = Boolean(message.suppressed);
                if (overflowNoticeSuppressed) {
                    overflowNoticeDismissedForCurrentView = true;
                }
                updateOverflowNotice();
            }
        });

        bootstrapConsoleFont().finally(() => {
            vscode.postMessage({ type: 'ready' });
            vscode.postMessage({ type: 'requestVariables' });
        });
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
    setWorkingDetail,
    setConsoleFontOptions,
    registerWebviewPanelSerializer,
    clearWebviewTerminalPanel: clearPanel,
    setWebviewTerminalStatus: setStatus
};
