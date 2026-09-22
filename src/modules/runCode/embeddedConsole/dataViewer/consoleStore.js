const directDtaStore = require('./directDtaStore');
const consoleDataReader = require('./consoleDataReader');
const { splitFilterSpec } = require('./provider');
const { msg } = require('../../../../utils/common');

// The Console dataset lives in Stata's memory and can be arbitrarily large, so
// the viewer holds a BOUNDED WINDOW of it instead of a full copy. Rows outside
// the window are read from Stata on demand, and the window is replaced when the
// request moves past it.
const DEFAULT_MAX_CACHED_ROWS = 50000;
const DEFAULT_WINDOW_ROWS = consoleDataReader.DEFAULT_WINDOW_ROWS || 2000;

/**
 * How many raw observations a filtered page request may scan before giving up.
 * A filter changes which observations count as rows, so the viewer has to walk
 * forward through the dataset until the requested number of MATCHES is found.
 * The scan is bounded so a hopeless filter cannot spin forever.
 */
const MAX_FILTER_SCAN_ROWS = 2 * DEFAULT_MAX_CACHED_ROWS;

let live = null;
let loading = null;
let generation = 0;

/** Number of rows actually held in a (possibly partial) dataset slice. */
function sliceLength(data) {
    const headers = (data && data.meta && data.meta.headers) || [];
    if (!headers.length) return 0;
    const column = data.columns[headers[0]];
    return column ? column.length : 0;
}

/** Rows currently cached (used by the memory-budget tests and diagnostics). */
function cachedRowCount() {
    return live && live.data ? sliceLength(live.data) : 0;
}

function clearLive() {
    live = null;
}

/**
 * A "frame" groups a metadata read with the window of rows that came with it.
 * `startObs`/`endObs` are 1-based coordinates in the whole dataset.
 */
function buildLiveFrame(data, startObs, endObs) {
    const total = Number.isFinite(Number(data.meta.totalObservations))
        ? Number(data.meta.totalObservations)
        : Number(data.meta.nobs);
    return {
        data,
        startObs,
        endObs,
        totalObservations: total
    };
}

function frameCoversWindow(frame, startObs, endObs) {
    return frame && startObs >= frame.startObs && endObs <= frame.endObs;
}

function frameNeedsWindow(frame, startObs) {
    // The requested row is either before or after what we hold.
    return !frame || startObs < frame.startObs || startObs > frame.endObs;
}

function windowFor(requestedStart, requestedEnd, total) {
    const totalRows = Number.isFinite(total) && total > 0 ? total : Infinity;
    const start = Math.max(1, Math.floor(requestedStart) || 1);
    let end = Number.isFinite(requestedEnd) && requestedEnd >= start
        ? Math.floor(requestedEnd)
        : start + DEFAULT_WINDOW_ROWS - 1;
    // Read a little extra on both sides so small scrolls stay inside the window.
    const padding = Math.floor(DEFAULT_WINDOW_ROWS / 2);
    const paddedStart = Math.max(1, start - padding);
    const paddedEnd = Math.min(
        totalRows,
        Math.max(end, start) + padding,
        paddedStart + DEFAULT_MAX_CACHED_ROWS - 1
    );
    end = Number.isFinite(paddedEnd) ? paddedEnd : paddedEnd;
    return { start: paddedStart, end };
}

/**
 * Make sure the cached window covers [startObs, endObs].
 * Returns the frame, or null when the request was superseded or cancelled.
 */
async function ensureWindow(startObs, endObs, { signal = null } = {}) {
    const wanted = windowFor(startObs, endObs, live ? live.totalObservations : undefined);
    if (frameCoversWindow(live, startObs, endObs)) {
        return live;
    }
    if (loading) {
        // A read is already in flight; wait for it and re-check.
        try {
            await loading;
        } catch (_error) {
            // Reported by the caller's own read.
        }
        if (frameCoversWindow(live, startObs, endObs)) {
            return live;
        }
    }

    const captureGeneration = generation;
    const request = consoleDataReader.capture(null, {
        startObs: wanted.start,
        endObs: wanted.end,
        signal
    }).then((data) => {
        const frame = buildLiveFrame(data, data.meta.windowStart || 1, data.meta.windowEnd || data.meta.nobs);
        if (captureGeneration === generation) {
            live = frame;
        }
        return { frame, generation: captureGeneration };
    });
    loading = request.finally(() => {
        if (loading === request) {
            loading = null;
        }
    });

    const result = await loading;
    if (result.generation !== generation) {
        // The data changed while we were reading; the caller must retry.
        return null;
    }
    return result.frame;
}

function liveOptions(frame) {
    return {
        rowOffset: frame.startObs - 1,
        totalObservations: frame.totalObservations
    };
}

function hasFilterExpression(filterText) {
    const spec = splitFilterSpec(filterText || '');
    return Boolean(String(spec.ifClause || '').trim() || String(spec.inClause || '').trim());
}

/** Matches found so far in [1, upToRow] for the current filter. */
function countMatches(header, filterText, upToRow) {
    if (!header) return 0;
    const rows = directDtaStore.getMoreFromData(
        header.data,
        0,
        Math.max(0, upToRow - header.startObs + 1),
        filterText,
        liveOptions(header)
    );
    return rows.length;
}

/**
 * Walk forward through the dataset until `needed` matches are available at
 * `matchOffset`, returning the frame that holds the first `needed` matches.
 *
 * Without a filter, a match offset maps straight onto an observation number.
 */
async function ensureMatchesAvailable(filterText, matchOffset, needed) {
    let header = live;
    const filtered = hasFilterExpression(filterText);

    if (!filtered) {
        const start = Math.max(1, matchOffset + 1);
        if (frameNeedsWindow(header, start) || !header) {
            header = await ensureWindow(start, start + Math.max(1, needed) - 1);
        }
        return header;
    }

    if (!header) {
        header = await ensureWindow(1, DEFAULT_WINDOW_ROWS);
        if (!header) return null;
    }

    let scanned = 0;
    while (scanned < MAX_FILTER_SCAN_ROWS) {
        const available = countMatches(header, filterText, header.endObs);
        if (available >= matchOffset + Math.max(1, needed)) {
            return header;
        }
        if (header.endObs >= header.totalObservations) {
            // End of the dataset: the requested page does not exist.
            return header;
        }
        scanned = header.endObs;
        const next = await ensureWindow(header.endObs + 1, header.endObs + DEFAULT_WINDOW_ROWS);
        if (!next) return null;
        // `ensureWindow` may reuse the previous frame when the new window is not
        // actually needed; guard against an infinite loop in that case.
        if (next.startObs === header.startObs && next.endObs === header.endObs) {
            return header;
        }
        header = next;
    }
    return header;
}

async function getLiveSnapshot(filterText = '', startObs = 0, count = 500) {
    const rowLimit = Math.max(1, Number(count) || 500);
    const matchOffset = Math.max(0, Math.floor(Number(startObs) || 0));
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const frame = await ensureMatchesAvailable(filterText, matchOffset, rowLimit);
        if (!frame) {
            // Superseded by an invalidation: retry against the new version.
            continue;
        }
        return directDtaStore.getSnapshotFromData(
            frame.data,
            'Stata memory',
            rowLimit,
            filterText,
            matchOffset,
            liveOptions(frame)
        );
    }
    const error = new Error(msg('dataViewerReadFailed'));
    throw error;
}

async function getLiveMore(startObs, count, filterText = '') {
    const rowLimit = Math.max(1, Number(count) || 500);
    const matchOffset = Math.max(0, Math.floor(Number(startObs) || 0));
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const frame = await ensureMatchesAvailable(filterText, matchOffset, rowLimit);
        if (!frame) continue;
        return directDtaStore.getMoreFromData(
            frame.data,
            matchOffset,
            rowLimit,
            filterText,
            liveOptions(frame)
        );
    }
    return [];
}

async function getLiveColumnAutoFitValue(column, filterText = '') {
    const frame = live || await ensureWindow(1, DEFAULT_WINDOW_ROWS);
    if (!frame) return '';
    return directDtaStore.getColumnAutoFitValueFromData(
        frame.data,
        column,
        filterText,
        liveOptions(frame)
    );
}

/**
 * Read a complete snapshot into a pinned entry. `br` uses this so the table it
 * opened stays reproducible while the user keeps working in Stata.
 */
async function captureSnapshot(filterText = '', startObs = 0, count = 500) {
    const data = await consoleDataReader.capture();
    const frame = buildLiveFrame(data, 1, data.meta.windowEnd || data.meta.nobs);
    const entry = {
        data: frame.data,
        startObs: frame.startObs,
        endObs: frame.endObs,
        totalObservations: frame.totalObservations
    };
    return {
        data: entry.data,
        view: directDtaStore.getSnapshotFromData(
            entry.data,
            'Stata memory',
            count,
            filterText,
            startObs,
            { rowOffset: 0, totalObservations: entry.totalObservations }
        )
    };
}

async function getMore(entry, startObs, count, filterText = '') {
    return directDtaStore.getMoreFromData(entry.data, startObs, count, filterText, {
        rowOffset: entry.startObs ? entry.startObs - 1 : 0,
        totalObservations: entry.totalObservations
    });
}

async function getColumnAutoFitValue(entry, column, filterText = '') {
    return directDtaStore.getColumnAutoFitValueFromData(entry.data, column, filterText, {
        rowOffset: entry.startObs ? entry.startObs - 1 : 0,
        totalObservations: entry.totalObservations
    });
}

async function getSnapshot(entry, filterText = '', startObs = 0, count = 500) {
    return directDtaStore.getSnapshotFromData(entry.data, 'Stata memory', count, filterText, startObs, {
        rowOffset: entry.startObs ? entry.startObs - 1 : 0,
        totalObservations: entry.totalObservations
    });
}

async function invalidateLive() {
    generation += 1;
    clearLive();
}

async function resetLive() {
    generation += 1;
    if (loading) {
        try {
            await loading;
        } catch (_error) {
            // A failed capture is already surfaced by the Data Viewer.
        }
    }
    clearLive();
}

async function dispose(entry) {
    if (entry) entry.data = null;
}

module.exports = {
    getLiveSnapshot,
    getLiveMore,
    getLiveColumnAutoFitValue,
    captureSnapshot,
    getSnapshot,
    getMore,
    getColumnAutoFitValue,
    invalidateLive,
    resetLive,
    dispose,
    cachedRowCount,
    DEFAULT_MAX_CACHED_ROWS,
    DEFAULT_WINDOW_ROWS
};
