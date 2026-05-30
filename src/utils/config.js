const vscode = require('vscode');

const CONFIG_NAMESPACE = 'stata-all-in-one';
const RUN_MODES = Object.freeze({
    externalApp: 'externalApp',
    embeddedConsole: 'embeddedConsole'
});
const CONSOLE_FONT_MODES = Object.freeze({
    editor: 'editor',
    system: 'system',
    custom: 'custom'
});

/**
 * Configuration management for Stata All in One extension
 * 配置管理模块
 */
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
const getStataVersion = () => getConfigValue('stataVersionOnMacOS', 'StataMP');

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
 * Get whether to close non-Stata windows before sending run command on Windows
 */
const getCloseStataOtherWindowsBeforeSendingCode = () => getConfigValue('closeStataOtherWindowsBeforeSendingCode', true);

/**
 * Get separatorSymmetric setting
 */
const getSeparatorSymmetric = () => getConfigValue('separatorSymmetric', true);

/**
 * Get enableCtrlShiftD setting (whether to use Ctrl+Shift+D as run shortcut)
 */
const getEnableCtrlShiftD = () => getConfigValue('enableCtrlShiftD', false);

/**
 * Get cdToDoFileDir setting (whether to cd to do file dir on first Stata launch)
 */
const getCdToDoFileDir = () => getConfigValue('cdToDoFileDir', false);

/**
 * Get preferred code execution mode
 */
const getRunMode = () => {
    const mode = String(getConfigValue('runMode', RUN_MODES.embeddedConsole) || '').trim();
    return Object.values(RUN_MODES).includes(mode) ? mode : RUN_MODES.embeddedConsole;
};

/**
 * Get embedded console font mode
 */
const getConsoleFontMode = () => {
    const mode = String(getConfigValue('consoleFontMode', CONSOLE_FONT_MODES.editor) || '').trim();
    return Object.values(CONSOLE_FONT_MODES).includes(mode) ? mode : CONSOLE_FONT_MODES.editor;
};

/**
 * Get embedded console custom font family
 */
const getConsoleCustomFontFamily = () => {
    const value = getConfigValue('consoleCustomFontFamily', '');
    return typeof value === 'string' ? value.trim() : '';
};

/**
 * Get PNG export DPI for embedded console graphs
 */
const getGraphPngDpi = () => {
    const dpi = getConfigValue('graphPngDpi', 600);
    if (typeof dpi !== 'number' || !isFinite(dpi) || dpi < 72) {
        return 600;
    }
    return Math.min(1200, Math.floor(dpi));
};

/**
 * Get additional ado paths for community command scanning
 */
const getAdditionalAdoPaths = () => {
    const raw = getConfigValue('additionalAdoPaths', []);
    if (!Array.isArray(raw)) return [];
    return raw
        .map(p => (typeof p === 'string' ? p.trim() : ''))
        .filter(Boolean);
};

module.exports = {
    CONFIG_NAMESPACE,
    RUN_MODES,
    CONSOLE_FONT_MODES,
    getConfig,
    getConfigValue,
    getnumberingShow,
    getnumberingAdd,
    getShowRunButton,
    getStataVersion,
    getCommentStyle,
    getSeparatorLength,
    getStataPathOnWindows: getStataPathOnWindows,
    getCustomCommands,
    getCloseStataOtherWindowsBeforeSendingCode,
    getSeparatorSymmetric,
    getEnableCtrlShiftD,
    getCdToDoFileDir,
    getRunMode,
    getConsoleFontMode,
    getConsoleCustomFontFamily,
    getGraphPngDpi,
    getAdditionalAdoPaths
};
