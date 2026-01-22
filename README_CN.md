# Stata 大纲

**版本:** 0.1.7
**作者:** 王梓豪

[English Version / 英文版本](README.md)

---

## 功能概览

- **大纲支持**：自动识别 `**#` 格式的注释行作为层级标题，支持无限级嵌套。
- **快捷键**：`Ctrl/Cmd + 1-6` 转换为对应层级标题，`Ctrl/Cmd + 0` 转换为普通行。
- **多级序号**：可选在大纲中显示 `1.1`、`1.2.1` 等格式的序号（设置中切换）。
- **同步序号**：启用后自动在 `.do` 文件中添加/删除序号（需配合序号显示功能）。
- **运行当前节**：点击编辑器标题栏的"运行"按钮执行当前节代码（需安装 [stataRun 扩展](https://marketplace.visualstudio.com/items?itemName=yeaoh.statarun)）。
- **切换注释**：`Ctrl/Cmd + /` 在选中行上切换注释，支持自定义注释样式（在设置中配置）。

> ![fig](./example.png)
> *Stata `.do` 文件中的层级大纲视图（左侧：VS Code，右侧：Stata）*

---

## 安装

### 通过扩展市场安装

1. 在 VS Code 扩展中搜索 "Stata Outline" 并安装。
2. 打开任意 `.do` 文件，通过资源管理器 → 大纲查看层级结构。

### 手动安装

1. 从 [发布页面](https://github.com/ZihaoVistonWang/stata-outline/releases) 下载 `stata-outline-x.x.x.vsix`。
2. VS Code → 扩展面板 → `...` → `从 VSIX 安装...`。
3. 选择下载的文件完成安装。
4. 打开 `.do` 文件并查看大纲面板。

---

## 配置

在 VS Code 设置中搜索 "Stata Outline"，配置以下选项：

1. **显示多级序号** (`stata-outline.showNumbering`)

   - `true`：大纲显示 `1.1`、`1.2.1` 等序号。
   - `false`（默认）：显示原始标题。
2. **自动更新文件内容** (`stata-outline.updateFileContent`)

   - `true`：自动在 `.do` 文件中添加/删除序号（需启用序号显示）。
   - `false`（默认）：仅大纲显示序号，不修改文件。
3. **显示运行按钮** (`stata-outline.showRunButton`)

   - `true`（默认）：编辑器标题栏显示播放按钮。
   - `false`：隐藏按钮。
4. **注释样式** (`stata-outline.commentStyle`)

   - `// `（默认）：双斜杠行注释。
   - `* `：Stata 单行注释。
   - `/* ... */`：块状注释。

> **注意**：修改设置后需重新打开 `.do` 文件生效。禁用 `updateFileContent` 时，文件中现有序号将被自动移除。

---

## 使用示例

```stata
**# Data Processing
**## Cleaning
**### Remove duplicates
**# Model Estimation
***## Regression Analysis
```

- **启用序号** (`showNumbering: true`)：大纲显示 `1. Data Processing`、`1.1 Cleaning`、`1.1.1 Remove duplicates` 等。
- **禁用序号** (`showNumbering: false`)：
  大纲显示原始标题 `Data Processing`、`Cleaning` 等。

---

## 版本记录

| 版本        | 更新内容                                 | 发布日期   |
| ----------- | ---------------------------------------- | ---------- |
| 0.1.7-0.1.8 | 新增切换注释功能，支持自定义注释样式     | 2026-01-22 |
| 0.1.5-0.1.6 | 新增"运行当前节"功能（需 stataRun 扩展） | 2026-01-12 |
| 0.1.4       | 添加多级序号显示与自动文件更新功能       | 2026-01-12 |
| 0.1.3       | 修复 `**#` 无空格时无法显示的问题      | 2025-12-30 |
| 0.1.2       | 新增快捷键功能                           | 2025-12-26 |
| 0.1.0-0.1.1 | 初始版本，匹配 Stata 书签风格            | 2025-12-25 |
