/**
 * Webview Fallback Module
 * Handles fallback from Webview execution to GUI execution
 * Webview 降级模块 - 当 Webview 执行失败时降级到 GUI 执行
 */

const { showError, msg } = require('../../../utils/common');
const { runOnMac } = require('../gui/mac');

/**
 * Custom error class for Webview fallback scenarios
 */
class CliFallbackError extends Error {
    /**
     * @param {string} reason - Reason for Webview failure
     * @param {string|null} dylibPath - Path to dylib (if applicable)
     * @param {Error|null} originalError - Original error that triggered fallback
     */
    constructor(reason, dylibPath = null, originalError = null) {
        super(reason);
        this.name = 'CliFallbackError';
        this.reason = reason;
        this.dylibPath = dylibPath;
        this.originalError = originalError;
    }
}

/**
 * Show user notification about Webview unavailability
 * @param {string} reason - Reason for fallback
 */
function showCliUnavailableMessage(reason) {
    showError(msg('cliUnavailable', { reason }));
}

/**
 * Fallback to GUI execution when Webview execution fails
 * @param {string} codeToRun - The Stata code to execute
 * @param {string} tmpFilePath - Path to temporary file
 * @param {string|null} docDir - Directory of the do file
 * @param {string} reason - Reason for fallback (for logging)
 * @returns {Promise<void>} Result from GUI execution
 */
async function fallbackToGui(codeToRun, tmpFilePath, docDir, reason, context = null) {
    runOnMac(codeToRun, tmpFilePath, false, docDir, context);
}

module.exports = {
    fallbackToGui,
    showCliUnavailableMessage,
    CliFallbackError
};
