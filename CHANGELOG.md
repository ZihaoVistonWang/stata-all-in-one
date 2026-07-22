# Changelog / 版本记录

All notable changes to the Stata All in One extension will be documented in this file.
本文件记录 Stata All in One 扩展的所有重要更改。

## 0.3.5 (2026-07-22)

- **Improved**: Moved Stata AI Skill to online installation and removed its bundled multi-platform binaries to significantly reduce the extension package size; the AI button now provides bilingual Gitee and GitHub installation links.
- **Fixed**: Normalized Tab characters outside quoted strings before native Embedded Console execution, fixing commands that Stata could not recognize while preserving literal Tabs inside strings.
- **Docs**: Documented the default online Console fonts for Western and Chinese text.
- **优化**：Stata AI Skill 改为在线安装并移除内置的多平台二进制，显著减小扩展安装包体积；AI 按钮现提供包含 Gitee 和 GitHub 地址的双语安装提示词。
- **修复**：在 Embedded Console 原生执行前将字符串外的 Tab 制表符转换为空格，修复 Stata 无法识别相关命令的问题，同时保留字符串内的原始 Tab。
- **文档**：补充 Console 中英文文本默认在线字体说明。

## 0.3.4 (2026-07-22)

- **Feat**: Rebuilt Data Viewer with direct local `.dta` parsing and in-memory Console data access, supporting multiple file formats, paged loading, Stata-style filtering, labels, formats, Chinese text, and missing values without temporary data exports.
- **Improved**: Isolated external files, current Console data, and `br` / `browse` snapshots, while preventing conflicting actions during Stata execution so each viewer keeps the correct dataset state.
- **Fixed**: Improved native stability on macOS and Windows, including dedicated-thread execution for Windows, locale-compatible metadata parsing, and updated cross-platform data-reader plugins and bridges.
- **新增**：重构数据查看器，支持本地直读多版本 `.dta` 与 Console 内存数据，提供分页加载、Stata 风格筛选，并保留标签、格式、中文文本和缺失值，不再导出临时数据。
- **优化**：隔离外部文件、Console 当前数据与 `br` / `browse` 快照，并在 Stata 运行期间阻止冲突操作，确保各查看器保留正确的数据状态。
- **修复**：提升 macOS 和 Windows 原生组件稳定性，包括 Windows 专用线程执行、本地化元数据兼容，以及跨平台数据读取插件与原生桥更新。

## 0.3.3 (2026-07-21)

- **Improved**: Improved Embedded Console command compatibility with bilingual guidance for unsupported Stata GUI commands while preserving built-in Data Viewer routing for `br` and `browse`.
- **Fixed**: Routed `br` and `browse` correctly within multi-line code, preserved the execution order of surrounding Stata code, and reported total execution time only once.
- **Fixed**: Rendered `which` command results as plain text so paths, versions, and dates are no longer incorrectly highlighted as numbers, while preserving error styling.
- **Fixed**: Aligned the Sponsor button setting description with its default enabled behavior.
- **Docs**: Refreshed and standardized bilingual README badges, feature descriptions, requirements, acknowledgements, and formatting.
- **优化**：改进 Embedded Console 命令兼容性，为不支持的 Stata GUI 命令提供双语提示，同时保留 `br` 和 `browse` 到内置数据查看器的路由。
- **修复**：正确路由多行代码中的 `br` 和 `browse`，保持前后 Stata 代码的执行顺序，并仅在全部代码完成后显示一次总耗时。
- **修复**：将 `which` 命令结果显示为普通文本，避免路径、版本号和日期被错误识别为数值高亮，同时保留错误样式。
- **修复**：使打赏按钮设置说明与默认开启行为保持一致。
- **文档**：更新并统一中英文 README 的徽章、功能说明、使用要求、致谢和格式。

## 0.3.2 (2026-07-17)

- **Improved**: Refined Stata auto-discovery, version selection, and guided setup during extension initialization, with the `saio` command available for manual Stata configuration.
- **Feat**: Added Embedded Console export to HTML, Markdown, and nbstata-compatible IPYNB, with navigation, themes, syntax highlighting, and embedded graphs.
- **Feat**: Routed `br` and `browse` to the built-in Data Viewer with `varlist`, `if`, `in`, and `nolabel` support.
- **Improved**: Made editor and Console autocomplete context-aware, showing only variables where variable input is expected.
- **Improved**: Refined Console and Data Viewer tab restoration and added an independent Sponsor button setting.
- **Improved**: Updated the bundled Stata AI Skill to v1.1.
- **优化**：优化拓展初始化阶段 Stata 自动探测、版本选择和引导配置等方案，并提供手动配置 Stata 的 `saio` 命令。
- **新增**：内置 Console 支持导出 HTML、Markdown 和兼容 nbstata 的 IPYNB，并提供导航、主题、语法高亮和图形内嵌。
- **新增**：将 `br` 和 `browse` 路由到内置数据查看器，支持 `varlist`、`if`、`in` 和 `nolabel`。
- **优化**：编辑器和 Console 根据 Stata 语法上下文筛选补全建议，例如需要显示变量的位置就只显示变量。
- **优化**：改进 Console 和数据查看器的标签页恢复逻辑，并新增独立的打赏按钮开关。
- **优化**：内置 Stata AI Skill 更新至 v1.1。

## 0.3.1 (2026-07-13)

- **Feat**: Added automatic Stata installation discovery at startup when the platform configuration is empty. Windows queries the HKLM/HKCU 32-bit and 64-bit uninstall registries, while macOS scans Stata apps under `/Applications`, with a three-second timeout and no full-disk scan.
- **Feat**: When multiple installations are found, the extension selects the highest numeric Stata version first, then prefers MP, SE, BE, IC, and unknown editions within the same version.
- **Feat**: Added a guided startup initializer that validates the Windows EXE or exact macOS app, Console DLL/dylib, `stata.lic`, and native Console session before reporting the result in a branded central modal dialog.
- **Improved**: Successful initialization enables the Embedded Console and Data Viewer immediately, with an option to use the external Stata application. Failed Console initialization clearly reports all detected issues and switches to external Stata after explicit confirmation.
- **Improved**: Added validated manual fallback for undiscovered installations, shared concurrent initialization, state-aware one-time notices, and Debug commands for repeating automatic discovery and setup validation tests.
- **新增**：当对应平台配置为空时，扩展会在启动时自动探测 Stata 安装。Windows 查询 HKLM/HKCU 的 32 位和 64 位卸载注册表，macOS 扫描 `/Applications` 下的 Stata App，最长等待 3 秒且不扫描全盘。
- **新增**：发现多个安装时，优先选择数字版本最高的 Stata；同版本内按 MP、SE、BE、IC 和未知 Edition 排序。
- **新增**：新增引导式启动初始化，验证 Windows EXE 或准确的 macOS App、Console DLL/dylib、`stata.lic` 和原生 Console 会话，并通过带有 Stata All in One 标题的中心模态弹窗汇报结果。
- **优化**：初始化成功后可立即使用内置 Console 和数据查看器，并可选择改用外部 Stata；Console 初始化失败时会集中说明所有问题，并在用户明确确认后切换至外部 Stata。
- **优化**：新增经验证的手动配置回退、并发初始化复用、按安装状态只提示一次，并保留可重复测试自动探测和配置验证的 Debug 命令。

## 0.3.0 (2026-07-06)

> Stable release after the 0.2.14-0.2.19 preview series.
>
> 这是 0.2.14-0.2.19 预览版系列后的正式版本。

- **Fixed**: Fixed known issues from the preview releases.
- **修复**：修复预览版中的已知问题。

## 0.2.19-0.2.14 (2026-06-18)

> Historical preview series with significant new features and improvements.
>
> 历史预览版系列，包含重要新功能和改进。

- **Feat (Experimental)**: AI Skill — bundle the standalone native `stata-ai-skill` so AI coding tools (Claude Code, Cursor, Codex CLI, Open Code, OpenClaw, etc.) can run Stata through a Rust background service at `http://127.0.0.1:19522`. The `AI` toolbar button copies an installation prompt for AI agents.
- **Feat**: Packaged native AI Skill binaries and `SKILL.md` runtime guide are included under the extension `skill/` directory for agent installation.
- **Feat**: Major refactor to support embedded console feature, with native code execution on both macOS and Windows
- **Feat**: New Data Viewer panel for browsing .dta files directly and Console in VS Code
- **Feat**: Graph Support in embedded console, with export and clipboard copy functionality
- **Feat**：Variable name auto-completion based on current dataset, available in both editor and console after running code once
- **Feat**: Hover help for Stata commands with improved SMCL rendering and filtering
- **Feat**：Setting button in editor title bar for quick access
- **Feat**: Customizable font for embedded console, with options to follow editor font, system monospace font, or a user-specified custom font
- **Fixed**: Stata COM automation on Windows now impoves performance compared to previous PowerShell-based implementation
- **Fixed**: Highlighting of options in code, e.g., `absorb(...) vce(...)` in `reghdfe` command
- **新增**：AI Skill —— 内置独立版原生 `stata-ai-skill`，让 Claude Code、Cursor、Codex CLI、Open Code、OpenClaw 等 AI 编程工具通过 `http://127.0.0.1:19522` 的 Rust 后台服务运行 Stata。编辑器工具栏的 `AI` 按钮可复制 AI Agent 安装提示词。
- **新增**：扩展 `skill/` 目录随包提供原生 AI Skill 二进制和 `SKILL.md` 运行指南，供 agent 安装或注册。
- **新增**：重大重构以支持嵌入式控制台功能，在 macOS 和 Windows 上实现原生代码执行
- **新增**：全新的数据查看器面板，可直接在 VS Code 中浏览 .dta 文件，并在控制台中显示输出
- **新增**：嵌入式控制台的作图显示支持，提供导出和复制到剪贴板功能
- **新增**：基于当前数据集的变量名自动补全功能，在编辑器和控制台中运行代码一次后可用
- **新增**：Stata 命令的悬停帮助，改进 SMCL 渲染效果并过滤非实用命令
- **新增**：编辑器标题栏的设置按钮，提供快速访问配置项的入口
- **新增**：嵌入式控制台的字体可配置，支持跟随编辑器字体、系统等宽字体或用户指定的自定义字体选项
- **修复**：Windows 上的 Stata COM 自动化相比之前基于 PowerShell 的实现性能得到提升
- **修复**：代码中选项的高亮显示，例如 `reghdfe` 命令中的 `absorb(...) vce(...)` 等选项现在正确高亮显示


## 0.2.13 (2026-03-12)

- **Fixed**: On Windows, running code no longer resets a snapped or maximized Stata window to a smaller size, it will now keep the current window size unchanged
- **修复**：Windows 下运行代码时，不再把已贴靠或最大化 的 Stata 窗口还原成更小的普通窗口，现会保持 Stata 当前窗口大小不变

## 0.2.12 (2026-03-05)

- **Refactor**: Execution code logic on Windows system;
- **Feat**: Windows configuration `closeStataOtherWindowsBeforeSendingCode` to control whether other Stata windows (Viewer/Data Editor) are closed before sending code
- **Feat**: Configuration `showActionButtons` to toggle display of "Bug report" and "Sponsor" buttons in the editor title bar
- **重构**：Windows 端的执行代码逻辑；
- **新增**：Windows 可配置发送代码前是否关闭 Viewer、数据编辑器等辅助窗口
- **新增**：配置是否在编辑器标题栏显示"Bug 反馈"和"打赏支持"按钮

## 0.2.11 (2026-03-02)

- **Feat**: Auto `cd` to do file directory on first Stata launch (disabled by default)
- **新增**：Stata 首次启动时自动 `cd` 到 do 文件所在目录（默认关闭）

## 0.2.10 (2026-02-27)

- **Refined**: Code execution logic - Section execution, Line execution, Selection execution with fuzzy selection
- **Feat**: Configurable run shortcut (`cmd/ctrl+d` or `cmd/ctrl+shift+d`)
- **Feat**: F2 rename support for variables with smart validation
- **优化**：代码运行逻辑 - 章节运行、单行运行、选中运行（支持模糊选中）
- **新增**：运行快捷键可选配置（`cmd/ctrl+d` 或 `cmd/ctrl+shift+d`）
- **新增**：F2 变量重命名功能，支持智能验证

## 0.2.9 (2026-02-23)

- **Fixed**: Custom command highlighting in comments - now correctly displays as gray when commented out
- **修复**：自定义命令在注释中仍显示高亮的问题，现在被注释的自定义命令正确显示为灰色

## 0.2.8 (2026-02-03)

- **Fixed**: Known issues about numbering
- **修复**：标题序号的已知问题

## 0.2.7 (2026-01-30)

- **Improved**: macOS runner switched to asynchronous AppleScript (DoCommandAsync) for faster startup and execution
- **Feat**: Outline support for `program define ... end` blocks, listing program names under current section
- **优化**：macOS 执行代码改为异步 AppleScript 调用（DoCommandAsync），提升启动与执行响应
- **新增**：大纲支持识别 `program define ... end` 块，在当前 section 下显示程序名

## 0.2.6 (2026-01-30)

- **Feat**: macOS Stata auto-detection (Stata 19+)
- **Feat**: Separator symmetric setting with bulk update command
- **Changed**: Help shortcut to `Ctrl/Cmd+Shift+H`
- **新增**：macOS 版 Stata 自动检测（支持 Stata 19+）
- **新增**：分隔线"对称"配置与批量更新命令
- **调整**：帮助快捷键改为 `Ctrl/Cmd+Shift+H`

## 0.2.5 (2026-01-28)

- **Feat**: Smart line break feature (`Shift+Enter`) with auto-indentation
- **新增**：智能换行功能（`Shift+Enter`），支持 Stata 代码自动缩进

## 0.2.4 (2026-01-28)

- **Feat**: Stata help functionality
- **Fixed**: Known issues
- **新增**：Stata 帮助功能
- **修复**：其他已知问题

## 0.2.3 (2026-01-27)

- **Integrated**: Stata Enhanced syntax highlighting
- **Feat**: Migration prompt and auto-migrated settings from Stata Outline
- **集成**：Stata Enhanced 语法高亮
- **新增**：来自 Stata Outline 的迁移提示与自动迁移设置

## 0.2.2 (2026-01-27)

- **Feat**: Windows native support for executing Stata code
- **新增**：Windows 原生支持运行 Stata 代码

## 0.2.0-0.2.1 (2026-01-25)

- **Feat**: macOS native support for executing Stata code
- **Feat**: New divider line commands and shortcuts
- **新增**：macOS 原生支持运行代码
- **新增**：分隔线命令与快捷键

## 0.1.9 (2026-01-24)

- **Feat**: Outline follows cursor, highlighting corresponding sections in real-time
- **新增**：大纲自动跟随光标，实时高亮相应章节

## 0.1.7-0.1.8 (2026-01-22)

- **Feat**: Toggle comments functionality with customizable comment styles
- **新增**：切换注释功能，支持自定义注释样式

## 0.1.5-0.1.6 (2026-01-12)

- **Feat**: "Run Current Section" feature
- **新增**："运行当前节"功能

## 0.1.4 (2026-01-12)

- **Feat**: Multi-level numbering display and auto-update file content
- **新增**：多级序号显示与自动文件更新功能

## 0.1.3 (2025-12-30)

- **Fixed**: Display issue with `**#` without spaces
- **修复**：`**#` 无空格时无法显示的问题

## 0.1.2 (2025-12-26)

- **Feat**: Keyboard shortcut functionality
- **新增**：快捷键功能

## 0.1.0-0.1.1 (2025-12-25)

- Initial release matching Stata bookmark style
- 初始版本，匹配 Stata 书签风格
