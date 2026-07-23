const directDtaStore = require('./directDtaStore');
const consoleDataReader = require('./consoleDataReader');

let live = null;
let loading = null;

async function getLiveData() {
    if (live) return live;
    if (!loading) {
        loading = consoleDataReader.capture().then((data) => {
            live = data;
            return data;
        }).finally(() => {
            loading = null;
        });
    }
    return loading;
}

async function getLiveSnapshot(filterText = '') {
    const data = await getLiveData();
    return directDtaStore.getSnapshotFromData(data, 'Stata memory', 500, filterText);
}

async function getLiveMore(startObs, count, filterText = '') {
    const data = await getLiveData();
    return directDtaStore.getMoreFromData(data, startObs, count, filterText);
}

async function getLiveColumnAutoFitValue(column, filterText = '') {
    const data = await getLiveData();
    return directDtaStore.getColumnAutoFitValueFromData(data, column, filterText);
}

async function captureSnapshot(filterText = '') {
    const data = await consoleDataReader.capture();
    return {
        data,
        view: directDtaStore.getSnapshotFromData(data, 'Stata memory', 500, filterText)
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

async function getSnapshot(entry, filterText = '') {
    return directDtaStore.getSnapshotFromData(entry.data, 'Stata memory', 500, filterText);
}

async function invalidateLive() {
    live = null;
}

async function resetLive() {
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
