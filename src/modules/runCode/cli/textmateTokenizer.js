const fs = require('fs');
const path = require('path');
const vscodeTextmate = require('vscode-textmate');
const vscodeOniguruma = require('vscode-oniguruma');

const ROOT_SCOPE = 'source.stata';
const CUSTOM_SCOPE = 'stata.injection.custom-commands';
const MAIN_GRAMMAR_PATH = path.resolve(__dirname, '../../../../grammars/stata.json');
const CUSTOM_GRAMMAR_PATH = path.resolve(__dirname, '../../../../grammars/stata-custom.json');
const ONIG_WASM_PATH = require.resolve('vscode-oniguruma/release/onig.wasm');

let onigurumaReadyPromise = null;
let grammarLoadPromise = null;
let loadedVersionKey = null;
let loadedGrammar = null;
let loadedRegistry = null;
let loadedColorMap = [];
let pendingThemeData = null;

const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FOREGROUND_MASK = 0x00ff8000;
const FOREGROUND_OFFSET = 15;
const FONT_STYLE_MASK = 0x00007800;
const FONT_STYLE_OFFSET = 11;

function getVersionKey() {
    const files = [MAIN_GRAMMAR_PATH, CUSTOM_GRAMMAR_PATH];
    return files.map((filePath) => {
        try {
            const stats = fs.statSync(filePath);
            return `${filePath}:${stats.mtimeMs}`;
        } catch (_) {
            return `${filePath}:missing`;
        }
    }).join('|');
}

function readRawGrammar(filePath, fallbackScopeName) {
    if (!fs.existsSync(filePath)) {
        return {
            scopeName: fallbackScopeName,
            patterns: []
        };
    }

    return vscodeTextmate.parseRawGrammar(fs.readFileSync(filePath, 'utf8'), filePath);
}

function createOnigLib() {
    return {
        createOnigScanner(patterns) {
            return vscodeOniguruma.createOnigScanner(patterns);
        },
        createOnigString(text) {
            return vscodeOniguruma.createOnigString(text);
        }
    };
}

async function ensureOnigurumaReady() {
    if (!onigurumaReadyPromise) {
        const wasm = fs.readFileSync(ONIG_WASM_PATH);
        const wasmBuffer = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
        onigurumaReadyPromise = vscodeOniguruma.loadWASM(wasmBuffer);
    }

    await onigurumaReadyPromise;
}

async function loadGrammar(versionKey) {
    await ensureOnigurumaReady();

    const mainGrammar = readRawGrammar(MAIN_GRAMMAR_PATH, ROOT_SCOPE);
    const customGrammar = readRawGrammar(CUSTOM_GRAMMAR_PATH, CUSTOM_SCOPE);

    const registry = new vscodeTextmate.Registry({
        onigLib: Promise.resolve(createOnigLib()),
        loadGrammar: async (scopeName) => {
            if (scopeName === ROOT_SCOPE) {
                return mainGrammar;
            }
            if (scopeName === CUSTOM_SCOPE) {
                return customGrammar;
            }
            return null;
        },
        getInjections: (scopeName) => {
            if (scopeName === ROOT_SCOPE) {
                return [CUSTOM_SCOPE];
            }
            return [];
        }
    });

    const grammar = await registry.loadGrammar(ROOT_SCOPE);
    loadedRegistry = registry;
    if (pendingThemeData) {
        loadedRegistry.setTheme({
            settings: Array.isArray(pendingThemeData.tokenColors) ? pendingThemeData.tokenColors : []
        });
    }
    loadedColorMap = registry.getColorMap() || [];
    loadedGrammar = grammar;
    loadedVersionKey = versionKey;
    return grammar;
}

function ensureGrammarLoadStarted() {
    const versionKey = getVersionKey();
    if (loadedGrammar && loadedVersionKey === versionKey) {
        return Promise.resolve(loadedGrammar);
    }

    if (!grammarLoadPromise || loadedVersionKey !== versionKey) {
        grammarLoadPromise = loadGrammar(versionKey)
            .catch((error) => {
                loadedGrammar = null;
                loadedVersionKey = null;
                throw error;
            })
            .finally(() => {
                grammarLoadPromise = null;
            });
    }

    return grammarLoadPromise;
}

function tokenizeStataLine(line) {
    if (!loadedGrammar) {
        ensureGrammarLoadStarted().catch((error) => {
            console.error('[textmateTokenizer] Failed to load Stata grammar:', error.message);
        });
        return null;
    }

    const currentVersionKey = getVersionKey();
    if (currentVersionKey !== loadedVersionKey) {
        ensureGrammarLoadStarted().catch((error) => {
            console.error('[textmateTokenizer] Failed to reload Stata grammar:', error.message);
        });
    }

    const result = loadedGrammar.tokenizeLine(String(line || ''), null);
    return result && Array.isArray(result.tokens) ? result.tokens : null;
}

function setCliTextmateTheme(themeData) {
    pendingThemeData = themeData || null;
    if (!loadedRegistry || !themeData) {
        return;
    }

    const rawTheme = {
        settings: Array.isArray(themeData.tokenColors) ? themeData.tokenColors : []
    };
    loadedRegistry.setTheme(rawTheme);
    loadedColorMap = loadedRegistry.getColorMap() || [];
}

function decodeForeground(metadata) {
    return (metadata & FOREGROUND_MASK) >>> FOREGROUND_OFFSET;
}

function decodeFontStyle(metadata) {
    return (metadata & FONT_STYLE_MASK) >>> FONT_STYLE_OFFSET;
}

function hasSpecificScope(scopes) {
    return Array.isArray(scopes) && scopes.some((scope) => scope && scope !== 'source' && scope !== 'source.stata');
}

function tokenizeStataLineWithTheme(line) {
    if (!loadedGrammar) {
        ensureGrammarLoadStarted().catch((error) => {
            console.error('[textmateTokenizer] Failed to load Stata grammar:', error.message);
        });
        return null;
    }

    const text = String(line || '');
    const scopeTokens = loadedGrammar.tokenizeLine(text, null);
    const binaryTokens = loadedGrammar.tokenizeLine2(text, null);
    const scopeEntries = scopeTokens && Array.isArray(scopeTokens.tokens) ? scopeTokens.tokens : [];
    const binaryEntries = binaryTokens && binaryTokens.tokens ? Array.from(binaryTokens.tokens) : [];
    if (!scopeEntries.length) {
        return null;
    }

    const themedTokens = [];
    let binaryIndex = 0;

    for (let i = 0; i < scopeEntries.length; i++) {
        const scopeToken = scopeEntries[i];
        const startIndex = scopeToken.startIndex;
        const endIndex = scopeToken.endIndex;

        while (binaryIndex + 2 < binaryEntries.length && binaryEntries[binaryIndex] < startIndex) {
            binaryIndex += 2;
        }

        let metadata = 0;
        if (binaryIndex + 1 < binaryEntries.length && binaryEntries[binaryIndex] === startIndex) {
            metadata = binaryEntries[binaryIndex + 1];
        }

        const scopes = Array.isArray(scopeToken.scopes) ? scopeToken.scopes : [];
        const specificScope = hasSpecificScope(scopes);
        const foregroundId = decodeForeground(metadata);
        const fontStyle = decodeFontStyle(metadata);
        themedTokens.push({
            startIndex,
            endIndex,
            scopes,
            foreground: specificScope && foregroundId > 0 ? loadedColorMap[foregroundId] || null : null,
            fontStyle: specificScope ? {
                italic: (fontStyle & FONT_STYLE_ITALIC) !== 0,
                bold: (fontStyle & FONT_STYLE_BOLD) !== 0
            } : null
        });
    }

    return themedTokens;
}

async function prewarmCliTextmateTokenizer() {
    try {
        await ensureGrammarLoadStarted();
    } catch (error) {
        console.error('[textmateTokenizer] Failed to prewarm Stata grammar:', error.message);
    }
}

module.exports = {
    prewarmCliTextmateTokenizer,
    setCliTextmateTheme,
    tokenizeStataLine,
    tokenizeStataLineWithTheme
};
