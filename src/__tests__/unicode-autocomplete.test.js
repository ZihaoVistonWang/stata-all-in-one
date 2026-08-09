const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    isStataIdentifier,
    getTrailingStataIdentifier
} = require('../modules/stataIdentifier');
const {
    COMPLETION_TYPES,
    analyzeCompletionContext,
    getCompletionFilterText,
    selectCompletionCandidates
} = require('../modules/completionContext');

const variableServiceSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/variableSuggestionService.js'),
    'utf8'
);
const completionProviderSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/completionProvider.js'),
    'utf8'
);
const consolePanelSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/runCode/embeddedConsole/panel.js'),
    'utf8'
);
const dataViewerPanelSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/runCode/embeddedConsole/dataViewer/panel.js'),
    'utf8'
);

test('recognizes Unicode Stata variable names and trailing input words', () => {
    assert.strictEqual(isStataIdentifier('这是一个变量'), true);
    assert.strictEqual(isStataIdentifier('变量_2026'), true);
    assert.strictEqual(isStataIdentifier('2026变量'), false);
    assert.deepStrictEqual(
        getTrailingStataIdentifier('summarize 这是一个'),
        { word: '这是一个', start: 10, end: 14 }
    );
});

test('matches a Chinese variable in an editor or Console variable context', () => {
    const text = 'summarize 这是';
    const context = analyzeCompletionContext(text, text.length);
    assert.strictEqual(context.type, COMPLETION_TYPES.variable);
    assert.strictEqual(context.wordStart, 10);
    assert.deepStrictEqual(
        selectCompletionCandidates(context, {
            commands: [],
            variables: ['这是一个变量'],
            functions: [],
            options: []
        }).map(candidate => candidate.label),
        ['这是一个变量']
    );
});

test('matches a Chinese variable by a continuous full-pinyin fragment', () => {
    const text = 'summarize bianlia';
    const context = analyzeCompletionContext(text, text.length);
    const candidates = selectCompletionCandidates(context, {
        commands: [],
        variables: ['这是一个变量'],
        functions: [],
        options: []
    });

    assert.deepStrictEqual(candidates.map(candidate => candidate.label), ['这是一个变量']);
    assert.strictEqual(candidates[0].matchType, 'pinyin');
    assert.deepStrictEqual(candidates[0].matchIndexes, [4, 5]);
    assert.strictEqual(candidates[0].displayLabel, '这是一个变量 · bianlia → 变量');
    assert.strictEqual(getCompletionFilterText(candidates[0]), candidates[0].displayLabel);
});

test('does not enable one-letter or pinyin-initial matching', () => {
    const pools = {
        commands: [],
        variables: ['这是一个变量'],
        functions: [],
        options: []
    };
    assert.deepStrictEqual(
        selectCompletionCandidates({ type: COMPLETION_TYPES.variable, prefix: 'b' }, pools),
        []
    );
    assert.deepStrictEqual(
        selectCompletionCandidates({ type: COMPLETION_TYPES.variable, prefix: 'zsygbl' }, pools),
        []
    );
});

test('supports ordered pinyin fuzziness without falling back to initials', () => {
    const pools = {
        commands: [],
        variables: ['这是一个变量'],
        functions: [],
        options: []
    };
    const candidates = selectCompletionCandidates({
        type: COMPLETION_TYPES.variable,
        prefix: 'bil'
    }, pools);
    assert.deepStrictEqual(candidates.map(candidate => candidate.label), ['这是一个变量']);
    assert.deepStrictEqual(candidates[0].matchIndexes, [4, 5]);
    assert.strictEqual(candidates[0].displayLabel, '这是一个变量 · bil → 变量');
});

test('allows one Han character to match inside a variable name', () => {
    const candidates = selectCompletionCandidates({
        type: COMPLETION_TYPES.variable,
        prefix: '变'
    }, {
        commands: [],
        variables: ['这是一个变量'],
        functions: [],
        options: []
    });
    assert.deepStrictEqual(candidates.map(candidate => candidate.label), ['这是一个变量']);
    assert.deepStrictEqual(candidates[0].matchIndexes, [4]);
});

test('keeps direct variable-name matches ahead of pinyin matches', () => {
    const candidates = selectCompletionCandidates({
        type: COMPLETION_TYPES.variable,
        prefix: 'bianlia'
    }, {
        commands: [],
        variables: ['bianlia_data', '这是一个变量'],
        functions: [],
        options: []
    });
    assert.deepStrictEqual(
        candidates.map(candidate => candidate.label),
        ['bianlia_data', '这是一个变量']
    );
});

test('keeps Unicode names through discovery and all three input surfaces', () => {
    assert.match(variableServiceSource, /isStataIdentifier\(name\)/);
    assert.match(variableServiceSource, /STATA_IDENTIFIER_BODY/);
    assert.match(completionProviderSource, /editor\.action\.triggerSuggest/);
    assert.match(completionProviderSource, /hasPinyinQuery/);
    assert.match(completionProviderSource, /hasHanVariable/);
    assert.match(completionProviderSource, /}, 25\);/);
    assert.match(consolePanelSource, /function isAutocompleteWordCharacter/);
    assert.match(dataViewerPanelSource, /function isFilterWordCharacter/);
    assert.match(completionProviderSource, /description: 'Variable'/);
    assert.match(completionProviderSource, /detail: candidate\.labelDetail/);
    assert.match(completionProviderSource, /if \(!matches\.length\) \{/);
    assert.match(completionProviderSource, /executeCommand\('hideSuggestWidget'\);/);
});
