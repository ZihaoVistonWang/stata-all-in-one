const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    COMPLETION_TYPES,
    COMPLETION_MATCH_TYPES,
    MAX_COMPLETION_CANDIDATES,
    analyzeCompletionContext,
    matchCompletionLabel,
    selectCompletionCandidates,
    getCompletionSortText
} = require('../modules/completionContext');

const pools = {
    commands: ['reg', 'replace', 'format', 'foreach', 'predict'],
    variables: ['foreign', 'foo', 'price', 'revenue'],
    functions: ['floor', 'poisson', 'round'],
    options: ['format', 'percent', 'robust', 'row']
};

function analyze(text) {
    return analyzeCompletionContext(text, text.length);
}

function labels(text) {
    return selectCompletionCandidates(analyze(text), pools).map(item => item.label);
}

describe('completion context', () => {
    it('narrows an unindented line start to commands', () => {
        assert.strictEqual(analyze('r').type, COMPLETION_TYPES.command);
        assert.deepStrictEqual(labels('r'), ['reg', 'replace']);
    });

    it('recognizes a command after a known prefix', () => {
        assert.strictEqual(analyze('capture re').type, COMPLETION_TYPES.command);
        assert.deepStrictEqual(labels('capture re'), ['reg', 'replace', 'predict', 'foreach']);
    });

    it('narrows known command arguments to variables', () => {
        assert.strictEqual(analyze('reg y fo').type, COMPLETION_TYPES.variable);
        assert.deepStrictEqual(labels('reg y fo'), ['foo', 'foreign']);
        assert.strictEqual(analyze('reghdfe y fo').type, COMPLETION_TYPES.variable);
        assert.deepStrictEqual(labels('reghdfe y fo'), ['foo', 'foreign']);
        assert.deepStrictEqual(labels('reghdfe y p'), ['price']);
    });

    it('offers variables and functions in an if expression', () => {
        const context = analyze('reg y if fo');
        assert.strictEqual(context.type, COMPLETION_TYPES.expression);
        assert.deepStrictEqual(labels('reg y if fo'), ['foo', 'foreign', 'floor']);
    });

    it('offers functions as well as variables inside expressions', () => {
        const context = analyze('generate x = flo');
        assert.strictEqual(context.type, COMPLETION_TYPES.expression);
        assert.deepStrictEqual(labels('generate x = flo'), ['floor']);
    });

    it('narrows a top-level comma position to options', () => {
        assert.strictEqual(analyze('reg y, ro').type, COMPLETION_TYPES.option);
        assert.deepStrictEqual(labels('reg y, ro'), ['row', 'robust']);
    });

    it('narrows variable-valued option arguments to variables', () => {
        assert.strictEqual(analyze('reghdfe y x, absorb(fo').type, COMPLETION_TYPES.variable);
        assert.deepStrictEqual(labels('reghdfe y x, absorb(fo'), ['foo', 'foreign']);
        assert.deepStrictEqual(labels('reghdfe y x, absorb(p'), ['price']);
        assert.strictEqual(analyze('reghdfe y x, vce(cluster fo').type, COMPLETION_TYPES.variable);
        assert.deepStrictEqual(labels('reghdfe y x, vce(cluster fo'), ['foo', 'foreign']);
        assert.strictEqual(analyze('reghdfe y x, absorb(country##c.(fo').type, COMPLETION_TYPES.variable);
    });

    it('falls back after an absorb suboption comma', () => {
        assert.strictEqual(analyze('reghdfe y x, absorb(foo, sa').type, COMPLETION_TYPES.all);
    });

    it('falls back to all types for an unknown command', () => {
        const context = analyze('mystery f');
        assert.strictEqual(context.type, COMPLETION_TYPES.all);
        assert.deepStrictEqual(labels('mystery f'), ['foo', 'foreign', 'format', 'foreach', 'floor']);
        assert.strictEqual(analyze('mystery_command fo').type, COMPLETION_TYPES.all);
    });

    it('falls back to all types when an option expression is nested', () => {
        const context = analyze('reg y, vce(ro');
        assert.strictEqual(context.type, COMPLETION_TYPES.all);
        assert.deepStrictEqual(labels('reg y, vce(ro'), ['round', 'row', 'robust']);
    });

    it('falls back to all types for an indented line start', () => {
        const context = analyze('    fo');
        assert.strictEqual(context.type, COMPLETION_TYPES.all);
        assert.deepStrictEqual(labels('    fo'), ['foo', 'foreign', 'format', 'foreach', 'floor']);
    });

    it('returns an absolute replacement offset for multiline Console input', () => {
        const text = 'display 1\nreg y fo';
        const context = analyzeCompletionContext(text, text.length);
        assert.strictEqual(context.wordStart, text.lastIndexOf('fo'));
    });

    it('recognizes by and bysort variable positions', () => {
        assert.strictEqual(analyze('by fo').type, COMPLETION_TYPES.variable);
        assert.strictEqual(analyze('bysort fo').type, COMPLETION_TYPES.variable);
    });

    it('does not offer completions in comments, strings, or using paths', () => {
        assert.strictEqual(analyze('* fo').type, COMPLETION_TYPES.none);
        assert.strictEqual(analyze('display "fo').type, COMPLETION_TYPES.none);
        assert.strictEqual(analyze('use using fo').type, COMPLETION_TYPES.none);
    });
});

const contextMatrix = {
    [COMPLETION_TYPES.command]: [
        're',
        'capture re',
        'quietly su',
        'capture noisily lo',
        'by id: re',
        'by id (time): re',
        'bysort id: su',
        'svy: lo',
        'svy, subpop(flag): lo',
        'bootstrap: re',
        'bootstrap, reps(10): re',
        'statsby: re',
        'rolling: re',
        'stepwise: re'
    ],
    [COMPLETION_TYPES.variable]: [
        'areg y p',
        'browse p',
        'br p',
        'codebook p',
        'correlate p',
        'describe p',
        'drop p',
        'keep p',
        'list p',
        'logit y p',
        'nbreg y p',
        'ologit y p',
        'poisson y p',
        'probit y p',
        'ppmlhdfe y p',
        'pwcorr p',
        'regress y p',
        'reghdfe y p',
        'ivreghdfe y p',
        'ivreg2 y p',
        'quietly reghdfe y p',
        'replace p',
        'scatter y p',
        'sort p',
        'summarize p',
        'tabulate p',
        'tabstat p',
        'ttest p',
        'xtreg y p',
        'bysort id: reghdfe y p',
        'by id (time): summarize p',
        'areg y x, absorb(p',
        'reghdfe y x, absorb(p',
        'reghdfe y x, absorb(i.p',
        'reghdfe y x, absorb(firm#p',
        'reghdfe y x, absorb(country##c.(p',
        'reghdfe y x, cluster(p',
        'reghdfe y x, group(p',
        'reghdfe y x, individual(p',
        'regress y x, vce(cluster p',
        'egen x = mean(y), by(p',
        'margins, over(p'
    ],
    [COMPLETION_TYPES.expression]: [
        'assert p',
        'display p',
        'di p',
        'if p',
        'while p',
        'generate x = p',
        'replace x = p',
        'regress y if p',
        'count if p',
        'browse p if q',
        'display sqrt(p',
        'generate x = cond(p',
        'regress y if p > q',
        'generate x = p[q',
        'generate x = p + q'
    ],
    [COMPLETION_TYPES.option]: [
        'regress y, ro',
        'reghdfe y x, ab',
        'scatter y x, ti',
        'mystery y, ro',
        'save output, re'
    ],
    [COMPLETION_TYPES.all]: [
        'mystery p',
        'mystery_command p',
        '    p',
        'program define p',
        'local p',
        'merge 1:1 p',
        'reshape long p',
        'regress y, name(p',
        'regress y, level(p',
        'regress y, vce(p',
        'margins, at(p',
        'reghdfe y x, absorb(foo, p'
    ],
    [COMPLETION_TYPES.none]: [
        '// p',
        '* p',
        'regress y // p',
        'display "p',
        'local path "p',
        'use p',
        'save p',
        'do p',
        'include p',
        'cd p',
        'append using p',
        'merge 1:1 id using p'
    ]
};

describe('completion context matrix', () => {
    for (const [expectedType, examples] of Object.entries(contextMatrix)) {
        for (const example of examples) {
            it(`${expectedType}: ${example}`, () => {
                assert.strictEqual(analyze(example).type, expectedType);
            });
        }
    }
});

describe('completion candidate category filtering', () => {
    const cases = [
        ['re', ['reg', 'replace', 'predict', 'foreach']],
        ['reghdfe y p', ['price']],
        ['reghdfe y, absorb(p', ['price']],
        ['regress y if p', ['price', 'poisson']],
        ['regress y, ro', ['row', 'robust']],
        ['mystery p', ['price', 'predict', 'poisson', 'percent']]
    ];

    for (const [example, expectedLabels] of cases) {
        it(`filters ${example}`, () => {
            assert.deepStrictEqual(labels(example), expectedLabels);
        });
    }

    it('always places variables before every other candidate type', () => {
        const candidates = selectCompletionCandidates(analyze('mystery p'), pools);
        const vscodeSorted = [...candidates].sort((left, right) =>
            getCompletionSortText(left).localeCompare(getCompletionSortText(right))
        );
        assert.deepStrictEqual(
            vscodeSorted.map(candidate => candidate.kind),
            ['var', 'cmd', 'fn', 'opt']
        );
        assert.strictEqual(vscodeSorted[0].label, 'price');
    });
});

describe('completion fuzzy matching', () => {
    it('matches non-contiguous characters and returns original label indexes', () => {
        const match = matchCompletionLabel('a_list', 'alst');
        assert.deepStrictEqual(match.matchIndexes, [0, 2, 4, 5]);
        assert.strictEqual(match.matchType, COMPLETION_MATCH_TYPES.fuzzy);

        const pandas = matchCompletionLabel('pandas', 'pada');
        assert.deepStrictEqual(pandas.matchIndexes, [0, 1, 3, 4]);
        assert.strictEqual(pandas.matchType, COMPLETION_MATCH_TYPES.fuzzy);
    });

    it('matches case-insensitively and recognizes exact and normalized prefixes', () => {
        assert.strictEqual(
            matchCompletionLabel('A_LIST', 'a_list').matchType,
            COMPLETION_MATCH_TYPES.exact
        );
        const normalized = matchCompletionLabel('a_list', 'alist');
        assert.strictEqual(normalized.matchType, COMPLETION_MATCH_TYPES.normalizedPrefix);
        assert.deepStrictEqual(normalized.matchIndexes, [0, 2, 3, 4, 5]);
    });

    it('does not use broad fuzzy matching for one character', () => {
        assert.strictEqual(matchCompletionLabel('price', 'r'), null);
        assert.strictEqual(matchCompletionLabel('revenue', 'r').matchType, COMPLETION_MATCH_TYPES.prefix);
    });

    it('supports fuzzy matching in every context-eligible candidate category', () => {
        const fuzzyPools = {
            commands: ['regress'],
            variables: ['a_list'],
            functions: ['parsedate'],
            options: ['allbaselevels']
        };
        assert.deepStrictEqual(
            selectCompletionCandidates(analyze('rgs'), fuzzyPools).map(item => item.label),
            ['regress']
        );
        assert.deepStrictEqual(
            selectCompletionCandidates(analyze('reg y alst'), fuzzyPools).map(item => item.label),
            ['a_list']
        );
        assert.deepStrictEqual(
            selectCompletionCandidates(analyze('display pada'), fuzzyPools).map(item => item.label),
            ['parsedate']
        );
        assert.deepStrictEqual(
            selectCompletionCandidates(analyze('reg y, ablv'), fuzzyPools).map(item => item.label),
            ['allbaselevels']
        );
    });

    it('deduplicates case-insensitively and sorts deterministically', () => {
        const fuzzyPools = {
            commands: [],
            variables: ['a_long_list', 'A_LIST', 'a_list', 'another_list'],
            functions: [],
            options: []
        };
        const candidates = selectCompletionCandidates(analyze('reg y alst'), fuzzyPools);
        assert.deepStrictEqual(
            candidates.map(item => item.label),
            ['A_LIST', 'a_long_list', 'another_list']
        );
    });

    it('always caps the returned candidate count', () => {
        const variables = Array.from(
            { length: MAX_COMPLETION_CANDIDATES + 50 },
            (_value, index) => `a_${index}_list`
        );
        const candidates = selectCompletionCandidates(analyze('reg y alst'), {
            commands: [], variables, functions: [], options: []
        }, Infinity);
        assert.strictEqual(candidates.length, MAX_COMPLETION_CANDIDATES);
    });
});
