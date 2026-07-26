const test = require('node:test');
const assert = require('node:assert/strict');

const {
    calculateWindowReplacement,
    createHistoryPage,
    createTailHistoryPage
} = require('../modules/runCode/embeddedConsole/historyWindow');

test('creates bounded history pages without truncating the source history', () => {
    const history = Array.from({ length: 50000 }, (_, index) => ({ index }));
    const tail = createTailHistoryPage(history, 1200);
    const earlier = createHistoryPage(history, tail.start - 600, 600);

    assert.equal(history.length, 50000);
    assert.equal(tail.start, 48800);
    assert.equal(tail.end, 50000);
    assert.equal(tail.entries[0].index, 48800);
    assert.equal(tail.entries.at(-1).index, 49999);
    assert.equal(earlier.start, 48200);
    assert.equal(earlier.entries.at(-1).index, 48799);
});

test('maps a canonical history replacement onto the visible window overlap', () => {
    const replacementEntries = Array.from({ length: 20 }, (_, index) => ({
        linked: index
    }));
    const replacement = calculateWindowReplacement(
        100,
        30,
        90,
        20,
        replacementEntries
    );

    assert.deepEqual(replacement, {
        localStart: 0,
        deleteCount: 10,
        entries: replacementEntries.slice(10, 20)
    });
    assert.equal(calculateWindowReplacement(100, 30, 0, 50, replacementEntries), null);
});
