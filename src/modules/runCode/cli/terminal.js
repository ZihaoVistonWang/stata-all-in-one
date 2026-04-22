const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { StataTerminalRenderer } = require('./renderer');
const config = require('../../../utils/config');
const { msg } = require('../../../utils/common');

const STATA_CLI_TERMINAL_NAME = 'Stata CLI';
const DIMENSION_SETTLE_DELAY_MS = 24;
const PREVIEW_SHRINK_STEP_DELAY_MS = 40;
const DIMENSION_STABLE_SAMPLE_COUNT = 1;
const MAX_DIMENSION_SETTLE_ATTEMPTS = 16;
const MAX_WIDTH_RESIZE_STEPS = 18;
const MAX_HEIGHT_RESIZE_STEPS = 64;
const TARGET_WIDTH_TOLERANCE = 1;
const PREVIEW_HEIGHT_PADDING = 2;
const ASCII_LOGO_DIR = path.resolve(__dirname, '../../../../ascii_logo');
const FIXED_ASCII_LOGO_GROUP = '53x13';

let ASCII_LOGO_CACHE = null;

function loadAsciiLogoCatalog() {
    if (ASCII_LOGO_CACHE) {
        return ASCII_LOGO_CACHE;
    }

    const catalog = [];
    if (!fs.existsSync(ASCII_LOGO_DIR)) {
        ASCII_LOGO_CACHE = catalog;
        return catalog;
    }

    for (const entryName of fs.readdirSync(ASCII_LOGO_DIR).sort()) {
        const groupPath = path.join(ASCII_LOGO_DIR, entryName);
        let stats = null;
        try {
            stats = fs.statSync(groupPath);
        } catch (_) {
            continue;
        }

        if (!stats.isDirectory()) {
            continue;
        }

        const match = entryName.match(/^(\d+)x(\d+)$/);
        if (!match) {
            continue;
        }

        const upPath = path.join(groupPath, 'up.txt');
        const downPath = path.join(groupPath, 'down.txt');
        if (!fs.existsSync(upPath) || !fs.existsSync(downPath)) {
            continue;
        }

        const upText = fs.readFileSync(upPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
        const downText = fs.readFileSync(downPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
        if (!upText || !downText) {
            continue;
        }

        catalog.push({
            groupName: entryName,
            width: Number(match[1]),
            height: Number(match[2]),
            upText,
            downText
        });
    }

    ASCII_LOGO_CACHE = catalog;
    return catalog;
}

function countRenderedLines(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
    if (!normalized) {
        return 0;
    }

    return normalized.split('\n').length;
}

class StataPseudoTerminal {
    constructor() {
        this._writeEmitter = new vscode.EventEmitter();
        this._closeEmitter = new vscode.EventEmitter();
        this._terminal = null;
        this._disposed = false;
        this._dimensions = undefined;
        this._renderer = new StataTerminalRenderer();
        this._previewInitialized = false;
        this._previewMode = false;
        this._hasShownLogoForCurrentTerminal = false;
        this._hasShownInitialNarrowWarning = false;
        this._hasShownStillNarrowWarning = false;
        this._currentLocation = null;

        this._pty = this._createPty();
    }

    _createPty() {
        return {
            onDidWrite: this._writeEmitter.event,
            onDidClose: this._closeEmitter.event,
            open: (initialDimensions) => {
                this._dimensions = initialDimensions;
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
            this._hasShownLogoForCurrentTerminal = false;
        }

        return this._terminal;
    }

    async show() {
        const preferredLocation = config.getCliTerminalLocation();
        const terminal = this.getOrCreateTerminal();
        await this._showAtLocation(terminal, preferredLocation, preferredLocation !== 'bottom');
        return terminal;
    }

    async reveal() {
        const terminal = this.getOrCreateTerminal();
        terminal.show();
        await this._scrollToBottom();
        return terminal;
    }

    async showPreviewOnFileOpen() {
        if (this._previewInitialized) {
            return this.getOrCreateTerminal();
        }

        this._previewInitialized = true;
        const preferredLocation = config.getCliTerminalLocation();
        const terminal = this.getOrCreateTerminal();

        if (preferredLocation === 'bottom') {
            this._previewMode = false;
            await this._showAtLocation(terminal, 'bottom', false);
            const width = await this._waitForStableDimensions();
            const targetHeight = this._getPreviewTargetHeight(width);
            await this._showAsciiLogo(width);
            await this._ensureBottomPreviewHeight(targetHeight);
            return terminal;
        }

        this._previewMode = true;
        await this._showAtLocation(terminal, 'bottom', false);
        const width = await this._waitForStableDimensions();
        const targetHeight = this._getPreviewTargetHeight(width);
        if ((width || 0) < this._getPromotionThreshold() && !this._hasShownInitialNarrowWarning) {
            this.writeWarningMessage(msg('cliPreviewTooNarrow', {
                side: msg(preferredLocation === 'left' ? 'sideLeft' : 'sideRight')
            }));
            this._hasShownInitialNarrowWarning = true;
        }

        await this._showAsciiLogo(width);
        await this._ensureBottomPreviewHeight(targetHeight);
        return terminal;
    }

    async prepareForExecution() {
        const preferredLocation = config.getCliTerminalLocation();

        if (preferredLocation === 'bottom') {
            const terminal = this.getOrCreateTerminal();
            this._previewInitialized = true;
            this._previewMode = false;
            await this._showAtLocation(terminal, 'bottom', false);
            await this._showAsciiLogo();
            return terminal;
        }

        if (!this._previewInitialized) {
            await this.showPreviewOnFileOpen();
        }

        if (!this._previewMode) {
            const terminal = this.getOrCreateTerminal();
            await this._showAtLocation(terminal, preferredLocation, this._shouldAdjustSideWidth(preferredLocation));
            await this._showAsciiLogo();
            return terminal;
        }

        const bottomTerminal = this.getOrCreateTerminal();
        await this._showAtLocation(bottomTerminal, 'bottom', false);
        const width = await this._waitForDimensions();
        await this._ensureBottomPreviewHeight(this._getPreviewTargetHeight(width));

        if ((width || 0) < this._getPromotionThreshold()) {
            if (!this._hasShownStillNarrowWarning) {
                this.writeWarningMessage(msg('cliPreviewStillNarrow'));
                this._hasShownStillNarrowWarning = true;
            }
            return bottomTerminal;
        }

        this.dispose();
        const sideTerminal = this.getOrCreateTerminal();
        this._previewMode = false;
        await this._showAtLocation(sideTerminal, preferredLocation, true);
        await this._showAsciiLogo();
        return sideTerminal;
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

    writeWarningMessage(text) {
        const rendered = this._renderer.renderWarningBlock(text);
        if (!rendered) {
            return;
        }

        this.writeRaw(rendered);
    }

    writeAccentBlock(text) {
        const rendered = this._renderer.renderAccentBlock(text);
        if (!rendered) {
            return;
        }

        this.writeRaw(rendered);
    }

    writeCommandAccentBlock(text) {
        const rendered = this._renderer.renderCommandAccentBlock(text);
        if (!rendered) {
            return;
        }

        this.writeRaw(rendered);
    }

    writeFunctionAccentBlock(text) {
        const rendered = this._renderer.renderFunctionAccentBlock(text);
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

    getHeight() {
        return this._dimensions && Number.isFinite(this._dimensions.rows)
            ? this._dimensions.rows
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
        this._dimensions = undefined;
        this._renderer = new StataTerminalRenderer();
        this._hasShownLogoForCurrentTerminal = false;
        this._pty = this._createPty();
    }

    _normalizeText(text) {
        return String(text || '').replace(/\r?\n/g, '\r\n');
    }

    _getTargetWidth() {
        return config.getCliTerminalMaxWidth();
    }

    _getPromotionThreshold() {
        return Math.ceil(this._getTargetWidth() * 1.8);
    }

    _getPreviewTargetHeight(width) {
        const logoGroup = this._pickAsciiLogoGroupForWidth(width || 0);
        if (!logoGroup) {
            return 1 + PREVIEW_HEIGHT_PADDING;
        }

        const renderedHeight = countRenderedLines(logoGroup.upText) + countRenderedLines(logoGroup.downText);
        return renderedHeight > 0 ? renderedHeight + PREVIEW_HEIGHT_PADDING : 18;
    }

    _shouldAdjustSideWidth(location) {
        if (location !== 'left' && location !== 'right') {
            return false;
        }

        if (this._currentLocation !== location) {
            return true;
        }

        const width = this.getWidth();
        if (!width || !Number.isFinite(width)) {
            return true;
        }

        return width < this._getTargetWidth() - TARGET_WIDTH_TOLERANCE;
    }

    async _showAtLocation(terminal, location, adjustWidth) {
        await this._applyPanelLocation(location);
        this._currentLocation = location;
        terminal.show();
        if (location === 'bottom') {
            await this._waitForStableRows();
        }
        if (adjustWidth && (location === 'left' || location === 'right')) {
            await this._waitForStableDimensions();
            await this._ensureTargetWidth(location, this._getTargetWidth());
            await this._waitForStableDimensions();
        }
        await this._scrollToBottom();
    }

    async _ensureBottomPreviewHeight(targetHeight) {
        let rows = await this._waitForStableRows();
        if (!rows || !Number.isFinite(rows)) {
            return;
        }

        if (Math.abs(targetHeight - rows) <= TARGET_WIDTH_TOLERANCE) {
            return;
        }

        try {
            const initialGap = targetHeight - rows;
            const command = initialGap > 0
                ? 'workbench.action.increaseViewSize'
                : 'workbench.action.decreaseViewSize';
            const stepDelay = initialGap > 0
                ? DIMENSION_SETTLE_DELAY_MS
                : PREVIEW_SHRINK_STEP_DELAY_MS;

            for (let index = 0; index < MAX_HEIGHT_RESIZE_STEPS; index++) {
                const gap = targetHeight - rows;
                if (Math.abs(gap) <= TARGET_WIDTH_TOLERANCE) {
                    break;
                }

                await vscode.commands.executeCommand(command);
                await this._sleep(stepDelay);

                const nextRows = await this._waitForStableRows();
                if (!nextRows || !Number.isFinite(nextRows) || nextRows === rows) {
                    break;
                }

                rows = nextRows;

                if ((initialGap > 0 && rows >= targetHeight) || (initialGap < 0 && rows <= targetHeight)) {
                    break;
                }
            }
        } catch (_) {}
    }

    async _scrollToBottom() {
        try {
            await vscode.commands.executeCommand('workbench.action.terminal.scrollToBottom');
        } catch (_) {}
    }

    async _applyPanelLocation(location) {
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

    async _ensureTargetWidth(location, targetWidth) {
        if (location !== 'left' && location !== 'right') {
            return;
        }

        let columns = await this._waitForStableDimensions();
        if (!columns || !Number.isFinite(columns)) {
            return;
        }

        if (Math.abs(targetWidth - columns) <= TARGET_WIDTH_TOLERANCE) {
            return;
        }

        try {
            const initialGap = targetWidth - columns;
            const command = initialGap > 0
                ? 'workbench.action.increaseViewSize'
                : 'workbench.action.decreaseViewSize';

            for (let index = 0; index < MAX_WIDTH_RESIZE_STEPS; index++) {
                const gap = targetWidth - columns;
                if (Math.abs(gap) <= TARGET_WIDTH_TOLERANCE) {
                    break;
                }

                await vscode.commands.executeCommand(command);
                await this._sleep(DIMENSION_SETTLE_DELAY_MS);

                const nextColumns = await this._waitForStableDimensions();
                if (!nextColumns || !Number.isFinite(nextColumns) || nextColumns === columns) {
                    break;
                }

                columns = nextColumns;

                if ((initialGap > 0 && columns >= targetWidth) || (initialGap < 0 && columns <= targetWidth)) {
                    break;
                }
            }
        } catch (_) {}
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

    async _waitForStableDimensions() {
        let lastWidth = null;
        let stableSamples = 0;

        for (let attempt = 0; attempt < MAX_DIMENSION_SETTLE_ATTEMPTS; attempt++) {
            const width = this.getWidth();
            if (width && Number.isFinite(width)) {
                if (width === lastWidth) {
                    stableSamples += 1;
                } else {
                    lastWidth = width;
                    stableSamples = 1;
                }

                if (stableSamples >= DIMENSION_STABLE_SAMPLE_COUNT) {
                    return width;
                }
            }

            await this._sleep(DIMENSION_SETTLE_DELAY_MS);
        }

        return this.getWidth();
    }

    async _waitForStableRows() {
        let lastRows = null;
        let stableSamples = 0;

        for (let attempt = 0; attempt < MAX_DIMENSION_SETTLE_ATTEMPTS; attempt++) {
            const rows = this.getHeight();
            if (rows && Number.isFinite(rows)) {
                if (rows === lastRows) {
                    stableSamples += 1;
                } else {
                    lastRows = rows;
                    stableSamples = 1;
                }

                if (stableSamples >= DIMENSION_STABLE_SAMPLE_COUNT) {
                    return rows;
                }
            }

            await this._sleep(DIMENSION_SETTLE_DELAY_MS);
        }

        return this.getHeight();
    }

    async _showAsciiLogo(widthOverride = null) {
        if (this._hasShownLogoForCurrentTerminal) {
            return;
        }

        let width = widthOverride || this.getWidth() || 0;
        if (!width) {
            width = await this._waitForStableDimensions() || 0;
        }

        const logoGroup = this._pickAsciiLogoGroupForWidth(width);
        if (!logoGroup) {
            this.writeWarningMessage(msg('cliLogoFallbackStarted'));
            this._hasShownLogoForCurrentTerminal = true;
            return;
        }

        this.writeCommandAccentBlock(logoGroup.upText);
        this.writeFunctionAccentBlock(logoGroup.downText);
        this._hasShownLogoForCurrentTerminal = true;
    }

    _pickAsciiLogoGroupForWidth(width) {
        const groups = loadAsciiLogoCatalog();
        if (!groups.length) {
            return null;
        }

        const fixedGroup = groups.find(group => group.groupName === FIXED_ASCII_LOGO_GROUP);
        if (!fixedGroup) {
            return null;
        }

        if (fixedGroup.width > width) {
            return null;
        }

        return fixedGroup;
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = {
    StataPseudoTerminal,
    STATA_CLI_TERMINAL_NAME
};
