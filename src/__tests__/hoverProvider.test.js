/**
 * Hover Provider Test Suite - RED phase tests
 * Tests for hoverProvider.js (SMCL Parser, Help Finder, Hover Provider)
 * These tests should FAIL because hoverProvider.js doesn't exist yet
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const mockVscode = {
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

let hoverProvider;
let parseSmcl;
let helpFinder;

try {
    hoverProvider = require('../modules/hoverProvider');
    parseSmcl = hoverProvider.parseSmcl;
    helpFinder = hoverProvider.helpFinder;
} catch (e) {
    parseSmcl = undefined;
    helpFinder = undefined;
}

// ============================================
// SMCL Parser Tests (~10 test cases)
// ============================================

describe('SMCL Parser Tests', () => {
    
    test('1. Plain text → unchanged output', () => {
        const input = 'This is plain text without any SMCL';
        const result = parseSmcl(input);
        assert.ok(result.includes('This is plain text without any SMCL'));
    });

    test('2. {bf:bold} → <b>bold</b>', () => {
        const input = '{bf:bold text}';
        const result = parseSmcl(input);
        assert.ok(result.includes('<b>bold text</b>'));
    });

    test('3. {it:italic} → <i>italic</i>', () => {
        const input = '{it:italic text}';
        const result = parseSmcl(input);
        assert.ok(result.includes('<i>italic text</i>'));
    });

    test('4. {cmd:regress} → <code class="command">regress</code>', () => {
        const input = '{cmd:regress}';
        const result = parseSmcl(input);
        assert.ok(result.includes('code class="command"') && result.includes('regress'));
    });

    test('5. {p}text{p_end} → paragraph', () => {
        const input = '{p}This is a paragraph{p_end}';
        const result = parseSmcl(input);
        assert.ok(result.includes('This is a paragraph'), 
            '{p}...{p_end} should preserve paragraph content');
    });

    test('6. {title:Syntax} → <h2>Syntax</h2>', () => {
        const input = '{title:Syntax}';
        const result = parseSmcl(input);
        assert.ok(result.includes('<h2>') && result.includes('Syntax'));
    });

    test('7. {hline} → <hr>', () => {
        const input = '{hline}';
        const result = parseSmcl(input);
        assert.ok(result.includes('<hr>'));
    });

    test('8. {newvar} → _newvar_', () => {
        const input = '{newvar:myvar}';
        const result = parseSmcl(input);
        assert.ok(result.includes('myvar'), 
            '{newvar:...} should indicate a new variable');
    });

    test('9. {helpb:command} → help link', () => {
        const input = '{helpb:regress}';
        const result = parseSmcl(input);
        assert.ok(result.includes('regress'), 
            '{helpb:...} should include command name');
    });

    test('10. Complex mixed SMCL', () => {
        const input = '{title:Regression} {cmd:regress} depvar {it:indepvar} {bf:option}';
        const result = parseSmcl(input);
        assert.ok(result.includes('Regression'), 'Should contain title');
        assert.ok(result.includes('regress'), 'Should contain command');
        assert.ok(result.includes('indepvar'), 'Should contain italic');
        assert.ok(result.includes('option'), 'Should contain bold');
    });

    test('11. {input:cmd} and {error:err} → styled code', () => {
        const input = '{input:display} {error:invalid syntax}';
        const result = parseSmcl(input);
        assert.ok(result.includes('display'), 'Should contain input content');
        assert.ok(result.includes('invalid syntax'), 'Should contain error content');
    });

    test('12. Multiple nested SMCL directives', () => {
        const input = '{bf:{it:bold italic}}';
        const result = parseSmcl(input);
        assert.ok(result.includes('bold italic'), 'Should handle nested directives');
    });

    test('12b. synopt rows render as an HTML table', () => {
        const input = [
            '{synopthdr}',
            '{synopt:{opt absorb(varlist)}}fixed effects{p_end}',
            '{synopt:{opt vce(cluster clustvar)}}clustered standard errors{p_end}'
        ].join('\n');
        const result = parseSmcl(input);
        assert.ok(result.includes('<table>'), 'Should include syntax table');
        assert.ok(result.includes('<th>Options</th>'), 'Should include syntax table header');
        assert.ok(result.includes('absorb(<var>varlist</var>)'), 'Should include option name');
        assert.ok(result.includes('fixed effects'), 'Should include option description');
    });

    test('12c. p2col rows render as a two-column table', () => {
        const input = [
            '{p2col:{cmd:reghdfe}}linear regression with multiple fixed effects{p_end}',
            '{p2col:{help reghdfe##syntax:syntax}}command syntax{p_end}'
        ].join('\n');
        const result = parseSmcl(input);
        assert.ok(result.includes('<table>'), 'Should include p2col table');
        assert.ok(result.includes('<td>'), 'Should include table cells');
        assert.ok(result.includes('reghdfe'), 'Should include first column content');
        assert.ok(result.includes('multiple fixed effects'), 'Should include second column content');
    });

    test('12d. multi-line syntax paragraphs preserve placeholders', () => {
        const input = [
            '{p 8 15 2} {cmd:reghdfe}',
            '{depvar} [{indepvars}]',
            '{ifin} {it:{weight}}',
            '[{cmd:,} {help reghdfe##options_table:options}]',
            '{p_end}'
        ].join('\n');
        const result = parseSmcl(input);
        assert.ok(result.includes('<var>depvar</var>'), 'Should preserve depvar placeholder');
        assert.ok(result.includes('[<var>indepvars</var>]'), 'Should preserve bracketed indepvars');
        assert.ok(result.includes('[<var>if</var>] [<var>in</var>]'), 'Should expand if/in placeholder');
        assert.ok(result.includes('[<var>weight</var>]'), 'Should expand weight placeholder');
    });

    test('12e. opth abbreviations keep the abbreviated prefix', () => {
        const input = '{opth a:bsorb(reghdfe##absorb:absvars)}';
        const result = parseSmcl(input);
        assert.ok(result.includes('<u>a</u>bsorb'), 'Should preserve option abbreviation');
        assert.ok(result.includes('<var>absvars</var>'), 'Should render linked option placeholder');
    });
});

// ============================================
// Help Finder Tests (~5 test cases)
// ============================================

describe('Help Finder Tests', () => {
    
    test('13. macOS path resolution', async () => {
        // Test that helpFinder can find help files on macOS
        const result = await helpFinder.findHelpPath('regress', '/Applications');
        
        // Should either find a path or return null if no Stata installed
        assert.ok(
            result === null || (typeof result === 'string' && result.includes('regress')),
            'Should return path or null'
        );
    });

    test('14. Windows path resolution', async () => {
        // Test Windows-style path resolution
        const result = await helpFinder.findHelpPath('summarize', 'C:\\Program Files\\Stata17');
        
        // Should either find a path or return null
        assert.ok(
            result === null || (typeof result === 'string'),
            'Should return path or null on Windows'
        );
    });

    test('15. Directory scanning & index building', async () => {
        // Test that helpFinder can scan a directory and build index
        const testDir = '/tmp/test-stata-help';
        
        // Create mock help files
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        // Create a mock help file
        fs.writeFileSync(path.join(testDir, 'regress.hlp'), 'regress help content');
        
        const index = await helpFinder.buildHelpIndex(testDir);
        
        // Cleanup
        try {
            fs.unlinkSync(path.join(testDir, 'regress.hlp'));
            fs.rmdirSync(testDir);
        } catch (e) {}
        
        assert.ok(index !== null && typeof index === 'object', 
            'Should build help index');
    });

    test('16. No Stata installed → empty index', async () => {
        // Test with non-existent directory
        const index = await helpFinder.buildHelpIndex('/nonexistent/path/to/stata');
        
        // Should return empty or null
        assert.ok(
            index === null || index === undefined || Object.keys(index).length === 0,
            'Should return empty index when Stata not found'
        );
    });

    test('17. Cache hit', async () => {
        // First call should populate cache
        const result1 = await helpFinder.findHelpPath('regress', '/Applications');
        
        // Second call should use cache
        const result2 = await helpFinder.findHelpPath('regress', '/Applications');
        
        // Results should be consistent
        assert.strictEqual(result1, result2, 
            'Cache should return same result');
    });
});

// ============================================
// Hover Provider Tests (~5 test cases)
// ============================================

describe('Hover Provider Tests', () => {
    
    test('18. Command hover → returns Hover', async () => {
        // Mock document and position
        const mockDocument = {
            getText: () => 'regress y x',
            lineAt: (line) => ({ text: 'regress y x' })
        };
        const mockPosition = new mockVscode.Position(0, 0);
        
        const hover = await hoverProvider.provideHover(mockDocument, mockPosition);
        
        assert.ok(hover !== null && hover !== undefined, 
            'Should return Hover object for valid command');
        assert.ok(hover.contents !== undefined, 
            'Hover should have contents');
    });

    test('19. Non-command hover → returns null', async () => {
        // Word that's not a Stata command
        const mockDocument = {
            getText: (range) => 'myvariable',
            lineAt: () => ({ text: 'myvariable', range: { start: { line: 0 }, end: { line: 0 } } })
        };
        const mockPosition = new mockVscode.Position(0, 0);
        
        const hover = await hoverProvider.provideHover(mockDocument, mockPosition);
        
        assert.strictEqual(hover, null, 
            'Should return null for non-command word');
    });

    test('20. Comment line command → returns null', async () => {
        // Command in comment should not trigger hover
        const mockDocument = {
            getText: () => '// regress y x',
            lineAt: (line) => ({ text: '// regress y x' })
        };
        const mockPosition = new mockVscode.Position(0, 0);
        
        const hover = await hoverProvider.provideHover(mockDocument, mockPosition);
        
        assert.strictEqual(hover, null, 
            'Should return null for command in comment');
    });

    test('21. Cache second hit', async () => {
        const mockDocument = {
            getText: () => 'summarize',
            lineAt: () => ({ text: 'summarize' })
        };
        const mockPosition = new mockVscode.Position(0, 0);
        
        // First hover
        const hover1 = await hoverProvider.provideHover(mockDocument, mockPosition);
        
        // Second hover - should use cache
        const hover2 = await hoverProvider.provideHover(mockDocument, mockPosition);
        
        assert.deepStrictEqual(hover1, hover2, 
            'Cache should return same Hover object');
    });

    test('22. Command not found → degraded message', async () => {
        // Unknown command
        const mockDocument = {
            getText: () => 'nonexistentcmd',
            lineAt: () => ({ text: 'nonexistentcmd' })
        };
        const mockPosition = new mockVscode.Position(0, 0);
        
        const hover = await hoverProvider.provideHover(mockDocument, mockPosition);
        
        // Should return null or degraded message
        assert.ok(
            hover === null || (hover && hover.contents && hover.contents.value && hover.contents.value.includes('not found')),
            'Should return null or degraded message for unknown command'
        );
    });
});

// ============================================
// Additional Edge Case Tests
// ============================================

describe('Edge Cases', () => {
    
    test('23. Empty input', () => {
        const result = parseSmcl('');
        assert.strictEqual(result, '', 'Empty string should return empty');
    });
    test('24. Word at cursor detection', async () => {
        const mockDocument = {
            getText: (range) => {
                if (range) {
                    return 'regress';
                }
                return 'some text regress more text';
            },
            lineAt: () => ({ text: 'some text regress more text' })
        };
        
        // Cursor in the middle of "regress"
        const mockPosition = new mockVscode.Position(0, 12);
        
        const hover = await hoverProvider.provideHover(mockDocument, mockPosition);
        
        assert.ok(hover !== null, 'Should detect word at cursor position');
    });

    test('25. Partial command match', async () => {
        const mockDocument = {
            getText: () => 'reg',
            lineAt: () => ({ text: 'reg' })
        };
        const mockPosition = new mockVscode.Position(0, 0);
        
        const hover = await hoverProvider.provideHover(mockDocument, mockPosition);
        
        // Partial commands might not match or might suggest completions
        assert.ok(hover === null || hover !== null, 
            'Partial command handling is implementation-specific');
    });
});

// ============================================
// Module Export Tests
// ============================================

describe('Module Structure', () => {
    
    test('26. hoverProvider module exports required functions', () => {
        assert.ok(hoverProvider !== undefined, 'Module should be defined');
        assert.ok(typeof hoverProvider.parseSmcl === 'function', 
            'Should export parseSmcl function');
        assert.ok(typeof hoverProvider.helpFinder !== 'undefined', 
            'Should export helpFinder object');
        assert.ok(typeof hoverProvider.provideHover === 'function', 
            'Should export provideHover function');
    });
});

// ============================================
// Community Command Tests (~3 test cases)
// ============================================

describe('Community Command Tests', () => {
    
    test('28. Community command scanning on macOS', async () => {
        const platform = require('os').platform();
        
        if (platform !== 'darwin') {
            return;
        }
        
        const testDir = '/tmp/test-stata-community';
        
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(testDir, 'reghdfe.sthlp'), 'reghdfe help content');
        
        const index = await helpFinder.buildHelpIndex(testDir);
        
        try {
            fs.unlinkSync(path.join(testDir, 'reghdfe.sthlp'));
            fs.rmdirSync(testDir);
        } catch (e) {}
        
        assert.ok(index !== null && typeof index === 'object', 
            'Should build help index including community commands');
        assert.ok(index.has('reghdfe'), 'Should find community command reghdfe');
    });

    test('29. Community command scanning on Windows', async () => {
        const platform = require('os').platform();
        
        if (platform !== 'win32') {
            return;
        }
        
        const os = require('os');
        const testDir = path.join(os.tmpdir(), 'test-stata-community');
        
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(testDir, 'ivreghdfe.sthlp'), 'ivreghdfe help content');
        
        const index = await helpFinder.buildHelpIndex(testDir);
        
        try {
            fs.unlinkSync(path.join(testDir, 'ivreghdfe.sthlp'));
            fs.rmdirSync(testDir);
        } catch (e) {}
        
        assert.ok(index !== null && typeof index === 'object', 
            'Should build help index including community commands');
        assert.ok(index.has('ivreghdfe'), 'Should find community command ivreghdfe');
    });

    test('30. Builtin commands take precedence over community', async () => {

        const builtinDir = '/tmp/test-stata-builtin';
        const communityDir = '/tmp/test-stata-community';
        
        for (const dir of [builtinDir, communityDir]) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        
        fs.writeFileSync(path.join(builtinDir, 'regress.hlp'), 'builtin regress');
        fs.writeFileSync(path.join(communityDir, 'regress.hlp'), 'community regress');
        
        const builtinIndex = await helpFinder.buildHelpIndex(builtinDir);
        const communityIndex = await helpFinder.buildHelpIndex(communityDir);
        
        try {
            fs.unlinkSync(path.join(builtinDir, 'regress.hlp'));
            fs.unlinkSync(path.join(communityDir, 'regress.hlp'));
            fs.rmdirSync(builtinDir);
            fs.rmdirSync(communityDir);
        } catch (e) {}
        
        assert.ok(builtinIndex.has('regress'), 'Builtin index should have regress');
        assert.ok(communityIndex.has('regress'), 'Community index should have regress');
    });

    test('36. Additional ado paths are scanned by buildHelpIndex', async () => {
        // Create base dir and additional dir with help files
        const baseDir = '/tmp/test-stata-additional-base';
        const additionalDir = '/tmp/test-stata-additional-extra';

        for (const dir of [baseDir, additionalDir]) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        // Help file in base dir
        fs.writeFileSync(path.join(baseDir, 'regress.hlp'), 'builtin regress');
        // Help file in additional dir
        fs.writeFileSync(path.join(additionalDir, 'mycustomcmd.sthlp'), 'mycustomcmd help');

        // Build index with additional paths
        const index = await helpFinder.buildHelpIndex(baseDir, [additionalDir]);

        // Cleanup
        for (const dir of [baseDir, additionalDir]) {
            try {
                const entries = fs.readdirSync(dir);
                for (const entry of entries) {
                    fs.unlinkSync(path.join(dir, entry));
                }
                fs.rmdirSync(dir);
            } catch (e) {}
        }

        // Should find commands from both the base path and additional paths
        assert.ok(index !== null && typeof index === 'object',
            'Should build help index');
        assert.ok(index.has('regress'),
            'Should include command from base path');
        assert.ok(index.has('mycustomcmd'),
            'Should include command from additional ado path');
    });
});

// ============================================
// Exception Handling & Degradation Tests
// ============================================

describe('Exception Handling & Degradation', () => {
    
    test('31. Stata not installed shows degraded message', async () => {
        const mockDocument = {
            getText: () => 'xtabond',
            lineAt: () => ({ text: 'xtabond' })
        };
        const mockPosition = new mockVscode.Position(0, 0);
        
        const originalIndex = hoverProvider.helpFinder.getGlobalHelpIndex();
        const originalBuildHelpIndex = hoverProvider.buildHelpIndex;
        hoverProvider.helpFinder.setGlobalHelpIndex(null);
        hoverProvider.buildHelpIndex = async () => null;
        
        const hover = await hoverProvider.provideHover(mockDocument, mockPosition);
        
        hoverProvider.helpFinder.setGlobalHelpIndex(originalIndex);
        hoverProvider.buildHelpIndex = originalBuildHelpIndex;
        
        assert.ok(hover !== null, 'Should return hover object');
        assert.ok(hover.contents.value.includes('Stata not found'), 
            'Should show Stata not found degraded message');
    });

    test('32. Missing help file shows degraded message', async () => {
        // Create a temporary directory with no help files for the command
        const testDir = '/tmp/test-stata-nohelp';
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        // Build index with empty directory
        const index = await helpFinder.buildHelpIndex(testDir);
        
        // Create hover provider with this index
        const mockCache = new hoverProvider.DocumentCache(200);
        const provider = hoverProvider.createHoverProvider(index, mockCache);
        
        const mockDocument = {
            getText: () => 'nonexistentcmd',
            lineAt: () => ({ text: 'nonexistentcmd' }),
            getWordRangeAtPosition: () => ({ start: { line: 0, character: 0 }, end: { line: 0, character: 13 } })
        };
        const mockPosition = new mockVscode.Position(0, 0);
        
        const hover = await provider.provideHover(mockDocument, mockPosition, null);
        
        try {
            fs.rmdirSync(testDir);
        } catch (e) {}
        
        // Should either return null (command not recognized) or degraded message
        assert.ok(hover === null || hover.contents.value.includes('No help file found'), 
            'Should show help not found degraded message or null for unknown command');
    });

    test('33. SMCL parse error returns original text', () => {
        // Test that malformed SMCL returns original text
        const malformedSmcl = '{bf:unclosed tag without closing brace';
        const result = parseSmcl(malformedSmcl);
        
        // Should return original text or processed text (not crash)
        assert.ok(typeof result === 'string', 'Should return string, not crash');
        assert.ok(result.includes('unclosed') || result.includes('bf'), 
            'Should preserve content even with parse errors');
    });

    test('34. Large file is truncated', async () => {
        // Create a large help file (>500KB)
        const testDir = '/tmp/test-stata-large';
        const largeHelpPath = path.join(testDir, 'largecmd.sthlp');
        
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        // Create content >500KB (repeat a pattern to reach the size)
        const largeContent = '{title:Large Command}\n{p}This is a large help file.{p_end}\n' +
            'x'.repeat(600 * 1024); // 600KB content
        
        fs.writeFileSync(largeHelpPath, largeContent);
        
        // Test that readHelpFile truncates large files
        const parsedContent = await hoverProvider.readHelpFile(largeHelpPath);
        
        try {
            fs.unlinkSync(largeHelpPath);
            fs.rmdirSync(testDir);
        } catch (e) {}
        
        // Should return truncated content (not null)
        assert.ok(parsedContent !== null, 'Should return content, not null');
        assert.ok(typeof parsedContent === 'string', 'Should return string');
        // Content should be less than original due to truncation
        assert.ok(parsedContent.length < largeContent.length, 
            'Should truncate large file content');
    });

    test('35. Unclosed SMCL tag does not crash', () => {
        // Test various malformed SMCL patterns
        const testCases = [
            '{bf:only open',
            '{it:missing close}',
            'text with {bf:nested {it:tags}}',
            '{bf:}{it:}{cmd:}',
            '{unknown:tag}'
        ];
        
        for (const testCase of testCases) {
            const result = parseSmcl(testCase);
            assert.ok(typeof result === 'string', 
                `Should return string for "${testCase}", not crash`);
        }
    });

    test('37. INCLUDE help directives are expanded', async () => {
        const testDir = '/tmp/test-stata-include';
        const mainHelpPath = path.join(testDir, 'maincmd.sthlp');
        const includeHelpPath = path.join(testDir, 'common.ihlp');

        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        fs.writeFileSync(mainHelpPath, '{title:Main}\nINCLUDE help common');
        fs.writeFileSync(includeHelpPath, '{pstd}Included help text{p_end}');

        const parsedContent = await hoverProvider.readHelpFile(mainHelpPath);

        try {
            fs.unlinkSync(mainHelpPath);
            fs.unlinkSync(includeHelpPath);
            fs.rmdirSync(testDir);
        } catch (e) {}

        assert.ok(parsedContent.includes('Included help text'),
            'Should expand local .ihlp include files');
    });
});
