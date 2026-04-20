const vscode = require('vscode');

const STATA_CLI_TERMINAL_NAME = 'Stata CLI';

class StataPseudoTerminal {
    constructor() {
        this._writeEmitter = new vscode.EventEmitter();
        this._closeEmitter = new vscode.EventEmitter();
        this._terminal = null;
        this._disposed = false;
        this._hasWrittenBanner = false;

        this._pty = {
            onDidWrite: this._writeEmitter.event,
            onDidClose: this._closeEmitter.event,
            open: () => {
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

        const lines = text.split(/\r?\n/);
        lines.forEach((line, index) => {
            const prompt = index === 0 ? '. ' : '> ';
            this.writeLine(`${prompt}${line}`);
        });
    }

    writeOutput(text) {
        const normalized = this._normalizeText(text);
        if (!normalized) {
            return;
        }

        this.writeRaw(normalized);
        if (!normalized.endsWith('\r\n')) {
            this.writeRaw('\r\n');
        }
    }

    writeOutputChunk(text) {
        const normalized = this._normalizeText(text);
        if (!normalized) {
            return;
        }

        this.writeRaw(normalized);
    }

    writeError(text) {
        const normalized = this._normalizeText(text);
        if (!normalized) {
            return;
        }

        this.writeLine(`error: ${normalized.replace(/\r\n/g, '\n').trimEnd()}`);
    }

    writePrompt() {
        this.writeRaw('. ');
    }

    writeBreak() {
        this.writeLine('--break--');
        this.writePrompt();
    }

    writeLine(text = '') {
        this.writeRaw(`${this._normalizeText(text)}\r\n`);
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

        this._pty = {
            onDidWrite: this._writeEmitter.event,
            onDidClose: this._closeEmitter.event,
            open: () => {
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
