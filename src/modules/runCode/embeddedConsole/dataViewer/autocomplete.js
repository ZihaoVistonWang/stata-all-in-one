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
            const value = String(rawValue && typeof rawValue === 'object'
                ? (rawValue.name || rawValue.variableName || '')
                : rawValue || '').trim();
            const key = value.toLowerCase();
            if (!value || seen.has(key)) continue;
            seen.add(key);
            result.push(value);
        }
    }
    return result;
}

function mergeVariableCandidates(...lists) {
    const result = [];
    const indexes = new Map();
    for (const list of lists) {
        for (const rawValue of Array.isArray(list) ? list : []) {
            const name = String(rawValue && typeof rawValue === 'object'
                ? (rawValue.name || rawValue.variableName || '')
                : rawValue || '').trim();
            if (!name) continue;
            const variableLabel = String(rawValue && typeof rawValue === 'object'
                ? (rawValue.variableLabel ?? rawValue.label ?? '')
                : '').trim();
            const key = name.toLowerCase();
            if (!indexes.has(key)) {
                indexes.set(key, result.length);
                result.push({ name, variableLabel });
            } else if (variableLabel && !result[indexes.get(key)].variableLabel) {
                result[indexes.get(key)].variableLabel = variableLabel;
            }
        }
    }
    return result;
}

function selectDataViewerCandidates(prefix, variables, limit = MAX_COMPLETION_CANDIDATES) {
    return selectCompletionCandidates({
        type: COMPLETION_TYPES.all,
        prefix: String(prefix || '')
    }, {
        variables: mergeVariableCandidates(variables),
        commands: FILTER_KEYWORDS,
        functions: [],
        options: []
    }, limit);
}

function selectVariableTableCandidates(prefix, variables, limit = MAX_COMPLETION_CANDIDATES) {
    return selectCompletionCandidates({
        type: COMPLETION_TYPES.variable,
        prefix: String(prefix || '')
    }, {
        variables: mergeVariableCandidates(variables),
        commands: [],
        functions: [],
        options: []
    }, limit);
}

function expandVariableTableVarlist(varList, variables) {
    const names = mergeVariableLists(variables);
    const expression = String(varList || '').trim();
    if (!expression) return names;

    const byLowerName = new Map(names.map((name, index) => [name.toLowerCase(), { name, index }]));
    const result = [];
    const seen = new Set();
    const append = (name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(name);
    };

    for (const token of expression.split(/\s+/).filter(Boolean)) {
        const lowerToken = token.toLowerCase();
        let tokenMatches = [];
        if (lowerToken === '_all') {
            tokenMatches = names;
        } else if (token.match(/^(.+)-(.+)$/u)) {
            const range = token.match(/^(.+)-(.+)$/u);
            const first = byLowerName.get(range[1].toLowerCase());
            const last = byLowerName.get(range[2].toLowerCase());
            if (first && last && first.index <= last.index) {
                tokenMatches = names.slice(first.index, last.index + 1);
            }
        } else if (/[*?]/.test(token)) {
            const pattern = new RegExp(`^${token
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.')}$`, 'iu');
            tokenMatches = names.filter(name => pattern.test(name));
        } else {
            const exact = byLowerName.get(lowerToken);
            if (exact) tokenMatches = [exact.name];
        }
        if (!tokenMatches.length) return [];
        tokenMatches.forEach(append);
    }
    return result;
}

module.exports = {
    FILTER_KEYWORDS,
    mergeVariableLists,
    mergeVariableCandidates,
    selectDataViewerCandidates,
    selectVariableTableCandidates,
    expandVariableTableVarlist
};
