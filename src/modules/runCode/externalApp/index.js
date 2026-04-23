const { runOnMac, findStataApp } = require('./mac');
const { runOnWindows } = require('./windows');

module.exports = {
    runOnMac,
    runOnWindows,
    findStataApp
};
