const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const textmate = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');
const { StataTerminalRenderer, getWebviewThemeVariables } = require('../modules/runCode/embeddedConsole/renderer');
const { prewarmConsoleTextmateTokenizer } = require('../modules/runCode/embeddedConsole/textmateTokenizer');
const { resolveClientTheme, parseThemeFile } = require('../modules/runCode/embeddedConsole/themeResolver');
const { ROLE_SCOPES } = require('../modules/runCode/embeddedConsole/themeProtocol');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saio-client-theme-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const themePath = path.join(root, 'theme.json');
const lightPath = path.join(root, 'light.json');
const theme = {
    colors: { 'editor.foreground': '#F8F8F2' },
    tokenColors: [
        { scope: 'keyword', settings: { foreground: '#FF79C6' } },
        { scope: 'string', settings: { foreground: '#F1FA8C' } },
        { scope: 'constant.numeric', settings: { foreground: '#BD93F9' } },
        { scope: 'source.stata string.quoted.double.stata punctuation.definition.string.begin.stata', settings: { foreground: '#00FF00' } }
    ]
};
function fixture(overrides = {}) {
    fs.writeFileSync(themePath, JSON.stringify(theme));
    fs.writeFileSync(lightPath, JSON.stringify({ colors: { 'editor.foreground': '#000000' },
        tokenColors: [{ scope: 'string', settings: { foreground: '#A31515' } }] }));
    return {
        extensions: { all: [{ extensionPath: root, packageJSON: { contributes: { themes: [
            { label: 'Client Dark', path: './theme.json' }, { label: 'Client Light', path: './light.json' }
        ] } } }] },
        workspace: { getConfiguration: section => ({ get: (key, fallback) => {
            if (key === 'colorTheme') return 'Client Dark';
            return overrides[section + '.' + key] || fallback;
        } }) },
        window: { activeColorTheme: { kind: 2 } }, ColorThemeKind: { Light: 1 }
    };
}
const key = scopes => JSON.stringify(scopes);

test('the backend emits scopes and semantic placeholders, never literal theme colors', async () => {
    await prewarmConsoleTextmateTokenizer();
    const segments = new StataTerminalRenderer().renderCommandSegments('display "hello" 123', 1)[0].segments;
    assert.ok(segments.some(segment => segment.tokenType === 'string' && segment.scopes.includes('string.quoted.double.stata')));
    assert.ok(segments.some(segment => segment.tokenType === 'number'));
    assert.ok(segments.every(segment => segment.style.color === null));
    const vars = getWebviewThemeVariables();
    assert.ok(Object.values(vars).every(value => !/ansi|#[0-9a-f]/i.test(value)));
});

test('client theme id overrides a stale configured theme and preserves legitimate black', async () => {
    const vscode = fixture();
    const result = await resolveClientTheme({ themeId: 'Client Light', scopes: [ROLE_SCOPES.string, ROLE_SCOPES.variable] }, vscode);
    assert.equal(result.colors[key(ROLE_SCOPES.string)].color, '#A31515');
    assert.equal(result.colors[key(ROLE_SCOPES.variable)].color, '#000000');
});

test('scope stacks use the same TextMate resolution as editor tokenization', async () => {
    const vscode = fixture();
    const registry = new textmate.Registry({
        theme: { settings: [{ settings: { foreground: '#F8F8F2' } }, ...theme.tokenColors] },
        onigLib: Promise.resolve({ createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
            createOnigString: value => new oniguruma.OnigString(value) }),
        loadGrammar: async () => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../grammars/stata.json'), 'utf8'))
    });
    // Loading the UI resolver first also initializes the actual Oniguruma WASM.
    await resolveClientTheme({ themeId: 'Client Dark', scopes: [ROLE_SCOPES.string] }, vscode);
    const grammar = await registry.loadGrammar('source.stata');
    const line = 'display "hello" 123';
    const scopeTokens = grammar.tokenizeLine(line, null).tokens;
    const colorTokens = grammar.tokenizeLine2(line, null).tokens;
    const result = await resolveClientTheme({ themeId: 'Client Dark', scopes: scopeTokens.map(token => token.scopes) }, vscode);
    const colorMap = registry.getColorMap();
    for (const token of scopeTokens) {
        let index = 0;
        while (index + 2 < colorTokens.length && colorTokens[index + 2] <= token.startIndex) index += 2;
        const expected = colorMap[(colorTokens[index + 1] >>> 15) & 511];
        assert.equal(result.colors[key(token.scopes)].color, expected, token.scopes.join(' '));
    }
    registry.dispose();
});

test('JSONC includes, trailing commas and scoped client customizations are respected', async () => {
    const vscode = fixture({ 'editor.tokenColorCustomizations': {
        '[Client Dark]': { textMateRules: [{ scope: 'string', settings: { foreground: '#112233', fontStyle: 'italic' } }] }
    } });
    fs.writeFileSync(themePath, '{ // inherited theme\n "include":"light.json", "colors": {"editor.foreground":"#EFEFEF",}, }');
    assert.equal(parseThemeFile(themePath).colors['editor.foreground'], '#EFEFEF');
    const result = await resolveClientTheme({ themeId: 'Client Dark', scopes: [ROLE_SCOPES.string] }, vscode);
    assert.equal(result.colors[key(ROLE_SCOPES.string)].color, '#112233');
    assert.equal(result.colors[key(ROLE_SCOPES.string)].italic, true);
});

test('concurrent requests from old and new themes cannot contaminate the theme cache', async () => {
    const vscode = fixture();
    const [dark, light] = await Promise.all([
        resolveClientTheme({ themeId: 'Client Dark', scopes: [ROLE_SCOPES.string] }, vscode),
        resolveClientTheme({ themeId: 'Client Light', scopes: [ROLE_SCOPES.string] }, vscode)
    ]);
    assert.equal(dark.colors[key(ROLE_SCOPES.string)].color, '#F1FA8C');
    assert.equal(light.colors[key(ROLE_SCOPES.string)].color, '#A31515');
});

test('a changed theme file is reread after reload instead of restoring old colors', async () => {
    const vscode = fixture();
    const before = await resolveClientTheme({ themeId: 'Client Dark', scopes: [ROLE_SCOPES.string] }, vscode);
    fs.writeFileSync(themePath, JSON.stringify({ tokenColors: [{ scope: 'string', settings: { foreground: '#445566' } }] }));
    const after = await resolveClientTheme({ themeId: 'Client Dark', scopes: [ROLE_SCOPES.string] }, vscode);
    assert.notEqual(before.signature, after.signature);
    assert.equal(after.colors[key(ROLE_SCOPES.string)].color, '#445566');
});

test('an unavailable client theme is explicit; it does not return a guessed terminal palette', async () => {
    await assert.rejects(resolveClientTheme({ themeId: 'Missing Client Theme', scopes: [ROLE_SCOPES.string] }, fixture()), /cannot locate theme/);
});

test('a remote exported snapshot uses effective client rules without reading or reapplying remote settings', async () => {
    const vscode = fixture({ 'editor.tokenColorCustomizations': { strings: '#BADBAD' } });
    vscode.extensions = { get all() { throw new Error('Remote host must not locate local theme files'); } };
    const result = await resolveClientTheme({ themeId: 'Client Export', scopes: [ROLE_SCOPES.string] }, vscode, {
        themeId: 'Client Export', colors: { 'editor.foreground': '#FFFFFF' },
        tokenColors: [{ scope: 'string', settings: { foreground: '#123456', fontStyle: 'italic' } }]
    });
    assert.equal(result.colors[key(ROLE_SCOPES.string)].color, '#123456');
    assert.equal(result.colors[key(ROLE_SCOPES.string)].italic, true);
});

test('generic identifiers retain their original scope instead of inventing an editor variable color', async () => {
    await prewarmConsoleTextmateTokenizer();
    const segments = new StataTerminalRenderer().renderCommandSegments('regress price mpg', 1)[0].segments;
    const price = segments.find(segment => segment.text === 'price');
    assert.ok(price && Array.isArray(price.scopes));
    const vscode = fixture({ 'editor.tokenColorCustomizations': { variables: '#ABCDEF' } });
    const result = await resolveClientTheme({ themeId: 'Client Dark', scopes: [price.scopes] }, vscode);
    // Stata's grammar leaves ordinary variable references in source.stata.
    assert.equal(result.colors[key(price.scopes)].color, '#F8F8F2');
});
