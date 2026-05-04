const native = require('../native/stata_session');

async function fetchDataSnapshot() {
    if (!native.isLoaded() || !native.isInitialized()) {
        return { error: 'Stata session not initialized' };
    }

    try {
        const [info, vars, dataResult, summary] = await Promise.all([
            native.getDatasetInfo(),
            native.getVarMetadata(),
            native.getDataRows('_all', 1, 100),
            native.getSummary()
        ]);

        return {
            info: info || { observations: 0, variables: 0, source: '', sortedBy: null },
            vars: Array.isArray(vars) ? vars : [],
            dataColumns: (dataResult && dataResult.columns) ? dataResult.columns : [],
            dataRows: (dataResult && dataResult.rows) ? dataResult.rows : [],
            summary: Array.isArray(summary) ? summary : []
        };
    } catch (e) {
        return { error: e.message };
    }
}

module.exports = { fetchDataSnapshot };
