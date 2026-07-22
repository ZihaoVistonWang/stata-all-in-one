const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('AI installation prompts use both online guides and defer to installation.md and SKILL.md', () => {
    const common = read('src/utils/common.js');
    const prompts = [...common.matchAll(/aiSkillWelcomePrompt: '((?:\\'|[^'])*)'/g)].map((match) => match[1]);

    assert.equal(prompts.length, 2);
    for (const prompt of prompts) {
        assert.match(prompt, /raw\.giteeusercontent\.com\/ZihaoVistonWang\/Stata-AI-Skill\/raw\/main\/guide\/installation\.md/);
        assert.match(prompt, /raw\.githubusercontent\.com\/ZihaoVistonWang\/Stata-AI-Skill\/refs\/heads\/main\/guide\/installation\.md/);
        assert.match(prompt, /installation\.md/);
        assert.match(prompt, /SKILL\.md/);
        assert.doesNotMatch(prompt, /extension-folder|stata-all-in-one.*skill|skill\/SKILL\.md/i);
    }
});
