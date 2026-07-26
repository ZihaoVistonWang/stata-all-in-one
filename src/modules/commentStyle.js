function getCommentStyleMenuValue(commentStyle) {
    const normalized = String(commentStyle || '').trim();
    if (normalized === '*') {
        return 'star';
    }
    if (normalized === '/* ... */') {
        return 'block';
    }
    return 'slash';
}

module.exports = {
    getCommentStyleMenuValue
};
