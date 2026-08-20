# Changelog / 版本记录

All notable changes to the Stata All in One extension will be documented in this file.
本文件记录 Stata All in One 扩展的所有重要更改。

## 0.3.13 (2026-08-20)

- **Fixed**: Fixed the installation script used to configure Stata All in One from Stata by running the generated `installation.do` from its normalized absolute path when VS Code and Stata use different temporary directories.
- **修复**：改用规范化后的绝对路径运行生成的 `installation.do`，修复 VS Code 与 Stata 临时目录不一致时无法从 Stata 配置 Stata All in One 的问题。

## 0.3.12 (2026-08-16)

- **Fixed**: Preserved source blank lines and comment grouping in the Embedded Console, corrected slash-comment native echoes and spacing, and limited Result Preview to the comments and commands belonging to the current result.
- **Fixed**: Validated Data Viewer filter syntax before execution and preserved automatic column widths when filtering to a small number of variables.
- **Docs**: Added HTML, Markdown, and Jupyter Notebook export demos.
- **修复**：保留嵌入式控制台源码空行与注释分组，修正斜杠注释原生回显和命令间距，并将结果预览限制为当前结果对应的注释与命令。
- **修复**：执行前校验数据查看器筛选语法，并在筛选少量变量时保留自动列宽。
- **文档**：新增 HTML、Markdown 和 Jupyter Notebook 导出演示。

## 0.3.11 (2026-08-11)

- **Feat**: Upgraded autocomplete across the editor, Embedded Console, and Data Viewer with Unicode-aware fuzzy matching, Chinese pinyin and variable-label search, highlighted matches, adaptive performance safeguards, and the missing `label` command candidate.
- **Feat**: Added Stata varlist filtering to the Data Viewer variable table, including ranges, wildcards, `_all`, fuzzy suggestions, and protection against stale asynchronous results.
- **Feat**: Added reusable Floating Window previews for images and horizontally overflowing Console results, a collapsible Console command input, and shared hot-reloadable font sizing for the Console and Data Viewer.
- **Fixed**: Prevented whole-line selections from running the next line, secured macOS external execution against shell metacharacters, made temporary do-files unique and race-safe, and preserved Stata comment echoes without truncating URLs.
- **Improved**: Refined Console table styling and run previews, matched exported HTML favicons to the active theme, and refreshed bilingual documentation, purchase links, and the English feature image.
- **新增**：升级编辑器、嵌入式控制台和数据查看器的智能补全，支持 Unicode 模糊匹配、中文拼音与变量标签搜索、命中高亮、自适应性能保护，并补充缺失的 `label` 命令候选。
- **新增**：数据查看器变量表支持 Stata varlist 筛选，包括变量范围、通配符、`_all`、模糊提示及异步过期结果保护。
- **新增**：为图片和横向溢出的控制台结果提供可复用的 Floating Window 预览，并支持折叠控制台命令输入区及热更新控制台与数据查看器共用字号。
- **修复**：避免整行选区误运行下一行；增强 macOS 外部执行的 Shell 字符安全；使用唯一临时 do 文件避免并发冲突；保留 Stata 注释回显且不再截断 URL。
- **优化**：改进控制台表格着色与运行预览，使导出 HTML 的标签图标匹配当前主题，并更新双语文档、购买链接及英文功能示例图。

## 0.3.10 (2026-08-06)

- **Feat**: Added light- and dark-theme-aware tab icons for editor title actions, the Embedded Console, the Data Viewer, and exported HTML reports.
- **Fixed**: Preserved Stata thread affinity on macOS to prevent Embedded Console crashes during complex prediction workflows, and updated the universal2 native bridge.
- **Fixed**: Prevented numbers inside Console output paths from being highlighted as numeric values and made run navigation follow the latest input cell entering the visible output area.
- **Build**: Rebuilt the Windows native bridge from the shared source and corrected the PowerShell build script to locate node-gyp's actual output filename.
- **新增**：为编辑器标题栏操作、嵌入式控制台、数据查看器及导出的 HTML 报告新增明暗主题自适应标签图标。
- **修复**：保持 macOS 上 Stata 初始化与执行的线程亲和性，避免复杂预测流程导致嵌入式控制台崩溃，并更新 universal2 原生桥接器。
- **修复**：避免控制台输出路径中的数字被误判为数值高亮，并使运行导航跟随最新进入可视区域的输入单元。
- **构建**：基于共享源码重新编译 Windows 原生桥接器，并修正 PowerShell 构建脚本对 node-gyp 实际产物文件名的查找。

## 0.3.9 (2026-07-29)

- **Feat**: Added staged transitions from text to theme-aware icons for the editor title actions to save title-bar space, with click-to-reveal controls for Bug Report, sponsorship, and Stata AI Skill.
- **Fixed**: Fixed the Data Viewer failing to refresh after code is run from the editor on macOS and Windows; revisiting the existing viewer now refreshes the data while preserving its viewport.
- **Fixed**: Bottom-right information, warning, error, and Update Notice messages now stay expanded when no custom action is provided.
- **新增**：编辑器标题栏操作按钮支持从文字分阶段切换为主题适配图标，以节省标题栏空间，并可点击重新展开反馈、打赏和 Stata AI Skill 按钮。
- **修复**：修复 macOS 和 Windows 编辑器运行后无法刷新数据查看器的问题；再次打开现有查看器时会刷新数据并保留视口。
- **修复**：无自定义操作项的右下角信息、警告、错误及 Update Notice 现在会保持展开。

## 0.3.8 (2026-07-28)

- **Feat**: Added context-aware Stata editor menus and redesigned Embedded Console runs with collapsible input cells, grouped command and result output, hidden temporary do-file wrappers, right-side navigation, a jump-to-bottom button, and themed scrollbars. Long navigation lists now scroll with fade cues and keep the active run visible, while commands wrap at syntax boundaries and preserve multi-line block-comment highlighting.
- **Fixed**: Improved clickable result paths for Chinese, multi-line, repeated, and context-free filenames; kept large output responsive; made Stop and Esc able to rebuild an unresponsive Stata session; and stabilized timing, temporary do-file echoes, `cd` comments, and shortcut hints.
- **Improved**: Preserved complete Console history across exports and aligned HTML, Markdown, and Notebook command grouping; exported HTML now matches the interactive layout with code previews, continuous navigation, aligned numbering, and horizontal-scroll cues.
- **Improved**: Added on-demand Data Viewer refresh with stale-cache protection and viewport preservation, while filtered `br` / `browse` commands reuse the current tab and reset to the new result origin.
- **新增**：新增情境感知的 Stata 编辑器右键菜单，并重构嵌入式控制台运行界面，提供可折叠输入单元、命令与结果分组、临时 do 文件包装隐藏、右侧导航、“跳转到底部”及主题滚动条；长导航列表支持内部滚动、渐隐提示及当前项自动可见，命令可按语法边界自然换行并保持多行块注释高亮。
- **修复**：增强中文、跨行、重复及无提示词文件路径的点击跳转；保持大输出流畅；Stop 和 Esc 可重建无响应的 Stata 会话；同时修复计时、临时 do 文件回显、`cd` 注释及快捷键提示问题。
- **优化**：导出时保留完整控制台历史，统一 HTML、Markdown 和 Notebook 的命令分组；HTML 现与交互界面对齐，并提供代码预览、连续导航、编号对齐及横向滚动提示。
- **优化**：数据查看器支持按需刷新、过期缓存保护和视口位置恢复；带条件的 `br` / `browse` 会复用当前页签并从新结果起点显示。

## 0.3.7 (2026-07-24)

- **Fixed**: Recognized standalone, quoted, and explicit relative file paths in Embedded Console results, including filenames emitted by commands such as `outreg2`, while avoiding ordinary-text false positives.
- **Fixed**: Removed the duplicate `Stata All in One` prefix from Update Notice messages for current and historical versions.
- **修复**：识别 Embedded Console 结果中独占一行、带引号及显式相对路径的文件名，包括 `outreg2` 等命令输出的独立文件路径，同时避免普通文本误判。
- **修复**：移除当前及历史版本 Update Notice 中重复的 `Stata All in One` 前缀。

## 0.3.6 (2026-07-24)

- **Feat**: Added clickable file paths to Embedded Console results, with working-directory-aware resolution and appropriate routing to Data Viewer, VS Code previews, or system-default applications on macOS and Windows.
- **Improved**: Enhanced Data Viewer metadata, adaptive column sizing, long-text tooltips, double-click copy, and double-click column auto-fit interactions.
- **Fixed**: Restarted the Stata session when clearing Console, preserved graph output order, limited file links to result output, and corrected quoted file-path highlighting and first-click file opening.
- **新增**：Embedded Console 结果中的文件路径现可点击打开，支持根据 Stata 工作目录解析路径，并在 macOS 和 Windows 上按文件类型调用数据查看器、VS Code 预览或系统默认应用。
- **优化**：改进数据查看器元数据、自适应列宽、长文本悬浮提示、双击复制及双击列分隔线自动调整列宽功能。
- **修复**：清空 Console 时同步重启 Stata Session，保持图形输出顺序，将文件链接限定于结果输出，并修复引号路径高亮及文件首次点击打开问题。

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
