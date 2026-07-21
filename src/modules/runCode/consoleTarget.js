const config = require('../../utils/config');
let activeConsoleMode = null;

function getConsoleTarget(mode = config.getRunMode()) {
    return mode === config.RUN_MODES.secondarySidebar
        ? require('./secondarySidebar/panel')
        : require('./embeddedConsole/panel');
}

function getWebviewTerminalSink(mode) {
    activeConsoleMode = mode || config.getRunMode();
    return getConsoleTarget(activeConsoleMode).getWebviewTerminalSink();
}

function setGraphResourceRoot(resourceRoot, mode) {
    return getConsoleTarget(mode || activeConsoleMode || config.getRunMode()).setGraphResourceRoot(resourceRoot);
}

function convertGraphSvgToBitmap(sourcePath, targetPath, request, mode) {
    return getConsoleTarget(mode || activeConsoleMode || config.getRunMode()).convertGraphSvgToBitmap(sourcePath, targetPath, request);
}

module.exports = {
    getConsoleTarget,
    getWebviewTerminalSink,
    setGraphResourceRoot,
    convertGraphSvgToBitmap
};
