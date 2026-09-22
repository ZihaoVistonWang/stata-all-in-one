const fs = require('fs/promises');
const path = require('path');
const { DtaParser } = require('./dtaParser');
const { compileFilter } = require('./dtaFilterCompiler');
const { splitFilterSpec } = require('./provider');
const { msg } = require('../../../../utils/common');

// Based on the MIT-licensed parser architecture in stata-preview. This module
// intentionally exposes only the existing viewer's metadata/rows/filter API.
const sessions = new Map();

function valueAt(data, name, row) {
    if (data.missing[name] && data.missing[name][row]) return null;
    const value = data.columns[name][row];
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value * 1e6) / 1e6
        : value;
}

function displayValue(value) {
    if (value === null || value === undefined) return '.';
    const text = String(value);
    return text.trim() === '' || /^nan$/i.test(text.trim()) ? '.' : text;
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

function sessionFor(filePath) {
    const key = path.resolve(filePath);
    let session = sessions.get(key);
    if (!session) {
        session = { key, loading: null, stat: null, data: null };
        sessions.set(key, session);
    }
    return session;
}

async function load(filePath, force = false) {
    const session = sessionFor(filePath);
    const stat = await fs.stat(session.key);
    if (!force && session.data && session.stat
        && session.stat.size === stat.size && session.stat.mtimeMs === stat.mtimeMs) {
        return session.data;
    }
    if (session.loading) return session.loading;
    session.loading = (async () => {
        const buffer = await fs.readFile(session.key);
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

function buildQuery(data, filterText) {
    const spec = splitFilterSpec(filterText);
    const expression = String(spec.ifClause || '').trim();
    let filter = null;
    if (expression) {
        try {
            filter = compileFilter(expression, data).fn;
        } catch (error) {
            // Never fall back to "no filter": an unsupported expression must fail
            // loudly instead of showing different rows than Stata would.
            throw new Error(msg('dataViewerUnsupportedFilter', { expression }));
        }
    }
    let start = 0;
    let end = data.meta.nobs;
    if (spec.inClause) {
        const range = parseInRange(spec.inClause, data.meta.nobs);
        if (range) {
            start = range.start;
            end = range.end;
        }
    }
    let columns = data.meta.headers;
    if (spec.varList) {
        columns = [];
        for (const token of spec.varList.split(/\s+/).filter(Boolean)) {
            for (const name of expandVarToken(token, data.meta.headers)) {
                if (!columns.includes(name)) columns.push(name);
            }
        }
        if (!columns.length) {
            throw new Error(msg('dataViewerUnsupportedFilter', { expression: spec.varList }));
        }
    }
    return { filter, start, end, columns, spec };
}

async function getSnapshot(filePath, rowLimit = 500, filterText = '', force = false, startObs = 0) {
    const data = await load(filePath, force);
    return getSnapshotFromData(data, filePath, rowLimit, filterText, startObs);
}

function collectWindow(data, query, startObs, rowLimit) {
    const rows = [];
    let matched = 0;
    for (let row = query.start; row < query.end; row += 1) {
        if (query.filter && !query.filter(row)) continue;
        if (matched >= startObs && rows.length < rowLimit) {
            rows.push({
                rowNum: row + 1,
                values: query.columns.map((name) => valueAt(data, name, row))
            });
        }
        matched += 1;
    }
    return { rows, matched };
}

function getSnapshotFromData(data, source, rowLimit = 500, filterText = '', startObs = 0) {
    const query = buildQuery(data, filterText);
    const headers = query.columns;
    const max = Math.min(Number(rowLimit) || 500, data.meta.nobs);
    let windowStart = Math.max(0, Math.floor(Number(startObs) || 0));
    let window = collectWindow(data, query, windowStart, max);
    if (window.matched > 0 && windowStart >= window.matched) {
        windowStart = Math.max(0, window.matched - max);
        window = collectWindow(data, query, windowStart, max);
    }
    return {
        // `observations` is the number of rows matched by the current filter;
        // `totalObservations` is the size of the dataset before filtering.
        // The viewer needs both to tell "the filter matched nothing" apart from
        // "the dataset is empty".
        info: {
            observations: window.matched,
            totalObservations: data.meta.nobs,
            variables: headers.length,
            source,
            sortedBy: null
        },
        // Keep the untouched dataset metadata so callers can classify the result
        // (no dataset / zero observations / no matches) without re-reading Stata.
        meta: {
            headers: data.meta.headers.slice(),
            nobs: data.meta.nobs
        },
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

function getMoreFromData(data, startObs, count, filterText = '') {
    const query = buildQuery(data, filterText);
    const headers = query.columns;
    const filter = query.filter;
    const rows = [];
    let matched = 0;
    for (let row = query.start; row < query.end && rows.length < count; row += 1) {
        if (filter && !filter(row)) continue;
        if (matched++ < startObs) continue;
        rows.push({ rowNum: row + 1, values: headers.map((name) => valueAt(data, name, row)) });
    }
    return rows;
}

function getColumnAutoFitValueFromData(data, column, filterText = '') {
    const query = buildQuery(data, filterText);
    if (!data.meta.headers.includes(column)) return '';
    let widestValue = '';
    let widestScore = -1;
    for (let row = query.start; row < query.end; row += 1) {
        if (query.filter && !query.filter(row)) continue;
        const value = displayValue(valueAt(data, column, row));
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
    getSnapshot,
    getMore,
    getSnapshotFromData,
    getMoreFromData,
    getColumnAutoFitValue,
    getColumnAutoFitValueFromData,
    invalidate,
    dispose
};
