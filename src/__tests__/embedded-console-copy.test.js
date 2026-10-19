const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getConsoleRunText } = require('../modules/runCode/embeddedConsole/consoleHistory');

const line = (kind, text = '') => ({ kind, segments: [{ text }] });

test('copies only the requested completed run and preserves plain-text tables and errors', () => {
    const history = [
        line('command', '. display 1'), line('default', '1'), line('footer', 'Worked for 0.1s'),
        line('blank'),
        { kind: 'submission', code: 'summarize 价格\ndisplay "<text>"' },
        line('command', '. summarize 价格'),
        { kind: 'default', segments: [{ text: '  价格 |' }, { text: '  74   6165.26' }] },
        line('blank'), line('comment-command', '. * 注释'),
        line('command', '. display "<text>"'), line('default', '<text> & 中文'),
        line('error', 'r(198);'),
        { kind: 'graph', filePath: '/tmp/chart.svg', svgText: '<svg/>' },
        line('blank'), line('footer', 'Worked for 0.2s'),
        line('command', '. display 3'), line('default', '3')
    ];
    const result = '  价格 |  74   6165.26\n\n<text> & 中文\nr(198);';
    assert.equal(getConsoleRunText(history, 14), result);
    assert.equal(getConsoleRunText(history, 14, true), '. summarize 价格\n  价格 |  74   6165.26\n\n. * 注释\n. display "<text>"\n<text> & 中文\nr(198);');
    assert.equal(getConsoleRunText(history, 2), '1');
    assert.equal(getConsoleRunText(history, 2, true), '. display 1\n1');
});

test('copies complete runs beyond the rendered history window', () => {
    const history = [
        { kind: 'submission', code: 'list' },
        ...Array.from({ length: 5000 }, (_, i) => line('default', 'row ' + i)),
        line('footer', 'Worked for 1s')
    ];
    const text = getConsoleRunText(history, 5001);
    assert.equal(text.split('\n').length, 5000);
    assert.ok(text.startsWith('row 0\n'));
    assert.ok(text.endsWith('\nrow 4999'));
});

test('handles empty results and rejects incomplete or invalid run targets', () => {
    const history = [{ kind: 'submission', code: 'generate x = 1' }, line('footer', 'Worked for 0s')];
    assert.equal(getConsoleRunText(history, 1), '');
    assert.equal(getConsoleRunText(history, 1, true), '. generate x = 1');
    for (const index of [-1, 0, 2, 1.5, '1', NaN]) {
        assert.equal(getConsoleRunText(history, index), null);
    }
    assert.equal(getConsoleRunText(null, 1), null);
});

test('keeps legacy command echoes in order only when code is requested', () => {
    const history = [
        line('command', '. display 1'), line('default', '1'),
        line('comment-command', '. * 注释'),
        line('command', '. display 2'), line('default', '2'),
        line('footer', 'Worked for 0s')
    ];
    assert.equal(getConsoleRunText(history, 5), '1\n2');
    assert.equal(getConsoleRunText(history, 5, true), '. display 1\n1\n. * 注释\n. display 2\n2');
});

test('preserves echoed dots, continuation prompts, and numbered do-file lines without duplicating submission', () => {
    const history = [
        { kind: 'submission', code: 'total price ///\n    if foreign == 1' },
        line('command', '. total price ///'),
        line('command', '>     if foreign == 1'),
        line('default', 'Total = 140000'),
        line('command', '  2. display 1'),
        line('default', '1'),
        line('raw-prompt', '>'),
        line('footer', 'Worked for 0s')
    ];
    assert.equal(getConsoleRunText(history, 7, true), '. total price ///\n>     if foreign == 1\nTotal = 140000\n  2. display 1\n1\n>');
    assert.equal(getConsoleRunText(history, 7), 'Total = 140000\n1');
});

test('adds command prompts when only the original submission is available', () => {
    const history = [
        { kind: 'submission', code: 'total price ///\r\n    if foreign == 1' },
        line('default', 'Total = 140000'), line('footer', 'Worked for 0s')
    ];
    assert.equal(getConsoleRunText(history, 2, true), '. total price ///\n>     if foreign == 1\nTotal = 140000');
});

for (const language of ['zh', 'en']) {
test(`copy actions localize captions and tooltips and preserve run boundaries (${language})`, () => {
    const source = fs.readFileSync(path.join(__dirname, '../modules/runCode/embeddedConsole/panel.js'), 'utf8');
    const commonSource = fs.readFileSync(path.join(__dirname, '../utils/common.js'), 'utf8');
    const uiText = new Function(commonSource.slice(commonSource.indexOf('const UI_TEXT ='), commonSource.indexOf('const getUserLanguage =')) + '\nreturn UI_TEXT;')()[language];
    const body = source.slice(source.indexOf('        function showRunCopyTooltip('), source.indexOf('        function updateResultScrollHints('))
        .replace(/\$\{JSON\.stringify\(msg\('([^']+)'\)\)\}/g, (_match, key) => JSON.stringify(uiText[key]));
    const messages = [];
    const document = {
        createElement: () => ({
            children: [], attributes: {}, listeners: {},
            appendChild(child) { this.children.push(child); },
            setAttribute(name, value) { this.attributes[name] = value; },
            getAttribute(name) { return this.attributes[name]; },
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            addEventListener(name, callback) { this.listeners[name] = callback; }
        })
    };
    document.createElementNS = (_namespace, tag) => ({ ...document.createElement(), tag });
    const tooltip = { hidden: true, style: {}, getBoundingClientRect: () => ({ width: 200, height: 28 }) };
    const createActions = new Function('document', 'vscode', 'historyRevision', 'runCopyTooltip', 'window', body + '\nreturn createRunCopyActions;')(
        document, { postMessage: message => messages.push(message) }, 7, tooltip, { innerWidth: 320 }
    );
    const actions = createActions(5001);
    assert.equal(actions.children.length, 2);
    actions.children.forEach((button, index) => {
        assert.equal(button.type, 'button');
        const expectedTooltips = language === 'zh'
            ? ['复制本次运行的结果', '复制本次运行的代码和结果']
            : ['Copy results from this run', 'Copy code and results from this run'];
        const expectedCaptions = language === 'zh' ? ['结果', '代码＋结果'] : ['Results', 'Code + Results'];
        assert.equal(button.attributes['aria-label'], expectedTooltips[index]);
        assert.equal(button.children[1].textContent, expectedCaptions[index]);
        assert.equal(button.attributes['aria-describedby'], 'run-copy-tooltip');
        assert.equal(button.children[0].tag, 'svg');
        assert.ok(button.children[0].children[0].attributes.d.length > 0);
        assert.equal(typeof button.listeners.pointerenter, 'function');
        assert.equal(typeof button.listeners.focus, 'function');
        button.listeners.pointerenter();
        assert.equal(tooltip.hidden, false);
        assert.equal(tooltip.textContent, button.attributes['aria-label']);
        assert.equal(tooltip.style.left, '100px');
        assert.equal(tooltip.style.top, '66px');
        button.listeners.pointerleave();
        assert.equal(tooltip.hidden, true);
        button.listeners.focus();
        assert.equal(tooltip.hidden, false);
        button.listeners.blur();
        assert.equal(tooltip.hidden, true);
        button.listeners.click();
    });
    assert.deepEqual(messages, [false, true].map(includeCode => ({
        type: 'copyConsoleRun', historyRevision: 7, footerIndex: 5001, includeCode
    })));
});
}
