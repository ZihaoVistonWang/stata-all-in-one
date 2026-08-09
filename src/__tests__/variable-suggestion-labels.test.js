const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
    if (request === 'vscode') {
        return {
            window: { activeTextEditor: null },
            workspace: { textDocuments: [] }
        };
    }
    if (request.endsWith('/runCode/embeddedConsole/session')) {
        return { getActiveSession: () => null };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const variableSuggestions = require('../modules/variableSuggestionService');
Module._load = originalLoad;

test('parses variable names and labels from marked Mata metadata', () => {
    assert.deepStrictEqual(
        variableSuggestions.parseMataVariableMetadata([
            'mata:',
            '__SAIO_VAR_META_BEGIN__price\u001f汽车价格__SAIO_VAR_META_END__',
            '__SAIO_VAR_META_BEGIN__formula_result\u001f这是公式',
            '> 计算结果__SAIO_VAR_META_END__'
        ].join('\n')),
        [
            { name: 'price', variableLabel: '汽车价格' },
            { name: 'formula_result', variableLabel: '这是公式计算结果' }
        ]
    );
});

test('merges duplicate variables while preserving a discovered label', () => {
    assert.deepStrictEqual(
        variableSuggestions.mergeVariableEntries(
            ['price', 'weight'],
            [{ name: 'PRICE', label: '汽车价格' }]
        ),
        [
            { name: 'price', variableLabel: '汽车价格' },
            { name: 'weight', variableLabel: '' }
        ]
    );
});
