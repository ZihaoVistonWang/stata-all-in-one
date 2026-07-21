const path = require('path');
const native = require('../native/stata_session');
const { getActiveSession } = require('../session');
const { msg } = require('../../../../utils/common');

const UNIT_SEPARATOR = String.fromCharCode(31);
const loadedSessions = new WeakSet();

function pluginPath() {
    const fileName = process.platform === 'win32'
        ? 'stata_data_bridge-win32.plugin'
        : 'stata_data_bridge-darwin.plugin';
    return path.join(__dirname, '..', '..', '..', '..', '..', 'bin', fileName);
}

function quoteStataPath(value) {
    return String(value).replace(/"/g, '""').replace(/\\/g, '/');
}

async function readMetadata(session) {
    const result = await session.execute(
        `mata: printf("__SAIO_NOBS__%f\\n", st_nobs()); for(i=1;i<=st_nvar();i++) printf("%s%s%s%s%s%s%s\\n", st_varname(i), char(31), st_vartype(i), char(31), st_varformat(i), char(31), st_varlabel(i))`,
        false
    );
    if (!result.success) throw new Error(msg('dataViewerDirectReadFailed'));
    const rows = String(result.output || '').split(/\r?\n/).filter((line) => line.includes(UNIT_SEPARATOR));
    const headers = [];
    const types = [];
    const formats = [];
    const labels = [];
    for (const row of rows) {
        const parts = row.split(UNIT_SEPARATOR);
        if (parts.length < 4) continue;
        headers.push(parts[0].trim());
        types.push(parts[1].trim());
        formats.push(parts[2].trim() || '.');
        labels.push(parts.slice(3).join(UNIT_SEPARATOR).trim());
    }
    const nobsMatch = String(result.output || '').match(/__SAIO_NOBS__([0-9]+(?:\.[0-9]+)?)/);
    const nobs = Number(nobsMatch ? nobsMatch[1] : 0);
    return { headers, types, formats, labels, nobs };
}

function allocColumn(type, nobs) {
    if (type === 'byte') return new Int8Array(nobs);
    if (type === 'int') return new Int16Array(nobs);
    if (type === 'long') return new Int32Array(nobs);
    if (type === 'float') return new Float32Array(nobs);
    if (type === 'double') return new Float64Array(nobs);
    return new Array(nobs);
}

function readU32(buffer, state) {
    const value = buffer.readUInt32LE(state.offset);
    state.offset += 4;
    return value;
}

function readF64(buffer, state) {
    const value = buffer.readDoubleLE(state.offset);
    state.offset += 8;
    return value;
}

function parseCapture(buffer, metadata) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 20 || buffer.subarray(0, 8).toString('ascii') !== 'SAIODV1\0') {
        throw new Error(msg('dataViewerInvalidBuffer'));
    }
    const state = { offset: 8 };
    const nobs = Number(buffer.readBigUInt64LE(state.offset));
    state.offset += 8;
    const nvars = readU32(buffer, state);
    if (nvars !== metadata.headers.length) throw new Error(msg('dataViewerMetadataMismatch'));

    const columns = {};
    const missing = {};
    for (let vi = 0; vi < nvars; vi += 1) {
        const kind = buffer[state.offset++];
        const type = metadata.types[vi] || '';
        const column = kind === 0 ? allocColumn(type, nobs) : new Array(nobs);
        const mask = new Uint8Array(nobs);
        for (let row = 0; row < nobs; row += 1) {
            if (kind === 0) {
                const isMissing = buffer[state.offset++];
                const value = readF64(buffer, state);
                if (isMissing) mask[row] = 1;
                else column[row] = value;
            } else {
                const length = readU32(buffer, state);
                column[row] = buffer.subarray(state.offset, state.offset + length).toString('utf8');
                state.offset += length;
            }
        }
        columns[metadata.headers[vi]] = column;
        missing[metadata.headers[vi]] = mask;
    }
    return {
        meta: {
            headers: metadata.headers,
            types: metadata.types,
            formats: metadata.formats,
            labels: metadata.labels,
            nobs
        },
        columns,
        missing
    };
}

async function capture() {
    const session = getActiveSession();
    if (!session) throw new Error(msg('dataViewerDirectReadFailed'));
    const metadata = await readMetadata(session);
    if (!metadata.headers.length || !metadata.nobs) {
        return { meta: { ...metadata, nobs: metadata.nobs || 0 }, columns: {}, missing: {} };
    }
    const pointer = native.beginDatasetCapture();
    try {
        if (!loadedSessions.has(session)) {
            await session.execute('capture program drop __saio_data_bridge', false);
            const loadResult = await session.execute(
                `program __saio_data_bridge, plugin using("${quoteStataPath(pluginPath())}")`,
                false
            );
            if (!loadResult.success) throw new Error(msg('dataViewerPluginLoadFailed'));
            loadedSessions.add(session);
        }
        const result = await session.execute(`plugin call __saio_data_bridge _all, ${pointer}`, false);
        if (!result.success) throw new Error(msg('dataViewerDirectReadFailed'));
        return parseCapture(native.finishDatasetCapture(), metadata);
    } catch (error) {
        native.cancelDatasetCapture();
        throw error;
    }
}

module.exports = { capture, pluginPath, parseCapture };
