const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const oniguruma = require('vscode-oniguruma');
const textmate = require('vscode-textmate');

const grammarPath = path.resolve(__dirname, '../../grammars/stata.json');

async function loadStataGrammar() {
    const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
    const wasm = fs.readFileSync(wasmPath);
    await oniguruma.loadWASM(wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength
    ));
    const registry = new textmate.Registry({
        onigLib: Promise.resolve({
            createOnigScanner(patterns) {
                return new oniguruma.OnigScanner(patterns);
            },
            createOnigString(value) {
                return new oniguruma.OnigString(value);
            }
        }),
        loadGrammar: async scopeName => {
            if (scopeName !== 'source.stata') return null;
            return textmate.parseRawGrammar(
                fs.readFileSync(grammarPath, 'utf8'),
                grammarPath
            );
        }
    });
    return registry.loadGrammar('source.stata');
}

function scopesAcross(tokens, start, end) {
    return tokens.filter(token =>
        token.startIndex < end && token.endIndex > start
    );
}

test('keeps every token inside quoted file paths in the string scope', async () => {
    const grammar = await loadStataGrammar();
    const lines = [
        'use "/Users/research/panel data copy.dta", clear',
        'outreg2 using "statistics.xls", replace',
        'log using "analysis output.smcl", replace',
        'export excel using "results workbook.xlsx", replace'
    ];

    for (const line of lines) {
        const openQuote = line.indexOf('"');
        const closeQuote = line.lastIndexOf('"');
        const result = grammar.tokenizeLine(line);
        const stringTokens = scopesAcross(
            result.tokens,
            openQuote + 1,
            closeQuote
        );

        assert.ok(stringTokens.length > 0, line);
        for (const token of stringTokens) {
            assert.ok(
                token.scopes.includes('string.quoted.double.stata'),
                `${line}: ${line.slice(token.startIndex, token.endIndex)}`
            );
        }

        const replaceIndex = line.indexOf('replace');
        if (replaceIndex >= 0) {
            const replaceToken = result.tokens.find(token =>
                token.startIndex <= replaceIndex
                && token.endIndex > replaceIndex
            );
            assert.ok(replaceToken, line);
            assert.equal(
                replaceToken.scopes.includes('string.quoted.double.stata'),
                false,
                line
            );
        }
    }
});
