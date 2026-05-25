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
        const blocks = parseSmclBlocks(smclText);
        return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) {
        return escHtml(smclText);
    }
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
    
    let baseHelpPath;
    
    if (customBasePath) {
        baseHelpPath = customBasePath;
    } else {
        // Determine platform
        const platform = process.platform;
        
        if (platform === 'darwin') {
            // macOS: Find Stata.app and resolve ado/base path
            const stataVersion = config.getStataVersion ? config.getStataVersion() : 'StataMP';
            const foundApp = findStataApp(stataVersion);
            
            if (foundApp.path) {
                // Try traditional path: Stata.app/Contents/Resources/ado/base/
                baseHelpPath = path.join(foundApp.path, 'Contents', 'Resources', 'ado', 'base');
                
                // If not found, try StataNow-style path: {parent}/ado/base/
                // (StataNow puts ado/base/ alongside the .app bundle, not inside it)
                if (!fs.existsSync(baseHelpPath)) {
                    const appParentDir = path.dirname(foundApp.path);
                    const altPath = path.join(appParentDir, 'ado', 'base');
                    if (fs.existsSync(altPath)) {
                        baseHelpPath = altPath;
                    }
                }
            } else {
                return null;
            }
        } else if (platform === 'win32') {
            // Windows: Get Stata path from config
            const stataPath = config.getStataPathOnWindows ? config.getStataPathOnWindows() : '';
            
            if (stataPath && fs.existsSync(stataPath)) {
                // Extract directory from executable path
                const stataDir = path.dirname(stataPath);
                baseHelpPath = path.join(stataDir, 'ado', 'base');
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
    
    // Check if base path exists
    if (!baseHelpPath || !fs.existsSync(baseHelpPath)) {
        return null;
    }
    
    // Recursively scan for .sthlp and .hlp files (max depth 3)
    const scanDirectory = (dirPath, currentDepth = 0) => {
        if (currentDepth > 3) return;
        
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    scanDirectory(fullPath, currentDepth + 1);
                } else if (entry.isFile()) {
                    // Check for .sthlp or .hlp files
                    const ext = path.extname(entry.name);
                    if (ext === '.sthlp' || ext === '.hlp') {
                        // Extract command name from filename
                        const cmdName = path.basename(entry.name, ext);
                        index.set(cmdName, fullPath);
                    }
                }
            }
        } catch (e) {
            // Silently handle errors (permission, not found, etc.)
        }
    };
    
    scanDirectory(baseHelpPath);
    
    // Scan community commands (after built-in commands for lower priority)
    const platform = process.platform;
    const homeDir = os.homedir();
    let communityPath;

    if (platform === 'darwin') {
        communityPath = path.join(homeDir, 'Library', 'Application Support', 'Stata', 'ado', 'plus');
    } else if (platform === 'win32') {
        communityPath = path.join(homeDir, 'ado', 'plus');
    }

    // Scan community commands if path exists
    if (communityPath && fs.existsSync(communityPath)) {
        scanDirectory(communityPath);
    }

    // Also scan plus/ alongside the ado/base/ directory (StataNow layout)
    const installPlusPath = path.join(path.dirname(path.dirname(baseHelpPath)), 'plus');
    if (installPlusPath !== communityPath && fs.existsSync(installPlusPath)) {
        scanDirectory(installPlusPath);
    }

    // Scan additional ado paths from parameter or configuration
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
    
    // Look up command in index
    let helpPath = globalHelpIndex.get(commandName);
    
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
                // c) Progressive prefix: word's prefix is an indexed command (e.g. bysort → by)
                if (!isCommand && wordLower.length > 1) {
                    for (let i = wordLower.length - 1; i >= 1; i--) {
                        if (globalHelpIndex.has(wordLower.substring(0, i))) {
                            isCommand = true;
                            break;
                        }
                    }
                }
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
