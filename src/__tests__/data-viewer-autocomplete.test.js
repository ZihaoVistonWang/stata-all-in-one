const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    mergeVariableLists,
    selectDataViewerCandidates
} = require('../modules/runCode/embeddedConsole/dataViewer/autocomplete');

const panelSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/runCode/embeddedConsole/dataViewer/panel.js'),
    'utf8'
);

describe('Data Viewer filter autocomplete', () => {
    it('uses shared fuzzy matching and exposes matched character indexes', () => {
        const candidates = selectDataViewerCandidates('alst', ['a_list', 'another']);
        assert.deepStrictEqual(candidates.map(candidate => candidate.label), ['a_list']);
        assert.deepStrictEqual(candidates[0].matchIndexes, [0, 2, 4, 5]);
        assert.strictEqual(candidates[0].matchType, 'fuzzy');
    });

    it('keeps variables ahead of filter keywords in mixed results', () => {
        const candidates = selectDataViewerCandidates('in', ['income', 'industry']);
        assert.deepStrictEqual(
            candidates.map(candidate => [candidate.label, candidate.kind]),
            [['income', 'var'], ['industry', 'var'], ['in', 'cmd']]
        );
    });

    it('limits one-character queries to prefixes', () => {
        const candidates = selectDataViewerCandidates('l', ['a_list', 'labor']);
        assert.deepStrictEqual(candidates.map(candidate => candidate.label), ['labor']);
    });

    it('deduplicates names and enforces the shared 100-item cap', () => {
        const variables = [
            'A_LIST',
            'a_list',
            ...Array.from({ length: 120 }, (_value, index) => `a_${index}_list`)
        ];
        const candidates = selectDataViewerCandidates('alst', variables, Infinity);
        assert.strictEqual(candidates.length, 100);
        assert.strictEqual(candidates.filter(candidate => candidate.label.toLowerCase() === 'a_list').length, 1);
    });

    it('merges dataset and shared variables case-insensitively', () => {
        assert.deepStrictEqual(
            mergeVariableLists(['price', 'Foreign'], ['PRICE', 'weight']),
            ['price', 'Foreign', 'weight']
        );
    });

    it('renders match spans safely and ignores superseded responses', () => {
        assert.match(panelSource, /type: 'filterAutocomplete'/);
        assert.match(panelSource, /message\.requestId === filterAutocompleteRequestId/);
        assert.match(panelSource, /appendFilterAutocompleteLabel\(\s*text,\s*label/);
        assert.match(panelSource, /span\.textContent = label\.slice\(start, end\)/);
        assert.doesNotMatch(panelSource, /innerHTML\s*=\s*label/);
    });
});
