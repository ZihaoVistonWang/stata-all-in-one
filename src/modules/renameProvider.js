/**
 * Rename Provider Module
 * Provides rename functionality for user-defined Stata variables
 */

const vscode = require('vscode');
const config = require('../utils/config');
const { msg } = require('../utils/common');

// Stata built-in commands (should not be renamed)
const STATA_BUILTIN_COMMANDS = [
    'about', 'ac', 'acprplot', 'ado', 'adopath', 'adoupdate', 'alpha', 'ameans',
    'anova', 'aorder', 'append', 'arch', 'areg', 'args', 'arima', 'asmprobit',
    'avplot', 'avplots', 'binreg', 'biprobit', 'bitest', 'bitesti', 'blogit',
    'boot', 'bprobit', 'browse', 'bsample', 'bsqreg', 'ca', 'canon', 'capture',
    'cc', 'cci', 'cd', 'centile', 'cf', 'char', 'chdir', 'checksum', 'ci', 'cii',
    'clear', 'clist', 'clog', 'clogit', 'cloglog', 'clonevar', 'cluster',
    'cmdlog', 'cnsreg', 'codebook', 'collapse', 'compare', 'compress', 'confirm', 'cap', 'destring', 'tostring', 'egen',
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
    'gammahet', 'generate', 'gen', 'gisid', 'gladder', 'glm', 'glevelsof', 'glim',
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
    'qladder', 'qnorm', 'qqplot', 'qreg', 'quantile', 'query', 'qui', 'quietly',
    'range', 'ranksum', 'ratio', 'rchart', 'rcof', 'recast', 'recode', 'reg', 'reg3', 'regdw', 'regress', 'replace', 'reshape', 'restore', 'return',
    'rmdir', 'robvar', 'roccomp', 'rocfit', 'rocgold', 'rocplot', 'roctab',
    'rologit', 'rotating', 'rreg', 'run', 'runtest', 'rvfplot', 'safesum',
    'sample', 'sampsi', 'save', 'saveold', 'scatter', 'scm', 'score',
    'scoreplot', 'scree', 'screeplot', 'sdtest', 'sdtesti', 'search',
    'separate', 'serrbar', 'serset', 'set', 'sfrancia', 'shell', 'shewhart',
    'simulate', 'sktest', 'slogit', 'smooth', 'snapspan', 'sort', 'spearman',
    'spikeplot', 'split', 'sqreg', 'stack', 'stbase', 'stci', 'stcox',
    'stcoxkm', 'stcstat', 'stcurv', 'stcurve', 'stdes', 'stem', 'stepwise',
    'stfill', 'stgen', 'stir', 'stjoin', 'stmc', 'stmh', 'stphplot',
    'stphtest', 'stptime', 'strate', 'streg', 'stset', 'stsplit', 'stsum', 'stsv', 'su', 'sun', 'suest', 'sum', 'summarize', 'sunflower', 'sureg', 'svar',
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
    'vargranger', 'varirf', 'varlmar', 'varnorm', 'varsoc', 'varstable', 'varwle', 'vec', 'vecank', 'vecnorm', 'vecrank', 'vecstable', 'verinst',
    'version', 'view', 'viewsource', 'vif', 'vwls', 'webdescribe', 'webseek',
    'webuse', 'which', 'while', 'wilcoxon', 'window', 'winexec', 'wntestb',
    'wntestq', 'xchart', 'xcorr', 'xi', 'xmlsave', 'xmluse', 'xpose',
    'xt', 'xtabond', 'xtclog', 'xtcloglog', 'xtcorr', 'xtdata', 'xtdes',
    'xtfrontier', 'xtgee', 'xtgls', 'xthaus', 'xthausman', 'xthtaylor',
    'xtile', 'xtintreg', 'xtivreg', 'xtline', 'xtlogit', 'xtmixed', 'xtnbreg', 'xtpcse', 'xtpois', 'xtpoisson', 'xtpred', 'xtprobit',
    'xtrc', 'xtrchh', 'xtreg', 'xtregar', 'xtset', 'xtsum', 'xttab', 'xttest0', 'xttobit', 'xtrans', 'zip', 'ztp', 'ztnb',
    // Community-developed commands
    'ivreg2', 'outreg', 'outreg2', 'gcollapse', 'gcontract', 'gegen',
    'gisid', 'glevelsof', 'gquantiles', 'winsor2', 'coefplot', 'ppmlhdfe',
    'eststo', 'estout', 'esttab', 'estadd', 'estpost'
];

// Stata functions (for validation only - check for conflicts with new names)
// Note: We don't forbid renaming these, but check for conflicts
const STATA_FUNCTIONS = [
    'log', 'ln', 'exp', 'sqrt', 'round', 'abs', 'min', 'max', 
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan'
];

// Stata keywords (should not be renamed)
const STATA_KEYWORDS = [
    'if', 'else', 'foreach', 'forvalues', 'while', 'by', 'bysort',
    'in', 'using', 'quietly', 'noi', 'noisily', 'capture', 'assert'
];

/**
 * Check if a word is renamable (not a built-in command or keyword)
 * @param {string} word - The word to check
 * @returns {boolean}
 */
function isRenamable(word) {
    const lowerWord = word.toLowerCase();

    // Check against built-in commands (case-insensitive)
    if (STATA_BUILTIN_COMMANDS.includes(lowerWord)) {
        return false;
    }

    // Check against keywords (case-insensitive)
    if (STATA_KEYWORDS.includes(lowerWord)) {
        return false;
    }

    // Note: We no longer forbid renaming functions
    // Functions like log, ln, etc. should be allowed as variable names

    // Check against custom commands from user configuration
    const customCommands = config.getCustomCommands();
    if (Array.isArray(customCommands) && customCommands.length > 0) {
        const lowerCustomCommands = customCommands.map(cmd => cmd.toLowerCase());
        if (lowerCustomCommands.includes(lowerWord)) {
            return false;
        }
    }

    return true;
}

/**
 * Check if a position is in a comment line
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @returns {boolean}
 */
function isInCommentLine(document, position) {
    const line = document.lineAt(position.line).text.trimStart();
    return line.startsWith('//') || line.startsWith('*');
}

/**
 * Check if a position is an option name (should not be renamed)
 * @param {vscode.TextDocument} document
 * @param {vscode.Position} position
 * @returns {boolean}
 */
function isOptionNameAtPosition(document, position) {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
        return false;
    }

    const word = document.getText(wordRange).toLowerCase();
    const lineText = document.lineAt(position.line).text;

    const beforeWord = lineText.substring(0, wordRange.start.character).trimEnd();
    const afterWord = lineText.substring(wordRange.end.character);
    const trimmedAfter = afterWord.trimLeft();

    console.log(`[Rename Debug] Word: "${word}"`);
    console.log(`[Rename Debug] Before: "${beforeWord}" (length: ${beforeWord.length})`);
    console.log(`[Rename Debug] After: "${afterWord}" (length: ${afterWord.length})`);
    console.log(`[Rename Debug] TrimmedAfter: "${trimmedAfter}"`);

    // Rule 1: Word followed by opening parenthesis (option with parameters)
    // This matches: keep(var), se(1), bdec(3), etc.
    // The word BEFORE the parentheses is an option name and should NOT be renamed
    if (trimmedAfter.startsWith('(') && !trimmedAfter.startsWith(')(')) {
        console.log(`[Rename Debug] ✓ Matched Rule 1: Word before parentheses`);
        return true;
    }
    console.log(`[Rename Debug] ✗ Rule 1: BeforeParentheses condition not met. ` +
                `startsWith('(${trimmedAfter.charAt(0)}')=${trimmedAfter.startsWith('(')}, ` +
                `startsWith(')(')=${trimmedAfter.startsWith(')(')}`);

    // Rule 2: Word inside parentheses (should be allowed to rename)
    // This matches: keep(var) where var is a variable name
    if (beforeWord.endsWith('(') || trimmedAfter.startsWith(')')) {
        console.log(`[Rename Debug] ✓ Matched Rule 2: Word inside parentheses`);
        console.log(`[Rename Debug] → Allowing rename for word "${word}"`);
        return false;
    }
    console.log(`[Rename Debug] ✗ Rule 2: Not inside parentheses`);

    // Rule 3: First word after comma
    if (beforeWord.endsWith(',')) {
        console.log(`[Rename Debug] ✓ Matched Rule 3: First word after comma`);
        return true;
    }
    console.log(`[Rename Debug] ✗ Rule 3: Not after comma`);

    // Rule 4: Word after slash
    if (beforeWord.endsWith('/')) {
        console.log(`[Rename Debug] ✓ Matched Rule 4: Word after slash`);
        return true;
    }
    console.log(`[Rename Debug] ✗ Rule 4: Not after slash`);

    // Rule 5: Common fixed option names
    const commonOptions = ['if', 'in', 'using', 'drop', 'keep', 'replace', 'cluster', 'robust', 'noisily', 'quietly', 'capture', 'estimate'];
    const beforeWithoutWhitespace = beforeWord.trim();
    if (commonOptions.includes(word)) {
        if (beforeWithoutWhitespace.endsWith(',') || beforeWithoutWhitespace.endsWith('/')) {
            console.log(`[Rename Debug] ✓ Matched Rule 5: Common option in option context`);
            return true;
        }
    }
    console.log(`[Rename Debug] ✗ Rule 5: Common option check`);

    console.log(`[Rename Debug] → Final decision: ALLOW rename for "${word}"`);
    return false;
}

/**
 * Create the rename provider
 */
function createRenameProvider() {
    return {
        /**
         * Prepare rename at the given position
         * @param {vscode.TextDocument} document
         * @param {vscode.Position} position
         * @param {vscode.CancellationToken} token
         * @returns {Promise<vscode.ProviderResult<vscode.Range>>}
         */
        prepareRename(document, position, token) {
            // Check if in comment line - cannot rename
            if (isInCommentLine(document, position)) {
                return undefined;
            }

            // Get the word at the cursor position
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange) {
                return undefined;
            }

            const word = document.getText(wordRange);

            // Check if the word is renamable (not in any forbidden list)
            if (!isRenamable(word)) {
                return undefined;
            }

            // Check if the word is an option name (should not be renamed)
            if (isOptionNameAtPosition(document, position)) {
                return undefined;
            }

            // Return the range for rename
            return wordRange;
        },
        
        /**
         * Provide rename edits
         * @param {vscode.TextDocument} document
         * @param {vscode.Position} position
         * @param {string} newName
         * @param {vscode.CancellationToken} token
         * @returns {Promise<vscode.ProviderResult<vscode.WorkspaceEdit>>}
         */
        provideRenameEdits(document, position, newName, token) {
            // Check naming rules: must start with letter or underscore and contain only alphanumeric and underscore
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
                vscode.window.showErrorMessage(
                    'Invalid variable name: Must start with a letter or underscore and contain only letters, numbers, and underscores'
                );
                return null;
            }
            
            // Check conflicts with built-in commands
            if (STATA_BUILTIN_COMMANDS.includes(newName.toLowerCase())) {
                vscode.window.showErrorMessage(
                    `Name conflicts with built-in Stata command: ${newName}`
                );
                return null;
            }
            
            // Check conflicts with keywords
            if (STATA_KEYWORDS.includes(newName.toLowerCase())) {
                vscode.window.showErrorMessage(
                    `Name conflicts with Stata keyword: ${newName}`
                );
                return null;
            }
            
            // Get the word being renamed
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange) {
                return null;
            }
            
            const oldName = document.getText(wordRange);
            
            // Skip if old name and new name are the same
            if (oldName === newName) {
                return null;
            }
            
            // Create regex pattern for whole word matching
            // Use \b for word boundaries to match whole words only
            const pattern = new RegExp(`\\b${escapeRegExp(oldName)}\\b`, 'g');
            
            const edits = [];
            
            // Search through the entire document
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                const lineText = line.text;
                
                // Skip comment lines (lines starting with // or *)
                const trimmedLine = lineText.trimStart();
                if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
                    continue;
                }
                
                // Find all matches in this line
                let match;
                const linePattern = new RegExp(`\\b${escapeRegExp(oldName)}\\b`, 'g');
                
                while ((match = linePattern.exec(lineText)) !== null) {
                    const start = new vscode.Position(i, match.index);
                    const end = new vscode.Position(i, match.index + match[0].length);
                    const range = new vscode.Range(start, end);
                    edits.push(new vscode.TextEdit(range, newName));
                }
            }
            
            // Create workspace edit
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(document.uri, edits);
            
            return workspaceEdit;
        }
    };
}

/**
 * Escape special regex characters
 * @param {string} string
 * @returns {string}
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

/**
 * Register the rename provider
 * @param {vscode.ExtensionContext} context
 */
function registerRenameProvider(context) {
    const provider = createRenameProvider();
    
    const disposable = vscode.languages.registerRenameProvider(
        { language: 'stata' },
        provider
    );
    
    context.subscriptions.push(disposable);
}

/**
 * Execute rename command triggered by F2
 * This function checks if the current position is renamable before proceeding
 */
function executeRename() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const position = editor.selection.active;

    // Check if in comment line - cannot rename
    if (isInCommentLine(document, position)) {
        return;
    }

    // Get the word at the cursor position
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
        return;
    }

    const word = document.getText(wordRange);

    // Check if the word is renamable (not in any forbidden list)
    if (!isRenamable(word)) {
        // Show warning message at bottom-right corner
        const message = msg('cannotRenameCommand', { word: word });
        vscode.window.showWarningMessage(message);
        return;
    }

    // Check if the word is an option name (should not be renamed)
    if (isOptionNameAtPosition(document, position)) {
        const message = msg('cannotRenameOption', { word: word });
        vscode.window.showWarningMessage(message);
        return;
    }

    // If all checks pass, execute VSCode's rename command
    // This will invoke our rename provider's prepareRename and provideRenameEdits
    vscode.commands.executeCommand('editor.action.rename');
}

module.exports = {
    registerRenameProvider,
    executeRename
};