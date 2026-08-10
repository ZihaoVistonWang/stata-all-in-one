const test = require('node:test');
const assert = require('node:assert/strict');

const { PrimaryEchoGrouper } = require('../modules/runCode/embeddedConsole/echoGrouping');

function entry(kind, text = '') {
    return {
        kind,
        segments: text ? [{ text }] : []
    };
}

function outputTexts(entries) {
    return entries.map(item => item.segments.map(segment => segment.text).join(''));
}

test('attaches an ordinary Stata comment echo to the following command across chunks', () => {
    const grouper = new PrimaryEchoGrouper();

    const firstChunk = grouper.push([
        entry('comment-command', '. * URL test'),
        entry('default')
    ]);

    const secondChunk = grouper.push([
        entry('command', '. use https://example.com/data, clear'),
        entry('note', '(result)')
    ]);

    assert.deepEqual(outputTexts([...firstChunk, ...secondChunk]), [
        '. * URL test',
        '. use https://example.com/data, clear',
        '(result)'
    ]);
});

test('keeps Section markers visible and attached to their first command', () => {
    const grouper = new PrimaryEchoGrouper();
    const grouped = grouper.push([
        entry('comment-command', '. **# External App request A'),
        entry('blank'),
        entry('command', '. display "START"'),
        entry('default', 'START')
    ]);

    assert.deepEqual(outputTexts(grouped), [
        '. **# External App request A',
        '. display "START"',
        'START'
    ]);
});

test('flushes a comment-only submission instead of losing it', () => {
    const grouper = new PrimaryEchoGrouper();
    const visible = grouper.push([entry('comment-command', '. * comment only'), entry('blank')]);

    assert.deepEqual(outputTexts(visible), ['. * comment only']);
    assert.deepEqual(grouper.flush(), []);
});
