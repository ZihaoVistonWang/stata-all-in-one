function normalizeComparablePath(value) {
    const normalized = String(value || '')
        .replace(/""/g, '"')
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/');
    return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

function temporaryDoCommandPath(line) {
    const match = String(line || '').match(/^\s*\.\s+(?:do|run)\s+"((?:[^"]|"")*)"\s*$/i);
    return match ? normalizeComparablePath(match[1]) : '';
}

class TemporaryDoFileOutputFilter {
    constructor(tempFilePath) {
        this._tempFilePath = normalizeComparablePath(tempFilePath);
        this._buffer = '';
        this._wrapperSeen = false;
        this._pendingEndLine = '';
        this._pendingTrailingLines = '';
    }

    push(chunk) {
        const normalized = String(chunk || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!normalized) {
            return '';
        }

        this._buffer += normalized;
        const lines = this._buffer.split('\n');
        this._buffer = lines.pop() || '';
        return lines.map(line => this._consumeLine(line, true)).join('');
    }

    finish() {
        let output = '';
        if (this._buffer) {
            output += this._consumeLine(this._buffer, false);
            this._buffer = '';
        }
        if (this._pendingEndLine) {
            output += this._pendingTrailingLines;
            this._pendingEndLine = '';
            this._pendingTrailingLines = '';
        }
        return output;
    }

    _consumeLine(line, hasNewline) {
        const suffix = hasNewline ? '\n' : '';
        const lineWithSuffix = `${line}${suffix}`;
        const trimmed = String(line || '').trim();

        if (!this._wrapperSeen
            && temporaryDoCommandPath(line)
            && temporaryDoCommandPath(line) === this._tempFilePath) {
            this._wrapperSeen = true;
            return '';
        }

        if (this._wrapperSeen && /^end of do-file$/i.test(trimmed)) {
            if (this._pendingEndLine) {
                const previous = `${this._pendingEndLine}${this._pendingTrailingLines}`;
                this._pendingEndLine = lineWithSuffix;
                this._pendingTrailingLines = '';
                return previous;
            }
            this._pendingEndLine = lineWithSuffix;
            this._pendingTrailingLines = '';
            return '';
        }

        if (this._pendingEndLine) {
            if (!trimmed || /^\.\s*$/.test(trimmed)) {
                this._pendingTrailingLines += lineWithSuffix;
                return '';
            }
            const pending = `${this._pendingEndLine}${this._pendingTrailingLines}`;
            this._pendingEndLine = '';
            this._pendingTrailingLines = '';
            return `${pending}${lineWithSuffix}`;
        }

        return lineWithSuffix;
    }
}

module.exports = {
    TemporaryDoFileOutputFilter,
    normalizeComparablePath,
    temporaryDoCommandPath
};
