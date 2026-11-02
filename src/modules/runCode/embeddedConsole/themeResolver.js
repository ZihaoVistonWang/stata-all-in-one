/** Resolve syntax scopes against a local theme or a client-exported snapshot. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jsonc = require('jsonc-parser');
const textmate = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');

let wasmReady;
let cachedSignature = '';
const cachedColors = new Map();
let resolutionQueue = Promise.resolve();

function parseThemeFile(file, visited = new Set()) {
    if (visited.has(file)) return { colors: {}, tokenColors: [] };
    visited.add(file);
    const source = fs.readFileSync(file, 'utf8');
    let data;
    if (/\.jsonc?$/i.test(file)) {
        const errors = [];
        data = jsonc.parse(source, errors, { allowTrailingComma: true });
        if (errors.length || !data || typeof data !== 'object') throw new Error(`Invalid theme: ${file}`);
    } else {
        data = textmate.parseRawGrammar(source, file);
    }
    const parent = data.include
        ? parseThemeFile(path.resolve(path.dirname(file), data.include), visited)
        : { colors: {}, tokenColors: [] };
    const tokens = typeof data.tokenColors === 'string'
        ? parseThemeFile(path.resolve(path.dirname(file), data.tokenColors), visited).tokenColors
        : data.tokenColors || data.settings || [];
    return {
        colors: { ...parent.colors, ...data.colors },
        tokenColors: [...parent.tokenColors, ...(Array.isArray(tokens) ? tokens : [])]
    };
}

function themeOverride(settings, name) {
    const result = { ...settings };
    for (const [selector, value] of Object.entries(settings || {})) {
        if (!selector.startsWith('[') || !value || typeof value !== 'object') continue;
        const matches = [...selector.matchAll(/\[([^\]]+)\]/g)].some(([, pattern]) => {
            const regex = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
            return new RegExp(`^${regex}$`).test(name);
        });
        if (matches) Object.assign(result, value);
    }
    return result;
}

function readClientTheme(vscode, requestedId) {
    const themeId = requestedId || vscode.workspace.getConfiguration('workbench').get('colorTheme');
    for (const extension of vscode.extensions.all) {
        const themes = extension.packageJSON && extension.packageJSON.contributes && extension.packageJSON.contributes.themes;
        const selected = Array.isArray(themes) && themes.find(theme =>
            [theme.id, theme.label, `Default ${theme.id}`, `Default ${theme.label}`].includes(themeId));
        if (!selected || !selected.path) continue;
        const data = parseThemeFile(path.resolve(extension.extensionPath, selected.path));
        const editor = vscode.workspace.getConfiguration('editor', { languageId: 'stata' });
        const overrides = themeOverride(editor.get('tokenColorCustomizations', {}), themeId);
        const buckets = { comments: 'comment', strings: 'string', numbers: 'constant.numeric', keywords: 'keyword',
            types: 'storage.type', functions: 'entity.name.function, support.function', variables: 'variable' };
        for (const [key, scope] of Object.entries(buckets)) {
            const settings = overrides[key];
            if (settings) data.tokenColors.push({ scope, settings: typeof settings === 'string' ? { foreground: settings } : settings });
        }
        if (Array.isArray(overrides.textMateRules)) data.tokenColors.push(...overrides.textMateRules);
        const colors = themeOverride(vscode.workspace.getConfiguration('workbench').get('colorCustomizations', {}), themeId);
        Object.assign(data.colors, colors);
        return { themeId, ...data };
    }
    throw new Error(`The UI extension host cannot locate theme '${themeId}'.`);
}

function validScopes(input) {
    return Array.isArray(input) && input.length > 0 && input.length <= 32
        && input.every(scope => typeof scope === 'string' && /^[\w.-]{1,160}$/.test(scope))
        && input[0] === 'source.stata';
}

function hexColor(value) {
    if (typeof value !== 'string') return null;
    if (/^#[0-9a-f]{6}$/i.test(value)) return value;
    if (/^#[0-9a-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(c => c + c).join('');
    const rgb = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    return rgb ? '#' + rgb.slice(1).map(n => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('') : null;
}

async function resolveClientThemeNow(request, vscode, snapshot) {
    const theme = snapshot || readClientTheme(vscode, request.themeId);
    const defaultForeground = hexColor(request.foreground) || hexColor(theme.colors['editor.foreground'])
        || (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? '#000000' : '#D4D4D4');
    const settings = [{ settings: { foreground: defaultForeground } }, ...theme.tokenColors];
    const signature = crypto.createHash('sha256').update(JSON.stringify([theme.themeId, settings])).digest('hex');
    if (signature !== cachedSignature) {
        cachedSignature = signature;
        cachedColors.clear();
    }
    if (cachedColors.size > 4096) cachedColors.clear();
    const requested = (Array.isArray(request.scopes) ? request.scopes : []).slice(0, 128).filter(validScopes);
    const missing = requested.filter(scopes => !cachedColors.has(JSON.stringify(scopes)));
    if (missing.length) {
        if (!wasmReady) {
            const buffer = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
            wasmReady = oniguruma.loadWASM(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
        }
        await wasmReady;
        const registry = new textmate.Registry({
            theme: { settings },
            onigLib: Promise.resolve({ createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
                createOnigString: value => new oniguruma.OnigString(value) }),
            // TextMate permits space-separated names and pushes each as a scope.
            // This evaluates the ORIGINAL scope stack, with its parent selectors,
            // using the same theme engine as the editor. No user regex is run.
            loadGrammar: async () => ({ scopeName: 'source.stata', patterns: missing.map((scopes, index) => ({
                match: `^${index}$`, name: scopes.slice(1).join(' ')
            })) })
        });
        try {
            const grammar = await registry.loadGrammar('source.stata');
            const colors = registry.getColorMap();
            missing.forEach((scopes, index) => {
                const result = grammar.tokenizeLine2(String(index), null);
                const metadata = result.tokens[1];
                const fontStyle = (metadata >>> 11) & 15;
                cachedColors.set(JSON.stringify(scopes), {
                    color: colors[(metadata >>> 15) & 511] || defaultForeground,
                    italic: Boolean(fontStyle & 1), bold: Boolean(fontStyle & 2), underline: Boolean(fontStyle & 4)
                });
            });
        } finally { registry.dispose(); }
    }
    return {
        themeId: theme.themeId, signature,
        colors: Object.fromEntries(requested.map(scopes => [JSON.stringify(scopes), cachedColors.get(JSON.stringify(scopes))]))
    };
}

function resolveClientTheme(request, vscode = require('vscode'), snapshot) {
    const result = resolutionQueue.then(() => resolveClientThemeNow(request, vscode, snapshot));
    resolutionQueue = result.catch(() => {});
    return result;
}

module.exports = { resolveClientTheme, readClientTheme, parseThemeFile, themeOverride };
