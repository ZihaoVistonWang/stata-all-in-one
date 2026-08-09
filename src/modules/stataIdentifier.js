const STATA_IDENTIFIER_BODY = String.raw`[\p{L}_][\p{L}\p{M}\p{N}_]*`;
const STATA_IDENTIFIER_PATTERN = new RegExp(`^${STATA_IDENTIFIER_BODY}$`, 'u');
const TRAILING_STATA_IDENTIFIER_PATTERN = new RegExp(`${STATA_IDENTIFIER_BODY}$`, 'u');

function isStataIdentifier(value) {
    return STATA_IDENTIFIER_PATTERN.test(String(value || ''));
}

function getTrailingStataIdentifier(value) {
    const text = String(value || '');
    const match = text.match(TRAILING_STATA_IDENTIFIER_PATTERN);
    if (!match) {
        return { word: '', start: text.length, end: text.length };
    }
    return {
        word: match[0],
        start: match.index,
        end: text.length
    };
}

module.exports = {
    STATA_IDENTIFIER_BODY,
    isStataIdentifier,
    getTrailingStataIdentifier
};
