function isStataSlashCommentAt(line, index) {
    return line[index] === '/'
        && line[index + 1] === '/'
        && (index === 0 || /\s/.test(line[index - 1]));
}

function findLineContinuationIndex(line) {
    let inDoubleQuote = false;
    for (let index = 0; index < line.length - 2; index += 1) {
        const char = line[index];
        if (char === '"') {
            if (inDoubleQuote && line[index + 1] === '"') {
                index += 1;
                continue;
            }
            inDoubleQuote = !inDoubleQuote;
            continue;
        }
        if (!inDoubleQuote && line[index + 2] === '/' && isStataSlashCommentAt(line, index)) {
            return index;
        }
    }
    return -1;
}

function stripTrailingLineComment(line) {
    let inDoubleQuote = false;
    for (let index = 0; index < line.length - 1; index += 1) {
        const char = line[index];
        if (char === '"') {
            if (inDoubleQuote && line[index + 1] === '"') {
                index += 1;
                continue;
            }
            inDoubleQuote = !inDoubleQuote;
            continue;
        }
        if (!inDoubleQuote && isStataSlashCommentAt(line, index)) {
            return line.slice(0, index);
        }
    }
    return line;
}

function normalizeStandaloneCdCommand(line) {
    const normalized = stripTrailingLineComment(String(line || '').trim()).trim();
    const quotedMatch = normalized.match(/^cd\s+"((?:[^"]|"")*)"$/i);
    if (quotedMatch) {
        return normalized;
    }

    return /^cd\s+(.+)$/i.test(normalized) ? normalized : null;
}

function hasDisplayableFullLineComment(lines) {
    return (Array.isArray(lines) ? lines : [lines]).some((line) => {
        const trimmed = String(line || '').trim();
        return trimmed.startsWith('*')
            || trimmed.startsWith('/*')
            || isStataSlashCommentAt(trimmed, 0);
    });
}

module.exports = {
    findLineContinuationIndex,
    hasDisplayableFullLineComment,
    isStataSlashCommentAt,
    normalizeStandaloneCdCommand,
    stripTrailingLineComment
};
