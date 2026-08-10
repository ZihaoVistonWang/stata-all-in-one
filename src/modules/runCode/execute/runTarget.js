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
    getInclusiveSelectionEndLine,
    getStandaloneCommentFlags,
    getRunTarget,
    isCursorOnHeading,
    isOutlineHeadingLine,
    isStandaloneLineComment,
    isSectionHeaderLine
};
