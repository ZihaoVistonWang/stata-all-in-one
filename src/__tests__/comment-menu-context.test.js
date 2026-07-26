const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    getCommentStyleMenuValue
} = require('../modules/commentStyle');

const commentSource = fs.readFileSync(
    path.resolve(__dirname, '../modules/comment.js'),
    'utf8'
);

test('maps every configured comment style to a stable menu context', () => {
    assert.equal(getCommentStyleMenuValue('// '), 'slash');
    assert.equal(getCommentStyleMenuValue('* '), 'star');
    assert.equal(getCommentStyleMenuValue('/* ... */'), 'block');
});

test('refreshes the quick-comment menu when the setting changes', () => {
    assert.match(commentSource, /affectsConfiguration\('stata-all-in-one\.commentStyle'\)/);
    assert.match(commentSource, /COMMENT_STYLE_CONTEXT_KEY/);
});
