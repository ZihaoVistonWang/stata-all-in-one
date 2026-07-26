const fs = require('fs');
const path = require('path');

const FILE_EXTENSIONS = new Set([
    '.ado', '.avif', '.bmp', '.csv', '.dct', '.doc', '.docx', '.do', '.dta', '.eps',
    '.exe', '.gif', '.gph', '.gz', '.htm', '.html', '.ico', '.ipynb', '.irf',
    '.jpe', '.jpeg', '.jpg', '.json', '.log', '.mata', '.md', '.mlib', '.odt', '.pdf',
    '.plugin', '.png', '.ppt', '.pptx', '.ps',
    '.rar', '.rtf', '.sas7bdat', '.sav', '.smcl', '.sthlp', '.svg', '.tex',
    '.ster', '.tif', '.tiff', '.tsv', '.txt', '.xls', '.xlsb', '.xlsm',
    '.webp', '.xlsx', '.xml', '.xpt', '.zip', '.7z'
]);

const TEXT_FILE_EXTENSIONS = new Set([
    '.ado', '.csv', '.dct', '.do', '.htm', '.html', '.ipynb', '.json',
    '.log', '.mata', '.md', '.rtf', '.sthlp', '.tex', '.tsv',
    '.txt', '.xml'
]);

const STATA_FILE_EXTENSIONS = new Set(['.smcl']);
const IMAGE_FILE_EXTENSIONS = new Set([
    '.avif', '.bmp', '.gif', '.ico', '.jpe', '.jpeg', '.jpg', '.png', '.svg',
    '.webp'
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

function isVerifiedWebTarget(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
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
    return candidates.filter(candidate => {
        const isQuoted = quoted.some(range =>
            range.start === candidate.start && range.end === candidate.end
        );
        const isStandalone = !text.slice(0, candidate.start).trim()
            && !text.slice(candidate.end).trim();
        return isQuoted
            || isExplicitPath(candidate.value)
            || isStandalone
            || OUTPUT_FILE_CONTEXT.test(text);
    });
}

function outputExtensionCandidates(text) {
    const quoted = findQuotedCandidates(text);
    return uniqueCandidates([
        ...outputFileCandidates(text),
        ...findUnquotedCandidates(text, quoted)
    ]);
}

function backwardCandidateVariants(text, candidate, maxWords = 5) {
    const source = String(text || '');
    const base = {
        start: candidate.start,
        end: candidate.end,
        value: candidate.value
    };
    const currentWords = String(candidate.value || '').trim().split(/\s+/).filter(Boolean);
    const isQuoted = source[base.start - 1] === '"' && source[base.end] === '"';
    if (isQuoted
        || isExplicitPath(base.value)
        || currentWords.length !== 1
        || maxWords <= 1) {
        return [base];
    }

    const variants = [base];
    let start = base.start;
    let wordCount = 1;
    while (wordCount < maxWords && start > 0) {
        const prefix = source.slice(0, start);
        const match = /(\S+)\s*$/.exec(prefix);
        if (!match) break;
        start = match.index;
        variants.push({
            start,
            end: base.end,
            value: source.slice(start, base.end).trim()
        });
        wordCount += 1;
    }
    return variants;
}

function verifiedLocalLink(value, cwd, options = {}) {
    const raw = String(value || '').trim().replace(/""/g, '"');
    if (isUnsafePathToken(raw)) return null;
    const api = pathApiFor(raw, cwd);
    const primaryPath = api.isAbsolute(raw)
        ? api.normalize(raw)
        : (cwd ? api.resolve(cwd, raw) : null);
    if (!primaryPath) return null;

    const candidates = [primaryPath];
    if (!api.isAbsolute(raw) && cwd) {
        const normalizedRaw = api.normalize(raw);
        const firstPart = normalizedRaw.split(api.sep)[0];
        const cwdBase = api.basename(api.normalize(cwd));
        const sameDirectory = api === path.win32
            ? firstPart.toLowerCase() === cwdBase.toLowerCase()
            : firstPart === cwdBase;
        if (sameDirectory && firstPart && firstPart !== '.' && firstPart !== '..') {
            const deduplicatedPath = api.resolve(api.dirname(cwd), normalizedRaw);
            if (deduplicatedPath !== primaryPath) candidates.push(deduplicatedPath);
        }
    }

    const statSync = options.statSync || fs.statSync;
    const verified = [];
    for (const resolvedPath of candidates) {
        try {
            const stat = statSync(resolvedPath);
            if (stat.isFile()) {
                verified.push({
                    kind: 'file',
                    target: resolvedPath,
                    source: options.source || 'extension-fallback',
                    verified: true
                });
            } else if (stat.isDirectory()) {
                verified.push({
                    kind: 'directory',
                    target: resolvedPath,
                    source: options.source || 'smcl-explicit',
                    verified: true
                });
            }
        } catch (_error) {
            // A missing candidate is expected while checking the conservative
            // cwd-directory overlap fallback.
        }
    }
    return verified.length === 1 ? verified[0] : null;
}

async function verifiedLocalLinkAsync(value, cwd, options = {}) {
    const raw = String(value || '').trim().replace(/""/g, '"');
    if (isUnsafePathToken(raw)) return null;
    const api = pathApiFor(raw, cwd);
    const primaryPath = api.isAbsolute(raw)
        ? api.normalize(raw)
        : (cwd ? api.resolve(cwd, raw) : null);
    if (!primaryPath) return null;

    const candidates = [primaryPath];
    if (!api.isAbsolute(raw) && cwd) {
        const normalizedRaw = api.normalize(raw);
        const firstPart = normalizedRaw.split(api.sep)[0];
        const cwdBase = api.basename(api.normalize(cwd));
        const sameDirectory = api === path.win32
            ? firstPart.toLowerCase() === cwdBase.toLowerCase()
            : firstPart === cwdBase;
        if (sameDirectory && firstPart && firstPart !== '.' && firstPart !== '..') {
            const deduplicatedPath = api.resolve(api.dirname(cwd), normalizedRaw);
            if (deduplicatedPath !== primaryPath) candidates.push(deduplicatedPath);
        }
    }

    const stat = options.stat || fs.promises.stat;
    const checked = await Promise.all(candidates.map(async target => {
        try {
            const valueStat = await stat(target);
            if (valueStat.isFile()) return { kind: 'file', target };
            if (valueStat.isDirectory()) return { kind: 'directory', target };
        } catch (_error) {}
        return null;
    }));
    const verified = checked.filter(Boolean);
    if (verified.length !== 1) return null;
    return {
        ...verified[0],
        source: options.source || (verified[0].kind === 'file'
            ? 'extension-fallback'
            : 'smcl-explicit'),
        verified: true
    };
}

function decorateSegments(segments, candidates, cwd, options = {}) {
    const ranges = candidates
        .map(candidate => ({
            ...candidate,
            link: verifiedLocalLink(candidate.value, cwd, options)
        }))
        .filter(candidate => candidate.link && candidate.link.kind === 'file');
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
                    tokenType: 'string',
                    className: 'tok tok-string',
                    style: {
                        ...(segment && segment.style ? segment.style : {}),
                        color: null
                    },
                    consoleLink: range.link,
                    fileLink: {
                        path: range.link.target,
                        source: range.value
                    }
                } : {})
            });
        }
        offset = segmentEnd;
    }
    return result;
}

function decorateCommandEntries(entries, cwd) {
    const decorated = (Array.isArray(entries) ? entries : []).map(entry => {
        return {
            ...entry,
            segments: (Array.isArray(entry.segments) ? entry.segments : [])
                .map(segment => {
                    if (!segment || typeof segment !== 'object') return segment;
                    const { fileLink: _fileLink, ...plainSegment } = segment;
                    return plainSegment;
                })
        };
    });
    return { entries: decorated, cwd: cwd || null };
}

function decorateOutputEntries(entries, cwd, options = {}) {
    const decorated = (Array.isArray(entries) ? entries : []).map(entry => {
        const text = entryText(entry);
        const isCommand = ['command', 'comment-command'].includes(
            String(entry && entry.kind || '')
        ) || /^[.>]\s/.test(text);
        const next = {
            ...entry,
            segments: isCommand
                ? (Array.isArray(entry.segments) ? entry.segments : [])
                    .map(segment => {
                        if (!segment || typeof segment !== 'object') return segment;
                        const { fileLink: _fileLink, ...plainSegment } = segment;
                        return plainSegment;
                    })
                : decorateSegments(
                    Array.isArray(entry.segments) ? entry.segments : [],
                    outputFileCandidates(text),
                    cwd,
                    options
                )
        };
        return next;
    });
    return {
        entries: decorateWrappedOutputPaths(decorated, cwd, options),
        cwd: cwd || null
    };
}

function entryCharacterMap(entries) {
    const text = [];
    const map = [];
    const list = Array.isArray(entries) ? entries : [];
    let previousOutput = false;
    for (let entryIndex = 0; entryIndex < list.length; entryIndex += 1) {
        const entry = list[entryIndex];
        const kind = String(entry && entry.kind || '');
        const isCommand = ['command', 'comment-command', 'raw-progress', 'raw-prompt'].includes(kind);
        const value = entryText(entry);
        if (isCommand) {
            previousOutput = false;
            continue;
        }
        const continuation = previousOutput && /^>\s?/.test(value);
        if (previousOutput && !continuation) {
            text.push('\n');
            map.push(null);
        }
        const skipped = continuation ? (value.match(/^>\s?/) || [''])[0].length : 0;
        for (let charIndex = skipped; charIndex < value.length; charIndex += 1) {
            text.push(value[charIndex]);
            map.push({ entryIndex, charIndex });
        }
        previousOutput = true;
    }
    return { text: text.join(''), map };
}

async function collectVerifiedOutputLinks(entries, cwd, options = {}) {
    const list = Array.isArray(entries) ? entries : [];
    const candidates = [];
    for (let entryIndex = 0; entryIndex < list.length; entryIndex += 1) {
        const entry = list[entryIndex];
        const text = entryText(entry);
        const isCommand = ['command', 'comment-command'].includes(
            String(entry && entry.kind || '')
        ) || /^[.>]\s/.test(text);
        if (!isCommand) {
            candidates.push(...outputExtensionCandidates(text).map(candidate => ({
                ...candidate,
                sourceText: text,
                occurrences: [{
                    entryIndex,
                    start: candidate.start,
                    end: candidate.end
                }]
            })));
        }
    }

    const flattened = entryCharacterMap(list);
    for (const candidate of outputFileCandidates(flattened.text)) {
        const coveredEntries = new Set(
            flattened.map
                .slice(candidate.start, candidate.end)
                .filter(Boolean)
                .map(point => point.entryIndex)
        );
        if (coveredEntries.size >= 2) {
            candidates.push({
                ...candidate,
                occurrences: [{
                    canonicalStart: candidate.start,
                    canonicalEnd: candidate.end
                }]
            });
        }
    }

    const stat = options.stat || fs.promises.stat;
    const statCache = new Map();
    const cachedStat = target => {
        if (!statCache.has(target)) {
            statCache.set(target, Promise.resolve().then(() => stat(target)));
        }
        return statCache.get(target);
    };
    const selectedCandidates = [];
    for (const candidate of candidates) {
        const variants = candidate.sourceText
            ? backwardCandidateVariants(candidate.sourceText, candidate, 10)
            : [{
                start: candidate.start,
                end: candidate.end,
                value: candidate.value
            }];
        let selected = null;
        for (const variant of variants) {
            const link = await verifiedLocalLinkAsync(variant.value, cwd, {
                ...options,
                stat: cachedStat,
                source: 'extension-fallback'
            });
            if (link && link.kind === 'file') {
                selected = { variant, link };
                break;
            }
        }
        if (!selected) continue;
        selectedCandidates.push({
            value: selected.variant.value,
            link: selected.link,
            occurrences: candidate.occurrences.map(occurrence => {
                if (!Number.isInteger(occurrence.entryIndex)) return occurrence;
                return {
                    entryIndex: occurrence.entryIndex,
                    start: selected.variant.start,
                    end: selected.variant.end
                };
            })
        });
    }

    const groupedCandidates = new Map();
    for (const candidate of selectedCandidates) {
        const key = `${candidate.value}\u0000${candidate.link.target}`;
        if (!groupedCandidates.has(key)) {
            groupedCandidates.set(key, {
                value: candidate.value,
                link: candidate.link,
                occurrences: []
            });
        }
        groupedCandidates.get(key).occurrences.push(
            ...(candidate.occurrences || [])
        );
    }

    const links = [];
    for (const candidate of groupedCandidates.values()) {
        links.push({
            kind: 'path',
            target: candidate.link.target,
            label: candidate.value,
            source: 'extension-fallback',
            verifiedLink: candidate.link,
            occurrences: candidate.occurrences
        });
    }
    return links;
}

async function validateSemanticLinks(links, cwd, options = {}) {
    const validated = [];
    for (const semantic of Array.isArray(links) ? links : []) {
        if (semantic.kind === 'url') {
            if (/^https?:\/\//i.test(String(semantic.target || ''))) {
                validated.push({
                    ...semantic,
                    verifiedLink: {
                        kind: 'url',
                        target: String(semantic.target),
                        source: semantic.source || 'smcl-explicit',
                        verified: true
                    }
                });
            }
            continue;
        }
        const link = await verifiedLocalLinkAsync(semantic.target, cwd, {
            ...options,
            source: semantic.source || 'smcl-output'
        });
        if (!link) continue;
        if (semantic.kind === 'directory' && link.kind !== 'directory') continue;
        validated.push({ ...semantic, verifiedLink: link });
    }
    return validated;
}

function addRange(rangesByEntry, entryIndex, start, end, link) {
    if (end <= start) return;
    if (!rangesByEntry.has(entryIndex)) rangesByEntry.set(entryIndex, []);
    rangesByEntry.get(entryIndex).push({ start, end, link });
}

function mapCanonicalRange(map, start, end, link, rangesByEntry) {
    let active = null;
    for (let index = start; index < end; index += 1) {
        const point = map[index];
        if (!point) continue;
        if (!active
            || active.entryIndex !== point.entryIndex
            || active.end !== point.charIndex) {
            if (active) {
                addRange(
                    rangesByEntry,
                    active.entryIndex,
                    active.start,
                    active.end,
                    link
                );
            }
            active = {
                entryIndex: point.entryIndex,
                start: point.charIndex,
                end: point.charIndex + 1
            };
        } else {
            active.end = point.charIndex + 1;
        }
    }
    if (active) {
        addRange(rangesByEntry, active.entryIndex, active.start, active.end, link);
    }
}

function decorateSegmentsWithLinks(segments, ranges) {
    if (!Array.isArray(ranges) || !ranges.length) return segments;
    const result = [];
    let offset = 0;
    for (const segment of Array.isArray(segments) ? segments : []) {
        const text = String(segment && segment.text || '');
        const boundaries = new Set([0, text.length]);
        for (const range of ranges) {
            if (range.start < offset + text.length && range.end > offset) {
                boundaries.add(Math.max(0, range.start - offset));
                boundaries.add(Math.min(text.length, range.end - offset));
            }
        }
        const points = [...boundaries].sort((a, b) => a - b);
        for (let index = 0; index < points.length - 1; index += 1) {
            const start = points[index];
            const end = points[index + 1];
            const range = ranges.find(item =>
                offset + start >= item.start && offset + start < item.end
            );
            result.push({
                ...segment,
                text: text.slice(start, end),
                ...(range ? {
                    tokenType: 'string',
                    className: 'tok tok-string',
                    style: {
                        ...(segment && segment.style ? segment.style : {}),
                        color: null
                    },
                    consoleLink: range.link,
                    ...(range.link.kind === 'file' ? {
                        fileLink: {
                            path: range.link.target,
                            source: range.link.source
                        }
                    } : {})
                } : {})
            });
        }
        offset += text.length;
    }
    return result;
}

function decorateWrappedOutputPaths(entries, cwd, options = {}) {
    const flattened = entryCharacterMap(entries);
    if (!flattened.text) return entries;

    const rangesByEntry = new Map();
    for (const candidate of outputFileCandidates(flattened.text)) {
        const coveredEntries = new Set(
            flattened.map
                .slice(candidate.start, candidate.end)
                .filter(Boolean)
                .map(point => point.entryIndex)
        );
        if (coveredEntries.size < 2) continue;

        const link = verifiedLocalLink(candidate.value, cwd, options);
        if (!link || link.kind !== 'file') continue;
        mapCanonicalRange(
            flattened.map,
            candidate.start,
            candidate.end,
            link,
            rangesByEntry
        );
    }

    if (!rangesByEntry.size) return entries;
    return entries.map((entry, entryIndex) => {
        const ranges = rangesByEntry.get(entryIndex);
        if (!ranges) return entry;
        return {
            ...entry,
            segments: decorateSegmentsWithLinks(entry.segments, ranges)
        };
    });
}

function applySmclLinksToEntries(entries, smclLinks, cwd, options = {}) {
    const list = (Array.isArray(entries) ? entries : []).map(entry => ({
        ...entry,
        segments: (Array.isArray(entry && entry.segments) ? entry.segments : [])
            .map(segment => ({ ...segment }))
    }));
    if (!list.length || !Array.isArray(smclLinks) || !smclLinks.length) {
        return { entries: list, applied: 0 };
    }

    const flattened = entryCharacterMap(list);
    const rangesByEntry = new Map();
    let applied = 0;
    for (const semantic of smclLinks) {
        let link;
        if (semantic.verifiedLink && semantic.verifiedLink.verified) {
            link = semantic.verifiedLink;
        } else if (semantic.kind === 'url') {
            if (!isVerifiedWebTarget(semantic.target)) continue;
            link = {
                kind: 'url',
                target: String(semantic.target),
                source: semantic.source || 'smcl-explicit',
                verified: true
            };
        } else {
            link = verifiedLocalLink(semantic.target, cwd, {
                ...options,
                source: semantic.source || 'smcl-output'
            });
            if (!link) continue;
            if (semantic.kind === 'directory' && link.kind !== 'directory') continue;
        }

        const target = String(semantic.target || '');
        const label = String(semantic.label || '');
        if (semantic.source === 'extension-fallback'
            && Array.isArray(semantic.occurrences)
            && semantic.occurrences.length) {
            let occurrenceApplied = false;
            for (const occurrence of semantic.occurrences) {
                if (Number.isInteger(occurrence.entryIndex)) {
                    const entryIndex = occurrence.entryIndex;
                    if (entryIndex < 0 || entryIndex >= list.length) continue;
                    const text = entryText(list[entryIndex]);
                    if (text.slice(occurrence.start, occurrence.end) !== label) continue;
                    addRange(
                        rangesByEntry,
                        entryIndex,
                        occurrence.start,
                        occurrence.end,
                        link
                    );
                    occurrenceApplied = true;
                    continue;
                }
                if (Number.isInteger(occurrence.canonicalStart)
                    && Number.isInteger(occurrence.canonicalEnd)
                    && flattened.text.slice(
                        occurrence.canonicalStart,
                        occurrence.canonicalEnd
                    ) === label) {
                    mapCanonicalRange(
                        flattened.map,
                        occurrence.canonicalStart,
                        occurrence.canonicalEnd,
                        link,
                        rangesByEntry
                    );
                    occurrenceApplied = true;
                }
            }
            if (occurrenceApplied) {
                applied += 1;
                continue;
            }
        }

        const exactValues = [target];
        if (semantic.source === 'smcl-explicit' || semantic.source === 'extension-fallback') {
            exactValues.push(label);
            if (link.kind === 'file') exactValues.push(pathApiFor(link.target, cwd).basename(link.target));
        }
        let matchIndex = -1;
        let matchValue = '';
        if (link.kind === 'directory' && /^dir$/i.test(label)) {
            const directoryLabel = /(^|\n)(dir)(?=\s*:)/im.exec(flattened.text);
            if (directoryLabel) {
                matchIndex = directoryLabel.index + directoryLabel[1].length;
                matchValue = directoryLabel[2];
            }
        }
        for (const value of [...new Set(exactValues.filter(Boolean))].sort((a, b) => b.length - a.length)) {
            if (matchIndex >= 0) break;
            matchIndex = flattened.text.indexOf(value);
            if (matchIndex >= 0) {
                matchValue = value;
                break;
            }
        }
        if (matchIndex < 0) continue;
        mapCanonicalRange(
            flattened.map,
            matchIndex,
            matchIndex + matchValue.length,
            link,
            rangesByEntry
        );
        applied += 1;
    }

    for (const [entryIndex, ranges] of rangesByEntry.entries()) {
        list[entryIndex].segments = decorateSegmentsWithLinks(
            list[entryIndex].segments,
            ranges
        );
    }
    return { entries: list, applied };
}

function isTextFilePath(filePath) {
    return TEXT_FILE_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function isImageFilePath(filePath) {
    return IMAGE_FILE_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function isStataFilePath(filePath) {
    return STATA_FILE_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

module.exports = {
    commandFileCandidates,
    collectVerifiedOutputLinks,
    decorateCommandEntries,
    decorateOutputEntries,
    applySmclLinksToEntries,
    entryText,
    hasFileExtension,
    isImageFilePath,
    isStataFilePath,
    isTextFilePath,
    isVerifiedWebTarget,
    outputFileCandidates,
    resolveFilePath,
    validateSemanticLinks,
    verifiedLocalLinkAsync,
    verifiedLocalLink
};
