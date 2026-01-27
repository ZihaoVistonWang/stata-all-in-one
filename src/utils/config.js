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
 * Get showNumbering setting
 */
const getShowNumbering = () => getConfigValue('showNumbering', true);

/**
 * Get updateFileContent setting
 */
const getUpdateFileContent = () => getConfigValue('updateFileContent', false);

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
        .map(item => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
        .filter(Boolean)
        .map(cmd => cmd.replace(/[^a-z0-9_]/gi, ''))
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

module.exports = {
    CONFIG_NAMESPACE,
    getConfig,
    getConfigValue,
    getShowNumbering,
    getUpdateFileContent,
    getShowRunButton,
    getStataVersion,
    getActivateStataWindow,
    getCommentStyle,
    getSeparatorLength,
    getStataPathOnWindows: getStataPathOnWindows,
    getCustomCommands,
    getEnableCompletion
};
