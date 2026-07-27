const directDtaStore = require('./directDtaStore');
const consoleDataReader = require('./consoleDataReader');

let live = null;
let loading = null;
let generation = 0;

async function getLiveData() {
    while (true) {
        if (live) return live;
        if (!loading) {
            const captureGeneration = generation;
            loading = consoleDataReader.capture().then((data) => {
                if (captureGeneration === generation) {
                    live = data;
                }
                return { data, generation: captureGeneration };
            }).finally(() => {
                loading = null;
            });
        }
        const result = await loading;
        if (result.generation === generation) {
            return result.data;
        }
    }
}

async function getLiveSnapshot(filterText = '', startObs = 0, count = 500) {
    const data = await getLiveData();
    return directDtaStore.getSnapshotFromData(
        data,
        'Stata memory',
        count,
        filterText,
        startObs
    );
}

async function getLiveMore(startObs, count, filterText = '') {
    const data = await getLiveData();
    return directDtaStore.getMoreFromData(data, startObs, count, filterText);
}

async function getLiveColumnAutoFitValue(column, filterText = '') {
    const data = await getLiveData();
    return directDtaStore.getColumnAutoFitValueFromData(data, column, filterText);
}

async function captureSnapshot(filterText = '', startObs = 0, count = 500) {
    const data = await consoleDataReader.capture();
    return {
        data,
        view: directDtaStore.getSnapshotFromData(
            data,
            'Stata memory',
            count,
            filterText,
            startObs
        )
    };
}

async function getMore(entry, startObs, count, filterText = '') {
    return directDtaStore.getMoreFromData(entry.data, startObs, count, filterText);
}

async function getColumnAutoFitValue(entry, column, filterText = '') {
    return directDtaStore.getColumnAutoFitValueFromData(
        entry.data,
        column,
        filterText
    );
}

async function getSnapshot(entry, filterText = '', startObs = 0, count = 500) {
    return directDtaStore.getSnapshotFromData(
        entry.data,
        'Stata memory',
        count,
        filterText,
        startObs
    );
}

async function invalidateLive() {
    generation += 1;
    live = null;
}

async function resetLive() {
    generation += 1;
    if (loading) {
        try {
            await loading;
        } catch (_error) {
            // A failed capture is already surfaced by the Data Viewer.
        }
    }
    live = null;
}

async function dispose(entry) {
    if (entry) entry.data = null;
}

module.exports = {
    getLiveSnapshot,
    getLiveMore,
    getLiveColumnAutoFitValue,
    captureSnapshot,
    getSnapshot,
    getMore,
    getColumnAutoFitValue,
    invalidateLive,
    resetLive,
    dispose
};
