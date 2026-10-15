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

function getDecoratedSectionStart(document, headingLine) {
    if (headingLine === 0) {
        return headingLine;
    }

    // Only attach a standalone decorative rule, never an ordinary comment.
    const previousLine = document.lineAt(headingLine - 1).text;
    const isRule = /^\s*\*\*\s*([\p{P}\p{S}])\1{2,}(?:\s+\*\*)?\s*$/u.test(previousLine)
        && !isSectionHeaderLine(previousLine);
    if (!isRule) {
        return headingLine;
    }
    // A rule directly below another heading is that heading's bottom border.
    if (headingLine > 1 && isSectionHeaderLine(document.lineAt(headingLine - 2).text)) {
        return headingLine;
    }
    return headingLine - 1;
}

function getSectionRunRange(document, headingLine) {
    const level = /^\*{1,2}\s*(#+)/.exec(document.lineAt(headingLine).text)[1].length;
    const startLine = getDecoratedSectionStart(document, headingLine);
    let endLine = document.lineCount - 1;

    for (let i = headingLine + 1; i < document.lineCount; i += 1) {
        const match = /^\*{1,2}\s*(#+)/.exec(document.lineAt(i).text);
        if (match && match[1].length <= level) {
            endLine = getDecoratedSectionStart(document, i) - 1;
            break;
        }
    }
    // Keep spacing within the section, but omit empty padding at its end.
    while (endLine > headingLine && !document.lineAt(endLine).text.trim()) {
        endLine -= 1;
    }
    return { startLine, endLine };
}

function isStandaloneLineComment(lineText) {
    return /^\s*(?:\*|\/\/|\/\*)/.test(String(lineText || ''));
}

function getStandaloneCommentFlags(document) {
    const flags = [];
    let blockDepth = 0;

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
        const text = String(document.lineAt(lineIndex).text || '');
        let index = 0;
        let sawComment = blockDepth > 0;
        let hasCode = false;

        while (index < text.length) {
            if (blockDepth > 0) {
                if (text.startsWith('/*', index)) {
                    blockDepth += 1;
                    index += 2;
                } else if (text.startsWith('*/', index)) {
                    blockDepth -= 1;
                    index += 2;
                } else {
                    index += 1;
                }
                continue;
            }

            if (/\s/.test(text[index])) {
                index += 1;
                continue;
            }
            if (text.startsWith('/*', index)) {
                sawComment = true;
                blockDepth += 1;
                index += 2;
                continue;
            }
            if (text.startsWith('//', index) || text[index] === '*') {
                sawComment = true;
                index = text.length;
                continue;
            }

            hasCode = true;
            break;
        }

        flags.push(sawComment && !hasCode);
    }

    return flags;
}

function getAttachedCommentRunRange(document, currentLine) {
    const lastLine = Math.max(0, Number(document && document.lineCount || 1) - 1);
    const line = Math.min(Math.max(0, Number(currentLine) || 0), lastLine);
    let startLine = line;
    let endLine = line;
    const commentFlags = getStandaloneCommentFlags(document);

    if (commentFlags[line]) {
        while (startLine > 0 && commentFlags[startLine - 1]) {
            startLine -= 1;
        }
        while (endLine < lastLine && commentFlags[endLine + 1]) {
            endLine += 1;
        }
        if (endLine < lastLine && String(document.lineAt(endLine + 1).text || '').trim()) {
            endLine += 1;
        }
    } else {
        while (startLine > 0 && commentFlags[startLine - 1]) {
            startLine -= 1;
        }
    }

    return { startLine, endLine };
}

function getInclusiveSelectionEndLine(selection) {
    const endsAtNextLineStart = selection.end.line > selection.start.line
        && selection.end.character === 0;

    return endsAtNextLineStart
        ? selection.end.line - 1
        : selection.end.line;
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
    getAttachedCommentRunRange,
    getSectionRunRange,
    getInclusiveSelectionEndLine,
    getStandaloneCommentFlags,
    getRunTarget,
    isCursorOnHeading,
    isOutlineHeadingLine,
    isStandaloneLineComment,
    isSectionHeaderLine
};
