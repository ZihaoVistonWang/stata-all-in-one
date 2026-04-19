/**
 * Windows CLI Stata Runner (Placeholder)
 * Phase 1: Windows CLI not implemented - use GUI mode
 * Phase 2: Will implement Windows CLI using StataSO DLL
 */

/**
 * Run code on Windows via CLI
 * @param {string} codeToRun - The code to execute
 * @param {string} tmpFilePath - Path to temporary file
 * @param {string|null} docDir - Directory of the do file
 * @throws {Error} Windows CLI not implemented in Phase 1
 */
function runOnWindowsCLI(codeToRun, tmpFilePath, docDir = null) {
    throw new Error('Windows CLI not implemented in Phase 1. Please use GUI mode.');
}

/**
 * Find Stata dylib/shared library on Windows
 * @returns {null} Always returns null in Phase 1
 */
function findStataDylib() {
    return null;
}

/**
 * Initialize CLI session for Stata
 * @throws {Error} Windows CLI not implemented in Phase 1
 */
function initCliSession() {
    throw new Error('Windows CLI not implemented in Phase 1');
}

/**
 * Stop CLI execution
 * @throws {Error} Windows CLI not implemented in Phase 1
 */
function stopCliExecution() {
    throw new Error('Windows CLI not implemented in Phase 1');
}

/**
 * Get current CLI session
 * @returns {null} Always returns null in Phase 1
 */
function getCliSession() {
    return null;
}

module.exports = {
    runOnWindowsCLI,
    findStataDylib,
    initCliSession,
    stopCliExecution,
    getCliSession
};
