# Changelog / 版本记录

All notable changes to the Stata All in One extension will be documented in this file.
本文件记录 Stata All in One 扩展的所有重要更改。

## 0.2.12 (2026-03-05)
- **New**: Windows configuration `closeStataOtherWindowsBeforeSendingCode` to control whether helper windows (Viewer/Data Editor) are closed before sending code
- **New**: Configuration `showActionButtons` to toggle display of "Bug report" and "Sponsor" buttons in the editor title bar
- **新增**：Windows 可配置发送代码前是否关闭 Viewer、数据编辑器等辅助窗口
- **新增**：配置是否在编辑器标题栏显示"Bug 反馈"和"打赏支持"按钮

## 0.2.11 (2026-03-02)
- **New**: Auto `cd` to do file directory on first Stata launch (disabled by default)
- **新增**：Stata 首次启动时自动 `cd` 到 do 文件所在目录（默认关闭）

## 0.2.10 (2026-02-27)
- **Refined**: Code execution logic - Section execution, Line execution, Selection execution with fuzzy selection
- **Added**: Configurable run shortcut (`cmd/ctrl+d` or `cmd/ctrl+shift+d`)
- **Added**: F2 rename support for variables with smart validation
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
- **Added**: Outline support for `program define ... end` blocks, listing program names under current section
- **优化**：macOS 执行代码改为异步 AppleScript 调用（DoCommandAsync），提升启动与执行响应
- **新增**：大纲支持识别 `program define ... end` 块，在当前 section 下显示程序名

## 0.2.6 (2026-01-30)
- **Added**: macOS Stata auto-detection (Stata 19+)
- **Added**: Separator symmetric setting with bulk update command
- **Changed**: Help shortcut to `Ctrl/Cmd+Shift+H`
- **新增**：macOS 版 Stata 自动检测（支持 Stata 19+）
- **新增**：分隔线"对称"配置与批量更新命令
- **调整**：帮助快捷键改为 `Ctrl/Cmd+Shift+H`

## 0.2.5 (2026-01-28)
- **Added**: Smart line break feature (`Shift+Enter`) with auto-indentation
- **新增**：智能换行功能（`Shift+Enter`），支持 Stata 代码自动缩进

## 0.2.4 (2026-01-28)
- **Added**: Stata help functionality
- **Fixed**: Known issues
- **新增**：Stata 帮助功能
- **修复**：其他已知问题

## 0.2.3 (2026-01-27)
- **Integrated**: Stata Enhanced syntax highlighting
- **Added**: Migration prompt and auto-migrated settings from Stata Outline
- **集成**：Stata Enhanced 语法高亮
- **新增**：来自 Stata Outline 的迁移提示与自动迁移设置

## 0.2.2 (2026-01-27)
- **Added**: Windows native support for executing Stata code
- **新增**：Windows 原生支持运行 Stata 代码

## 0.2.0-0.2.1 (2026-01-25)
- **Added**: macOS native support for executing Stata code
- **Added**: New divider line commands and shortcuts
- **新增**：macOS 原生支持运行代码
- **新增**：分隔线命令与快捷键

## 0.1.9 (2026-01-24)
- **Added**: Outline follows cursor, highlighting corresponding sections in real-time
- **新增**：大纲自动跟随光标，实时高亮相应章节

## 0.1.7-0.1.8 (2026-01-22)
- **Added**: Toggle comments functionality with customizable comment styles
- **新增**：切换注释功能，支持自定义注释样式

## 0.1.5-0.1.6 (2026-01-12)
- **Added**: "Run Current Section" feature
- **新增**："运行当前节"功能

## 0.1.4 (2026-01-12)
- **Added**: Multi-level numbering display and auto-update file content
- **新增**：多级序号显示与自动文件更新功能

## 0.1.3 (2025-12-30)
- **Fixed**: Display issue with `**#` without spaces
- **修复**：`**#` 无空格时无法显示的问题

## 0.1.2 (2025-12-26)
- **Added**: Keyboard shortcut functionality
- **新增**：快捷键功能

## 0.1.0-0.1.1 (2025-12-25)
- Initial release matching Stata bookmark style
- 初始版本，匹配 Stata 书签风格
