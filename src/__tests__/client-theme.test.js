const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { connectClientTheme } = require('../modules/runCode/embeddedConsole/clientTheme');
const { ROLE_SCOPES } = require('../modules/runCode/embeddedConsole/themeProtocol');

function fixture(initialThemeId = 'Client A') {
    const events = {}, observers = [], tasks = [], requests = [];
    const style = () => ({ setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } });
    const element = { dataset: { stataScopes: JSON.stringify(ROLE_SCOPES.string) },
        classList: { contains: value => value === 'tok-string' }, style: style() };
    const document = { body: { dataset: { vscodeThemeId: initialThemeId } },
        documentElement: { style: style() }, querySelectorAll: () => [element] };
    vm.runInNewContext(`(${connectClientTheme.toString()})(vscode, roleScopes)`, {
        document,
        window: { addEventListener: (name, fn) => { events[name] = fn; } },
        vscode: { postMessage: message => requests.push(message) }, roleScopes: ROLE_SCOPES,
        getComputedStyle: () => ({ getPropertyValue: () => '#FFFFFF' }),
        setTimeout: fn => { tasks.push(fn); return tasks.length; }, clearTimeout() {},
        MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} disconnect() {} }
    });
    const flush = () => { while (tasks.length) tasks.shift()(); };
    flush();
    return {
        element, document, requests, flush,
        switchTheme(themeId) { document.body.dataset.vscodeThemeId = themeId; observers[0](); flush(); },
        invalidate() { events.message({ data: { type: 'invalidateClientTheme' } }); flush(); },
        reply(request, color) {
            events.message({ data: { type: 'clientThemeColors', requestId: request.requestId, themeId: request.themeId,
                colors: Object.fromEntries(request.scopes.map(scopes => [JSON.stringify(scopes), { color }])) } });
            flush();
        }
    };
}

test('existing Console tokens and Data Viewer role variables follow the client theme', () => {
    const f = fixture();
    f.reply(f.requests[0], '#112233');
    assert.equal(f.element.style.color, '#112233');
    assert.equal(f.document.documentElement.style['--stata-string'], '#112233');
    f.switchTheme('Client B');
    assert.equal(f.element.style.color, undefined);
    f.reply(f.requests.at(-1), '#AABBCC');
    assert.equal(f.element.style.color, '#AABBCC');
    assert.equal(f.document.documentElement.style['--stata-string'], '#AABBCC');
});

test('a delayed response from the previous theme cannot overwrite a new theme', () => {
    const f = fixture();
    const old = f.requests[0];
    f.switchTheme('Client B');
    const current = f.requests.at(-1);
    f.reply(current, '#AABBCC');
    f.reply(old, '#112233');
    assert.equal(f.element.style.color, '#AABBCC');
});

test('same-name theme customization invalidates colors and a reloaded view queries its own theme', () => {
    const f = fixture();
    const old = f.requests[0];
    f.reply(old, '#112233');
    f.invalidate();
    const updated = f.requests.at(-1);
    assert.equal(updated.themeId, old.themeId);
    assert.notEqual(updated.requestId, old.requestId);
    f.reply(updated, '#445566');
    assert.equal(f.element.style.color, '#445566');
    const reloaded = fixture('Client B');
    assert.equal(reloaded.element.style.color, undefined);
    assert.equal(reloaded.requests[0].themeId, 'Client B');
});
