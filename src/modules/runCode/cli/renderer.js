const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    fg: {
        default: '\x1b[39m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        brightBlack: '\x1b[90m',
        brightRed: '\x1b[91m',
        brightGreen: '\x1b[92m',
        brightYellow: '\x1b[93m',
        brightBlue: '\x1b[94m',
        brightMagenta: '\x1b[95m',
        brightCyan: '\x1b[96m',
        brightWhite: '\x1b[97m'
    },
    bg: {}
};

const DEFAULT_SLOT_MAP = {
    prompt: 'brightBlack',
    command: 'brightMagenta',
    keyword: 'brightCyan',
    string: 'brightYellow',
    path: 'brightYellow',
    number: 'brightGreen',
    comment: 'brightBlack',
    function: 'brightBlue',
    operator: 'cyan',
    default: 'default',
    error: 'brightRed',
    header: 'brightCyan',
    separator: 'brightBlack',
    time: 'brightCyan',
    timeValue: 'brightYellow'
};

const DEFAULT_TERMINAL_COLORS = {
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#ffffff'
};

const TOKEN_SCOPE_CANDIDATES = {
    command: ['keyword.functions.data.stata', 'keyword.functions.program.stata', 'keyword.control.flow.stata'],
    keyword: ['keyword.control.conditional.stata', 'keyword.control.flow.stata', 'keyword.other.stata', 'keyword'],
    function: ['entity.name.function.stata', 'entity.name.function', 'support.function'],
    string: ['string.quoted.double.stata', 'string.quoted.double.compound.stata', 'string.quoted.single.stata', 'string'],
    number: ['constant.numeric.stata', 'constant.numeric'],
    comment: ['comment.line.double-slash.stata', 'comment.block.stata', 'comment'],
    operator: ['keyword.operator.assignment.stata', 'keyword.operator.arithmetic.stata', 'keyword.operator.parentheses.stata', 'keyword.operator.mata', 'keyword.operator']
};

let CURRENT_THEME_SLOT_MAP = { ...DEFAULT_SLOT_MAP };

const COMMAND_KEYWORDS = new Set([
    'if', 'in', 'using', 'by', 'bysort', 'quietly', 'qui', 'capture', 'cap',
    'do', 'cd', 'global', 'local', 'replace', 'gen', 'egen', 'keep', 'drop',
    'preserve', 'restore', 'sort', 'absorb', 'vce', 'cluster', 'bs', 'reps',
    'seed', 'append', 'se', 'bdec', 'tdec', 'ctitle', 'title', 'addtext',
    'addstat', 'nocon', 'noconstant', 'noobs', 'nobreak'
]);

const OPERATOR_CHARS = new Set(['=', '!', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '~', ':', ',', '.', '(', ')', '[', ']', '{', '}']);

function paint(text, style = {}) {
    if (!text) {
        return '';
    }

    let prefix = ANSI.reset;
    if (style.bg && ANSI.bg[style.bg]) {
        prefix += ANSI.bg[style.bg];
    }
    if (style.bold) {
        prefix += ANSI.bold;
    }
    if (style.dim) {
        prefix += ANSI.dim;
    }
    if (style.italic) {
        prefix += ANSI.italic;
    }
    if (style.fg && ANSI.fg[style.fg]) {
        prefix += ANSI.fg[style.fg];
    }

    return `${prefix}${text}`;
}

function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') {
        return null;
    }

    const normalized = hex.trim().replace(/^#/, '');
    if (![3, 6, 8].includes(normalized.length)) {
        return null;
    }

    const expanded = normalized.length === 3
        ? normalized.split('').map(char => char + char).join('')
        : normalized.slice(0, 6);

    const value = Number.parseInt(expanded, 16);
    if (Number.isNaN(value)) {
        return null;
    }

    return {
        r: (value >> 16) & 0xff,
        g: (value >> 8) & 0xff,
        b: value & 0xff
    };
}

function colorDistance(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
}

function findClosestAnsiSlot(hexColor, terminalPalette) {
    const rgb = hexToRgb(hexColor);
    if (!rgb) {
        return null;
    }

    let bestSlot = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [slot, slotColor] of Object.entries(terminalPalette)) {
        const slotRgb = hexToRgb(slotColor);
        if (!slotRgb) {
            continue;
        }
        const distance = colorDistance(rgb, slotRgb);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestSlot = slot;
        }
    }

    return bestSlot;
}

function toScopeList(scope) {
    if (!scope) {
        return [];
    }
    if (Array.isArray(scope)) {
        return scope.flatMap(item => toScopeList(item));
    }
    return String(scope)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function scopeMatches(scopeValue, candidate) {
    return scopeValue === candidate || scopeValue.startsWith(`${candidate}.`) || candidate.startsWith(`${scopeValue}.`);
}

function findThemeTokenColor(themeData, candidates) {
    const tokenColors = Array.isArray(themeData.tokenColors) ? themeData.tokenColors : [];
    for (const candidate of candidates) {
        for (const rule of tokenColors) {
            const scopes = toScopeList(rule.scope);
            if (!scopes.length) {
                continue;
            }
            if (!scopes.some(scope => scopeMatches(scope, candidate))) {
                continue;
            }
            const foreground = rule.settings && rule.settings.foreground;
            if (foreground) {
                return foreground;
            }
        }
    }
    return null;
}

function buildTerminalPalette(themeData) {
    const colors = themeData.colors || {};
    return {
        black: colors['terminal.ansiBlack'] || DEFAULT_TERMINAL_COLORS.black,
        red: colors['terminal.ansiRed'] || DEFAULT_TERMINAL_COLORS.red,
        green: colors['terminal.ansiGreen'] || DEFAULT_TERMINAL_COLORS.green,
        yellow: colors['terminal.ansiYellow'] || DEFAULT_TERMINAL_COLORS.yellow,
        blue: colors['terminal.ansiBlue'] || DEFAULT_TERMINAL_COLORS.blue,
        magenta: colors['terminal.ansiMagenta'] || DEFAULT_TERMINAL_COLORS.magenta,
        cyan: colors['terminal.ansiCyan'] || DEFAULT_TERMINAL_COLORS.cyan,
        white: colors['terminal.ansiWhite'] || DEFAULT_TERMINAL_COLORS.white,
        brightBlack: colors['terminal.ansiBrightBlack'] || DEFAULT_TERMINAL_COLORS.brightBlack,
        brightRed: colors['terminal.ansiBrightRed'] || DEFAULT_TERMINAL_COLORS.brightRed,
        brightGreen: colors['terminal.ansiBrightGreen'] || DEFAULT_TERMINAL_COLORS.brightGreen,
        brightYellow: colors['terminal.ansiBrightYellow'] || DEFAULT_TERMINAL_COLORS.brightYellow,
        brightBlue: colors['terminal.ansiBrightBlue'] || DEFAULT_TERMINAL_COLORS.brightBlue,
        brightMagenta: colors['terminal.ansiBrightMagenta'] || DEFAULT_TERMINAL_COLORS.brightMagenta,
        brightCyan: colors['terminal.ansiBrightCyan'] || DEFAULT_TERMINAL_COLORS.brightCyan,
        brightWhite: colors['terminal.ansiBrightWhite'] || DEFAULT_TERMINAL_COLORS.brightWhite
    };
}

function findCurrentThemeDefinition() {
    const themeName = vscode.workspace.getConfiguration('workbench').get('colorTheme');
    if (!themeName) {
        return null;
    }

    for (const extension of vscode.extensions.all) {
        const themes = extension.packageJSON
            && extension.packageJSON.contributes
            && Array.isArray(extension.packageJSON.contributes.themes)
            ? extension.packageJSON.contributes.themes
            : [];

        const theme = themes.find(item => {
            const label = item.label;
            const id = item.id;
            return label === themeName
                || id === themeName
                || `Default ${id}` === themeName
                || `Default ${label}` === themeName;
        });
        if (theme && theme.path) {
            return {
                extensionPath: extension.extensionPath,
                themePath: path.join(extension.extensionPath, theme.path)
            };
        }
    }

    return null;
}

function loadThemeData(themePath, visited = new Set()) {
    if (!themePath || visited.has(themePath) || !fs.existsSync(themePath)) {
        return {};
    }

    visited.add(themePath);
    const themeDir = path.dirname(themePath);
    const rawTheme = fs.readFileSync(themePath, 'utf8');
    const themeData = JSON.parse(rawTheme);

    let baseTheme = {};
    if (themeData.include) {
        const includePath = path.resolve(themeDir, themeData.include);
        baseTheme = loadThemeData(includePath, visited);
    }

    return {
        ...baseTheme,
        ...themeData,
        colors: {
            ...(baseTheme.colors || {}),
            ...(themeData.colors || {})
        },
        tokenColors: [
            ...((baseTheme.tokenColors && Array.isArray(baseTheme.tokenColors)) ? baseTheme.tokenColors : []),
            ...((themeData.tokenColors && Array.isArray(themeData.tokenColors)) ? themeData.tokenColors : [])
        ]
    };
}

function resolveThemeSlotMap(themeData) {
    const terminalPalette = buildTerminalPalette(themeData);
    const colors = themeData.colors || {};
    const slotMap = { ...DEFAULT_SLOT_MAP };

    for (const [tokenType, candidates] of Object.entries(TOKEN_SCOPE_CANDIDATES)) {
        const themeColor = findThemeTokenColor(themeData, candidates);
        const nearestSlot = findClosestAnsiSlot(themeColor, terminalPalette);
        if (nearestSlot) {
            slotMap[tokenType] = nearestSlot;
        }
    }

    const promptColor = colors['editorLineNumber.foreground'] || colors['descriptionForeground'];
    slotMap.prompt = findClosestAnsiSlot(promptColor, terminalPalette) || slotMap.prompt;
    slotMap.comment = findClosestAnsiSlot(findThemeTokenColor(themeData, TOKEN_SCOPE_CANDIDATES.comment), terminalPalette) || slotMap.comment;
    slotMap.error = findClosestAnsiSlot(colors['editorError.foreground'] || colors['errorForeground'], terminalPalette) || slotMap.error;
    slotMap.header = findClosestAnsiSlot(colors['textLink.foreground'] || findThemeTokenColor(themeData, TOKEN_SCOPE_CANDIDATES.keyword), terminalPalette) || slotMap.header;
    slotMap.separator = findClosestAnsiSlot(colors['panel.border'] || colors['editorIndentGuide.background'], terminalPalette) || slotMap.separator;
    slotMap.time = findClosestAnsiSlot(colors['terminal.foreground'] || colors.foreground, terminalPalette) || slotMap.time;
    slotMap.timeValue = findClosestAnsiSlot(findThemeTokenColor(themeData, TOKEN_SCOPE_CANDIDATES.number), terminalPalette) || slotMap.timeValue;

    return slotMap;
}

function syncCliTerminalTheme() {
    try {
        const themeDefinition = findCurrentThemeDefinition();
        if (!themeDefinition || !fs.existsSync(themeDefinition.themePath)) {
            CURRENT_THEME_SLOT_MAP = { ...DEFAULT_SLOT_MAP };
            return;
        }

        const themeData = loadThemeData(themeDefinition.themePath);
        CURRENT_THEME_SLOT_MAP = resolveThemeSlotMap(themeData);
    } catch (error) {
        console.error('[renderer] Failed to sync CLI terminal theme:', error.message);
        CURRENT_THEME_SLOT_MAP = { ...DEFAULT_SLOT_MAP };
    }
}

function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
        return '0.0s';
    }

    if (durationMs < 60000) {
        return `${(durationMs / 1000).toFixed(1)}s`;
    }

    const totalSeconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
}

function getDisplayWidth(text) {
    let width = 0;
    for (const char of String(text || '')) {
        const codePoint = char.codePointAt(0);
        if (
            codePoint >= 0x1100 && (
                codePoint <= 0x115f ||
                codePoint === 0x2329 ||
                codePoint === 0x232a ||
                (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
                (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
                (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
                (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
                (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
                (codePoint >= 0xff00 && codePoint <= 0xff60) ||
                (codePoint >= 0xffe0 && codePoint <= 0xffe6)
            )
        ) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

class StataTerminalRenderer {
    constructor() {
        this._pendingLine = '';
    }

    renderCommand(command, width) {
        const normalized = String(command || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalized.split('\n');
        return lines
            .map((line, index) => this._renderCommandLine(`${index === 0 ? '. ' : '> '}${line}`, width))
            .join('\n') + '\n';
    }

    renderOutputChunk(text, width) {
        const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!normalized) {
            return '';
        }

        if (!normalized.includes('\n') && !this._pendingLine && /^[.\s>]+$/.test(normalized)) {
            return normalized;
        }

        let combined = this._pendingLine + normalized;
        const endsWithNewline = combined.endsWith('\n');
        const parts = combined.split('\n');

        if (!endsWithNewline) {
            this._pendingLine = parts.pop() || '';
        } else {
            this._pendingLine = '';
            parts.pop();
        }

        const rendered = parts.map(line => this._renderOutputLine(line, width)).join('\n');
        return rendered ? `${rendered}${endsWithNewline ? '\n' : ''}` : '';
    }

    flushPendingOutput(width) {
        if (!this._pendingLine) {
            return '';
        }

        const line = this._pendingLine;
        this._pendingLine = '';
        return this._renderOutputLine(line, width);
    }

    renderError(text) {
        const body = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
        return `${paint(`error: ${body}`, { fg: CURRENT_THEME_SLOT_MAP.error, bold: true })}\n${ANSI.reset}`;
    }

    renderBreakLine() {
        return `${paint('--break--', { fg: CURRENT_THEME_SLOT_MAP.error, bold: true })}\n${ANSI.reset}`;
    }

    renderRunFooter(durationMs, width) {
        const label = ` Worked for ${formatDuration(durationMs)} `;
        const lineWidth = Math.max(width || 72, label.length + 8);
        const left = '─ ';
        const rightWidth = Math.max(0, lineWidth - left.length - label.length);
        const separator = `${left}${label}${'─'.repeat(rightWidth)}`;
        return `\n${paint(separator, { fg: CURRENT_THEME_SLOT_MAP.separator })}\n${ANSI.reset}`;
    }

    _isSeparatorLine(line) {
        return /^\s*[-=+|]{5,}\s*$/.test(line);
    }

    _isParenNoteLine(line) {
        return /^\s*\([^)]+\)\s*$/.test(line);
    }

    _isSummaryLine(line) {
        return (line.match(/\s=\s/g) || []).length >= 1;
    }

    _isTableHeaderLine(line) {
        return (
            /\|/.test(line) && /[A-Za-z]/.test(line) && !this._isSeparatorLine(line)
        ) || /\b(Coefficient|Std\. err\.|Std\. Err\.|P>\|t\||P>\|z\||p-value|Freq|Robust|conf\. interval|Categories|Redundant|Num\. Coefs)\b/i.test(line);
    }

    _isTableDataLine(line) {
        const numberCount = (line.match(/(?<![A-Za-z_])[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?\b/gi) || []).length;
        return numberCount >= 2 && /[A-Za-z_]/.test(line) && !this._isSummaryLine(line);
    }

    _renderNoteLine(line) {
        return `${this._highlightInline(line, {
            defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.comment, dim: true, italic: true },
            matchers: [
                {
                    regex: /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number }
                },
                {
                    regex: /\b(singleton|converged|iterations?|dropped|observations?)\b/gi,
                    style: { fg: CURRENT_THEME_SLOT_MAP.keyword, bold: true }
                }
            ]
        })}${ANSI.reset}`;
    }

    _renderSummaryLine(line) {
        return `${this._highlightInline(line, {
            defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.default },
            matchers: [
                {
                    regex: /(^|(?<=\s))(?:[A-Za-z][A-Za-z0-9_.() -]*?)(?=\s=\s)/g,
                    style: { fg: CURRENT_THEME_SLOT_MAP.header, bold: true }
                },
                {
                    regex: /=/g,
                    style: { fg: CURRENT_THEME_SLOT_MAP.separator }
                },
                {
                    regex: /(?<![A-Za-z_])[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                }
            ]
        })}${ANSI.reset}`;
    }

    _renderTableHeaderLine(line) {
        return `${this._highlightInline(line, {
            defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.header, bold: true },
            matchers: [
                {
                    regex: /\[(?:95|90|99)% conf\. interval\]/gi,
                    style: { fg: CURRENT_THEME_SLOT_MAP.keyword, bold: true }
                },
                {
                    regex: /(?<![A-Za-z_])\d+(?:\.\d+)?\b/g,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                }
            ]
        })}${ANSI.reset}`;
    }

    _renderTableDataLine(line) {
        return `${this._highlightInline(line, {
            defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.default },
            matchers: [
                {
                    regex: /(?<![A-Za-z_])[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number }
                }
            ]
        })}${ANSI.reset}`;
    }

    _renderOutputLine(line, width) {
        if (/^[.>]\s+\*{2,}#/.test(line) || /^[.>]\s+\*{2,}\s+/.test(line)) {
            return this._renderCommentCommandLine(line);
        }

        if (/^\s*--break--\s*$/i.test(line)) {
            return `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.error, bold: true })}${ANSI.reset}`;
        }

        if (/^\s*\*\*#/.test(line) || /^\s*\*{2,}\s+/.test(line)) {
            return `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.comment, dim: true, italic: true })}${ANSI.reset}`;
        }

        if (/^[.>]\s/.test(line)) {
            return this._renderCommandLine(line, width);
        }

        if (/^\s*(error:|r\(\d+\)\s*;?|.*\berror\b.*)$/i.test(line)) {
            return `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.error, bold: true })}${ANSI.reset}`;
        }

        if (this._isSeparatorLine(line)) {
            return `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.separator })}${ANSI.reset}`;
        }

        if (this._isParenNoteLine(line) || /^\s*\* = /.test(line)) {
            return this._renderNoteLine(line);
        }

        if (/^\s*(HDFE Linear regression|Absorbed degrees of freedom:)\s*$/i.test(line)) {
            return `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.header, bold: true })}${ANSI.reset}`;
        }

        if (this._isSummaryLine(line)) {
            return this._renderSummaryLine(line);
        }

        if (this._isTableHeaderLine(line)) {
            return this._renderTableHeaderLine(line);
        }

        if (this._isTableDataLine(line)) {
            return this._renderTableDataLine(line);
        }

        if (/\b(Begin Time:|Over Time:|Time used:)\b/.test(line)) {
            return `${this._highlightInline(line, {
                defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.time, bold: true },
                matchers: [
                    {
                        regex: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
                        style: { fg: CURRENT_THEME_SLOT_MAP.timeValue, bold: true }
                    },
                    {
                        regex: /\b[A-Z][a-z]{2}\b|\b[A-Z][a-z]{2}\s+\d{4}\b|\b\d{2}:\d{2}:\d{2}\b/g,
                        style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                    }
                ]
            })}${ANSI.reset}`;
        }

        if (/\bVariables\s+\||\bp-value\b|\bFreq\b/.test(line)) {
            return `${this._highlightInline(line, {
                defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.header, bold: true },
                matchers: [
                    {
                        regex: /(?<![A-Za-z_])[-+]?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
                        style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                    }
                ]
            })}${ANSI.reset}`;
        }

        return `${this._highlightInline(line, {
            defaultStyle: null,
            matchers: [
                {
                    regex: /\br\(\d+\)\b/gi,
                    style: { fg: CURRENT_THEME_SLOT_MAP.error, bold: true }
                },
                {
                    regex: /\berror\b/gi,
                    style: { fg: CURRENT_THEME_SLOT_MAP.error, bold: true }
                },
                {
                    regex: /(?<![A-Za-z_])[-+]?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number }
                }
            ]
        })}${ANSI.reset}`;
    }

    _renderCommandLine(line, width) {
        if (/^[.>]\s+\*{2,}#/.test(line) || /^[.>]\s+\*{2,}\s+/.test(line)) {
            return this._renderCommentCommandLine(line);
        }

        const tokens = this._tokenizeCommandLine(line);
        let rendered = '';

        for (const token of tokens) {
            rendered += paint(token.value, {
                fg: this._foregroundForCommandToken(token.type),
                bold: token.type === 'prompt' || token.type === 'command' || token.type === 'keyword',
                italic: token.type === 'comment',
                dim: token.type === 'comment'
            });
        }

        return `${rendered}${ANSI.reset}`;
    }

    _renderCommentCommandLine(line) {
        const prompt = line.slice(0, 2);
        const comment = line.slice(2);
        return `${paint(prompt, {
            fg: CURRENT_THEME_SLOT_MAP.prompt,
            bold: true
        })}${paint(comment, {
            fg: CURRENT_THEME_SLOT_MAP.comment,
            dim: true,
            italic: true
        })}${ANSI.reset}`;
    }

    _foregroundForCommandToken(type) {
        return CURRENT_THEME_SLOT_MAP[type] || CURRENT_THEME_SLOT_MAP.default;
    }

    _tokenizeCommandLine(line) {
        const tokens = [];
        let i = 0;
        let promptConsumed = false;
        let commandConsumed = false;

        while (i < line.length) {
            if (!promptConsumed && (line.startsWith('. ', i) || line.startsWith('> ', i))) {
                tokens.push({ type: 'prompt', value: line.slice(i, i + 2) });
                i += 2;
                promptConsumed = true;
                continue;
            }

            if (line.startsWith('//', i)) {
                tokens.push({ type: 'comment', value: line.slice(i) });
                break;
            }

            const quote = line[i];
            if (quote === '"' || quote === '\'') {
                let end = i + 1;
                while (end < line.length) {
                    if (line[end] === quote && line[end - 1] !== '\\') {
                        end += 1;
                        break;
                    }
                    end += 1;
                }
                tokens.push({ type: 'string', value: line.slice(i, end) });
                i = end;
                continue;
            }

            const pathMatch = line.slice(i).match(/^(?:(?:[A-Za-z]:)?[^,\s"'()]+[\\/])+[^,\s"'()]+\.[A-Za-z0-9]+/);
            if (pathMatch) {
                tokens.push({ type: 'path', value: pathMatch[0] });
                i += pathMatch[0].length;
                continue;
            }

            const numberMatch = line.slice(i).match(/^[-+]?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
            if (numberMatch) {
                tokens.push({ type: 'number', value: numberMatch[0] });
                i += numberMatch[0].length;
                continue;
            }

            const wordMatch = line.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (wordMatch) {
                const word = wordMatch[0];
                let type = 'plain';
                if (!commandConsumed && promptConsumed) {
                    type = 'command';
                    commandConsumed = true;
                } else if (COMMAND_KEYWORDS.has(word.toLowerCase())) {
                    type = 'keyword';
                } else if (line[i + word.length] === '(') {
                    type = 'function';
                }
                tokens.push({ type, value: word });
                i += word.length;
                continue;
            }

            if (OPERATOR_CHARS.has(line[i])) {
                tokens.push({ type: 'operator', value: line[i] });
                i += 1;
                continue;
            }

            tokens.push({ type: 'plain', value: line[i] });
            i += 1;
        }

        return tokens;
    }

    _highlightInline(line, { defaultStyle, matchers }) {
        const matches = [];

        for (const matcher of matchers) {
            const regex = new RegExp(matcher.regex.source, matcher.regex.flags);
            let match;
            while ((match = regex.exec(line)) !== null) {
                if (!match[0]) {
                    regex.lastIndex += 1;
                    continue;
                }
                matches.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    style: matcher.style
                });
            }
        }

        matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

        const merged = [];
        let cursor = 0;
        for (const match of matches) {
            if (match.start < cursor) {
                continue;
            }
            merged.push(match);
            cursor = match.end;
        }

        let result = '';
        let index = 0;
        for (const match of merged) {
            if (match.start > index) {
                const plain = line.slice(index, match.start);
                result += defaultStyle ? paint(plain, defaultStyle) : plain;
            }
            result += paint(line.slice(match.start, match.end), match.style);
            index = match.end;
        }

        if (index < line.length) {
            const rest = line.slice(index);
            result += defaultStyle ? paint(rest, defaultStyle) : rest;
        }

        return result;
    }
}

module.exports = {
    StataTerminalRenderer,
    formatDuration,
    syncCliTerminalTheme
};
