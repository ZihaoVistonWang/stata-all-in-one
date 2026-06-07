const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { tokenizeStataLineWithTheme, setConsoleTextmateTheme } = require('./textmateTokenizer');

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

const DEFAULT_SLOT_MAP = {
    prompt: DEFAULT_TERMINAL_COLORS.brightBlack,
    command: DEFAULT_TERMINAL_COLORS.brightMagenta,
    keyword: DEFAULT_TERMINAL_COLORS.brightCyan,
    string: DEFAULT_TERMINAL_COLORS.brightYellow,
    path: DEFAULT_TERMINAL_COLORS.brightYellow,
    number: DEFAULT_TERMINAL_COLORS.brightGreen,
    comment: DEFAULT_TERMINAL_COLORS.brightBlack,
    function: DEFAULT_TERMINAL_COLORS.brightBlue,
    option: DEFAULT_TERMINAL_COLORS.brightBlue,
    variable: DEFAULT_TERMINAL_COLORS.brightYellow,
    macro: DEFAULT_TERMINAL_COLORS.brightYellow,
    operator: DEFAULT_TERMINAL_COLORS.cyan,
    default: null,
    error: DEFAULT_TERMINAL_COLORS.brightRed,
    header: DEFAULT_TERMINAL_COLORS.brightCyan,
    separator: DEFAULT_TERMINAL_COLORS.brightBlack,
    time: DEFAULT_TERMINAL_COLORS.brightCyan,
    timeValue: DEFAULT_TERMINAL_COLORS.brightYellow
};

const TOKEN_SCOPE_CANDIDATES = {
    command: ['keyword.functions.data.stata', 'keyword.functions.program.stata', 'storage.type.function.stata'],
    keyword: [
        'keyword.macro.stata',
        'keyword.macro.extendedfcn.stata',
        'keyword.control.conditional.stata',
        'keyword.control.flow.stata',
        'keyword.control.block.begin.stata',
        'keyword.control.block.end.stata',
        'keyword.control.anchor.stata',
        'keyword.control.quantifier.stata',
        'keyword.control.or.stata',
        'keyword.other.stata',
        'support.type.stata',
        'constant.language.factorvars.stata',
        'keyword'
    ],
    macro: ['entity.name.type.class.stata'],
    function: ['support.function.builtin.stata', 'entity.name.function.stata', 'entity.name.function', 'support.function'],
    option: ['support.function.custom.stata', 'keyword.other.option-toggle.stata'],
    variable: ['variable.parameter.function.stata', 'variable.object.stata', 'variable'],
    string: ['string.quoted.double.stata', 'string.quoted.double.compound.stata', 'string.quoted.single.stata', 'string'],
    number: ['constant.numeric.stata', 'constant.numeric'],
    comment: ['comment.line.double-slash.stata', 'comment.line.star.stata', 'comment.line.triple-slash.stata', 'comment.block.stata', 'comment'],
    operator: [
        'keyword.operator.assignment.stata',
        'keyword.operator.arithmetic.stata',
        'keyword.operator.comparison.stata',
        'keyword.operator.logical.stata',
        'keyword.operator.factor-variables.stata',
        'keyword.operator.mata',
        'keyword.operator'
    ]
};

const COMMAND_TOKEN_SCOPE_CANDIDATES = ['keyword.functions.data.stata', 'keyword.functions.program.stata'];
const KEYWORD_TOKEN_SCOPE_CANDIDATES = [
    'keyword.macro.stata',
    'keyword.macro.extendedfcn.stata',
    'keyword.control.conditional.stata',
    'keyword.control.flow.stata',
    'keyword.control.block.begin.stata',
    'keyword.control.block.end.stata',
    'keyword.other.stata',
    'support.type.stata',
    'constant.language.factorvars.stata',
    'keyword'
];
const PLAIN_PUNCTUATION_SCOPE_CANDIDATES = [
    'keyword.operator.parentheses.stata',
    'punctuation.definition.parameters.begin.stata',
    'punctuation.definition.parameters.end.stata',
    'punctuation.separator.comma.stata',
    'punctuation.separator.key-value',
    'punctuation.definition.variable.begin.stata'
];

let CURRENT_THEME_SLOT_MAP = { ...DEFAULT_SLOT_MAP };
let CURRENT_THEME_DATA = null;
let CURRENT_THEME_DEFAULT_FOREGROUND = null;

const VALUE_NUMBER_REGEX = /(?<![%A-Za-z_])[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?(?![A-Za-z])/gi;

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
    if (style.bg) {
        const bgRgb = hexToRgb(style.bg);
        if (bgRgb) {
            prefix += `\x1b[48;2;${bgRgb.r};${bgRgb.g};${bgRgb.b}m`;
        } else if (ANSI.bg[style.bg]) {
            prefix += ANSI.bg[style.bg];
        }
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
    if (style.fg) {
        const fgRgb = hexToRgb(style.fg);
        if (fgRgb) {
            prefix += `\x1b[38;2;${fgRgb.r};${fgRgb.g};${fgRgb.b}m`;
        } else if (ANSI.fg[style.fg]) {
            prefix += ANSI.fg[style.fg];
        }
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
        for (let index = tokenColors.length - 1; index >= 0; index--) {
            const rule = tokenColors[index];
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

function hasSpecificGrammarScope(scopes) {
    return Array.isArray(scopes) && scopes.some((scope) => {
        if (!scope || typeof scope !== 'string') {
            return false;
        }
        return scope !== 'source' && scope !== 'source.stata';
    });
}

function findThemeColorForScopes(themeData, scopes) {
    if (!themeData || !Array.isArray(scopes) || !scopes.length) {
        return null;
    }

    const tokenColors = Array.isArray(themeData.tokenColors) ? themeData.tokenColors : [];
    for (let index = tokenColors.length - 1; index >= 0; index--) {
        const rule = tokenColors[index];
        const ruleScopes = toScopeList(rule.scope);
        if (!ruleScopes.length) {
            continue;
        }
        if (!ruleScopes.some((ruleScope) => scopes.some((scope) => scopeMatches(scope, ruleScope)))) {
            continue;
        }
        const foreground = rule.settings && rule.settings.foreground;
        if (foreground) {
            return foreground;
        }
    }

    return null;
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

    let localTokenColors = [];
    if (Array.isArray(themeData.tokenColors)) {
        localTokenColors = themeData.tokenColors;
    } else if (typeof themeData.tokenColors === 'string') {
        const tokenColorsPath = path.resolve(themeDir, themeData.tokenColors);
        const tokenColorTheme = loadThemeData(tokenColorsPath, visited);
        localTokenColors = Array.isArray(tokenColorTheme.tokenColors) ? tokenColorTheme.tokenColors : [];
    } else if (Array.isArray(themeData.settings)) {
        localTokenColors = themeData.settings;
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
            ...localTokenColors
        ]
    };
}

function resolveThemeSlotMap(themeData) {
    const colors = themeData.colors || {};
    const slotMap = { ...DEFAULT_SLOT_MAP };

    for (const [tokenType, candidates] of Object.entries(TOKEN_SCOPE_CANDIDATES)) {
        const themeColor = findThemeTokenColor(themeData, candidates);
        if (themeColor) {
            slotMap[tokenType] = themeColor;
        }
    }

    slotMap.default = colors['editor.foreground'] || colors['terminal.foreground'] || colors.foreground || null;
    slotMap.prompt = colors['editorLineNumber.foreground'] || colors['descriptionForeground'] || null;
    slotMap.error = colors['editorError.foreground'] || colors['errorForeground'] || DEFAULT_SLOT_MAP.error;
    slotMap.header = colors['textLink.foreground'] || slotMap.keyword || null;
    slotMap.separator = colors['panel.border'] || colors['editorIndentGuide.background'] || null;
    slotMap.time = colors['terminal.foreground'] || colors.foreground || null;
    slotMap.timeValue = slotMap.number || null;

    return slotMap;
}

function syncConsoleTerminalTheme() {
    try {
        const themeDefinition = findCurrentThemeDefinition();
        if (!themeDefinition || !fs.existsSync(themeDefinition.themePath)) {
            CURRENT_THEME_SLOT_MAP = {};
            CURRENT_THEME_DATA = null;
            CURRENT_THEME_DEFAULT_FOREGROUND = null;
            return;
        }

        const themeData = loadThemeData(themeDefinition.themePath);
        CURRENT_THEME_DATA = themeData;
        CURRENT_THEME_SLOT_MAP = resolveThemeSlotMap(themeData);
        CURRENT_THEME_DEFAULT_FOREGROUND = CURRENT_THEME_SLOT_MAP.default || null;
        setConsoleTextmateTheme(themeData);
    } catch (error) {
        console.error('[renderer] Failed to sync console terminal theme:', error.message);
        CURRENT_THEME_SLOT_MAP = {};
        CURRENT_THEME_DATA = null;
        CURRENT_THEME_DEFAULT_FOREGROUND = null;
    }
}

function getWebviewThemeVariables() {
    return {
        prompt: CURRENT_THEME_SLOT_MAP.prompt || DEFAULT_SLOT_MAP.prompt,
        command: CURRENT_THEME_SLOT_MAP.command || null,
        keyword: CURRENT_THEME_SLOT_MAP.keyword || null,
        string: CURRENT_THEME_SLOT_MAP.string || null,
        path: CURRENT_THEME_SLOT_MAP.path || null,
        number: CURRENT_THEME_SLOT_MAP.number || null,
        comment: CURRENT_THEME_SLOT_MAP.comment || null,
        function: CURRENT_THEME_SLOT_MAP.function || null,
        option: CURRENT_THEME_SLOT_MAP.option || null,
        variable: CURRENT_THEME_SLOT_MAP.variable || null,
        macro: CURRENT_THEME_SLOT_MAP.macro || null,
        operator: CURRENT_THEME_SLOT_MAP.operator || null,
        plain: CURRENT_THEME_SLOT_MAP.default || null,
        default: CURRENT_THEME_SLOT_MAP.default || null,
        error: CURRENT_THEME_SLOT_MAP.error || DEFAULT_SLOT_MAP.error,
        header: CURRENT_THEME_SLOT_MAP.header || null,
        separator: CURRENT_THEME_SLOT_MAP.separator || DEFAULT_SLOT_MAP.separator,
        time: CURRENT_THEME_SLOT_MAP.time || null,
        timeValue: CURRENT_THEME_SLOT_MAP.timeValue || null
    };
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

function truncateToWidth(text, maxWidth) {
    if (!maxWidth || maxWidth <= 0) {
        return String(text || '');
    }

    let result = '';
    let width = 0;
    for (const char of String(text || '')) {
        const charWidth = getDisplayWidth(char);
        if (width + charWidth > maxWidth) {
            break;
        }
        result += char;
        width += charWidth;
    }
    return result;
}

class StataTerminalRenderer {
    constructor() {
        this._pendingLine = '';
        this._lastRenderedLineKind = null;
        this._describeMode = false;
    }

    renderCommand(command, width) {
        const normalized = String(command || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalized.split('\n');
        return lines
            .map((line, index) => this._renderCommandLine(`${index === 0 ? '. ' : '> '}${line}`, width))
            .join('\n') + '\n';
    }

    renderCommandSegments(command, width) {
        const normalized = String(command || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalized.split('\n');
        return lines.map((line, index) => this._segmentCommandLine(`${index === 0 ? '. ' : '> '}${line}`, width));
    }

    renderStrikethroughCommandSegments(lines) {
        // 删除线行不带命令提示符，作为独立提示块展示
        return lines.map((line) =>
            this._segmentStrikethroughCommandLine(line)
        );
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

    renderOutputChunkSegments(text, width) {
        const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!normalized) {
            return [];
        }

        if (!normalized.includes('\n') && !this._pendingLine && /^[.\s>]+$/.test(normalized)) {
            return [{
                kind: 'raw',
                segments: [this._segment(normalized, this._styleForTokenType('plain'))]
            }];
        }

        const combined = this._pendingLine + normalized;
        const endsWithNewline = combined.endsWith('\n');
        const parts = combined.split('\n');

        if (!endsWithNewline) {
            this._pendingLine = parts.pop() || '';
        } else {
            this._pendingLine = '';
            parts.pop();
        }

        return parts.map(line => this._segmentOutputLine(line, width)).filter(Boolean);
    }

    flushPendingOutput(width) {
        if (!this._pendingLine) {
            return '';
        }

        const line = this._pendingLine;
        this._pendingLine = '';
        const rendered = this._renderOutputLine(line, width);
        this._lastRenderedLineKind = null;
        this._describeMode = false;
        return rendered;
    }

    flushPendingOutputSegments(width) {
        if (!this._pendingLine) {
            return [];
        }

        const line = this._pendingLine;
        this._pendingLine = '';
        const rendered = this._segmentOutputLine(line, width);
        this._lastRenderedLineKind = null;
        this._describeMode = false;
        return rendered ? [rendered] : [];
    }

    discardPendingOutput() {
        this._pendingLine = '';
        this._lastRenderedLineKind = null;
        this._describeMode = false;
    }

    renderError(text) {
        const body = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
        return `${paint(`error: ${body}`, { fg: CURRENT_THEME_SLOT_MAP.error, bold: true })}\n${ANSI.reset}`;
    }

    renderErrorSegments(text) {
        const body = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
        return [{
            kind: 'error',
            segments: [this._segment(`error: ${body}`, this._styleForTokenType('error', { bold: true }))]
        }];
    }

    renderBreakLine() {
        return `${paint('--break--', { fg: CURRENT_THEME_SLOT_MAP.error, bold: true })}\n${ANSI.reset}`;
    }

    renderBreakLineSegments() {
        return [{
            kind: 'break',
            segments: [this._segment('--break--', this._styleForTokenType('error', { bold: true }))]
        }];
    }

    renderWarningBlock(text) {
        const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!normalized) {
            return '';
        }

        return `${normalized
            .split('\n')
            .map(line => `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.error, bold: true })}${ANSI.reset}`)
            .join('\n')}\n`;
    }

    renderWarningBlockSegments(text) {
        return this._segmentBlock(text, 'warning', this._styleForTokenType('error', { bold: true }));
    }

    renderAccentBlock(text) {
        const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!normalized) {
            return '';
        }

        return `${normalized
            .split('\n')
            .map(line => `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.command, bold: true })}${ANSI.reset}`)
            .join('\n')}\n`;
    }

    renderAccentBlockSegments(text) {
        return this._segmentBlock(text, 'accent', this._styleForTokenType('command', { bold: true }));
    }

    renderCommandAccentBlock(text) {
        return this.renderAccentBlock(text);
    }

    renderFunctionAccentBlock(text) {
        const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!normalized) {
            return '';
        }

        return `${normalized
            .split('\n')
            .map(line => `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.function, bold: true })}${ANSI.reset}`)
            .join('\n')}\n`;
    }

    renderFunctionAccentBlockSegments(text) {
        return this._segmentBlock(text, 'accent-function', this._styleForTokenType('function', { bold: true }));
    }

    renderRunFooter(durationMs, width) {
        const label = `Worked for ${formatDuration(durationMs)}`;
        const lineWidth = Math.max(width || 72, label.length + 8);
        const sideWidth = Math.max(3, Math.floor((lineWidth - label.length - 2) / 2));
        const separator = `${'─'.repeat(sideWidth)} ${label} ${'─'.repeat(sideWidth)}`;
        return `\n${paint(separator, { fg: CURRENT_THEME_SLOT_MAP.separator })}\n${ANSI.reset}`;
    }

    renderRunFooterSegments(durationMs, width) {
        const label = `Worked for ${formatDuration(durationMs)}`;
        return [
            { kind: 'blank', segments: [] },
            {
                kind: 'footer',
                segments: [this._segment(label, this._styleForTokenType('separator'))]
            },
            { kind: 'blank', segments: [] }
        ];
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

    _isDescribeDataLine(line) {
        return /^\s*[A-Za-z_][A-Za-z0-9_~]*\s+(?:byte|int|long|float|double|str\d+)\s+%[-0-9.]+[sgf]?\s*/i.test(line);
    }

    _isDescribeSummaryLine(line) {
        return /^\s*(Observations:|Variables:)\s+/.test(line);
    }

    _isDescribeSourceLine(line) {
        return /^\s*Contains data from\s+/.test(line);
    }

    _isDescribeHeaderLine(line) {
        return /^\s*Variable\s+Storage\s+Display\s+Value\s+Variable label\s*$/.test(line)
            || /^\s*name\s+type\s+format\s+label\s*$/.test(line);
    }

    _renderNoteLine(line) {
        return `${this._highlightInline(line, {
            defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.comment, dim: true, italic: true },
            matchers: [
                {
                    regex: VALUE_NUMBER_REGEX,
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
        const summaryMatch = String(line || '').match(/^(.*?)(\s=\s)(.*)$/);
        if (!summaryMatch) {
            return `${this._highlightInline(line, {
                defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.default },
                matchers: [
                    {
                        regex: /=/g,
                        style: { fg: CURRENT_THEME_SLOT_MAP.separator }
                    },
                    {
                        regex: VALUE_NUMBER_REGEX,
                        style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                    }
                ]
            })}${ANSI.reset}`;
        }

        const [, label, separator, value] = summaryMatch;
        const labelParts = label.split(/(\(\s*\d[\d,\s]*\))/g).filter(Boolean);
        let rendered = '';

        for (const part of labelParts) {
            if (/^\(\s*\d[\d,\s]*\)$/.test(part)) {
                rendered += this._highlightInline(part, {
                    defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.header, bold: true },
                    matchers: [
                        {
                            regex: /\d[\d,\s]*/g,
                            style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                        }
                    ]
                });
            } else {
                rendered += paint(part, { fg: CURRENT_THEME_SLOT_MAP.header, bold: true });
            }
        }

        rendered += paint(separator, { fg: CURRENT_THEME_SLOT_MAP.separator });
        rendered += this._highlightInline(value, {
            defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.default },
            matchers: [
                {
                    regex: VALUE_NUMBER_REGEX,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                }
            ]
        });

        return `${rendered}${ANSI.reset}`;
    }

    _segmentSummaryLine(line) {
        const summaryMatch = String(line || '').match(/^(.*?)(\s=\s)(.*)$/);
        if (!summaryMatch) {
            return this._segmentInline(line, {
                defaultStyle: this._styleForTokenType('default'),
                matchers: [
                    {
                        regex: /=/g,
                        style: this._styleForTokenType('separator')
                    },
                    {
                        regex: VALUE_NUMBER_REGEX,
                        style: this._styleForTokenType('number', { bold: true })
                    }
                ]
            });
        }

        const [, label, separator, value] = summaryMatch;
        const segments = [];
        const labelParts = label.split(/(\(\s*\d[\d,\s]*\))/g).filter(Boolean);

        for (const part of labelParts) {
            if (/^\(\s*\d[\d,\s]*\)$/.test(part)) {
                segments.push(...this._segmentInline(part, {
                    defaultStyle: this._styleForTokenType('header', { bold: true }),
                    matchers: [
                        {
                            regex: /\d[\d,\s]*/g,
                            style: this._styleForTokenType('number', { bold: true })
                        }
                    ]
                }));
            } else {
                segments.push(this._segment(part, this._styleForTokenType('header', { bold: true })));
            }
        }

        segments.push(this._segment(separator, this._styleForTokenType('separator')));
        segments.push(...this._segmentInline(value, {
            defaultStyle: this._styleForTokenType('default'),
            matchers: [
                {
                    regex: VALUE_NUMBER_REGEX,
                    style: this._styleForTokenType('number', { bold: true })
                }
            ]
        }));

        return segments;
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
                    regex: VALUE_NUMBER_REGEX,
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
                    regex: VALUE_NUMBER_REGEX,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number }
                }
            ]
        })}${ANSI.reset}`;
    }

    _renderDescribeDataLine(line) {
        return `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.default })}${ANSI.reset}`;
    }

    _renderDescribeSourceLine(line) {
        return `${this._highlightInline(line, {
            defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.default },
            matchers: [
                {
                    regex: /(?:[A-Za-z]:)?(?:\.{0,2}\/)?[^\s]+\.[A-Za-z0-9]+/g,
                    style: { fg: CURRENT_THEME_SLOT_MAP.path, bold: true }
                }
            ]
        })}${ANSI.reset}`;
    }

    _renderDescribeSummaryLine(line) {
        return `${this._highlightInline(line, {
            defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.default },
            matchers: [
                {
                    regex: /\b(Observations|Variables):/g,
                    style: { fg: CURRENT_THEME_SLOT_MAP.default, bold: true }
                },
                {
                    regex: /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                },
                {
                    regex: /\b\d{2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}\b/g,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                }
            ]
        })}${ANSI.reset}`;
    }

    _renderDescribeHeaderLine(line) {
        return `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.default, bold: true })}${ANSI.reset}`;
    }

    _segmentOutputLine(line, width) {
        let lineKind = 'default';

        if (/^[.>]\s+\*{2,}#/.test(line) || /^[.>]\s+\*{2,}\s+/.test(line)) {
            this._describeMode = false;
            lineKind = 'comment-command';
            const rendered = this._segmentCommentCommandLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^\s*--break--\s*$/i.test(line)) {
            this._describeMode = false;
            lineKind = 'error';
            const rendered = {
                kind: lineKind,
                segments: [this._segment(line, this._styleForTokenType('error', { bold: true }))]
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^\s*\*\*#/.test(line) || /^\s*\*{2,}\s+/.test(line)) {
            this._describeMode = false;
            lineKind = 'comment';
            const rendered = {
                kind: lineKind,
                segments: [this._segment(line, this._styleForTokenType('comment', { italic: true }))]
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^[.>]\s/.test(line)) {
            this._describeMode = false;
            lineKind = 'command';
            const rendered = this._segmentCommandLine(line, width);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^\s*(error:|r\(\d+\)\s*;?|.*\berror\b.*)$/i.test(line)) {
            this._describeMode = false;
            lineKind = 'error';
            const rendered = {
                kind: lineKind,
                segments: [this._segment(line, this._styleForTokenType('error', { bold: true }))]
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isDescribeSourceLine(line)) {
            this._describeMode = true;
            lineKind = 'describe-source';
            const rendered = {
                kind: lineKind,
                segments: this._segmentInline(line, {
                    defaultStyle: this._styleForTokenType('default'),
                    matchers: [
                        {
                            regex: /(?:[A-Za-z]:)?(?:\.{0,2}\/)?[^\s]+\.[A-Za-z0-9]+/g,
                            style: this._styleForTokenType('path', { bold: true })
                        }
                    ]
                })
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._describeMode && this._isDescribeSummaryLine(line)) {
            lineKind = 'describe-summary';
            const rendered = {
                kind: lineKind,
                segments: this._segmentInline(line, {
                    defaultStyle: this._styleForTokenType('default'),
                    matchers: [
                        {
                            regex: /\b(Observations|Variables):/g,
                            style: this._styleForTokenType('default', { bold: true })
                        },
                        {
                            regex: /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g,
                            style: this._styleForTokenType('number', { bold: true })
                        },
                        {
                            regex: /\b\d{2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}\b/g,
                            style: this._styleForTokenType('number', { bold: true })
                        }
                    ]
                })
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._describeMode && this._isDescribeHeaderLine(line)) {
            lineKind = 'describe-header';
            const rendered = {
                kind: lineKind,
                segments: [this._segment(line, this._styleForTokenType('default', { bold: true }))]
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isSeparatorLine(line)) {
            const separatorLine = truncateToWidth(line, width);
            if (this._describeMode && this._lastRenderedLineKind === 'separator') {
                return null;
            }
            if (this._lastRenderedLineKind === 'separator') {
                return null;
            }
            lineKind = 'separator';
            const rendered = {
                kind: lineKind,
                segments: [this._segment(separatorLine, this._styleForTokenType('separator', { dim: true }))]
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isParenNoteLine(line) || /^\s*\* = /.test(line)) {
            lineKind = 'note';
            const rendered = {
                kind: lineKind,
                segments: this._segmentInline(line, {
                    defaultStyle: this._styleForTokenType('comment', { dim: true, italic: true }),
                    matchers: [
                        {
                            regex: VALUE_NUMBER_REGEX,
                            style: this._styleForTokenType('number')
                        },
                        {
                            regex: /\b(singleton|converged|iterations?|dropped|observations?)\b/gi,
                            style: this._styleForTokenType('keyword', { bold: true })
                        }
                    ]
                })
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^\s*(HDFE Linear regression|Absorbed degrees of freedom:)\s*$/i.test(line)) {
            lineKind = 'header';
            const rendered = {
                kind: lineKind,
                segments: [this._segment(line, this._styleForTokenType('header', { bold: true }))]
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isSummaryLine(line)) {
            lineKind = 'summary';
            const rendered = {
                kind: lineKind,
                segments: this._segmentSummaryLine(line)
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isTableHeaderLine(line)) {
            lineKind = 'table-header';
            const rendered = {
                kind: lineKind,
                segments: this._segmentInline(line, {
                    defaultStyle: this._styleForTokenType('header', { bold: true }),
                    matchers: [
                        {
                            regex: /\[(?:95|90|99)% conf\. interval\]/gi,
                            style: this._styleForTokenType('keyword', { bold: true })
                        },
                        {
                            regex: VALUE_NUMBER_REGEX,
                            style: this._styleForTokenType('number', { bold: true })
                        }
                    ]
                })
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isDescribeDataLine(line)) {
            this._describeMode = true;
            lineKind = 'describe-data';
            const rendered = {
                kind: lineKind,
                segments: [this._segment(line, this._styleForTokenType('default'))]
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isTableDataLine(line)) {
            lineKind = 'table-data';
            const rendered = {
                kind: lineKind,
                segments: this._segmentInline(line, {
                    defaultStyle: this._styleForTokenType('default'),
                    matchers: [
                        {
                            regex: VALUE_NUMBER_REGEX,
                            style: this._styleForTokenType('number')
                        }
                    ]
                })
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/\b(Begin Time:|Over Time:|Time used:)\b/.test(line)) {
            lineKind = 'time';
            const rendered = {
                kind: lineKind,
                segments: this._segmentInline(line, {
                    defaultStyle: this._styleForTokenType('time', { bold: true }),
                    matchers: [
                        {
                            regex: VALUE_NUMBER_REGEX,
                            style: this._styleForTokenType('timeValue', { bold: true })
                        },
                        {
                            regex: /\b[A-Z][a-z]{2}\b|\b[A-Z][a-z]{2}\s+\d{4}\b|\b\d{2}:\d{2}:\d{2}\b/g,
                            style: this._styleForTokenType('number', { bold: true })
                        }
                    ]
                })
            };
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._describeMode && /^\s*$/.test(line)) {
            this._lastRenderedLineKind = 'blank';
            return { kind: 'blank', segments: [] };
        }

        lineKind = 'default';
        const rendered = {
            kind: lineKind,
            segments: this._segmentInline(line, {
                defaultStyle: null,
                matchers: [
                    {
                        regex: /\br\(\d+\)\b/gi,
                        style: this._styleForTokenType('error', { bold: true })
                    },
                    {
                        regex: /\berror\b/gi,
                        style: this._styleForTokenType('error', { bold: true })
                    },
                    {
                        regex: VALUE_NUMBER_REGEX,
                        style: this._styleForTokenType('number')
                    }
                ]
            })
        };
        this._lastRenderedLineKind = lineKind;
        return rendered;
    }

    _renderOutputLine(line, width) {
        let lineKind = 'default';

        if (/^[.>]\s+\*{2,}#/.test(line) || /^[.>]\s+\*{2,}\s+/.test(line)) {
            this._describeMode = false;
            lineKind = 'comment-command';
            const rendered = this._renderCommentCommandLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^\s*--break--\s*$/i.test(line)) {
            this._describeMode = false;
            lineKind = 'error';
            const rendered = `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.error, bold: true })}${ANSI.reset}`;
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^\s*\*\*#/.test(line) || /^\s*\*{2,}\s+/.test(line)) {
            this._describeMode = false;
            lineKind = 'comment';
            const rendered = `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.comment, italic: true })}${ANSI.reset}`;
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^[.>]\s/.test(line)) {
            this._describeMode = false;
            lineKind = 'command';
            const rendered = this._renderCommandLine(line, width);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^\s*(error:|r\(\d+\)\s*;?|.*\berror\b.*)$/i.test(line)) {
            this._describeMode = false;
            lineKind = 'error';
            const rendered = `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.error, bold: true })}${ANSI.reset}`;
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isDescribeSourceLine(line)) {
            this._describeMode = true;
            lineKind = 'describe-source';
            const rendered = this._renderDescribeSourceLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._describeMode && this._isDescribeSummaryLine(line)) {
            lineKind = 'describe-summary';
            const rendered = this._renderDescribeSummaryLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._describeMode && this._isDescribeHeaderLine(line)) {
            lineKind = 'describe-header';
            const rendered = this._renderDescribeHeaderLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isSeparatorLine(line)) {
            const separatorLine = truncateToWidth(line, width);
            if (this._describeMode) {
                if (this._lastRenderedLineKind === 'separator') {
                    return '';
                }
                lineKind = 'separator';
                const rendered = `${paint(separatorLine, { fg: CURRENT_THEME_SLOT_MAP.separator, dim: true })}${ANSI.reset}`;
                this._lastRenderedLineKind = lineKind;
                return rendered;
            }
            if (this._lastRenderedLineKind === 'separator') {
                return '';
            }
            lineKind = 'separator';
            const rendered = `${paint(separatorLine, { fg: CURRENT_THEME_SLOT_MAP.separator, dim: true })}${ANSI.reset}`;
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isParenNoteLine(line) || /^\s*\* = /.test(line)) {
            lineKind = 'note';
            const rendered = this._renderNoteLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/^\s*(HDFE Linear regression|Absorbed degrees of freedom:)\s*$/i.test(line)) {
            lineKind = 'header';
            const rendered = `${paint(line, { fg: CURRENT_THEME_SLOT_MAP.header, bold: true })}${ANSI.reset}`;
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isSummaryLine(line)) {
            lineKind = 'summary';
            const rendered = this._renderSummaryLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isTableHeaderLine(line)) {
            lineKind = 'table-header';
            const rendered = this._renderTableHeaderLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isDescribeDataLine(line)) {
            this._describeMode = true;
            lineKind = 'describe-data';
            const rendered = this._renderDescribeDataLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._isTableDataLine(line)) {
            lineKind = 'table-data';
            const rendered = this._renderTableDataLine(line);
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (/\b(Begin Time:|Over Time:|Time used:)\b/.test(line)) {
            lineKind = 'time';
            const rendered = `${this._highlightInline(line, {
                defaultStyle: { fg: CURRENT_THEME_SLOT_MAP.time, bold: true },
                matchers: [
                    {
                        regex: VALUE_NUMBER_REGEX,
                        style: { fg: CURRENT_THEME_SLOT_MAP.timeValue, bold: true }
                    },
                    {
                        regex: /\b[A-Z][a-z]{2}\b|\b[A-Z][a-z]{2}\s+\d{4}\b|\b\d{2}:\d{2}:\d{2}\b/g,
                        style: { fg: CURRENT_THEME_SLOT_MAP.number, bold: true }
                    }
                ]
            })}${ANSI.reset}`;
            this._lastRenderedLineKind = lineKind;
            return rendered;
        }

        if (this._describeMode && /^\s*$/.test(line)) {
            this._lastRenderedLineKind = 'blank';
            return '';
        }

        lineKind = 'default';
        const rendered = `${this._highlightInline(line, {
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
                    regex: VALUE_NUMBER_REGEX,
                    style: { fg: CURRENT_THEME_SLOT_MAP.number }
                }
            ]
        })}${ANSI.reset}`;
        this._lastRenderedLineKind = lineKind;
        return rendered;
    }

    _renderCommandLine(line, width) {
        if (/^[.>]\s+\*{2,}#/.test(line) || /^[.>]\s+\*{2,}\s+/.test(line)) {
            return this._renderCommentCommandLine(line);
        }

        const prompt = (line.startsWith('. ') || line.startsWith('> ')) ? line.slice(0, 2) : '';
        const body = prompt ? line.slice(2) : line;
        const grammarTokens = this._tokenizeCommandBodyWithCommentFallback(body);
        if (!grammarTokens) {
            const fallbackTokens = this._tokenizeCommandLine(line);
            let fallbackRendered = '';
            for (const token of fallbackTokens) {
                fallbackRendered += paint(token.value, {
                    fg: this._foregroundForCommandToken(token.type),
                    bold: token.type === 'prompt' || token.type === 'command' || token.type === 'keyword',
                    italic: token.type === 'comment',
                    dim: token.type === 'comment'
                });
            }
            return `${fallbackRendered}${ANSI.reset}`;
        }

        let rendered = '';
        if (prompt) {
            rendered += paint(prompt, {
                fg: this._foregroundForCommandToken('prompt'),
                bold: true
            });
        }

        for (const token of grammarTokens) {
            rendered += paint(token.value, {
                fg: this._foregroundForCommandToken(token.type, token.scopes, token.foreground),
                bold: token.type === 'prompt' || token.type === 'command' || token.type === 'keyword',
                italic: token.type === 'comment',
                dim: token.type === 'comment'
            });
        }

        return `${rendered}${ANSI.reset}`;
    }

    _tokenizeCommandLineWithGrammar(line) {
        const tmTokens = tokenizeStataLineWithTheme(line);
        if (!tmTokens || !tmTokens.length) {
            return null;
        }

        const renderedTokens = [];
        let firstIdentifierSeen = false;

        for (const token of tmTokens) {
            const value = line.slice(token.startIndex, token.endIndex);
            if (!value) {
                continue;
            }

            const scopes = Array.isArray(token.scopes) ? token.scopes : [];
            const explodedTokens = this._explodeGenericGrammarToken(scopes, value, !firstIdentifierSeen, token.foreground, token.fontStyle);
            let subPos = 0;
            for (const explodedToken of explodedTokens) {
                explodedToken.startIndex = token.startIndex + subPos;
                subPos += explodedToken.value.length;
                renderedTokens.push(explodedToken);
                if (!firstIdentifierSeen && /[A-Za-z_]/.test(explodedToken.value) && explodedToken.type !== 'comment') {
                    firstIdentifierSeen = true;
                }
            }
        }

        return renderedTokens;
    }

    _tokenizeCommandBodyWithCommentFallback(line) {
        const grammarTokens = this._tokenizeCommandLineWithGrammar(line);
        if (!grammarTokens || !grammarTokens.length) {
            return grammarTokens;
        }

        if (grammarTokens.some((token) => token.type === 'comment')) {
            return grammarTokens;
        }

        const commentIndex = this._findInlineDoubleSlashCommentIndex(line);
        if (commentIndex < 0) {
            return grammarTokens;
        }

        const codePart = line.slice(0, commentIndex);
        const commentPart = line.slice(commentIndex);
        const codeTokens = codePart ? (this._tokenizeCommandLineWithGrammar(codePart) || []) : [];

        return [
            ...codeTokens,
            { type: 'comment', value: commentPart, scopes: ['comment.line.double-slash.stata'] }
        ];
    }

    _findInlineDoubleSlashCommentIndex(line) {
        const text = String(line || '');
        let inDoubleQuote = false;

        for (let i = 0; i < text.length - 1; i++) {
            const ch = text[i];
            if (ch === '"') {
                inDoubleQuote = !inDoubleQuote;
                continue;
            }

            if (inDoubleQuote) {
                continue;
            }

            if (text[i] === '/' && text[i + 1] === '/' && text[i + 2] !== '/') {
                return i;
            }
        }

        return -1;
    }

    _explodeGenericGrammarToken(scopes, value, isFirstIdentifier, foreground, fontStyle) {
        const type = this._tokenTypeFromScopes(scopes, value, isFirstIdentifier);
        if (type !== 'plain') {
            return [{ type, value, scopes, foreground, fontStyle }];
        }

        const tokens = [];
        const pattern = /(\s+|[A-Za-z_][A-Za-z0-9_]*|[-+]?\d+(?:\.\d+)?(?:e[+-]?\d+)?|[=!,+\-*/%&|^~:().\[\]{}<>]+)/gi;
        let lastIndex = 0;
        let firstIdentifierAvailable = isFirstIdentifier;
        let match;

        while ((match = pattern.exec(value)) !== null) {
            if (match.index > lastIndex) {
                tokens.push({ type: 'plain', value: value.slice(lastIndex, match.index), foreground, fontStyle });
            }

            const segment = match[0];
            let segmentType = 'plain';
            if (/^\s+$/.test(segment)) {
                segmentType = 'plain';
            } else if (/^[-+]?\d/.test(segment)) {
                segmentType = 'number';
            } else if (/^[=!,+\-*/%&|^~:().\[\]{}<>]+$/.test(segment)) {
                segmentType = 'operator';
            } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
                if (firstIdentifierAvailable) {
                    segmentType = 'command';
                    firstIdentifierAvailable = false;
                } else if (COMMAND_KEYWORDS.has(segment.toLowerCase())) {
                    segmentType = 'keyword';
                } else {
                    segmentType = 'variable';
                }
            }

            tokens.push({ type: segmentType, value: segment, foreground, fontStyle });
            lastIndex = pattern.lastIndex;
        }

        if (lastIndex < value.length) {
            tokens.push({ type: 'plain', value: value.slice(lastIndex), foreground, fontStyle });
        }

        return tokens.length ? tokens : [{ type: 'plain', value, foreground, fontStyle }];
    }

    _tokenTypeFromScopes(scopes, value, isFirstIdentifier) {
        if (!value.trim()) {
            return 'plain';
        }

        if (scopes.some((scope) => scopeMatches(scope, 'comment'))) {
            return 'comment';
        }

        if (scopes.some((scope) => scopeMatches(scope, 'string'))) {
            return 'string';
        }

        if (scopes.some((scope) => scopeMatches(scope, 'constant.numeric.stata') || scopeMatches(scope, 'constant.numeric'))) {
            return 'number';
        }

        if (
            scopes.some((scope) => TOKEN_SCOPE_CANDIDATES.macro.some((candidate) => scopeMatches(scope, candidate)))
            || (value === '$' && scopes.some((scope) => scopeMatches(scope, 'punctuation.definition.string.begin.stata')))
        ) {
            return 'macro';
        }

        if (scopes.some((scope) => PLAIN_PUNCTUATION_SCOPE_CANDIDATES.some((candidate) => scopeMatches(scope, candidate)))) {
            return 'plain';
        }

        if (scopes.some((scope) => TOKEN_SCOPE_CANDIDATES.operator.some((candidate) => scopeMatches(scope, candidate)))) {
            return 'operator';
        }

        if (scopes.some((scope) => TOKEN_SCOPE_CANDIDATES.variable.some((candidate) => scopeMatches(scope, candidate)))) {
            return 'variable';
        }

        if (scopes.some((scope) => TOKEN_SCOPE_CANDIDATES.option.some((candidate) => scopeMatches(scope, candidate)))) {
            return 'option';
        }

        if (scopes.some((scope) => TOKEN_SCOPE_CANDIDATES.function.some((candidate) => scopeMatches(scope, candidate)))) {
            return 'function';
        }

        if (isFirstIdentifier && scopes.some((scope) => COMMAND_TOKEN_SCOPE_CANDIDATES.some((candidate) => scopeMatches(scope, candidate)))) {
            return 'command';
        }

        if (isFirstIdentifier && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value)) {
            return 'command';
        }

        if (scopes.some((scope) => KEYWORD_TOKEN_SCOPE_CANDIDATES.some((candidate) => scopeMatches(scope, candidate)))) {
            return 'keyword';
        }

        return 'plain';
    }

    _renderCommentCommandLine(line) {
        const prompt = line.slice(0, 2);
        const comment = line.slice(2);
        return `${paint(prompt, {
            fg: CURRENT_THEME_SLOT_MAP.prompt,
            bold: true
        })}${paint(comment, {
            fg: CURRENT_THEME_SLOT_MAP.comment,
            italic: true
        })}${ANSI.reset}`;
    }

    _segmentCommandLine(line) {
        if (/^[.>]\s+\*{2,}#/.test(line) || /^[.>]\s+\*{2,}\s+/.test(line)) {
            return this._segmentCommentCommandLine(line);
        }

        const prompt = (line.startsWith('. ') || line.startsWith('> ')) ? line.slice(0, 2) : '';
        const body = prompt ? line.slice(2) : line;
        const segments = [];

        if (prompt) {
            segments.push(this._segment(prompt, this._styleForTokenType('prompt', { bold: true })));
        }

        const grammarTokens = this._tokenizeCommandBodyWithCommentFallback(body);
        const tokens = grammarTokens || this._tokenizeCommandLine(line).filter((token, index) => !(index === 0 && token.type === 'prompt'));
        for (const token of tokens) {
            const type = token.type === 'plain' ? 'plain' : token.type;
            segments.push(this._segment(token.value, this._styleForTokenType(
                type,
                {
                    fg: this._foregroundForCommandToken(token.type, token.scopes, token.foreground),
                    forceForeground: hasSpecificGrammarScope(token.scopes),
                    bold: token.type === 'prompt' || token.type === 'command' || token.type === 'keyword',
                    italic: token.type === 'comment' || token.type === 'variable',
                    dim: false
                }
            )));
        }

        return {
            kind: 'command',
            segments
        };
    }

    _segmentCommentCommandLine(line) {
        const prompt = line.slice(0, 2);
        const comment = line.slice(2);
        return {
            kind: 'comment-command',
            segments: [
                this._segment(prompt, this._styleForTokenType('prompt', { bold: true })),
                this._segment(comment, this._styleForTokenType('comment', { italic: true }))
            ]
        };
    }

    _segmentStrikethroughCommandLine(line) {
        const prompt = (line.startsWith('. ') || line.startsWith('> ')) ? line.slice(0, 2) : '';
        const body = prompt ? line.slice(2) : line;
        const segments = [];
        if (prompt) {
            segments.push(this._segment(prompt, this._styleForTokenType('prompt', { bold: true })));
        }
        segments.push(this._segment(body, this._styleForTokenType('comment', { strikethrough: true })));
        return { kind: 'command', segments };
    }

    _foregroundForCommandToken(type, scopes, tokenForeground) {
        if (hasSpecificGrammarScope(scopes)) {
            if (tokenForeground) {
                return tokenForeground;
            }

            return CURRENT_THEME_SLOT_MAP[type] || CURRENT_THEME_DEFAULT_FOREGROUND || CURRENT_THEME_SLOT_MAP.default;
        }

        return CURRENT_THEME_SLOT_MAP[type] || CURRENT_THEME_SLOT_MAP.default;
    }

    _tokenizeCommandLine(line) {
        const tokens = [];
        let i = 0;
        let promptConsumed = false;
        let commandConsumed = false;
        let parenDepth = 0;
        let bracketDepth = 0;
        let commaOptionMode = false;

        while (i < line.length) {
            if (!promptConsumed && (line.startsWith('. ', i) || line.startsWith('> ', i))) {
                tokens.push({ type: 'prompt', value: line.slice(i, i + 2), startIndex: i });
                i += 2;
                promptConsumed = true;
                continue;
            }

            if (line.startsWith('//', i)) {
                tokens.push({ type: 'comment', value: line.slice(i), startIndex: i });
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
                tokens.push({ type: 'string', value: line.slice(i, end), startIndex: i });
                i = end;
                continue;
            }

            const pathMatch = line.slice(i).match(/^(?:(?:[A-Za-z]:)?[^,\s"'()]+[\\/])+[^,\s"'()]+\.[A-Za-z0-9]+/);
            if (pathMatch) {
                tokens.push({ type: 'path', value: pathMatch[0], startIndex: i });
                i += pathMatch[0].length;
                continue;
            }

            const numberMatch = line.slice(i).match(/^[-+]?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
            if (numberMatch) {
                tokens.push({ type: 'number', value: numberMatch[0], startIndex: i });
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
                } else if (commaOptionMode && parenDepth === 0 && bracketDepth === 0) {
                    type = 'option';
                } else if (COMMAND_KEYWORDS.has(word.toLowerCase())) {
                    type = 'keyword';
                } else if (line[i + word.length] === '(') {
                    type = 'function';
                } else if (parenDepth > 0 || bracketDepth > 0) {
                    type = 'variable';
                }
                tokens.push({ type, value: word, startIndex: i });
                i += word.length;
                continue;
            }

            if (OPERATOR_CHARS.has(line[i])) {
                if (line[i] === ',') {
                    commaOptionMode = parenDepth === 0 && bracketDepth === 0;
                } else if (line[i] === '(') {
                    parenDepth += 1;
                } else if (line[i] === ')') {
                    parenDepth = Math.max(0, parenDepth - 1);
                } else if (line[i] === '[') {
                    bracketDepth += 1;
                } else if (line[i] === ']') {
                    bracketDepth = Math.max(0, bracketDepth - 1);
                }
                tokens.push({ type: 'operator', value: line[i], startIndex: i });
                i += 1;
                continue;
            }

            tokens.push({ type: 'plain', value: line[i], startIndex: i });
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

    _segmentInline(line, { defaultStyle, matchers }) {
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

        const result = [];
        let index = 0;
        for (const match of merged) {
            if (match.start > index) {
                const plain = line.slice(index, match.start);
                if (plain) {
                    result.push(this._segment(plain, defaultStyle || this._styleForTokenType('plain')));
                }
            }
            result.push(this._segment(line.slice(match.start, match.end), match.style));
            index = match.end;
        }

        if (index < line.length) {
            const rest = line.slice(index);
            if (rest) {
                result.push(this._segment(rest, defaultStyle || this._styleForTokenType('plain')));
            }
        }

        return result;
    }

    _segmentBlock(text, kind, style) {
        const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!normalized) {
            return [];
        }

        return normalized.split('\n').map(line => ({
            kind,
            segments: [this._segment(line, style)]
        }));
    }

    _segment(text, style = {}) {
        const tokenType = style.tokenType || 'plain';
        const defaultColor = CURRENT_THEME_SLOT_MAP[tokenType] || CURRENT_THEME_SLOT_MAP.default || null;
        const explicitColor = style.forceForeground
            ? (style.fg || CURRENT_THEME_DEFAULT_FOREGROUND || CURRENT_THEME_SLOT_MAP.default || null)
            : (style.fg && style.fg !== defaultColor ? style.fg : null);
        return {
            text,
            tokenType,
            className: this._classNameForStyle(style),
            style: {
                color: explicitColor,
                backgroundColor: style.bg || null,
                bold: Boolean(style.bold),
                italic: Boolean(style.italic),
                dim: Boolean(style.dim)
            }
        };
    }

    _styleForTokenType(type, overrides = {}) {
        const style = { tokenType: type || 'plain' };
        const foreground = overrides.fg || CURRENT_THEME_SLOT_MAP[type];
        if (foreground) {
            style.fg = foreground;
        }
        if (overrides.forceForeground) {
            style.forceForeground = true;
        }
        if (overrides.bg) {
            style.bg = overrides.bg;
        }
        if (overrides.bold) {
            style.bold = true;
        }
        if (overrides.italic) {
            style.italic = true;
        }
        if (overrides.dim) {
            style.dim = true;
        }
        if (overrides.strikethrough) {
            style.strikethrough = true;
        }
        return style;
    }

    _classNameForStyle(style = {}) {
        const classNames = ['tok', `tok-${style.tokenType || 'plain'}`];
        if (style.bold) {
            classNames.push('is-bold');
        }
        if (style.italic) {
            classNames.push('is-italic');
        }
        if (style.dim) {
            classNames.push('is-dim');
        }
        if (style.strikethrough) {
            classNames.push('is-strikethrough');
        }
        return classNames.join(' ');
    }
}

module.exports = {
    StataTerminalRenderer,
    formatDuration,
    syncConsoleTerminalTheme,
    getWebviewThemeVariables
};
