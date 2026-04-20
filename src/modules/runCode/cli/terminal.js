const vscode = require('vscode');
const { StataTerminalRenderer } = require('./renderer');

const STATA_CLI_TERMINAL_NAME = 'Stata CLI';
const MINIMUM_CLI_COLUMNS = 90;
const MAX_WIDTH_ADJUST_ATTEMPTS = 10;
const MAX_STAGNANT_ATTEMPTS = 3;
const DIMENSION_SETTLE_DELAY_MS = 35;
const MAX_BURST_RESIZE_STEPS = 3;

class StataPseudoTerminal {
    constructor() {
        this._writeEmitter = new vscode.EventEmitter();
        this._closeEmitter = new vscode.EventEmitter();
        this._terminal = null;
        this._disposed = false;
        this._hasWrittenBanner = false;
        this._dimensions = undefined;
        this._renderer = new StataTerminalRenderer();
        this._hasAutoSizedWidth = false;

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
        if (!this._hasAutoSizedWidth) {
            await this._ensurePreferredWidth();
        }
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
        this._hasAutoSizedWidth = false;

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

    async _ensurePreferredWidth() {
        const config = require('../../../utils/config');
        const location = config.getCliTerminalLocation();

        if (location !== 'left' && location !== 'right') {
            this._hasAutoSizedWidth = true;
            return;
        }

        let columns = await this._waitForDimensions();
        if (!columns || columns >= MINIMUM_CLI_COLUMNS) {
            this._hasAutoSizedWidth = true;
            return;
        }

        let stagnantAttempts = 0;
        for (let attempt = 0; attempt < MAX_WIDTH_ADJUST_ATTEMPTS; attempt++) {
            const before = columns;
            const changed = await this._increaseCurrentViewSize(MINIMUM_CLI_COLUMNS - before);
            if (!changed) {
                break;
            }

            columns = await this._waitForDimensions();
            if (!columns || columns >= MINIMUM_CLI_COLUMNS) {
                this._hasAutoSizedWidth = true;
                return;
            }

            if (columns <= before) {
                stagnantAttempts += 1;
                if (stagnantAttempts >= MAX_STAGNANT_ATTEMPTS) {
                    this._hasAutoSizedWidth = true;
                    return;
                }
            } else {
                stagnantAttempts = 0;
            }
        }

        this._hasAutoSizedWidth = true;
    }

    async _waitForDimensions() {
        for (let attempt = 0; attempt < 10; attempt++) {
            const width = this.getWidth();
            if (width && Number.isFinite(width)) {
                return width;
            }
            await this._sleep(DIMENSION_SETTLE_DELAY_MS);
        }

        return this.getWidth();
    }

    async _increaseCurrentViewSize(columnGap = 0) {
        const burstSteps = Math.max(1, Math.min(MAX_BURST_RESIZE_STEPS, Math.ceil(columnGap / 8)));

        try {
            for (let step = 0; step < burstSteps; step++) {
                await vscode.commands.executeCommand('workbench.action.increaseViewSize');
            }
            await this._sleep(DIMENSION_SETTLE_DELAY_MS);
            return true;
        } catch (_) {
            return false;
        }
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = {
    StataPseudoTerminal
};
