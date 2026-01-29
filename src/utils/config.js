/**
 * Configuration management for Stata All in One extension
 * 配置管理模块
 */

const vscode = require('vscode');

const CONFIG_NAMESPACE = 'stata-all-in-one';

/**
 * Get configuration object
 */
const getConfig = () => vscode.workspace.getConfiguration(CONFIG_NAMESPACE);

/**
 * Get specific configuration value
 */
const getConfigValue = (key, defaultValue) => {
    const config = getConfig();
    return config.get(key, defaultValue);
};

/**
 * Get numberingShow setting
 */
const getnumberingShow = () => getConfigValue('numberingShow', true);

/**
 * Get numberingAdd setting
 */
const getnumberingAdd = () => getConfigValue('numberingAdd', false);

/**
 * Get showRunButton setting
 */
const getShowRunButton = () => getConfigValue('showRunButton', false);

/**
 * Get stataVersion setting
 */
const getStataVersion = () => getConfigValue('stataVersion', 'StataMP');

/**
 * Get activateStataWindow setting
 */
const getActivateStataWindow = () => getConfigValue('activateStataWindow', true);

/**
 * Get commentStyle setting
 */
const getCommentStyle = () => getConfigValue('commentStyle', '// ');

/**
 * Get separatorLength setting
 */
const getSeparatorLength = () => {
    const len = getConfigValue('separatorLength', 60);
    if (typeof len !== 'number' || !isFinite(len) || len < 10) {
        return 60;
    }
    return Math.floor(len);
};

/**
 * Get user-defined commands to highlight
 */
const getCustomCommands = () => {
    const raw = getConfigValue('customCommands', ['reghdfe']);
    if (!Array.isArray(raw)) {
        return ['reghdfe'];
    }
    const cleaned = raw
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .map(cmd => cmd.replace(/[^a-zA-Z0-9_]/g, ''))
        .filter(Boolean);
    const uniq = Array.from(new Set(cleaned));
    return uniq.length > 0 ? uniq : ['reghdfe'];
};

/**
 * Get stataPathOnWindows setting
 */
const getStataPathOnWindows = () => getConfigValue('stataPathOnWindows', '');

/**
 * Get enableCompletion setting
 */
const getEnableCompletion = () => getConfigValue('enableCompletion', true);

/**
 * Get step delay setting for Windows commands (in milliseconds)
 */
const getStataStepDelayOnWindows = () => {
    const delay = getConfigValue('stataStepDelayOnWindows', 100);
    if (typeof delay !== 'number' || !isFinite(delay) || delay < 50) {
        return 100;
    }
    return Math.floor(delay);
};

/**
 * Get separatorSymmetric setting
 */
const getSeparatorSymmetric = () => getConfigValue('separatorSymmetric', true);

module.exports = {
    CONFIG_NAMESPACE,
    getConfig,
    getConfigValue,
    getnumberingShow,
    getnumberingAdd,
    getShowRunButton,
    getStataVersion,
    getActivateStataWindow,
    getCommentStyle,
    getSeparatorLength,
    getStataPathOnWindows: getStataPathOnWindows,
    getCustomCommands,
    getEnableCompletion,
    getStataStepDelayOnWindows,
    getSeparatorSymmetric
};
