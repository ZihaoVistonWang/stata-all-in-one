const test = require('node:test');
const assert = require('node:assert/strict');

const {
    REQUEST_KINDS,
    ViewerRequestTracker,
    ViewerRequestTrackerRegistry
} = require('../modules/runCode/embeddedConsole/dataViewer/viewerRequestTracker');

test('a slow older refresh cannot overwrite a newer one', () => {
    const view = new ViewerRequestTracker({ mode: 'console' });

    const olderRequest = view.begin(REQUEST_KINDS.REFRESH, { filterText: 'if foreign == 1' });
    const newerRequest = view.begin(REQUEST_KINDS.REFRESH, { filterText: 'if price > 5000' });

    // The newer request finishes first and is applied.
    assert.equal(view.apply(newerRequest), true);

    // The older response arrives afterwards and must be discarded.
    assert.equal(view.apply(olderRequest), false);
    assert.equal(view.isCurrent(olderRequest), false);
    assert.equal(view.isCurrent(newerRequest), true);
});

test('a stale error response is discarded just like a stale success', () => {
    const view = new ViewerRequestTracker({ mode: 'console' });
    const older = view.begin(REQUEST_KINDS.REFRESH, { filterText: 'if a' });
    const newer = view.begin(REQUEST_KINDS.REFRESH, { filterText: 'if b' });
    assert.equal(view.isCurrent(older), false, 'an error for a superseded request must not be shown');
    assert.equal(view.isCurrent(newer), true);
});

test('a dataset version change invalidates every in-flight request', () => {
    const view = new ViewerRequestTracker({ mode: 'console' });
    view.setDataVersion(3);

    const page = view.begin(REQUEST_KINDS.PAGE);
    const autoFit = view.begin(REQUEST_KINDS.AUTOFIT);
    assert.equal(view.isCurrent(page), true);

    // A user command changed the data while the page request was in flight.
    view.setDataVersion(4);
    assert.equal(view.isCurrent(page), false);
    assert.equal(view.isCurrent(autoFit), false);

    const fresh = view.begin(REQUEST_KINDS.PAGE);
    assert.equal(view.isCurrent(fresh), true);
});

test('closing the view cancels everything in flight', () => {
    const view = new ViewerRequestTracker({ mode: 'file', filePath: '/tmp/a.dta' });
    const refresh = view.begin(REQUEST_KINDS.REFRESH);
    const page = view.begin(REQUEST_KINDS.PAGE);
    assert.equal(view.hasPending(), true);

    view.markClosed();
    assert.equal(view.isCurrent(refresh), false);
    assert.equal(view.isCurrent(page), false);
    assert.equal(view.hasPending(), false);
});

test('two file views are tracked independently', () => {
    const registry = new ViewerRequestTrackerRegistry();
    const panelA = { id: 'A' };
    const panelB = { id: 'B' };

    const viewA = registry.acquire(panelA, { mode: 'file', filePath: '/data/a.dta' });
    const viewB = registry.acquire(panelB, { mode: 'file', filePath: '/data/b.dta' });

    const pageA = viewA.begin(REQUEST_KINDS.PAGE);
    const pageB = viewB.begin(REQUEST_KINDS.PAGE);

    // A pagination request from A must resolve against A's file.
    assert.equal(viewA.filePath, '/data/a.dta');
    assert.equal(viewB.filePath, '/data/b.dta');
    assert.equal(viewA.isCurrent(pageA), true);
    assert.equal(viewB.isCurrent(pageB), true);

    // Superseding A's requests must not affect B.
    viewA.supersede();
    assert.equal(viewA.isCurrent(pageA), false);
    assert.equal(viewB.isCurrent(pageB), true);

    // Closing A must not close B.
    registry.release(panelA);
    assert.equal(registry.peek(panelA), null);
    assert.equal(registry.peek(panelB), viewB);
    assert.equal(viewB.isCurrent(pageB), true);
});

test('a reopened panel gets a fresh view instead of the closed one', () => {
    const registry = new ViewerRequestTrackerRegistry();
    const panel = { id: 'A' };
    const first = registry.acquire(panel, { mode: 'file', filePath: '/data/a.dta' });
    registry.release(panel);

    const second = registry.acquire(panel, { mode: 'file', filePath: '/data/c.dta' });
    assert.notEqual(second, first);
    assert.equal(second.isClosed(), false);
    assert.equal(second.filePath, '/data/c.dta');
});

test('a duplicated lazy-window fetch is rejected while one is in flight', () => {
    const view = new ViewerRequestTracker({ mode: 'console' });
    assert.equal(view.beginWindow('f:100'), true);
    assert.equal(view.beginWindow('f:100'), false, 'the same window must not be fetched twice');
    view.endWindow('f:100');
    assert.equal(view.beginWindow('f:100'), true);
});

test('refresh supersedes a pending page request', () => {
    const view = new ViewerRequestTracker({ mode: 'console' });
    const page = view.begin(REQUEST_KINDS.PAGE);
    view.supersede([REQUEST_KINDS.PAGE, REQUEST_KINDS.AUTOFIT]);
    assert.equal(view.isCurrent(page), false);
});
