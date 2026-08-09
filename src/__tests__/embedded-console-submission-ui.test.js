const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const panelSource = fs.readFileSync(
    path.join(__dirname, '../modules/runCode/embeddedConsole/panel.js'),
    'utf8'
);
const commonSource = fs.readFileSync(
    path.join(__dirname, '../utils/common.js'),
    'utf8'
);

test('renders a five-line collapsible input cell with one shared content baseline', () => {
    assert.match(panelSource, /--console-run-gutter:\s*26px/);
    assert.match(panelSource, /\.submission-cell\s*\{[\s\S]*grid-template-columns:\s*var\(--console-run-gutter\) minmax\(0, 1fr\)/);
    assert.match(panelSource, /\.submission-code\s*\{[\s\S]*max-height:\s*7\.5em;[\s\S]*white-space:\s*pre-wrap;[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*normal/);
    assert.match(panelSource, /\.submission-count\s*\{[\s\S]*color:\s*var\(--stata-comment\)/);
    assert.match(panelSource, /\.submission-count\s*\{[\s\S]*font-size:\s*0\.82em/);
    assert.match(panelSource, /\.submission-count\s*\{[\s\S]*text-align:\s*right;[\s\S]*white-space:\s*nowrap/);
    assert.match(panelSource, /\.submission-frame\s*\{[\s\S]*--submission-background:\s*var\(--console-cell-background\);[\s\S]*border:\s*1px solid var\(--vscode-focusBorder\)/);
    assert.match(panelSource, /--console-cell-background:\s*var\([\s\S]*--vscode-notebook-cellEditorBackground/);
    assert.match(panelSource, /#input-highlight\s*\{[\s\S]*border-radius:\s*7px;[\s\S]*background:\s*var\(--console-cell-background\)/);
    assert.match(panelSource, /#input\s*\{[\s\S]*border:\s*1px solid var\(--vscode-focusBorder\);[\s\S]*border-radius:\s*7px/);
    assert.match(panelSource, /\.line-command,[\s\S]*padding-left:\s*var\(--console-run-gutter\);[\s\S]*text-indent:\s*-2ch/);
    assert.match(panelSource, /\.line-command,[\s\S]*\.line-raw-prompt\s*\{[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*normal/);
    assert.match(panelSource, /softWrapSeparators = new Set\(\['\/', '\\\\\\\\', '_', '-', '\.'/);
    assert.equal(panelSource.includes('function appendSoftWrappingText(container, value)'), true);
    assert.equal(panelSource.includes("document.createElement('wbr')"), true);
    assert.equal(
        panelSource.match(/appendSoftWrappingText\(span, segment && segment\.text\)/g)?.length,
        2
    );
    assert.match(panelSource, /\.result-block-scroll \.line\s*\{[\s\S]*white-space:\s*pre/);
    assert.match(panelSource, /\.result-block-shell::before,[\s\S]*width:\s*30px;[\s\S]*transition:\s*opacity 140ms ease/);
    assert.match(panelSource, /\.result-block-scroll\.has-horizontal-overflow\s*\{[\s\S]*padding-bottom:\s*14px/);
    assert.match(panelSource, /\.result-block-scroll\s*\{[\s\S]*scrollbar-color:\s*var\(--vscode-scrollbarSlider-background\) transparent/);
    assert.match(panelSource, /\.result-block-scroll::-webkit-scrollbar\s*\{[\s\S]*height:\s*10px/);
    assert.match(panelSource, /\.result-block-scroll::-webkit-scrollbar-thumb\s*\{[\s\S]*border:\s*2px solid transparent;[\s\S]*border-radius:\s*999px;[\s\S]*background-color:\s*var\(--vscode-scrollbarSlider-background\)/);
    assert.match(panelSource, /\.result-block-shell\.has-hidden-left::before,[\s\S]*\.result-block-shell\.has-hidden-right::after/);
    assert.equal(panelSource.includes("block.classList.toggle('has-horizontal-overflow', maxScrollLeft > 1)"), true);
    assert.equal(panelSource.includes("shell.classList.toggle('has-hidden-left', block.scrollLeft > 1)"), true);
    assert.equal(panelSource.includes("'has-hidden-right'"), true);
    assert.equal(panelSource.includes('configureResultScrollHints();'), true);
    assert.match(panelSource, /#output\s*\{[\s\S]*scrollbar-gutter:\s*stable;/);
    assert.match(panelSource, /#jump-bottom-button\s*\{[\s\S]*right:\s*12px;/);
    assert.match(panelSource, /const rightAnchor = outputShell\.querySelector\('\.submission-frame'\) \|\| input;/);
    assert.match(panelSource, /jumpBottomButton\.style\.right = rightOffset \+ 'px';/);
    assert.doesNotMatch(panelSource, /\.submission-cell\[data-run-status="running"\]/);
    assert.doesNotMatch(panelSource, /\.submission-cell\[data-run-status="success"\]/);
    assert.equal(panelSource.includes("frame.classList.toggle('is-expanded')"), true);
    assert.equal(panelSource.includes("msg('consoleExpandInput')"), true);
    assert.equal(panelSource.includes("msg('consoleCollapseInput')"), true);
    assert.equal(commonSource.includes("consoleExpandInput: 'Expand all'"), true);
    assert.equal(commonSource.includes("consoleCollapseInput: 'Collapse'"), true);
    assert.equal(commonSource.includes("consoleExpandInput: '展开全部'"), true);
    assert.equal(commonSource.includes("consoleCollapseInput: '收起'"), true);
    assert.equal(panelSource.includes('submission-chevron'), false);
    assert.equal(panelSource.includes("chevron.textContent = expanded ? '⌃' : '⌄'"), false);
});

test('highlights only matched autocomplete characters with safe DOM text', () => {
    assert.match(panelSource, /\.autocomplete-label-match\s*\{[\s\S]*--vscode-editorSuggestWidget-highlightForeground/);
    assert.equal(panelSource.includes('function appendAutocompleteLabel(container, label, matchIndexes)'), true);
    assert.equal(panelSource.includes('new Set(Array.isArray(matchIndexes) ? matchIndexes : [])'), true);
    assert.equal(panelSource.includes("span.className = 'autocomplete-label-match'"), true);
    assert.equal(panelSource.includes('span.textContent = chunk'), true);
    assert.equal(panelSource.includes("appendAutocompleteLabel(text, label, m.matchedOn === 'label' ? [] : m.matchIndexes)"), true);
    assert.equal(panelSource.includes('m.labelDisplayMatchIndexes || []'), true);
    assert.equal(panelSource.includes('text.innerHTML = label'), false);
});

test('shows compact run navigation on the right with transparent highlighted previews', () => {
    assert.equal(panelSource.includes('const RUN_NAV_ENABLED = true;'), true);
    assert.equal(panelSource.includes('if (!RUN_NAV_ENABLED)'), true);
    assert.match(panelSource, /#run-nav\s*\{[\s\S]*right:\s*15px;[\s\S]*width:\s*25px;[\s\S]*box-sizing:\s*border-box;[\s\S]*pointer-events:\s*none/);
    assert.match(panelSource, /#run-nav\.has-runs\.scrollbar-active\s*\{[\s\S]*opacity:\s*0;[\s\S]*visibility:\s*hidden;[\s\S]*translate\(5px, -50%\)/);
    assert.match(panelSource, /transition:\s*opacity 180ms ease, transform 180ms ease, visibility 180ms ease/);
    assert.match(panelSource, /\.run-nav-marker\s*\{[\s\S]*width:\s*6px;[\s\S]*height:\s*2px/);
    assert.match(panelSource, /\.run-nav-marker\.previewing\s*\{[\s\S]*width:\s*11px/);
    assert.match(panelSource, /--console-nav-marker:[\s\S]*--console-nav-active:\s*var\(--vscode-editor-foreground\)/);
    assert.equal(panelSource.includes('backdrop-filter: blur(12px)'), false);
    assert.equal(
        panelSource.includes('background: color-mix(in srgb, var(--vscode-editor-background) 76%, transparent)'),
        false
    );
    assert.match(panelSource, /\.run-nav-tooltip-code\s*\{[\s\S]*border:\s*1px solid var\(--vscode-focusBorder\);[\s\S]*background:\s*var\(--console-cell-background\)/);
    assert.match(panelSource, /#run-nav-tooltip\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.equal(panelSource.includes('run-nav-tooltip-count'), false);
    assert.match(panelSource, /\.run-nav-preview-line\s*\{[\s\S]*padding-left:\s*1\.5ch;[\s\S]*text-indent:\s*-1\.5ch;[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*normal/);
    assert.match(panelSource, /\.run-nav-preview-line > \.tok\s*\{[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*normal/);
    assert.equal(panelSource.includes('runNavTooltip.append(code);'), true);
    assert.equal(panelSource.includes("target.querySelectorAll('.submission-line')"), true);
    assert.equal(panelSource.includes('node.cloneNode(true)'), true);
    assert.equal(panelSource.includes("appendSoftWrappingText(line, value || ' ')"), true);
    assert.equal(panelSource.includes('const navRect = runNav.getBoundingClientRect();'), true);
    assert.equal(panelSource.includes("runNavTooltip.style.right = (window.innerWidth - navRect.left + 8) + 'px'"), true);
    assert.equal(panelSource.includes("runNavTooltip.style.right = (window.innerWidth - rect.left + 8) + 'px'"), false);
    assert.equal(panelSource.includes('function noteVerticalScrollbarActivity()'), true);
    assert.equal(panelSource.includes("output.classList.toggle('scrollbar-active', shouldHide)"), true);
    assert.equal(panelSource.includes("runNav.classList.toggle('scrollbar-active', shouldHide)"), true);
    assert.match(panelSource, /#run-nav\.has-hidden-top\.has-hidden-bottom\s*\{[\s\S]*mask-image:\s*linear-gradient/);
    assert.equal(panelSource.includes('function updateRunNavOverflowHints()'), true);
    assert.equal(panelSource.includes("runNav.classList.toggle('has-hidden-top'"), true);
    assert.equal(panelSource.includes("'has-hidden-bottom'"), true);
    assert.equal(panelSource.includes('function centerRunNavMarker(marker)'), true);
    assert.equal(panelSource.includes('markerCenter - runNav.clientHeight / 2'), true);
    assert.equal(panelSource.includes('const inputActivationY = outputRect.bottom - 1;'), true);
    assert.equal(panelSource.includes('cell.getBoundingClientRect().top < inputActivationY'), true);
    assert.equal(panelSource.includes('const atBottom = isOutputAtBottom();'), false);
    assert.equal(panelSource.includes('function positionRunNavigation()'), true);
    assert.equal(panelSource.includes('const outputRect = output.getBoundingClientRect();'), true);
    assert.equal(panelSource.includes("runNav.style.maxHeight = Math.max(0, bottom - top) + 'px'"), true);
    assert.equal(panelSource.includes('const runNavBoundsObserver = new ResizeObserver(positionRunNavigation);'), true);
    assert.equal(panelSource.includes('runNavBoundsObserver.observe(composer);'), true);
    assert.equal(panelSource.includes('updateActiveRunMarker(true);'), true);
    assert.equal(panelSource.includes("document.addEventListener('wheel', event =>"), true);
    assert.equal(panelSource.includes("{ passive: false, capture: true }"), true);
    assert.match(panelSource, /#output\s*\{[\s\S]*scrollbar-color:\s*transparent transparent/);
    assert.match(panelSource, /#output\.scrollbar-active\s*\{[\s\S]*scrollbar-color:\s*var\(--vscode-scrollbarSlider-background\) transparent/);
    assert.match(panelSource, /#output::-webkit-scrollbar-thumb\s*\{[\s\S]*background-color:\s*transparent/);
    assert.match(panelSource, /#output\.scrollbar-active::-webkit-scrollbar-thumb\s*\{[\s\S]*background-color:\s*var\(--vscode-scrollbarSlider-background\)/);
    assert.equal(panelSource.includes("output.addEventListener('wheel', noteVerticalScrollbarActivity"), false);
    assert.equal(panelSource.includes('pointerInVerticalScrollbarRail'), false);
    assert.equal(panelSource.includes('}, 1000);'), true);
    assert.equal(panelSource.includes("nearestRunMarker(event.clientY)"), true);
    assert.equal(panelSource.includes("cell.scrollIntoView({ behavior: 'smooth', block: 'start' })"), true);
    assert.match(panelSource, /#output\s*\{[\s\S]*padding:\s*12px 18px 18px 0/);
});
