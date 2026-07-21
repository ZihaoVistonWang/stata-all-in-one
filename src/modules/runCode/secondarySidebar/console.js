const { StataTerminalRenderer } = require('../embeddedConsole/renderer');

class SecondarySidebarConsole {
    constructor(onChange) {
        this.onChange = typeof onChange === 'function' ? onChange : () => {};
        this.renderer = new StataTerminalRenderer();
        this.history = [];
        this.status = 'idle';
        this.workingDetail = null;
        this.lastRunFailed = false;
        this.width = 88;
        this.overflowNoticeSuppressed = false;
    }

    notify(type, payload = {}) {
        this.onChange({ type, ...payload });
    }

    append(entries) {
        const normalized = Array.isArray(entries) ? entries.filter(Boolean) : [];
        if (!normalized.length) return;
        this.history.push(...normalized);
        this.notify('console.append', { entries: normalized });
    }

    setStatus(status) {
        this.status = status || 'idle';
        if (this.status !== 'running') this.workingDetail = null;
        this.notify('console.status', { status: this.status, workingDetail: this.workingDetail });
    }

    setWorkingDetail(detail) {
        this.workingDetail = detail || null;
        this.notify('console.workingDetail', { detail: this.workingDetail });
    }

    clear() {
        this.history = [];
        this.status = 'idle';
        this.workingDetail = null;
        this.lastRunFailed = false;
        this.renderer.discardPendingOutput();
        this.notify('console.reset', this.getState());
    }

    getState() {
        return {
            entries: this.history,
            status: this.status,
            workingDetail: this.workingDetail,
            overflowNoticeSuppressed: this.overflowNoticeSuppressed
        };
    }

    createSink(reveal) {
        const owner = this;
        return {
            async prepareForExecution() {
                owner.lastRunFailed = false;
                owner.setWorkingDetail(null);
                if (typeof reveal === 'function') await reveal(true);
                owner.setStatus('running');
            },
            async reveal() {
                if (typeof reveal === 'function') await reveal(false);
            },
            writeCommand(command) {
                owner.append(owner.renderer.renderCommandSegments(command, owner.width));
            },
            writeOutputChunk(text) {
                owner.append(owner.renderer.renderOutputChunkSegments(text, owner.width));
            },
            writeError(text) {
                owner.lastRunFailed = true;
                owner.setStatus('error');
                owner.append(owner.renderer.renderErrorSegments(text));
            },
            writeWarningMessage(text) {
                owner.append(owner.renderer.renderWarningBlockSegments(text));
            },
            setStatus(status) { owner.setStatus(status); },
            setWorkingDetail(detail) { owner.setWorkingDetail(detail); },
            writeAccentBlock(text) { owner.append(owner.renderer.renderAccentBlockSegments(text)); },
            writeCommandAccentBlock(text) { owner.append(owner.renderer.renderAccentBlockSegments(text)); },
            writeFunctionAccentBlock(text) { owner.append(owner.renderer.renderFunctionAccentBlockSegments(text)); },
            writePrompt() { owner.append(owner.renderer.renderCommandSegments('', owner.width)); },
            writeBreak() {
                owner.append(owner.renderer.renderBreakLineSegments());
                this.writePrompt();
            },
            writeRawChunk(text) {
                const normalized = String(text || '').replace(/\r\n?/g, '\n');
                if (!normalized) return;
                owner.append(normalized.split('\n').map(line => ({
                    kind: /^>\s?$/.test(line) ? 'raw-prompt' : 'raw',
                    segments: line ? [{
                        text: line,
                        tokenType: /^>\s?$/.test(line) ? 'prompt' : 'plain',
                        className: /^>\s?$/.test(line) ? 'tok tok-prompt is-bold' : 'tok tok-plain',
                        style: { bold: /^>\s?$/.test(line), italic: false, dim: false }
                    }] : []
                })));
            },
            writeGraphEntries(graphs) {
                owner.append((Array.isArray(graphs) ? graphs : []).filter(graph => graph && graph.filePath).map(graph => ({
                    kind: 'graph',
                    graphName: String(graph.graphName || 'Graph'),
                    format: String(graph.format || ''),
                    filePath: graph.filePath,
                    segments: []
                })));
            },
            flushOutput() {
                owner.append(owner.renderer.flushPendingOutputSegments(owner.width));
            },
            discardBufferedOutput() { owner.renderer.discardPendingOutput(); },
            writeRunFooter(durationMs) {
                this.flushOutput();
                owner.append(owner.renderer.renderRunFooterSegments(durationMs, owner.width));
                owner.setStatus(owner.lastRunFailed ? 'error' : 'success');
            },
            dispose() {}
        };
    }
}

module.exports = { SecondarySidebarConsole };
