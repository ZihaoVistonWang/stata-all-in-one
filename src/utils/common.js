/**
 * Common utility functions for Stata All in One extension
 * 通用工具函数
 */

const vscode = require('vscode');

const EXT_LABEL = 'Stata All in One';

const UI_TEXT = {
    en: {
        lineTooLong: 'Line would be too long. Increase separator length setting.',
        sepHere: 'Separator already present between the upper and lower lines.',
        sepAboveBelow: 'Separator already present above and below.',
        oneChar: 'Please enter exactly one character.',
        controlChars: 'Control characters are not supported.',
        customSepPrompt: 'Enter a single separator character (emoji / letter / symbol / space, defaults to "=")',
        customSepPlaceholder: '=',
        noEditor: 'No active editor found',
        unsupportedPlatform: 'Running Stata code is only supported on macOS and Windows',
        missingWinPath: 'Stata executable path not configured. Please set "stata-all-in-one.stataPathOnWindows" in settings.',
        noStataInstalled: ({ installedList }) => `No Stata installation detected. Please install Stata or set an existing version. Installed: ${installedList}.`,
        winRunFailed: ({ message, detail }) => `Failed to run Stata code on Windows: ${message}${detail}`,
        promptWinPath: 'Please enter the path to your Stata executable',
        promptWinPathPlaceholder: 'e.g., C:\\Program Files\\Stata17\\StataMP-64.exe',
        promptMacVersion: 'Please select your Stata version',
        configSaved: 'Configuration saved successfully',
        codeSentStata: 'Code sent to Stata',
        runFailed: ({ message }) => `Failed to run Stata code: ${message}`,
        codeSentApp: ({ app }) => `Code sent to ${app}`,
        tmpFileFailed: ({ message }) => `Failed to create temporary file: ${message}`,
        resetDone: 'Migration prompt state reset. Checking migration now...',
        noTextSelected: 'No text selected. Please select a Stata command and try again.',
        notAValidIdentifier: ({ command }) => `"${command}" is not a valid Stata command identifier. Please select a valid command.`,
        helpCommandSent: ({ command }) => `Help command sent to Stata for "${command}"`
    },
    zh: {
        lineTooLong: '行长度不足，请在设置中增大分隔线长度。',
        sepHere: '上下行已存在分隔线。',
        sepAboveBelow: '上下都有分隔线，无需重复插入。',
        oneChar: '请只输入一个字符。',
        controlChars: '不支持控制字符。',
        customSepPrompt: '输入一个分隔符字符（表情/字母/符号/空格，默认 "="）',
        customSepPlaceholder: '=',
        noEditor: '未找到活动编辑器',
        unsupportedPlatform: '仅在 macOS 和 Windows 上支持运行 Stata 代码',
        missingWinPath: '未配置 Stata 可执行路径，请设置 "stata-all-in-one.stataPathOnWindows"。',
        noStataInstalled: ({ installedList }) => `未检测到已安装的 Stata，请安装或设置可用版本。已检测：${installedList}。`,
        winRunFailed: ({ message, detail }) => `在 Windows 运行 Stata 失败：${message}${detail}`,
        promptWinPath: '请输入 Stata 可执行文件路径',
        promptWinPathPlaceholder: '例如：C:\\Program Files\\Stata17\\StataMP-64.exe',
        promptMacVersion: '请选择您的 Stata 版本',
        configSaved: '配置已成功保存',
        codeSentStata: '已发送代码到 Stata',
        runFailed: ({ message }) => `运行 Stata 代码失败：${message}`,
        codeSentApp: ({ app }) => `已发送代码到 ${app}`,
        tmpFileFailed: ({ message }) => `创建临时文件失败：${message}`,
        resetDone: '迁移提示状态已重置，正在检查迁移...',
        noTextSelected: '未选中任何文本。请选中一个 Stata 命令后重试。',
        notAValidIdentifier: ({ command }) => `"${command}" 不是有效的 Stata 命令标识符。请选中一个有效的命令。`,
        helpCommandSent: ({ command }) => `已向 Stata 发送帮助命令："${command}"`
    }
};

const getUserLanguage = () => {
    const lang = (vscode.env.language || '').toLowerCase();
    return lang.startsWith('zh') ? 'zh' : 'en';
};

const msg = (key, params) => {
    const lang = getUserLanguage();
    const dict = UI_TEXT[lang] || UI_TEXT.en;
    const entry = dict[key] !== undefined ? dict[key] : UI_TEXT.en[key];
    if (typeof entry === 'function') {
        return entry(params || {});
    }
    return entry;
};

/**
 * Show information message
 */
const showInfo = (msg, ...items) => 
    vscode.window.showInformationMessage(`${EXT_LABEL}: ${msg}`, ...items);

/**
 * Show warning message
 */
const showWarn = (msg, ...items) => 
    vscode.window.showWarningMessage(`${EXT_LABEL}: ${msg}`, ...items);

/**
 * Show error message
 */
const showError = (msg, ...items) => 
    vscode.window.showErrorMessage(`${EXT_LABEL}: ${msg}`, ...items);

/**
 * Check if running on Windows
 */
const isWindows = () => process.platform === 'win32';

/**
 * Check if running on macOS
 */
const isMacOS = () => process.platform === 'darwin';

/**
 * Strip surrounding quotes from a string
 */
const stripSurroundingQuotes = (p) => {
    if (!p) return p;
    return p.replace(/^\s*["']+/, '').replace(/["']+\s*$/, '');
};

/**
 * Remove decorative separators from a title
 * Supports formats: `pattern ... text ... pattern` or `pattern text pattern`
 * Also handles trailing ' **' suffix for symmetric separators
 * Returns extracted title, or original if no decorators found
 */
function removeSeparators(title) {
    if (!title || title.length === 0) return title;
    
    // Remove trailing ' **' if present (symmetric separator suffix)
    let workingTitle = title;
    if (workingTitle.endsWith(' **')) {
        workingTitle = workingTitle.slice(0, -3).trim();
    }
    
    const cps = Array.from(workingTitle);
    const len = cps.length;
    
    if (len < 7) return workingTitle;
    
    // Try single character patterns (most common)
    for (let charLen = 1; charLen <= 6; charLen++) {
        const pattern = cps.slice(0, charLen);
        
        let leftCount = 0;
        let pos = 0;
        
        while (pos + charLen <= len) {
            let match = true;
            for (let i = 0; i < charLen; i++) {
                if (cps[pos + i] !== pattern[i]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                leftCount++;
                pos += charLen;
            } else {
                break;
            }
        }
        
        if (leftCount < 3) continue;
        
        let rightCount = 0;
        let rightPos = len;
        while (rightPos - charLen >= leftCount * charLen) {
            let match = true;
            for (let i = 0; i < charLen; i++) {
                if (cps[rightPos - charLen + i] !== pattern[i]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                rightCount++;
                rightPos -= charLen;
            } else {
                break;
            }
        }
        
        if (rightCount >= 3 && rightPos > leftCount * charLen) {
            const middle = cps.slice(leftCount * charLen, rightPos).join('').trim();
            if (middle && middle.length > 0) {
                return middle;
            }
        }
    }
    
    // Fallback: handle string patterns
    const str = workingTitle.trim();
    for (let i = 1; i <= Math.floor(str.length / 3); i++) {
        const pattern = str.substring(0, i);
        if (str.startsWith(pattern) && str.endsWith(pattern)) {
            if (str.length > 2 * pattern.length) {
                const middle = str.substring(pattern.length, str.length - pattern.length).trim();
                if (middle && middle.length > 0 && !middle.includes(pattern)) {
                    return middle;
                }
            }
        }
    }
    
    return workingTitle;
}

/**
 * Extract center text from title with surrounding decorators
 * (kept for backward compatibility)
 */
const extractCenterText = (title) => removeSeparators(title);

/**
 * Check if a line is a separator line
 * Format: `** ` followed by repeated pattern (length 1-6 code points) with total length ≥ 3
 */
function isSeparatorLine(lineText) {
    const trimmed = lineText.trim();
    // Check if starts with '**' (with or without space before #)
    if (!trimmed.startsWith('**')) {
        return false;
    }
    
    // Extract body after '**' prefix
    let body = trimmed.slice(2).trimStart();
    if (!body) {
        return false;
    }
    
    // Remove trailing ' **' if present
    if (body.endsWith(' **')) {
        body = body.slice(0, -3).trim();
    }
    if (!body) {
        return false;
    }

    // Check for consecutive repeated characters (excluding # and spaces)
    // A separator line has at least 3 consecutive same characters
    let maxConsecutive = 0;
    let currentChar = '';
    let currentCount = 0;

    for (const char of body) {
        // Skip # and spaces when checking for patterns
        if (char === '#' || char === ' ') {
            if (currentCount > maxConsecutive) {
                maxConsecutive = currentCount;
            }
            currentCount = 0;
            currentChar = '';
        } else if (char === currentChar) {
            currentCount++;
        } else {
            if (currentCount > maxConsecutive) {
                maxConsecutive = currentCount;
            }
            currentChar = char;
            currentCount = 1;
        }
    }
    if (currentCount > maxConsecutive) {
        maxConsecutive = currentCount;
    }

    return maxConsecutive >= 3;
}

/**
 * Check if text contains non-ASCII code points
 */
const hasNonAsciiCodePoint = (text) => {
    if (!text) return false;
    return Array.from(text).some(ch => ch.codePointAt(0) > 0x7f);
};

/**
 * Build separator segment by repeating/truncating unit to specified length
 * Works with code points to avoid emoji truncation
 */
function buildSeparatorSegment(unit, length) {
    if (!unit || length <= 0) {
        return '';
    }
    const codepoints = Array.from(unit);
    if (codepoints.length === 0) {
        return '';
    }
    const result = [];
    while (result.length < length) {
        for (const cp of codepoints) {
            if (result.length >= length) {
                break;
            }
            result.push(cp);
        }
    }
    return result.join('');
}

module.exports = {
    EXT_LABEL,
    showInfo,
    showWarn,
    showError,
    msg,
    getUserLanguage,
    isWindows,
    isMacOS,
    stripSurroundingQuotes,
    removeSeparators,
    extractCenterText,
    isSeparatorLine,
    hasNonAsciiCodePoint,
    buildSeparatorSegment
};
