const RUN_TARGETS = Object.freeze({
    section: 'section',
    line: 'line',
    selection: 'selection'
});

function isSectionHeaderLine(lineText) {
    return /^\*{1,2}\s*#+/.test(String(lineText || ''));
}

function isOutlineHeadingLine(lineText) {
    return /^\*\*\s*#+/.test(String(lineText || ''));
}

function getRunTarget(editor) {
    if (!editor || !editor.document || editor.document.languageId !== 'stata') {
        return RUN_TARGETS.line;
    }

    if (editor.selection && !editor.selection.isEmpty) {
        return RUN_TARGETS.selection;
    }

    const currentLine = editor.selection ? editor.selection.active.line : 0;
    const lineText = editor.document.lineAt(currentLine).text;
    return isSectionHeaderLine(lineText)
        ? RUN_TARGETS.section
        : RUN_TARGETS.line;
}

function isCursorOnHeading(editor) {
    if (!editor || !editor.document || editor.document.languageId !== 'stata') {
        return false;
    }

    const currentLine = editor.selection ? editor.selection.active.line : 0;
    return isOutlineHeadingLine(editor.document.lineAt(currentLine).text);
}

module.exports = {
    RUN_TARGETS,
    getRunTarget,
    isCursorOnHeading,
    isOutlineHeadingLine,
    isSectionHeaderLine
};
