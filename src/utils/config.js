const vscode = require('vscode');

const CONFIG_NAMESPACE = 'stata-all-in-one';
const RUN_MODES = Object.freeze({
    externalApp: 'externalApp',
    embeddedConsole: 'embeddedConsole'
});
const CONSOLE_FONT_MODES = Object.freeze({
    online: 'online',
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
 * Get stataVersion setting
 */
const getStataVersion = () => getConfigValue('stataVersionOnMacOS', 'StataMP');

/**
 * Get runUsingInclude setting
 */
const getRunUsingInclude = () => getConfigValue('runUsingInclude', false);

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

const getEnablePinyinVariableMatching = () =>
    getConfigValue('enablePinyinVariableMatching', true);

/**
 * Get stataPathOnWindows setting
 */
const getStataPathOnWindows = () => getConfigValue('stataPathOnWindows', '');

/**
 * Get stataPathOnLinux setting (installation directory, or a library /
 * executable path inside it that pins the edition)
 */
const getStataPathOnLinux = () => getConfigValue('stataPathOnLinux', '');

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
    const mode = String(getConfigValue('consoleFontMode', CONSOLE_FONT_MODES.online) || '').trim();
    return Object.values(CONSOLE_FONT_MODES).includes(mode) ? mode : CONSOLE_FONT_MODES.online;
};

/**
 * Get embedded console custom font family
 */
const getConsoleCustomFontFamily = () => {
    const value = getConfigValue('consoleCustomFontFamily', '');
    return typeof value === 'string' ? value.trim() : '';
};

/**
 * Get the shared Embedded Console and Data Viewer font size.
 */
const getExplicitConsoleAndDataViewerFontSize = () => {
    const extensionConfig = getConfig();
    const inspected = typeof extensionConfig.inspect === 'function'
        ? extensionConfig.inspect('consoleAndDataViewerFontSize')
        : null;
    return inspected && [
        inspected.workspaceFolderValue,
        inspected.workspaceValue,
        inspected.globalValue
    ].find(value => value !== undefined && value !== null);
};

const normalizeWebviewFontSize = value =>
    typeof value === 'number' && Number.isFinite(value) && value >= 6
        ? Math.min(72, value)
        : 14;

const getConsoleAndDataViewerFontSize = () => {
    const explicitValue = getExplicitConsoleAndDataViewerFontSize();
    const editorValue = vscode.workspace.getConfiguration('editor').get('fontSize', 14);
    const value = explicitValue !== undefined ? explicitValue : editorValue;
    return normalizeWebviewFontSize(value);
};

/**
 * Memory budget, in MB, for one Data Viewer read of the dataset.
 *
 * Reading the data means Stata's plugin writes it into the worker process, the
 * buffer is copied across IPC and parsed into JS columns, so a very large
 * dataset needs this much memory several times over. Raise it to view bigger
 * datasets, lower it on memory-constrained machines.
 */
const getDataViewerMemoryLimitMB = () => {
    const value = getConfigValue('dataViewerMemoryLimitMB', 1024);
    if (typeof value !== 'number' || !isFinite(value) || value < 1) {
        return 1024;
    }
    return Math.min(16384, Math.max(16, Math.floor(value)));
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

const getConsoleCompletionSound = () => {
    const prefix = 'consoleCompletionSound.';
    const threshold = getConfigValue(prefix + 'thresholdMinutes', 5);
    const duration = getConfigValue(prefix + 'durationSeconds', 60);
    const ringtone = getConfigValue(prefix + 'ringtone', 'notification');
    const rawCustomPath = getConfigValue(prefix + 'customPath', '');
    let customPath = typeof rawCustomPath === 'string' ? rawCustomPath.trim() : '';
    if (customPath.length >= 2 && (customPath[0] === '"' || customPath[0] === "'")
        && customPath[customPath.length - 1] === customPath[0]) {
        customPath = customPath.slice(1, -1);
    }
    return {
        enabled: getConfigValue(prefix + 'enabled', false) === true,
        thresholdMinutes: Number.isFinite(threshold) && threshold >= 0 ? threshold : 5,
        durationSeconds: Number.isInteger(duration) && duration >= 1 && duration <= 300 ? duration : 60,
        ringtone: ['notification', 'information', 'warning', 'custom'].includes(ringtone) ? ringtone : 'notification',
        customPath
    };
};

module.exports = {
    CONFIG_NAMESPACE,
    RUN_MODES,
    CONSOLE_FONT_MODES,
    getConsoleCompletionSound,
    getConfig,
    getConfigValue,
    getnumberingShow,
    getnumberingAdd,
    getStataVersion,
    getRunUsingInclude,
    getCommentStyle,
    getSeparatorLength,
    getStataPathOnWindows: getStataPathOnWindows,
    getStataPathOnLinux,
    getCustomCommands,
    getEnablePinyinVariableMatching,
    getCloseStataOtherWindowsBeforeSendingCode,
    getSeparatorSymmetric,
    getEnableCtrlShiftD,
    getCdToDoFileDir,
    getRunMode,
    getConsoleFontMode,
    getConsoleCustomFontFamily,
    getConsoleAndDataViewerFontSize,
    getDataViewerMemoryLimitMB,
    getGraphPngDpi,
    getAdditionalAdoPaths
};
