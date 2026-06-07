/**
 * Capability State Module
 *
 * Tracks whether the Embedded Console is available on this device.
 * State machine: UNVERIFIED → CONSOLE | EXTERNAL
 *
 * UNVERIFIED — extension just installed, no code has been run yet
 * CONSOLE    — embedded console initialized successfully (full features unlocked)
 * EXTERNAL   — embedded console failed to initialize (AI/DataViewer permanently disabled)
 */

const vscode = require('vscode');

const CAPABILITY_STATE_KEY = 'stataAllInOne.capabilityState';
const CONSOLE_CAPABLE_KEY = 'stata-all-in-one.consoleCapable';

const STATES = {
    unverified: 'unverified',
    console: 'console',
    external: 'external'
};

let _state = STATES.unverified;

/**
 * Initialize capability state from persisted globalState.
 * Called once during extension activate().
 * @param {vscode.ExtensionContext} context
 */
function initCapabilityState(context) {
    const saved = context.globalState.get(CAPABILITY_STATE_KEY, STATES.unverified);
    _state = saved;
    _updateContextKey(_state);
    console.log('Stata All in One: [capability] Initialized state:', _state);
}

/**
 * Set capability state and persist.
 * @param {vscode.ExtensionContext} context
 * @param {'unverified'|'console'|'external'} state
 */
async function setCapabilityState(context, state) {
    if (!STATES[state]) {
        console.error('Stata All in One: [capability] Invalid state:', state);
        return;
    }
    if (_state === state) return;

    _state = state;
    await context.globalState.update(CAPABILITY_STATE_KEY, state);
    _updateContextKey(state);
    console.log('Stata All in One: [capability] State changed to:', state);
}

/**
 * Get current capability state synchronously.
 * @returns {'unverified'|'console'|'external'}
 */
function getCapabilityState() {
    return _state;
}

/**
 * Update the VS Code when-clause context key.
 * @param {string} state
 */
function _updateContextKey(state) {
    vscode.commands.executeCommand('setContext', CONSOLE_CAPABLE_KEY, state === STATES.console);
}

module.exports = {
    STATES,
    initCapabilityState,
    setCapabilityState,
    getCapabilityState
};
