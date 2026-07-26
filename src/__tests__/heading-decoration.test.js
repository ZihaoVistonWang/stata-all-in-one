const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const separatorSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/separator.js'),
    'utf8'
);

function repeat(unit, length) {
    return Array.from({ length }, () => unit).join('');
}

function loadSeparatorModule() {
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
        if (request === 'vscode') {
            return {};
        }
        if (request === '../utils/common') {
            return {
                showInfo() {},
                showWarn() {},
                hasNonAsciiCodePoint: text => /[^\x00-\x7F]/.test(text),
                buildSeparatorSegment: repeat,
                isSeparatorLine: () => false,
                removeSeparators: title => title.replace(/^[-=*\s]+|[-=*\s]+$/g, ''),
                msg: key => key
            };
        }
        if (request === '../utils/config') {
            return {};
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    const modulePath = require.resolve('../modules/separator');
    delete require.cache[modulePath];
    try {
        return require(modulePath);
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
}

test('centers heading text with spaces without changing the outline prefix', () => {
    const { buildDecoratedHeadingLine } = loadSeparatorModule();
    const result = buildDecoratedHeadingLine('**# Results', ' ', 24, false);

    assert.equal(result.matched, true);
    assert.match(result.text, /^\*\*#\s+Results\s+$/);
    assert.equal(/^\*\*\s*#+/.test(result.text), true);
});

test('replaces existing heading decoration with the requested character', () => {
    const { buildDecoratedHeadingLine } = loadSeparatorModule();
    const result = buildDecoratedHeadingLine('**## === Results ===', '-', 30, false);

    assert.match(result.text, /^\*\*## -+ Results -+$/);
});

test('standalone separators keep the existing non-heading comment prefix', () => {
    const { buildStandaloneSeparatorLine } = loadSeparatorModule();

    assert.match(buildStandaloneSeparatorLine('-', 20, false), /^\*\* -+$/);
    assert.match(buildStandaloneSeparatorLine('=', 20, false), /^\*\* =+$/);
    assert.match(buildStandaloneSeparatorLine('*', 20, false), /^\*\* \*+$/);
});

test('custom separator cancellation does nothing and empty input means spaces', () => {
    assert.match(separatorSource, /if \(input === undefined\) \{\s*return;/);
    assert.match(separatorSource, /input\.length > 0 \? input : ' '/);
});
