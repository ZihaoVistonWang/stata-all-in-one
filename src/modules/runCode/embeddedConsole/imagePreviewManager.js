const path = require('path');
const vscode = require('vscode');

const PREVIEW_VIEW_TYPE = 'stataImagePreview';
const MOVE_TO_NEW_WINDOW_COMMAND = 'workbench.action.moveEditorToNewWindow';

function getNonce() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let index = 0; index < 32; index += 1) {
        nonce += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return nonce;
}

function normalizeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

class ImagePreviewManager {
    constructor(vscodeApi = vscode) {
        this._vscode = vscodeApi;
        this._panel = null;
        this._state = null;
        this._openingPromise = null;
    }

    async showImage(image) {
        this._state = this._normalizeState(image);

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
                console.warn('Stata All in One: Unable to update image preview:', error.message || error);
                this._disposePanel(this._panel);
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
            this._panel.dispose();
        }
        this._panel = null;
        this._state = null;
    }

    _normalizeState(image) {
        const input = image && typeof image === 'object' ? image : {};
        return {
            imageUri: String(input.imageUri || input.src || ''),
            filePath: String(input.filePath || ''),
            title: String(input.title || input.graphName || 'Graph'),
            panelTitle: String(input.panelTitle || 'Image Preview'),
            closeLabel: String(input.closeLabel || 'Close'),
            zoom: 1,
            position: { x: 0, y: 0 }
        };
    }

    async _createAndMovePanel() {
        let panel = null;
        try {
            const commands = await this._vscode.commands.getCommands(true);
            if (!commands.includes(MOVE_TO_NEW_WINDOW_COMMAND)) {
                return false;
            }

            panel = this._vscode.window.createWebviewPanel(
                PREVIEW_VIEW_TYPE,
                this._state.panelTitle,
                this._vscode.ViewColumn.Active,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: this._getLocalResourceRoots(this._state.filePath)
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
                }
            });

            panel.reveal(this._vscode.ViewColumn.Active, false);
            await this._vscode.commands.executeCommand(MOVE_TO_NEW_WINDOW_COMMAND);
            return this._panel === panel;
        } catch (error) {
            console.warn('Stata All in One: Unable to move image preview to a new window:', error.message || error);
            if (panel && this._panel === panel) {
                this._disposePanel(panel);
            }
            return false;
        }
    }

    _updateExistingPanel(reveal = true) {
        this._configureLocalResourceRoots(this._panel, this._state.filePath);
        this._panel.title = this._state.panelTitle;
        if (reveal) {
            // Do not pass a column here: the panel may already live in an
            // auxiliary window, and ViewColumn.Active would move it back.
            this._panel.reveal(undefined, false);
        }
        this._postState();
    }

    _disposePanel(panel) {
        if (this._panel === panel) {
            this._panel = null;
            this._state = null;
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
        } else if (message.type === 'previewStateChanged' && this._state) {
            const position = message.position && typeof message.position === 'object'
                ? message.position
                : {};
            this._state.zoom = Math.max(0.01, normalizeNumber(message.zoom, this._state.zoom));
            this._state.position = {
                x: normalizeNumber(position.x, this._state.position.x),
                y: normalizeNumber(position.y, this._state.position.y)
            };
        } else if (message.type === 'close') {
            panel.dispose();
        }
    }

    _postState() {
        if (!this._panel || !this._state) {
            return;
        }
        this._panel.webview.postMessage({
            type: 'setImageState',
            imageUri: this._resolveImageUri(this._panel.webview, this._state),
            title: this._state.title,
            closeLabel: this._state.closeLabel,
            zoom: this._state.zoom,
            position: this._state.position
        });
    }

    _resolveImageUri(webview, state) {
        if (state.filePath) {
            return String(webview.asWebviewUri(this._vscode.Uri.file(state.filePath)));
        }
        return state.imageUri;
    }

    _getLocalResourceRoots(filePath) {
        if (!filePath) {
            return [];
        }
        return [this._vscode.Uri.file(path.dirname(filePath))];
    }

    _configureLocalResourceRoots(panel, filePath) {
        panel.webview.options = {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: this._getLocalResourceRoots(filePath)
        };
    }

    _getWebviewHtml(webview) {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob: https: http:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <style>
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            overflow: hidden;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        #preview {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 28px;
            box-sizing: border-box;
        }
        #preview-image {
            display: block;
            max-width: 100%;
            max-height: 100%;
            background: #fff;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            transform-origin: center center;
        }
        #close-button {
            position: fixed;
            top: 14px;
            right: 14px;
            z-index: 1;
            width: 28px;
            height: 28px;
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 4px;
            color: var(--vscode-button-foreground);
            background: var(--vscode-button-background);
            font: 20px/24px sans-serif;
            cursor: pointer;
        }
        #close-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        #close-button:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
    </style>
</head>
<body>
    <main id="preview">
        <img id="preview-image" alt="">
    </main>
    <button id="close-button" type="button" aria-label="Close" title="Close">×</button>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const image = document.getElementById('preview-image');
        const closeButton = document.getElementById('close-button');
        let currentState = { zoom: 1, position: { x: 0, y: 0 } };

        function applyState(message) {
            currentState = {
                zoom: Number.isFinite(Number(message.zoom)) ? Number(message.zoom) : 1,
                position: {
                    x: Number.isFinite(Number(message.position && message.position.x)) ? Number(message.position.x) : 0,
                    y: Number.isFinite(Number(message.position && message.position.y)) ? Number(message.position.y) : 0
                }
            };
            image.src = String(message.imageUri || '');
            image.alt = String(message.title || 'Graph');
            image.style.transform = 'translate(' + currentState.position.x + 'px, '
                + currentState.position.y + 'px) scale(' + currentState.zoom + ')';
            closeButton.title = String(message.closeLabel || 'Close');
            closeButton.setAttribute('aria-label', closeButton.title);
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message && message.type === 'setImageState') {
                applyState(message);
            }
        });
        image.addEventListener('load', () => {
            vscode.postMessage({
                type: 'previewStateChanged',
                zoom: currentState.zoom,
                position: currentState.position
            });
        });
        closeButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'close' });
        });
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

const imagePreviewManager = new ImagePreviewManager();

module.exports = {
    ImagePreviewManager,
    imagePreviewManager,
    MOVE_TO_NEW_WINDOW_COMMAND,
    PREVIEW_VIEW_TYPE
};
