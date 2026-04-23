/**
 * Embedded Console Fallback Module
 * Handles fallback from Embedded Console execution to External App execution
 * Embedded Console 降级模块 - 当 Embedded Console 执行失败时降级到 External App 执行
 */

const { showError, msg } = require('../../../utils/common');
const { runOnMac } = require('../externalApp/mac');

/**
 * Custom error class for Embedded Console fallback scenarios
 */
class CliFallbackError extends Error {
    /**
     * @param {string} reason - Reason for Embedded Console failure
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
 * Show user notification about Embedded Console unavailability
 * @param {string} reason - Reason for fallback
 */
function showCliUnavailableMessage(reason) {
    showError(msg('cliUnavailable', { reason }));
}

/**
 * Fallback to External App execution when Embedded Console execution fails
 * @param {string} codeToRun - The Stata code to execute
 * @param {string} tmpFilePath - Path to temporary file
 * @param {string|null} docDir - Directory of the do file
 * @param {string} reason - Reason for fallback (for logging)
 * @returns {Promise<void>} Result from External App execution
 */
async function fallbackToGui(codeToRun, tmpFilePath, docDir, reason, context = null) {
    runOnMac(codeToRun, tmpFilePath, false, docDir, context);
}

module.exports = {
    fallbackToGui,
    showCliUnavailableMessage,
    CliFallbackError
};
