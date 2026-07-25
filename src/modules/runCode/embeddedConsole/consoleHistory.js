function appendConsoleHistory(history, entries) {
    const current = Array.isArray(history) ? history : [];
    const additions = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (additions.length) {
        current.push(...additions);
    }
    return current;
}

module.exports = {
    appendConsoleHistory
};
