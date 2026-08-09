const {
    STATA_IDENTIFIER_BODY,
    getTrailingStataIdentifier
} = require('./stataIdentifier');

let pinyinConverter;

function getPinyinConverter() {
    if (!pinyinConverter) {
        pinyinConverter = require('pinyin-pro').pinyin;
    }
    return pinyinConverter;
}

const COMPLETION_TYPES = Object.freeze({
    command: 'command',
    variable: 'variable',
    expression: 'expression',
    option: 'option',
    all: 'all',
    none: 'none'
});

const COMPLETION_MATCH_TYPES = Object.freeze({
    exact: 'exact',
    prefix: 'prefix',
    normalizedPrefix: 'normalized-prefix',
    fuzzy: 'fuzzy',
    pinyin: 'pinyin'
});

const MAX_COMPLETION_CANDIDATES = 100;
const MAX_SEARCH_TEXT_CACHE_SIZE = 20000;
const searchTextCache = new Map();
const pinyinSearchTextCache = new Map();

const CANDIDATE_KIND_PRIORITY = Object.freeze({
    var: 0,
    cmd: 1,
    fn: 2,
    opt: 3
});

const MATCH_TYPE_PRIORITY = Object.freeze({
    [COMPLETION_MATCH_TYPES.exact]: 0,
    [COMPLETION_MATCH_TYPES.prefix]: 1,
    [COMPLETION_MATCH_TYPES.normalizedPrefix]: 2,
    [COMPLETION_MATCH_TYPES.fuzzy]: 3,
    [COMPLETION_MATCH_TYPES.pinyin]: 4
});
const LABEL_MATCH_SCORE = 2500000;
const MAX_VARIABLE_LABEL_DISPLAY_LENGTH = 52;

const SIMPLE_COMMAND_PREFIXES = new Set([
    'capture', 'cap', 'quietly', 'qui', 'noisily', 'noi'
]);

const COLON_COMMAND_PREFIXES = new Set([
    'by', 'bysort', 'bootstrap', 'statsby', 'rolling', 'svy', 'stepwise'
]);

const VARIABLE_COMMANDS = new Set([
    'areg', 'browse', 'br', 'bro', 'codebook', 'correlate', 'corr', 'describe', 'desc',
    'des', 'drop', 'keep', 'list', 'lis', 'li', 'logit', 'nbreg', 'ologit', 'poisson', 'probit',
    'ppmlhdfe', 'pwcorr', 'reg', 'regress', 'reghdfe', 'ivreghdfe', 'ivreg2',
    'replace', 'scatter', 'sort', 'gsort', 'ttest',
    'su', 'sum', 'summ', 'summarize', 'ta', 'tab', 'tabu', 'tabulate',
    'tabstat', 'xtreg'
]);

// These option arguments are Stata varlists, not general expressions. Keep
// this deliberately small: unknown option calls fall back to all candidates.
const VARIABLE_OPTION_CALLS = new Set([
    'absorb', 'by', 'cluster', 'group', 'individual', 'over'
]);

const EXPRESSION_COMMANDS = new Set([
    'assert', 'di', 'display', 'if', 'while'
]);

const FILE_COMMANDS = new Set([
    'cd', 'chdir', 'do', 'doedit', 'erase', 'include', 'run',
    'save', 'saveold', 'use'
]);

function getCurrentLine(text, cursor) {
    const source = String(text || '');
    const safeCursor = Math.max(0, Math.min(Number.isFinite(cursor) ? cursor : source.length, source.length));
    const lineStart = source.lastIndexOf('\n', safeCursor - 1) + 1;
    return {
        text: source.slice(lineStart, safeCursor),
        lineStart
    };
}

function getCurrentWord(linePrefix) {
    return getTrailingStataIdentifier(linePrefix);
}

function scanStructure(text) {
    let inString = false;
    let parenDepth = 0;
    let bracketDepth = 0;
    let topLevelComma = -1;
    let topLevelColon = -1;
    let commentIndex = -1;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inString && text[i + 1] === '"') {
                i += 1;
                continue;
            }
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (char === '/' && text[i + 1] === '/') {
            commentIndex = i;
            break;
        }
        if (char === '(') {
            parenDepth += 1;
            continue;
        }
        if (char === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            continue;
        }
        if (char === '[') {
            bracketDepth += 1;
            continue;
        }
        if (char === ']') {
            bracketDepth = Math.max(0, bracketDepth - 1);
            continue;
        }
        if (parenDepth === 0 && bracketDepth === 0) {
            if (char === ',') topLevelComma = i;
            if (char === ':') topLevelColon = i;
        }
    }

    return { inString, parenDepth, bracketDepth, topLevelComma, topLevelColon, commentIndex };
}

function getOpenCallContexts(text, cursor) {
    const stack = [];
    let inString = false;
    const source = String(text || '').slice(0, cursor);

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        if (char === '"') {
            if (inString && source[i + 1] === '"') {
                i += 1;
                continue;
            }
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === '/' && source[i + 1] === '/') break;

        if (char === '(') {
            const nameMatch = source.slice(0, i).match(
                new RegExp(`(${STATA_IDENTIFIER_BODY})\\s*$`, 'u')
            );
            stack.push({
                name: nameMatch ? nameMatch[1].toLowerCase() : '',
                contentStart: i + 1,
                commaCount: 0
            });
        } else if (char === ')') {
            stack.pop();
        } else if (char === ',' && stack.length) {
            stack[stack.length - 1].commaCount += 1;
        }
    }

    return stack;
}

function isVariableOptionPosition(linePrefix, wordStart) {
    const calls = getOpenCallContexts(linePrefix, wordStart);
    for (let i = calls.length - 1; i >= 0; i--) {
        const call = calls[i];
        if (VARIABLE_OPTION_CALLS.has(call.name)) {
            return call.commaCount === 0;
        }
        if (call.name === 'vce') {
            const content = linePrefix.slice(call.contentStart, wordStart);
            return call.commaCount === 0 && /^\s*cluster\s+/i.test(content);
        }
    }
    return false;
}

function isSimpleCommandPosition(beforeWord) {
    const words = beforeWord.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        // An indented line can be a continued command. Preserve all candidates
        // rather than incorrectly assuming the current word is a command.
        return beforeWord.length === 0;
    }
    return words.every(word => SIMPLE_COMMAND_PREFIXES.has(word.toLowerCase()));
}

function isColonCommandPosition(linePrefix, wordStart, structure) {
    if (structure.topLevelColon < 0 || structure.topLevelColon >= wordStart) return false;
    if (linePrefix.slice(structure.topLevelColon + 1, wordStart).trim()) return false;
    const prefixWord = linePrefix.slice(0, structure.topLevelColon).trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    return Boolean(prefixWord && COLON_COMMAND_PREFIXES.has(prefixWord[1].toLowerCase()));
}

function isExpressionPosition(beforeWord, structure) {
    if (structure.parenDepth > 0 || structure.bracketDepth > 0) return true;
    return /(?:==|!=|<=|>=|=|\+|-|\*|\/|\^|&|\|)\s*$/.test(beforeWord);
}

function getCommandName(linePrefix) {
    let text = String(linePrefix || '').trimStart();
    let match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
    while (match && SIMPLE_COMMAND_PREFIXES.has(match[1].toLowerCase())) {
        text = text.slice(match[0].length).trimStart();
        match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
    }
    return match ? match[1].toLowerCase() : '';
}

function getCommandTail(linePrefix) {
    let text = String(linePrefix || '').trimStart();
    let match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
    while (match && SIMPLE_COMMAND_PREFIXES.has(match[1].toLowerCase())) {
        text = text.slice(match[0].length).trimStart();
        match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
    }
    return match ? text.slice(match[0].length) : '';
}

function isFilePathPosition(linePrefix) {
    if (/\busing\s+[^\s,]*$/i.test(linePrefix)) return true;
    const commandName = getCommandName(linePrefix);
    if (!FILE_COMMANDS.has(commandName)) return false;
    const tail = getCommandTail(linePrefix);
    return !tail.includes(',');
}

function isCommandExpressionPosition(linePrefix) {
    return EXPRESSION_COMMANDS.has(getCommandName(linePrefix));
}

function analyzeCompletionContext(text, cursor) {
    const currentLine = getCurrentLine(text, cursor);
    const linePrefix = currentLine.text;
    const word = getCurrentWord(linePrefix);
    const beforeWord = linePrefix.slice(0, word.start);
    const structure = scanStructure(linePrefix);
    const trimmedLine = linePrefix.trimStart();
    const result = type => ({
        type,
        prefix: word.word,
        wordStart: currentLine.lineStart + word.start,
        wordEnd: currentLine.lineStart + word.end
    });

    if (!word.word) {
        return result(COMPLETION_TYPES.none);
    }
    if (trimmedLine.startsWith('*') || structure.commentIndex >= 0 || structure.inString) {
        return result(COMPLETION_TYPES.none);
    }
    if (isSimpleCommandPosition(beforeWord) || isColonCommandPosition(linePrefix, word.start, structure)) {
        return result(COMPLETION_TYPES.command);
    }
    if (isVariableOptionPosition(linePrefix, word.start)) {
        return result(COMPLETION_TYPES.variable);
    }
    if (structure.topLevelComma >= 0) {
        const type = structure.parenDepth === 0 && structure.bracketDepth === 0
            ? COMPLETION_TYPES.option
            : COMPLETION_TYPES.all;
        return result(type);
    }
    if (isFilePathPosition(linePrefix)) {
        return result(COMPLETION_TYPES.none);
    }
    if (/\bif\s+[^,]*$/i.test(beforeWord)
        || isExpressionPosition(beforeWord, structure)
        || isCommandExpressionPosition(linePrefix)) {
        return result(COMPLETION_TYPES.expression);
    }
    if (/^\s*(?:by|bysort)\b/i.test(linePrefix) || VARIABLE_COMMANDS.has(getCommandName(linePrefix))) {
        return result(COMPLETION_TYPES.variable);
    }
    return result(COMPLETION_TYPES.all);
}

function createSearchText(label) {
    const lower = label.toLowerCase();
    let compact = '';
    const compactIndexes = [];
    for (let i = 0; i < lower.length; i++) {
        if (lower[i] === '_') continue;
        compact += lower[i];
        compactIndexes.push(i);
    }
    return { lower, compact, compactIndexes };
}

function getSearchText(label) {
    const cached = searchTextCache.get(label);
    if (cached) return cached;
    const searchText = createSearchText(label);
    if (searchTextCache.size < MAX_SEARCH_TEXT_CACHE_SIZE) {
        searchTextCache.set(label, searchText);
    }
    return searchText;
}

function normalizePinyinSyllable(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/ü/g, 'v')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
}

function createPinyinSearchText(label) {
    const value = String(label || '');
    if (!/\p{Script=Han}/u.test(value)) return null;

    const characters = Array.from(value);
    const syllables = getPinyinConverter()(value, { toneType: 'none', type: 'array' });
    if (!Array.isArray(syllables) || syllables.length !== characters.length) return null;

    let lower = '';
    const labelIndexes = [];
    let labelIndex = 0;
    for (let index = 0; index < characters.length; index++) {
        const character = characters[index];
        const syllable = /\p{Script=Han}/u.test(character)
            ? normalizePinyinSyllable(syllables[index])
            : character.toLowerCase();
        lower += syllable;
        for (let syllableIndex = 0; syllableIndex < syllable.length; syllableIndex++) {
            labelIndexes.push(labelIndex);
        }
        labelIndex += character.length;
    }
    return lower ? { lower, labelIndexes } : null;
}

function getPinyinSearchText(label) {
    if (pinyinSearchTextCache.has(label)) return pinyinSearchTextCache.get(label);
    const searchText = createPinyinSearchText(label);
    if (pinyinSearchTextCache.size < MAX_SEARCH_TEXT_CACHE_SIZE) {
        pinyinSearchTextCache.set(label, searchText);
    }
    return searchText;
}

function contiguousIndexes(length) {
    return Array.from({ length }, (_value, index) => index);
}

function createMatch(label, matchIndexes, matchType, queryLength) {
    const firstIndex = matchIndexes[0] || 0;
    const lastIndex = matchIndexes[matchIndexes.length - 1] || firstIndex;
    const skippedCharacters = Math.max(0, lastIndex - firstIndex - queryLength + 1);
    const score = MATCH_TYPE_PRIORITY[matchType] * 1000000
        + skippedCharacters * 10000
        + firstIndex * 100
        + Math.min(label.length, 99);
    return { matchIndexes, matchType, score };
}

function matchCompletionLabel(label, prefix) {
    const query = String(prefix || '').toLowerCase();
    if (!query) return null;

    const searchText = getSearchText(label);
    if (searchText.lower === query) {
        return createMatch(label, contiguousIndexes(query.length), COMPLETION_MATCH_TYPES.exact, query.length);
    }
    if (searchText.lower.startsWith(query)) {
        return createMatch(label, contiguousIndexes(query.length), COMPLETION_MATCH_TYPES.prefix, query.length);
    }

    // One Latin character creates too much noise. A single Han character is
    // already specific enough and should match anywhere in a variable name.
    if (query.length < 2 && !/\p{Script=Han}/u.test(query)) return null;

    if (!query.includes('_') && searchText.compact.startsWith(query)) {
        return createMatch(
            label,
            searchText.compactIndexes.slice(0, query.length),
            COMPLETION_MATCH_TYPES.normalizedPrefix,
            query.length
        );
    }

    const matchIndexes = [];
    let queryIndex = 0;
    for (let labelIndex = 0; labelIndex < searchText.lower.length && queryIndex < query.length; labelIndex++) {
        if (searchText.lower[labelIndex] === query[queryIndex]) {
            matchIndexes.push(labelIndex);
            queryIndex += 1;
        }
    }
    if (queryIndex !== query.length) return null;
    return createMatch(label, matchIndexes, COMPLETION_MATCH_TYPES.fuzzy, query.length);
}

function matchPinyinCompletionLabel(label, prefix) {
    const query = String(prefix || '').toLowerCase();
    // Full-pinyin matching is deliberately limited to two or more ASCII
    // letters. It does not implement initial-letter matching such as zsygbl.
    if (query.length < 2 || !/^[a-z]+$/.test(query)) return null;

    const searchText = getPinyinSearchText(label);
    if (!searchText) return null;

    const pinyinMatchIndexes = [];
    const contiguousStart = searchText.lower.indexOf(query);
    if (contiguousStart >= 0) {
        for (let index = 0; index < query.length; index++) {
            pinyinMatchIndexes.push(contiguousStart + index);
        }
    } else {
        let queryIndex = 0;
        for (let index = 0; index < searchText.lower.length && queryIndex < query.length; index++) {
            if (searchText.lower[index] === query[queryIndex]) {
                pinyinMatchIndexes.push(index);
                queryIndex += 1;
            }
        }
        if (queryIndex !== query.length) return null;

        // Permit ordered pinyin fuzziness such as `bil -> bianliang`, while
        // rejecting pure initial-letter queries such as `zsygbl`.
        const matchesPerLabelIndex = new Map();
        for (const pinyinIndex of pinyinMatchIndexes) {
            const labelIndex = searchText.labelIndexes[pinyinIndex];
            matchesPerLabelIndex.set(labelIndex, (matchesPerLabelIndex.get(labelIndex) || 0) + 1);
        }
        if (![...matchesPerLabelIndex.values()].some(count => count >= 2)) return null;
    }

    const matchIndexes = [];
    for (const pinyinIndex of pinyinMatchIndexes) {
        const labelIndex = searchText.labelIndexes[pinyinIndex];
        if (matchIndexes[matchIndexes.length - 1] !== labelIndex) {
            matchIndexes.push(labelIndex);
        }
    }
    const matchedLabel = matchIndexes.map(index => label[index]).join('');
    const displayLabel = `${label} · ${query} → ${matchedLabel}`;
    const match = createMatch(label, matchIndexes, COMPLETION_MATCH_TYPES.pinyin, matchIndexes.length);
    const pinyinStart = pinyinMatchIndexes[0];
    const pinyinEnd = pinyinMatchIndexes[pinyinMatchIndexes.length - 1];
    match.score += Math.max(0, pinyinEnd - pinyinStart - query.length + 1) * 10000;
    return {
        ...match,
        // The native widget cannot map Latin filter positions onto Han glyphs.
        // Show the matched pinyin and its Han target so VS Code can highlight
        // the Latin fragment while insertion continues to use the real label.
        displayLabel,
        filterText: displayLabel
    };
}

function compareCompletionCandidates(left, right) {
    const kindDifference = (CANDIDATE_KIND_PRIORITY[left.kind] ?? 9)
        - (CANDIDATE_KIND_PRIORITY[right.kind] ?? 9);
    if (kindDifference !== 0) return kindDifference;
    if (left.score !== right.score) return left.score - right.score;
    if (left.label.length !== right.label.length) return left.label.length - right.label.length;
    const leftKey = getSearchText(left.label).lower;
    const rightKey = getSearchText(right.label).lower;
    if (leftKey < rightKey) return -1;
    if (leftKey > rightKey) return 1;
    return 0;
}

function createVariableLabelSnippet(variableLabel, matchIndexes) {
    const text = String(variableLabel || '');
    const indexes = Array.isArray(matchIndexes) ? matchIndexes : [];
    if (!text || !indexes.length || text.length <= MAX_VARIABLE_LABEL_DISPLAY_LENGTH) {
        return { text, matchIndexes: indexes };
    }
    const first = indexes[0];
    const last = indexes[indexes.length - 1];
    const matchLength = last - first + 1;
    const contextBudget = Math.max(8, MAX_VARIABLE_LABEL_DISPLAY_LENGTH - matchLength - 2);
    let start = Math.max(0, first - Math.floor(contextBudget / 2));
    let end = Math.min(text.length, last + 1 + Math.ceil(contextBudget / 2));
    if (start === 0) end = Math.min(text.length, MAX_VARIABLE_LABEL_DISPLAY_LENGTH - 1);
    if (end === text.length) start = Math.max(0, text.length - MAX_VARIABLE_LABEL_DISPLAY_LENGTH + 1);
    const leading = start > 0 ? '…' : '';
    const trailing = end < text.length ? '…' : '';
    return {
        text: leading + text.slice(start, end) + trailing,
        matchIndexes: indexes.map(index => index - start + leading.length)
    };
}

function getVariableSourceValue(rawValue) {
    if (!rawValue || typeof rawValue !== 'object') {
        return { name: String(rawValue || '').trim(), variableLabel: '' };
    }
    return {
        name: String(rawValue.name || rawValue.variableName || '').trim(),
        variableLabel: String(rawValue.variableLabel ?? rawValue.label ?? '').trim()
    };
}

function createVariableCandidate(rawValue, prefix) {
    const { name, variableLabel } = getVariableSourceValue(rawValue);
    if (!name) return null;
    const nameMatch = matchCompletionLabel(name, prefix) || matchPinyinCompletionLabel(name, prefix);
    const rawLabelMatch = variableLabel
        ? (matchCompletionLabel(variableLabel, prefix) || matchPinyinCompletionLabel(variableLabel, prefix))
        : null;
    let labelMatch = null;
    if (rawLabelMatch) {
        const snippet = createVariableLabelSnippet(variableLabel, rawLabelMatch.matchIndexes);
        labelMatch = {
            ...rawLabelMatch,
            // Keep label matches between normalized-prefix and ordinary fuzzy
            // name matches while preserving the label match's internal order.
            score: LABEL_MATCH_SCORE + Math.floor(rawLabelMatch.score / 10),
            labelDisplay: snippet.text,
            labelDisplayMatchIndexes: snippet.matchIndexes,
            labelMatchIndexes: rawLabelMatch.matchIndexes,
            matchedOn: 'label'
        };
    }
    const match = !nameMatch || (labelMatch && labelMatch.score < nameMatch.score)
        ? labelMatch
        : { ...nameMatch, matchedOn: 'name' };
    if (!match) return null;

    const labelDisplay = match.labelDisplay || variableLabel;
    const nameDisplay = match.matchedOn === 'label' ? name : (match.displayLabel || name);
    let labelDetail = labelDisplay;
    if (match.matchedOn === 'label' && match.matchType === COMPLETION_MATCH_TYPES.pinyin) {
        const matchedText = match.labelMatchIndexes.map(index => variableLabel[index]).join('');
        labelDetail += ` · ${String(prefix || '').toLowerCase()} → ${matchedText}`;
    }
    const displayLabel = labelDetail ? `${nameDisplay}    ${labelDetail}` : nameDisplay;
    return {
        ...match,
        label: name,
        kind: 'var',
        variableLabel,
        nameDisplay,
        labelDetail,
        displayLabel
    };
}

function selectCompletionCandidates(context, pools, limit = MAX_COMPLETION_CANDIDATES) {
    if (!context || context.type === COMPLETION_TYPES.none) return [];
    const prefix = String(context.prefix || '').toLowerCase();
    if (!prefix) return [];
    const requestedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : MAX_COMPLETION_CANDIDATES;
    const safeLimit = Math.min(requestedLimit, MAX_COMPLETION_CANDIDATES);
    if (safeLimit === 0) return [];

    let sources = [];
    if (context.type === COMPLETION_TYPES.command) {
        sources = [{ values: pools.commands, kind: 'cmd' }];
    } else if (context.type === COMPLETION_TYPES.variable) {
        sources = [{ values: pools.variables, kind: 'var' }];
    } else if (context.type === COMPLETION_TYPES.option) {
        sources = [{ values: pools.options, kind: 'opt' }];
    } else if (context.type === COMPLETION_TYPES.expression) {
        sources = [
            { values: pools.variables, kind: 'var' },
            { values: pools.functions, kind: 'fn' }
        ];
    } else if (context.type === COMPLETION_TYPES.all) {
        sources = [
            { values: pools.variables, kind: 'var' },
            { values: pools.commands, kind: 'cmd' },
            { values: pools.functions, kind: 'fn' },
            { values: pools.options, kind: 'opt' }
        ];
    }

    const result = [];
    const seen = new Set();
    for (const source of sources) {
        for (const rawValue of Array.isArray(source.values) ? source.values : []) {
            const variableValue = source.kind === 'var' ? getVariableSourceValue(rawValue) : null;
            const label = source.kind === 'var' ? variableValue.name : String(rawValue || '').trim();
            const key = label.toLowerCase();
            if (!label || seen.has(key)) continue;
            const candidate = source.kind === 'var'
                ? createVariableCandidate(variableValue, prefix)
                : null;
            const match = source.kind === 'var'
                ? candidate
                : matchCompletionLabel(label, prefix);
            if (!match) continue;
            seen.add(key);
            result.push(source.kind === 'var' ? candidate : { label, kind: source.kind, ...match });
        }
    }
    result.sort(compareCompletionCandidates);
    return result.slice(0, safeLimit);
}

function getCompletionSortText(candidate) {
    const kind = candidate && candidate.kind;
    const label = String(candidate && candidate.label || '').toLowerCase();
    const kindPriority = CANDIDATE_KIND_PRIORITY[kind] ?? 9;
    const score = Number.isFinite(candidate && candidate.score) ? candidate.score : 999999999;
    return `${kindPriority}:${String(score).padStart(9, '0')}:${label}`;
}

function getCompletionFilterText(candidate) {
    const label = String(candidate && candidate.label || '');
    const matchIndexes = candidate && Array.isArray(candidate.matchIndexes)
        ? candidate.matchIndexes
        : [];
    if (candidate && candidate.matchType === COMPLETION_MATCH_TYPES.pinyin) {
        return String(candidate.displayLabel || candidate.filterText || label);
    }
    if (candidate && candidate.matchedOn === 'label') {
        const displayLabel = String(candidate.displayLabel || label);
        const labelDisplay = String(candidate.labelDisplay || '');
        const offset = labelDisplay ? displayLabel.indexOf(labelDisplay) : -1;
        if (offset < 0) return displayLabel;
        const matched = new Set((candidate.labelDisplayMatchIndexes || []).map(index => index + offset));
        let filterText = '';
        for (let index = 0; index < displayLabel.length; index++) {
            filterText += matched.has(index) ? displayLabel[index] : '_';
        }
        return filterText;
    }
    if (candidate && candidate.kind === 'var' && candidate.variableLabel && candidate.displayLabel) {
        const displayLabel = String(candidate.displayLabel);
        const matched = new Set(matchIndexes);
        let filterText = '';
        for (let index = 0; index < displayLabel.length; index++) {
            filterText += index < label.length && matched.has(index) ? displayLabel[index] : '_';
        }
        return filterText;
    }
    if (!label || !matchIndexes.length) return label;

    // VS Code performs another fuzzy-filtering pass after the provider returns.
    // Its scorer favors word boundaries and can otherwise discard valid shared
    // matches such as `ri -> price` or `变量 -> 这是一个变量`. Preserve the
    // matched characters at their original offsets and turn every skipped
    // character into a boundary so native highlighting still maps to the label.
    const matched = new Set(matchIndexes);
    let filterText = '';
    for (let index = 0; index < label.length; index++) {
        filterText += matched.has(index) ? label[index] : '_';
    }
    return filterText;
}

module.exports = {
    COMPLETION_TYPES,
    COMPLETION_MATCH_TYPES,
    MAX_COMPLETION_CANDIDATES,
    analyzeCompletionContext,
    matchCompletionLabel,
    matchPinyinCompletionLabel,
    createVariableLabelSnippet,
    selectCompletionCandidates,
    getCompletionSortText,
    getCompletionFilterText
};
