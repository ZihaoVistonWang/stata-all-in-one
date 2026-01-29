<!-- markdownlint-disable MD001 MD041 MD033 MD029 MD060 MD038 MD032 MD007 -->

<p align="center">
   <img src="img/icon-wide.png" alt="Stata All in One Icon" style="width:300px;" />
</p>

<h1 align="center">
Stata All in One
</h1>

<p align="center">
   一个为 Stata 用户量身打造的 <b>VS Code</b> 扩展
</p>

<p align="center">
  | <b>版本:</b><a href="https://github.com/ZihaoVistonWang/stata-all-in-one/releases"> 0.2.6</a> | <b>作者:</b> <a href="https://zihaowang.cn">王梓豪</a> | <b>翻译:</b>
  <a href="README.md">English Version</a> |
</p>

---

<h3 align="center">一站式 Stata 体验：</br>语法高亮 + 代码提示 + 智能大纲 + 运行代码 + 快捷编辑，<b>All in One</b>!</h3>

<p align="center">Stata All in One 源自 <a href="https://github.com/ZihaoVistonWang/stata-outline">Stata Outline</a>，进行了功能扩展和改进。</p>

---

## 功能概览

<p align="center">
   <img src="img/example-marked.png" alt="An example of Stata All in One Icon"/>
</p>

### 1. 增强语法高亮与代码提示

- **完整语法高亮和代码提示支持**：集成 [Stata Enhanced](https://github.com/kylebarron/language-stata) 语法引擎[^1]，为 `.do` 文件提供精确的语法高亮和代码提示（遵循MIT许可）。
- **自定义命令高亮**：支持为用户常用的第三方命令（如 `reghdfe`、`ivreghdfe`、`gtools` 等）添加关键字高亮，可在设置中自由配置。

[^1]: [Stata Enhanced](https://github.com/kylebarron/language-stata) 语法引擎由 Kyle Barron 开发，提供了对 Stata 语言的全面支持。本拓展遵循 MIT 许可协议，感谢 Kyle Barron 的贡献！

### 2. 智能大纲与结构导航

- **多级大纲识别**：自动识别 `**#` 至 `**######` 格式的注释行，最高支持 *6 级层级标题*。
  - **快捷键**：`Ctrl/Cmd + 1-6` 快速转换对应等级标题，`Ctrl/Cmd + 0` 恢复为普通代码行。
- **光标自动跟随**：编辑器光标移动时，大纲视图将自动高亮并跳转至对应章节。
  - *设置方法：点击大纲右上角 `···` 按钮，勾选「跟随光标」。*[^2]
- **多级逻辑序号**：支持在大纲中显示 `1.1`、`1.2.1` 等格式的序号（需在设置中开启）。
- **自动同步序号**：插件会根据大纲结构自动在 `.do` 文件中插入或删除序号（需在设置中开启）。

[^2]: 抱歉～此为VS Code的GUI设置，我无法通过插件控制它。

### 3. 代码运行 (Stata 交互)

- **平台支持**：无需额外扩展即可与 **macOS** 和 **Windows** 上的 Stata 无缝集成。
- **多场景执行策略**：
  - **智能运行当前章节代码**：当**未选中**任何代码时，点击编辑器标题栏或大纲视图顶部的 ▶️ 按钮 或 按 `Ctrl/Cmd + D` 将自动识别当前章节范围，执行从当前标题起始至下一个同级（或高级别）标题前的所有代码。
  - **精准选中运行**：按 `Ctrl/Cmd + D` 执行选中的代码块。支持**模糊选中**，即使未完全覆盖整行字符，插件也会自动匹配并执行所选的完整行。
- **⚠️ 注意**
  - Windows 系统下运行代码依赖 PowerShell 脚本自动化，如果电脑较慢或偶发漏键时可适当调大步骤延迟（设置项 `stata-all-in-one.stataStepDelayOnWindows`）。

### 4. 高效分隔线与样式

- **快速插入**：支持多种符号，显著提升代码的可读性。
  - **标准分隔符**：通过 `Ctrl/Cmd + [符号]` 快速插入分隔线：
    - `Ctrl/Cmd + -` (短横线) | `Ctrl/Cmd + =` (等号) | `Ctrl/Cmd + Shift + 8` (星号)
  - **自定义分隔符**：
    - `Ctrl + Alt + S` (Windows) | `Ctrl + Cmd + S` (macOS)，此处 **S** 代表 "**S**eparator"（分隔符）。
    - 按下快捷键后，输入你想要的字符即可生成对应的分隔线。
- **智能包裹模式**：
  - **空行插入**：生成完整宽度的分隔线（长度可在设置中调整）。
  - **非空行插入**：初次按快捷键在行上方插入，再次按键则在下方插入，实现“包裹”效果。
  - **标题修饰**：选中标题的若干字符按快捷键，将生成带有平衡装饰符的标题（例如：`**# === 标题内容 ===`），且不影响大纲识别。
    - 标题居中：如果使用 **标题修饰** + **自定义*空格*分隔符**，则标题内容将自动居中显示。

### 5. 更多精彩

1. 注释增强
   - **一键切换**：使用 `Ctrl/Cmd + /` 快速切换行注释状态。
   - **可选样式**：默认使用 `//`，支持在设置中更改为其他合法注释符。

2. 内置帮助（Stata Help）

   - **快捷帮助**：例如：选中 `regress`，按下快捷键`Ctrl/Cmd + Shift + H`，即可打开 Stata 的 `regress` 帮助页面。

<a id="line-break"></a>

3. 智能换行（Stata Line Break）
   - **一键换行**：使用 `Shift+Enter` 在光标位置插入 Stata 换行符 `///`。
   - **智能缩进**：自动缩进 4 个空格

---

## 快捷键

点击[这里](SHORTCUT.md)查看完整快捷键列表。

---

## 安装

### 扩展市场安装

1. 在 VS Code 扩展中搜索 "Stata All in One" 并安装。

### 手动安装

1. 从 [发布页面](https://github.com/ZihaoVistonWang/stata-all-in-one/releases) 下载 `stata-all-in-one-x.x.x.vsix`。
2. VS Code → 扩展面板 → `...` → `从 VSIX 安装...`。
3. 选择下载的文件完成安装。

---

## 配置

在 VS Code 设置中搜索 "Stata All in One"，配置以下选项：

### 语法高亮和代码提示

1. **自定义命令高亮** (`stata-all-in-one.customCommands`)

   - 自定义需要高亮的 Stata 命令（字符串数组），默认包含 `reghdfe`。
   - 示例：`["reghdfe", "ivreghdfe", "gtools", "winsor2", "outreg2"]`
   - **配置后需要重载窗口生效**。

### 大纲与导航

2. **显示多级序号** (`stata-all-in-one.numberingShow`)

   - `true`：大纲显示 `1.1`、`1.2.1` 等序号。
   - `false`（默认）：显示原始标题。
3. **自动添加标题序号** (`stata-all-in-one.numberingAdd`)

   - `true`：**当启用序号时**，自动更新.do文件中的section标题以包含序号。
   - `false`（默认）：仅大纲显示序号，不修改文件。

### 代码运行

4. **显示运行按钮** (`stata-all-in-one.showRunButton`)

   - `true`（默认）：是否在编辑器标题栏显示运行按钮。
   - `false`：隐藏按钮。
5. **Stata 版本（macOS）** (`stata-all-in-one.stataVersionOnMacOS`)

   - **[macOS]** Stata 运行版本。可选择 `StataMP`、`StataIC`、`StataSE` 版本。
6. **Stata 路径（Windows）** (`stata-all-in-one.stataPathOnWindows`)

   - **[Windows]** Stata 执行文件路径（例如 `C:\Program Files\Stata17\StataMP-64.exe`）。
7. **步骤延迟（Windows）** (`stata-all-in-one.stataStepDelayOnWindows`)

   - **[Windows]** PowerShell 自动化每一步之间的延迟（毫秒）。默认：`100`（最小：`50`）。电脑较慢或偶发漏键时可适当调大。
8. **运行代码后激活 Stata 至前台** (`stata-all-in-one.activateStataWindow`)

   - `true`（默认）：运行代码后激活Stata窗口（将其带到前台）。
   - `false`：不激活 Stata 窗口。

### 代码风格

9. **注释样式** (`stata-all-in-one.commentStyle`)

   - `// `（默认）：用于切换注释的样式。选项包括 `//`、`*` 或 `/* ... */`
10. **分隔线长度** (`stata-all-in-one.separatorLength`)

   - 分割线所在行的字符总长度（包括前缀 '** #' 和分隔符）。默认值：`60`

<a id="separatorSymmetric"></a>

11. **分隔线对称性** (`stata-all-in-one.separatorSymmetric`)

   - `true`：在分割线末尾添加 ` **` 以保证视觉对称（例如 `** === 标题 === **`）。
   - `false`（默认）：分割线不添加末尾后缀。

> **注意**：修改设置后需重新打开 `.do` 文件生效。禁用 `numberingAdd` 时，文件中现有序号将被自动移除。

---

## 版本记录

| 版本        | 更新内容                                                                        | 发布日期   |
|-------------|---------------------------------------------------------------------------------|------------|
| 0.2.6       | macOS 版 Stata 自动检测（支持 Stata 19+）；新增分隔线“对称”配置与批量更新命令；帮助快捷键改为 Ctrl/Cmd+Shift+H | 2026-01-30 |
| 0.2.5       | 新增智能换行功能（Shift+Enter），支持 Stata 代码自动缩进和格式化                | 2026-01-28 |
| 0.2.4       | 添加了stata帮助功能；修复了一些已知问题                                         | 2026-01-28 |
| 0.2.3       | 集成 Stata Enhanced 语法高亮；添加迁移提示以及来自 Stata Outline 的自动迁移设置 | 2026-01-27 |
| 0.2.2       | Windows 原生支持运行 Stata 代码                                                 | 2026-01-27 |
| 0.2.0-0.2.1 | macOS 原生支持运行代码，无需额外依赖；新增分隔线命令与快捷键                    | 2026-01-25 |
| 0.1.9       | 大纲自动跟随光标，光标移动时实时高亮相应章节                                    | 2026-01-24 |
| 0.1.7-0.1.8 | 新增切换注释功能，支持自定义注释样式                                            | 2026-01-22 |
| 0.1.5-0.1.6 | 新增"运行当前节"功能                                                            | 2026-01-12 |
| 0.1.4       | 添加多级序号显示与自动文件更新功能                                              | 2026-01-12 |
| 0.1.3       | 修复 `**#` 无空格时无法显示的问题                                               | 2025-12-30 |
| 0.1.2       | 新增快捷键功能                                                                  | 2025-12-26 |
| 0.1.0-0.1.1 | 初始版本，匹配 Stata 书签风格                                                   | 2025-12-25 |
