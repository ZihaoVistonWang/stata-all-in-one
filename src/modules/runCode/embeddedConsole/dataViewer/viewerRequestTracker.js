/**
 * Per-panel Data Viewer request tracking.
 *
 * Two independent problems are solved here:
 *
 * 1. Views. Several .dta files can be open at the same time, but the old code
 *    kept a single `_panels.file` / `_filePaths.file(panel)` pair and every
 *    message handler re-read it. A pagination request started from file A could
 *    therefore end up reading file B (whichever panel was attached last) and
 *    post the rows to B. All file/view state is now keyed by the panel object.
 *
 * 2. Request versioning. Refresh, pagination and auto-fit are asynchronous, and
 *    their results arrive out of order: a slow read for filter X can land after
 *    a fast read for filter Y and overwrite it. Every request gets a sequence
 *    number per view, and a response is only applied when it still belongs to
 *    the newest request. Responses are additionally stamped with the data
 *    version they were computed from, so a response computed against an
 *    outdated dataset is discarded too.
 */

const REQUEST_KINDS = Object.freeze({
    REFRESH: 'refresh',
    PAGE: 'page',
    AUTOFIT: 'autofit'
});

/**
 * A single panel's view state: its mode, its own file (file mode), the current
 * filter, the data version it is showing and the sequence counters.
 */
class ViewerRequestTracker {
    constructor({ mode = 'console', filePath = null } = {}) {
        this.mode = mode;
        this.filePath = filePath;
        this.closed = false;
        this.filterText = '';
        this.dataVersion = 0;
        this.lastApplied = { refresh: 0, page: 0, autofit: 0 };
        this.inFlight = { refresh: 0, page: 0, autofit: 0 };
        this.sequences = { refresh: 0, page: 0, autofit: 0 };
        // "Loading" state of the lazy window, so a second scroll cannot start a
        // duplicate fetch for the same range.
        this.loadingWindow = null;
    }

    setFilePath(filePath) {
        this.filePath = filePath || null;
    }

    setDataVersion(version) {
        this.dataVersion = Number(version) || 0;
    }

    /**
     * Open a new request. Returns a ticket that must be presented to
     * `isCurrent` before its result is applied.
     */
    begin(kind = REQUEST_KINDS.REFRESH, { filterText = null, dataVersion = null } = {}) {
        const key = this._key(kind);
        this.sequences[key] += 1;
        if (filterText !== null) {
            this.filterText = String(filterText || '');
        }
        if (dataVersion !== null) {
            this.dataVersion = Number(dataVersion) || 0;
        }
        const ticket = {
            kind: key,
            sequence: this.sequences[key],
            filterText: this.filterText,
            dataVersion: this.dataVersion,
            mode: this.mode,
            filePath: this.filePath
        };
        this.inFlight[key] = ticket.sequence;
        return ticket;
    }

    /**
     * True when `ticket` is still the newest request of its kind for this view,
     * the view has not been closed, and the underlying view (file / filter /
     * dataset version) has not changed since the request started.
     */
    isCurrent(ticket) {
        if (!ticket || this.closed) {
            return false;
        }
        const key = this._key(ticket.kind);
        if (ticket.sequence !== this.sequences[key]) {
            return false;
        }
        if (ticket.mode !== this.mode || ticket.filePath !== this.filePath) {
            return false;
        }
        if (ticket.dataVersion !== this.dataVersion) {
            return false;
        }
        // A refresh that starts after a page request invalidates the page.
        if (key === REQUEST_KINDS.PAGE && ticket.sequence <= 0) {
            return false;
        }
        return true;
    }

    /**
     * Record that a request's result is being applied. Returns false when the
     * result must be discarded.
     */
    apply(ticket) {
        if (!this.isCurrent(ticket)) {
            return false;
        }
        this.lastApplied[this._key(ticket.kind)] = ticket.sequence;
        this.inFlight[this._key(ticket.kind)] = 0;
        return true;
    }

    /**
     * Supersede every pending request for this view (a new refresh, a data
     * change, a filter change, or a close). Results already in flight become
     * stale and are dropped.
     */
    supersede(kinds = null) {
        const list = kinds || Object.keys(this.sequences);
        for (const kind of list) {
            const key = this._key(kind);
            this.sequences[key] += 1;
            this.inFlight[key] = 0;
        }
        this.loadingWindow = null;
    }

    /**
     * Guard a lazy-window fetch: the same range must not be fetched twice while
     * it is already loading.
     */
    beginWindow(key) {
        if (this.loadingWindow === key) {
            return false;
        }
        this.loadingWindow = key;
        return true;
    }

    endWindow(key) {
        if (this.loadingWindow === key) {
            this.loadingWindow = null;
        }
    }

    markClosed() {
        this.closed = true;
        this.supersede();
    }

    isClosed() {
        return this.closed;
    }

    hasPending() {
        return Object.values(this.inFlight).some((value) => value > 0);
    }

    isPending(kind) {
        return this.inFlight[this._key(kind)] > 0;
    }

    _key(kind) {
        const key = String(kind || REQUEST_KINDS.REFRESH);
        if (!(key in this.sequences)) {
            throw new Error(`Unknown Data Viewer request kind: ${kind}`);
        }
        return key;
    }
}

/**
 * Registry of live views, one per panel object. `acquire` never returns a
 * tracker that was already closed, so a reopened panel starts clean.
 */
class ViewerRequestTrackerRegistry {
    constructor() {
        this._trackers = new WeakMap();
    }

    acquire(panel, { mode = 'console', filePath = null } = {}) {
        if (!panel) {
            throw new Error('A panel is required to track Data Viewer requests.');
        }
        let tracker = this._trackers.get(panel);
        if (!tracker || tracker.isClosed()) {
            tracker = new ViewerRequestTracker({ mode, filePath });
            this._trackers.set(panel, tracker);
        } else {
            tracker.mode = mode;
            if (filePath !== null && filePath !== undefined) {
                tracker.setFilePath(filePath);
            }
        }
        return tracker;
    }

    peek(panel) {
        if (!panel) {
            return null;
        }
        const tracker = this._trackers.get(panel);
        return tracker && !tracker.isClosed() ? tracker : null;
    }

    release(panel) {
        const tracker = this._trackers.get(panel);
        if (tracker) {
            tracker.markClosed();
            this._trackers.delete(panel);
        }
        return tracker;
    }
}

module.exports = {
    REQUEST_KINDS,
    ViewerRequestTracker,
    ViewerRequestTrackerRegistry
};
