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
        // The two guides are identical mirrors (domestic / overseas), so the
        // prompt must ask for a parallel fetch and take whichever answers first
        // instead of visiting only one or waiting on the slower one.
        assert.match(prompt, /same time, in parallel|同时并发/);
        assert.match(prompt, /responds first|先返回/);
        assert.doesNotMatch(prompt, /extension-folder|stata-all-in-one.*skill|skill\/SKILL\.md/i);
    }
});
