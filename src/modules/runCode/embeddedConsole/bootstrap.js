/**
 * Console start-up state for a Stata session.
 *
 * The bootstrap has two parts that must NOT be bundled together:
 *
 *  - `clear all` resets Stata. It may only run for a genuinely NEW native
 *    session. Running it when a JS wrapper merely reconnects to a session that
 *    is still alive destroys the data the user has loaded.
 *  - `set more off` / `set linesize 255` are idempotent settings. They are
 *    (re-)applied whenever the settings part has not been applied yet — after an
 *    extension reload, or when a previous wrapper exited before applying them —
 *    because Stata's default 80-column wrapping breaks the metadata reader.
 *
 * Kept free of `vscode` so both platform layers and the tests can use it.
 */

const BOOTSTRAP_RESET_COMMAND = 'quietly clear all';
const BOOTSTRAP_SETTINGS_COMMANDS = [
    'quietly set more off',
    'quietly set linesize 255'
];

/**
 * @param {object} consoleSession live Console session
 * @returns {Promise<void>}
 */
async function applyWebviewBootstrap(consoleSession) {
    if (!consoleSession) {
        throw new Error('A Stata session is required to bootstrap the Console.');
    }
    const settingsApplied = typeof consoleSession.needsBootstrapSettings === 'function'
        ? !consoleSession.needsBootstrapSettings()
        : Boolean(consoleSession.isBootstrapped && consoleSession.isBootstrapped());
    const resetPerformed = typeof consoleSession.isResetPerformed === 'function'
        ? consoleSession.isResetPerformed()
        : false;
    if (resetPerformed && settingsApplied) {
        return;
    }

    const commands = [
        // The reset only for a session that has never been bootstrapped.
        ...(resetPerformed ? [] : [BOOTSTRAP_RESET_COMMAND]),
        ...BOOTSTRAP_SETTINGS_COMMANDS
    ];
    for (const command of commands) {
        const result = await consoleSession.execute(command, false);
        if (!result.success) {
            throw new Error(result.error || `Failed to run bootstrap command: ${command}`);
        }
    }

    if (typeof consoleSession.setResetPerformed === 'function') {
        consoleSession.setResetPerformed(true);
    }
    consoleSession.setBootstrapped(true);
}

module.exports = {
    applyWebviewBootstrap,
    BOOTSTRAP_RESET_COMMAND,
    BOOTSTRAP_SETTINGS_COMMANDS
};
