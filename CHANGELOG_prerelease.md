# Stata All in One v0.2.14/0.2.15 更新日志

> 从 v0.2.13 以来的变更汇总（约 110 个有效提交，新增约 18,000 行代码）

---

## 🎯 核心新功能

### 1. 嵌入式控制台 (Embedded Console) — macOS + Windows

这是本版本最大的变化。将原来依赖外部 Stata 窗口执行代码的模式，重构为 VS Code 内置 Webview 控制台，实现真正的 IDE 一体化体验。

**macOS 实现：**

- 基于 C++ 原生模块 (`stata_bridge`)，通过 `dlopen` 直接调用 Stata 动态库
- N-API 异步执行，支持实时输出流
- Webview 终端渲染器：将 ANSI 转义序列转换为样式化片段，基于 TextMate 语法高亮
- 支持在控制台中直接输入并执行 Stata 命令
- 控制台内命令自动补全
- 进度条 ETA 显示
- 可配置字体：跟随编辑器 / 系统等宽字体 / 自定义字体

**Windows 实现：**

- 基于 StataSO C API 的原生桥接 (`stata_bridge-win32.node`)
- 不支持原生桥接时自动回退到外部应用模式并弹出提示

**新增配置项：**

- `stata-all-in-one.runMode`: `embeddedConsole`（嵌入式控制台）| `externalApp`（外部应用）
- `stata-all-in-one.consoleFontMode`: `editor`（跟随编辑器）| `system`（系统等宽）| `custom`（自定义）
- `stata-all-in-one.consoleCustomFontFamily`：自定义控制台字体

### 2. 数据查看器 (Data Viewer)

全新的 Stata 数据集浏览面板，可直接在 VS Code 中查看 `.dta` 文件。

- 双击 `.dta` 文件即可在 Data Viewer 中打开
- 显示数据集概览（观测数、变量数）、变量元数据（名称、标签、类型）
- 数据行浏览，支持懒加载 + 虚拟滚动（行和列），轻松处理大数据集
- Stata 风格的列过滤筛选
- 在编辑器、控制台中统一变量名自动补全
- 主题颜色自动适配
- 中英文界面本地化

### 3. 图形支持 (Graph Support)

嵌入式控制台现在可以直接渲染 Stata 图形。

- 在控制台输出中直接显示图形
- 图形导出为 PNG（可配置 DPI，默认 600）
- 图形复制到剪贴板
- 图形全屏查看

### 4. Hover 悬停帮助

- 鼠标悬停在 Stata 命令上即可显示帮助信息
- SMCL 标记语言的渲染效果优化
- 自动过滤非实用命令（如 `#delimit`、`using` 等），仅对核心命令显示帮助

---

## 🔧 Windows 外部应用模式改进

### COM 自动化集成

在 Windows `externalApp` 模式下，使用 Stata Automation COM 接口替代原来的 PowerShell 模拟按键方案，显著提升执行速度和可靠性：

- 速度显著提升 — 移除 `stataStepDelayOnWindows` 配置项，直接硬编码优化后的延迟参数
- COM 断连自动重连（用户关闭 Stata 后自动重新初始化 COM 连接）
- 图形命令通过 COM 正确处理，支持保存选项
- 使用 `AttachThreadInput` + Alt 键技巧将 Stata 窗口强制置前

---

## 📝 语法高亮增强

- 支持逗号后选项列表的高亮
- 嵌套选项括号的高亮改进
- 函数名在命令选项参数高亮中的优先级提升
- 控制台内联注释颜色修复
- 控制台语法颜色与代码编辑器对齐

---

## 🌐 帮助索引增强

- 改进 Stata 帮助文件目录扫描逻辑
- 新增用户自定义 ADO 路径支持 (`stata-all-in-one.additionalAdoPaths`)

---

## 🎨 UI / UX 改进

- 编辑器标题栏新增 ⚙ 齿轮设置按钮，一键打开扩展设置
- 控制台 Webview 自定义 SVG 图标
- 控制台工具栏图标优化
- CLI 命名统一替换为 Console
- 控制台输入区可拖拽调整高度
- 命令标题本地化（中英文）
- Codicon 图标应用于控制台和 Data Viewer 自动补全列表

---

## 🧹 清理与维护

- 移除 Windows 升级通知（嵌入式控制台上线后不再需要）
- 移除临时参考文档
- 移除 hoverProvider 测试套件
- 移除 TODO.md
- `.gitignore` 中添加 CLAUDE.md 排除

---

## 📊 代码变更统计

| 指标 | 数值 |
| ---- | ---- |
| 有效提交数 | ~110 |
| 新增文件 | ~35 |
| 修改文件 | ~15 |
| 新增代码行 | ~18,000 |
| 删除代码行 | ~400 |

### 新增核心文件

```text
native/stata_bridge/              # C++ 原生模块 (macOS)
scripts/build-native.sh           # macOS 原生编译脚本
scripts/build-native.ps1          # Windows 原生编译脚本
src/modules/runCode/embeddedConsole/
  ├── panel.js                    # Webview 面板
  ├── renderer.js                 # ANSI → 样式化片段渲染器
  ├── textmateTokenizer.js        # TextMate 语法高亮
  ├── session.js                  # 控制台会话管理
  ├── mac.js                      # macOS 运行时
  ├── windows.js                  # Windows 运行时
  ├── graphs.js                   # 图形支持
  ├── native/stata_session.js     # 原生 Stata 会话
  └── dataViewer/
      ├── panel.js                # Data Viewer 面板
      ├── provider.js             # 数据提供
      └── dtaEditor.js            # .dta 编辑器
src/modules/runCode/execute/      # 执行调度
src/modules/runCode/externalApp/  # 外部应用模式 (含 COM)
src/modules/hoverProvider.js      # Hover 帮助
src/modules/variableSuggestionService.js  # 统一变量补全
src/utils/consoleFonts.js         # 控制台字体管理
```

---

报告生成时间: 2026-05-30
