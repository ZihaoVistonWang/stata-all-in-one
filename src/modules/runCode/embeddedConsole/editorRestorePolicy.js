const STATA_SOURCE_EXTENSIONS = ['.do', '.ado', '.mata'];
const DATA_VIEWER_VIEW_TYPES = new Set([
    'stata-all-in-one.dataViewer',
    'stata-all-in-one.dtaViewer'
]);

function getTabUri(input) {
    if (!input || typeof input !== 'object') {
        return null;
    }
    return input.uri || input.modified || input.original || null;
}

function getUriPath(uri) {
    if (!uri) {
        return '';
    }
    return String(uri.fsPath || uri.path || '').toLowerCase();
}

function isStataSourceTab(tab) {
    const filePath = getUriPath(getTabUri(tab && tab.input));
    return STATA_SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

function hasOpenStataSourceTab(tabGroups) {
    return (tabGroups || []).some((group) =>
        (group.tabs || []).some(isStataSourceTab)
    );
}

function isDataViewerTab(tab) {
    const input = tab && tab.input;
    return Boolean(input && DATA_VIEWER_VIEW_TYPES.has(input.viewType));
}

function getOpenDataViewerTabs(tabGroups) {
    const result = [];
    for (const group of tabGroups || []) {
        for (const tab of group.tabs || []) {
            if (isDataViewerTab(tab)) {
                result.push(tab);
            }
        }
    }
    return result;
}

module.exports = {
    DATA_VIEWER_VIEW_TYPES,
    STATA_SOURCE_EXTENSIONS,
    getOpenDataViewerTabs,
    hasOpenStataSourceTab,
    isDataViewerTab,
    isStataSourceTab
};
