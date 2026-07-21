const directDtaStore = require('../embeddedConsole/dataViewer/directDtaStore');
const consoleStore = require('../embeddedConsole/dataViewer/consoleStore');
const variableSuggestions = require('../../variableSuggestionService');

class SecondarySidebarDataViewer {
    constructor(onChange) {
        this.onChange = typeof onChange === 'function' ? onChange : () => {};
        this.source = { type: 'console', filePath: null };
        this.filterText = '';
        this.snapshot = null;
        this.loading = false;
    }

    notify(type, payload = {}) {
        this.onChange({ type, ...payload });
    }

    async showConsole(filterText = '') {
        this.source = { type: 'console', filePath: null };
        this.filterText = String(filterText || '');
        return this.refresh();
    }

    async showFile(filePath) {
        this.source = { type: 'file', filePath: String(filePath || '') };
        this.filterText = '';
        return this.refresh();
    }

    async refresh(filterText = this.filterText) {
        this.filterText = String(filterText || '');
        this.loading = true;
        this.notify('dataViewer.loading');
        try {
            const data = this.source.type === 'file'
                ? await directDtaStore.getSnapshot(this.source.filePath, 500, this.filterText)
                : await consoleStore.getLiveSnapshot(this.filterText);
            if (data && Array.isArray(data.allVarNames) && data.allVarNames.length) {
                variableSuggestions.setMemoryVars(data.allVarNames);
            }
            this.snapshot = {
                ...(data || {}),
                variableSuggestions: variableSuggestions.getActiveVariables()
            };
            this.notify('dataViewer.data', { data: this.snapshot });
            return this.snapshot;
        } catch (error) {
            this.snapshot = { error: error.message || String(error) };
            this.notify('dataViewer.data', { data: this.snapshot });
            return this.snapshot;
        } finally {
            this.loading = false;
        }
    }

    async loadMore(startObs, count, filterText = this.filterText) {
        try {
            const rows = this.source.type === 'file'
                ? await directDtaStore.getMore(this.source.filePath, startObs, count, filterText)
                : await consoleStore.getLiveMore(startObs, count, filterText);
            this.notify('dataViewer.more', { rows, hasMore: rows.length >= count });
            return rows;
        } catch (error) {
            this.notify('dataViewer.error', { message: error.message || String(error) });
            return [];
        }
    }

    async invalidateConsole() {
        await consoleStore.invalidateLive();
        if (this.source.type === 'console' && this.snapshot) {
            return this.refresh();
        }
        return null;
    }

    getState() {
        return {
            source: this.source,
            filterText: this.filterText,
            data: this.snapshot
        };
    }
}

module.exports = { SecondarySidebarDataViewer };
