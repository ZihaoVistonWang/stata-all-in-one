const test = require('node:test');
const assert = require('node:assert/strict');

const {
    RUN_TARGETS,
    getAttachedCommentRunRange,
    getStandaloneCommentFlags,
    getInclusiveSelectionEndLine,
    getRunTarget,
    isCursorOnHeading,
    isOutlineHeadingLine,
    isSectionHeaderLine
} = require('../modules/runCode/execute/runTarget');

function createDocument(lines) {
    return {
        lineCount: lines.length,
        lineAt: index => ({ text: lines[index] })
    };
}

test('excludes the next line when a whole-line selection ends at column zero', () => {
    const selection = {
        start: { line: 2, character: 0 },
        end: { line: 3, character: 0 }
    };

    assert.equal(getInclusiveSelectionEndLine(selection), 2);
});

test('includes the final line when the selection ends within its text', () => {
    const selection = {
        start: { line: 2, character: 4 },
        end: { line: 3, character: 5 }
    };

    assert.equal(getInclusiveSelectionEndLine(selection), 3);
});

function createEditor(lineText, isEmpty = true) {
    return {
        document: {
            languageId: 'stata',
            lineAt: () => ({ text: lineText })
        },
        selection: {
            isEmpty,
            active: { line: 0 }
        }
    };
}

test('classifies a Section heading as the current Section target', () => {
    assert.equal(isSectionHeaderLine('** ## Results'), true);
    assert.equal(getRunTarget(createEditor('** ## Results')), RUN_TARGETS.section);
});

test('classifies an ordinary line as the current-line target', () => {
    assert.equal(getRunTarget(createEditor('regress y x')), RUN_TARGETS.line);
});

test('selection takes priority over the line underneath it', () => {
    assert.equal(
        getRunTarget(createEditor('** ## Results', false)),
        RUN_TARGETS.selection
    );
});

test('detects an outline heading even while its text is selected', () => {
    const editor = createEditor('**#     Results     ', false);
    assert.equal(isOutlineHeadingLine(editor.document.lineAt(0).text), true);
    assert.equal(isCursorOnHeading(editor), true);
});

test('does not treat a single-star Section marker as an outline heading', () => {
    assert.equal(isSectionHeaderLine('* # Results'), true);
    assert.equal(isOutlineHeadingLine('* # Results'), false);
});

test('attaches a contiguous comment block to the code immediately below it', () => {
    const document = createDocument([
        '* explain the model',
        '// keep this note',
        'regress y x',
        'summarize y'
    ]);

    assert.deepEqual(getAttachedCommentRunRange(document, 0), { startLine: 0, endLine: 2 });
    assert.deepEqual(getAttachedCommentRunRange(document, 1), { startLine: 0, endLine: 2 });
    assert.deepEqual(getAttachedCommentRunRange(document, 2), { startLine: 0, endLine: 2 });
});

test('does not attach a comment across a blank line', () => {
    const document = createDocument(['* separate note', '', 'regress y x']);

    assert.deepEqual(getAttachedCommentRunRange(document, 0), { startLine: 0, endLine: 0 });
    assert.deepEqual(getAttachedCommentRunRange(document, 2), { startLine: 2, endLine: 2 });
});

test('attaches a standalone block comment but not inline block-comment code', () => {
    const document = createDocument([
        '/*',
        'explain the model',
        '*/',
        'regress y x',
        '/* inline */ display 1'
    ]);

    assert.deepEqual(getStandaloneCommentFlags(document), [true, true, true, false, false]);
    assert.deepEqual(getAttachedCommentRunRange(document, 1), { startLine: 0, endLine: 3 });
    assert.deepEqual(getAttachedCommentRunRange(document, 3), { startLine: 0, endLine: 3 });
});
