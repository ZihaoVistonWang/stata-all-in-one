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
        stataNotFoundConfigured: ({ stataVersion }) => `Configured Stata version "${stataVersion}" not found. Please install it or change the setting.`,
        winRunFailed: ({ message, detail }) => `Failed to run Stata code on Windows: ${message}${detail}`,
        promptWinPath: 'Please enter the path to your Stata executable',
        promptWinPathPlaceholder: 'e.g., C:\\Program Files\\Stata17\\StataMP-64.exe',
        promptMacVersion: 'Please select your Stata version',
        configSaved: 'Configuration saved successfully',
        macVersionReset: 'Stata version on macOS has been reset. It will auto-detect on next activation.',
        macOnlyCommand: 'This command is only available on macOS.',
        autoDetectedStata: ({ appName, appPath }) => `Detected "${appName}" at ${appPath}. Configuration saved.`,
        codeSentStata: 'Code sent to Stata',
        runFailed: ({ message }) => `Failed to run Stata code: ${message}`,
        codeSentApp: ({ app }) => `Code sent to ${app}`,
        tmpFileFailed: ({ message }) => `Failed to create temporary file: ${message}`,
        resetDone: 'Migration prompt state reset. Checking migration now...',
        noTextSelected: 'No text selected. Please select a Stata command and try again.',
        notAValidIdentifier: ({ command }) => `"${command}" is not a valid Stata command identifier. Please select a valid command.`,
        helpCommandSent: ({ command }) => `Help command sent to Stata for "${command}"`,
        reportBugInfo: 'If you encounter a bug, please contact hi@zihaowang.cn.',
        cannotRenameCommand: ({ word }) => `Cannot rename "${word}": Built-in or custom Stata command`,
        cannotRenameOption: ({ word }) => `Cannot rename "${word}": Stata command option`,
        consoleUnavailable: ({ reason }) => `Embedded Console execution unavailable, switched to External App. Reason: ${reason}`,
        consoleOfferGuiFallback: ({ reason }) => `Embedded Console execution hit an extension error: ${reason}`,
        useStataApp: 'Use External App',
        stayInConsole: 'Stay in Embedded Console',
        consoleFallbackAutoSwitched: ({ reason }) => `Embedded Console unavailable, auto-switched to External App. Reason: ${reason}`,
        consoleFallbackSwitchPermanently: 'Switch to External App permanently',
        consoleFallbackDismiss: 'Dismiss',
        consoleFallbackPermanentlySet: 'Run mode has been set to External App. You can change it back in settings.',
        sideLeft: 'left',
        sideRight: 'right',
        consolePreviewTooNarrow: ({ side }) => `The current VS Code window is too narrow. Please maximize or widen the window so that Console | Stata All in One can expand on the ${side}.`,
        consolePreviewStillNarrow: 'The current VS Code window is still too narrow. Console | Stata All in One will continue running in the bottom panel.',
        consoleLogoFallbackStarted: 'Console | Stata All in One started...',
        runModeUnsupportedOnWindows: ({ mode }) => `${mode} is currently unavailable on Windows. Switched to External App.`,
        comRegRequired: 'Stata Automation COM needs to be registered. A UAC prompt will appear — please accept to register Stata for COM automation.',
        comInitFailed: 'Stata Automation COM initialization failed. Falling back to keystroke-based execution. Please run Stata as Administrator once to register COM.',
        comExecFailed: 'Stata Automation COM execution error. Falling back to keystroke-based execution.',
        comLearnMore: 'Learn More',
        webviewPanelTitle: 'Console | Stata All in One',
        webviewWaiting: 'Waiting for Stata output...',
        webviewRunning: 'Console | Stata All in One is Running...',
        webviewIdle: 'Idle',
        webviewError: 'Error',
        webviewStop: 'Stop',
        webviewClear: 'Clear',
        webviewInputLabel: 'Command',
        webviewRun: 'run',
        webviewNewline: 'newline',
        webviewHistory: 'history',
        webviewDragResizeTip: 'Drag to resize input area height',
        webviewOverflowNotice: 'Output is wider than the current view. Scroll horizontally to inspect it, or widen the Console panel for a better fit.',
        webviewOverflowConfirm: 'OK',
        webviewOverflowDismissForever: 'Don\'t show again',
        graphCopyImage: 'Copy image',
        graphSaveImage: 'Save image',
        graphFullScreen: 'Full screen',
        graphClose: 'Close',
        graphCopyPngSuccess: 'Graph image copied to clipboard as PNG.',
        graphCopyPngFailed: ({ detail }) => `Failed to copy graph image as PNG.${detail || ''}`,
        graphFileUnavailable: 'Graph file is no longer available.',
        graphImageFilter: 'Graph Image',
        graphSaveFormatPlaceholder: 'Select graph image format',
        graphFormatSvg: 'SVG',
        graphFormatSvgDescription: 'Vector image',
        graphFormatPng: 'PNG',
        graphFormatPngDescription: ({ dpi }) => `${dpi} DPI raster image`,
        graphSaveFailed: ({ message }) => `Failed to save graph: ${message}`,
        graphPanelUnavailable: 'Graph panel is no longer available.',
        graphPngRequestTimeout: 'Timed out while converting graph to PNG.',
        graphPngConversionFailed: 'Failed to convert graph image to PNG.',
        graphInvalidPngData: 'Invalid PNG data returned by graph renderer.',
        graphOnlySvgCanConvert: 'Only SVG graph cache can be converted to PNG in the embedded console.',
        graphSvgEmpty: 'Graph SVG content is empty.',
        graphCanvasUnavailable: 'Canvas rendering is unavailable.',
        graphCanvasPngFailed: 'Canvas failed to create PNG data.',
        graphSvgReadFailed: 'Failed to read graph SVG from the webview resource.',
        graphSvgLoadFailed: 'Browser failed to load graph SVG for PNG conversion.',
        graphClipboardWriteUnavailable: 'Browser clipboard.write is unavailable in this VS Code webview.',
        graphClipboardItemUnavailable: 'ClipboardItem is unavailable in this VS Code webview.',
        graphClipboardRejected: 'Browser clipboard.write rejected PNG data.',
        graphPngReadFailed: 'Failed to read PNG data for clipboard fallback.',
        dataViewerPanelTitle: 'Data Viewer | Stata All in One',
        dataViewerTabVariables: 'Variables',
        dataViewerTabData: 'Data',
        dataViewerRefresh: 'Refresh',
        dataViewerLoading: 'Loading...',
        dataViewerNoDataset: 'No dataset loaded',
        dataViewerLoadMore: 'Load more rows...',
        dataViewerLoadingMore: 'Loading more...',
        dataViewerScrollForMore: 'Scroll for more...',
        dataViewerColumnName: 'Name',
        dataViewerColumnType: 'Type',
        dataViewerColumnFormat: 'Format',
        dataViewerColumnLabel: 'Label',
        dataViewerObs: 'Obs',
        dataViewerVars: 'Vars',
        dataViewerSortedBy: 'Sorted by',
        dataViewerEmbeddedOnly: 'Data Viewer is only available in Embedded Console mode.',
        dataViewerFilter: 'Filter',
        dataViewerClearFilter: 'Clear filter',
        dataViewerApplyFilter: 'Apply filter (Enter)',
        dataViewerClearFilterShortcut: 'Clear filter (Esc)',
        dataViewerFilterPlaceholder: 'varlist if exp in range, nolabel',
        aiSkillDisabled: 'AI Skill is disabled in settings. Enable "Stata All in One > AI Skill Enabled" first.',
        aiSkillNotFound: 'SKILL.md not found in the extension directory. Please reinstall the extension.',
        aiSkillSelectTool: 'Select AI coding tool to install the skill to',
        aiSkillSessionNotReady: 'Stata session not ready. Open a .do file and run some code first.',
        aiSkillServerFailed: 'Failed to start AI Skill server. Check the console for details.',
        aiSkillInstalled: 'AI Skill installed successfully',
        aiSkillServerStarted: (p) => `AI Skill server started on http://127.0.0.1:${p.port}`,
        aiSkillServerStopped: 'AI Skill server stopped.',
        aiSkillServerNotRunning: 'AI Skill server is not running.',
        aiSkillWelcomeTitle: '✨ Welcome to Stata All in One AI Skill!',
        aiSkillWelcomeIntro: 'AI Skill allows AI coding tools (Claude Code, Cursor, Codex CLI, Open Code, OpenClaw, etc.) to directly run Stata code through a local HTTP server. No extra software is needed — just VS Code and the built-in curl command. Once enabled, the HTTP server starts automatically when VS Code opens.',
        aiSkillWelcomeHint: 'Click the "Copy Prompt" button below and paste it into your AI coding tool. The AI will automatically configure the skill and start running Stata code.',
        aiSkillWelcomePrompt: 'I have Stata All in One VS Code extension installed with AI Skill enabled. Please set yourself up to run Stata code:\n\n1. Find the extension: search under ~/.vscode/extensions/ for a folder matching *stata-all-in-one*\n2. Read <extension-folder>/skill/SKILL.md — it has the complete skill definition and API docs\n3. Install or register this skill using your platform\'s mechanism (skills directory, rules file, config, etc.)\n4. The Stata HTTP API is at http://127.0.0.1:19521\n   - GET /status → check if running\n   - POST /execute with {"code":"..."} → run code\n5. Use curl (built-in everywhere) to talk to it. If connection refused, VS Code may need to be opened first.',
        aiSkillToggleEnable: 'Enable AI Skill',
        aiSkillToggleDisable: 'Disable AI Skill',
        aiSkillCopyBtn: 'Copy Prompt',
        aiSkillCopiedTitle: 'Prompt Copied',
        aiSkillCopiedMessage: 'Paste the prompt into Claude Code, Codex, Open Code, OpenClaw or any other AI coding tool.',
        aiSkillCopiedOk: 'Got it',
        aiSkillCloseBtn: 'Close'
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
        stataNotFoundConfigured: ({ stataVersion }) => `未找到配置的 Stata 版本"${stataVersion}"，请安装或更改设置。`,
        noStataInstalled: ({ installedList }) => `未检测到已安装的 Stata，请安装或设置可用版本。已检测：${installedList}。`,
        winRunFailed: ({ message, detail }) => `在 Windows 运行 Stata 失败：${message}${detail}`,
        promptWinPath: '请输入 Stata 可执行文件路径',
        promptWinPathPlaceholder: '例如：C:\\Program Files\\Stata17\\StataMP-64.exe',
        promptMacVersion: '请选择您的 Stata 版本',
        configSaved: '配置已成功保存',
        macVersionReset: '已重置 macOS 的 Stata 版本配置，下次启动会自动检测。',
        macOnlyCommand: '该命令仅适用于 macOS。',
        autoDetectedStata: ({ appName, appPath }) => `已检测到安装的 ${appName}（${appPath}），并自动配置。`,
        codeSentStata: '已发送代码到 Stata',
        runFailed: ({ message }) => `运行 Stata 代码失败：${message}`,
        codeSentApp: ({ app }) => `已发送代码到 ${app}`,
        tmpFileFailed: ({ message }) => `创建临时文件失败：${message}`,
        resetDone: '迁移提示状态已重置，正在检查迁移...',
        noTextSelected: '未选中任何文本。请选中一个 Stata 命令后重试。',
        notAValidIdentifier: ({ command }) => `"${command}" 不是有效的 Stata 命令标识符。请选中一个有效的命令。`,
        helpCommandSent: ({ command }) => `已向 Stata 发送帮助命令："${command}"`,
        reportBugInfo: '如遇问题或 bug，请联系 hi@zihaowang.cn。',
        cannotRenameCommand: ({ word }) => `无法重命名 "${word}"：这是内置或自定义的 Stata 命令`,
        cannotRenameOption: ({ word }) => `无法重命名 "${word}"：这是 Stata 命令的选项`,
        consoleUnavailable: ({ reason }) => `Embedded Console 执行不可用，已切换到 External App。原因：${reason}`,
        consoleOfferGuiFallback: ({ reason }) => `Embedded Console 执行遇到扩展错误：${reason}`,
        useStataApp: '使用 External App',
        stayInConsole: '留在 Embedded Console',
        consoleFallbackAutoSwitched: ({ reason }) => `Embedded Console 不可用，已自动切换到 External App。原因：${reason}`,
        consoleFallbackSwitchPermanently: '永久切换至 External App',
        consoleFallbackDismiss: '忽略',
        consoleFallbackPermanentlySet: '运行模式已设为 External App，可在设置中改回。',
        sideLeft: '左侧',
        sideRight: '右侧',
        consolePreviewTooNarrow: ({ side }) => `检测到 VS Code 窗口宽度不足，建议最大化或适当拉宽窗口，以便 控制台 | Stata All in One 在${side}展开。`,
        consolePreviewStillNarrow: '检测到 VS Code 窗口宽度仍不足，控制台 | Stata All in One 将继续在下方面板中运行。',
        consoleLogoFallbackStarted: '控制台 | Stata All in One 已启动...',
        runModeUnsupportedOnWindows: ({ mode }) => `${mode} 当前在 Windows 上不可用，已切换到 External App。`,
        comRegRequired: 'Stata Automation COM 需要注册。即将弹出 UAC 窗口，请点击"是"以完成注册。注册后即可使用 COM 自动化方式执行代码。',
        comInitFailed: 'Stata Automation COM 初始化失败，已降级到按键模拟执行。请以管理员身份运行一次 Stata 完成 COM 注册。',
        comExecFailed: 'Stata Automation COM 执行出错，已降级到按键模拟执行。',
        comLearnMore: '了解更多',
        webviewPanelTitle: '控制台 | Stata All in One',
        webviewWaiting: '等待 Stata 输出...',
        webviewRunning: '控制台 | Stata All in One 运行中...',
        webviewIdle: '空闲',
        webviewError: '错误',
        webviewStop: '停止',
        webviewClear: '清空',
        webviewInputLabel: '命令窗口',
        webviewRun: '运行',
        webviewNewline: '换行',
        webviewHistory: '历史记录',
        webviewDragResizeTip: '拖拽调整输入区高度',
        webviewOverflowNotice: '输出内容超出了当前宽度，请横向滑动查看。也可以拉宽 Console 面板以更好地适配输出。',
        webviewOverflowConfirm: '确认',
        webviewOverflowDismissForever: '不再提示',
        graphCopyImage: '复制图片',
        graphSaveImage: '保存图片',
        graphFullScreen: '全屏浏览',
        graphClose: '关闭',
        graphCopyPngSuccess: '图形已作为 PNG 复制到剪贴板。',
        graphCopyPngFailed: ({ detail }) => `无法将图形作为 PNG 复制到剪贴板。${detail || ''}`,
        graphFileUnavailable: '图形文件已不可用。',
        graphImageFilter: '图形图片',
        graphSaveFormatPlaceholder: '选择图形图片格式',
        graphFormatSvg: 'SVG',
        graphFormatSvgDescription: '矢量图片',
        graphFormatPng: 'PNG',
        graphFormatPngDescription: ({ dpi }) => `${dpi} DPI 位图`,
        graphSaveFailed: ({ message }) => `保存图形失败：${message}`,
        graphPanelUnavailable: '图形面板已不可用。',
        graphPngRequestTimeout: '图形转换为 PNG 超时。',
        graphPngConversionFailed: '无法将图形转换为 PNG。',
        graphInvalidPngData: '图形渲染器返回的 PNG 数据无效。',
        graphOnlySvgCanConvert: 'Embedded Console 只能将 SVG 图形缓存转换为 PNG。',
        graphSvgEmpty: '图形 SVG 内容为空。',
        graphCanvasUnavailable: '当前环境无法使用 Canvas 渲染。',
        graphCanvasPngFailed: 'Canvas 生成 PNG 数据失败。',
        graphSvgReadFailed: '无法从 webview 资源读取图形 SVG。',
        graphSvgLoadFailed: '浏览器无法加载图形 SVG 以转换为 PNG。',
        graphClipboardWriteUnavailable: '当前 VS Code webview 不支持 browser clipboard.write。',
        graphClipboardItemUnavailable: '当前 VS Code webview 不支持 ClipboardItem。',
        graphClipboardRejected: '浏览器拒绝写入 PNG 剪贴板数据。',
        graphPngReadFailed: '读取 PNG 数据用于剪贴板后备方案失败。',
        dataViewerPanelTitle: '数据查看器 | Stata All in One',
        dataViewerTabVariables: '变量',
        dataViewerTabData: '数据表',
        dataViewerRefresh: '刷新',
        dataViewerLoading: '加载中...',
        dataViewerNoDataset: '未加载数据集',
        dataViewerLoadMore: '加载更多行...',
        dataViewerLoadingMore: '正在加载更多...',
        dataViewerScrollForMore: '滚动加载更多...',
        dataViewerColumnName: '名称',
        dataViewerColumnType: '类型',
        dataViewerColumnFormat: '格式',
        dataViewerColumnLabel: '标签',
        dataViewerObs: '观测值',
        dataViewerVars: '变量数',
        dataViewerSortedBy: '排序变量',
        dataViewerEmbeddedOnly: '数据查看器仅在 Embedded Console 模式下可用。',
        dataViewerFilter: '筛选',
        dataViewerClearFilter: '取消筛选',
        dataViewerApplyFilter: '执行筛选 (Enter)',
        dataViewerClearFilterShortcut: '清空筛选 (Esc)',
        dataViewerFilterPlaceholder: '变量列表 if 条件 in 范围, nolabel',
        aiSkillDisabled: 'AI 编程技能已在设置中禁用。请先启用 "Stata All in One › AI Skill Enabled"。',
        aiSkillNotFound: '未在扩展目录中找到 SKILL.md，请重新安装扩展。',
        aiSkillSelectTool: '选择要安装技能的 AI 编程工具',
        aiSkillSessionNotReady: 'Stata 会话未就绪。请先打开一个 .do 文件并运行代码。',
        aiSkillServerFailed: '无法启动 AI Skill 服务器，请查看控制台了解详情。',
        aiSkillInstalled: 'AI 编程技能安装成功',
        aiSkillServerStarted: (p) => `AI Skill 服务器已启动：http://127.0.0.1:${p.port}`,
        aiSkillServerStopped: 'AI Skill 服务器已停止。',
        aiSkillServerNotRunning: 'AI Skill 服务器未运行。',
        aiSkillWelcomeTitle: '✨ 欢迎使用 Stata All in One 的 AI Skill 功能！',
        aiSkillWelcomeIntro: 'AI Skill 让 AI 编程工具（Claude Code、Cursor、Codex CLI、Open Code、OpenClaw 等）能直接通过本地 HTTP 服务器运行 Stata 代码。无需安装任何额外软件——只需 VS Code 和系统自带的 curl 命令。启用后，HTTP 服务器会在 VS Code 打开时自动启动。',
        aiSkillWelcomeHint: '点击下方「复制提示词」按钮，粘贴到你的 AI 编程工具中，AI 将自动配置 skill 并开始运行 Stata 代码。',
        aiSkillWelcomePrompt: '我已经安装了 Stata All in One VS Code 扩展并开启了 AI Skill 功能。请配置好自己以运行 Stata 代码：\n\n1. 找到扩展：在 ~/.vscode/extensions/ 下搜索匹配 *stata-all-in-one* 的目录\n2. 读取 <扩展目录>/skill/SKILL.md —— 里面有完整的 skill 定义和 API 文档\n3. 按你平台的机制安装或注册这个 skill（skills 目录、rules 文件、config 配置等，你自行判断）\n4. Stata HTTP API 地址为 http://127.0.0.1:19521\n   - GET /status → 检查是否在线\n   - POST /execute ，body {"code":"..."} → 运行代码\n5. 用系统自带的 curl 调用。如果连接被拒绝，可能需要先打开 VS Code',
        aiSkillToggleEnable: '打开 AI Skill 功能',
        aiSkillToggleDisable: '关闭 AI Skill 功能',
        aiSkillCopyBtn: '复制提示词',
        aiSkillCopiedTitle: '提示词已复制',
        aiSkillCopiedMessage: '请粘贴到 Claude Code、Codex、Open Code、OpenClaw 等 AI 编程工具中。',
        aiSkillCopiedOk: '知道了',
        aiSkillCloseBtn: '关闭'
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
