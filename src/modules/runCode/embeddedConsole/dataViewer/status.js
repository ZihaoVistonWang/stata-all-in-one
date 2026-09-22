/**
 * Data Viewer read-status taxonomy.
 *
 * These states must never be collapsed into one message. "The read failed",
 * "the Stata session is gone", "no dataset is loaded", "the dataset has zero
 * observations" and "the filter matched nothing" require different user action,
 * and conflating them is what made a failed plugin read look like an empty
 * dataset.
 */
const VIEWER_STATUS = Object.freeze({
    /** Data was read successfully and there is at least one row to show. */
    OK: 'ok',
    /** Stata has no dataset in memory (or no variables at all). */
    NO_DATASET: 'no-dataset',
    /** A dataset with variables exists but contains zero observations. */
    ZERO_OBSERVATIONS: 'zero-observations',
    /** The dataset is non-empty, but the current filter matched nothing. */
    NO_MATCHES: 'no-matches',
    /** Reading the data failed (plugin failure, invalid buffer, ...). */
    READ_FAILED: 'read-failed',
    /** No live Stata session is available to read from. */
    SESSION_UNAVAILABLE: 'session-unavailable',
    /** The requested file could not be read from disk. */
    FILE_UNAVAILABLE: 'file-unavailable',
    /** The refresh failed; the shown data is the previous, now stale, view. */
    STALE: 'stale'
});

/** Statuses that mean the shown data cannot be trusted as current. */
const STALE_LIKE_STATUSES = new Set([
    VIEWER_STATUS.READ_FAILED,
    VIEWER_STATUS.SESSION_UNAVAILABLE,
    VIEWER_STATUS.FILE_UNAVAILABLE,
    VIEWER_STATUS.STALE
]);

/** Statuses for which a previously rendered view should be kept on screen. */
function keepsPreviousView(status) {
    return STALE_LIKE_STATUSES.has(status);
}

/**
 * Classify a snapshot produced by the Data Viewer data source.
 *
 * @param {{meta?: {headers?: string[], nobs?: number}, info?: {observations?: number, totalObservations?: number}}} data
 * @param {{filterText?: string, hasFilter?: boolean}} [context]
 * @returns {string} one of VIEWER_STATUS
 */
function classifySnapshot(data, context = {}) {
    if (!data) {
        return VIEWER_STATUS.READ_FAILED;
    }
    const meta = data.meta || {};
    const headers = Array.isArray(meta.headers) ? meta.headers : [];
    if (!headers.length) {
        return VIEWER_STATUS.NO_DATASET;
    }
    const datasetObservations = Number(
        meta.nobs !== undefined ? meta.nobs : (data.info && data.info.totalObservations) || 0
    );
    if (!Number.isFinite(datasetObservations) || datasetObservations <= 0) {
        return VIEWER_STATUS.ZERO_OBSERVATIONS;
    }
    const shown = Number((data.info && data.info.observations) || 0);
    const filtered = Boolean(context.hasFilter)
        || Boolean(String(context.filterText || data.filterText || '').trim());
    if (shown <= 0 && filtered) {
        return VIEWER_STATUS.NO_MATCHES;
    }
    if (shown <= 0) {
        return VIEWER_STATUS.NO_MATCHES;
    }
    return VIEWER_STATUS.OK;
}

/**
 * Normalise an arbitrary thrown error into a viewer status.
 */
function classifyError(error) {
    if (!error) {
        return VIEWER_STATUS.READ_FAILED;
    }
    if (error.sessionUnavailable || error.sessionLost) {
        return VIEWER_STATUS.SESSION_UNAVAILABLE;
    }
    if (error.fileUnavailable) {
        return VIEWER_STATUS.FILE_UNAVAILABLE;
    }
    const code = String(error.code || '');
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EISDIR' || code === 'ENOTDIR') {
        return VIEWER_STATUS.FILE_UNAVAILABLE;
    }
    return VIEWER_STATUS.READ_FAILED;
}

module.exports = {
    VIEWER_STATUS,
    STALE_LIKE_STATUSES,
    keepsPreviousView,
    classifySnapshot,
    classifyError
};
