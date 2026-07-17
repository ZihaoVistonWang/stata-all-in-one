const fs = require('fs');
const path = require('path');

const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=ZihaoVistonWang.stata-all-in-one';
const EXPORT_BASENAME = 'stata-all-in-one-export';
const ONLINE_CJK_FONT_CSS_URL = 'https://fontsapi.zeoseven.com/442/main/result.css';
const ONLINE_LATIN_FONT_WOFF2_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/maple-mono@latest/latin-400-normal.woff2';
const ONLINE_LATIN_FONT_WOFF_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/maple-mono@latest/latin-400-normal.woff';

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
    if (style.bold) rules.push('font-weight:700');
    if (style.italic) rules.push('font-style:italic');
    if (style.dim) rules.push('opacity:.72');
    return rules.join(';');
}

function tokenClassName(value) {
    return String(value || 'plain').replace(/[^A-Za-z0-9_-]+/g, '-');
}

function renderHtmlSegments(entry, stripPrompt = false) {
    const segments = Array.isArray(entry && entry.segments) ? entry.segments : [];
    let firstSegment = true;
    return segments.map(segment => {
        let text = String(segment && segment.text || '');
        if (stripPrompt && firstSegment) {
            text = text.replace(/^[.>]\s?/, '');
        }
        firstSegment = false;
        if (!text) return '';
        const style = segmentStyle(segment);
        const tokenType = tokenClassName(segment && segment.tokenType);
        return `<span class="token token-${tokenType}"${style ? ` style="${escapeHtml(style)}"` : ''}>${escapeHtml(text)}</span>`;
    }).join('');
}

function renderHtmlTextEntry(entry) {
    const kind = escapeHtml(String(entry && entry.kind || 'default'));
    const body = renderHtmlSegments(entry);
    return `<div class="output-line output-${kind}">${body || '&nbsp;'}</div>`;
}

function renderHtmlCommand(run) {
    if (!run.commandEntries.length) return escapeHtml(run.code);
    return run.commandEntries.map(entry => renderHtmlSegments(entry, true)).join('\n');
}

function firstInputLine(code) {
    return String(code || '').split('\n')[0].trim() || '(empty input)';
}

function htmlUiLabels(lang) {
    const isChinese = lang === 'zh-CN';
    return {
        navigation: isChinese ? '输入导航' : 'Input navigation',
        light: isChinese ? '切换到亮色主题' : 'Switch to light theme',
        dark: isChinese ? '切换到暗色主题' : 'Switch to dark theme'
    };
}

function createHtmlRunViews(runs) {
    let inputCount = 0;
    return runs.map(run => ({
        run,
        inputNumber: run.code ? inputCount += 1 : 0
    }));
}

function renderHtmlNavigation(runViews, label) {
    const markers = runViews
        .filter(view => view.inputNumber)
        .map(view => {
            const preview = firstInputLine(view.run.code);
            const tooltip = `[${view.inputNumber}] ${preview}`;
            return `<a class="nav-marker" href="#input-${view.inputNumber}" data-target="input-${view.inputNumber}" data-tooltip="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}"></a>`;
        })
        .join('\n');
    return markers ? `<nav class="input-nav" aria-label="${escapeHtml(label)}">${markers}</nav>` : '';
}

function renderHtmlRuns(runViews, options) {
    return runViews.map((view, index) => {
        const { run, inputNumber } = view;
        const content = [];
        if (run.code) {
            content.push(`<div class="input-cell" id="input-${inputNumber}" data-input-number="${inputNumber}"><div class="execution-count">[${inputNumber}]:</div><pre class="command"><code>${renderHtmlCommand(run)}</code></pre></div>`);
        }

        const output = [];
        for (const item of run.items) {
            if (item.type === 'text') {
                output.push(renderHtmlTextEntry(item.entry));
            } else if (item.asset.available) {
                output.push(`<figure><img src="${item.asset.dataUrl}" alt="${escapeHtml(item.graphName)}"><figcaption>${escapeHtml(item.graphName)}</figcaption></figure>`);
            } else {
                output.push(`<div class="graph-unavailable">${escapeHtml(unavailableText(item, options))}</div>`);
            }
        }
        if (run.footer) output.push(`<div class="footer"><span>${escapeHtml(run.footer)}</span></div>`);
        if (output.length) {
            content.push(`<div class="run-output${run.code ? '' : ' output-only'}">${output.join('\n')}</div>`);
        }
        return `<section class="run">${content.join('\n')}</section>${index < runViews.length - 1 ? '<hr>' : ''}`;
    }).join('\n');
}

function serializeInteractiveHtml(prepared, options) {
    const source = sourceParts(options);
    const lang = String(options.language || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
    const labels = htmlUiLabels(lang);
    const runViews = createHtmlRunViews(prepared.runs);
    const navigation = renderHtmlNavigation(runViews, labels.navigation);
    const runs = renderHtmlRuns(runViews, options);

    return `<!DOCTYPE html>
<html lang="${lang}" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Stata All in One Export</title>
<link rel="preload" href="${ONLINE_CJK_FONT_CSS_URL}" as="style" crossorigin>
<link rel="stylesheet" href="${ONLINE_CJK_FONT_CSS_URL}" crossorigin>
<script>(function(){try{var saved=localStorage.getItem('stata-all-in-one-export-theme');var theme=saved||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme}catch(_error){}})();</script>
<style>
@font-face {
    font-family: "Maple Mono";
    font-style: normal;
    font-display: swap;
    font-weight: 400;
    src: url("${ONLINE_LATIN_FONT_WOFF2_URL}") format("woff2"),
         url("${ONLINE_LATIN_FONT_WOFF_URL}") format("woff"),
         local("Maple Mono"),
         local("Maple Mono NF CN");
}
:root {
    color-scheme: light;
    --export-mono-font: "Maple Mono", "Maple Mono NF CN", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    --bgColor-default: #ffffff;
    --bgColor-muted: #f6f8fa;
    --bgColor-overlay: #ffffff;
    --fgColor-default: #1f2328;
    --fgColor-muted: #59636e;
    --borderColor-default: #d0d7de;
    --borderColor-muted: rgba(31, 35, 40, 0.15);
    --fgColor-accent: #0969da;
    --fgColor-danger: #d1242f;
    --syntax-comment: #6e7781;
    --syntax-constant: #0550ae;
    --syntax-entity: #8250df;
    --syntax-keyword: #cf222e;
    --syntax-string: #0a3069;
    --syntax-variable: #953800;
    --nav-marker: #8c959f;
    --nav-active: #1f2328;
    --shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
}
:root[data-theme="dark"] {
    color-scheme: dark;
    --bgColor-default: #0d1117;
    --bgColor-muted: #161b22;
    --bgColor-overlay: #161b22;
    --fgColor-default: #c9d1d9;
    --fgColor-muted: #8b949e;
    --borderColor-default: #30363d;
    --borderColor-muted: rgba(240, 246, 252, 0.1);
    --fgColor-accent: #58a6ff;
    --fgColor-danger: #ff7b72;
    --syntax-comment: #8b949e;
    --syntax-constant: #79c0ff;
    --syntax-entity: #d2a8ff;
    --syntax-keyword: #ff7b72;
    --syntax-string: #a5d6ff;
    --syntax-variable: #ffa657;
    --nav-marker: #6e7681;
    --nav-active: #f0f6fc;
    --shadow: 0 8px 24px rgba(1, 4, 9, 0.45);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; background: var(--bgColor-default); }
body {
    max-width: 1180px;
    margin: 0 auto;
    padding: 34px 74px 72px 104px;
    background: var(--bgColor-default);
    color: var(--fgColor-default);
    font-family: var(--export-mono-font);
    font-size: 14px;
    line-height: 1.5;
    transition: background-color 0.18s ease, color 0.18s ease;
}
.source { margin: 0 0 32px; color: var(--fgColor-muted); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.source a { color: var(--fgColor-accent); }
.theme-toggle {
    position: fixed;
    z-index: 20;
    top: 18px;
    right: 20px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 11px;
    border: 1px solid var(--borderColor-default);
    border-radius: 6px;
    background: var(--bgColor-overlay);
    color: var(--fgColor-default);
    box-shadow: var(--shadow);
    font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    cursor: pointer;
}
.theme-toggle:hover { background: var(--bgColor-muted); }
.theme-toggle:focus-visible, .nav-marker:focus-visible { outline: 2px solid var(--fgColor-accent); outline-offset: 2px; }
.theme-toggle svg { width: 15px; height: 15px; fill: currentColor; }
.theme-icon-sun { display: none; }
:root[data-theme="dark"] .theme-icon-sun { display: block; }
:root[data-theme="dark"] .theme-icon-moon { display: none; }
.input-nav {
    position: fixed;
    z-index: 15;
    left: 26px;
    top: 50%;
    display: flex;
    max-height: 70vh;
    transform: translateY(-50%);
    flex-direction: column;
    align-items: flex-start;
    gap: 11px;
    padding: 14px 8px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
}
.input-nav::-webkit-scrollbar { display: none; }
.nav-marker {
    position: relative;
    display: block;
    width: 11px;
    height: 3px;
    border-radius: 2px;
    background: var(--nav-marker);
    opacity: 0.75;
    transition: width 0.15s ease, background-color 0.15s ease, opacity 0.15s ease;
}
.nav-marker:hover, .nav-marker.active { width: 17px; background: var(--nav-active); opacity: 1; }
.nav-tooltip {
    position: fixed;
    z-index: 30;
    width: max-content;
    max-width: min(520px, 70vw);
    padding: 6px 9px;
    transform: translate(4px, -50%);
    border: 1px solid var(--borderColor-default);
    border-radius: 6px;
    background: var(--bgColor-overlay);
    color: var(--fgColor-default);
    box-shadow: var(--shadow);
    font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.12s ease, transform 0.12s ease;
}
.nav-tooltip.visible { opacity: 1; visibility: visible; transform: translate(0, -50%); }
.run { margin: 0; }
.input-cell { display: grid; grid-template-columns: 62px minmax(0, 1fr); align-items: start; scroll-margin-top: 32px; }
.execution-count { padding: 14px 13px 0 0; color: var(--fgColor-accent); font-weight: 600; text-align: right; user-select: none; }
.command {
    min-width: 0;
    margin: 0 0 14px;
    padding: 14px 16px;
    border: 1px solid var(--borderColor-default);
    border-radius: 6px;
    background: var(--bgColor-muted);
    white-space: pre;
    overflow-x: auto;
    overflow-y: hidden;
    overflow-wrap: normal;
    font-family: var(--export-mono-font);
    font-size: inherit;
    line-height: inherit;
    tab-size: 4;
    scrollbar-color: var(--borderColor-default) transparent;
}
.command code { font: inherit; }
.run-output {
    min-width: 0;
    margin-left: 62px;
    padding-bottom: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-color: var(--borderColor-default) transparent;
}
.run-output.output-only { margin-left: 0; }
.output-line {
    width: max-content;
    min-width: 100%;
    min-height: 1.5em;
    padding-left: 1rem;
    white-space: pre;
    font-family: var(--export-mono-font);
    tab-size: 4;
    overflow-wrap: normal;
}
.command::-webkit-scrollbar, .run-output::-webkit-scrollbar { height: 10px; }
.command::-webkit-scrollbar-thumb, .run-output::-webkit-scrollbar-thumb { border: 3px solid transparent; border-radius: 8px; background: var(--borderColor-default); background-clip: padding-box; }
.token { color: var(--fgColor-default); }
.token-prompt { color: var(--fgColor-muted); }
.token-command, .token-function, .token-header { color: var(--syntax-entity); font-weight: 600; }
.token-keyword, .token-option, .token-error { color: var(--syntax-keyword); }
.token-string, .token-path { color: var(--syntax-string); }
.token-number, .token-constant, .token-timeValue { color: var(--syntax-constant); }
.token-comment { color: var(--syntax-comment); font-style: italic; }
.token-variable, .token-macro { color: var(--syntax-variable); }
.token-operator { color: var(--fgColor-default); }
.token-separator, .token-time { color: var(--fgColor-muted); }
.output-error, .output-break, .output-warning { color: var(--fgColor-danger); }
figure { margin: 18px 0; padding: 14px; border: 1px solid var(--borderColor-default); border-radius: 8px; text-align: center; }
figure img { display: block; max-width: 100%; height: auto; margin: auto; background: #ffffff; }
figcaption { margin-top: 8px; color: var(--fgColor-muted); }
.graph-unavailable { margin: 14px 0; color: var(--fgColor-danger); }
.footer { display: flex; align-items: center; gap: 10px; margin-top: 14px; color: var(--fgColor-muted); }
.footer::before, .footer::after { content: ""; height: 1px; flex: 1; background: var(--borderColor-default); }
.footer span { white-space: nowrap; }
hr { margin: 30px 0; border: 0; border-top: 1px solid var(--borderColor-muted); }
@media (max-width: 720px) {
    body { padding: 68px 18px 48px 48px; }
    .input-nav { left: 8px; }
    .input-cell { grid-template-columns: 46px minmax(0, 1fr); }
    .run-output { margin-left: 46px; }
    .execution-count { font-size: 12px; }
    .theme-toggle { top: 14px; right: 14px; }
}
</style>
</head>
<body>
<button id="theme-toggle" class="theme-toggle" type="button">
    <svg class="theme-icon-moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 1.1a6.7 6.7 0 1 0 5.3 9.8A5.8 5.8 0 0 1 9.6 1.1zm-1 1.2a7 7 0 0 0 4.7 9.5A5.7 5.7 0 1 1 8.6 2.3z"/></svg>
    <svg class="theme-icon-sun" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.5 0h1v2h-1V0zm0 14h1v2h-1v-2zM0 7.5h2v1H0v-1zm14 0h2v1h-2v-1zM2.34 1.63l1.42 1.42-.71.71-1.42-1.42.71-.71zm9.9 9.9 1.42 1.42-.71.71-1.42-1.42.71-.71zm.71-9.9.71.71-1.42 1.42-.71-.71 1.42-1.42zM3.05 11.53l.71.71-1.42 1.42-.71-.71 1.42-1.42zM8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 1a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>
    <span id="theme-toggle-label"></span>
</button>
${navigation}
<div id="nav-tooltip" class="nav-tooltip" role="tooltip"></div>
<p class="source">${escapeHtml(source.before)}<a href="${MARKETPLACE_URL}">${source.linkText}</a>${escapeHtml(source.after)}</p>
${runs}
<script>
(function(){
    var root = document.documentElement;
    var button = document.getElementById('theme-toggle');
    var label = document.getElementById('theme-toggle-label');
    var labels = { light: ${JSON.stringify(labels.light)}, dark: ${JSON.stringify(labels.dark)} };
    function applyTheme(theme) {
        root.dataset.theme = theme;
        var nextLabel = theme === 'dark' ? labels.light : labels.dark;
        label.textContent = nextLabel;
        button.title = nextLabel;
        button.setAttribute('aria-label', nextLabel);
        try { localStorage.setItem('stata-all-in-one-export-theme', theme); } catch (_error) {}
    }
    applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');
    button.addEventListener('click', function() { applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'); });

    var markers = Array.from(document.querySelectorAll('.nav-marker'));
    var navTooltip = document.getElementById('nav-tooltip');
    function setActive(id) {
        markers.forEach(function(marker) { marker.classList.toggle('active', marker.dataset.target === id); });
    }
    function showNavTooltip(marker) {
        var rect = marker.getBoundingClientRect();
        navTooltip.textContent = marker.dataset.tooltip || '';
        navTooltip.style.left = (rect.right + 12) + 'px';
        navTooltip.style.top = (rect.top + rect.height / 2) + 'px';
        navTooltip.classList.add('visible');
    }
    function hideNavTooltip() { navTooltip.classList.remove('visible'); }
    if (markers.length) {
        setActive(markers[0].dataset.target);
        markers.forEach(function(marker) {
            marker.addEventListener('mouseenter', function() { showNavTooltip(marker); });
            marker.addEventListener('mouseleave', hideNavTooltip);
            marker.addEventListener('focus', function() { showNavTooltip(marker); });
            marker.addEventListener('blur', hideNavTooltip);
        });
        if ('IntersectionObserver' in window) {
            var observer = new IntersectionObserver(function(entries) {
                var visible = entries
                    .filter(function(entry) { return entry.isIntersecting; })
                    .sort(function(a, b) { return b.intersectionRatio - a.intersectionRatio; });
                if (visible.length) setActive(visible[0].target.id);
            }, { rootMargin: '-15% 0px -68% 0px', threshold: [0, 0.2, 0.5, 1] });
            document.querySelectorAll('.input-cell').forEach(function(cell) { observer.observe(cell); });
        }
    }
})();
</script>
</body>
</html>
`;
}

function serializeHtml(prepared, options) {
    return serializeInteractiveHtml(prepared, options);
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
