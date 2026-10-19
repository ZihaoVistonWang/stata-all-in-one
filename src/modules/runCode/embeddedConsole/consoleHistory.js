function appendConsoleHistory(history, entries) {
    const current = Array.isArray(history) ? history : [];
    const additions = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (additions.length) {
        current.push(...additions);
    }
    return current;
}

// Resolve against the full history, including lines outside the webview window.
function getConsoleRunText(history, footerIndex, includeCode = false) {
    if (!Array.isArray(history) || !Number.isInteger(footerIndex)
        || history[footerIndex]?.kind !== 'footer') {
        return null;
    }
    let start = footerIndex;
    while (start > 0 && history[start - 1]?.kind !== 'footer') start -= 1;
    const entries = history.slice(start, footerIndex);
    const hasCommandEcho = entries.some(entry => entry?.kind === 'command' || entry?.kind === 'comment-command');
    const lines = [];
    const textOf = entry => (Array.isArray(entry?.segments) ? entry.segments : [])
        .map(segment => String(segment?.text ?? '')).join('');
    for (const entry of entries) {
        const kind = entry?.kind;
        if (kind === 'graph' || (kind === 'raw-prompt' && !includeCode)) continue;
        if (kind === 'submission') {
            // Prefer the actual echoed transcript, including Stata's prompts.
            if (includeCode && !hasCommandEcho) {
                const code = String(entry.code || '').replace(/\r\n?/g, '\n');
                lines.push(...code.split('\n').map((line, index) => `${index === 0 ? '. ' : '> '}${line}`));
            }
        } else if (kind === 'command' || kind === 'comment-command') {
            if (includeCode) lines.push(textOf(entry));
        } else {
            lines.push(textOf(entry));
        }
    }
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.join('\n');
}

module.exports = {
    appendConsoleHistory,
    getConsoleRunText
};
