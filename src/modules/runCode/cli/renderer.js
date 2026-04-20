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
        return `${paint(`error: ${body}`, { fg: 'brightRed', bold: true })}\n${ANSI.reset}`;
    }

    renderRunFooter(durationMs, width) {
        const label = ` Worked for ${formatDuration(durationMs)} `;
        const lineWidth = Math.max(width || 72, label.length + 8);
        const left = '─ ';
        const rightWidth = Math.max(0, lineWidth - left.length - label.length);
        const separator = `${left}${label}${'─'.repeat(rightWidth)}`;
        return `\n${paint(separator, { fg: 'brightBlack' })}\n${ANSI.reset}`;
    }

    _renderOutputLine(line, width) {
        if (/^[.>]\s/.test(line)) {
            return this._renderCommandLine(line, width);
        }

        if (/^\s*(error:|r\(\d+\)|.*\berror\b.*)$/i.test(line)) {
            return `${paint(line, { fg: 'brightRed', bold: true })}${ANSI.reset}`;
        }

        if (/^\s*[-=]{5,}\s*$/.test(line)) {
            return `${paint(line, { fg: 'brightBlack' })}${ANSI.reset}`;
        }

        if (/\b(Begin Time:|Over Time:|Time used:)\b/.test(line)) {
            return `${this._highlightInline(line, {
                defaultStyle: { fg: 'brightCyan', bold: true },
                matchers: [
                    {
                        regex: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
                        style: { fg: 'brightYellow', bold: true }
                    },
                    {
                        regex: /\b[A-Z][a-z]{2}\b|\b[A-Z][a-z]{2}\s+\d{4}\b|\b\d{2}:\d{2}:\d{2}\b/g,
                        style: { fg: 'brightGreen', bold: true }
                    }
                ]
            })}${ANSI.reset}`;
        }

        if (/\bVariables\s+\||\bp-value\b|\bFreq\b/.test(line)) {
            return `${this._highlightInline(line, {
                defaultStyle: { fg: 'brightCyan', bold: true },
                matchers: [
                    {
                        regex: /(?<![A-Za-z_])[-+]?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
                        style: { fg: 'brightYellow', bold: true }
                    }
                ]
            })}${ANSI.reset}`;
        }

        return `${this._highlightInline(line, {
            defaultStyle: null,
            matchers: [
                {
                    regex: /\br\(\d+\)\b/gi,
                    style: { fg: 'brightRed', bold: true }
                },
                {
                    regex: /\berror\b/gi,
                    style: { fg: 'brightRed', bold: true }
                },
                {
                    regex: /(?<![A-Za-z_])[-+]?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi,
                    style: { fg: 'brightYellow' }
                }
            ]
        })}${ANSI.reset}`;
    }

    _renderCommandLine(line, width) {
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

    _foregroundForCommandToken(type) {
        switch (type) {
            case 'prompt':
                return 'brightBlack';
            case 'command':
                return 'brightMagenta';
            case 'keyword':
                return 'brightCyan';
            case 'string':
            case 'path':
                return 'brightYellow';
            case 'number':
                return 'brightGreen';
            case 'comment':
                return 'brightBlack';
            case 'function':
                return 'brightBlue';
            case 'operator':
                return 'cyan';
            default:
                return 'default';
        }
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
    formatDuration
};
