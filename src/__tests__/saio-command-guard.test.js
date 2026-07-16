const test = require('node:test');
const assert = require('node:assert/strict');

const { containsSaioCommand } = require('../modules/runCode/saioCommandGuard');

test('blocks saio commands submitted from VS Code', () => {
    assert.equal(containsSaioCommand('saio'), true);
    assert.equal(containsSaioCommand('saio setup'), true);
    assert.equal(containsSaioCommand('SAIO status, port(16886)'), true);
    assert.equal(containsSaioCommand('quietly saio version'), true);
    assert.equal(containsSaioCommand('capture noisily saio setup, force'), true);
    assert.equal(containsSaioCommand('cap noi saio setup, force'), true);
    assert.equal(containsSaioCommand('saio;'), true);
    assert.equal(containsSaioCommand('summarize\nsaio setup'), true);
});

test('does not block comments, strings, or unrelated commands', () => {
    assert.equal(containsSaioCommand('* saio setup'), false);
    assert.equal(containsSaioCommand('// saio setup'), false);
    assert.equal(containsSaioCommand('/* saio setup */\nsummarize'), false);
    assert.equal(containsSaioCommand('display "saio setup"'), false);
    assert.equal(containsSaioCommand('saiostatus'), false);
});
