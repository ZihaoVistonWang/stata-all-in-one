const test = require('node:test');
const assert = require('node:assert/strict');

const {
    EDITOR_TITLE_ACTION_FAST_TRANSITIONS,
    EDITOR_TITLE_ACTION_TRANSITIONS,
    createEditorTitleBrandController
} = require('../modules/editorTitleBrand');

test('title actions start as text and switch to icons at 10, 11, 12, and 13 seconds', async () => {
    const stages = [];
    const scheduled = [];
    const controller = createEditorTitleBrandController({
        setStage: stage => stages.push(stage),
        schedule: (callback, delay) => {
            scheduled.push({ callback, delay, cancelled: false });
            return scheduled.length;
        },
        cancel: timer => {
            scheduled[timer - 1].cancelled = true;
        }
    });

    await controller.revealAll();

    assert.deepEqual(stages, [0]);
    assert.deepEqual(
        scheduled.map(item => item.delay),
        EDITOR_TITLE_ACTION_TRANSITIONS.map(item => item.delay)
    );

    for (const item of scheduled) {
        item.callback();
        await Promise.resolve();
    }

    assert.deepEqual(stages, [0, 1, 2, 3, 4]);
});

test('clicking the tab icon restores every text action and restarts all transitions', async () => {
    const stages = [];
    const scheduled = [];
    const controller = createEditorTitleBrandController({
        setStage: stage => stages.push(stage),
        schedule: (callback, delay) => {
            scheduled.push({ callback, delay, cancelled: false });
            return scheduled.length;
        },
        cancel: timer => {
            scheduled[timer - 1].cancelled = true;
        }
    });

    await controller.revealAll();
    await controller.revealAll();

    assert.deepEqual(stages, [0, 0]);
    assert.equal(scheduled.slice(0, 4).every(item => item.cancelled), true);
    assert.deepEqual(
        scheduled.slice(4).map(item => item.delay),
        [10000, 11000, 12000, 13000]
    );

    scheduled[4].callback();
    await Promise.resolve();

    assert.deepEqual(stages, [0, 0, 1]);
});

test('clicking the Stata All in One text switches actions at 1, 2, 3, and 4 seconds', async () => {
    const stages = [];
    const scheduled = [];
    const controller = createEditorTitleBrandController({
        setStage: stage => stages.push(stage),
        schedule: (callback, delay) => {
            scheduled.push({ callback, delay, cancelled: false });
            return scheduled.length;
        },
        cancel: timer => {
            scheduled[timer - 1].cancelled = true;
        }
    });

    await controller.revealAll();
    await controller.switchToIcons();

    assert.deepEqual(stages, [0, 0]);
    assert.equal(scheduled.slice(0, 4).every(item => item.cancelled), true);
    assert.deepEqual(
        scheduled.slice(4).map(item => item.delay),
        EDITOR_TITLE_ACTION_FAST_TRANSITIONS.map(item => item.delay)
    );

    for (const item of scheduled.slice(4)) {
        item.callback();
        await Promise.resolve();
    }

    assert.deepEqual(stages, [0, 0, 1, 2, 3, 4]);
});
