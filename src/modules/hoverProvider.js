/**
 * Stata Hover Provider
 * Provides hover tooltips for Stata commands by reading .sthlp/.hlp files
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let vscode;
let config;

try {
    vscode = require('vscode');
    config = require('../utils/config');
} catch (e) {
    vscode = {
        Position: class Position {
            constructor(line, character) {
                this.line = line;
                this.character = character;
            }
        },
        Range: class Range {
            constructor(start, end) {
                this.start = start;
                this.end = end;
            }
        },
        Hover: class Hover {
            constructor(contents, range) {
                this.contents = contents;
                this.range = range;
            }
        },
        MarkdownString: class MarkdownString {
            constructor(value = '') {
                this.value = value;
            }
        },
        languages: {
            registerHoverProvider: () => ({ dispose: () => {} })
        }
    };
    
    config = {
        getStataVersion: () => 'StataMP',
        getStataPathOnWindows: () => '',
        getCustomCommands: () => ['reghdfe'],
        getAdditionalAdoPaths: () => []
    };
}

// Import Stata builtin commands from completionProvider
const StataBuiltinCommands = [
    'about', 'ac', 'acprplot', 'ado', 'adopath', 'adoupdate', 'alpha', 'ameans',
    'anova', 'aorder', 'append', 'arch', 'areg', 'args', 'arima', 'asmprobit',
    'avplot', 'avplots', 'binreg', 'biprobit', 'bitest', 'bitesti', 'blogit',
    'boot', 'bprobit', 'browse', 'bsample', 'bsqreg', 'ca', 'canon', 'capture',
    'cc', 'cci', 'cd', 'centile', 'cf', 'char', 'chdir', 'checksum', 'ci', 'cii',
    'clear', 'clist', 'clog', 'clogit', 'cloglog', 'clonevar', 'cluster',
    'cmdlog', 'cnsreg', 'codebook', 'collapse', 'compare', 'compress', 'confirm',
    'conren', 'constraint', 'continue', 'contract', 'copy', 'copyright',
    'corr', 'corr2data', 'correlate', 'corrgram', 'count', 'cprplot', 'cross',
    'cscript', 'ct', 'ctset', 'cumul', 'cusum', 'd', 'datasignature', 'db',
    'decode', 'deff', 'describe', 'dfbeta', 'dfgls', 'dfuller', 'di', 'dir',
    'discard', 'display', 'do', 'doedit', 'dotplot', 'dprobit', 'drawnorm',
    'drop', 'ds', 'dstdize', 'duplicates', 'durbina', 'dwstat', 'ed', 'edit',
    'eivreg', 'encode', 'erase', 'ereg', 'ereghet', 'estat', 'estimates',
    'exit', 'expand', 'expandcl', 'export', 'factor', 'fcast', 'fdasave',
    'fdause', 'file', 'filefilter', 'fillin', 'findit', 'fit', 'flist',
    'fpredict', 'fracgen', 'fracplot', 'fracpoly', 'frontier', 'ftodate',
    'gammahet', 'generate', 'gisid', 'gladder', 'glm', 'glevelsof', 'glim',
    'glogit', 'gmeans', 'gnbreg', 'gompertz', 'graph', 'grebar', 'greigen',
    'grmeanby', 'gsort', 'gwood', 'hausman', 'haver', 'heckman', 'heckprob',
    'hettest', 'histogram', 'hlogit', 'hotel', 'hotelling', 'hprobit', 'hreg',
    'hsearch', 'histogram', 'icd9', 'iis', 'impute', 'imtest', 'inbase',
    'include', 'infile', 'infix', 'input', 'insheet', 'inspect', 'integ',
    'intreg', 'ipolate', 'iqreg', 'irf', 'isid', 'istdize', 'ivprobit',
    'ivreg', 'jacknife', 'jknife', 'joinby', 'kap', 'kappa', 'kdensity',
    'ksmirnov', 'ktau', 'kwallis', 'labelbook', 'ladder', 'levelsof',
    'leverage', 'lfit', 'lincom', 'linktest', 'list', 'llogistic', 'lnormal',
    'loadingplot', 'log', 'logistic', 'logit', 'lookfor', 'lookup', 'lowess',
    'lreg', 'lroc', 'lrtest', 'ltable', 'lvr2plot', 'rvpplot', 'manova',
    'mantel', 'mark', 'markin', 'markout', 'marksample', 'matrix', 'mata',
    'matcproc', 'matlist', 'mcc', 'mcci', 'mds', 'mdslong', 'mdsmat',
    'mean', 'means', 'median', 'memory', 'merge', 'mfx', 'mhelp', 'mi',
    'mkdir', 'mkmat', 'mkspline', 'ml', 'mlogit', 'mnl', 'more', 'mov',
    'move', 'mprobit', 'mrdu', 'mvdecode', 'mvencode', 'mvreg', 'nbreg',
    'nestreg', 'net', 'newey', 'news', 'nl', 'nlcom', 'nlinit', 'nlogit',
    'nlogitgen', 'nlogittree', 'nobreak', 'nptrend', 'numlabel', 'numlist',
    'ologit', 'oneway', 'oprobit', 'order', 'orthog', 'orthpoly', 'outfile',
    'outsheet', 'ovtest', 'pac', 'parse', 'pause', 'pca', 'pchart', 'pchi',
    'pcorr', 'pctile', 'pergram', 'peto', 'pk', 'pkcollapse', 'pkcross',
    'pkequiv', 'pkexamine', 'plugin', 'pnorm', 'poisgof', 'poisson', 'post',
    'postclose', 'postfile', 'postutil', 'pperron', 'prais', 'predict',
    'predictnl', 'preserve', 'print', 'probit', 'procrustes', 'profiler',
    'program', 'proportion', 'prtest', 'prtesti', 'pwcorr', 'pwd', 'qchi',
    'qladder', 'qnorm', 'qqplot', 'qreg', 'quantile', 'query', 'quietly',
    'range', 'ranksum', 'ratio', 'rchart', 'rcof', 'recast', 'recode', 'reg',
    'reg3', 'regdw', 'regress', 'replace', 'reshape', 'restore', 'return',
    'rmdir', 'robvar', 'roccomp', 'rocfit', 'rocgold', 'rocplot', 'roctab',
    'rologit', 'rotating', 'rreg', 'run', 'runtest', 'rvfplot', 'safesum',
    'sample', 'sampsi', 'save', 'saveold', 'scatter', 'scm', 'score',
    'scoreplot', 'scree', 'screeplot', 'sdtest', 'sdtesti', 'search',
    'separate', 'serrbar', 'serset', 'set', 'sfrancia', 'shell', 'shewhart',
    'simulate', 'sktest', 'slogit', 'smooth', 'snapspan', 'sort', 'spearman',
    'spikeplot', 'split', 'sqreg', 'stack', 'stbase', 'stci', 'stcox',
    'stcoxkm', 'stcstat', 'stcurv', 'stcurve', 'stdes', 'stem', 'stepwise',
    'stfill', 'stgen', 'stir', 'stjoin', 'stmc', 'stmh', 'stphplot',
    'stphtest', 'stptime', 'strate', 'streg', 'stset', 'stsplit', 'stsum',
    'stsv', 'su', 'suest', 'sum', 'summarize', 'sunflower', 'sureg', 'svar',
    'svmat', 'svy', 'svydes', 'svygen', 'svygnbreg', 'svyheckman',
    'svyheckprob', 'svyintreg', 'svyivreg', 'svylc', 'svylogit', 'svymean',
    'svymlog', 'svymlogit', 'svynbreg', 'svyolog', 'svyologit', 'svyoprobit',
    'svypois', 'svypoisson', 'svyprobit', 'svyprop', 'svyratio', 'svyreg',
    'svyregress', 'svyset', 'svytab', 'svytest', 'svytotal', 'sw', 'swilk',
    'symmetry', 'symplot', 'syntax', 'tab', 'tab1', 'tab2', 'tabi', 'table',
    'tabodds', 'tabstat', 'tabulate', 'te', 'test', 'testnl', 'testparm',
    'tetrachoric', 'timer', 'tis', 'tobit', 'tokenize', 'total', 'translate',
    'translator', 'treatreg', 'truncreg', 'tsappend', 'tset', 'tsfill',
    'tsline', 'tsreport', 'tsrevar', 'tsrline', 'tsset', 'tssmooth',
    'tsunab', 'ttest', 'ttesti', 'tutorial', 'twoway', 'type', 'typeof',
    'unabbrev', 'update', 'use', 'uselabel', 'var', 'varbasic', 'varfcast',
    'vargranger', 'varirf', 'varlmar', 'varnorm', 'varsoc', 'varstable',
    'varwle', 'vec', 'vecank', 'vecnorm', 'vecrank', 'vecstable', 'verinst',
    'version', 'view', 'viewsource', 'vif', 'vwls', 'webdescribe', 'webseek',
    'webuse', 'which', 'while', 'wilcoxon', 'window', 'winexec', 'wntestb',
    'wntestq', 'xchart', 'xcorr', 'xi', 'xmlsave', 'xmluse', 'xpose',
    'xt', 'xtabond', 'xtclog', 'xtcloglog', 'xtcorr', 'xtdata', 'xtdes',
    'xtfrontier', 'xtgee', 'xtgls', 'xthaus', 'xthausman', 'xthtaylor',
    'xtile', 'xtintreg', 'xtivreg', 'xtline', 'xtlogit', 'xtmixed',
    'xtnbreg', 'xtpcse', 'xtpois', 'xtpoisson', 'xtpred', 'xtprobit',
    'xtrc', 'xtrchh', 'xtreg', 'xtregar', 'xtset', 'xtsum', 'xttab',
    'xttest0', 'xttobit', 'xtrans', 'zip', 'ztp', 'ztnb',
    // Community-developed commands
    'ivreg2', 'outreg', 'outreg2', 'gcollapse', 'gcontract', 'gegen',
    'gisid', 'glevelsof', 'gquantiles', 'winsor2', 'coefplot', 'ppmlhdfe',
    'eststo', 'estout', 'esttab', 'estadd', 'estpost'
];

const StataHelpAliases = {
    tab: 'tabulate'
};

// ---------------------------------------------------------------------------
// Hover filter: only show hover for "function" commands at command positions.
//
// Strategy (blocklist, not allowlist):
//   1. Only the first word on a line, or the first word after a prefix colon
//      (e.g. "bootstrap: reg …"), is considered a command position.
//   2. Pure utility / data-management / flow-control commands are excluded via
//      a curated blocklist.  Everything else — estimation commands, analysis
//      commands, and all community-contributed commands — gets hover help
//      automatically without needing to be listed individually.
// ---------------------------------------------------------------------------

/**
 * Canonical names of commands that should NEVER show hover help.
 * Abbreviations are matched by prefix: if `word` is a prefix of any entry here
 * (and length >= 3), it is blocked as well.
 */
const BLOCKED_COMMANDS = new Set([
    // --- data management ---
    'use', 'save', 'saveold', 'import', 'export', 'insheet', 'outsheet',
    'infile', 'outfile', 'infix', 'append', 'merge', 'joinby', 'cross',
    'compress', 'clear', 'drop', 'keep', 'rename', 'recode', 'encode',
    'decode', 'destring', 'tostring', 'format', 'label', 'order', 'sort',
    'gsort', 'generate', 'egen', 'replace', 'recast', 'clonevar', 'separate',
    'split', 'stack', 'xpose', 'reshape', 'expand', 'fillin', 'ipolate',
    // --- system / files ---
    'cd', 'pwd', 'dir', 'ls', 'mkdir', 'copy', 'erase', 'rmdir', 'type',
    'more', 'view', 'shell', 'winexec', 'plugin',
    // --- info / describe ---
    'describe', 'list', 'browse', 'edit', 'display', 'count', 'assert',
    'notes', 'about', 'update', 'ado', 'adopath', 'net', 'ssc', 'news',
    'query', 'memory', 'set', 'help', 'mhelp', 'db', 'search', 'findit',
    'which', 'lookfor', 'lookup',
    // --- flow control / programming ---
    'foreach', 'forvalues', 'while', 'continue', 'if', 'else', 'capture',
    'quietly', 'noisily', 'program', 'syntax', 'args', 'tokenize',
    'gettoken', 'include', 'do', 'run', 'pause', 'sleep', 'exit', 'end',
    'error', 'return', 'ereturn', 'sreturn', 'input', 'macro', 'global',
    'local', 'scalar', 'matrix', 'mata', 'class', 'break', 'continue',
    'unabbrev', 'unabcmd', 'version',
    // --- data utilities ---
    'duplicates', 'isid', 'ds', 'cf', 'compare', 'confirm', 'codebook',
    'inspect', 'levelsof', 'checksum', 'datasignature', 'snapspan',
    'numlabel', 'labelbook', 'mark', 'markin', 'markout', 'marksample',
    // --- other utilities ---
    'translate', 'translator', 'timer', 'profiler', 'post', 'postfile',
    'postclose', 'postutil', 'constraint', 'discard',
    'preserve', 'restore', 'window', 'verinst',
]);

/**
 * Returns true when `word` should NOT show hover help (i.e. it is a blocked
 * utility command or a known abbreviation of one).
 */
function isBlockedCommand(word) {
    const w = word.toLowerCase();
    if (!w || w.length < 2) return true;
    if (BLOCKED_COMMANDS.has(w)) return true;
    // Abbreviation of a blocked command (min 3 chars to avoid false positives)
    if (w.length >= 3) {
        for (const cmd of BLOCKED_COMMANDS) {
            if (cmd.startsWith(w)) return true;
        }
    }
    return false;
}

/**
 * Checks whether `position` is at a Stata command position, i.e. the first
 * non-whitespace word on the line or the first word after a prefix colon
 * (e.g. "bootstrap, reps(2000): reg …").
 */
function isAtCommandPosition(document, position) {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const col = position.character;

    // First word on the line (after optional whitespace)
    const trimmed = lineText.trimStart();
    const leadingWs = lineText.length - trimmed.length;
    const firstWordMatch = trimmed.match(/^(\w+)/);
    if (firstWordMatch) {
        const fwStart = leadingWs;
        const fwEnd = leadingWs + firstWordMatch[1].length;
        if (col >= fwStart && col <= fwEnd) return true;
    }

    // First word after a colon (prefix-command separator)
    // Find the last colon before the cursor
    const before = lineText.substring(0, col);
    const colonIdx = before.lastIndexOf(':');
    if (colonIdx === -1) return false;

    const afterColon = before.substring(colonIdx + 1);
    const afterTrim = afterColon.trimStart();
    if (afterTrim.length === 0) return false;
    const leadingAfterColon = afterColon.length - afterTrim.length;
    const afterColonWord = afterTrim.match(/^(\w+)/);
    if (!afterColonWord) return false;

    const wordStart = colonIdx + 1 + leadingAfterColon;
    const wordEnd = wordStart + afterColonWord[1].length;
    return col >= wordStart && col <= wordEnd;
}

/**
 * Parse SMCL markup and convert it into hover-friendly HTML/Markdown.
 *
 * parse-smcl uses Python lxml to create an XML tree, then rewrites that tree
 * into semantic HTML. VS Code hover content is much more constrained than a
 * full web page, so this implementation keeps the same broad stages locally:
 * tokenise SMCL directives, build paragraph/table blocks, then render inline
 * directives recursively.
 *
 * @param {string} smclText - SMCL formatted text
 * @returns {string} HTML/Markdown formatted text
 */
function parseSmclToHtml(smclText) {
    if (!smclText) return '';

    try {
        return renderSmclAsStataViewer(smclText);
    } catch (e) {
        return escHtml(smclText);
    }
}

const STATA_HELP_WIDTH = 72;

function renderSmclAsStataViewer(smclText) {
    const lines = normalizeSmclLines(smclText);
    const output = [];
    let paragraph = null;
    let tableRow = null;
    let p2colLayout = { leftIndent: 4, rightColumn: 30 };
    let synoptLayout = { leftIndent: 4, rightColumn: 28 };

    const flushParagraph = () => {
        if (!paragraph) return;
        output.push(...wrapSmclParagraph(paragraph.parts.join(' '), paragraph.first, paragraph.next));
        paragraph = null;
    };

    const flushTableRow = () => {
        if (!tableRow) return;
        output.push(...renderTwoColumnRows(
            tableRow.left,
            renderSmclInline(tableRow.parts.join(' ')),
            tableRow.leftIndent,
            tableRow.rightColumn
        ));
        tableRow = null;
    };

    const appendTableRowText = (text) => {
        if (!tableRow) return false;
        const cleanText = stripTrailingPEnd(text);
        if (cleanText) {
            tableRow.parts.push(cleanText);
        }
        if (/\{p_end\}\s*$/.test(text)) {
            flushTableRow();
        }
        return true;
    };

    const appendParagraph = (first, next, text) => {
        if (!paragraph || paragraph.first !== first || paragraph.next !== next) {
            flushParagraph();
            paragraph = { first, next, parts: [] };
        }
        const cleanText = stripTrailingPEnd(text);
        if (cleanText) {
            paragraph.parts.push(cleanText);
        }
        if (/\{p_end\}\s*$/.test(text)) {
            flushParagraph();
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (!trimmed) {
            flushTableRow();
            flushParagraph();
            output.push('');
            continue;
        }

        if (trimmed === '{p_end}') {
            flushTableRow();
            flushParagraph();
            continue;
        }

        const directive = readDirectiveAt(trimmed, 0);
        if (!directive) {
            if (tableRow) {
                appendTableRowText(trimmed);
            } else if (paragraph) {
                appendParagraph(paragraph.first, paragraph.next, trimmed);
            } else {
                output.push(...renderViewerPhysicalLine(line));
            }
            continue;
        }

        const tail = trimmed.slice(directive.end).trim();
        const tag = directive.tag;

        if (tableRow && !isViewerBlockDirective(tag)) {
            appendTableRowText(trimmed);
            continue;
        }

        if (paragraph && !isViewerBlockDirective(tag)) {
            appendParagraph(paragraph.first, paragraph.next, trimmed);
            continue;
        }

        if (tag === 'p2colset') {
            flushTableRow();
            flushParagraph();
            p2colLayout = layoutFromP2colset(directive.options);
            continue;
        }

        if (tag === 'p2colreset') {
            flushTableRow();
            flushParagraph();
            p2colLayout = { leftIndent: 4, rightColumn: 30 };
            continue;
        }

        if (tag === 'synoptset') {
            flushTableRow();
            flushParagraph();
            synoptLayout = layoutFromSynoptset(directive.options);
            continue;
        }

        if (tag === 'smcl' || tag === 'comment' || tag === '*' || tag === 'marker'
            || tag === 'viewerjumpto' || tag === 'vieweralsosee' || tag === 'viewerdialog'
            || tag === 'vieweralsoseealso' || tag === 'findalias') {
            continue;
        }

        if (tag === 'hline') {
            flushTableRow();
            flushParagraph();
            output.push('-'.repeat(STATA_HELP_WIDTH));
            continue;
        }

        if (tag === 'synoptline') {
            flushTableRow();
            flushParagraph();
            output.push(' '.repeat(synoptLayout.leftIndent) + '-'.repeat(STATA_HELP_WIDTH - synoptLayout.leftIndent));
            continue;
        }

        if (tag === 'title' || tag === 'dlgtab') {
            flushTableRow();
            flushParagraph();
            const title = renderSmclInline(directive.content || directive.options || tail);
            if (title.text) {
                output.push(tag === 'dlgtab' ? renderDialogTab(title) : `<u><b>${title.html}</b></u>`);
            }
            if (tail && directive.content) {
                output.push(renderSmclViewerLine(tail));
            }
            continue;
        }

        if (tag === 'synopthdr') {
            flushTableRow();
            flushParagraph();
            const header = directive.content || 'options';
            output.push(renderTwoColumnRows(
                { ...renderSmclInline(header), html: `<i>${renderSmclInline(header).html}</i>` },
                renderSmclInline('Description'),
                synoptLayout.leftIndent,
                synoptLayout.rightColumn
            )[0]);
            continue;
        }

        if (tag === 'synopt' || tag === 'p2col' || tag === 'p2coldent') {
            flushParagraph();
            const layout = tag === 'synopt' || tag === 'p2coldent'
                ? synoptLayout
                : (directive.options ? layoutFromP2colset(directive.options) : p2colLayout);
            tableRow = {
                left: renderSmclInline(tableLeftContent(directive)),
                leftIndent: layout.leftIndent,
                rightColumn: layout.rightColumn,
                parts: []
            };
            appendTableRowText(tail);
            continue;
        }

        if (tag === 'syntab') {
            flushTableRow();
            flushParagraph();
            const section = renderSmclInline(directive.content || directive.options || tail);
            output.push('');
            output.push(`    ${section.html}`);
            continue;
        }

        if (isParagraphDirective(tag)) {
            flushTableRow();
            const margins = paragraphMargins(tag, directive.options);
            appendParagraph(margins.first, margins.next, [directive.content, tail].filter(Boolean).join(' '));
            continue;
        }

        if (!isViewerBlockDirective(tag)) {
            flushTableRow();
            flushParagraph();
            output.push(...renderViewerPhysicalLine(line));
            continue;
        }

        flushTableRow();
        flushParagraph();
        output.push(...renderViewerPhysicalLine(trimmed));
    }

    flushTableRow();
    flushParagraph();
    const html = output
        .join('\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .replace(/^\n+|\n+$/g, '');

    return `<pre class="stata-help">${html}</pre>`;
}

function isParagraphDirective(tag) {
    return tag === 'p' || tag === 'pstd' || tag === 'phang' || tag === 'phang2'
        || tag === 'pmore' || tag === 'pmore2' || tag === 'pin' || tag === 'psee'
        || tag === 'asis';
}

function isViewerBlockDirective(tag) {
    return tag === 'smcl' || tag === 'comment' || tag === '*' || tag === 'marker'
        || tag === 'p2colset' || tag === 'p2colreset' || tag === 'synoptset'
        || tag === 'viewerjumpto' || tag === 'vieweralsosee' || tag === 'viewerdialog'
        || tag === 'vieweralsoseealso' || tag === 'findalias' || tag === 'hline'
        || tag === 'synoptline' || tag === 'title' || tag === 'dlgtab'
        || tag === 'synopthdr' || tag === 'synopt' || tag === 'p2col'
        || tag === 'p2coldent' || tag === 'syntab' || isParagraphDirective(tag);
}

function paragraphMargins(tag, options) {
    if (tag === 'p') {
        const values = String(options || '').trim().split(/\s+/).map(value => parseInt(value, 10));
        return {
            first: Number.isFinite(values[0]) ? values[0] : 0,
            next: Number.isFinite(values[1]) ? values[1] : (Number.isFinite(values[0]) ? values[0] : 0)
        };
    }

    const margins = {
        pstd: [4, 4],
        phang: [4, 8],
        phang2: [8, 12],
        pmore: [8, 8],
        pmore2: [12, 12],
        pin: [8, 8],
        psee: [13, 4],
        asis: [0, 0]
    };
    const [first, next] = margins[tag] || [0, 0];
    return { first, next };
}

function wrapSmclParagraph(text, firstIndent, nextIndent) {
    const tokens = splitSmclWords(text).map(renderSmclInline).filter(token => token.text.length > 0);
    const lines = [];
    let indent = firstIndent;
    let lineHtml = ' '.repeat(indent);
    let lineWidth = indent;
    let hasWord = false;

    const pushLine = () => {
        lines.push(lineHtml.trimEnd());
        indent = nextIndent;
        lineHtml = ' '.repeat(indent);
        lineWidth = indent;
        hasWord = false;
    };

    for (const originalToken of tokens) {
        const expandedTokens = originalToken.width > 30 && /\s/.test(originalToken.text)
            ? splitRenderedWords(originalToken)
            : [originalToken];

        for (const token of expandedTokens) {
        const gap = hasWord ? 1 : 0;
        if (hasWord && lineWidth + gap + token.width > STATA_HELP_WIDTH) {
            pushLine();
        }
        if (hasWord) {
            lineHtml += ' ';
            lineWidth += 1;
        }
        lineHtml += token.html;
        lineWidth += token.width;
        hasWord = true;
        }
    }

    if (hasWord || lineHtml.trim()) {
        pushLine();
    }
    return lines;
}

function splitSmclWords(text) {
    const words = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < String(text || '').length; i++) {
        const ch = text[i];
        if (/\s/.test(ch) && depth === 0) {
            if (current) {
                words.push(current);
                current = '';
            }
            continue;
        }
        if (ch === '{') depth++;
        if (ch === '}') depth = Math.max(0, depth - 1);
        current += ch;
    }

    if (current) {
        words.push(current);
    }
    return words;
}

function renderSmclViewerLine(line) {
    let result = { html: '', text: '', width: 0 };
    let i = 0;
    const value = String(line || '');

    const appendPlain = (plain) => {
        for (const ch of plain) {
            if (ch === '\t') {
                const spaces = 8 - (result.width % 8);
                result.html += ' '.repeat(spaces);
                result.text += ' '.repeat(spaces);
                result.width += spaces;
            } else {
                result.html += escHtml(ch);
                result.text += ch;
                result.width += 1;
            }
        }
    };

    while (i < value.length) {
        const directive = readDirectiveAt(value, i);
        if (!directive) {
            appendPlain(value[i]);
            i++;
            continue;
        }

        if (directive.start > i) {
            appendPlain(value.slice(i, directive.start));
        }

        if (directive.tag === 'col') {
            const target = Math.max(1, parseInt(directive.options || directive.content, 10) || 1);
            const spaces = Math.max(0, target - result.width - 1);
            result.html += ' '.repeat(spaces);
            result.text += ' '.repeat(spaces);
            result.width += spaces;
        } else {
            const rendered = renderInlineDirectiveForViewer(directive);
            result.html += rendered.html;
            result.text += rendered.text;
            result.width += rendered.width;
        }
        i = directive.end;
    }

    return result.html;
}

function renderTwoColumnRows(left, right, leftIndent, rightColumn) {
    const rightWidth = Math.max(20, STATA_HELP_WIDTH - rightColumn);
    const rightLines = wrapRenderedTokens(splitRenderedWords(right), rightWidth);
    const lines = [];
    const prefix = ' '.repeat(leftIndent);
    const leftWidth = leftIndent + left.width;
    const firstGap = Math.max(1, rightColumn - leftWidth);

    if (rightLines.length === 0) {
        lines.push(`${prefix}${left.html}`);
        return lines;
    }

    lines.push(`${prefix}${left.html}${' '.repeat(firstGap)}${rightLines[0]}`);
    for (const continuation of rightLines.slice(1)) {
        lines.push(`${' '.repeat(rightColumn)}${continuation}`);
    }
    return lines;
}

function renderDialogTab(title) {
    const label = ` ${title.html} `;
    const left = ' '.repeat(4) + '-'.repeat(6);
    const rightWidth = Math.max(0, STATA_HELP_WIDTH - 4 - 6 - title.width - 2);
    return `${left}${label}${'-'.repeat(rightWidth)}`;
}

function tableLeftContent(directive) {
    if (directive.content) {
        return directive.content;
    }
    if (isNumericLayoutOptions(directive.options)) {
        return '';
    }
    return directive.options || '';
}

function isNumericLayoutOptions(options) {
    const value = String(options || '').trim();
    return !!value && /^(?:\d+\s+){1,3}\d+$/.test(value);
}

function layoutFromP2colset(options) {
    const values = String(options || '').trim().split(/\s+/).map(value => parseInt(value, 10));
    if (values.length >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1])) {
        return { leftIndent: Math.max(0, values[0] - 1), rightColumn: Math.max(values[1] + 1, values[0] + 4) };
    }
    return { leftIndent: 4, rightColumn: 30 };
}

function layoutFromSynoptset(options) {
    const first = parseInt(String(options || '').trim().split(/\s+/)[0], 10);
    if (Number.isFinite(first)) {
        return { leftIndent: 4, rightColumn: Math.max(18, first + 7) };
    }
    return { leftIndent: 4, rightColumn: 28 };
}

function splitRenderedWords(rendered) {
    return String(rendered.html || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(html => ({ html, text: stripHtmlTags(html), width: stripHtmlTags(html).length }));
}

function wrapRenderedLine(html) {
    const visible = stripHtmlTags(html);
    if (visible.length <= STATA_HELP_WIDTH) {
        return [html];
    }

    const indentMatch = visible.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const contentHtml = html.slice(indent);
    const width = Math.max(20, STATA_HELP_WIDTH - indent);
    return wrapRenderedTokens(splitRenderedWords({ html: contentHtml }), width)
        .map(line => ' '.repeat(indent) + line);
}

function renderViewerPhysicalLine(line) {
    const html = renderSmclViewerLine(line);
    if (!/\{col\s+\d+\}/i.test(String(line || ''))) {
        return wrapRenderedLine(html);
    }
    const visible = stripHtmlTags(html);
    return visible.length <= STATA_HELP_WIDTH ? [html] : wrapRenderedLine(html);
}

function wrapRenderedTokens(tokens, width) {
    const lines = [];
    let lineHtml = '';
    let lineWidth = 0;

    const pushLine = () => {
        if (lineHtml) {
            lines.push(lineHtml);
            lineHtml = '';
            lineWidth = 0;
        }
    };

    for (const token of tokens) {
        const gap = lineWidth > 0 ? 1 : 0;
        if (lineWidth > 0 && lineWidth + gap + token.width > width) {
            pushLine();
        }
        if (lineWidth > 0) {
            lineHtml += ' ';
            lineWidth += 1;
        }
        lineHtml += token.html;
        lineWidth += token.width;
    }

    pushLine();
    return lines;
}

function renderSmclInline(text) {
    const html = renderSmclViewerLine(text);
    return {
        html,
        text: stripHtmlTags(html),
        width: stripHtmlTags(html).length
    };
}

function stripHtmlTags(value) {
    return String(value || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');
}

function renderInlineDirectiveForViewer(directive) {
    const tag = directive.tag;
    const rawContent = directive.content || '';
    const content = renderSmclInline(rawContent || directive.options || '');
    const plain = content.text;

    const styled = (html) => ({ html, text: plain, width: plain.length });

    switch (tag) {
        case 'smcl':
        case '...':
        case 'p_end':
        case 'nobreak':
        case 'break':
        case 'bind':
            return { html: '', text: '', width: 0 };
        case 'hline': {
            const count = Math.min(parseInt(directive.options || rawContent, 10) || 1, STATA_HELP_WIDTH);
            const text = '-'.repeat(count);
            return { html: text, text, width: text.length };
        }
        case 'bf':
        case 'hilite':
        case 'hi':
            return styled(`<b>${content.html}</b>`);
        case 'it':
        case 'emph':
            return styled(`<i>${content.html}</i>`);
        case 'ul':
            return styled(`<u>${content.html}</u>`);
        case 'cmd':
        case 'helpb':
            return styled(`<b>${content.html}</b>`);
        case 'cmdab': {
            const formatted = formatViewerAbbreviation(content.html);
            return { html: `<b>${formatted.html}</b>`, text: formatted.text, width: formatted.text.length };
        }
        case 'opt':
        case 'option':
        case 'opth': {
            const formatted = formatViewerOption(optionDirectiveText(directive));
            return { html: `<b>${formatted.html}</b>`, text: formatted.text, width: formatted.text.length };
        }
        case 'input':
        case 'inp':
            return styled(`<b>${content.html}</b>`);
        case 'error':
        case 'err':
        case 'result':
        case 'res':
        case 'txt':
        case 'text':
        case 'sf':
            return content;
        case 'newvar':
        case 'var':
        case 'vars':
        case 'varname':
        case 'varlist':
        case 'depvar':
        case 'depvars':
        case 'depvarlist':
        case 'indepvars':
        case 'anything':
        case 'namelist':
        case 'numlist': {
            const label = renderCustomPlaceholderText(tag, plain);
            return { html: `<i>${escHtml(label)}</i>`, text: label, width: label.length };
        }
        case 'ifin':
            return { html: '[<i>if</i>] [<i>in</i>]', text: '[if] [in]', width: 9 };
        case 'weight':
            return { html: '[<i>weight</i>]', text: '[weight]', width: 8 };
        case 'dtype':
            return { html: '[<i>type</i>]', text: '[type]', width: 6 };
        case 'help':
        case 'browse':
        case 'manhelp':
        case 'manpage':
        case 'mansection':
        case 'manlink':
        case 'manlinki':
        case 'dialog':
            return content.text ? content : renderSmclInline(directive.options || '');
        case 'stata':
            return renderSmclInline(`. ${String(directive.options || '').replace(/^"|"$/g, '')}`);
        case 'c': {
            const text = renderCharacterDirectiveText(directive.options || rawContent);
            return { html: escHtml(text), text, width: text.length };
        }
        case 'space': {
            const text = ' '.repeat(Math.min(parseInt(directive.options || rawContent, 10) || 1, 40));
            return { html: text, text, width: text.length };
        }
        default:
            return content.text ? content : renderSmclInline(directive.options || directive.body || '');
    }
}

function formatViewerAbbreviation(html) {
    const plain = stripHtmlTags(html);
    const colon = findAbbreviationColon(plain);
    if (colon === -1) {
        return { html, text: plain };
    }

    const before = escHtml(plain.slice(0, colon));
    const after = escHtml(plain.slice(colon + 1));
    return {
        html: `<u>${before}</u>${after}`,
        text: plain.slice(0, colon) + plain.slice(colon + 1)
    };
}

function formatViewerOption(value) {
    const raw = String(value || '').trim();
    const colon = findAbbreviationColon(raw);
    const abbreviation = colon === -1 ? null : raw.slice(0, colon);
    const text = colon === -1 ? raw : raw.slice(0, colon) + raw.slice(colon + 1);
    const paren = text.match(/^([^()]*)\((.*)\)$/);

    let html;
    let plain;
    if (paren) {
        const outside = paren[1];
        const inside = paren[2]
            .split(/([,|])/)
            .map(part => {
                if (part === ',' || part === '|') return escHtml(part);
                const label = part.includes(':') ? part.split(':').pop() : part;
                return label ? `<i>${escHtml(label)}</i>` : '';
            })
            .join('');
        html = `${escHtml(outside)}(${inside})`;
        plain = `${outside}(${paren[2].split(/[,|]/).map(part => part.includes(':') ? part.split(':').pop() : part).join(',')})`;
    } else {
        html = escHtml(text);
        plain = text;
    }

    if (abbreviation) {
        const prefix = escHtml(abbreviation);
        const suffix = escHtml(text.slice(abbreviation.length, paren ? text.indexOf('(') : undefined));
        if (paren) {
            const openParen = html.indexOf('(');
            html = `<u>${prefix}</u>${suffix}${html.slice(openParen)}`;
        } else {
            html = `<u>${prefix}</u>${suffix}`;
        }
    }

    return { html, text: plain };
}

function renderCustomPlaceholderText(tag, content) {
    const shortcuts = {
        var: 'varname',
        vars: 'varlist',
        depvars: 'depvarlist'
    };
    return content || shortcuts[tag] || tag;
}

function renderCharacterDirectiveText(value) {
    const token = String(value || '').trim();
    const chars = {
        '-': '-',
        'S|': '|',
        '|': '|',
        'TLC': '+',
        'TRC': '+',
        'BLC': '+',
        'BRC': '+',
        'TT': '+',
        'BT': '+',
        'LT': '+',
        'RT': '+',
        '+': '+',
        '.': '.',
        '-(': '{',
        ')-': '}',
        'c )-': '}',
        'c -(': '{'
    };
    return chars[token] || token || '';
}

function escHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escAttr(value) {
    return escHtml(value).replace(/"/g, '&quot;');
}

function parseSmclBlocks(smclText) {
    const lines = normalizeSmclLines(smclText);
    const blocks = [];
    let paragraph = null;
    let table = null;

    const closeParagraph = () => {
        if (!paragraph) return;
        const html = paragraph.parts.join(' ').replace(/\s+/g, ' ').trim();
        if (html) {
            blocks.push(renderParagraph(paragraph.className, html));
        }
        paragraph = null;
    };

    const closeTable = () => {
        if (!table) return;
        if (table.rows.length > 0) {
            blocks.push(renderTable(table));
        }
        table = null;
    };

    const pushParagraphText = (className, text) => {
        const html = parseInlineSmcl(text).trim();
        if (!html) return;
        if (!paragraph || paragraph.className !== className) {
            closeParagraph();
            closeTable();
            paragraph = { className, parts: [] };
        }
        paragraph.parts.push(html);
    };

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();
        if (!trimmed) {
            closeParagraph();
            if (!table || table.type !== 'syntax') {
                closeTable();
            }
            continue;
        }

        if (trimmed === '{p_end}') {
            closeParagraph();
            continue;
        }

        const directive = readDirectiveAt(trimmed, 0);
        if (!directive) {
            pushParagraphText(paragraph ? paragraph.className : 'std', line);
            continue;
        }

        const tail = trimmed.slice(directive.end).trim();
        const tag = directive.tag;

        if (paragraph && !isBlockDirective(tag)) {
            pushParagraphText(paragraph.className, stripTrailingPEnd(trimmed));
            if (/\{p_end\}\s*$/.test(trimmed)) {
                closeParagraph();
            }
            continue;
        }

        if (tag === 'smcl' || tag === 'comment' || tag === '*' || tag === 'p2colset'
            || tag === 'p2colreset' || tag === 'synoptset' || tag === 'marker'
            || tag === 'vieweralsosee' || tag === 'viewerjumpto' || tag === 'viewerdialog'
            || tag === 'vieweralsoseealso' || tag === 'findalias') {
            continue;
        }

        if (tag === 'hline') {
            closeParagraph();
            closeTable();
            blocks.push('<hr>');
            continue;
        }

        if (tag === 'synoptline') {
            closeParagraph();
            continue;
        }

        if (tag === 'title') {
            closeParagraph();
            closeTable();
            const title = parseInlineSmcl(directive.content || directive.options || tail);
            if (title) blocks.push(`<h2>${stripBlockTags(title)}</h2>`);
            if (tail && directive.content) {
                pushParagraphText('std', tail);
            }
            continue;
        }

        if (tag === 'dlgtab') {
            closeParagraph();
            closeTable();
            const title = parseInlineSmcl(directive.content || directive.options || tail);
            if (title) blocks.push(`<h3>${stripBlockTags(title)}</h3>`);
            continue;
        }

        if (tag === 'synopthdr') {
            closeParagraph();
            closeTable();
            table = {
                type: 'syntax',
                header: [
                    stripBlockTags(parseInlineSmcl(directive.content || 'Options')) || 'Options',
                    'Description'
                ],
                hasHeader: true,
                rows: []
            };
            continue;
        }

        if (tag === 'p2colhdr') {
            closeParagraph();
            closeTable();
            table = {
                type: 'standard',
                header: [
                    stripBlockTags(parseInlineSmcl(directive.content || '')),
                    stripBlockTags(parseInlineSmcl(tail || 'Description'))
                ],
                hasHeader: true,
                rows: []
            };
            continue;
        }

        if (tag === 'syntab') {
            closeParagraph();
            if (!table || table.type !== 'syntax') {
                closeTable();
                table = { type: 'syntax', header: ['Options', 'Description'], hasHeader: true, rows: [] };
            }
            table.rows.push({
                type: 'section',
                cells: [parseInlineSmcl(directive.content || directive.options || tail)]
            });
            continue;
        }

        if (tag === 'synopt' || tag === 'p2col' || tag === 'p2coldent') {
            closeParagraph();
            const type = tag === 'synopt' || tag === 'p2coldent' ? 'syntax' : 'standard';
            if (!table || table.type !== type) {
                closeTable();
                table = {
                    type,
                    header: null,
                    hasHeader: type === 'syntax',
                    rows: []
                };
            }
            table.rows.push({
                type: 'row',
                cells: [
                    parseInlineSmcl(directive.content || directive.options || ''),
                    parseInlineSmcl(stripTrailingPEnd(tail))
                ]
            });
            continue;
        }

        if (tag === 'pstd' || tag === 'phang' || tag === 'phang2' || tag === 'pmore'
            || tag === 'pmore2' || tag === 'pin' || tag === 'psee' || tag === 'p'
            || tag === 'asis') {
            closeTable();
            const className = tag === 'p'
                ? paragraphClassFromOptions(directive.options)
                : (tag === 'asis' ? 'std' : tag.replace(/^p/, ''));
            const content = [directive.content, tail].filter(Boolean).join(' ');
            pushParagraphText(className, stripTrailingPEnd(content));
            if (/\{p_end\}\s*$/.test(content)) {
                closeParagraph();
            }
            continue;
        }

        closeTable();
        pushParagraphText('std', trimmed);
    }

    closeParagraph();
    closeTable();
    return blocks;
}

function isBlockDirective(tag) {
    return new Set([
        'smcl', 'comment', '*', 'p2colset', 'p2colreset', 'synoptset', 'marker',
        'vieweralsosee', 'viewerjumpto', 'viewerdialog', 'vieweralsoseealso',
        'findalias', 'hline', 'synoptline', 'title', 'dlgtab', 'synopthdr',
        'p2colhdr', 'syntab', 'synopt', 'p2col', 'p2coldent', 'pstd', 'phang',
        'phang2', 'pmore', 'pmore2', 'pin', 'psee', 'p', 'asis'
    ]).has(tag);
}

function normalizeSmclLines(smclText) {
    return smclText
        .replace(/\r\n?/g, '\n')
        .replace(/\{p_end\}(?=\S)/g, '{p_end}\n')
        .split('\n')
        .filter(line => !/^\s*\{\*\s/.test(line));
}

function renderParagraph(className, html) {
    if (className === 'hang' || className === 'hang2') {
        return `<p>&nbsp;&nbsp;&nbsp;&nbsp;${html}</p>`;
    }
    if (className === 'more' || className === 'more2' || className === 'in') {
        return `<p>&nbsp;&nbsp;${html}</p>`;
    }
    if (className === 'see') {
        return `<p><i>See also:</i> ${html}</p>`;
    }
    return `<p>${html}</p>`;
}

function paragraphClassFromOptions(options) {
    const first = String(options || '').trim().split(/\s+/)[0];
    if (first === '8') return 'hang2';
    if (first === '4') return 'hang';
    return 'std';
}

function renderTable(table) {
    const header = table.header || (table.type === 'syntax'
        ? ['Options', 'Description']
        : ['Item', 'Description']);

    const rows = [
        '<table>'
    ];
    if (table.hasHeader) {
        rows.push('<thead><tr>' + header.map(cell => `<th>${cell}</th>`).join('') + '</tr></thead>');
    }
    rows.push('<tbody>');
    for (const row of table.rows) {
        if (row.type === 'section') {
            rows.push(`<tr><td colspan="2"><b>${row.cells[0]}</b></td></tr>`);
            continue;
        }
        rows.push('<tr>' + row.cells.map(cell => `<td>${normalizeTableCell(cell)}</td>`).join('') + '</tr>');
    }
    rows.push('</tbody></table>');
    return rows.join('\n');
}

function normalizeTableCell(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripBlockTags(value) {
    return String(value || '')
        .replace(/<\/?(?:p|div|table|tbody|thead|tr|td|th|hr|br)[^>]*>/g, '')
        .trim();
}

function stripTrailingPEnd(value) {
    return String(value || '').replace(/\{p_end\}\s*$/, '').trim();
}

function parseInlineSmcl(text) {
    let result = '';
    let i = 0;
    const value = String(text || '');

    while (i < value.length) {
        const directive = readDirectiveAt(value, i);
        if (!directive) {
            result += escHtml(value[i]);
            i++;
            continue;
        }

        if (directive.start > i) {
            result += escHtml(value.slice(i, directive.start));
        }
        result += renderInlineDirective(directive);
        i = directive.end;
    }

    return result
        .replace(/\{p_end\}/g, '')
        .replace(/\s+\n/g, '\n')
        .trim();
}

function readDirectiveAt(text, start) {
    if (text[start] !== '{') return null;
    const open = start;

    let depth = 0;
    let close = -1;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') {
            depth--;
            if (depth === 0) {
                close = i;
                break;
            }
        }
    }
    if (close === -1) return null;

    const body = text.slice(open + 1, close);
    const parsed = parseDirectiveBody(body);
    if (!parsed.tag) return null;
    return { ...parsed, start: open, end: close + 1 };
}

function parseDirectiveBody(body) {
    const colon = findTopLevelColon(body);
    const head = colon === -1 ? body.trim() : body.slice(0, colon).trim();
    const content = colon === -1 ? '' : body.slice(colon + 1);
    const firstSpace = head.search(/\s/);
    const tag = (firstSpace === -1 ? head : head.slice(0, firstSpace)).trim().toLowerCase();
    const options = firstSpace === -1 ? '' : head.slice(firstSpace).trim();
    return { tag, options, content, body };
}

function findTopLevelColon(body) {
    let quote = null;
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (quote) {
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === '{') depth++;
        if (ch === '}') depth = Math.max(0, depth - 1);
        if (ch === ':' && depth === 0) return i;
    }
    return -1;
}

function renderInlineDirective(directive) {
    const tag = directive.tag;
    const rawContent = directive.content || '';
    const content = parseInlineSmcl(rawContent || directive.options || '');

    switch (tag) {
        case 'smcl':
        case '...':
        case 'p_end':
        case 'nobreak':
        case 'break':
        case 'bind':
            return '';
        case 'hline':
            return directive.options && /\d/.test(directive.options) ? '&mdash;' : '<hr>';
        case 'bf':
        case 'hilite':
        case 'hi':
            return `<b>${content}</b>`;
        case 'it':
        case 'emph':
            return `<i>${content}</i>`;
        case 'ul':
            return `<u>${content}</u>`;
        case 'cmd':
            return `<code class="command">${content}</code>`;
        case 'cmdab':
            return `<code class="command">${formatAbbreviation(content)}</code>`;
        case 'opt':
        case 'option':
            return `<code class="command">${formatOptionText(optionDirectiveText(directive))}</code>`;
        case 'opth':
            return `<code class="command">${formatOptionText(optionDirectiveText(directive), true)}</code>`;
        case 'helpb':
            return `<code class="command">${content}</code>`;
        case 'input':
        case 'inp':
            return `<kbd>${content}</kbd>`;
        case 'error':
        case 'err':
            return `<code>${content}</code>`;
        case 'result':
        case 'res':
        case 'txt':
        case 'text':
        case 'sf':
            return content;
        case 'newvar':
        case 'var':
        case 'vars':
        case 'varname':
        case 'varlist':
        case 'depvar':
        case 'depvars':
        case 'depvarlist':
        case 'indepvars':
        case 'anything':
        case 'namelist':
        case 'numlist':
            return renderCustomPlaceholder(tag, content);
        case 'ifin':
            return '[<var>if</var>] [<var>in</var>]';
        case 'weight':
            return '[<var>weight</var>]';
        case 'dtype':
            return '[<var>type</var>]';
        case 'help':
        case 'browse':
        case 'manhelp':
        case 'manpage':
        case 'mansection':
        case 'manlink':
        case 'manlinki':
            return renderLinkLikeDirective(directive, content);
        case 'stata':
            return content || `<code>${escHtml(directive.options)}</code>`;
        case 'col':
            return ' ';
        case 'c':
            return renderCharacterDirective(directive.options || rawContent);
        case 'space':
            return '&nbsp;'.repeat(Math.min(parseInt(directive.options || rawContent, 10) || 1, 12));
        default:
            return content || escHtml(directive.options || directive.body || '');
    }
}

function optionDirectiveText(directive) {
    if (directive.options && directive.content) {
        return `${directive.options}:${directive.content}`;
    }
    return directive.content || directive.options || '';
}

function renderCustomPlaceholder(tag, content) {
    const shortcuts = {
        var: 'varname',
        vars: 'varlist',
        depvars: 'depvarlist'
    };
    const label = content || shortcuts[tag] || tag;
    return `<var>${escHtml(label)}</var>`;
}

function formatAbbreviation(value) {
    const text = parseInlineSmcl(value);
    const colon = findAbbreviationColon(text);
    if (colon === -1) return text;
    return `<u>${text.slice(0, colon)}</u>${text.slice(colon + 1)}`;
}

function formatOptionText(value, helpInside = false) {
    const text = String(value || '').trim();
    const colon = findAbbreviationColon(text);
    let normalized = text;
    if (colon !== -1) {
        normalized = `<u>${escHtml(text.slice(0, colon))}</u>${escHtml(text.slice(colon + 1))}`;
    } else {
        normalized = parseInlineSmcl(text);
    }

    normalized = normalized.replace(/\(([^)]*##[^):]+:)?([^):]+)\)/g, (match, _link, label) => {
        return `(<var>${escHtml(label)}</var>)`;
    });
    normalized = normalized.replace(/##[^):]+:/g, '');
    return normalized;
}

function findAbbreviationColon(value) {
    let parenDepth = 0;
    let tagDepth = 0;
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '<') tagDepth++;
        if (ch === '>') tagDepth = Math.max(0, tagDepth - 1);
        if (tagDepth > 0) continue;
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
        if (ch === ':' && parenDepth === 0) return i;
    }
    return -1;
}

function renderLinkLikeDirective(directive, content) {
    const label = content || escHtml(directive.options || '');
    const target = String(directive.options || directive.content || '').split(/\s+/)[0];
    if (!target) return label;
    const href = `command:stata-all-in-one.showHelp?${encodeURIComponent(JSON.stringify([target]))}`;
    return `<a href="${escAttr(href)}">${label}</a>`;
}

function renderCharacterDirective(value) {
    const token = String(value || '').trim();
    const chars = {
        '-': '-',
        'S|': '|',
        '|': '|',
        'TLC': '+',
        'TRC': '+',
        'BLC': '+',
        'BRC': '+',
        'TT': '+',
        'BT': '+',
        'LT': '+',
        'RT': '+',
        '+': '+',
        '.': '.'
    };
    return escHtml(chars[token] || token || '');
}

/**
 * Generate degraded hover message for various failure scenarios
 * @param {string} command - Stata command name
 * @param {string} reason - Reason for degradation ('stata_not_found', 'help_not_found', 'parse_error', etc.)
 * @returns {vscode.Hover} Hover object with degraded message
 */
function getDegradedHover(command, reason) {
    let message;
    switch (reason) {
        case 'stata_not_found':
            message = `**${command}**\n\n⚠️ Stata not found. Install Stata for full command help.`;
            break;
        case 'help_not_found':
            message = `**${command}**\n\n❓ No help file found for "${command}".`;
            break;
        case 'parse_error':
            message = `**${command}**\n\n⚠️ Unable to parse help file. Showing raw content.`;
            break;
        default:
            message = `**${command}**\n\n❓ Help information unavailable.`;
    }
    return new vscode.Hover(new vscode.MarkdownString(message));
}

/**
 * Find Stata application path on macOS
 * @param {string} preferredName - Preferred Stata version name
 * @param {string} savedPath - Cached Stata app path
 * @returns {Object} Found Stata app info
 */
function findStataApp(preferredName, savedPath = null) {
    const apps = [];
    const seen = new Set();
    const baseDir = '/Applications';

    if (savedPath && fs.existsSync(savedPath)) {
        const appName = path.basename(savedPath, '.app');
        return { 
            name: appName, 
            path: savedPath, 
            installed: [], 
            fromCache: true 
        };
    }

    if (!fs.existsSync(baseDir)) {
        return { name: null, path: null, installed: [], fromCache: false };
    }

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    
    for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('.app')) {
            const appName = entry.name.slice(0, -4);
            if (/stata/i.test(appName)) {
                const appPath = path.join(baseDir, entry.name);
                if (!seen.has(appName)) {
                    seen.add(appName);
                    apps.push({ name: appName, path: appPath });
                }
            }
        }
        
        if (entry.isDirectory() && !entry.name.endsWith('.app')) {
            const subDirPath = path.join(baseDir, entry.name);
            try {
                const subEntries = fs.readdirSync(subDirPath, { withFileTypes: true });
                for (const subEntry of subEntries) {
                    if (subEntry.isDirectory() && subEntry.name.endsWith('.app')) {
                        const appName = subEntry.name.slice(0, -4);
                        if (/stata/i.test(appName)) {
                            const appPath = path.join(subDirPath, subEntry.name);
                            if (!seen.has(appName)) {
                                seen.add(appName);
                                apps.push({ name: appName, path: appPath });
                            }
                        }
                    }
                }
            } catch (e) {}
        }
    }

    const preferredOrder = ['StataMP', 'StataSE', 'StataIC', 'StataBE', 'Stata'];
    apps.sort((a, b) => {
        const aIdx = preferredOrder.indexOf(a.name);
        const bIdx = preferredOrder.indexOf(b.name);
        const aScore = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
        const bScore = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
        if (aScore !== bScore) return aScore - bScore;
        return a.name.localeCompare(b.name);
    });

    const installed = apps.map(app => app.name);
    
    let chosen = { name: null, path: null };
    if (preferredName) {
        const preferred = apps.find(app => app.name === preferredName);
        if (preferred) {
            chosen = preferred;
        } else if (apps.length > 0) {
            chosen = apps[0];
        }
    } else if (apps.length > 0) {
        chosen = apps[0];
    }

    return { 
        name: chosen.name, 
        path: chosen.path, 
        installed,
        fromCache: false
    };
}

/**
 * Build help file index by scanning Stata ado directory
 * @param {string} customBasePath - Optional custom base path to scan
 * @returns {Map<string, string>} Map of command name → help file path
 */
async function buildHelpIndex(customBasePath = null, additionalPaths = null) {
    const index = new Map();
    const platform = process.platform;
    const homeDir = os.homedir();

    // Recursively scan for .sthlp and .hlp files (max depth 4 to cover
    // deeply nested custom directories; a typical Stata layout is 2–3).
    const scanDirectory = (dirPath, currentDepth = 0) => {
        if (currentDepth > 4) return;
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    scanDirectory(fullPath, currentDepth + 1);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (ext === '.sthlp' || ext === '.hlp') {
                        const cmdName = path.basename(entry.name, ext);
                        index.set(cmdName, fullPath);
                    }
                }
            }
        } catch (e) {
            // Silently handle errors (permission, not found, etc.)
        }
    };

    // ── 1. Scan Stata installation root ──────────────────────────────
    if (customBasePath) {
        if (fs.existsSync(customBasePath)) {
            scanDirectory(customBasePath);
        }
    } else {
        let stataRoot = null;

        if (platform === 'darwin') {
            const stataVersion = config.getStataVersion ? config.getStataVersion() : 'StataMP';
            const foundApp = findStataApp(stataVersion);
            if (foundApp.path) {
                // Scan the entire .app bundle — covers traditional layout
                // (Contents/Resources/ado/…) and StataNow layout where
                // ado/ sits alongside the bundle via the parent directory.
                stataRoot = foundApp.path;
                // Also scan the parent directory for StataNow-style layout
                const appParentDir = path.dirname(foundApp.path);
                if (fs.existsSync(appParentDir)) {
                    scanDirectory(appParentDir);
                }
            }
        } else if (platform === 'win32') {
            // Derive Stata install root from the user-configured EXE path
            // 从用户配置的 stataPathOnWindows（EXE 路径）推导 Stata 安装根目录
            const rawPath = config.getStataPathOnWindows ? config.getStataPathOnWindows() : '';
            const exePath = rawPath ? rawPath.trim().replace(/^["']+|["']+$/g, '') : '';
            if (exePath && fs.existsSync(exePath)) {
                stataRoot = path.dirname(exePath);
            }
        }

        if (stataRoot && fs.existsSync(stataRoot)) {
            scanDirectory(stataRoot);
        }
    }

    // ── 2. Scan user's personal ado directory ─────────────────────────
    let personalPath;
    if (platform === 'darwin') {
        personalPath = path.join(homeDir, 'Library', 'Application Support', 'Stata', 'ado');
    } else if (platform === 'win32') {
        personalPath = path.join(homeDir, 'ado');
    }
    // Scan the whole personal ado tree (plus/, personal/, etc.)
    if (personalPath && fs.existsSync(personalPath)) {
        scanDirectory(personalPath);
    }

    // ── 3. Scan additional ado paths from config ──────────────────────
    if (!additionalPaths) {
        additionalPaths = config.getAdditionalAdoPaths ? config.getAdditionalAdoPaths() : [];
    }
    if (Array.isArray(additionalPaths)) {
        for (const adoPath of additionalPaths) {
            if (adoPath && typeof adoPath === 'string' && fs.existsSync(adoPath)) {
                scanDirectory(adoPath);
            }
        }
    }

    console.log(`Stata All in One: Help index built with ${index.size} entries`);
    return index;
}

/**
 * DocumentCache - LRU Cache for hover content
 * Maximum 200 entries, removes oldest accessed entry when full
 */
class DocumentCache {
    constructor(maxSize = 200) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }
    
    get(key) {
        if (!this.cache.has(key)) {
            return undefined;
        }
        
        // Get value and re-insert to update position (LRU)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    
    set(key, value) {
        // If key exists, delete and re-insert
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        
        // Check if we need to evict
        if (this.cache.size >= this.maxSize) {
            // Remove the first entry (oldest accessed)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, value);
    }
    
    has(key) {
        return this.cache.has(key);
    }
    
    clear() {
        this.cache.clear();
    }
    
    size() {
        return this.cache.size;
    }
}

// Global cache instance
const globalCache = new DocumentCache(200);

// Global help index
let globalHelpIndex = null;

/**
 * Find help file path for a command
 * @param {string} commandName - Stata command name
 * @param {string} baseDir - Optional base directory to search
 * @returns {Promise<string|null>} Path to help file or null
 */
async function findHelpPath(commandName, baseDir = null) {
    // Require caller to initialize help index first
    if (!globalHelpIndex) {
        return null;
    }
    
    // Check cache
    const cacheKey = `path:${commandName}`;
    if (globalCache.has(cacheKey)) {
        return globalCache.get(cacheKey);
    }
    
    const aliasedCommand = StataHelpAliases[commandName];
    let helpPath = aliasedCommand && globalHelpIndex.has(aliasedCommand)
        ? globalHelpIndex.get(aliasedCommand)
        : null;

    // Look up command in index
    if (!helpPath) {
        helpPath = globalHelpIndex.get(commandName);
    }
    
    // If not found, try abbreviation expansion
    if (!helpPath) {
        const matches = StataBuiltinCommands.filter(c => 
            c.startsWith(commandName) && c !== commandName && globalHelpIndex.has(c)
        );
        if (matches.length >= 1) {
            // Prefer matches where next char is alphabetic (not digit/symbol)
            const alphaMatches = matches.filter(c => /^[a-z]/i.test(c[commandName.length]));
            const bestMatch = alphaMatches.length > 0 ? alphaMatches[0] : matches[0];
            helpPath = globalHelpIndex.get(bestMatch);
        }
        // Progressive prefix fallback: trim trailing chars until we find a match
        if (!helpPath && commandName.length > 1) {
            for (let i = commandName.length - 1; i >= 1; i--) {
                const prefix = commandName.substring(0, i);
                if (globalHelpIndex.has(prefix)) {
                    helpPath = globalHelpIndex.get(prefix);
                    break;
                }
            }
        }
        // Suffix fallback: handle subcommands whose help file uses a compound
        // name, e.g. "twoway" → "graphtwoway", "bar" → "graphbar".
        // 后缀匹配：处理子命令的 help 文件名是复合词的情况，
        // 如 "twoway" 的实际文件是 graphtwoway.hlp。
        if (!helpPath && commandName.length >= 3) {
            const suffixMatches = [];
            for (const [cmd, filePath] of globalHelpIndex) {
                if (cmd.length > commandName.length + 2 && cmd.endsWith(commandName)) {
                    const prefixPart = cmd.slice(0, -commandName.length);
                    suffixMatches.push({ cmd, filePath, prefixPart });
                }
            }
            if (suffixMatches.length > 0) {
                // Prefer modern commands: prefix without digits (e.g. "graph"
                // over "gr7"). Among equally-ranked candidates, pick the one
                // with the shortest prefix (= closest match).
                const noDigit = suffixMatches.filter(m => !/\d/.test(m.prefixPart));
                const candidates = noDigit.length > 0 ? noDigit : suffixMatches;
                candidates.sort((a, b) => a.prefixPart.length - b.prefixPart.length);
                helpPath = candidates[0].filePath;
            }
        }
    }
    
    if (helpPath) {
        globalCache.set(cacheKey, helpPath);
        return helpPath;
    }
    
    return null;
}

/**
 * Read and parse help file content
 * @param {string} helpPath - Path to .sthlp/.hlp file
 * @returns {Promise<string>} Parsed Markdown content
 */
async function readHelpFile(helpPath) {
    // Check cache
    const cacheKey = `content:${helpPath}`;
    if (globalCache.has(cacheKey)) {
        return globalCache.get(cacheKey);
    }
    
    try {
        const stats = fs.statSync(helpPath);
        const MAX_FILE_SIZE = 500 * 1024; // 500KB limit
        const TRUNCATE_SIZE = 100 * 1024; // Read first 100KB
        
        if (stats.size > MAX_FILE_SIZE) {
            const fd = fs.openSync(helpPath, 'r');
            const buffer = Buffer.alloc(TRUNCATE_SIZE);
            fs.readSync(fd, buffer, 0, TRUNCATE_SIZE, 0);
            fs.closeSync(fd);
            const content = expandHelpIncludes(buffer.toString('utf8'), helpPath);
            const parsedContent = parseSmclToHtml(content);
            globalCache.set(cacheKey, parsedContent);
            return parsedContent;
        }
        
        const content = expandHelpIncludes(fs.readFileSync(helpPath, 'utf8'), helpPath);
        const parsedContent = parseSmclToHtml(content);
        
        // Cache the parsed content
        globalCache.set(cacheKey, parsedContent);
        
        return parsedContent;
    } catch (e) {
        return null;
    }
}

function expandHelpIncludes(content, helpPath, seen = new Set()) {
    const baseHelpDir = getBaseHelpDir(helpPath);

    return String(content || '').split(/\r?\n/).map(line => {
        const match = line.match(/^\s*INCLUDE\s+help\s+([A-Za-z0-9_.-]+)\s*$/);
        if (!match) return line;

        const includeName = match[1].replace(/\.(?:i?hlp|sthlp)$/i, '');
        const includePath = findIncludeHelpPath(includeName, helpPath, baseHelpDir);
        if (!includePath || seen.has(includePath)) {
            return '';
        }

        try {
            seen.add(includePath);
            const includeContent = fs.readFileSync(includePath, 'utf8')
                .replace(/^\{\*.*?\}\s*\r?\n/, '');
            return expandHelpIncludes(includeContent, includePath, seen);
        } catch (e) {
            return '';
        }
    }).join('\n');
}

function getBaseHelpDir(helpPath) {
    const parts = path.normalize(helpPath).split(path.sep);
    const adoIndex = parts.lastIndexOf('ado');
    if (adoIndex !== -1 && parts[adoIndex + 1]) {
        return parts.slice(0, adoIndex + 2).join(path.sep);
    }
    return path.dirname(helpPath);
}

function findIncludeHelpPath(includeName, helpPath, baseHelpDir) {
    const candidates = [];
    const first = includeName[0] ? includeName[0].toLowerCase() : '';
    const fileNames = [
        includeName.endsWith('.ihlp') ? includeName : includeName + '.ihlp',
        includeName.endsWith('.hlp') ? includeName : includeName + '.hlp',
        includeName.endsWith('.sthlp') ? includeName : includeName + '.sthlp'
    ];

    for (const fileName of fileNames) {
        candidates.push(path.join(path.dirname(helpPath), fileName));
        if (first) candidates.push(path.join(baseHelpDir, first, fileName));
        candidates.push(path.join(baseHelpDir, fileName));
    }

    return candidates.find(candidate => candidate && fs.existsSync(candidate)) || null;
}

/**
 * Create hover provider for Stata commands
 * @param {Map} index - Help file index
 * @param {DocumentCache} cache - Document cache
 * @returns {Object} VS Code HoverProvider
 */
function createHoverProvider(index, cache) {
    if (index) {
        globalHelpIndex = index;
    }

    return {
        provideHover: async (document, position, token) => {
            let word;
            
            if (document.getWordRangeAtPosition) {
                const wordRange = document.getWordRangeAtPosition(position);
                if (!wordRange) {
                    return null;
                }
                word = document.getText(wordRange);
            } else {
                const line = document.lineAt ? document.lineAt(position.line) : { text: document.getText() };
                let lineText = line.text || document.getText();
                
                if (typeof lineText === 'function') {
                    lineText = document.getText();
                }
                
                if (position && position.character > 0) {
                    const beforeCursor = lineText.substring(0, position.character);
                    const afterCursor = lineText.substring(position.character);
                    
                    const beforeMatch = beforeCursor.match(/\b(\w+)$/);
                    const afterMatch = afterCursor.match(/^(\w+)\b/);
                    
                    if (beforeMatch && afterMatch) {
                        word = beforeMatch[1] + afterMatch[1];
                    } else if (beforeMatch) {
                        word = beforeMatch[1];
                    } else if (afterMatch) {
                        word = afterMatch[1];
                    }
                }
                
                if (!word) {
                    const words = lineText.trim().split(/\s+/);
                    word = words[0] || '';
                }
            }
            
            if (!word || word.trim() === '') {
                return null;
            }
            
            const wordLower = word.toLowerCase();
            
            // Lazy-build help index (drives command recognition)
            if (!globalHelpIndex) {
                globalHelpIndex = await module.exports.buildHelpIndex();
            }
            
            // Index-driven command recognition
            let isCommand = false;
            if (globalHelpIndex) {
                // a) Exact match in index
                isCommand = globalHelpIndex.has(wordLower);
                // b) Abbreviation: word is prefix of any indexed command
                if (!isCommand) {
                    for (const cmd of globalHelpIndex.keys()) {
                        if (cmd.startsWith(wordLower) && /^[a-z]/i.test(cmd[wordLower.length])) {
                            isCommand = true;
                            break;
                        }
                    }
                }
                // c) Progressive prefix removed — it caused false positives on
                // variable names that happen to contain a command as prefix.
            }
            // d) Fallback: builtin list (for commands without .sthlp, e.g. replace)
            if (!isCommand) {
                const customCommands = config.getCustomCommands ? config.getCustomCommands() : [];
                const allCommands = [...StataBuiltinCommands, ...customCommands];
                isCommand = allCommands.some(cmd => cmd.toLowerCase() === wordLower)
                    || allCommands.some(cmd => cmd.startsWith(wordLower) && cmd !== wordLower);
            }
            
            if (!isCommand) {
                return null;
            }

            // Only show hover at command positions (start of line or after prefix
            // colon) and skip blocked utility commands (data-mgmt, flow-control, …).
            // Estimation / analysis commands and ALL community commands pass through.
            if (!isAtCommandPosition(document, position)) {
                return null;
            }
            if (isBlockedCommand(wordLower)) {
                return null;
            }

            const line = document.lineAt ? document.lineAt(position.line) : { text: document.getText() };
            let lineText = line.text;
            
            if (typeof lineText === 'function') {
                lineText = document.getText();
            }
            
            const trimmedLine = (lineText || document.getText()).trim();
            if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) {
                return null;
            }
            
            // Check cache for hover content
            const cacheKey = `hover:${word}`;
            if (cache.has(cacheKey)) {
                const cachedContent = cache.get(cacheKey);
                const md = new vscode.MarkdownString(cachedContent);
                md.supportHtml = true;
                md.isTrusted = true;
                return new vscode.Hover(md);
            }
            
            // Ensure help index is built before searching
            if (!globalHelpIndex) {
                globalHelpIndex = await module.exports.buildHelpIndex();
            }
            
            // Find help file
            const helpFilePath = globalHelpIndex 
                ? await findHelpPath(word.toLowerCase()) 
                : null;
            
            if (!helpFilePath) {
                // Check if Stata is not installed or help file not found
                if (!globalHelpIndex) {
                    return getDegradedHover(word, 'stata_not_found');
                }
                return getDegradedHover(word, 'help_not_found');
            }
            
            // Read and parse help file
            const helpContent = await readHelpFile(helpFilePath);
            
            if (!helpContent) {
                return getDegradedHover(word, 'parse_error');
            }
            
            // Cache the content
            cache.set(cacheKey, helpContent);
            
            // Return hover with HTML support
            const md = new vscode.MarkdownString(helpContent);
            md.supportHtml = true;
            md.isTrusted = true;
            return new vscode.Hover(md);
        }
    };
}

// Create default hover provider instance
const defaultHoverProvider = createHoverProvider(globalHelpIndex, globalCache);

/**
 * Register hover provider with VS Code
 * @param {vscode.ExtensionContext} context - Extension context
 * @returns {vscode.Disposable} Disposable for the hover provider
 */
function registerHoverProvider(context) {
    // Initialize help index asynchronously
    buildHelpIndex().then(index => {
        globalHelpIndex = index;
    }).catch(e => {
        console.error('Failed to build help index:', e);
    });
    
    // Register hover provider for Stata language
    const disposable = vscode.languages.registerHoverProvider(
        { language: 'stata', scheme: 'file' },
        defaultHoverProvider
    );
    
    return disposable;
}

// Module exports
module.exports = {
    parseSmcl: parseSmclToHtml,
    parseSmclToHtml,
    buildHelpIndex,
    helpFinder: {
        findHelpPath,
        buildHelpIndex,
        findStataApp,
        getGlobalHelpIndex: () => globalHelpIndex,
        setGlobalHelpIndex: (v) => { globalHelpIndex = v; }
    },
    DocumentCache,
    createHoverProvider,
    readHelpFile,
    provideHover: defaultHoverProvider.provideHover,
    registerHoverProvider,
    StataBuiltinCommands
};
