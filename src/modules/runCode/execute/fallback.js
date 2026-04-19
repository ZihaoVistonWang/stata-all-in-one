/**
 * CLI Fallback Module
 * Handles fallback from CLI to GUI execution when CLI fails
 * CLI 降级模块 - 当 CLI 执行失败时降级到 GUI 执行
 */

const { showError, msg } = require('../../../utils/common');
const { runOnMac } = require('../gui/mac');

/**
 * Custom error class for CLI fallback scenarios
 */
class CliFallbackError extends Error {
    /**
     * @param {string} reason - Reason for CLI failure
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
 * Show user notification about CLI unavailability
 * @param {string} reason - Reason for CLI fallback
 */
function showCliUnavailableMessage(reason) {
    showError(msg('cliUnavailable', { reason }));
}

/**
 * Fallback to GUI execution when CLI fails
 * @param {string} codeToRun - The Stata code to execute
 * @param {string} tmpFilePath - Path to temporary file
 * @param {string|null} docDir - Directory of the do file
 * @param {string} reason - Reason for CLI fallback (for logging)
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
