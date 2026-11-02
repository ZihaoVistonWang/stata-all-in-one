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
            console.error('Stata All in One: Failed to load Stata grammar:', error.message);
        });
        return null;
    }

    const currentVersionKey = getVersionKey();
    if (currentVersionKey !== loadedVersionKey) {
        ensureGrammarLoadStarted().catch((error) => {
            console.error('Stata All in One: Failed to reload Stata grammar:', error.message);
        });
    }

    const result = loadedGrammar.tokenizeLine(String(line || ''), null);
    return result && Array.isArray(result.tokens) ? result.tokens : null;
}

async function prewarmConsoleTextmateTokenizer() {
    try {
        await ensureGrammarLoadStarted();
    } catch (error) {
        console.error('Stata All in One: Failed to prewarm Stata grammar:', error.message);
    }
}

module.exports = {
    prewarmConsoleTextmateTokenizer,
    tokenizeStataLine
};
