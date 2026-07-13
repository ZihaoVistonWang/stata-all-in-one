const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseNumericVersion,
    sortStataCandidates
} = require('../modules/runCode/stataDiscovery');

test('numeric version is the primary Stata candidate sort key', () => {
    const sorted = sortStataCandidates([
        { version: 17, edition: 'mp', executablePath: 'Stata17-MP' },
        { version: 18, edition: 'se', executablePath: 'Stata18-SE' }
    ]);
    assert.equal(sorted[0].executablePath, 'Stata18-SE');
});

test('edition priority breaks ties within the same Stata version', () => {
    const sorted = sortStataCandidates([
        { version: 18, edition: null, executablePath: 'Stata18' },
        { version: 18, edition: 'ic', executablePath: 'Stata18-IC' },
        { version: 18, edition: 'be', executablePath: 'Stata18-BE' },
        { version: 18, edition: 'se', executablePath: 'Stata18-SE' },
        { version: 18, edition: 'mp', executablePath: 'Stata18-MP' }
    ]);
    assert.deepEqual(sorted.map(item => item.edition), ['mp', 'se', 'be', 'ic', null]);
});

test('numeric version parser supports StataNow names and parent folders', () => {
    assert.equal(parseNumericVersion('StataNow19'), 19);
    assert.equal(parseNumericVersion('StataMP', 'Stata18'), 18);
    assert.equal(parseNumericVersion('StataMP'), null);
});
