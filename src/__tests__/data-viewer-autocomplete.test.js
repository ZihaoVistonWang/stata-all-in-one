const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    mergeVariableLists,
    selectDataViewerCandidates,
    selectVariableTableCandidates,
    expandVariableTableVarlist
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

    it('matches Unicode variable names', () => {
        const candidates = selectDataViewerCandidates('这是', ['这是一个变量']);
        assert.deepStrictEqual(candidates.map(candidate => candidate.label), ['这是一个变量']);
        assert.deepStrictEqual(candidates[0].matchIndexes, [0, 1]);
    });

    it('allows one Han character to match inside a variable name', () => {
        const candidates = selectDataViewerCandidates('变', ['这是一个变量']);
        assert.deepStrictEqual(candidates.map(candidate => candidate.label), ['这是一个变量']);
        assert.deepStrictEqual(candidates[0].matchIndexes, [4]);
    });

    it('matches Chinese variable names by full pinyin without enabling initials', () => {
        const candidates = selectDataViewerCandidates('bianlia', ['这是一个变量']);
        assert.deepStrictEqual(candidates.map(candidate => candidate.label), ['这是一个变量']);
        assert.deepStrictEqual(candidates[0].matchIndexes, [4, 5]);
        assert.strictEqual(candidates[0].matchType, 'pinyin');
        assert.deepStrictEqual(selectDataViewerCandidates('zsygbl', ['这是一个变量']), []);
    });

    it('supports ordered pinyin fuzziness across Chinese characters', () => {
        const candidates = selectDataViewerCandidates('bil', ['这是一个变量']);
        assert.deepStrictEqual(candidates.map(candidate => candidate.label), ['这是一个变量']);
        assert.deepStrictEqual(candidates[0].matchIndexes, [4, 5]);
    });

    it('filters the variables table with the same matcher and no data keywords', () => {
        const candidates = selectVariableTableCandidates('bil', ['这是一个变量', 'billing']);
        assert.deepStrictEqual(
            candidates.map(candidate => [candidate.label, candidate.kind]),
            [['billing', 'var'], ['这是一个变量', 'var']]
        );
        assert.deepStrictEqual(candidates[1].matchIndexes, [4, 5]);
        assert.deepStrictEqual(selectVariableTableCandidates('in', []), []);
    });

    it('finds Data Viewer variables through Chinese and pinyin label text', () => {
        const variables = [{ name: 'formula_result', label: '这个变量代表了公式计算结果' }];
        const direct = selectVariableTableCandidates('公式', variables)[0];
        const pinyin = selectVariableTableCandidates('gongshi', variables)[0];
        assert.strictEqual(direct.label, 'formula_result');
        assert.deepStrictEqual(direct.labelDisplayMatchIndexes, [7, 8]);
        assert.strictEqual(pinyin.label, 'formula_result');
        assert.strictEqual(pinyin.matchType, 'pinyin');
        assert.deepStrictEqual(pinyin.labelDisplayMatchIndexes, [7, 8]);
    });

    it('expands a Stata variable list for the variables table', () => {
        const variables = ['price', 'weight', 'length', 'gear_ratio', '这是一个变量'];
        assert.deepStrictEqual(
            expandVariableTableVarlist('price length gear*', variables),
            ['price', 'length', 'gear_ratio']
        );
        assert.deepStrictEqual(
            expandVariableTableVarlist('weight-gear_ratio', variables),
            ['weight', 'length', 'gear_ratio']
        );
        assert.deepStrictEqual(expandVariableTableVarlist('_all', variables), variables);
        assert.deepStrictEqual(expandVariableTableVarlist('price if', variables), []);
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

    it('uses variable-only autocomplete and applies a Stata varlist on Enter', () => {
        assert.match(panelSource, /type: 'variableTableAutocomplete'/);
        assert.match(panelSource, /message\.type === 'variableTableAutocompleteResult'/);
        assert.match(panelSource, /message\.requestId === variableAutocompleteRequestId/);
        assert.match(panelSource, /type: 'variableTableApply'/);
        assert.match(panelSource, /message\.type === 'variableTableApplyResult'/);
        assert.match(panelSource, /message\.requestId === variableApplyRequestId/);
        assert.match(panelSource, /dataViewerVariableFilterPlaceholder/);
    });
});
