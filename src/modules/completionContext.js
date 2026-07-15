const COMPLETION_TYPES = Object.freeze({
    command: 'command',
    variable: 'variable',
    expression: 'expression',
    option: 'option',
    all: 'all',
    none: 'none'
});

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
    const match = String(linePrefix || '').match(/[A-Za-z_][A-Za-z0-9_]*$/);
    if (!match) {
        return { word: '', start: linePrefix.length, end: linePrefix.length };
    }
    return {
        word: match[0],
        start: match.index,
        end: linePrefix.length
    };
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
            const nameMatch = source.slice(0, i).match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
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

function selectCompletionCandidates(context, pools, limit = Infinity) {
    if (!context || context.type === COMPLETION_TYPES.none) return [];
    const prefix = String(context.prefix || '').toLowerCase();
    if (!prefix) return [];

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
            const label = String(rawValue || '').trim();
            const key = label.toLowerCase();
            if (!label || !key.startsWith(prefix) || seen.has(key)) continue;
            seen.add(key);
            result.push({ label, kind: source.kind });
            if (result.length >= limit) return result;
        }
    }
    return result;
}

function getCompletionSortText(candidate) {
    const priority = {
        var: '0',
        cmd: '1',
        fn: '2',
        opt: '3'
    };
    const kind = candidate && candidate.kind;
    const label = String(candidate && candidate.label || '').toLowerCase();
    return `${priority[kind] || '9'}:${label}`;
}

module.exports = {
    COMPLETION_TYPES,
    analyzeCompletionContext,
    selectCompletionCandidates,
    getCompletionSortText
};
