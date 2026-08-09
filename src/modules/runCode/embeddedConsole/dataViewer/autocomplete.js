const {
    COMPLETION_TYPES,
    MAX_COMPLETION_CANDIDATES,
    selectCompletionCandidates
} = require('../../../completionContext');

const FILTER_KEYWORDS = Object.freeze(['if', 'in', 'nolabel']);

function mergeVariableLists(...lists) {
    const result = [];
    const seen = new Set();
    for (const list of lists) {
        for (const rawValue of Array.isArray(list) ? list : []) {
            const value = String(rawValue || '').trim();
            const key = value.toLowerCase();
            if (!value || seen.has(key)) continue;
            seen.add(key);
            result.push(value);
        }
    }
    return result;
}

function selectDataViewerCandidates(prefix, variables, limit = MAX_COMPLETION_CANDIDATES) {
    return selectCompletionCandidates({
        type: COMPLETION_TYPES.all,
        prefix: String(prefix || '')
    }, {
        variables: mergeVariableLists(variables),
        commands: FILTER_KEYWORDS,
        functions: [],
        options: []
    }, limit);
}

module.exports = {
    FILTER_KEYWORDS,
    mergeVariableLists,
    selectDataViewerCandidates
};
