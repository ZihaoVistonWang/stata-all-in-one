const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('bundled Stata AI Skill components are aligned on v1.1 and port 19522', () => {
    const skill = read('skill/SKILL.md');
    const ado = read('skill/stata/aiskill/aiskill.ado');
    const help = read('skill/stata/aiskill/aiskill.sthlp');
    const pkg = read('skill/stata/aiskill/aiskill.pkg');

    assert.match(skill, /^version: v1\.1$/m);
    assert.match(ado, /^\*! version v1\.1 /);
    assert.match(ado, /local client_version "v1\.1"/);
    assert.match(help, /version v1\.1/);
    assert.match(pkg, /^d Version: v1\.1$/m);
    assert.match(skill, /127\.0\.0\.1:19522/);
    assert.match(ado, /127\.0\.0\.1:19522/);

    for (const content of [skill, ado, help, pkg]) {
        assert.doesNotMatch(content, /\bsaio\b/i);
        assert.doesNotMatch(content, /\b1688[6-9]\b|\b1689[0-5]\b/);
    }
});

test('AI installation prompts defer to the bundled Skill workflow and preserve the port boundary', () => {
    const common = read('src/utils/common.js');
    const prompts = [...common.matchAll(/aiSkillWelcomePrompt: '((?:\\'|[^'])*)'/g)].map((match) => match[1]);

    assert.equal(prompts.length, 2);
    for (const prompt of prompts) {
        assert.match(prompt, /skill\/SKILL\.md/);
        assert.match(prompt, /127\.0\.0\.1:19522/);
        assert.match(prompt, /setup\.phase/);
        assert.doesNotMatch(prompt, /\b1688[6-9]\b|\b1689[0-5]\b/);
    }
});
