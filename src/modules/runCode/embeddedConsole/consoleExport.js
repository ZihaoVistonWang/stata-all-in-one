const fs = require('fs');
const path = require('path');

const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=ZihaoVistonWang.stata-all-in-one';
const EXPORT_BASENAME = 'stata-all-in-one-export';

function entryText(entry) {
    return (Array.isArray(entry && entry.segments) ? entry.segments : [])
        .map(segment => String(segment && segment.text || ''))
        .join('');
}

function isBlankEntry(entry) {
    return String(entry && entry.kind || '') === 'blank';
}

function isCommandEntry(entry) {
    const kind = String(entry && entry.kind || '');
    return kind === 'command' || kind === 'comment-command';
}

function trimBlankEntries(entries) {
    const result = Array.isArray(entries) ? entries.slice() : [];
    while (result.length && isBlankEntry(result[0])) result.shift();
    while (result.length && isBlankEntry(result[result.length - 1])) result.pop();
    return result;
}

function stripCommandPrompt(text) {
    return String(text || '').replace(/^[.>]\s?/, '');
}

function createRun(entries, footer) {
    const normalized = trimBlankEntries(entries);
    const commandEntries = [];
    let outputStarted = false;
    const outputEntries = [];

    for (const entry of normalized) {
        if (!outputStarted && isCommandEntry(entry)) {
            commandEntries.push(entry);
        } else {
            outputStarted = true;
            outputEntries.push(entry);
        }
    }

    return {
        code: commandEntries.map(entry => stripCommandPrompt(entryText(entry))).join('\n'),
        commandEntries,
        outputEntries: trimBlankEntries(outputEntries),
        footer: footer ? entryText(footer) : ''
    };
}

function groupConsoleHistory(entries) {
    const runs = [];
    let pending = [];

    for (const entry of Array.isArray(entries) ? entries : []) {
        if (String(entry && entry.kind || '') === 'footer') {
            runs.push(createRun(pending, entry));
            pending = [];
        } else {
            pending.push(entry);
        }
    }

    pending = trimBlankEntries(pending);
    if (pending.length) {
        runs.push(createRun(pending, null));
    }
    return runs.filter(run => run.code || run.outputEntries.length || run.footer);
}

function normalizeGraphFormat(entry) {
    return String(entry && entry.format || path.extname(String(entry && entry.filePath || '')).slice(1) || 'svg')
        .trim()
        .toLowerCase();
}

function graphMimeType(format) {
    if (format === 'png') return 'image/png';
    if (format === 'jpg' || format === 'jpeg') return 'image/jpeg';
    if (format === 'gif') return 'image/gif';
    if (format === 'webp') return 'image/webp';
    return 'image/svg+xml';
}

async function loadGraphAsset(entry, readFile) {
    const format = normalizeGraphFormat(entry);
    const mimeType = graphMimeType(format);
    try {
        let buffer;
        if (mimeType === 'image/svg+xml' && entry && entry.svgText) {
            buffer = Buffer.from(String(entry.svgText), 'utf8');
        } else {
            buffer = await readFile(String(entry && entry.filePath || ''));
        }
        if (!buffer || !buffer.length) throw new Error('empty graph file');
        const base64 = Buffer.from(buffer).toString('base64');
        return {
            available: true,
            mimeType,
            base64,
            dataUrl: `data:${mimeType};base64,${base64}`,
            svgText: mimeType === 'image/svg+xml' ? Buffer.from(buffer).toString('utf8') : ''
        };
    } catch (_error) {
        return { available: false, mimeType, base64: '', dataUrl: '', svgText: '' };
    }
}

async function prepareRuns(entries, options) {
    const readFile = options.readFile || fs.promises.readFile;
    const missingGraphs = [];
    const runs = groupConsoleHistory(entries);

    for (const run of runs) {
        run.items = [];
        for (const entry of run.outputEntries) {
            if (String(entry && entry.kind || '') !== 'graph') {
                run.items.push({ type: 'text', entry, text: entryText(entry) });
                continue;
            }
            const asset = await loadGraphAsset(entry, readFile);
            const graphName = String(entry.graphName || 'Graph');
            if (!asset.available) missingGraphs.push(graphName);
            run.items.push({ type: 'graph', entry, graphName, asset });
        }
    }
    return { runs, missingGraphs };
}

function sourceParts(options) {
    return {
        before: String(options.sourceBefore || 'This result file was exported by '),
        after: String(options.sourceAfter || '.'),
        linkText: 'Stata All in One'
    };
}

function unavailableText(item, options) {
    if (typeof options.graphUnavailable === 'function') {
        return String(options.graphUnavailable(item.graphName));
    }
    return `[Graph unavailable: ${item.graphName}]`;
}

function longestBacktickRun(text) {
    const matches = String(text || '').match(/`+/g) || [];
    return matches.reduce((max, value) => Math.max(max, value.length), 0);
}

function fencedBlock(text, language, quoted = false) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const fence = '`'.repeat(Math.max(3, longestBacktickRun(normalized) + 1));
    const lines = [`${fence}${language || ''}`, ...normalized.split('\n'), fence];
    return quoted ? lines.map(line => `> ${line}`).join('\n') : lines.join('\n');
}

function aggregateTextItems(items, options) {
    const events = [];
    let lines = [];
    const flush = () => {
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        if (lines.length) events.push({ type: 'text', text: lines.join('\n') });
        lines = [];
    };

    for (const item of items) {
        if (item.type === 'text') {
            lines.push(item.text);
        } else {
            flush();
            events.push(item.asset.available
                ? item
                : { type: 'text', text: unavailableText(item, options) });
        }
    }
    flush();
    return events;
}

function serializeMarkdown(prepared, options) {
    const source = sourceParts(options);
    const sections = [
        `${source.before}[${source.linkText}](${MARKETPLACE_URL})${source.after}`
    ];

    prepared.runs.forEach((run, index) => {
        const blocks = [];
        if (run.code) blocks.push(fencedBlock(run.code, 'stata', true));
        for (const event of aggregateTextItems(run.items, options)) {
            if (event.type === 'text') {
                blocks.push(fencedBlock(event.text, 'text'));
            } else {
                const alt = event.graphName.replace(/([\\\]])/g, '\\$1');
                blocks.push(`![${alt}](${event.asset.dataUrl})`);
            }
        }
        if (run.footer) blocks.push(`*${run.footer}*`);
        if (index < prepared.runs.length - 1) blocks.push('---');
        sections.push(blocks.join('\n\n'));
    });

    return `${sections.filter(Boolean).join('\n\n')}\n`;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function segmentStyle(segment) {
    const style = segment && segment.style || {};
    const rules = [];
    if (style.color) rules.push(`color:${style.color}`);
    if (style.backgroundColor) rules.push(`background-color:${style.backgroundColor}`);
    if (style.bold) rules.push('font-weight:700');
    if (style.italic) rules.push('font-style:italic');
    if (style.dim) rules.push('opacity:.72');
    return rules.join(';');
}

function renderHtmlTextEntry(entry) {
    const kind = escapeHtml(String(entry && entry.kind || 'default'));
    const segments = Array.isArray(entry && entry.segments) ? entry.segments : [];
    const body = segments.map(segment => {
        const style = segmentStyle(segment);
        const tokenType = escapeHtml(String(segment && segment.tokenType || 'plain'));
        return `<span class="token token-${tokenType}"${style ? ` style="${escapeHtml(style)}"` : ''}>${escapeHtml(segment && segment.text || '')}</span>`;
    }).join('');
    return `<div class="output-line output-${kind}">${body || '&nbsp;'}</div>`;
}

function serializeHtml(prepared, options) {
    const source = sourceParts(options);
    const lang = String(options.language || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
    const runs = prepared.runs.map((run, index) => {
        const content = [];
        if (run.code) content.push(`<pre class="command"><code>${escapeHtml(run.code)}</code></pre>`);
        for (const item of run.items) {
            if (item.type === 'text') {
                content.push(renderHtmlTextEntry(item.entry));
            } else if (item.asset.available) {
                content.push(`<figure><img src="${item.asset.dataUrl}" alt="${escapeHtml(item.graphName)}"><figcaption>${escapeHtml(item.graphName)}</figcaption></figure>`);
            } else {
                content.push(`<div class="graph-unavailable">${escapeHtml(unavailableText(item, options))}</div>`);
            }
        }
        if (run.footer) content.push(`<div class="footer"><span>${escapeHtml(run.footer)}</span></div>`);
        return `<section class="run">${content.join('\n')}</section>${index < prepared.runs.length - 1 ? '<hr>' : ''}`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stata All in One Export</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1f2328;--muted:#656d76;--border:#d0d7de;--code:#f6f8fa;--command:#8250df;--error:#cf222e;--header:#0969da} @media(prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--code:#161b22;--command:#d2a8ff;--error:#ff7b72;--header:#79c0ff}} *{box-sizing:border-box} body{max-width:1100px;margin:0 auto;padding:32px 24px 64px;background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace}.source{margin:0 0 28px;color:var(--muted);font-family:system-ui,sans-serif}.source a{color:var(--header)}.run{margin:0}.command{margin:0 0 14px;padding:14px 16px;border-left:3px solid var(--command);border-radius:6px;background:var(--code);white-space:pre-wrap;overflow-wrap:anywhere}.output-line{min-height:1.5em;padding-left:1rem;white-space:pre-wrap;tab-size:4;overflow-wrap:anywhere}.output-error,.output-break,.output-warning{color:var(--error)}figure{margin:18px 0;padding:14px;border:1px solid var(--border);border-radius:8px;text-align:center}figure img{display:block;max-width:100%;height:auto;margin:auto;background:#fff}figcaption{margin-top:8px;color:var(--muted)}.graph-unavailable{margin:14px 0;color:var(--error)}.footer{display:flex;align-items:center;gap:10px;margin-top:14px;color:var(--muted)}.footer:before,.footer:after{content:"";height:1px;flex:1;background:var(--border)}.footer span{white-space:nowrap}hr{margin:28px 0;border:0;border-top:1px solid var(--border)}
</style>
</head>
<body>
<p class="source">${escapeHtml(source.before)}<a href="${MARKETPLACE_URL}">${source.linkText}</a>${escapeHtml(source.after)}</p>
${runs}
</body>
</html>
`;
}

function notebookSource(value) {
    return String(value || '');
}

function notebookOutputs(run, options) {
    const outputs = [];
    for (const event of aggregateTextItems(run.items, options)) {
        if (event.type === 'text') {
            outputs.push({ output_type: 'stream', name: 'stdout', text: `${event.text}\n` });
            continue;
        }
        const data = event.asset.mimeType === 'image/svg+xml'
            ? { 'image/svg+xml': event.asset.svgText, 'text/plain': `<${event.graphName}>` }
            : { [event.asset.mimeType]: event.asset.base64, 'text/plain': `<${event.graphName}>` };
        outputs.push({ output_type: 'display_data', metadata: {}, data });
    }
    return outputs;
}

function serializeNotebook(prepared, options) {
    const source = sourceParts(options);
    const cells = [{
        cell_type: 'markdown',
        metadata: {},
        source: notebookSource(`${source.before}[${source.linkText}](${MARKETPLACE_URL})${source.after}`)
    }];

    prepared.runs.forEach((run, index) => {
        cells.push({
            cell_type: 'code',
            execution_count: index + 1,
            metadata: {},
            outputs: notebookOutputs(run, options),
            source: notebookSource(run.code)
        });
    });

    return `${JSON.stringify({
        cells,
        metadata: {
            kernelspec: {
                display_name: 'Stata (nbstata)',
                language: 'stata',
                name: 'nbstata'
            },
            language_info: {
                file_extension: '.do',
                mimetype: 'text/x-stata',
                name: 'stata'
            }
        },
        nbformat: 4,
        nbformat_minor: 5
    }, null, 2)}\n`;
}

async function serializeConsoleExport(entries, format, options = {}) {
    const prepared = await prepareRuns(entries, options);
    let content;
    if (format === 'html') content = serializeHtml(prepared, options);
    else if (format === 'md') content = serializeMarkdown(prepared, options);
    else if (format === 'ipynb') content = serializeNotebook(prepared, options);
    else throw new Error(`Unsupported console export format: ${format}`);
    return { content, missingGraphs: prepared.missingGraphs };
}

function padNumber(value) {
    return String(value).padStart(2, '0');
}

function createExportFilename(date = new Date(), extension = 'html') {
    const stamp = [
        date.getFullYear(),
        padNumber(date.getMonth() + 1),
        padNumber(date.getDate())
    ].join('') + '-' + [
        padNumber(date.getHours()),
        padNumber(date.getMinutes()),
        padNumber(date.getSeconds())
    ].join('');
    return `${EXPORT_BASENAME}-${stamp}.${String(extension || 'html').replace(/^\./, '')}`;
}

module.exports = {
    MARKETPLACE_URL,
    createExportFilename,
    groupConsoleHistory,
    serializeConsoleExport
};
