const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { msg } = require('../../../utils/common');
const { getWebviewThemeVariables } = require('../embeddedConsole/renderer');

let asciiLogoCache = null;
const ONLINE_CJK_FONT_CSS_URL = 'https://fontsapi.zeoseven.com/442/main/result.css';
const ONLINE_LATIN_FONT_WOFF2_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/maple-mono@latest/latin-400-normal.woff2';
const ONLINE_LATIN_FONT_WOFF_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/maple-mono@latest/latin-400-normal.woff';

function getCodiconFontUri(webview) {
    try {
        const fontPath = vscode.Uri.joinPath(vscode.Uri.file(vscode.env.appRoot), 'out', 'media', 'codicon.ttf').fsPath;
        return `data:font/ttf;base64,${fs.readFileSync(fontPath).toString('base64')}`;
    } catch (_error) {
        return webview.asWebviewUri(vscode.Uri.joinPath(vscode.Uri.file(vscode.env.appRoot), 'out', 'media', 'codicon.ttf'));
    }
}

function getPanelTitle() {
    return msg('webviewPanelTitle');
}

function getAsciiLogo53x13() {
    if (asciiLogoCache) return asciiLogoCache;
    const logoDir = path.resolve(__dirname, '../../../../ascii_logo/53x13');
    try {
        asciiLogoCache = {
            up: fs.readFileSync(path.join(logoDir, 'up.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, ''),
            down: fs.readFileSync(path.join(logoDir, 'down.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '')
        };
    } catch (_error) {
        asciiLogoCache = { up: 'STATA', down: 'ALL IN ONE' };
    }
    return asciiLogoCache;
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getConsoleFrameHtml(webview, fontOptionsInput = {}) {
    const nonce = String(Date.now());
    const codiconFontUri = getCodiconFontUri(webview);
    const themeVars = getWebviewThemeVariables();
    const asciiLogo = getAsciiLogo53x13();
    const asciiLogoTop = escapeHtml(asciiLogo.up);
    const asciiLogoBottom = escapeHtml(asciiLogo.down);
    const fontOptions = {
        fontMode: String(fontOptionsInput.fontMode || 'online'),
        editorFontFamily: String(fontOptionsInput.editorFontFamily || ''),
        customFontFamily: String(fontOptionsInput.customFontFamily || ''),
        systemFallbackFamily: String(fontOptionsInput.systemFallbackFamily || 'monospace')
    };
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline' https://fontsapi.zeoseven.com; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(getPanelTitle())}</title>
    <style>
        @font-face {
            font-family: "codicon";
            font-display: block;
            src: url("${codiconFontUri}") format("truetype");
        }
        :root {
            color-scheme: light dark;
            --vscode-editor-background: ${escapeHtml(themeVars.background)};
            --vscode-editor-foreground: ${escapeHtml(themeVars.foreground)};
            --vscode-foreground: ${escapeHtml(themeVars.foreground)};
            --vscode-descriptionForeground: ${escapeHtml(themeVars.description)};
            --vscode-panel-border: ${escapeHtml(themeVars.border)};
            --vscode-font-family: var(--vscode-editor-font-family, monospace);
            --stata-prompt: ${themeVars.prompt || '#666666'};
            --stata-command: ${themeVars.command || '#d670d6'};
            --stata-keyword: ${themeVars.keyword || '#29b8db'};
            --stata-string: ${themeVars.string || '#f5f543'};
            --stata-path: ${themeVars.path || '#f5f543'};
            --stata-number: ${themeVars.number || '#23d18b'};
            --stata-comment: ${themeVars.comment || '#666666'};
            --stata-function: ${themeVars.function || '#3b8eea'};
            --stata-option: ${themeVars.option || '#3b8eea'};
            --stata-variable: ${themeVars.variable || '#f5f543'};
            --stata-macro: ${themeVars.macro || '#f5f543'};
            --stata-operator: ${themeVars.operator || '#11a8cd'};
            --stata-plain: ${themeVars.plain || '#e5e5e5'};
            --stata-default: ${themeVars.default || '#e5e5e5'};
            --stata-error: ${themeVars.error || '#f14c4c'};
            --stata-header: ${themeVars.header || '#29b8db'};
            --stata-separator: ${themeVars.separator || '#666666'};
            --stata-time: ${themeVars.time || '#29b8db'};
            --stata-time-value: ${themeVars.timeValue || '#f5f543'};
            --console-editor-font-family: var(--vscode-editor-font-family, monospace);
            --console-custom-font-family: var(--console-editor-font-family);
            --console-system-fallback-family: ${escapeHtml(fontOptions.systemFallbackFamily)};
            --console-online-font-family: "Maple Mono", "Maple Mono NF CN", var(--console-system-fallback-family);
            --console-active-font-family: var(--console-system-fallback-family);
        }
        html, body {
            height: 100%;
            margin: 0;
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #cccccc);
            font-family: var(--vscode-font-family, monospace);
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
        .statusbar-icon.codicon {
            width: auto;
            height: auto;
            fill: none;
            font-family: "codicon";
            font-size: 16px;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .codicon-table::before { content: "\\ebb7"; }
        .codicon-share::before { content: "\\ec25"; }
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
            font-synthesis: weight style;
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
            padding: 0 2ch 0 calc(2ch + 4px);
            min-height: 1.5em;
            color: var(--vscode-descriptionForeground);
        }
        body[data-status="running"] #working-indicator {
            display: flex;
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
        #resize-handle {
            height: 4px;
            flex-shrink: 0;
            cursor: ns-resize;
            border-top: 1px solid var(--vscode-panel-border);
            transition: border-color 0.15s ease;
        }
        #resize-handle:hover,
        #resize-handle.active {
            border-color: var(--vscode-focusBorder);
        }
        .composer {
            background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background));
            padding: 2px 0 8px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex-shrink: 0;
            height: 84px;
        }
        .composer-label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 10px;
            padding: 0 12px;
        }
        .composer-label-text {
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            font-weight: 700;
        }
        .composer-help-btn {
            width: 20px;
            height: 20px;
            padding: 0;
            border: none;
            border-radius: 4px;
            background: transparent;
            color: var(--vscode-descriptionForeground);
            cursor: help;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-family: "codicon";
            font-size: 14px;
            line-height: 1;
            opacity: 0.55;
            transition: opacity 120ms ease;
            position: relative;
        }
        .composer-help-btn:hover { opacity: 1; }
        .composer-help-btn::before { content: "\\eb32"; }
        .composer-help-btn::after {
            content: attr(data-tip);
            position: absolute;
            bottom: 0;
            right: calc(100% + 8px);
            padding: 5px 10px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 11px;
            line-height: 1.5;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 60ms ease;
            z-index: 20;
        }
        .composer-help-btn:hover::after { opacity: 1; }
        .composer-input-wrapper {
            display: grid;
            width: 100%;
            position: relative;
            flex: 1;
            min-height: 42px;
        }
        .composer-input-wrapper > * {
            grid-area: 1 / 1;
        }
        #input-highlight {
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            border: 1px solid transparent;
            border-radius: 8px;
            padding: 10px 12px;
            margin: 0;
            font-family: var(--console-active-font-family);
            font-synthesis: weight style;
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
            height: 100%;
            resize: none;
            box-sizing: border-box;
            border: 1px solid var(--vscode-panel-border);
            background: transparent;
            color: transparent;
            caret-color: var(--vscode-input-foreground);
            border-radius: 8px;
            padding: 10px 12px;
            outline: none;
            font-family: var(--console-active-font-family);
            font-synthesis: weight style;
            font-size: var(--vscode-editor-font-size, 13px);
            line-height: 1.5;
            tab-size: 4;
            overflow-y: auto;
        }
        #input:focus {
            border-color: var(--vscode-focusBorder);
        }
        #input::placeholder {
            color: var(--vscode-descriptionForeground);
            opacity: 0.5;
            font-size: 12px;
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
            padding: 3px 10px;
            cursor: pointer;
            color: var(--vscode-input-foreground);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .autocomplete-item.active {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .autocomplete-icon {
            font-family: "codicon";
            font-size: 16px;
            line-height: 1;
            width: 20px;
            text-align: center;
            flex-shrink: 0;
        }
        .autocomplete-icon.var-icon::before { content: "\\ea88"; }
        .autocomplete-icon.cmd-icon::before { content: "\\eb62"; }
        .autocomplete-icon.fn-icon::before  { content: "\\ea8c"; }
        .autocomplete-icon.var-icon { color: var(--vscode-symbolIcon-variableForeground, var(--stata-variable)); }
        .autocomplete-icon.cmd-icon { color: var(--vscode-symbolIcon-keywordForeground, var(--stata-keyword)); }
        .autocomplete-icon.fn-icon  { color: var(--vscode-symbolIcon-methodForeground, var(--stata-function)); }
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
        .graph-entry {
            padding: 0.55rem 2ch 0.75rem;
            margin: 0.2rem 0 0.45rem;
            overflow-x: auto;
        }
        .graph-frame {
            position: relative;
            display: inline-block;
            max-width: min(100%, 980px);
        }
        .graph-title {
            font-family: var(--console-active-font-family);
            font-size: 12px;
            line-height: 1.4;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 0.35rem;
        }
        .graph-image {
            display: block;
            max-width: 100%;
            height: auto;
            pointer-events: none;
            background: #fff;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
        }
        .graph-actions {
            position: absolute;
            top: 8px;
            right: 8px;
            display: flex;
            gap: 4px;
            padding: 3px;
            border-radius: 6px;
            background: color-mix(in srgb, var(--vscode-editor-background) 84%, transparent);
            border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 78%, transparent);
            opacity: 0;
            z-index: 2;
            transition: opacity 120ms ease;
        }
        .graph-frame:hover .graph-actions,
        .graph-frame:focus-within .graph-actions {
            opacity: 1;
        }
        .graph-action {
            width: 24px;
            height: 24px;
            border: none;
            border-radius: 4px;
            padding: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--vscode-foreground);
            background: transparent;
            font-family: "codicon";
            font-size: 15px;
            line-height: 1;
        }
        .graph-action svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
            pointer-events: none;
        }
        .graph-action:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }
        .graph-action:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 1px;
        }
        .codicon-copy::before { content: "\\ebcc"; }
        .codicon-save::before { content: "\\eb4b"; }
        .codicon-screen-full::before { content: "\\eb4c"; }
        .codicon-close::before { content: "\\ea76"; }
        .graph-fullscreen {
            position: fixed;
            inset: 0;
            z-index: 100;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 28px;
            box-sizing: border-box;
            background: color-mix(in srgb, var(--vscode-editor-background) 92%, #000);
        }
        .graph-fullscreen.visible {
            display: flex;
        }
        .graph-fullscreen-visual {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .graph-fullscreen-visual > img,
        .graph-fullscreen-visual > svg {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            background: #fff;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
        }
        .graph-fullscreen-close {
            position: fixed;
            top: 14px;
            right: 14px;
            opacity: 1;
            z-index: 2;
            font-family: "codicon";
            font-size: 16px;
            font-weight: 400;
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
                <svg class="statusbar-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M13.5004 12.0004C13.7762 12.0006 14.0004 12.2245 14.0004 12.5004C14.0002 12.7761 13.7761 13.0002 13.5004 13.0004H2.50037C2.22449 13.0004 2.00056 12.7762 2.00037 12.5004C2.00037 12.2244 2.22437 12.0004 2.50037 12.0004H13.5004Z"></path>
                    <path d="M13.5004 9.00037C13.7762 9.00056 14.0004 9.22449 14.0004 9.50037C14.0002 9.77608 13.7761 10.0002 13.5004 10.0004H2.50037C2.22449 10.0004 2.00056 9.7762 2.00037 9.50037C2.00037 9.22437 2.22437 9.00037 2.50037 9.00037H13.5004Z"></path>
                    <path d="M13.5004 6.00037C13.7762 6.00056 14.0004 6.22449 14.0004 6.50037C14.0002 6.77608 13.7761 7.00017 13.5004 7.00037H7.50037C7.22449 7.00037 7.00056 6.7762 7.00037 6.50037C7.00037 6.22437 7.22437 6.00037 7.50037 6.00037H13.5004Z"></path>
                    <path d="M5.50037 0.999023C5.63295 0.999115 5.76009 1.05179 5.85388 1.14551C5.94777 1.23939 6.00037 1.36722 6.00037 1.5C6.00027 1.63265 5.94769 1.75971 5.85388 1.85352L3.7074 4L5.85388 6.14551C5.94777 6.23939 6.00037 6.36722 6.00037 6.5C6.00027 6.63265 5.94769 6.75971 5.85388 6.85352C5.76008 6.94732 5.63302 6.99991 5.50037 7C5.36759 7 5.23976 6.9474 5.14587 6.85352L3.00037 4.70703L0.853882 6.85352C0.760077 6.94732 0.633017 6.99991 0.500366 7C0.36759 7 0.239761 6.9474 0.145874 6.85352C0.0521583 6.75972 -0.000519052 6.63258 -0.000610352 6.5C-0.000610354 6.36722 0.0519875 6.23939 0.145874 6.14551L2.29333 4L0.145874 1.85352C0.0521583 1.75972 -0.000519119 1.63258 -0.000610352 1.5C-0.000610351 1.36722 0.0519874 1.23939 0.145874 1.14551C0.239761 1.05162 0.36759 0.999023 0.500366 0.999023C0.63295 0.999115 0.76009 1.05179 0.853882 1.14551L3.00037 3.29297L5.14587 1.14551C5.23976 1.05162 5.36759 0.999023 5.50037 0.999023Z"></path>
                    <path d="M13.5004 3.00037C13.7762 3.00056 14.0004 3.22449 14.0004 3.50037C14.0002 3.77608 13.7761 4.00017 13.5004 4.00037H7.50037C7.22449 4.00037 7.00056 3.7762 7.00037 3.50037C7.00037 3.22437 7.22437 3.00037 7.50037 3.00037H13.5004Z"></path>
                </svg>
            </button>
            <button id="export-button" class="statusbar-button" type="button" title="${escapeHtml(msg('consoleExport'))}" disabled>
                <svg class="statusbar-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M11.307 1.10533C11.1562 0.988085 10.9519 0.966945 10.7803 1.05085C10.6088 1.13475 10.5 1.30904 10.5 1.5V3.49274C10.4571 3.49456 10.4122 3.49701 10.3654 3.5002C9.96247 3.52766 9.41128 3.61105 8.82119 3.83704C8.11343 4.10809 7.34877 4.58508 6.72601 5.41126C6.10338 6.23727 5.64499 7.38259 5.50206 8.95474C5.48301 9.16438 5.5973 9.36351 5.78793 9.4528C5.97857 9.54209 6.20471 9.50241 6.35356 9.35356C7.54248 8.16464 8.72298 7.57773 9.59562 7.28685C9.9558 7.16679 10.2643 7.09693 10.5 7.0563V9C10.5 9.1969 10.6156 9.37546 10.7952 9.45612C10.9748 9.53678 11.185 9.50452 11.3322 9.37371L15.8322 5.37371C15.9432 5.27502 16.0046 5.13207 15.9997 4.98361C15.9949 4.83514 15.9242 4.69653 15.807 4.60533L11.307 1.10533ZM10.9429 4.49679L10.9457 4.49705C11.0865 4.51223 11.2279 4.46706 11.3335 4.37257C11.4394 4.27772 11.5 4.14223 11.5 4V2.52232L14.7186 5.02564L11.5 7.88658V6.5C11.5 6.22386 11.2762 6 11 6L10.9989 6L10.9976 6.00001L10.9943 6.00003L10.9848 6.00014L10.9552 6.00087C10.9307 6.00166 10.897 6.00316 10.8544 6.00599C10.7695 6.01166 10.6495 6.02268 10.4996 6.04409C10.1999 6.08691 9.77971 6.17139 9.2794 6.33816C8.55493 6.57965 7.66479 6.99299 6.7319 7.69863C6.9264 6.98158 7.2077 6.43355 7.52456 6.01319C8.01593 5.36132 8.61523 4.98675 9.17883 4.7709C9.65371 4.58903 10.1025 4.52044 10.4334 4.49788C10.5981 4.48666 10.7314 4.48699 10.8211 4.48988C10.866 4.49133 10.8997 4.49341 10.9209 4.49498L10.9429 4.49679ZM3.5 2C2.11929 2 1 3.11929 1 4.5V12.5C1 13.8807 2.11929 15 3.5 15H11.5C12.8807 15 14 13.8807 14 12.5V9.5C14 9.22386 13.7761 9 13.5 9C13.2239 9 13 9.22386 13 9.5V12.5C13 13.3284 12.3284 14 11.5 14H3.5C2.67157 14 2 13.3284 2 12.5V4.5C2 3.67157 2.67157 3 3.5 3H7.5C7.77614 3 8 2.77614 8 2.5C8 2.22386 7.77614 2 7.5 2H3.5Z"></path>
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
            <span class="working-text">Working</span>
            <span class="working-meta">(<span id="working-seconds">0s</span><span id="working-detail-shell" hidden> • <span id="working-detail"></span></span> • esc to interrupt)</span>
        </div>
    </div>
    <div id="resize-handle" title="${escapeHtml(msg('webviewDragResizeTip'))}"></div>
    <div id="graph-fullscreen" class="graph-fullscreen" hidden>
        <button id="graph-fullscreen-close" class="graph-action graph-fullscreen-close" type="button" title="${escapeHtml(msg('graphClose'))}" aria-label="${escapeHtml(msg('graphClose'))}">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.65 3 8 7.35 12.35 3l.65.65L8.65 8 13 12.35l-.65.65L8 8.65 3.65 13 3 12.35 7.35 8 3 3.65 3.65 3z"></path></svg>
        </button>
        <div id="graph-fullscreen-visual" class="graph-fullscreen-visual"></div>
    </div>
    <div class="composer" id="composer">
        <div class="composer-label">
            <span class="composer-label-text">${escapeHtml(msg('webviewInputLabel'))}</span>
            <button class="composer-help-btn" type="button" data-tip="${escapeHtml(msg('webviewRun') + ': Enter, ' + msg('webviewNewline') + ': Shift+Enter, ' + msg('webviewHistory') + ': Up/Down')}"></button>
        </div>
        <div class="composer-input-wrapper">
            <pre id="input-highlight" aria-hidden="true"></pre>
            <textarea id="input" spellcheck="false"></textarea>
            <div class="autocomplete-dropdown" id="autocomplete-dropdown"></div>
        </div>
    </div>
    <script nonce="${nonce}">
        document.body.dataset.scriptStarted = '1';
        const vscode = { postMessage: message => window.parent.postMessage({ __saioFrame: 'console', message }, '*') };
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
        const composer = document.getElementById('composer');
        const resizeHandle = document.getElementById('resize-handle');
        const stopButton = document.getElementById('stop-button');
        const clearButton = document.getElementById('clear-button');
        const exportButton = document.getElementById('export-button');
        const graphFullscreen = document.getElementById('graph-fullscreen');
        const graphFullscreenVisual = document.getElementById('graph-fullscreen-visual');
        const graphFullscreenClose = document.getElementById('graph-fullscreen-close');
        const inputHighlight = document.getElementById('input-highlight');

        // --- Tip carousel in the input placeholder ---
        let composerTips = [];
        let composerTipIndex = 0;
        let composerTipTimer = null;

        function startComposerTipCarousel() {
            if (!composerTips.length) return;
            stopComposerTipCarousel();
            composerTipIndex = 0;
            input.placeholder = composerTips[0] || '';
            composerTipTimer = setInterval(() => {
                composerTipIndex = (composerTipIndex + 1) % composerTips.length;
                input.placeholder = composerTips[composerTipIndex] || '';
            }, 5000);
        }

        function stopComposerTipCarousel() {
            if (composerTipTimer) { clearInterval(composerTipTimer); composerTipTimer = null; }
        }

        // Hide tip when input is focused or has text, resume on blur when empty
        input.addEventListener('focus', () => {
            input.placeholder = '';
            stopComposerTipCarousel();
        });
        input.addEventListener('input', () => {
            input.placeholder = '';
            stopComposerTipCarousel();
        });
        input.addEventListener('blur', () => {
            if (!input.value.trim().length) startComposerTipCarousel();
        });
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
        const graphImageCache = new Map();

        const STATUS_LABELS = {
            idle: ${JSON.stringify(msg('webviewIdle'))},
            success: ${JSON.stringify(msg('webviewIdle'))},
            running: ${JSON.stringify(msg('webviewRunning'))},
            error: ${JSON.stringify(msg('webviewError'))}
        };
        const GRAPH_LABELS = {
            copy: ${JSON.stringify(msg('graphCopyImage'))},
            save: ${JSON.stringify(msg('graphSaveImage'))},
            fullScreen: ${JSON.stringify(msg('graphFullScreen'))},
            imageConversionFailed: ${JSON.stringify(msg('graphImageConversionFailed'))},
            onlySvgCanConvert: ${JSON.stringify(msg('graphOnlySvgCanConvert'))},
            svgEmpty: ${JSON.stringify(msg('graphSvgEmpty'))},
            canvasUnavailable: ${JSON.stringify(msg('graphCanvasUnavailable'))},
            canvasPngFailed: ${JSON.stringify(msg('graphCanvasPngFailed'))},
            canvasImageFailed: ${JSON.stringify(msg('graphCanvasImageFailed'))},
            svgReadFailed: ${JSON.stringify(msg('graphSvgReadFailed'))},
            svgLoadFailed: ${JSON.stringify(msg('graphSvgLoadFailed'))},
            clipboardWriteUnavailable: ${JSON.stringify(msg('graphClipboardWriteUnavailable'))},
            clipboardItemUnavailable: ${JSON.stringify(msg('graphClipboardItemUnavailable'))},
            clipboardRejected: ${JSON.stringify(msg('graphClipboardRejected'))},
            pngReadFailed: ${JSON.stringify(msg('graphPngReadFailed'))}
        };
        const FONT_BOOTSTRAP = ${JSON.stringify(fontOptions)};
        var autocompleteActiveIndex = -1;
        var autocompleteVisible = false;
        var autocompleteRequestId = 0;

        function getCurrentWord() {
            var text = input.value || '';
            var pos = input.selectionStart || 0;
            var start = pos;
            while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) {
                start--;
            }
            return { word: text.slice(start, pos), start: start, end: pos };
        }

        function getAutocompleteIconClass(kind) {
            if (kind === 'var') return 'var-icon';
            if (kind === 'fn')  return 'fn-icon';
            return 'cmd-icon';
        }
        function showAutocomplete(matches, wordStart) {
            if (!matches.length) {
                hideAutocomplete();
                return;
            }
            autocompleteDropdown.innerHTML = '';
            for (var i = 0; i < matches.length; i++) {
                var m = matches[i];
                var label = typeof m === 'string' ? m : m.label;
                var kind = (typeof m === 'object' && m.kind) ? m.kind : 'cmd';
                var item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.dataset.label = label;
                var icon = document.createElement('span');
                icon.className = 'autocomplete-icon ' + getAutocompleteIconClass(kind);
                item.appendChild(icon);
                var text = document.createElement('span');
                text.className = 'autocomplete-label';
                text.textContent = label;
                item.appendChild(text);
                item.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    applyAutocomplete(this.dataset.label, wordStart);
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
            while (wordEnd < text.length && /[A-Za-z0-9_]/.test(text[wordEnd])) {
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
            if (!current.word || current.word.length < 1) {
                autocompleteRequestId += 1;
                hideAutocomplete();
                return;
            }
            autocompleteRequestId += 1;
            vscode.postMessage({
                type: 'autocompleteInput',
                requestId: autocompleteRequestId,
                text: input.value || '',
                cursor: input.selectionStart || 0
            });
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
                applyAutocomplete(items[autocompleteActiveIndex].dataset.label, current.start);
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
                const total = Number(currentWorkingDetail.total) || 0;
                if (total <= 0) { return ''; }
                const current = (currentWorkingDetail.current != null) ? Number(currentWorkingDetail.current) : NaN;
                if (isNaN(current) || current <= 0) {
                    // No current count (bidiff pure dots, xthreg gaps) — show total only
                    return formatCount(total) + ' reps';
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

            const current = (currentWorkingDetail.current != null) ? Number(currentWorkingDetail.current) : NaN;
            const total = Number(currentWorkingDetail.total) || 0;
            if (isNaN(current) || current <= 0 || total <= 0 || current >= total) {
                // current unknown → keep previous ETA, don't reset to 0
                if (!isNaN(current) && current > 0) {
                    estimatedFinishAt = 0;
                    displayedRemainingSeconds = 0;
                }
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
            rootStyle.setProperty('--console-active-font-family', 'var(--console-system-fallback-family)');
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
            if (source === 'online') {
                rootStyle.setProperty('--console-active-font-family', 'var(--console-online-font-family)');
                return;
            }
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

            if (FONT_BOOTSTRAP.fontMode === 'online') {
                applyConsoleFont('system');
                promoteOnlineConsoleFont();
                return;
            }

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

        async function promoteOnlineConsoleFont() {
            loadOnlineCjkFontStylesheet();
            addOnlineLatinFontFace();
            const loaded = await waitForConsoleFont('400 16px "Maple Mono"', 5000);
            if (!loaded) return;
            applyConsoleFont('online');
            requestAnimationFrame(() => requestAnimationFrame(() => {
                fitPlaceholderLogo();
            }));
        }

        function addOnlineLatinFontFace() {
            if (document.getElementById('saio-online-latin-font')) return;
            const style = document.createElement('style');
            style.id = 'saio-online-latin-font';
            style.textContent = '@font-face{font-family:"Maple Mono";font-style:normal;font-display:swap;font-weight:400;'
                + 'src:url("${ONLINE_LATIN_FONT_WOFF2_URL}") format("woff2"),'
                + 'url("${ONLINE_LATIN_FONT_WOFF_URL}") format("woff");}';
            document.head.appendChild(style);
        }

        function loadOnlineCjkFontStylesheet() {
            if (document.getElementById('saio-online-cjk-font')) return;
            const stylesheet = document.createElement('link');
            stylesheet.id = 'saio-online-cjk-font';
            stylesheet.rel = 'stylesheet';
            stylesheet.href = ${JSON.stringify(ONLINE_CJK_FONT_CSS_URL)};
            stylesheet.crossOrigin = 'anonymous';
            document.head.appendChild(stylesheet);
        }

        async function waitForConsoleFont(fontSpec, timeoutMs) {
            if (!document.fonts || typeof document.fonts.load !== 'function') return false;
            let timeout = null;
            try {
                return await Promise.race([
                    document.fonts.load(fontSpec, 'STATA ALL IN ONE 0123456789').then(fonts => fonts.length > 0),
                    new Promise(resolve => {
                        timeout = setTimeout(() => resolve(false), timeoutMs);
                    })
                ]);
            } catch (_error) {
                return false;
            } finally {
                if (timeout) clearTimeout(timeout);
            }
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

        function keepWorkingIndicatorAtOutputEnd() {
            if (workingIndicator.parentElement !== output || workingIndicator.nextSibling) {
                output.appendChild(workingIndicator);
            }
            workingIndicator.style.paddingLeft = '';
            workingIndicator.style.paddingRight = '';
        }

        function startWorkingIndicator() {
            runningStartedAt = Date.now();
            keepWorkingIndicatorAtOutputEnd();
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
            keepWorkingIndicatorAtOutputEnd();
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
            updateExportButtonState();
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
            resetResultBlockScrollPositions();
            ensurePlaceholderVisibility();
            updateExportButtonState();
            if (shouldStick) {
                output.scrollTop = output.scrollHeight;
            }
            requestAnimationFrame(updateOverflowNotice);
        }

        function resetOutput(entries) {
            renderedEntries = Array.isArray(entries) ? entries.slice() : [];
            overflowNoticeDismissedForCurrentView = false;
            renderAllEntries();
            resetResultBlockScrollPositions();
            updateExportButtonState();
            requestAnimationFrame(updateOverflowNotice);
        }

        function updateExportButtonState() {
            exportButton.disabled = document.body.dataset.status === 'running' || renderedEntries.length === 0;
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

        function resetResultBlockScrollPositions() {
            outputShell.querySelectorAll('.result-block-scroll').forEach(block => {
                block.scrollLeft = 0;
            });
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

                if (entry && entry.kind === 'graph') {
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
            if (entry && entry.kind === 'graph') {
                return renderGraphEntry(entry);
            }

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

        function renderGraphEntry(entry) {
            const shell = document.createElement('div');
            shell.className = 'graph-entry';

            const title = document.createElement('div');
            title.className = 'graph-title';
            const graphName = String(entry.graphName || 'Graph');
            const format = String(entry.format || '').toLowerCase();
            title.textContent = format ? graphName + ' .' + format : graphName;
            shell.appendChild(title);

            const frame = document.createElement('div');
            frame.className = 'graph-frame';

            const visual = createGraphVisual(entry, graphName);
            frame.appendChild(visual);

            const actions = document.createElement('div');
            actions.className = 'graph-actions';
            actions.appendChild(createGraphAction('copy', GRAPH_LABELS.copy, function () {
                copyGraphImageAsPng(entry);
            }));
            actions.appendChild(createGraphAction('save', GRAPH_LABELS.save, function () {
                vscode.postMessage({
                    type: 'saveGraph',
                    filePath: String(entry.filePath || ''),
                    graphName: graphName,
                    format: format
                });
            }));
            actions.appendChild(createGraphAction('screen-full', GRAPH_LABELS.fullScreen, function () {
                showGraphFullscreen(entry);
            }));
            frame.appendChild(actions);
            shell.appendChild(frame);

            return shell;
        }

        function createGraphVisual(entry, graphName) {
            const svgText = String(entry && entry.svgText || '');
            if (svgText) {
                const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
                const root = parsed.documentElement;
                if (root && root.nodeName.toLowerCase() === 'svg' && !parsed.querySelector('parsererror')) {
                    const svg = document.importNode(root, true);
                    svg.classList.add('graph-image');
                    svg.setAttribute('role', 'img');
                    svg.setAttribute('aria-label', graphName);
                    return svg;
                }
            }

            const image = document.createElement('img');
            image.className = 'graph-image';
            image.src = String(entry && entry.src || '');
            image.alt = graphName;
            image.loading = 'lazy';
            return image;
        }

        function createGraphAction(iconName, title, onClick) {
            const button = document.createElement('button');
            button.className = 'graph-action';
            button.type = 'button';
            button.title = title;
            button.setAttribute('aria-label', title);
            button.appendChild(createGraphActionIcon(iconName));
            button.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                onClick();
            });
            return button;
        }

        function createGraphActionIcon(iconName) {
            const paths = {
                copy: 'M5 1h8v10h-2v4H3V5h2V1zm1 4h5v5h1V2H6v3zM4 6v8h6V6H4z',
                save: 'M7.5 1h1v7.3l2.65-2.65.7.7L8 10.2 4.15 6.35l.7-.7L7.5 8.3V1zM3 11h1v3h8v-3h1v4H3v-4z',
                'screen-full': 'M2 2h5v1H3v4H2V2zm7 0h5v5h-1V3H9V2zM2 9h1v4h4v1H2V9zm11 0h1v5H9v-1h4V9z'
            };
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 16 16');
            svg.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', paths[iconName] || paths.copy);
            svg.appendChild(path);
            return svg;
        }

        function findGraphEntryByFilePath(filePath) {
            const normalized = String(filePath || '');
            for (const entry of renderedEntries) {
                if (entry && entry.kind === 'graph' && String(entry.filePath || '') === normalized) {
                    return entry;
                }
            }
            return null;
        }

        async function copyGraphImageAsPng(entry) {
            try {
                const pngBlob = await getGraphPngBlob(entry, 96);
                await writePngBlobToClipboard(pngBlob);
                vscode.postMessage({ type: 'copyGraphCopied' });
            } catch (error) {
                vscode.postMessage({
                    type: 'copyGraphFailed',
                    message: String(error && error.message || error || '')
                });
            }
        }

        async function getGraphPngBlob(entry, dpi) {
            return getGraphImageBlob(entry, dpi, { format: 'png' });
        }

        async function getGraphImageBlob(entry, dpi, options) {
            const normalizedDpi = normalizeGraphDpi(dpi);
            const format = normalizeGraphBitmapFormat(options && options.format);
            const width = normalizePositivePixelSize(options && options.width);
            const height = normalizePositivePixelSize(options && options.height);
            const cacheKey = [
                String((entry && entry.filePath) || (entry && entry.src) || ''),
                normalizedDpi,
                format,
                width || '',
                height || ''
            ].join('#');
            if (cacheKey && graphImageCache.has(cacheKey)) {
                return graphImageCache.get(cacheKey);
            }

            const promise = renderGraphEntryToImageBlob(entry, normalizedDpi, { format, width, height });
            if (cacheKey) {
                graphImageCache.set(cacheKey, promise);
            }
            try {
                return await promise;
            } catch (error) {
                if (cacheKey) {
                    graphImageCache.delete(cacheKey);
                }
                throw error;
            }
        }

        async function renderGraphEntryToImageBlob(entry, dpi, options) {
            const format = String(entry && entry.format || '').toLowerCase();
            if (format !== 'svg') {
                throw new Error(GRAPH_LABELS.onlySvgCanConvert);
            }

            const svgText = await getGraphSvgText(entry);
            if (!svgText) {
                throw new Error(GRAPH_LABELS.svgEmpty);
            }

            const image = await loadSvgImage(svgText);
            const sourceSize = getSvgRasterSize(svgText, image, dpi);
            const size = getRequestedRasterSize(sourceSize, options && options.width, options && options.height);
            const bitmapFormat = normalizeGraphBitmapFormat(options && options.format);
            const mimeType = bitmapFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
            const canvas = document.createElement('canvas');
            canvas.width = size.width;
            canvas.height = size.height;
            const context = canvas.getContext('2d');
            if (!context) {
                throw new Error(GRAPH_LABELS.canvasUnavailable);
            }
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            return await new Promise((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error(bitmapFormat === 'png' ? GRAPH_LABELS.canvasPngFailed : GRAPH_LABELS.canvasImageFailed));
                    }
                }, mimeType, bitmapFormat === 'jpeg' ? 0.9 : undefined);
            });
        }

        async function getGraphSvgText(entry) {
            const inlineSvg = String(entry && entry.svgText || '');
            if (inlineSvg) {
                return inlineSvg;
            }

            const src = String(entry && entry.src || '');
            if (!src) {
                return '';
            }
            const response = await fetch(src);
            if (!response.ok) {
                throw new Error(GRAPH_LABELS.svgReadFailed);
            }
            return await response.text();
        }

        function svgTextToDataUrl(svgText) {
            return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
        }

        function loadImage(src) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = function () { resolve(image); };
                image.onerror = function () { reject(new Error(GRAPH_LABELS.svgLoadFailed)); };
                image.src = src;
            });
        }

        async function loadSvgImage(svgText) {
            const objectUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
            try {
                return await loadImage(objectUrl);
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        }

        function normalizeGraphDpi(dpi) {
            const value = Number(dpi);
            if (!Number.isFinite(value) || value < 72) {
                return 96;
            }
            return Math.min(1200, Math.round(value));
        }

        function normalizeGraphBitmapFormat(format) {
            const normalized = String(format || '').trim().toLowerCase();
            return normalized === 'jpg' || normalized === 'jpeg' ? 'jpeg' : 'png';
        }

        function normalizePositivePixelSize(value) {
            const number = Number(value);
            if (!Number.isFinite(number) || number <= 0) {
                return 0;
            }
            return Math.max(1, Math.round(number));
        }

        function getSvgRasterSize(svgText, image, dpi) {
            const parser = new DOMParser();
            const documentSvg = parser.parseFromString(svgText, 'image/svg+xml');
            const svg = documentSvg.documentElement;
            const width = parseSvgLength(svg && svg.getAttribute('width'), dpi);
            const height = parseSvgLength(svg && svg.getAttribute('height'), dpi);
            if (width && height) {
                return clampRasterSize(width, height, dpi);
            }

            const viewBox = String(svg && svg.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);
            if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
                const scale = dpi / 96;
                return clampRasterSize(viewBox[2] * scale, viewBox[3] * scale, dpi);
            }

            const scale = dpi / 96;
            return clampRasterSize((image.naturalWidth || 960) * scale, (image.naturalHeight || 640) * scale, dpi);
        }

        function getRequestedRasterSize(sourceSize, width, height) {
            const requestedWidth = normalizePositivePixelSize(width);
            const requestedHeight = normalizePositivePixelSize(height);
            if (!requestedWidth && !requestedHeight) {
                return sourceSize;
            }

            const sourceWidth = Math.max(1, Number(sourceSize && sourceSize.width) || 1);
            const sourceHeight = Math.max(1, Number(sourceSize && sourceSize.height) || 1);
            const aspectRatio = sourceWidth / sourceHeight;
            if (requestedWidth && requestedHeight) {
                return clampRasterSize(requestedWidth, requestedHeight, 1200);
            }
            if (requestedWidth) {
                return clampRasterSize(requestedWidth, requestedWidth / aspectRatio, 1200);
            }
            return clampRasterSize(requestedHeight * aspectRatio, requestedHeight, 1200);
        }

        function parseSvgLength(value, dpi) {
            const match = String(value || '').trim().match(/^([0-9]+(?:\\.[0-9]+)?)(px|pt|in|cm|mm)?$/i);
            if (!match) {
                return 0;
            }
            const amount = Number(match[1]);
            const unit = String(match[2] || 'px').toLowerCase();
            if (!Number.isFinite(amount) || amount <= 0) {
                return 0;
            }
            if (unit === 'pt') return amount * dpi / 72;
            if (unit === 'in') return amount * dpi;
            if (unit === 'cm') return amount * dpi / 2.54;
            if (unit === 'mm') return amount * dpi / 25.4;
            return amount * dpi / 96;
        }

        function clampRasterSize(width, height, dpi) {
            const maxSide = dpi > 96 ? 32767 : 4096;
            let rasterWidth = Math.max(1, Math.round(width));
            let rasterHeight = Math.max(1, Math.round(height));
            const scale = Math.min(1, maxSide / Math.max(rasterWidth, rasterHeight));
            if (scale < 1) {
                rasterWidth = Math.max(1, Math.round(rasterWidth * scale));
                rasterHeight = Math.max(1, Math.round(rasterHeight * scale));
            }
            return { width: rasterWidth, height: rasterHeight };
        }

        async function writePngBlobToClipboard(blob) {
            const clipboardApiError = await tryClipboardItemWrite(blob);
            if (!clipboardApiError) {
                return;
            }

            const dataUrl = await blobToDataUrl(blob);
            if (copyImageDataUrlWithExecCommand(dataUrl)) {
                return;
            }

            throw new Error(clipboardApiError);
        }

        async function tryClipboardItemWrite(blob) {
            if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function') {
                return GRAPH_LABELS.clipboardWriteUnavailable;
            }
            if (typeof ClipboardItem === 'undefined') {
                return GRAPH_LABELS.clipboardItemUnavailable;
            }

            try {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                return '';
            } catch (_error) {
                return GRAPH_LABELS.clipboardRejected;
            }
        }

        function blobToDataUrl(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = function () { resolve(String(reader.result || '')); };
                reader.onerror = function () { reject(new Error(GRAPH_LABELS.pngReadFailed)); };
                reader.readAsDataURL(blob);
            });
        }

        function copyImageDataUrlWithExecCommand(dataUrl) {
            const container = document.createElement('div');
            const image = document.createElement('img');
            container.contentEditable = 'true';
            container.style.position = 'fixed';
            container.style.left = '-10000px';
            container.style.top = '0';
            image.src = dataUrl;
            container.appendChild(image);
            document.body.appendChild(container);

            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNode(image);
            selection.removeAllRanges();
            selection.addRange(range);
            let copied = false;
            try {
                copied = document.execCommand('copy');
            } catch (_error) {
                copied = false;
            }
            selection.removeAllRanges();
            container.remove();
            return copied;
        }

        function showGraphFullscreen(entry) {
            const graphName = String(entry && entry.graphName || 'Graph');
            if (!String(entry && entry.src || '') && !String(entry && entry.svgText || '')) return;
            graphFullscreenVisual.replaceChildren(createGraphVisual(entry, graphName));
            graphFullscreen.hidden = false;
            graphFullscreen.classList.add('visible');
            graphFullscreenClose.focus();
        }

        function hideGraphFullscreen() {
            graphFullscreen.classList.remove('visible');
            graphFullscreen.hidden = true;
            graphFullscreenVisual.replaceChildren();
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
            setTimeout(function () {
                autocompleteRequestId += 1;
                hideAutocomplete();
            }, 150);
        });

        input.addEventListener('scroll', () => {
            inputHighlight.scrollTop = input.scrollTop;
            inputHighlight.scrollLeft = input.scrollLeft;
        });

        const MIN_COMPOSER_HEIGHT = 84;
        let isResizing = false;
        let resizeStartY = 0;
        let resizeStartHeight = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            resizeStartY = e.clientY;
            resizeStartHeight = composer.offsetHeight;
            resizeHandle.classList.add('active');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const deltaY = e.clientY - resizeStartY;
            let newHeight = resizeStartHeight - deltaY;
            newHeight = Math.max(MIN_COMPOSER_HEIGHT, newHeight);
            const maxHeight = document.body.offsetHeight - 60;
            newHeight = Math.min(maxHeight, newHeight);
            composer.style.height = newHeight + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!isResizing) return;
            isResizing = false;
            resizeHandle.classList.remove('active');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        });

        stopButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'stopExecution' });
        });

        clearButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'clearConsole' });
        });

        exportButton.addEventListener('click', () => {
            if (!exportButton.disabled) {
                vscode.postMessage({ type: 'exportConsole' });
            }
        });

        graphFullscreenClose.addEventListener('click', () => {
            hideGraphFullscreen();
        });

        graphFullscreen.addEventListener('click', (event) => {
            if (event.target === graphFullscreen) {
                hideGraphFullscreen();
            }
        });

        window.addEventListener('resize', () => {
            updateOverflowNotice();
        });

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && graphFullscreen.classList.contains('visible')) {
                event.preventDefault();
                hideGraphFullscreen();
                return;
            }
            if (event.key === 'Escape' && document.body.dataset.status === 'running') {
                event.preventDefault();
                vscode.postMessage({ type: 'stopExecution' });
            }
        });

        window.addEventListener('message', event => {
            const message = event.data || {};
            if (message.type === 'append') {
                appendEntries(message.entries || []);
                if (workingIndicator.style.display === 'flex') {
                    keepWorkingIndicatorAtOutputEnd();
                }
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
                // Start tip carousel
                if (Array.isArray(message.composerTips) && message.composerTips.length) {
                    composerTips = message.composerTips;
                    startComposerTipCarousel();
                }
            } else if (message.type === 'workingDetail') {
                currentWorkingDetail = message.detail || null;
                updateEstimatedFinishTime();
                if (!displayedRemainingSeconds) {
                    refreshDisplayedRemainingSeconds();
                }
                updateWorkingMeta();
            } else if (message.type === 'highlightResult') {
                renderHighlightSegments(message.segments || []);
            } else if (message.type === 'autocompleteResult') {
                if (message.requestId !== autocompleteRequestId) return;
                var matches = message.matches || [];
                var current = getCurrentWord();
                if (matches.length === 1 && matches[0].label.toLowerCase() === current.word.toLowerCase()) {
                    hideAutocomplete();
                } else {
                    showAutocomplete(matches, Number.isFinite(message.wordStart) ? message.wordStart : current.start);
                }
            } else if (message.type === 'variablesUpdate') {
                // Variables are read by the extension host when each completion is requested.
            } else if (message.type === 'overflowNoticePreference') {
                overflowNoticeSuppressed = Boolean(message.suppressed);
                if (overflowNoticeSuppressed) {
                    overflowNoticeDismissedForCurrentView = true;
                }
                updateOverflowNotice();
            } else if (message.type === 'requestGraphImageDataUrl') {
                const requestId = String(message.requestId || '');
                const entry = findGraphEntryByFilePath(message.filePath) || {
                    kind: 'graph',
                    format: 'svg',
                    filePath: String(message.filePath || ''),
                    svgText: String(message.svgText || '')
                };
                getGraphImageBlob(entry, Number(message.dpi) || 600, {
                    format: message.format,
                    width: message.width,
                    height: message.height
                })
                    .then(blobToDataUrl)
                    .then(dataUrl => {
                        vscode.postMessage({
                            type: 'graphImageDataUrl',
                            requestId,
                            dataUrl
                        });
                    })
                    .catch(error => {
                        vscode.postMessage({
                            type: 'graphImageDataUrlFailed',
                            requestId,
                            message: String(error && error.message || error || GRAPH_LABELS.imageConversionFailed)
                        });
                    });
            }
        });

        function applyHostTheme(message) {
            const variables = message && message.variables;
            if (!variables || typeof variables !== 'object') return;
            for (const [name, value] of Object.entries(variables)) {
                document.documentElement.style.setProperty(name, value);
            }
        }
        window.addEventListener('message', event => {
            if (event.data && event.data.type === 'secondarySidebar.theme') applyHostTheme(event.data);
        });

        function fitPlaceholderLogo() {
            const logos = Array.from(document.querySelectorAll('.placeholder-logo'));
            if (!logos.length || !placeholder) return;
            const baseSize = 11;
            logos.forEach(logo => { logo.style.fontSize = baseSize + 'px'; });
            const naturalWidth = Math.max(...logos.map(logo => logo.scrollWidth));
            const availableWidth = Math.max(1, placeholder.clientWidth - 16);
            const fittedSize = naturalWidth > availableWidth
                ? Math.max(3, baseSize * availableWidth / naturalWidth)
                : baseSize;
            logos.forEach(logo => { logo.style.fontSize = fittedSize.toFixed(2) + 'px'; });
        }

        new ResizeObserver(() => {
            fitPlaceholderLogo();
        }).observe(output);

        let consoleInitialization = null;
        function initializeConsoleFrame() {
            if (consoleInitialization) return consoleInitialization;
            consoleInitialization = bootstrapConsoleFont().then(() => new Promise(resolve => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            })).finally(() => {
                fitPlaceholderLogo();
                document.documentElement.classList.add('saio-ready');
                vscode.postMessage({ type: 'ready' });
                vscode.postMessage({ type: 'requestVariables' });
            });
            return consoleInitialization;
        }

        initializeConsoleFrame();
        vscode.postMessage({ type: 'themeRequest' });
    </script>
</body>
</html>`;
}

module.exports = { getConsoleFrameHtml };
