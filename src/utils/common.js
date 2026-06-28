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
        consoleLicenseMissing: 'Stata license file (stata.lic) not found. The Embedded Console requires a licensed Stata installation. Falling back to External App.',
        consoleLicenseMissingRemind: 'Remind Later',
        consoleLicenseMissingNever: "Don't Show Again",
        consoleLicenseFound: 'Stata license detected — Embedded Console is now available.',
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
        composerTips: [
            'Tip: Drag the "Console | Stata All in One" tab to the bottom if your screen is too narrow for side-by-side layout.',
            'Tip: In the editor, Ctrl/Cmd+D runs the current line or selection.',
            'Tip: In the editor, Ctrl/Cmd+Shift+H shows help for the selected command.',
            'Tip: Click a .dta file in the Explorer to open it in the Data Viewer.',
            'Tip: In the editor, F2 renames a variable throughout the document.',
            'Tip: Shift+Enter inserts a Stata line break (///) — works in editor and console.',
            'Tip: If output tables look misaligned, set the Embedded Console to a monospace font in Settings.',
            'Tip: In the editor, Ctrl/Cmd+/ toggles line comments.',
            'Tip: In the editor, Ctrl/Cmd+1~6 sets heading levels, Ctrl/Cmd+0 clears.',
            'Tip: AI Skill lets AI tools (Claude Code, Cursor, etc.) run Stata code. Enable in settings.',
            'Tip: Embedded Console and AI Skill require a valid STATA.LIC license file.',
        ],
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
        dataViewerEmbeddedOnly: 'Data Viewer could not start an Embedded Console session. Check that Stata is installed and licensed.',
        dataViewerFilter: 'Filter',
        dataViewerClearFilter: 'Clear filter',
        dataViewerApplyFilter: 'Apply filter (Enter)',
        dataViewerClearFilterShortcut: 'Clear filter (Esc)',
        dataViewerFilterPlaceholder: 'varlist if exp in range, nolabel',
        aiSkillDisabled: 'AI Skill is disabled in settings. Enable "Stata All in One > AI Skill Enabled" first.',
        aiSkillSessionNotReady: 'Stata session not ready. Open a .do file and run some code first.',
        aiSkillServerFailed: 'Failed to start AI Skill server. Check the console for details.',
        aiSkillServerStarted: (p) => `AI Skill server started on http://127.0.0.1:${p.port}`,
        aiSkillServerStopped: 'AI Skill server stopped.',
        aiSkillServerNotRunning: 'AI Skill server is not running.',
        aiSkillWelcomeTitle: '✨ Welcome to Stata All in One AI Skill!',
        aiSkillWelcomeIntro: 'AI Skill allows AI coding tools (Claude Code, Cursor, Codex CLI, Open Code, OpenClaw, etc.) to directly run Stata code through a local HTTP server. No extra software is needed — just VS Code and the built-in curl command. Once enabled, the HTTP server starts automatically when VS Code opens.',
        aiSkillWelcomeHint: 'Click the "Copy Prompt" button below and paste it into your AI coding tool. The AI will automatically configure the skill and start running Stata code.',
        aiSkillWelcomePrompt: 'I have Stata All in One VS Code extension installed with AI Skill enabled. Please set yourself up to run Stata code:\n\n1. Find the extension: search under ~/.vscode/extensions/ for a folder matching *stata-all-in-one*\n2. Read <extension-folder>/skill/SKILL.md — it has the complete skill definition and API docs\n3. Install or register this skill using your platform\'s mechanism (skills directory, rules file, config, etc.). **IMPORTANT: the skill MUST be named "stata-all-in-one-skill" — do not rename it.**\n4. The Stata HTTP API is provided by the VS Code extension on the user host machine at http://127.0.0.1:19521\n   - GET /status → check if running; it returns service and skillVersion\n   - POST /execute with {"code":"..."} → run code\n5. After /status succeeds, compare the returned skillVersion with the version in your installed/loaded stata-all-in-one-skill. The version format is YYYYMMDDHHmm. If they differ, reread <extension-folder>/skill/SKILL.md and replace/re-register the skill before running Stata code. Keep the skill name exactly "stata-all-in-one-skill".\n6. Use curl to call this localhost API. Do not import or call the extension\'s internal JavaScript/native modules directly; the supported interface is HTTP.\n7. Important for Codex, containers, dev containers, remote shells, or any sandboxed tool: your shell\'s 127.0.0.1 may be the sandbox, not the user host. First test /status with a 2s timeout. If it fails with connection refused, timeout, OFFLINE, or GUI commands such as open/code cannot run, treat it as a sandbox/host-boundary issue. Request host/unsandboxed command execution to run curl against http://127.0.0.1:19521, or ask the user to run the curl command in a host terminal. Do not repeatedly retry inside the sandbox.',
        aiSkillToggleEnable: 'Enable AI Skill',
        aiSkillToggleDisable: 'Disable AI Skill',
        aiSkillCopyBtn: 'Copy Prompt',
        aiSkillCopiedTitle: 'Prompt Copied',
        aiSkillCopiedMessage: 'Paste the prompt into Claude Code, Codex, Open Code, OpenClaw or any other AI coding tool.',
        aiSkillCopiedOk: 'Got it',
        aiSkillCloseBtn: 'Close',
        // Console unavailable diagnostic toast keys
        consoleUnavailPrefix: ({ reason }) => `Embedded Console unavailable on this device. ${reason}`,
        consoleUnavailLicense: 'Stata license file (stata.lic) not found. Please install a licensed copy of Stata.',
        consoleUnavailLibrary: 'Stata installation not detected. Please install Stata MP/SE/BE in /Applications.',
        consoleUnavailNative: 'Native bridge module not loaded. Please ensure stata_bridge.node is compiled (run: npm run build:native).',
        consoleUnavailSessionInit: ({ error }) => `Stata session initialization failed: ${error}`,
        consoleUnavailUnknown: ({ reason }) => `Unknown error: ${reason}`,
        // Capability state keys
        capabilityUnverified: 'Please run Stata code in the editor first to activate data viewing features.',
        capabilityExternalOnly: 'Data Viewer is not available on this device (Embedded Console unsupported).',
        capabilityUnverifiedAI: 'Please run Stata code in the editor first to activate AI Skill.',
        // Diagnose command keys
        diagnoseConsoleAvailable: 'Embedded Console is available. Session initialized.',
        diagnoseConsoleRunning: 'Embedded Console is available. Active session found.',
        // Dynamic tip for when console is available but user chose external app
        consoleAvailSuggestSwitchBack: 'Tip: Embedded Console is available on this device. You can switch from External App to Embedded Console in Settings → Stata All-in-One → Run Mode.',
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
        consoleLicenseMissing: '未检测到 Stata 许可证文件（stata.lic）。嵌入式控制台需要正版 Stata 许可证，已降级为外部 Stata 应用运行。',
        consoleLicenseMissingRemind: '稍后提示',
        consoleLicenseMissingNever: '不再提示',
        consoleLicenseFound: '已检测到 Stata 许可证，嵌入式控制台模式已启用。',
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
        composerTips: [
            '提示：如果屏幕不够宽，可以拖动“控制台 | Stata All in One”标签页到下方，改为纵向分布。',
            '提示：在编辑器中，Ctrl/Cmd+D 运行当前行或选中代码。',
            '提示：在编辑器中，Ctrl/Cmd+Shift+H 查看选中命令的帮助。',
            '提示：在资源管理器中点击 .dta 文件即可在数据查看器中打开。',
            '提示：在编辑器中，F2 可重命名当前文档中的变量。',
            '提示：Shift+Enter 插入 Stata 换行符（///），编辑器和控制台均可用。',
            '提示：如果输出表格没有对齐，请在设置中将嵌入式控制台字体设为等宽字体。',
            '提示：在编辑器中，Ctrl/Cmd+/ 切换行注释。',
            '提示：在编辑器中，Ctrl/Cmd+1~6 设置标题等级，Ctrl/Cmd+0 清除。',
            '提示：AI Skill 让 AI 工具(Claude Code/Cursor 等)直接运行 Stata 代码，可在设置中启用。',
            '提示：嵌入式控制台与 AI Skill 功能需要有效的 STATA.LIC 许可证文件。',
        ],
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
        dataViewerEmbeddedOnly: '数据查看器无法启动嵌入式控制台会话。请检查 Stata 是否已安装并有有效许可证。',
        dataViewerFilter: '筛选',
        dataViewerClearFilter: '取消筛选',
        dataViewerApplyFilter: '执行筛选 (Enter)',
        dataViewerClearFilterShortcut: '清空筛选 (Esc)',
        dataViewerFilterPlaceholder: '变量列表 if 条件 in 范围, nolabel',
        aiSkillDisabled: 'AI 编程技能已在设置中禁用。请先启用 "Stata All in One › AI Skill Enabled"。',
        aiSkillSessionNotReady: 'Stata 会话未就绪。请先打开一个 .do 文件并运行代码。',
        aiSkillServerFailed: '无法启动 AI Skill 服务器，请查看控制台了解详情。',
        aiSkillServerStarted: (p) => `AI Skill 服务器已启动：http://127.0.0.1:${p.port}`,
        aiSkillServerStopped: 'AI Skill 服务器已停止。',
        aiSkillServerNotRunning: 'AI Skill 服务器未运行。',
        aiSkillWelcomeTitle: '✨ 欢迎使用 Stata All in One 的 AI Skill 功能！',
        aiSkillWelcomeIntro: 'AI Skill 让 AI 编程工具（Claude Code、Cursor、Codex CLI、Open Code、OpenClaw 等）能直接通过本地 HTTP 服务器运行 Stata 代码。无需安装任何额外软件——只需 VS Code 和系统自带的 curl 命令。启用后，HTTP 服务器会在 VS Code 打开时自动启动。',
        aiSkillWelcomeHint: '点击下方「复制提示词」按钮，粘贴到你的 AI 编程工具中，AI 将自动配置 skill 并开始运行 Stata 代码。',
        aiSkillWelcomePrompt: '我已经安装了 Stata All in One VS Code 扩展并开启了 AI Skill 功能。请配置好自己以运行 Stata 代码：\n\n1. 找到扩展：在 ~/.vscode/extensions/ 下搜索匹配 *stata-all-in-one* 的目录\n2. 读取 <扩展目录>/skill/SKILL.md —— 里面有完整的 skill 定义和 API 文档\n3. 按你平台的机制安装或注册这个 skill（skills 目录、rules 文件、config 配置等，你自行判断）。**重要：skill 名称必须为 "stata-all-in-one-skill"，不得自行改名。**\n4. Stata HTTP API 由用户宿主机上的 VS Code 扩展提供，地址为 http://127.0.0.1:19521\n   - GET /status → 检查是否在线；返回 service 和 skillVersion\n   - POST /execute ，body {"code":"..."} → 运行代码\n5. /status 成功后，比较返回的 skillVersion 与你已安装/已加载的 stata-all-in-one-skill 中的 version。版本号格式为 YYYYMMDDHHmm。如果不一致，先重新读取 <扩展目录>/skill/SKILL.md 并替换/重新注册 skill，再运行 Stata 代码。skill 名称必须保持为 "stata-all-in-one-skill"。\n6. 使用 curl 调用这个 localhost API。不要直接 import 或调用扩展内部的 JavaScript/native 模块；稳定接口是 HTTP。\n7. Codex、容器、Dev Container、远程 shell 或任何沙箱工具必须特别注意：当前 shell 的 127.0.0.1 可能是沙箱而不是用户宿主机。先用 2 秒超时测试 /status。如果 connection refused、timeout、OFFLINE，或 open/code 等 GUI 命令无法运行，应判断为沙箱/宿主机边界问题，申请宿主机/非沙箱命令权限去调用 http://127.0.0.1:19521；不要在沙箱内反复重试。',
        aiSkillToggleEnable: '打开 AI Skill 功能',
        aiSkillToggleDisable: '关闭 AI Skill 功能',
        aiSkillCopyBtn: '复制提示词',
        aiSkillCopiedTitle: '提示词已复制',
        aiSkillCopiedMessage: '请粘贴到 Claude Code、Codex、Open Code、OpenClaw 等 AI 编程工具中。',
        aiSkillCopiedOk: '知道了',
        aiSkillCloseBtn: '关闭',
        // Console unavailable diagnostic toast keys
        consoleUnavailPrefix: ({ reason }) => `本设备嵌入式控制台不可用，${reason}`,
        consoleUnavailLicense: '未找到Stata许可证文件(stata.lic)，请安装正版Stata。',
        consoleUnavailLibrary: '未检测到Stata安装。请在/Applications中安装Stata MP/SE/BE。',
        consoleUnavailNative: '原生桥接模块未加载。请确保已编译stata_bridge.node（运行 npm run build:native）。',
        consoleUnavailSessionInit: ({ error }) => `Stata会话初始化失败：${error}`,
        consoleUnavailUnknown: ({ reason }) => `未知错误：${reason}`,
        // Capability state keys
        capabilityUnverified: '请先在编辑器中运行Stata代码以激活数据查看功能',
        capabilityExternalOnly: '本设备不可使用数据查看器',
        capabilityUnverifiedAI: '请先在编辑器中运行 Stata 代码以激活 AI Skill 功能',
        // Diagnose command keys
        diagnoseConsoleAvailable: '嵌入式控制台可用，会话已初始化。',
        diagnoseConsoleRunning: '嵌入式控制台可用，当前已有活动会话。',
        // Dynamic tip for when console is available but user chose external app
        consoleAvailSuggestSwitchBack: '提示：本设备支持嵌入式控制台。您可以在 设置 → Stata All-in-One → Run Mode 中将运行模式从 External App 切换为 Embedded Console。',
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

/**
 * Show a non-modal bottom-right toast explaining why the Embedded Console is unavailable.
 * Maps failCode to a specific localized reason message.
 * @param {{ failCode?: string, message?: string, reason?: string }} result
 */
function showConsoleUnavailableToast({ failCode, message, reason }) {
    const code = failCode || 'UNKNOWN_ERROR';
    const keyMap = {
        LICENSE_NOT_FOUND: 'consoleUnavailLicense',
        LIBRARY_NOT_FOUND: 'consoleUnavailLibrary',
        NATIVE_NOT_LOADED: 'consoleUnavailNative',
        SESSION_INIT_FAILED: 'consoleUnavailSessionInit',
        UNKNOWN_ERROR: 'consoleUnavailUnknown'
    };
    const key = keyMap[code] || 'consoleUnavailUnknown';
    const params = (code === 'SESSION_INIT_FAILED') ? { error: message || reason }
                 : (code === 'UNKNOWN_ERROR') ? { reason: reason || message }
                 : {};
    const specific = msg(key, params);
    const full = msg('consoleUnavailPrefix', { reason: specific });
    showWarn(full);
}

module.exports = {
    EXT_LABEL,
    showInfo,
    showWarn,
    showError,
    showConsoleUnavailableToast,
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
