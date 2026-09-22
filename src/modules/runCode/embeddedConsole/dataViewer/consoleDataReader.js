const path = require('path');
const native = require('../native/stata_process');
const { msg } = require('../../../../utils/common');

const UNIT_SEPARATOR = String.fromCharCode(31);
const META_BEGIN = '__SAIO_META_BEGIN__';
const META_END = '__SAIO_META_END__';
const PLUGIN_PROGRAM = '__saio_data_bridge';
const PLUGIN_PROBE_VAR = '__saio_plugin_probe';
const CAPTURE_MAGIC = 'SAIODV1\0';
const MIN_CAPTURE_BYTES = 20;
const MAX_STRING_BYTES = 2 * 1024 * 1024;

/**
 * Byte budget for one native capture. The plugin fails with a controlled error
 * when a capture would exceed it, so an oversized read cannot exhaust the Stata
 * worker's address space (and take the session down with it).
 */
const DEFAULT_CAPTURE_BUDGET_BYTES = 256 * 1024 * 1024;

let captureBudgetBytes = DEFAULT_CAPTURE_BUDGET_BYTES;

/** Lower (or restore) the capture byte budget. Used by the budget tests. */
function setCaptureBudget(bytes) {
    const value = Number(bytes);
    captureBudgetBytes = Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : DEFAULT_CAPTURE_BUDGET_BYTES;
    return captureBudgetBytes;
}

function getCaptureBudget() {
    return captureBudgetBytes;
}

/**
 * Rows read per window. The viewer only displays one window at a time, so there
 * is no reason to transfer the whole dataset.
 */
const DEFAULT_WINDOW_ROWS = 2000;
const NUMERIC_STORAGE_TYPES = new Set(['byte', 'int', 'long', 'float', 'double']);

function pluginPath() {
    const fileName = process.platform === 'win32'
        ? 'stata_data_bridge-win32.plugin'
        : 'stata_data_bridge-darwin.plugin';
    return path.join(__dirname, '..', '..', '..', '..', '..', 'bin', fileName);
}

function quoteStataPath(value) {
    return String(value).replace(/"/g, '""').replace(/\\/g, '/');
}

/**
 * Parse the Mata metadata frame emitted by readMetadata().
 * Throws when the frame is missing or structurally damaged, instead of
 * pretending the dataset has zero variables and zero observations.
 */
function parseMetadataOutput(output) {
    const text = String(output || '');
    const reassembledText = text.replace(/\r?\n\s*>\s?/g, '');
    const headers = [];
    const types = [];
    const formats = [];
    const labels = [];
    const framedRows = [];
    const framedPattern = new RegExp(`${META_BEGIN}([\\s\\S]*?)${META_END}`, 'g');
    let match;
    while ((match = framedPattern.exec(reassembledText)) !== null) {
        framedRows.push(match[1]);
    }
    const rows = framedRows.length
        ? framedRows
        : text.split(/\r?\n/).filter((line) => line.includes(UNIT_SEPARATOR));
    for (const row of rows) {
        const parts = row.split(UNIT_SEPARATOR);
        if (parts.length < 4) continue;
        headers.push(parts[0].trim());
        types.push(parts[1].trim());
        formats.push(parts[2].trim() || '.');
        labels.push(parts.slice(3).join(UNIT_SEPARATOR).trim());
    }

    const nobsMatch = reassembledText.match(/__SAIO_NOBS__([0-9]+(?:\.[0-9]+)?)/);
    if (!nobsMatch) {
        // Stata always answers with a nobs frame. A missing frame means the
        // response was truncated or is not ours — never "zero variables".
        throw new Error(msg('dataViewerMetadataMissing'));
    }
    const nobs = Number(nobsMatch[1]);
    if (!Number.isFinite(nobs) || nobs < 0) {
        throw new Error(msg('dataViewerMetadataMissing'));
    }
    const nvarMatch = reassembledText.match(/__SAIO_NVAR__([0-9]+)/);
    const reportedNvar = nvarMatch ? Number(nvarMatch[1]) : null;
    if (reportedNvar !== null && reportedNvar !== headers.length) {
        throw new Error(msg('dataViewerMetadataMismatch'));
    }
    return { headers, types, formats, labels, nobs };
}

async function readMetadata(session) {
    const result = await session.execute(
        `mata: printf("__SAIO_NOBS__%f\\n", st_nobs()); printf("__SAIO_NVAR__%f\\n", st_nvar()); for(i=1;i<=st_nvar();i++) printf("${META_BEGIN}%s%s%s%s%s%s%s${META_END}\\n", st_varname(i), char(31), st_vartype(i), char(31), st_varformat(i), char(31), st_varlabel(i))`,
        false,
        null,
        { internal: true }
    );
    if (!result.success) {
        throw readError(msg('dataViewerDirectReadFailed'), result);
    }
    return parseMetadataOutput(result.output);
}

function readError(message, result) {
    const error = new Error(message);
    if (result) {
        error.returnCode = result.returnCode;
        error.sessionLost = Boolean(result.sessionLost);
        error.detail = result.error || '';
    }
    return error;
}

function allocColumn(type, nobs) {
    if (type === 'byte') return new Int8Array(nobs);
    if (type === 'int') return new Int16Array(nobs);
    if (type === 'long') return new Int32Array(nobs);
    if (type === 'float') return new Float32Array(nobs);
    if (type === 'double') return new Float64Array(nobs);
    return new Array(nobs);
}

/**
 * Shared little-endian reader that fails loudly when the capture buffer is
 * shorter than the payload it claims to contain.
 */
function createReader(buffer) {
    const state = { offset: 0 };
    const require = (bytes, what) => {
        if (state.offset + bytes > buffer.length) {
            throw new Error(msg('dataViewerTruncatedBuffer', { what }));
        }
    };
    return {
        state,
        u8(what = 'byte') {
            require(1, what);
            return buffer[state.offset++];
        },
        u32(what = 'uint32') {
            require(4, what);
            const value = buffer.readUInt32LE(state.offset);
            state.offset += 4;
            return value;
        },
        u64(what = 'uint64') {
            require(8, what);
            const value = Number(buffer.readBigUInt64LE(state.offset));
            state.offset += 8;
            return value;
        },
        f64(what = 'double') {
            require(8, what);
            const value = buffer.readDoubleLE(state.offset);
            state.offset += 8;
            return value;
        },
        bytes(length, what = 'bytes') {
            require(length, what);
            const slice = buffer.subarray(state.offset, state.offset + length);
            state.offset += length;
            return slice;
        },
        get remaining() {
            return buffer.length - state.offset;
        }
    };
}

function parseCapture(buffer, metadata) {
    if (!Buffer.isBuffer(buffer) || buffer.length < MIN_CAPTURE_BYTES
        || buffer.subarray(0, 8).toString('ascii') !== CAPTURE_MAGIC) {
        throw new Error(msg('dataViewerInvalidBuffer'));
    }
    const reader = createReader(buffer);
    reader.bytes(8, 'header');
    const nobs = reader.u64('observation count');
    const nvars = reader.u32('variable count');
    if (!Number.isSafeInteger(nobs) || nobs < 0) {
        throw new Error(msg('dataViewerInvalidBuffer'));
    }
    if (nvars !== metadata.headers.length) {
        throw new Error(msg('dataViewerMetadataMismatch'));
    }
    if (nvars === 0) {
        if (reader.remaining !== 0) {
            throw new Error(msg('dataViewerInvalidBuffer'));
        }
        return {
            meta: {
                headers: metadata.headers,
                types: metadata.types,
                formats: metadata.formats,
                labels: metadata.labels,
                nobs
            },
            columns: {},
            missing: {}
        };
    }

    const columns = {};
    const missing = {};
    for (let vi = 0; vi < nvars; vi += 1) {
        const kind = reader.u8('variable kind');
        if (kind !== 0 && kind !== 1) {
            throw new Error(msg('dataViewerInvalidBuffer'));
        }
        const type = metadata.types[vi] || '';
        if (kind === 0 && !NUMERIC_STORAGE_TYPES.has(type)) {
            throw new Error(msg('dataViewerMetadataMismatch'));
        }
        const column = kind === 0 ? allocColumn(type, nobs) : new Array(nobs);
        const mask = new Uint8Array(nobs);
        for (let row = 0; row < nobs; row += 1) {
            if (kind === 0) {
                const isMissing = reader.u8('missing flag');
                if (isMissing > 1) {
                    throw new Error(msg('dataViewerInvalidBuffer'));
                }
                const value = reader.f64('numeric value');
                if (isMissing) mask[row] = 1;
                else column[row] = value;
            } else {
                const length = reader.u32('string length');
                if (length > MAX_STRING_BYTES) {
                    throw new Error(msg('dataViewerInvalidBuffer'));
                }
                column[row] = reader.bytes(length, 'string value').toString('utf8');
            }
        }
        columns[metadata.headers[vi]] = column;
        missing[metadata.headers[vi]] = mask;
    }
    if (reader.remaining !== 0) {
        throw new Error(msg('dataViewerInvalidBuffer'));
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

/**
 * Verify that the plugin program is actually defined in the LIVE Stata session.
 *
 * A JS-side "we registered it earlier" cache is not trustworthy: `clear all`,
 * `program drop _all`, a do-file, or a program body can remove the program
 * without the extension noticing. Scanning user code for `clear all` cannot
 * work either, because the cleanup may happen anywhere.
 */
async function isPluginRegistered(session) {
    const result = await session.execute(
        `capture program list ${PLUGIN_PROGRAM}\n`
        + `display "${PLUGIN_PROBE_VAR}=" _rc`,
        false,
        null,
        { internal: true }
    );
    if (!result.success) {
        // `capture` makes a missing program non-fatal; a failure here means the
        // session itself is in trouble.
        return { present: false, sessionError: result };
    }
    const match = String(result.output || '').match(new RegExp(`${PLUGIN_PROBE_VAR}=(-?\\d+)`));
    if (!match) {
        return { present: false, sessionError: null };
    }
    return { present: Number(match[1]) === 0, sessionError: null };
}

async function ensurePluginRegistered(session) {
    const probe = await isPluginRegistered(session);
    if (probe.sessionError) {
        throw readError(msg('dataViewerDirectReadFailed'), probe.sessionError);
    }
    if (probe.present) {
        return;
    }

    const dropResult = await session.execute(
        `capture program drop ${PLUGIN_PROGRAM}`,
        false,
        null,
        { internal: true }
    );
    if (!dropResult.success) {
        throw readError(msg('dataViewerDirectReadFailed'), dropResult);
    }
    const loadResult = await session.execute(
        `program ${PLUGIN_PROGRAM}, plugin using("${quoteStataPath(pluginPath())}")`,
        false,
        null,
        { internal: true }
    );
    if (!loadResult.success) {
        throw readError(msg('dataViewerPluginLoadFailed'), loadResult);
    }
    // Registration is only accepted once the entry is verifiably defined.
    const verify = await isPluginRegistered(session);
    if (verify.sessionError) {
        throw readError(msg('dataViewerDirectReadFailed'), verify.sessionError);
    }
    if (!verify.present) {
        throw readError(msg('dataViewerPluginLoadFailed'), loadResult);
    }
}

/**
 * Read the whole current dataset out of Stata memory.
 *
 * Everything from the metadata read to the plugin call runs inside one session
 * transaction, so no user command can slip in between and change the dataset
 * (or switch frame) while the capture is being assembled.
 */
/**
 * Estimate how many bytes a capture of `rows` observations over the given
 * variables will need. Numeric cells cost 9 bytes; strings cost their declared
 * storage plus a 4-byte length.
 */
function estimateCaptureBytes(metadata, rows) {
    let perRow = 0;
    for (let index = 0; index < metadata.headers.length; index += 1) {
        const type = metadata.types[index] || '';
        const match = /^str(\d+)$/i.exec(type);
        perRow += match ? 4 + Number(match[1]) : 9;
    }
    return perRow * rows;
}

/**
 * Read the dataset out of Stata memory.
 *
 * @param {object} [session]        explicit session (defaults to the active one)
 * @param {object} [options]
 * @param {number} [options.startObs] 1-based first observation of the window
 * @param {number} [options.endObs]   1-based last observation of the window
 * @param {AbortSignal} [options.signal] cancel the read
 */
async function capture(session, options = {}) {
    const activeSession = session || require('../session').getActiveSession();
    if (!activeSession) {
        const error = new Error(msg('dataViewerSessionUnavailable'));
        error.sessionUnavailable = true;
        throw error;
    }
    const signal = options.signal || null;
    const throwIfAborted = () => {
        if (signal && signal.aborted) {
            const error = new Error(msg('dataViewerReadCancelled'));
            error.cancelled = true;
            throw error;
        }
    };

    return activeSession.withTransaction(async (txSession) => {
        throwIfAborted();
        const metadata = await readMetadata(txSession);
        if (!metadata.headers.length || !metadata.nobs) {
            return {
                meta: { ...metadata, nobs: metadata.nobs || 0 },
                columns: {},
                missing: {}
            };
        }
        if (!native.isInitialized()) {
            const error = new Error(msg('dataViewerSessionUnavailable'));
            error.sessionUnavailable = true;
            throw error;
        }

        // Pick the window to read. Without an explicit request, read from the
        // start and let the caller page in further windows.
        const total = metadata.nobs;
        const requestedStart = Number(options.startObs);
        const requestedEnd = Number(options.endObs);
        const start = Number.isFinite(requestedStart) && requestedStart >= 1
            ? Math.floor(requestedStart)
            : 1;
        const maxWindow = Number.isFinite(requestedEnd) && requestedEnd >= start
            ? Math.floor(requestedEnd)
            : start + DEFAULT_WINDOW_ROWS - 1;
        const end = Math.max(start, Math.min(total, maxWindow));

        // Check the budget for the requested window AND for the window the
        // caller would get by default, so an oversized dataset fails with a
        // clear message instead of a plugin error.
        const requestedRows = Number.isFinite(requestedEnd) && requestedEnd >= start
            ? Math.min(total, Math.floor(requestedEnd)) - start + 1
            : Math.min(total - start + 1, DEFAULT_WINDOW_ROWS);
        const estimate = estimateCaptureBytes(metadata, end - start + 1);
        const requestedEstimate = estimateCaptureBytes(metadata, requestedRows);
        if (estimate > captureBudgetBytes || requestedEstimate > captureBudgetBytes) {
            const error = new Error(msg('dataViewerCaptureTooLarge', {
                rows: Math.max(requestedRows, end - start + 1),
                megabytes: Math.round(captureBudgetBytes / (1024 * 1024))
            }));
            error.tooLarge = true;
            error.rows = Math.max(requestedRows, end - start + 1);
            error.budgetBytes = captureBudgetBytes;
            throw error;
        }

        throwIfAborted();
        // "<generation>:<callback address>" — the generation is passed back to
        // finish/cancel so an overlapping capture cannot wipe or steal ours.
        const token = await native.beginDatasetCapture();
        const pointer = String(token).split(':').pop();
        try {
            // Re-verify inside the transaction: clear all / program drop _all in
            // user code silently removes the entry point.
            await ensurePluginRegistered(txSession);
            throwIfAborted();
            const result = await txSession.execute(
                `plugin call ${PLUGIN_PROGRAM} _all in ${start}/${end}, ${pointer} ${captureBudgetBytes}`,
                false,
                null,
                { internal: true }
            );
            if (!result.success) {
                throw readError(msg('dataViewerDirectReadFailed'), result);
            }
            const buffer = await native.finishDatasetCapture(token);
            const data = parseCapture(buffer, metadata);
            // The capture holds a window, not the whole dataset; the caller needs
            // to know which observations it received.
            data.meta.windowStart = start;
            data.meta.windowEnd = end;
            data.meta.totalObservations = total;
            return data;
        } catch (error) {
            await native.cancelDatasetCapture(token);
            throw error;
        }
    });
}

module.exports = {
    capture,
    estimateCaptureBytes,
    setCaptureBudget,
    getCaptureBudget,
    DEFAULT_WINDOW_ROWS,
    DEFAULT_CAPTURE_BUDGET_BYTES,
    pluginPath,
    parseCapture,
    parseMetadataOutput,
    isPluginRegistered,
    PLUGIN_PROGRAM
};
