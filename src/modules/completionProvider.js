/**
 * Stata Autocomplete/IntelliSense Provider
 * Provides code completion suggestions for Stata commands
 */

const vscode = require('vscode');
const config = require('../utils/config');

// Extract Stata built-in commands from the grammar
// This list is derived from grammars/stata.json
const STATA_BUILTIN_COMMANDS = [
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

// Additional keywords and functions for autocomplete
const STATA_KEYWORDS = [
    'if', 'else', 'foreach', 'forvalues', 'while', 'by', 'bysort',
    'in', 'using', 'quietly', 'noisily', 'capture', 'assert'
];

// Built-in functions from the grammar
const STATA_FUNCTIONS = [
    'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'comb', 'cond', 'cos',
    'exp', 'floor', 'int', 'ln', 'log', 'log10', 'max', 'min', 'mod',
    'round', 'sign', 'sin', 'sqrt', 'sum', 'tan', 'uniform', 'runiform',
    'rchi2', 'rnormal', 'rgamma', 'rbinomial', 'rbeta', 'rd', 'real',
    'string', 'length', 'substr', 'index', 'strpos', 'strmatch',
    'strtoname', 'strofreal', 'subinstr', 'upper', 'lower', 'proper',
    'trim', 'ltrim', 'rtrim', 'reverse', 'date', 'dofc', 'dofC', 'dofh',
    'dofm', 'dofq', 'dofw', 'dofy', 'day', 'month', 'quarter', 'week',
    'year', 'dow', 'doy', 'chi2', 'chi2tail', 'invchi2tail', 'F',
    'Ftail', 'invFtail', 'normal', 'normalden', 'invnormal', 'ttail',
    'invttail', 'binomial', 'binomialtail', 'poisson'
];

/**
 * Extract variable names from the document
 * Looks for patterns like: gen/generate varname = ..., or variable names in commands
 * @param {vscode.TextDocument} document
 * @returns {Set<string>}
 */
function extractVariableNames(document) {
    const variables = new Set();
    
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        
        // Skip comment lines
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) {
            continue;
        }
        
        // Pattern 1: gen/generate/egen varname = ...
        // Match: gen var_name = or generate var_name =
        const genMatch = line.match(/\b(gen|generate|egen)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/i);
        if (genMatch) {
            variables.add(genMatch[2]);
        }
        
        // Pattern 2: Variables after 'summarize', 'sum', 'tabstat', 'reg', etc.
        // Match: command var1 var2 var3 ...
        const cmdPatterns = [
            /\b(summarize|sum|describe|desc|list|lis|li|tabulate|tab|tabstat|correlate|corr|pwcorr)\s+(.*?)(?:\n|,|$)/i,
            /\b(reg|regress|logit|probit|ologit|poisson|nbreg)\s+(.*?)\s+(?:if|in|,|$)/i,
            /\b(scatter|twoway|graph)\s+(.*?),/i
        ];
        
        for (const pattern of cmdPatterns) {
            const match = line.match(pattern);
            if (match && match[2]) {
                // Extract variable names from the command arguments
                const vars = match[2].split(/[\s,]+/).filter(v => v && !v.match(/^[0-9]/));
                // Only add valid variable names (alphanumeric + underscore)
                vars.forEach(v => {
                    if (v.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
                        variables.add(v);
                    }
                });
            }
        }
        
        // Pattern 3: Variables from 'rename', 'drop', 'keep' commands
        const renameMatch = line.match(/\b(rename|drop|keep)\s+(.*?)(?:\n|if|in|,|$)/i);
        if (renameMatch && renameMatch[2]) {
            const vars = renameMatch[2].split(/[\s,]+/).filter(v => v && v.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/));
            vars.forEach(v => variables.add(v));
        }
        
        // Pattern 4: Variables from assignments in expressions
        // Match: varname == value or varname > value in if conditions
        const exprMatch = line.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*([><=!]+|in|if)/g);
        if (exprMatch) {
            exprMatch.forEach(expr => {
                const varMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
                if (varMatch) {
                    variables.add(varMatch[1]);
                }
            });
        }
    }
    
    return variables;
}

/**
 * Create completion items from a list of words
 * @param {string[]} words - Array of word suggestions
 * @param {vscode.CompletionItemKind} kind - Type of completion item
 * @returns {vscode.CompletionItem[]}
 */
function createCompletionItems(words, kind) {
    return words.map(word => {
        const item = new vscode.CompletionItem(word, kind);
        item.insertText = word;
        item.sortText = word;
        return item;
    });
}

/**
 * Create the completion provider
 * @returns {vscode.CompletionItemProvider}
 */
function createCompletionProvider() {
    return {
        /**
         * Provide completion items
         * @param {vscode.TextDocument} document
         * @param {vscode.Position} position
         * @param {vscode.CancellationToken} token
         * @param {vscode.CompletionContext} context
         * @returns {vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList>}
         */
        provideCompletionItems(document, position, token, context) {
            // Get the word being typed
            const linePrefix = document.getText(new vscode.Range(
                new vscode.Position(position.line, 0),
                position
            ));

            // Check if we're on a comment line - don't provide completions
            if (linePrefix.trimStart().startsWith('//') || linePrefix.trimStart().startsWith('*')) {
                return [];
            }

            // Get the word before cursor
            const wordMatch = linePrefix.match(/\S+$/);
            if (!wordMatch) {
                return [];
            }

            const items = [];

            // Add built-in commands
            items.push(...createCompletionItems(STATA_BUILTIN_COMMANDS, vscode.CompletionItemKind.Keyword));

            // Add keywords
            items.push(...createCompletionItems(STATA_KEYWORDS, vscode.CompletionItemKind.Keyword));

            // Add functions
            items.push(...createCompletionItems(STATA_FUNCTIONS, vscode.CompletionItemKind.Function));

            // Add custom/third-party commands from user configuration
            const customCommands = config.getCustomCommands();
            const customItems = customCommands.map(cmd => {
                const item = new vscode.CompletionItem(cmd, vscode.CompletionItemKind.Keyword);
                item.insertText = cmd;
                item.sortText = cmd;
                item.detail = 'Custom/third-party command';
                item.documentation = `Custom Stata command: ${cmd}`;
                return item;
            });
            items.push(...customItems);

            // Add variable names extracted from the document
            const variables = extractVariableNames(document);
            const variableItems = Array.from(variables).map(varName => {
                const item = new vscode.CompletionItem(varName, vscode.CompletionItemKind.Variable);
                item.insertText = varName;
                item.sortText = varName;
                item.detail = 'Variable';
                item.documentation = `Variable: ${varName}`;
                return item;
            });
            items.push(...variableItems);

            return items;
        },

        /**
         * Resolve completion item with additional information
         * @param {vscode.CompletionItem} item
         * @param {vscode.CancellationToken} token
         * @returns {vscode.ProviderResult<vscode.CompletionItem>}
         */
        resolveCompletionItem(item, token) {
            // Optionally add documentation for items
            if (STATA_BUILTIN_COMMANDS.includes(item.label)) {
                item.detail = 'Stata built-in command';
                item.documentation = `Built-in Stata command: ${item.label}`;
            } else if (STATA_FUNCTIONS.includes(item.label)) {
                item.detail = 'Stata function';
                item.documentation = `Stata function: ${item.label}()`;
            } else if (STATA_KEYWORDS.includes(item.label)) {
                item.detail = 'Stata keyword';
                item.documentation = `Stata keyword: ${item.label}`;
            } else {
                // Check if it's a custom command
                const customCommands = config.getCustomCommands();
                if (customCommands.includes(item.label.toLowerCase())) {
                    item.detail = 'Custom/third-party command';
                    item.documentation = `Custom Stata command: ${item.label}`;
                }
                // Variables are handled by the completion item creation
            }
            return item;
        }
    };
}

/**
 * Register the completion provider
 * @param {vscode.ExtensionContext} context
 */
function registerCompletionProvider(context) {
    const provider = createCompletionProvider();
    
    const disposable = vscode.languages.registerCompletionItemProvider(
        { language: 'stata' },
        provider,
        // Trigger on any letter or underscore
        ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 
            'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
            '_', '.']
    );
    
    context.subscriptions.push(disposable);
}

module.exports = { registerCompletionProvider };
