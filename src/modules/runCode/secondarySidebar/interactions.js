const config = require('../../../utils/config');
const { StataBuiltinCommands, StataKeywords, StataFunctions, StataOptions } = require('../../completionProvider');
const { analyzeCompletionContext, selectCompletionCandidates } = require('../../completionContext');
const variableSuggestions = require('../../variableSuggestionService');
const { StataTerminalRenderer } = require('../embeddedConsole/renderer');

const renderer = new StataTerminalRenderer();

function highlightText(text) {
    if (!text) return [];
    const result = [];
    const lines = String(text).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        if (index > 0) result.push({ text: '\n', tokenType: 'plain', className: 'tok tok-plain', style: {} });
        if (!lines[index]) continue;
        try {
            const entry = renderer._segmentCommandLine(lines[index]);
            result.push(...(entry && Array.isArray(entry.segments) ? entry.segments : []));
        } catch (_error) {
            result.push({ text: lines[index], tokenType: 'plain', className: 'tok tok-plain', style: {} });
        }
    }
    return result;
}

function highlightFilterText(text) {
    const prefix = 'browse ';
    const segments = highlightText(prefix + String(text || ''));
    let remainingPrefix = prefix.length;
    const result = [];
    for (const segment of segments) {
        const segmentText = String(segment.text || '');
        if (remainingPrefix >= segmentText.length) {
            remainingPrefix -= segmentText.length;
            continue;
        }
        result.push({ ...segment, text: remainingPrefix ? segmentText.slice(remainingPrefix) : segmentText });
        remainingPrefix = 0;
    }
    return result;
}

function getConsoleAutocomplete(text, cursor) {
    const context = analyzeCompletionContext(text, cursor);
    return {
        context,
        matches: selectCompletionCandidates(context, {
            commands: [...new Set([...StataBuiltinCommands, ...StataKeywords, ...config.getCustomCommands()])],
            variables: variableSuggestions.getActiveVariables(),
            functions: StataFunctions,
            options: StataOptions
        })
    };
}

module.exports = { highlightText, highlightFilterText, getConsoleAutocomplete };
