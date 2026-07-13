const EDITION_ORDER = Object.freeze({ mp: 0, se: 1, be: 2, ic: 3 });

function normalizeEdition(value) {
    const edition = String(value || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(EDITION_ORDER, edition) ? edition : null;
}

function parseNumericVersion(...values) {
    for (const value of values) {
        const text = String(value || '');
        const stataMatch = text.match(/Stata(?:Now)?\s*(\d{1,2})/i);
        if (stataMatch) return Number(stataMatch[1]);
    }
    for (const value of values) {
        const genericMatch = String(value || '').match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
        if (genericMatch) return Number(genericMatch[1]);
    }
    return null;
}

function sortStataCandidates(candidates) {
    return [...candidates].sort((left, right) => {
        const versionDifference = (right.version || 0) - (left.version || 0);
        if (versionDifference) return versionDifference;
        const leftOrder = EDITION_ORDER[normalizeEdition(left.edition)] ?? 99;
        const rightOrder = EDITION_ORDER[normalizeEdition(right.edition)] ?? 99;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        const leftPath = String(left.executablePath || left.appPath || '');
        const rightPath = String(right.executablePath || right.appPath || '');
        return leftPath.localeCompare(rightPath);
    });
}

module.exports = {
    EDITION_ORDER,
    normalizeEdition,
    parseNumericVersion,
    sortStataCandidates
};
