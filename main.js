/**
 * Stata All in One - VS Code Extension
 * Root entry point - delegates to src/extension.js
 * 
 * This file is kept as a compatibility layer.
 * The actual implementation is in src/extension.js
 */

const { activate, deactivate } = require('./src/extension');

module.exports = { activate, deactivate };


