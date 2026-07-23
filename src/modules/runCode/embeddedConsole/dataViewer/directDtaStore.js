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

function buildQuery(data, filterText) {
    const spec = splitFilterSpec(filterText);
    const expression = String(spec.ifClause || '').trim();
    let filter = null;
    if (expression) {
        try {
            filter = compileFilter(expression, data).fn;
        } catch (error) {
            throw new Error(msg('dataViewerUnsupportedFilter', { expression }));
        }
    }
    let start = 0;
    let end = data.meta.nobs;
    if (spec.inClause) {
        const range = spec.inClause.match(/^\s*(\d+)\s*(?:\/\s*(\d+)\s*)?$/);
        if (!range) throw new Error(msg('dataViewerUnsupportedFilter', { expression: `in ${spec.inClause}` }));
        start = Math.max(0, Number(range[1]) - 1);
        end = Math.min(data.meta.nobs, Number(range[2] || range[1]));
    }
    let columns = data.meta.headers;
    if (spec.varList) {
        columns = [];
        for (const token of spec.varList.split(/\s+/).filter(Boolean)) {
            const pattern = new RegExp(`^${token.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
            for (const name of data.meta.headers) {
                if (pattern.test(name) && !columns.includes(name)) columns.push(name);
            }
        }
        if (!columns.length) {
            throw new Error(msg('dataViewerUnsupportedFilter', { expression: spec.varList }));
        }
    }
    return { filter, start, end, columns, spec };
}

async function getSnapshot(filePath, rowLimit = 500, filterText = '', force = false) {
    const data = await load(filePath, force);
    return getSnapshotFromData(data, filePath, rowLimit, filterText);
}

function getSnapshotFromData(data, source, rowLimit = 500, filterText = '') {
    const query = buildQuery(data, filterText);
    const headers = query.columns;
    const filter = query.filter;
    const rows = [];
    const max = Math.min(Number(rowLimit) || 500, data.meta.nobs);
    let matched = 0;
    for (let row = query.start; row < query.end; row += 1) {
        if (filter && !filter(row)) continue;
        matched += 1;
        if (rows.length >= max) continue;
        rows.push({ rowNum: row + 1, values: headers.map((name) => valueAt(data, name, row)) });
    }
    return {
        info: { observations: matched, variables: headers.length, source, sortedBy: null },
        vars: headers.map((name, index) => ({
            name,
            type: data.meta.types[data.meta.headers.indexOf(name)] || '',
            format: (data.meta.formats && data.meta.formats[data.meta.headers.indexOf(name)]) || '.',
            label: data.meta.labels[data.meta.headers.indexOf(name)] || null,
            valueLabel: null
        })),
        dataColumns: headers,
        allVarNames: headers,
        dataRows: rows,
        hasMore: rows.length < matched,
        filterText: String(filterText || '')
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
