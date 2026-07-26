const DEFAULT_HISTORY_PAGE_SIZE = 600;
const DEFAULT_HISTORY_WINDOW_SIZE = 2400;
const INITIAL_HISTORY_WINDOW_SIZE = 1200;

function normalizeNonNegativeInteger(value, fallback = 0) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
        return fallback;
    }
    return Math.max(0, Math.floor(normalized));
}

function createHistoryPage(history, requestedStart, requestedLimit = DEFAULT_HISTORY_PAGE_SIZE) {
    const entries = Array.isArray(history) ? history : [];
    const start = Math.min(
        normalizeNonNegativeInteger(requestedStart),
        entries.length
    );
    const limit = Math.max(
        1,
        normalizeNonNegativeInteger(requestedLimit, DEFAULT_HISTORY_PAGE_SIZE)
    );
    const end = Math.min(entries.length, start + limit);
    return {
        start,
        end,
        total: entries.length,
        entries: entries.slice(start, end)
    };
}

function createTailHistoryPage(history, requestedLimit = INITIAL_HISTORY_WINDOW_SIZE) {
    const entries = Array.isArray(history) ? history : [];
    const limit = Math.max(
        1,
        normalizeNonNegativeInteger(requestedLimit, INITIAL_HISTORY_WINDOW_SIZE)
    );
    return createHistoryPage(entries, Math.max(0, entries.length - limit), limit);
}

function calculateWindowReplacement(
    windowStart,
    windowLength,
    replacementStart,
    replacementDeleteCount,
    replacementEntries
) {
    const normalize = value => {
        const normalized = Number(value);
        return Number.isFinite(normalized) ? Math.max(0, Math.floor(normalized)) : 0;
    };
    const normalizedWindowStart = normalize(windowStart);
    const normalizedWindowLength = normalize(windowLength);
    const normalizedReplacementStart = normalize(replacementStart);
    const normalizedDeleteCount = normalize(replacementDeleteCount);
    const entries = Array.isArray(replacementEntries) ? replacementEntries : [];
    const overlapStart = Math.max(normalizedWindowStart, normalizedReplacementStart);
    const overlapEnd = Math.min(
        normalizedWindowStart + normalizedWindowLength,
        normalizedReplacementStart + normalizedDeleteCount
    );

    if (overlapEnd <= overlapStart) {
        return null;
    }

    const replacementOffset = overlapStart - normalizedReplacementStart;
    const overlapLength = overlapEnd - overlapStart;
    return {
        localStart: overlapStart - normalizedWindowStart,
        deleteCount: overlapLength,
        entries: entries.slice(replacementOffset, replacementOffset + overlapLength)
    };
}

module.exports = {
    DEFAULT_HISTORY_PAGE_SIZE,
    DEFAULT_HISTORY_WINDOW_SIZE,
    INITIAL_HISTORY_WINDOW_SIZE,
    calculateWindowReplacement,
    createHistoryPage,
    createTailHistoryPage
};
