const fs = require('fs/promises');
const path = require('path');
const { DtaParser } = require('./dtaParser');
const { compileFilter } = require('./dtaFilterCompiler');
const { splitFilterSpec } = require('./provider');
const { msg } = require('../../../../utils/common');

// Based on the MIT-licensed parser architecture in stata-preview. This module
// intentionally exposes only the existing viewer's metadata/rows/filter API.
const sessions = new Map();

/**
 * Read one cell.
 *
 * The stored value is returned UNCHANGED. Rounding here (the previous
 * `Math.round(value * 1e6) / 1e6`) destroyed precision — 1e-8 displayed as 0,
 * and values above ~1.8e302 overflowed to Infinity — and the loss leaked into
 * copy, filtering and column widths. Presentation belongs in formatCellValue().
 */
function valueAt(data, name, row) {
    if (data.missing[name] && data.missing[name][row]) return null;
    return data.columns[name][row];
}

/** Stata's numeric missing value is at least this large. */
const STATA_MISSING_THRESHOLD = 8.98846567431158e307;

function isStataMissingNumber(value) {
    return !Number.isFinite(value) || value >= STATA_MISSING_THRESHOLD;
}

/**
 * Presentation-only formatting for one cell.
 *
 * Display and copy share this so the clipboard content matches what the user can
 * actually see; the underlying dataset is never modified.
 */
function formatCellValue(value, type) {
    // SELF-CONTAINED on purpose: this function is serialized into the webview,
    // where no module-scope helper exists.
    var STATA_MISSING = 8.98846567431158e307;
    if (value === null || value === undefined) return '.';
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return '.';
        // Stata's "." — never print a huge number as if it were data.
        if (!Number.isFinite(value) || value >= STATA_MISSING) return '.';
        var magnitude = Math.abs(value);
        if (Number.isInteger(value) && magnitude < 1e12) {
            return String(value);
        }
        // Outside the range where a fixed-notation string stays short and
        // readable, use exponential notation (what Stata's %g formats do).
        if (magnitude !== 0 && (magnitude >= 1e12 || magnitude < 1e-4)) {
            return value.toExponential(2);
        }
        // Show only the significant digits the storage type can actually hold:
        // a `float` widened to a double must not read as 3.5799999237060547, and
        // a `double` must not show binary-representation noise
        // (0.1 + 0.2 has to read as 0.3). Stata's own default display uses 7
        // significant digits for float and about 12 for double.
        var precision = String(type || '').toLowerCase() === 'float' ? 7 : 12;
        return String(Number(value.toPrecision(precision)));
    }
    var text = String(value);
    if (text.trim() === '' || /^nan$/i.test(text.trim())) return '.';
    return text;
}

function displayValue(value, type) {
    return formatCellValue(value, type);
}

function textWidthScore(value) {
    let score = 0;
    for (const character of Array.from(String(value || ''))) {
        const codePoint = character.codePointAt(0);
        score += (
            codePoint >= 0x1100
            && (
                codePoint <= 0x115f
                || codePoint === 0x2329
                || codePoint === 0x232a
                || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
                || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
                || (codePoint >= 0xf900 && codePoint <= 0xfaff)
                || (codePoint >= 0xfe10 && codePoint <= 0xfe6f)
                || (codePoint >= 0xff00 && codePoint <= 0xff60)
                || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
                || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
            )
        ) ? 2 : 1;
    }
    return score;
}

// Parsed .dta files are cached so paging and filtering do not re-parse, but the
// cache is bounded: every open Data Viewer keeps its file, so the cap is
// generous while still preventing an unbounded pile of parsed datasets.
const MAX_CACHED_FILES = 8;

function sessionFor(filePath) {
    const key = path.resolve(filePath);
    let session = sessions.get(key);
    if (!session) {
        session = { key, loading: null, stat: null, data: null };
        sessions.set(key, session);
    }
    // Refresh insertion order and evict the least recently used file when the
    // cache grows past the cap.
    sessions.delete(key);
    sessions.set(key, session);
    if (sessions.size > MAX_CACHED_FILES) {
        for (const [oldestKey, oldest] of sessions) {
            if (oldestKey === key) continue;
            if (oldest.loading) continue;
            oldest.data = null;
            sessions.delete(oldestKey);
            break;
        }
    }
    return session;
}

async function load(filePath, force = false) {
    const session = sessionFor(filePath);
    let stat;
    try {
        stat = await fs.stat(session.key);
    } catch (error) {
        // A missing or unreadable file is a FILE problem; the caller must be able
        // to say so instead of showing "no dataset".
        error.fileUnavailable = true;
        throw error;
    }
    if (!force && session.data && session.stat
        && session.stat.size === stat.size && session.stat.mtimeMs === stat.mtimeMs) {
        return session.data;
    }
    if (session.loading) return session.loading;
    session.loading = (async () => {
        let buffer;
        try {
            buffer = await fs.readFile(session.key);
        } catch (error) {
            error.fileUnavailable = true;
            throw error;
        }
        const data = await DtaParser.parseColumnarAsync(buffer, { yieldEvery: 50000 });
        session.stat = { size: stat.size, mtimeMs: stat.mtimeMs };
        session.data = data;
        return data;
    })();
    try {
        return await session.loading;
    } finally {
        session.loading = null;
    }
}

/**
 * Expand one varlist token the way Stata's `unab`/varlist rules do:
 * `_all`, an exact name, a `prefix*` wildcard, a `?` single-character wildcard,
 * or a `from-to` range in dataset order.
 */
function expandVarToken(token, headers) {
    const trimmed = String(token || '').trim();
    if (!trimmed) return [];
    if (trimmed === '_all' || trimmed === '*') {
        return headers.slice();
    }
    if (trimmed.includes('*') || trimmed.includes('?')) {
        const pattern = new RegExp(
            `^${escapeRegExp(trimmed).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`,
            'i'
        );
        return headers.filter((name) => pattern.test(name));
    }
    if (headers.includes(trimmed)) {
        return [trimmed];
    }
    // `from-to` range, in dataset order (Stata also accepts ranges for
    // abbreviated names; exact endpoints cover the common `x-z` usage).
    const range = trimmed.match(/^([^\s-]+)-([^\s-]+)$/);
    if (range) {
        const from = headers.indexOf(range[1]);
        const to = headers.indexOf(range[2]);
        if (from >= 0 && to >= 0) {
            return from <= to ? headers.slice(from, to + 1) : headers.slice(to, from + 1);
        }
        // Fall back to documented Stata abbreviation behaviour.
        const fromMatches = matchAbbreviation(range[1], headers);
        const toMatches = matchAbbreviation(range[2], headers);
        if (fromMatches.length === 1 && toMatches.length === 1) {
            const startIndex = headers.indexOf(fromMatches[0]);
            const endIndex = headers.indexOf(toMatches[0]);
            return startIndex <= endIndex
                ? headers.slice(startIndex, endIndex + 1)
                : headers.slice(endIndex, startIndex + 1);
        }
    }
    const abbreviated = matchAbbreviation(trimmed, headers);
    if (abbreviated.length === 1) {
        return abbreviated;
    }
    return [];
}

function matchAbbreviation(token, headers) {
    const wanted = String(token || '').toLowerCase();
    return headers.filter((name) => String(name).toLowerCase().startsWith(wanted));
}

function escapeRegExp(value) {
    return String(value).replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse the `in` qualifier. Stata accepts `in 5`, `in 2/10`, `in 1/l` (last) and
 * `in f/10` (first), all 1-based and inclusive.
 */
function parseInRange(inClause, nobs) {
    const text = String(inClause || '').trim();
    if (!text) return null;
    const match = text.match(/^([0-9]+|[lf])\s*(?:\/\s*([0-9]+|[lf])\s*)?$/i);
    if (!match) {
        throw new Error(msg('dataViewerUnsupportedFilter', { expression: `in ${inClause}` }));
    }
    const resolve = (token, fallback) => {
        const value = String(token || '').toLowerCase();
        if (value === 'l') return nobs;
        if (value === 'f') return 1;
        if (value === '') return fallback;
        return Number(value);
    };
    const first = resolve(match[1], 1);
    const last = resolve(match[2], first);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first < 1 || last < 1) {
        throw new Error(msg('dataViewerUnsupportedFilter', { expression: `in ${inClause}` }));
    }
    return {
        start: Math.max(0, Math.min(nobs, first - 1)),
        end: Math.max(0, Math.min(nobs, last))
    };
}

/**
 * Resolve a filter spec against a dataset slice.
 *
 * `options.nobs` is the size of the slice the query will iterate (the Console
 * holds a window, not the whole dataset); `in`/`_N` are relative to the whole
 * dataset, which `options.totalObservations` carries.
 */
function buildQuery(data, filterText, options = {}) {
    const spec = splitFilterSpec(filterText || '');
    const nobs = Number.isFinite(Number(options.nobs)) ? Number(options.nobs) : sliceLength(data);
    const expression = String(spec.ifClause || '').trim();
    let filter = null;
    if (expression) {
        try {
            filter = compileFilter(expression, {
                columns: data.columns,
                missing: data.missing,
                meta: {
                    headers: data.meta.headers,
                    nobs: Number.isFinite(Number(options.totalObservations))
                        ? Number(options.totalObservations)
                        : nobs
                }
            }).fn;
        } catch (error) {
            // Never fall back to "no filter": an unsupported expression must fail
            // loudly instead of showing different rows than Stata would.
            throw new Error(msg('dataViewerUnsupportedFilter', { expression }));
        }
    }
    let start = 0;
    let end = nobs;
    if (spec.inClause) {
        const range = parseInRange(spec.inClause, nobs);
        if (range) {
            start = range.start;
            end = range.end;
        }
    }
    let columns = data.meta.headers;
    const requestedVarList = options.varList !== undefined ? options.varList : spec.varList;
    if (requestedVarList) {
        columns = [];
        for (const token of String(requestedVarList).split(/\s+/).filter(Boolean)) {
            for (const name of expandVarToken(token, data.meta.headers)) {
                if (!columns.includes(name)) columns.push(name);
            }
        }
        if (!columns.length) {
            throw new Error(msg('dataViewerUnsupportedFilter', { expression: requestedVarList }));
        }
    }
    return { filter, start, end, columns, spec };
}

async function getSnapshot(filePath, rowLimit = 500, filterText = '', force = false, startObs = 0, options = {}) {
    const data = await load(filePath, force);
    if (options.signal && options.signal.aborted) {
        const error = new Error(msg('dataViewerReadCancelled'));
        error.cancelled = true;
        throw error;
    }
    return getSnapshotFromData(data, filePath, rowLimit, filterText, startObs, options);
}

/**
 * Collect a window of rows.
 *
 * `data` may hold only a slice of the dataset (the Console reads bounded
 * windows), in which case `rowOffset` is the 0-based dataset row that
 * `data.columns[*][0]` corresponds to. `startObs` is a coordinate in the whole
 * dataset when `absolute` is set, and a coordinate inside the slice otherwise.
 */
function collectWindow(data, query, startObs, rowLimit, options = {}) {
    const rowOffset = Math.max(0, Math.floor(Number(options.rowOffset) || 0));
    const sliceRows = sliceLength(data);
    const rows = [];
    let matched = 0;
    for (let row = query.start; row < query.end; row += 1) {
        const local = row - rowOffset;
        if (local < 0 || local >= sliceRows) continue;
        if (query.filter && !query.filter(row - rowOffset)) continue;
        if (matched >= startObs && rows.length < rowLimit) {
            rows.push({
                rowNum: row + 1,
                values: query.columns.map((name) => valueAt(data, name, local))
            });
        }
        matched += 1;
    }
    return { rows, matched };
}

function getSnapshotFromData(data, source, rowLimit = 500, filterText = '', startObs = 0, options = {}) {
    const rowOffset = Math.max(0, Math.floor(Number(options.rowOffset) || 0));
    // `meta.nobs` is the size of the WHOLE dataset; the slice may be smaller.
    const sliceRows = sliceLength(data);
    const totalObservations = Number.isFinite(Number(options.totalObservations))
        ? Number(options.totalObservations)
        : data.meta.nobs;
    const query = buildQuery(data, filterText, {
        nobs: sliceRows,
        rowOffset,
        totalObservations,
        varList: options.varList
    });
    const headers = query.columns;
    const max = Math.min(Number(rowLimit) || 500, sliceRows);
    let windowStart = Math.max(0, Math.floor(Number(startObs) || 0));
    let window = collectWindow(data, query, windowStart, max, { rowOffset });
    if (window.matched > 0 && windowStart >= window.matched) {
        windowStart = Math.max(0, window.matched - max);
        window = collectWindow(data, query, windowStart, max, { rowOffset });
    }
    return {
        // `observations` is the number of rows matched by the current filter;
        // `totalObservations` is the size of the dataset before filtering.
        // The viewer needs both to tell "the filter matched nothing" apart from
        // "the dataset is empty".
        info: {
            observations: window.matched,
            totalObservations,
            variables: headers.length,
            source,
            sortedBy: null
        },
        // Keep the untouched dataset metadata so callers can classify the result
        // (no dataset / zero observations / no matches) without re-reading Stata.
        meta: {
            headers: data.meta.headers.slice(),
            nobs: totalObservations
        },
        rowOffset,
        sliceRows,
        vars: headers.map((name) => {
            const index = data.meta.headers.indexOf(name);
            return {
                name,
                type: data.meta.types[index] || '',
                format: (data.meta.formats && data.meta.formats[index]) || '.',
                label: data.meta.labels[index] || null,
                valueLabel: null
            };
        }),
        dataColumns: headers,
        allVarNames: headers,
        dataRows: window.rows,
        windowStart,
        hasMoreBefore: windowStart > 0,
        hasMore: windowStart + window.rows.length < window.matched,
        filterText: String(filterText || ''),
        hasFilter: Boolean(String(filterText || '').trim())
    };
}

async function getMore(filePath, startObs, count, filterText = '') {
    const data = await load(filePath);
    return getMoreFromData(data, startObs, count, filterText);
}

function getMoreFromData(data, startObs, count, filterText = '', options = {}) {
    const rowOffset = Math.max(0, Math.floor(Number(options.rowOffset) || 0));
    const sliceRows = sliceLength(data);
    const query = buildQuery(data, filterText, {
        nobs: sliceRows,
        rowOffset,
        totalObservations: options.totalObservations,
        varList: options.varList
    });
    const headers = query.columns;
    const filter = query.filter;
    const rows = [];
    let matched = 0;
    for (let row = query.start; row < query.end && rows.length < count; row += 1) {
        const local = row - rowOffset;
        if (local < 0 || local >= sliceRows) continue;
        if (filter && !filter(row - rowOffset)) continue;
        if (matched++ < startObs) continue;
        rows.push({ rowNum: row + 1, values: headers.map((name) => valueAt(data, name, local)) });
    }
    return rows;
}

/** Number of rows actually held in this (possibly partial) dataset slice. */
function sliceLength(data) {
    const headers = (data.meta && data.meta.headers) || [];
    if (!headers.length) return 0;
    const column = data.columns[headers[0]];
    return column ? column.length : 0;
}

function getColumnAutoFitValueFromData(data, column, filterText = '', options = {}) {
    const rowOffset = Math.max(0, Math.floor(Number(options.rowOffset) || 0));
    const sliceRows = sliceLength(data);
    const query = buildQuery(data, filterText, {
        nobs: sliceRows,
        rowOffset,
        totalObservations: options.totalObservations,
        varList: options.varList
    });
    if (!data.meta.headers.includes(column)) return '';
    let widestValue = '';
    let widestScore = -1;
    for (let row = query.start; row < query.end; row += 1) {
        const local = row - rowOffset;
        if (local < 0 || local >= sliceRows) continue;
        if (query.filter && !query.filter(row - rowOffset)) continue;
        const value = displayValue(valueAt(data, column, local));
        const score = textWidthScore(value);
        if (score > widestScore) {
            widestValue = value;
            widestScore = score;
        }
    }
    return widestValue;
}

async function getColumnAutoFitValue(filePath, column, filterText = '') {
    const data = await load(filePath);
    return getColumnAutoFitValueFromData(data, column, filterText);
}

function invalidate(filePath) {
    const session = sessions.get(path.resolve(filePath));
    if (session) session.data = null;
}

function dispose(filePath) {
    if (!filePath) return;
    sessions.delete(path.resolve(filePath));
}

module.exports = {
    formatCellValue,
    MAX_CACHED_FILES,
    getSnapshot,
    getMore,
    getSnapshotFromData,
    getMoreFromData,
    getColumnAutoFitValue,
    getColumnAutoFitValueFromData,
    invalidate,
    dispose
};
