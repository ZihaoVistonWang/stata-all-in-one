function stripLeadingPrefixes(command) {
    let remaining = command;
    while (true) {
        const match = remaining.match(/^(cap(?:ture)?|qui(?:etly)?|noi(?:sily)?)\b\s*/i);
        if (!match) return remaining;
        remaining = remaining.slice(match[0].length);
    }
}

function containsSaioCommand(code) {
    const lines = String(code || '').replace(/\r\n?/g, '\n').split('\n');
    let inBlockComment = false;

    return lines.some(line => {
        let remaining = line.trim();
        if (!remaining) return false;

        while (remaining) {
            if (inBlockComment) {
                const commentEnd = remaining.indexOf('*/');
                if (commentEnd < 0) return false;
                remaining = remaining.slice(commentEnd + 2).trimStart();
                inBlockComment = false;
                continue;
            }
            if (remaining.startsWith('/*')) {
                inBlockComment = true;
                remaining = remaining.slice(2);
                continue;
            }
            break;
        }

        if (!remaining || remaining.startsWith('*') || remaining.startsWith('//')) {
            return false;
        }
        remaining = stripLeadingPrefixes(remaining);
        return /^saio(?:\s|,|;|$)/i.test(remaining);
    });
}

module.exports = {
    containsSaioCommand,
    stripLeadingPrefixes
};
