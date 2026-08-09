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

test('keeps Unicode names through discovery and all three input surfaces', () => {
    assert.match(variableServiceSource, /isStataIdentifier\(name\)/);
    assert.match(variableServiceSource, /STATA_IDENTIFIER_BODY/);
    assert.match(completionProviderSource, /editor\.action\.triggerSuggest/);
    assert.match(consolePanelSource, /function isAutocompleteWordCharacter/);
    assert.match(dataViewerPanelSource, /function isFilterWordCharacter/);
});
