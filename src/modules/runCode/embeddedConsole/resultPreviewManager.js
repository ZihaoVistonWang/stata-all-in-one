const vscode = require('vscode');

const PREVIEW_VIEW_TYPE = 'stataResultPreview';
const MOVE_TO_NEW_WINDOW_COMMAND = 'workbench.action.moveEditorToNewWindow';
const ONLINE_CJK_FONT_CSS_URL = 'https://fontsapi.zeoseven.com/442/main/result.css';
const ONLINE_LATIN_FONT_WOFF2_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/maple-mono@latest/latin-400-normal.woff2';
const ONLINE_LATIN_FONT_WOFF_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/maple-mono@latest/latin-400-normal.woff';
const RESULT_BOUNDARY_KINDS = new Set([
    'submission',
    'command',
    'comment-command',
    'raw-progress',
    'raw-prompt',
    'graph'
]);

function getNonce() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let index = 0; index < 32; index += 1) {
        nonce += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return nonce;
}

function isResultBoundary(entry) {
    return RESULT_BOUNDARY_KINDS.has(String((entry && entry.kind) || ''));
}

function collectResultBlock(history, historyIndex) {
    if (!Array.isArray(history) || !Number.isInteger(historyIndex)
        || historyIndex < 0 || historyIndex >= history.length
        || isResultBoundary(history[historyIndex])) {
        return [];
    }

    let start = historyIndex;
    let end = historyIndex;
    while (start > 0 && !isResultBoundary(history[start - 1])) {
        start -= 1;
    }
    while (end + 1 < history.length && !isResultBoundary(history[end + 1])) {
        end += 1;
    }
    return history.slice(start, end + 1);
}

function entryText(entry) {
    return Array.isArray(entry && entry.segments)
        ? entry.segments.map(segment => String((segment && segment.text) || '')).join('')
        : '';
}

function isPromptOnlyCommand(entry) {
    return String((entry && entry.kind) || '') === 'command'
        && /^(?:[.>]\s*|\s*\d+\.\s*)$/.test(entryText(entry));
}

function stripCommandPrompt(entry) {
    const segments = Array.isArray(entry && entry.segments)
        ? entry.segments.map(segment => ({ ...segment }))
        : [];
    if (segments.length && String(segments[0].tokenType || '') === 'prompt') {
        segments.shift();
    } else if (segments.length) {
        segments[0].text = String(segments[0].text || '').replace(/^(?:[.>]\s+|\s*\d+\.\s+)/, '');
        if (!segments[0].text) {
            segments.shift();
        }
    }
    return { segments };
}

function collectPrecedingCommandLines(history, blockStart) {
    const commandLines = [];
    for (let index = blockStart - 1; index >= 0; index -= 1) {
        const entry = history[index];
        const kind = String((entry && entry.kind) || '');
        if (!['command', 'comment-command'].includes(kind) || isPromptOnlyCommand(entry)) {
            break;
        }
        commandLines.unshift(stripCommandPrompt(entry));
    }
    return commandLines;
}

function collectResultPreview(history, historyIndex) {
    const resultBlock = collectResultBlock(history, historyIndex);
    if (!resultBlock.length) {
        return { commandLines: [], entries: [] };
    }

    const blockStart = history.indexOf(resultBlock[0]);
    const commandLines = collectPrecedingCommandLines(history, blockStart);

    const entries = resultBlock.filter(entry => String((entry && entry.kind) || '') !== 'footer');
    while (entries.length && String((entries.at(-1) && entries.at(-1).kind) || '') === 'blank') {
        entries.pop();
    }

    return {
        commandLines,
        entries
    };
}

function normalizeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizeLink(link) {
    if (!link || typeof link !== 'object' || !link.target) {
        return null;
    }
    return {
        kind: String(link.kind || 'file'),
        target: String(link.target),
        source: String(link.source || '')
    };
}

function normalizeEntries(entries) {
    return Array.isArray(entries) ? entries.map(entry => {
        const kind = String((entry && entry.kind) || 'default');
        return {
            kind,
            segments: Array.isArray(entry && entry.segments)
                ? entry.segments.map(segment => {
                    const fileLink = segment && segment.fileLink && segment.fileLink.path
                        ? {
                            kind: 'file',
                            target: String(segment.fileLink.path),
                            source: String(segment.fileLink.source || 'extension-fallback')
                        }
                        : null;
                    const style = segment && segment.style && typeof segment.style === 'object'
                        ? segment.style
                        : {};
                    const text = String((segment && segment.text) || '');
                    const isSummaryEquals = kind === 'summary' && text.trim() === '=';
                    return {
                        text,
                        className: isSummaryEquals
                            ? 'tok tok-separator'
                            : String((segment && segment.className) || ''),
                        style: {
                            color: !isSummaryEquals && style.color ? String(style.color) : '',
                            backgroundColor: style.backgroundColor ? String(style.backgroundColor) : ''
                        },
                        consoleLink: normalizeLink((segment && segment.consoleLink) || fileLink)
                    };
                })
                : []
        };
    }) : [];
}

function normalizeCommandLines(lines) {
    return normalizeEntries((Array.isArray(lines) ? lines : []).map(line => ({
        kind: 'command-preview',
        segments: Array.isArray(line && line.segments) ? line.segments : []
    })));
}

class ResultPreviewManager {
    constructor(vscodeApi = vscode) {
        this._vscode = vscodeApi;
        this._panel = null;
        this._state = null;
        this._openingPromise = null;
        this._supportPromise = null;
        this._supported = null;
        this._openLinkHandler = null;
    }

    async isSupported() {
        if (typeof this._supported === 'boolean') {
            return this._supported;
        }
        if (!this._supportPromise) {
            this._supportPromise = Promise.resolve(this._vscode.commands.getCommands(true))
                .then(commands => {
                    this._supported = Array.isArray(commands)
                        && commands.includes(MOVE_TO_NEW_WINDOW_COMMAND);
                    return this._supported;
                })
                .catch(() => {
                    this._supported = false;
                    return false;
                })
                .finally(() => {
                    this._supportPromise = null;
                });
        }
        return this._supportPromise;
    }

    async showResult(preview) {
        if (!await this.isSupported()) {
            return false;
        }

        this._state = this._normalizeState(preview);
        this._openLinkHandler = preview && typeof preview.openLink === 'function'
            ? preview.openLink
            : null;

        if (this._openingPromise) {
            const opened = await this._openingPromise;
            if (opened && this._panel) {
                this._updateExistingPanel();
            }
            return opened;
        }

        if (this._panel) {
            try {
                this._updateExistingPanel();
                return true;
            } catch (error) {
                console.warn('Stata All in One: Unable to update result preview:', error.message || error);
                this._disposePanel(this._panel);
                this._supported = false;
                return false;
            }
        }

        this._openingPromise = this._createAndMovePanel()
            .finally(() => {
                this._openingPromise = null;
            });
        const opened = await this._openingPromise;
        if (opened && this._panel) {
            this._updateExistingPanel(false);
        }
        return opened;
    }

    dispose() {
        if (this._panel) {
            this._disposePanel(this._panel);
        } else {
            this._state = null;
            this._openLinkHandler = null;
        }
    }

    _normalizeState(preview) {
        const input = preview && typeof preview === 'object' ? preview : {};
        const appearance = input.appearance && typeof input.appearance === 'object'
            ? input.appearance
            : {};
        return {
            commandLines: normalizeCommandLines(input.commandLines),
            entries: normalizeEntries(input.entries),
            panelTitle: String(input.panelTitle || 'Result Preview | Stata All in One'),
            closeLabel: String(input.closeLabel || 'Close'),
            openFileLabel: String(input.openFileLabel || 'Open file'),
            appearance: {
                themeVars: appearance.themeVars && typeof appearance.themeVars === 'object'
                    ? { ...appearance.themeVars }
                    : {},
                fontOptions: appearance.fontOptions && typeof appearance.fontOptions === 'object'
                    ? { ...appearance.fontOptions }
                    : {}
            },
            scrollPosition: { left: 0, top: 0 }
        };
    }

    async _createAndMovePanel() {
        let panel = null;
        try {
            panel = this._vscode.window.createWebviewPanel(
                PREVIEW_VIEW_TYPE,
                this._state.panelTitle,
                this._vscode.ViewColumn.Active,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            this._panel = panel;
            panel.webview.html = this._getWebviewHtml(panel.webview);
            panel.webview.onDidReceiveMessage(message => {
                this._handleMessage(panel, message);
            });
            panel.onDidDispose(() => {
                if (this._panel === panel) {
                    this._panel = null;
                    this._state = null;
                    this._openLinkHandler = null;
                }
            });

            panel.reveal(this._vscode.ViewColumn.Active, false);
            await this._vscode.commands.executeCommand(MOVE_TO_NEW_WINDOW_COMMAND);
            return this._panel === panel;
        } catch (error) {
            console.warn('Stata All in One: Unable to move result preview to a new window:', error.message || error);
            this._supported = false;
            if (panel && this._panel === panel) {
                this._disposePanel(panel);
            }
            return false;
        }
    }

    _updateExistingPanel(reveal = true) {
        this._panel.title = this._state.panelTitle;
        if (reveal) {
            this._panel.reveal(undefined, false);
        }
        this._postState();
    }

    _disposePanel(panel) {
        if (this._panel === panel) {
            this._panel = null;
            this._state = null;
            this._openLinkHandler = null;
        }
        try {
            panel.dispose();
        } catch (_error) {}
    }

    _handleMessage(panel, message) {
        if (!message || panel !== this._panel) {
            return;
        }
        if (message.type === 'ready') {
            this._postState();
        } else if (message.type === 'scrollChanged' && this._state) {
            this._state.scrollPosition = {
                left: Math.max(0, normalizeNumber(message.left, this._state.scrollPosition.left)),
                top: Math.max(0, normalizeNumber(message.top, this._state.scrollPosition.top))
            };
        } else if (message.type === 'openConsoleFile' && this._openLinkHandler) {
            Promise.resolve()
                .then(() => this._openLinkHandler(normalizeLink(message.link)))
                .catch(error => {
                    console.warn('Stata All in One: Unable to open result preview link:', error.message || error);
                });
        } else if (message.type === 'close') {
            panel.dispose();
        }
    }

    _postState() {
        if (!this._panel || !this._state) {
            return;
        }
        this._panel.webview.postMessage({
            type: 'setResultState',
            commandLines: this._state.commandLines,
            entries: this._state.entries,
            appearance: this._state.appearance,
            closeLabel: this._state.closeLabel,
            openFileLabel: this._state.openFileLabel,
            scrollPosition: this._state.scrollPosition
        });
    }

    _getWebviewHtml(webview) {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource} https: data:; style-src 'unsafe-inline' https://fontsapi.zeoseven.com; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${ONLINE_CJK_FONT_CSS_URL}" crossorigin>
    <style>
        @font-face {
            font-family: "Maple Mono";
            font-style: normal;
            font-display: swap;
            font-weight: 400;
            src: url("${ONLINE_LATIN_FONT_WOFF2_URL}") format("woff2"),
                 url("${ONLINE_LATIN_FONT_WOFF_URL}") format("woff");
        }
        :root {
            color-scheme: light dark;
            --stata-prompt: var(--vscode-descriptionForeground);
            --stata-command: var(--vscode-editor-foreground);
            --stata-keyword: var(--vscode-editor-foreground);
            --stata-string: var(--vscode-editor-foreground);
            --stata-path: var(--vscode-editor-foreground);
            --stata-number: var(--vscode-editor-foreground);
            --stata-comment: var(--vscode-descriptionForeground);
            --stata-function: var(--vscode-editor-foreground);
            --stata-option: var(--stata-function);
            --stata-variable: var(--vscode-editor-foreground);
            --stata-macro: var(--stata-variable);
            --stata-operator: var(--vscode-editor-foreground);
            --stata-plain: var(--vscode-editor-foreground);
            --stata-default: var(--vscode-editor-foreground);
            --stata-error: var(--vscode-errorForeground);
            --stata-header: var(--vscode-textLink-foreground);
            --stata-separator: var(--vscode-panel-border);
            --stata-time: var(--vscode-editor-foreground);
            --stata-time-value: var(--stata-number);
            --preview-font-family: var(--vscode-editor-font-family, monospace);
            --preview-font-size: var(--vscode-editor-font-size, 14px);
        }
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            overflow: hidden;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        #scroll-root {
            width: 100%;
            height: 100%;
            overflow: auto;
        }
        #viewport {
            display: flex;
            width: max-content;
            min-width: 100%;
            min-height: 100%;
            padding: 28px;
            box-sizing: border-box;
        }
        #result-card {
            width: max-content;
            min-width: min(720px, calc(100vw - 56px));
            margin: auto;
            padding: 28px 32px;
            box-sizing: border-box;
            border: none;
            border-radius: 16px;
            background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
            color: var(--stata-default);
            font-family: var(--preview-font-family);
            font-size: var(--preview-font-size);
            line-height: 1.5;
            box-shadow: 0 16px 48px color-mix(in srgb, #000 24%, transparent);
        }
        #command-block {
            margin: 0 0 24px;
            padding: 0 0 18px;
            border-bottom: 1px solid var(--vscode-panel-border);
            color: var(--stata-default);
        }
        #command-block[hidden] {
            display: none;
        }
        .command-preview-line {
            min-height: 1.5em;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            tab-size: 4;
        }
        .result-line {
            min-height: 1.5em;
            margin: 0;
            white-space: pre;
            tab-size: 4;
        }
        .tok { color: var(--stata-default); }
        .tok-plain, .tok-default { color: var(--stata-plain); }
        .tok-prompt { color: var(--stata-prompt); }
        .tok-command { color: var(--stata-command); }
        .tok-keyword { color: var(--stata-keyword); }
        .tok-string { color: var(--stata-string); }
        .tok-path { color: var(--stata-path); }
        .tok-number { color: var(--stata-number); }
        .tok-comment { color: var(--stata-comment); }
        .tok-function { color: var(--stata-function); }
        .tok-option { color: var(--stata-option); }
        .tok-variable { color: var(--stata-variable); }
        .tok-macro { color: var(--stata-macro); }
        .tok-operator { color: var(--stata-operator); }
        .tok-error { color: var(--stata-error); }
        .tok-header { color: var(--stata-header); }
        .tok-separator { color: var(--stata-separator); }
        .tok-time { color: var(--stata-time); }
        .tok-timeValue { color: var(--stata-time-value); }
        .is-dim { opacity: 0.72; }
        .is-bold { font-weight: 700; }
        .is-italic { font-style: italic; }
        .console-file-link {
            text-decoration: underline;
            text-underline-offset: 0.16em;
            cursor: pointer;
        }
        .console-file-link:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 1px;
        }
        #close-button {
            position: fixed;
            top: 14px;
            right: 14px;
            z-index: 2;
            width: 28px;
            height: 28px;
            padding: 0;
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 4px;
            color: var(--vscode-button-foreground);
            background: var(--vscode-button-background);
            font: 20px/24px sans-serif;
            cursor: pointer;
        }
        #close-button:hover { background: var(--vscode-button-hoverBackground); }
        #close-button:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
    </style>
</head>
<body>
    <div id="scroll-root">
        <main id="viewport">
            <section id="result-card" aria-live="polite">
                <div id="command-block" hidden></div>
                <div id="result-content"></div>
            </section>
        </main>
    </div>
    <button id="close-button" type="button" aria-label="Close" title="Close">×</button>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const root = document.documentElement;
        const scrollRoot = document.getElementById('scroll-root');
        const commandBlock = document.getElementById('command-block');
        const resultContent = document.getElementById('result-content');
        const closeButton = document.getElementById('close-button');
        let scrollFrame = 0;

        function safeClasses(value) {
            return String(value || '').split(/\\s+/).filter(name => /^[A-Za-z0-9_-]+$/.test(name));
        }

        function applyAppearance(appearance) {
            const input = appearance && typeof appearance === 'object' ? appearance : {};
            const themeVars = input.themeVars && typeof input.themeVars === 'object' ? input.themeVars : {};
            const variableNames = {
                prompt: '--stata-prompt', command: '--stata-command', keyword: '--stata-keyword',
                string: '--stata-string', path: '--stata-path', number: '--stata-number',
                comment: '--stata-comment', function: '--stata-function', option: '--stata-option',
                variable: '--stata-variable', macro: '--stata-macro', operator: '--stata-operator',
                plain: '--stata-plain', default: '--stata-default', error: '--stata-error',
                header: '--stata-header', separator: '--stata-separator', time: '--stata-time',
                timeValue: '--stata-time-value'
            };
            Object.keys(variableNames).forEach(key => {
                if (themeVars[key]) root.style.setProperty(variableNames[key], String(themeVars[key]));
            });

            const font = input.fontOptions && typeof input.fontOptions === 'object' ? input.fontOptions : {};
            const mode = String(font.fontMode || 'editor');
            let family = font.editorFontFamily || 'var(--vscode-editor-font-family, monospace)';
            if (mode === 'online') family = '"Maple Mono", "Maple Mono NF CN", ' + (font.systemFallbackFamily || 'monospace');
            if (mode === 'custom' && font.customFontFamily) family = String(font.customFontFamily);
            if (mode === 'system') family = String(font.systemFallbackFamily || 'monospace');
            root.style.setProperty('--preview-font-family', family);
            const size = Number(font.fontSize);
            root.style.setProperty('--preview-font-size', (Number.isFinite(size) && size > 0 ? size : 14) + 'px');
        }

        function appendSegments(container, segments, openFileLabel) {
            (Array.isArray(segments) ? segments : []).forEach(segment => {
                const span = document.createElement('span');
                safeClasses(segment && segment.className).forEach(name => span.classList.add(name));
                const style = segment && segment.style && typeof segment.style === 'object' ? segment.style : {};
                if (style.color) span.style.color = String(style.color);
                if (style.backgroundColor) span.style.backgroundColor = String(style.backgroundColor);
                const link = segment && segment.consoleLink;
                if (link && link.target) {
                    span.classList.add('console-file-link');
                    span.setAttribute('role', 'link');
                    span.tabIndex = 0;
                    span.title = String(openFileLabel || 'Open file') + ': ' + String(link.target);
                    const openLink = () => vscode.postMessage({ type: 'openConsoleFile', link });
                    span.addEventListener('click', openLink);
                    span.addEventListener('keydown', event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openLink();
                        }
                    });
                }
                span.textContent = String((segment && segment.text) || '');
                container.appendChild(span);
            });
        }

        function renderCommand(lines, openFileLabel) {
            commandBlock.textContent = '';
            const values = Array.isArray(lines) ? lines : [];
            commandBlock.hidden = values.length === 0;
            values.forEach((entry, index) => {
                const line = document.createElement('div');
                line.className = 'command-preview-line';
                const prompt = document.createElement('span');
                prompt.className = 'tok tok-prompt is-bold';
                prompt.textContent = index === 0 ? '. ' : '> ';
                line.appendChild(prompt);
                appendSegments(line, entry && entry.segments, openFileLabel);
                commandBlock.appendChild(line);
            });
        }

        function renderEntries(entries, openFileLabel) {
            resultContent.textContent = '';
            (Array.isArray(entries) ? entries : []).forEach(entry => {
                const line = document.createElement('div');
                line.className = 'result-line';
                const kind = String((entry && entry.kind) || 'default');
                if (/^[A-Za-z0-9_-]+$/.test(kind)) line.classList.add('line-' + kind);
                appendSegments(line, entry && entry.segments, openFileLabel);
                resultContent.appendChild(line);
            });
        }

        function applyState(message) {
            applyAppearance(message.appearance);
            renderCommand(message.commandLines, message.openFileLabel);
            renderEntries(message.entries, message.openFileLabel);
            closeButton.title = String(message.closeLabel || 'Close');
            closeButton.setAttribute('aria-label', closeButton.title);
            const position = message.scrollPosition || {};
            requestAnimationFrame(() => {
                scrollRoot.scrollLeft = Math.max(0, Number(position.left) || 0);
                scrollRoot.scrollTop = Math.max(0, Number(position.top) || 0);
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message && message.type === 'setResultState') applyState(message);
        });
        scrollRoot.addEventListener('scroll', () => {
            if (scrollFrame) return;
            scrollFrame = requestAnimationFrame(() => {
                scrollFrame = 0;
                vscode.postMessage({
                    type: 'scrollChanged',
                    left: scrollRoot.scrollLeft,
                    top: scrollRoot.scrollTop
                });
            });
        }, { passive: true });
        closeButton.addEventListener('click', () => vscode.postMessage({ type: 'close' }));
        window.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                vscode.postMessage({ type: 'close' });
            }
        });
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}

const resultPreviewManager = new ResultPreviewManager();

module.exports = {
    ResultPreviewManager,
    collectResultBlock,
    collectResultPreview,
    collectPrecedingCommandLines,
    isResultBoundary,
    isPromptOnlyCommand,
    resultPreviewManager,
    MOVE_TO_NEW_WINDOW_COMMAND,
    PREVIEW_VIEW_TYPE
};
