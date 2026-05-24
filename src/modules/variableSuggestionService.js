const vscode = require('vscode');

const documentVars = new Map();
let memoryVars = [];
let lastStataDocumentKey = null;
const listeners = new Set();

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
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
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

        const genMatch = line.match(/\b(gen|generate|egen)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/i);
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
                    if (v.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
                        variables.add(v);
                    }
                });
            }
        }

        const renameMatch = line.match(/\b(rename|drop|keep)\s+(.*?)(?:\n|if|in|,|$)/i);
        if (renameMatch && renameMatch[2]) {
            const vars = renameMatch[2].split(/[\s,]+/).filter(v => v && v.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/));
            vars.forEach(v => variables.add(v));
        }

        const exprMatch = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*([><=!]+|in|if)/g);
        if (exprMatch) {
            exprMatch.forEach(expr => {
                const varMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
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
    return mergeVarLists(docVars, memoryVars);
}

function getVariablesForCompletion(document) {
    if (!isStataDocument(document)) {
        return getVariables(document);
    }
    const docVars = normalizeVarNames([...extractVariableNames(document)]);
    return mergeVarLists(docVars, memoryVars);
}

function getActiveVariables() {
    const editor = vscode.window.activeTextEditor;
    if (editor && isStataDocument(editor.document)) {
        lastStataDocumentKey = documentKey(editor.document);
        return getVariables(editor.document);
    }
    const docVars = lastStataDocumentKey ? documentVars.get(lastStataDocumentKey) || [] : [];
    return mergeVarLists(docVars, memoryVars);
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
    return memoryVars;
}

function parseVarListOutput(output) {
    const lines = String(output || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const marker = '__SAIO_VARLIST__';
    const marked = lines.find(line => line.includes(marker));
    const text = marked ? marked.slice(marked.indexOf(marker) + marker.length) : lines[lines.length - 1] || '';
    return normalizeVarNames(text.split(/\s+/));
}

function parseMataVarNameLines(output) {
    const names = [];
    const lines = String(output || '').split(/\r?\n/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(line)) {
            names.push(line);
        }
    }
    return normalizeVarNames(names);
}

async function refreshMemoryVars(_context) {
    try {
        const session = getActiveSession();
        if (!session) {
            return [];
        }
        let vars = [];
        const mataResult = await session.execute('mata: for(i=1;i<=st_nvar();i++) printf("%s\\n", st_varname(i))', false);
        if (mataResult && mataResult.success) {
            vars = parseMataVarNameLines(mataResult.output);
        }

        if (!vars.length) {
            const describeResult = await session.execute('quietly describe, varlist\n' +
                "display \"__SAIO_VARLIST__ \" \"`r(varlist)'\"", false);
            if (describeResult && describeResult.success) {
                vars = parseVarListOutput(describeResult.output);
            }
        }

        if (!vars.length) {
            return [];
        }

        if (!sameVarList(memoryVars, vars)) {
            memoryVars = vars;
            notifyVariablesChanged();
        }
        return memoryVars;
    } catch (_e) {
        return [];
    }
}

function setMemoryVars(vars) {
    memoryVars = normalizeVarNames(vars);
    notifyVariablesChanged();
    return memoryVars;
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
    getActiveVariables,
    getMemoryVars,
    refreshDocument,
    refreshMemoryVars,
    setMemoryVars,
    registerVariableSuggestionService,
    onDidChangeVariables,
    mergeVarLists
};
