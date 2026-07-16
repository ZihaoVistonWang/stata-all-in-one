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
        stataDiscoverySelectWindows: 'Select the Stata executable you want to use.',
        stataDiscoverySelectMac: 'Select the Stata application you want to use.',
        stataDiscoveryRecommended: 'Recommended',
        stataDiscoveryUseStataSetup: 'Stata not found? Configure it directly from Stata',
        stataSetupQuickPickPlaceholder: 'Start with step 1. Step 2 appears after Stata confirms that saio was installed.',
        stataSetupQuickPickInstallLabel: 'Step 1: Copy the saio installation command',
        stataSetupQuickPickSetupLabel: 'Step 2: Copy saio setup',
        stataSetupQuickPickClickToCopy: 'Click to copy',
        stataSetupQuickPickCopied: 'Copied',
        stataSetupQuickPickInstallDetail: 'Open Stata outside VS Code, paste the command, press Enter, and wait for “installation complete”.',
        stataSetupQuickPickInstallFailedDetail: 'The previous installation failed. Check the Stata output, then click to copy and try again.',
        stataSetupQuickPickSetupDetail: 'After installation completes, paste this command into the same external Stata window and press Enter.',
        stataSetupQuickPickWaitingForInstallHint: 'Installation command copied. Paste and run it in external Stata; waiting for the installation result…',
        stataSetupQuickPickInstallSucceededHint: 'saio was installed successfully. Continue with step 2.',
        stataSetupQuickPickInstallFailedHint: 'saio installation failed. Check the Stata output, then copy step 1 and try again.',
        stataSetupQuickPickSetupCopiedHint: 'saio setup copied. Paste and run it in external Stata; this window will close automatically after connection.',
        stataSetupSignalPathInvalid: 'The Stata installation reported by the saio command could not be verified.',
        stataSetupSignalReceived: 'A configuration request was received from Stata.',
        stataSetupServiceUnavailable: 'The Stata configuration service could not start because ports 16886–16895 are unavailable.',
        saioCommandUnavailableInVscode: 'There is no need to run saio in VS Code. This command is only for configuring the extension from Stata opened outside VS Code when automatic discovery fails.',
        stataSetupWindowsExeRequired: 'Please select a Stata .exe file.',
        stataSetupWindowsExeInvalid: 'Please select a Stata executable such as StataMP-64.exe.',
        stataSetupWindowsExeNotFound: 'The specified Stata executable does not exist or is not a file.',
        stataSetupInstallationMissing: 'No usable Stata installation was found. Stata All in One cannot run Stata code until Stata is installed or its installation is configured.',
        stataSetupReconfigure: 'Configure Again',
        stataSetupConfirm: 'Confirm',
        stataSetupSwitchExternal: 'Switch to External Stata Application',
        stataSetupConfirmSwitchExternal: 'Confirm and Switch to External Stata Application',
        stataSetupUseEmbedded: 'Switch to Embedded Stata Console',
        stataSetupKeepExternal: 'Keep External Stata Application',
        stataSetupPurchaseGenuine: 'Purchase or Use Genuine Stata',
        stataSetupGenuineInfo: 'Users in Mainland China can contact Stata Corp, LLC authorized reseller Beijing Uone Information Technology Co., Ltd. (Uone Technology / 友万科技) to purchase genuine Stata software or request a trial.\n\nhttp://xhslink.com/o/QYWdYfrEhy',
        stataSetupVisitDealer: 'Contact Uone Technology',
        stataSetupSuccess: ({ stataPath }) => `Stata was found at ${stataPath}, and the Embedded Stata Console is ready. You can view Stata output in VS Code and use Data Viewer to open .dta files. To run code in the external Stata application instead, select "Switch to External Stata Application".`,
        stataSetupSuccessExternalMode: ({ stataPath }) => `Stata was found at ${stataPath}, and the Embedded Stata Console is ready. External Stata Application is currently selected. You can switch to the Embedded Stata Console to view output in VS Code and use Data Viewer to open .dta files.`,
        stataSetupConsoleFailure: ({ stataPath }) => `Stata was found at ${stataPath}, but the Embedded Stata Console is unavailable:`,
        stataSetupMissingDll: 'The DLL required by the Embedded Stata Console was not found.',
        stataSetupMissingDylib: 'The dylib required by the Embedded Stata Console was not found.',
        stataSetupMissingLicense: 'The Stata license file stata.lic was not found. Please support genuine Stata software to experience the complete functionality of Stata All in One.',
        stataSetupNativeUnavailable: 'The native bridge required by the Embedded Stata Console could not be loaded.',
        stataSetupSessionFailed: ({ reason }) => `The Embedded Stata Console could not be initialized${reason ? `: ${reason}` : '.'}`,
        stataSetupExternalAvailable: 'The Embedded Console and Data Viewer are unavailable, but code can still run through the external Stata application.',
        macVersionReset: 'Stata version on macOS has been reset. It will auto-detect on next activation.',
        macOnlyCommand: 'This command is only available on macOS.',
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
        consoleLibraryMissingInSelected: ({ libraryName }) => `The selected Stata installation does not contain ${libraryName}.`,
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
            'Tip: Click the AI button to copy a prompt that installs the native Stata AI Skill into your AI tool.',
            'Tip: Embedded Console and the native Stata AI Skill require a valid STATA.LIC license file.',
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
        graphFormatJpg: 'JPG',
        graphFormatJpgDescription: ({ dpi }) => `${dpi} DPI raster image with white background`,
        graphSaveFailed: ({ message }) => `Failed to save graph: ${message}`,
        graphPanelUnavailable: 'Graph panel is no longer available.',
        graphImageRequestTimeout: 'Timed out while converting graph image.',
        graphImageConversionFailed: 'Failed to convert graph image.',
        graphInvalidImageData: 'Invalid image data returned by graph renderer.',
        graphPngRequestTimeout: 'Timed out while converting graph to PNG.',
        graphPngConversionFailed: 'Failed to convert graph image to PNG.',
        graphInvalidPngData: 'Invalid PNG data returned by graph renderer.',
        graphOnlySvgCanConvert: 'Only SVG graph cache can be converted to bitmap images in the embedded console.',
        graphSvgEmpty: 'Graph SVG content is empty.',
        graphCanvasUnavailable: 'Canvas rendering is unavailable.',
        graphCanvasPngFailed: 'Canvas failed to create PNG data.',
        graphCanvasImageFailed: 'Canvas failed to create image data.',
        graphSvgReadFailed: 'Failed to read graph SVG from the webview resource.',
        graphSvgLoadFailed: 'Browser failed to load graph SVG for image conversion.',
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
        dataViewerOpenedNotice: ({ title }) => `Opened in the "${title}" tab.`,
        aiSkillDisabled: 'The bundled native Stata AI Skill must be installed in your AI tool before use.',
        aiSkillSessionNotReady: 'Native Stata AI Skill service is not ready. Install the bundled skill in your AI tool and start the native service.',
        aiSkillServerFailed: 'Failed to start the native Stata AI Skill service. Check the service log for details.',
        aiSkillServerStarted: (p) => `Native Stata AI Skill service started on http://127.0.0.1:${p.port}`,
        aiSkillServerStopped: 'Native Stata AI Skill service stopped.',
        aiSkillServerNotRunning: 'Native Stata AI Skill service is not running.',
        aiSkillWelcomeTitle: 'Install Stata AI Skill in Your AI Tool',
        aiSkillWelcomeIntro: 'Stata All in One bundles the standalone native Stata AI Skill. It runs through a Rust executable and a local service at http://127.0.0.1:19522.',
        aiSkillWelcomeHint: 'Click "Copy Prompt" and paste it into Claude Code, Codex, Open Code, OpenClaw, or another AI coding tool. The AI tool should install or register the bundled skill from this extension.',
        aiSkillWelcomePrompt: 'I have Stata All in One installed. Please install and use its bundled native Stata AI Skill so you can run Stata code:\n\n1. Find the installed extension folder. Search under ~/.vscode/extensions/ or ~/.vscode-insiders/extensions/ for a folder matching *stata-all-in-one*. On Windows, search under %USERPROFILE%\\.vscode\\extensions.\n2. Open <extension-folder>/skill/SKILL.md and follow it as the authoritative skill definition and runtime guide.\n3. Install or register <extension-folder>/skill as an AI Agent skill using your platform mechanism, such as a skills directory, rules file, connector config, or equivalent. The skill name must be exactly "stata-ai-skill". Do not rename it.\n4. Resolve the native executable from <extension-folder>/skill/bin according to SKILL.md.\n5. Start the native service from the skill directory if it is offline. The default endpoint is http://127.0.0.1:19522.\n   - GET /status checks readiness and reports configuration diagnostics.\n   - POST /execute with {"code":"..."} runs inline Stata code.\n   - POST /execute with {"file":"...","cwd":"..."} runs an existing .do file.\n6. If /status reports needsConfiguration, ask me where Stata is installed and configure the native service with its config command as documented in SKILL.md.\n7. Use the HTTP API documented in SKILL.md.\n8. If you run in a container, dev container, remote shell, or sandbox, remember that 127.0.0.1 may refer to the sandbox instead of my host machine. Test /status with a short timeout and, if it fails, ask for host-side command execution or tell me exactly which command to run in a host terminal.',
        aiSkillToggleEnable: 'Install AI Skill',
        aiSkillToggleDisable: 'Install AI Skill',
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
        capabilityUnverifiedAI: 'Click the AI button to copy the native Stata AI Skill installation prompt.',
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
        stataDiscoverySelectWindows: '请选择要使用的 Stata 可执行文件。',
        stataDiscoverySelectMac: '请选择要使用的 Stata 应用。',
        stataDiscoveryRecommended: '推荐',
        stataDiscoveryUseStataSetup: '没有找到你的 Stata？直接在 Stata 中完成配置',
        stataSetupQuickPickPlaceholder: '请先完成步骤 1；收到 Stata 返回的安装成功结果后，才会显示步骤 2。',
        stataSetupQuickPickInstallLabel: '步骤 1：复制 saio 安装命令',
        stataSetupQuickPickSetupLabel: '步骤 2：复制 saio setup',
        stataSetupQuickPickClickToCopy: '点击复制',
        stataSetupQuickPickCopied: '已复制',
        stataSetupQuickPickInstallDetail: '请在 VS Code 外部打开 Stata，粘贴命令并按回车，等待出现“installation complete”。',
        stataSetupQuickPickInstallFailedDetail: '上次安装失败。请检查 Stata 输出，然后点击复制并重试。',
        stataSetupQuickPickSetupDetail: '安装完成后，将此命令粘贴到同一个外部 Stata 窗口并按回车。',
        stataSetupQuickPickWaitingForInstallHint: '安装命令已复制。请在外部 Stata 中粘贴运行，正在等待安装结果……',
        stataSetupQuickPickInstallSucceededHint: 'saio 安装成功，请继续完成步骤 2。',
        stataSetupQuickPickInstallFailedHint: 'saio 安装失败。请检查 Stata 输出，然后重新复制步骤 1。',
        stataSetupQuickPickSetupCopiedHint: 'saio setup 已复制。请在外部 Stata 中粘贴运行；连接成功后本窗口会自动关闭。',
        stataSetupSignalPathInvalid: 'saio 命令上报的 Stata 安装位置无法验证。',
        stataSetupSignalReceived: '已收到来自 Stata 的配置请求。',
        stataSetupServiceUnavailable: 'Stata 配置服务无法启动，端口 16886–16895 均不可用。',
        saioCommandUnavailableInVscode: '无需在 VS Code 中运行 saio。该命令仅用于自动探测失败后，在 VS Code 外部打开的 Stata 中完成配置。',
        stataSetupWindowsExeRequired: '请选择 Stata 的 .exe 可执行文件。',
        stataSetupWindowsExeInvalid: '请选择 Stata 可执行文件，例如 StataMP-64.exe。',
        stataSetupWindowsExeNotFound: '指定的 Stata 可执行文件不存在或不是文件。',
        stataSetupInstallationMissing: '未找到可用的 Stata 安装。在安装 Stata 或完成安装位置配置前，Stata All in One 无法运行 Stata 代码。',
        stataSetupReconfigure: '重新配置',
        stataSetupConfirm: '确认',
        stataSetupSwitchExternal: '切换到外部 Stata 软件运行',
        stataSetupConfirmSwitchExternal: '确认并切换到外部 Stata 软件运行',
        stataSetupUseEmbedded: '切换到内置 Stata 控制台',
        stataSetupKeepExternal: '继续使用外部 Stata 软件',
        stataSetupPurchaseGenuine: '采购或使用正版Stata',
        stataSetupGenuineInfo: '中国大陆用户可以联系 Stata Corp, LLC 官方授权经销商北京友万信息科技有限公司（友万科技）采购正版软件或申请试用。\n\nhttp://xhslink.com/o/QYWdYfrEhy',
        stataSetupVisitDealer: '联系友万科技',
        stataSetupSuccess: ({ stataPath }) => `已在 ${stataPath} 找到 Stata，并成功初始化内置 Stata 控制台。现在可以直接在 VS Code 中查看 Stata 输出，并使用数据查看器打开 .dta 文件。如果希望通过外部 Stata 软件运行代码，请选择“切换到外部 Stata 软件运行”。`,
        stataSetupSuccessExternalMode: ({ stataPath }) => `已在 ${stataPath} 找到 Stata，并成功初始化内置 Stata 控制台。当前正在使用外部 Stata 软件运行；你可以切换到内置 Stata 控制台，以便在 VS Code 中查看输出并使用数据查看器打开 .dta 文件。`,
        stataSetupConsoleFailure: ({ stataPath }) => `已找到 Stata：${stataPath}，但内置 Stata 控制台无法使用：`,
        stataSetupMissingDll: '未找到内置 Stata 控制台所需的 DLL。',
        stataSetupMissingDylib: '未找到内置 Stata 控制台所需的 dylib。',
        stataSetupMissingLicense: '未找到许可证文件 stata.lic。请支持正版Stata软件，以体验Stata All in One完整功能。',
        stataSetupNativeUnavailable: '无法加载内置 Stata 控制台所需的原生桥接模块。',
        stataSetupSessionFailed: ({ reason }) => `内置 Stata 控制台初始化失败${reason ? `：${reason}` : '。'}`,
        stataSetupExternalAvailable: '内置 Stata 控制台和数据查看器暂时不可用，但仍可通过外部 Stata 软件运行代码。',
        macVersionReset: '已重置 macOS 的 Stata 版本配置，下次启动会自动检测。',
        macOnlyCommand: '该命令仅适用于 macOS。',
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
        consoleLibraryMissingInSelected: ({ libraryName }) => `已选择的 Stata 安装中缺少 ${libraryName}。`,
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
            '提示：点击 AI 按钮可复制提示词，让 AI 工具安装扩展内置的原生 Stata AI Skill。',
            '提示：嵌入式控制台和原生 Stata AI Skill 都需要有效的 STATA.LIC 许可证文件。',
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
        graphFormatJpg: 'JPG',
        graphFormatJpgDescription: ({ dpi }) => `${dpi} DPI 白底位图`,
        graphSaveFailed: ({ message }) => `保存图形失败：${message}`,
        graphPanelUnavailable: '图形面板已不可用。',
        graphImageRequestTimeout: '图形图片转换超时。',
        graphImageConversionFailed: '无法转换图形图片。',
        graphInvalidImageData: '图形渲染器返回的图片数据无效。',
        graphPngRequestTimeout: '图形转换为 PNG 超时。',
        graphPngConversionFailed: '无法将图形转换为 PNG。',
        graphInvalidPngData: '图形渲染器返回的 PNG 数据无效。',
        graphOnlySvgCanConvert: 'Embedded Console 只能将 SVG 图形缓存转换为位图。',
        graphSvgEmpty: '图形 SVG 内容为空。',
        graphCanvasUnavailable: '当前环境无法使用 Canvas 渲染。',
        graphCanvasPngFailed: 'Canvas 生成 PNG 数据失败。',
        graphCanvasImageFailed: 'Canvas 生成图片数据失败。',
        graphSvgReadFailed: '无法从 webview 资源读取图形 SVG。',
        graphSvgLoadFailed: '浏览器无法加载图形 SVG 以转换为图片。',
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
        dataViewerOpenedNotice: ({ title }) => `已在“${title}”选项卡中打开。`,
        aiSkillDisabled: '使用前需要先在你的 AI 工具中安装扩展内置的原生 Stata AI Skill。',
        aiSkillSessionNotReady: '原生 Stata AI Skill 服务尚未就绪。请先在 AI 工具中安装内置 skill 并启动原生服务。',
        aiSkillServerFailed: '无法启动原生 Stata AI Skill 服务，请查看服务日志了解详情。',
        aiSkillServerStarted: (p) => `原生 Stata AI Skill 服务已启动：http://127.0.0.1:${p.port}`,
        aiSkillServerStopped: '原生 Stata AI Skill 服务已停止。',
        aiSkillServerNotRunning: '原生 Stata AI Skill 服务未运行。',
        aiSkillWelcomeTitle: '将 Stata AI Skill 安装到你的 AI 工具',
        aiSkillWelcomeIntro: 'Stata All in One 内置独立版原生 Stata AI Skill。它通过 Rust 二进制和 http://127.0.0.1:19522 本地服务运行。',
        aiSkillWelcomeHint: '点击「复制提示词」并粘贴到 Claude Code、Codex、Open Code、OpenClaw 或其他 AI 编程工具中，让 AI 工具从本扩展中安装或注册这个 skill。',
        aiSkillWelcomePrompt: '我已经安装了 Stata All in One。请安装并使用它内置的原生 Stata AI Skill，以便运行 Stata 代码：\n\n1. 找到已安装的扩展目录。在 ~/.vscode/extensions/ 或 ~/.vscode-insiders/extensions/ 下搜索匹配 *stata-all-in-one* 的文件夹；Windows 在 %USERPROFILE%\\.vscode\\extensions 下搜索。\n2. 打开 <扩展目录>/skill/SKILL.md，并把它作为权威的 skill 定义和运行指南。\n3. 按你的平台机制把 <扩展目录>/skill 安装或注册为 AI Agent skill，例如 skills 目录、rules 文件、connector config 或同类配置。skill 名称必须严格为 "stata-ai-skill"，不要改名。\n4. 按 SKILL.md 从 <扩展目录>/skill/bin 中解析当前平台的原生二进制。\n5. 如果服务离线，请在 skill 目录启动原生服务。默认端点是 http://127.0.0.1:19522。\n   - GET /status 检查就绪状态并返回配置诊断。\n   - POST /execute，body {"code":"..."} 运行内联 Stata 代码。\n   - POST /execute，body {"file":"...","cwd":"..."} 运行已有 .do 文件。\n6. 如果 /status 返回 needsConfiguration，请询问我 Stata 安装在哪里，并按照 SKILL.md 中的 config 命令配置原生服务。\n7. 使用 SKILL.md 中记录的 HTTP API。\n8. 如果你运行在容器、Dev Container、远程 shell 或沙箱中，要注意 127.0.0.1 可能指向沙箱而不是我的宿主机。请用短超时测试 /status；如果失败，请申请宿主机命令执行权限，或明确告诉我需要在宿主机终端运行哪条命令。',
        aiSkillToggleEnable: '安装 AI Skill',
        aiSkillToggleDisable: '安装 AI Skill',
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
        capabilityUnverifiedAI: '点击 AI 按钮复制原生 Stata AI Skill 安装提示词',
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
