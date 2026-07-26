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
        if (!inDoubleQuote && char === '/' && line[index + 1] === '/') {
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

module.exports = {
    normalizeStandaloneCdCommand
};
