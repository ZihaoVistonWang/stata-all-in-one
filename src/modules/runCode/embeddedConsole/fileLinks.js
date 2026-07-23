const path = require('path');

const FILE_EXTENSIONS = new Set([
    '.ado', '.bmp', '.csv', '.dct', '.doc', '.docx', '.do', '.dta', '.eps',
    '.exe', '.gph', '.gz', '.htm', '.html', '.ipynb', '.irf', '.jpeg', '.jpg',
    '.json', '.log', '.mata', '.md', '.mlib', '.odt', '.pdf', '.plugin', '.png',
    '.ppt', '.pptx', '.ps',
    '.rar', '.rtf', '.sas7bdat', '.sav', '.smcl', '.sthlp', '.svg', '.tex',
    '.ster', '.tif', '.tiff', '.tsv', '.txt', '.xls', '.xlsb', '.xlsm',
    '.xlsx', '.xml', '.xpt', '.zip', '.7z'
]);

const TEXT_FILE_EXTENSIONS = new Set([
    '.ado', '.csv', '.dct', '.do', '.htm', '.html', '.ipynb', '.json',
    '.log', '.mata', '.md', '.rtf', '.smcl', '.sthlp', '.tex', '.tsv',
    '.txt', '.xml'
]);

const FILE_COMMANDS = new Set([
    'append', 'asdoc', 'asdocx', 'collect', 'copy', 'do', 'dyndoc', 'erase',
    'esttab', 'estout', 'estimates', 'export', 'file', 'graph', 'import',
    'include', 'infile', 'infix', 'insheet', 'joinby', 'log', 'markdown',
    'merge', 'outfile', 'outreg2', 'putdocx', 'putexcel', 'putpdf', 'rm',
    'run', 'save', 'spshape2dta', 'translate', 'use', 'webuse', 'xmlsave',
    'xmluse'
]);

const NON_FILE_STRING_COMMANDS = new Set([
    'assert', 'char', 'confirm', 'count', 'decode', 'di', 'display', 'encode',
    'egen', 'generate', 'gen', 'global', 'label', 'local', 'macro', 'matrix',
    'notes', 'replace', 'return', 'scalar'
]);

const OUTPUT_FILE_CONTEXT = /\b(?:created|exported|file|for|from|log|opened|output|saved|using|written)\b/i;
const EXTENSION_PATTERN = [...FILE_EXTENSIONS]
    .map(extension => extension.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
    .join('|');

function entryText(entry) {
    return (Array.isArray(entry && entry.segments) ? entry.segments : [])
        .map(segment => String(segment && segment.text || ''))
        .join('');
}

function stripPrompt(text) {
    return String(text || '').replace(/^\s*(?:[.>]\s*)/, '');
}

function hasFileExtension(value) {
    const clean = String(value || '').trim().replace(/[!),;:]+$/, '');
    return FILE_EXTENSIONS.has(path.extname(clean).toLowerCase());
}

function isUnsafePathToken(value) {
    const text = String(value || '');
    return !text
        || /[*?]/.test(text)
        || /\$/.test(text)
        || /[`']/.test(text)
        || /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
}

function isWindowsAbsolute(value) {
    return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\]/.test(value);
}

function isExplicitPath(value) {
    return path.posix.isAbsolute(value)
        || isWindowsAbsolute(value)
        || /^\.{1,2}[\\/]/.test(value);
}

function pathApiFor(value, cwd) {
    return isWindowsAbsolute(value) || isWindowsAbsolute(String(cwd || ''))
        ? path.win32
        : path;
}

function resolveFilePath(value, cwd) {
    const raw = String(value || '').trim().replace(/""/g, '"');
    if (isUnsafePathToken(raw) || !hasFileExtension(raw)) return null;
    const api = pathApiFor(raw, cwd);
    if (api.isAbsolute(raw)) return api.normalize(raw);
    if (!cwd) return api.resolve(raw);
    return api.resolve(cwd, raw);
}

function commandName(text) {
    let value = stripPrompt(text).trim();
    value = value.replace(/^(?:(?:capture|cap|quietly|qui|noisily|noi)\s+)+/i, '');
    value = value.replace(/^version\s+[0-9.]+\s*:\s*/i, '');
    const colon = value.indexOf(':');
    if (colon >= 0 && /^(?:by|bysort|statsby|rolling|bootstrap|jackknife|svy)\b/i.test(value)) {
        value = value.slice(colon + 1).trim();
    }
    const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    return match ? match[1].toLowerCase() : '';
}

function findQuotedCandidates(text) {
    const candidates = [];
    const regex = /"((?:[^"]|"")+)"/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const value = match[1].replace(/""/g, '"');
        if (!hasFileExtension(value) || isUnsafePathToken(value)) continue;
        candidates.push({
            start: match.index + 1,
            end: match.index + match[0].length - 1,
            value
        });
    }
    return candidates;
}

function findUnquotedCandidates(text, occupied = []) {
    const candidates = [];
    const regex = new RegExp(
        `(?:[A-Za-z]:[\\\\/]|\\\\\\\\|\\.{1,2}[\\\\/]|/)?[^\\s"'<>|]+?\\.(?:${EXTENSION_PATTERN})(?=$|[\\s!),;:])`,
        'gi'
    );
    let match;
    while ((match = regex.exec(text)) !== null) {
        let value = match[0].replace(/[!),;:]+$/, '');
        const start = match.index;
        const end = start + value.length;
        if (occupied.some(range => start < range.end && end > range.start)) continue;
        if (!hasFileExtension(value) || isUnsafePathToken(value)) continue;
        candidates.push({ start, end, value });
    }
    return candidates;
}

function findAbsolutePathWithSpaces(text, occupied = []) {
    const candidates = [];
    const regex = new RegExp(
        `(?:[A-Za-z]:[\\\\/]|\\\\\\\\|/)[^"\\r\\n]*?\\.(?:${EXTENSION_PATTERN})(?=$|[!),;:])`,
        'gi'
    );
    let match;
    while ((match = regex.exec(text)) !== null) {
        const value = match[0].trim().replace(/[!),;:]+$/, '');
        const leadingWhitespace = match[0].indexOf(value);
        const start = match.index + Math.max(0, leadingWhitespace);
        const end = start + value.length;
        if (occupied.some(range => start < range.end && end > range.start)) continue;
        if (!hasFileExtension(value) || isUnsafePathToken(value)) continue;
        candidates.push({ start, end, value });
    }
    return candidates;
}

function findContextualOutputCandidates(text, occupied = []) {
    const candidates = [];
    const patterns = [
        new RegExp(
            `\\bfile\\s+(.+?\\.(?:${EXTENSION_PATTERN}))(?=\\s+(?:not\\s+found|saved)\\b|\\)?$)`,
            'gi'
        ),
        new RegExp(
            `\\blog:\\s+(.+?\\.(?:${EXTENSION_PATTERN}))(?=\\s*$)`,
            'gi'
        )
    ];
    for (const regex of patterns) {
        let match;
        while ((match = regex.exec(text)) !== null) {
            const value = match[1].trim();
            const start = match.index + match[0].indexOf(match[1]);
            const end = start + value.length;
            if (occupied.some(range => start < range.end && end > range.start)) continue;
            if (!hasFileExtension(value) || isUnsafePathToken(value)) continue;
            candidates.push({ start, end, value });
        }
    }
    return candidates;
}

function uniqueCandidates(candidates) {
    const sorted = candidates
        .filter(candidate => candidate && candidate.end > candidate.start)
        .sort((a, b) => a.start - b.start || b.end - a.end);
    const result = [];
    for (const candidate of sorted) {
        if (result.some(existing => candidate.start < existing.end && candidate.end > existing.start)) {
            continue;
        }
        result.push(candidate);
    }
    return result;
}

function commandFileCandidates(text) {
    const stripped = stripPrompt(text);
    const name = commandName(stripped);
    if (!name || NON_FILE_STRING_COMMANDS.has(name) || /^\s*(?:\*|\/\/)/.test(stripped)) {
        return [];
    }
    const quoted = findQuotedCandidates(text);
    const candidates = uniqueCandidates([
        ...quoted,
        ...findUnquotedCandidates(text, quoted)
    ]);
    const hasFileContext = FILE_COMMANDS.has(name)
        || /\busing\b/i.test(stripped)
        || /\b(?:export|save|set)\s*\(/i.test(stripped);
    return candidates.filter(candidate =>
        hasFileContext
        || isExplicitPath(candidate.value)
        || (!candidate.value.includes(' ') && !candidate.value.startsWith('"'))
    );
}

function outputFileCandidates(text) {
    const quoted = findQuotedCandidates(text);
    const explicitWithSpaces = findAbsolutePathWithSpaces(text, quoted);
    const contextualWithSpaces = findContextualOutputCandidates(
        text,
        [...quoted, ...explicitWithSpaces]
    );
    const candidates = uniqueCandidates([
        ...quoted,
        ...explicitWithSpaces,
        ...contextualWithSpaces,
        ...findUnquotedCandidates(
            text,
            [...quoted, ...explicitWithSpaces, ...contextualWithSpaces]
        )
    ]);
    return candidates.filter(candidate =>
        isExplicitPath(candidate.value) || OUTPUT_FILE_CONTEXT.test(text)
    );
}

function decorateSegments(segments, candidates, cwd) {
    const ranges = candidates
        .map(candidate => ({
            ...candidate,
            resolvedPath: resolveFilePath(candidate.value, cwd)
        }))
        .filter(candidate => candidate.resolvedPath);
    if (!ranges.length) return segments;

    const result = [];
    let offset = 0;
    for (const segment of segments) {
        const text = String(segment && segment.text || '');
        const segmentStart = offset;
        const segmentEnd = segmentStart + text.length;
        const boundaries = new Set([0, text.length]);
        for (const range of ranges) {
            if (range.start < segmentEnd && range.end > segmentStart) {
                boundaries.add(Math.max(0, range.start - segmentStart));
                boundaries.add(Math.min(text.length, range.end - segmentStart));
            }
        }
        const points = [...boundaries].sort((a, b) => a - b);
        for (let index = 0; index < points.length - 1; index += 1) {
            const start = points[index];
            const end = points[index + 1];
            if (end <= start) continue;
            const absoluteStart = segmentStart + start;
            const range = ranges.find(item =>
                absoluteStart >= item.start && absoluteStart < item.end
            );
            result.push({
                ...segment,
                text: text.slice(start, end),
                ...(range ? {
                    fileLink: {
                        path: range.resolvedPath,
                        source: range.value
                    }
                } : {})
            });
        }
        offset = segmentEnd;
    }
    return result;
}

function parseCdTarget(text) {
    const stripped = stripPrompt(text).trim();
    const quoted = stripped.match(/^(?:capture\s+|quietly\s+|qui\s+)?cd\s+"((?:[^"]|"")*)"$/i);
    if (quoted) return quoted[1].replace(/""/g, '"');
    const bare = stripped.match(/^(?:capture\s+|quietly\s+|qui\s+)?cd\s+(.+)$/i);
    return bare ? bare[1].trim() : null;
}

function resolveWorkingDirectory(target, cwd) {
    if (!target || isUnsafePathToken(target)) return cwd || null;
    const api = pathApiFor(target, cwd);
    return api.isAbsolute(target)
        ? api.normalize(target)
        : api.resolve(cwd || '.', target);
}

function decorateCommandEntries(entries, cwd) {
    let currentCwd = cwd || null;
    const decorated = (Array.isArray(entries) ? entries : []).map(entry => {
        const text = entryText(entry);
        const next = {
            ...entry,
            segments: decorateSegments(
                Array.isArray(entry.segments) ? entry.segments : [],
                commandFileCandidates(text),
                currentCwd
            )
        };
        const cdTarget = parseCdTarget(text);
        if (cdTarget) currentCwd = resolveWorkingDirectory(cdTarget, currentCwd);
        return next;
    });
    return { entries: decorated, cwd: currentCwd };
}

function decorateOutputEntries(entries, cwd) {
    let currentCwd = cwd || null;
    const decorated = (Array.isArray(entries) ? entries : []).map(entry => {
        const text = entryText(entry);
        const next = {
            ...entry,
            segments: decorateSegments(
                Array.isArray(entry.segments) ? entry.segments : [],
                outputFileCandidates(text),
                currentCwd
            )
        };
        const cdTarget = parseCdTarget(text);
        if (cdTarget) currentCwd = resolveWorkingDirectory(cdTarget, currentCwd);
        return next;
    });
    return { entries: decorated, cwd: currentCwd };
}

function isTextFilePath(filePath) {
    return TEXT_FILE_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

module.exports = {
    commandFileCandidates,
    decorateCommandEntries,
    decorateOutputEntries,
    entryText,
    isTextFilePath,
    outputFileCandidates,
    parseCdTarget,
    resolveFilePath,
    resolveWorkingDirectory
};
