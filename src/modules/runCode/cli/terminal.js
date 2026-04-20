const vscode = require('vscode');
const { StataTerminalRenderer } = require('./renderer');

const STATA_CLI_TERMINAL_NAME = 'Stata CLI';

class StataPseudoTerminal {
    constructor() {
        this._writeEmitter = new vscode.EventEmitter();
        this._closeEmitter = new vscode.EventEmitter();
        this._terminal = null;
        this._disposed = false;
        this._hasWrittenBanner = false;
        this._dimensions = undefined;
        this._renderer = new StataTerminalRenderer();

        this._pty = {
            onDidWrite: this._writeEmitter.event,
            onDidClose: this._closeEmitter.event,
            open: (initialDimensions) => {
                this._dimensions = initialDimensions;
                if (!this._hasWrittenBanner) {
                    this._hasWrittenBanner = true;
                    this.writeLine('Stata CLI session ready');
                }
            },
            close: () => {
                this._terminal = null;
            },
            handleInput: () => {
                // Reserved for interactive terminal input in the next phase.
            },
            setDimensions: (dimensions) => {
                this._dimensions = dimensions;
            }
        };
    }

    getOrCreateTerminal() {
        if (this._disposed) {
            this._resetAfterDispose();
        }

        if (!this._terminal) {
            this._terminal = vscode.window.createTerminal({
                name: STATA_CLI_TERMINAL_NAME,
                pty: this._pty,
                iconPath: new vscode.ThemeIcon('stats')
            });
        }

        return this._terminal;
    }

    async show() {
        const terminal = this.getOrCreateTerminal();
        await this._applyPreferredPanelLocation();
        terminal.show();
        await this._scrollToBottom();
        return terminal;
    }

    writeCommand(command) {
        const text = typeof command === 'string' ? command.trimEnd() : '';
        if (!text) {
            this.writePrompt();
            return;
        }

        this.writeRaw(this._renderer.renderCommand(text, this.getWidth()));
    }

    writeOutput(text) {
        const rendered = this._renderer.renderOutputChunk(text, this.getWidth());
        if (!rendered) {
            return;
        }

        this.writeRaw(rendered);
        const flushed = this._renderer.flushPendingOutput(this.getWidth());
        if (flushed) {
            this.writeRaw(`${flushed}\n`);
        }
    }

    writeOutputChunk(text) {
        const rendered = this._renderer.renderOutputChunk(text, this.getWidth());
        if (!rendered) {
            return;
        }

        this.writeRaw(rendered);
    }

    writeError(text) {
        const rendered = this._renderer.renderError(text);
        if (!rendered) {
            return;
        }

        this.writeRaw(rendered);
    }

    writePrompt() {
        this.writeRaw('. ');
    }

    writeBreak() {
        this.writeRaw(this._renderer.renderBreakLine());
        this.writePrompt();
    }

    writeLine(text = '') {
        this.writeRaw(`${this._normalizeText(text)}\r\n`);
    }

    writeRawChunk(text) {
        const normalized = this._normalizeText(text);
        if (!normalized) {
            return;
        }

        this.writeRaw(normalized);
    }

    flushOutput() {
        const flushed = this._renderer.flushPendingOutput(this.getWidth());
        if (flushed) {
            this.writeRaw(flushed);
        }
    }

    writeRunFooter(durationMs) {
        this.flushOutput();
        this.writeRaw(this._renderer.renderRunFooter(durationMs, this.getWidth()));
    }

    getWidth() {
        return this._dimensions && Number.isFinite(this._dimensions.columns)
            ? this._dimensions.columns
            : undefined;
    }

    writeRaw(text) {
        this._writeEmitter.fire(this._normalizeText(text));
        this._scrollToBottom();
    }

    dispose() {
        if (this._terminal) {
            const terminal = this._terminal;
            this._terminal = null;
            terminal.dispose();
        }

        this._closeEmitter.fire();
        this._disposed = true;
    }

    _resetAfterDispose() {
        this._writeEmitter.dispose();
        this._closeEmitter.dispose();
        this._writeEmitter = new vscode.EventEmitter();
        this._closeEmitter = new vscode.EventEmitter();
        this._disposed = false;
        this._hasWrittenBanner = false;
        this._dimensions = undefined;
        this._renderer = new StataTerminalRenderer();

        this._pty = {
            onDidWrite: this._writeEmitter.event,
            onDidClose: this._closeEmitter.event,
            open: (initialDimensions) => {
                this._dimensions = initialDimensions;
                if (!this._hasWrittenBanner) {
                    this._hasWrittenBanner = true;
                    this.writeLine('Stata CLI session ready');
                }
            },
            close: () => {
                this._terminal = null;
            },
            handleInput: () => {
                // Reserved for interactive terminal input in the next phase.
            },
            setDimensions: (dimensions) => {
                this._dimensions = dimensions;
            }
        };
    }

    _normalizeText(text) {
        return String(text || '').replace(/\r?\n/g, '\r\n');
    }

    async _scrollToBottom() {
        try {
            await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
        } catch (_) {}
    }

    async _applyPreferredPanelLocation() {
        const config = require('../../../utils/config');
        const location = config.getCliTerminalLocation();

        const commandMap = {
            bottom: 'workbench.action.positionPanelBottom',
            right: 'workbench.action.positionPanelRight',
            left: 'workbench.action.positionPanelLeft'
        };

        const command = commandMap[location];
        if (!command) {
            return;
        }

        try {
            await vscode.commands.executeCommand(command);
        } catch (_) {}
    }
}

module.exports = {
    StataPseudoTerminal
};
