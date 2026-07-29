const EDITOR_TITLE_ACTIONS_STAGE_KEY = 'stata-all-in-one.editorTitleActionsStage';
const EDITOR_TITLE_ACTION_TRANSITIONS = [
    { delay: 10000, stage: 1 },
    { delay: 11000, stage: 2 },
    { delay: 12000, stage: 3 },
    { delay: 13000, stage: 4 }
];
const EDITOR_TITLE_ACTION_FAST_TRANSITIONS = [
    { delay: 1000, stage: 1 },
    { delay: 2000, stage: 2 },
    { delay: 3000, stage: 3 },
    { delay: 4000, stage: 4 }
];

function createEditorTitleBrandController({
    setStage,
    defaultTransitions = EDITOR_TITLE_ACTION_TRANSITIONS,
    fastTransitions = EDITOR_TITLE_ACTION_FAST_TRANSITIONS,
    schedule = setTimeout,
    cancel = clearTimeout
}) {
    let transitionTimers = [];

    async function scheduleTransitions(transitions) {
        for (const timer of transitionTimers) {
            cancel(timer);
        }
        transitionTimers = [];

        await setStage(0);
        transitionTimers = transitions.map(({ delay, stage }) => schedule(() => {
            Promise.resolve(setStage(stage)).catch(() => {});
        }, delay));
    }

    function revealAll() {
        return scheduleTransitions(defaultTransitions);
    }

    function switchToIcons() {
        return scheduleTransitions(fastTransitions);
    }

    function dispose() {
        for (const timer of transitionTimers) {
            cancel(timer);
        }
        transitionTimers = [];
    }

    return {
        revealAll,
        switchToIcons,
        dispose
    };
}

module.exports = {
    EDITOR_TITLE_ACTIONS_STAGE_KEY,
    EDITOR_TITLE_ACTION_TRANSITIONS,
    EDITOR_TITLE_ACTION_FAST_TRANSITIONS,
    createEditorTitleBrandController
};
