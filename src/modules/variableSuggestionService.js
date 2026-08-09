const vscode = require('vscode');
const { STATA_IDENTIFIER_BODY, isStataIdentifier } = require('./stataIdentifier');

const documentVars = new Map();
let memoryVariables = [];
let lastStataDocumentKey = null;
const listeners = new Set();
const VARIABLE_META_BEGIN = '__SAIO_VAR_META_BEGIN__';
const VARIABLE_META_END = '__SAIO_VAR_META_END__';
const UNIT_SEPARATOR = String.fromCharCode(31);

// Use the same direct getActiveSession import as Data Viewer's provider.js
const { getActiveSession } = require('./runCode/embeddedConsole/session');

function documentKey(document) {
    if (!document) return null;
    return document.uri ? document.uri.toString() : document.fileName;
}

function isStataDocument(document) {
    if (!document) return false;
    if (document.languageId === 'stata') return true;
    const name = (document.fileName || '').toLowerCase();
    return name.endsWith('.do') || name.endsWith('.ado') || name.endsWith('.mata');
}

function normalizeVarNames(values) {
    const result = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const name = String(value || '').trim();
        if (!isStataIdentifier(name)) {
            continue;
        }
        const key = name.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            result.push(name);
        }
    }
    return result;
}

function normalizeVariableEntries(values) {
    const result = [];
    const seen = new Map();
    for (const value of Array.isArray(values) ? values : []) {
        const name = String(value && typeof value === 'object'
            ? (value.name || value.variableName || '')
            : value || '').trim();
        if (!isStataIdentifier(name)) continue;
        const variableLabel = String(value && typeof value === 'object'
            ? (value.variableLabel ?? value.label ?? '')
            : '').trim();
        const key = name.toLowerCase();
        if (!seen.has(key)) {
            seen.set(key, result.length);
            result.push({ name, variableLabel });
        } else if (variableLabel && !result[seen.get(key)].variableLabel) {
            result[seen.get(key)].variableLabel = variableLabel;
        }
    }
    return result;
}

function mergeVariableEntries(...lists) {
    const merged = [];
    const indexes = new Map();
    for (const list of lists) {
        for (const entry of normalizeVariableEntries(list)) {
            const key = entry.name.toLowerCase();
            if (!indexes.has(key)) {
                indexes.set(key, merged.length);
                merged.push(entry);
            } else if (entry.variableLabel && !merged[indexes.get(key)].variableLabel) {
                merged[indexes.get(key)].variableLabel = entry.variableLabel;
            }
        }
    }
    return merged;
}

function mergeVarLists(...lists) {
    const merged = [];
    const seen = new Set();
    for (const list of lists) {
        for (const name of normalizeVarNames(list)) {
            const key = name.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(name);
            }
        }
    }
    return merged;
}

function sameVarList(a, b) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    if (left.length !== right.length) {
        return false;
    }
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Extract variable names from the document.
 * Looks for patterns like gen/generate varname = ..., and variable names in common commands.
 * @param {vscode.TextDocument} document
 * @returns {Set<string>}
 */
function extractVariableNames(document) {
    const variables = new Set();

    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;

        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) {
            continue;
        }

        const genMatch = line.match(
            new RegExp(`\\b(gen|generate|egen)\\s+(${STATA_IDENTIFIER_BODY})\\s*=`, 'iu')
        );
        if (genMatch) {
            variables.add(genMatch[2]);
        }

        const cmdPatterns = [
            /\b(summarize|sum|describe|desc|list|lis|li|tabulate|tab|tabstat|correlate|corr|pwcorr)\s+(.*?)(?:\n|,|$)/i,
            /\b(reg|regress|logit|probit|ologit|poisson|nbreg)\s+(.*?)\s+(?:if|in|,|$)/i,
            /\b(scatter|twoway|graph)\s+(.*?),/i
        ];

        for (const pattern of cmdPatterns) {
            const match = line.match(pattern);
            if (match && match[2]) {
                const vars = match[2].split(/[\s,]+/).filter(v => v && !v.match(/^[0-9]/));
                vars.forEach(v => {
                    if (isStataIdentifier(v)) {
                        variables.add(v);
                    }
                });
            }
        }

        const renameMatch = line.match(/\b(rename|drop|keep)\s+(.*?)(?:\n|if|in|,|$)/i);
        if (renameMatch && renameMatch[2]) {
            const vars = renameMatch[2].split(/[\s,]+/).filter(isStataIdentifier);
            vars.forEach(v => variables.add(v));
        }

        const exprMatch = line.match(
            new RegExp(`(${STATA_IDENTIFIER_BODY})\\s*([><=!]+|in|if)`, 'giu')
        );
        if (exprMatch) {
            exprMatch.forEach(expr => {
                const varMatch = expr.match(new RegExp(`^(${STATA_IDENTIFIER_BODY})`, 'u'));
                if (varMatch) {
                    variables.add(varMatch[1]);
                }
            });
        }
    }

    return variables;
}

function notifyVariablesChanged() {
    for (const listener of listeners) {
        try {
            listener();
        } catch (_e) {}
    }
}

function getVariables(document) {
    const key = documentKey(document);
    const docVars = key ? documentVars.get(key) || [] : [];
    return mergeVariableEntries(docVars, memoryVariables).map(entry => entry.name);
}

function getVariablesForCompletion(document) {
    if (!isStataDocument(document)) {
        return getVariables(document);
    }
    const docVars = normalizeVarNames([...extractVariableNames(document)]);
    return mergeVariableEntries(docVars, memoryVariables).map(entry => entry.name);
}

function getVariableCandidatesForCompletion(document) {
    const docVars = isStataDocument(document)
        ? normalizeVarNames([...extractVariableNames(document)])
        : (documentVars.get(documentKey(document)) || []);
    return mergeVariableEntries(docVars, memoryVariables);
}

function getActiveVariables() {
    const editor = vscode.window.activeTextEditor;
    if (editor && isStataDocument(editor.document)) {
        lastStataDocumentKey = documentKey(editor.document);
        return getVariables(editor.document);
    }
    const docVars = lastStataDocumentKey ? documentVars.get(lastStataDocumentKey) || [] : [];
    return mergeVariableEntries(docVars, memoryVariables).map(entry => entry.name);
}

function getActiveVariableCandidates() {
    const editor = vscode.window.activeTextEditor;
    if (editor && isStataDocument(editor.document)) {
        lastStataDocumentKey = documentKey(editor.document);
        return mergeVariableEntries(documentVars.get(lastStataDocumentKey) || [], memoryVariables);
    }
    const docVars = lastStataDocumentKey ? documentVars.get(lastStataDocumentKey) || [] : [];
    return mergeVariableEntries(docVars, memoryVariables);
}

function refreshDocument(document) {
    if (!isStataDocument(document)) {
        return [];
    }
    const key = documentKey(document);
    lastStataDocumentKey = key;
    const vars = normalizeVarNames([...extractVariableNames(document)]);
    const previous = documentVars.get(key) || [];
    documentVars.set(key, vars);
    if (!sameVarList(previous, vars)) {
        notifyVariablesChanged();
    }
    return vars;
}

function getMemoryVars() {
    return memoryVariables.map(entry => entry.name);
}

function getMemoryVariables() {
    return memoryVariables.map(entry => ({ ...entry }));
}

function parseVarListOutput(output) {
    const lines = String(output || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const marker = '__SAIO_VARLIST__';
    const marked = lines.find(line => line.includes(marker));
    const text = marked ? marked.slice(marked.indexOf(marker) + marker.length) : lines[lines.length - 1] || '';
    return normalizeVarNames(text.split(/\s+/));
}

function parseMataVariableMetadata(output) {
    const text = String(output || '');
    const reassembledText = text.replace(/\r?\n\s*>\s?/g, '');
    const entries = [];
    const framedPattern = new RegExp(`${VARIABLE_META_BEGIN}([\\s\\S]*?)${VARIABLE_META_END}`, 'g');
    let match;
    while ((match = framedPattern.exec(reassembledText)) !== null) {
        const fields = match[1].split(UNIT_SEPARATOR);
        entries.push({
            name: String(fields.shift() || '').trim(),
            variableLabel: fields.join(UNIT_SEPARATOR).trim()
        });
    }
    return normalizeVariableEntries(entries);
}

async function refreshMemoryVars(_context) {
    try {
        const session = getActiveSession();
        if (!session) {
            return [];
        }
        let vars = [];
        const mataResult = await session.execute(
            `mata: for(i=1;i<=st_nvar();i++) printf("${VARIABLE_META_BEGIN}%s%s%s${VARIABLE_META_END}\\n", st_varname(i), char(31), st_varlabel(i))`,
            false
        );
        if (mataResult && mataResult.success) {
            vars = parseMataVariableMetadata(mataResult.output);
        }

        if (!vars.length) {
            const describeResult = await session.execute('quietly describe, varlist\n' +
                "display \"__SAIO_VARLIST__ \" \"`r(varlist)'\"", false);
            if (describeResult && describeResult.success) {
                vars = parseVarListOutput(describeResult.output).map(name => ({ name, variableLabel: '' }));
            }
        }

        if (!vars.length) {
            return [];
        }

        if (!sameVarList(
            memoryVariables.map(entry => `${entry.name}\u0000${entry.variableLabel}`),
            vars.map(entry => `${entry.name}\u0000${entry.variableLabel}`)
        )) {
            memoryVariables = vars;
            notifyVariablesChanged();
        }
        return getMemoryVars();
    } catch (_e) {
        return [];
    }
}

function setMemoryVars(vars) {
    memoryVariables = normalizeVariableEntries(vars);
    notifyVariablesChanged();
    return getMemoryVars();
}

function refreshDocumentOnly(document) {
    if (!isStataDocument(document)) {
        return;
    }
    refreshDocument(document);
}

function registerVariableSuggestionService(context) {
    for (const document of vscode.workspace.textDocuments) {
        refreshDocumentOnly(document);
    }
    const activeDocument = vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
    if (activeDocument) {
        refreshDocumentOnly(activeDocument);
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => refreshDocumentOnly(document)),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                refreshDocumentOnly(editor.document);
            } else {
                notifyVariablesChanged();
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event && event.document) {
                refreshDocument(event.document);
            }
        })
    );
}

function onDidChangeVariables(listener) {
    listeners.add(listener);
    return {
        dispose() {
            listeners.delete(listener);
        }
    };
}

module.exports = {
    extractVariableNames,
    getVariables,
    getVariablesForCompletion,
    getVariableCandidatesForCompletion,
    getActiveVariables,
    getActiveVariableCandidates,
    getMemoryVars,
    getMemoryVariables,
    refreshDocument,
    refreshMemoryVars,
    setMemoryVars,
    registerVariableSuggestionService,
    onDidChangeVariables,
    mergeVarLists,
    mergeVariableEntries,
    parseMataVariableMetadata
};
