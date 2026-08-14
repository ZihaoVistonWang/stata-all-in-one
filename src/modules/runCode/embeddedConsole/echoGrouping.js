function entryText(entry) {
    return Array.isArray(entry && entry.segments)
        ? entry.segments.map(segment => String(segment && segment.text || '')).join('')
        : '';
}

function isPrimaryEcho(entry) {
    const kind = String(entry && entry.kind || '');
    return (kind === 'command' || kind === 'comment-command')
        && entryText(entry).startsWith('. ');
}

function isPrimaryBlankEcho(entry) {
    return String(entry && entry.kind || '') === 'command'
        && /^\.\s*$/.test(entryText(entry));
}

class PrimaryEchoGrouper {
    constructor() {
        this.reset();
    }

    reset() {
        this._primaryEchoCount = 0;
        this._lastOutputWasBlank = false;
        this._attachNextCommand = false;
    }

    push(entries) {
        const output = [];
        for (const entry of Array.isArray(entries) ? entries.filter(Boolean) : []) {
            const kind = String(entry && entry.kind || '');
            const primary = isPrimaryEcho(entry);
            const primaryBlank = isPrimaryBlankEcho(entry);

            if (this._attachNextCommand) {
                if (kind === 'blank' || (kind === 'default' && entryText(entry) === '')) {
                    continue;
                }
                if (primary && kind === 'comment-command') {
                    output.push(entry);
                    this._primaryEchoCount += 1;
                    this._lastOutputWasBlank = false;
                    continue;
                }
                if (primary && kind === 'command' && !primaryBlank) {
                    output.push(entry);
                    this._primaryEchoCount += 1;
                    this._attachNextCommand = false;
                    this._lastOutputWasBlank = false;
                    continue;
                }

                this._attachNextCommand = false;
            }

            if (primaryBlank) {
                output.push(entry);
                this._primaryEchoCount += 1;
                this._lastOutputWasBlank = true;
                continue;
            }

            if (primary && kind === 'comment-command') {
                if (this._primaryEchoCount > 0 && !this._lastOutputWasBlank) {
                    output.push({ kind: 'blank', segments: [] });
                }
                output.push(entry);
                this._primaryEchoCount += 1;
                this._attachNextCommand = true;
                this._lastOutputWasBlank = false;
                continue;
            }

            if (primary) {
                if (this._primaryEchoCount > 0 && !this._lastOutputWasBlank) {
                    output.push({ kind: 'blank', segments: [] });
                }
                this._primaryEchoCount += 1;
            }

            output.push(entry);
            this._lastOutputWasBlank = kind === 'blank'
                || (kind === 'default' && entryText(entry) === '');
        }
        return output;
    }

    flush() {
        this._attachNextCommand = false;
        return [];
    }
}

module.exports = {
    PrimaryEchoGrouper,
    entryText,
    isPrimaryBlankEcho,
    isPrimaryEcho
};
