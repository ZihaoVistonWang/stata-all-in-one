# Stata Outline / Stata 大纲

**Version / 版本:** 0.1.3

**Author / 作者:** Zihao Viston Wang / 王梓豪

## New Features / 新功能

- Add shortcut key function. 添加快捷键功能。

---

![fig](./example.png)

> Example of Outline or Bookmark with hierarchical sections in a Stata `.do` file. (Left: VS Code, Right: Stata)
>
> Stata `.do` 文件中具有层次结构的大纲（书签）视图。（左侧：VS Code，右侧：Stata）

## Introduction / 介绍

- This VS Code extension adds **Outline support for Stata `.do` files**.
- It automatically recognizes comment lines with multiple `#` symbols as section headers, supporting hierarchical structure in the Outline view.

  - `**#` → Level 1
  - `**##` → Level 2
  - `**###` → Level 3
  - and so on…
- Supports shortcut keys:

  - `Ctrl+1/2/3/4/5/6` (Windows) or `Cmd+1/2/3/4/5/6` (Mac): Convert the current line to the corresponding level header.
  - `Ctrl+0` (Windows) or `Cmd+0` (Mac): Convert the current line to a normal line.

---

- 此VS Code扩展添加了**对Stata `.do`文件的大纲支持**。
- 它自动识别带有多个“#”符号的注释行作为节头，支持Outline视图中的层次结构。

  - `**#` → 一级标题
  - `**##` → 二级标题
  - `**###` → 三级标题
  - 依此类推…
- 支持快捷键：

  - `Ctrl+1/2/3/4/5/6` (Windows) 或 `Cmd+1/2/3/4/5/6` (Mac)： 将当前行转换为对应级别标题。
  - `Ctrl+0` (Windows) 或 `Cmd+0` (Mac)： 将当前行转换为普通行。

## Features / 特点

- Display hierarchical sections in Outline view based on comment markers.
- Supports unlimited levels by adding more `#`.
- Easy to navigate large `.do` files.

---

- 在大纲视图中根据注释标记显示层次结构部分。
- 通过添加更多的“#”支持无限级别。
- 便于浏览大型 `.do` 文件。

## Installation / 安装

### Extension Market Installation / 拓展市场安装

1. Search for "Stata Outline" in the VS Code extensions and install it.
2. Open any `.do` file and open the Outline panel (Explorer → Outline) to see the hierarchical sections.

---

1. 在VS Code扩展中搜索“Stata Outline”并安装。
2. 打开任何 `.do` 文件并打开大纲面板（资源管理器 → 大纲）以查看层次结构部分。

### Manual Installation / 手动安装

1. Download the `stata-outline-x.x.x.vsix` file from this [releases page](https://github.com/ZihaoVistonWang/stata-outline/releases).
2. Open VS Code → Extensions panel → Click `...` → `Install from VSIX...`
3. Select the downloaded `stata-outline-x.x.x.vsix` file.
4. Open any `.do` file and open the Outline panel (Explorer → Outline) to see the hierarchical sections.

---

1. 从此[发布页面](https://github.com/ZihaoVistonWang/stata-outline/releases)下载 `stata-outline-x.x.x.vsix` 文件。
2. 打开 VS Code → 扩展面板 → 点击 `...` → `从 VSIX 安装...`
3. 选择下载的 `stata-outline-x.x.x.vsix` 文件。
4. 打开任何 `.do` 文件并打开大纲面板（资源管理器 → 大纲）以查看层次结构部分。

## Usage Example / 使用案例

```stata
**# Data Processing
**## Cleaning
**### Remove duplicates
**# Model Estimation
***## Regression Analysis
...
```

## 版本记录

| Version<br />版本 | Note<br />内容                                                                                                                                                                           | Date<br />发布时间 |
| :---------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------- |
| 0.1.3             | Fixed the problem that `**#`,`**##`(that is, there is no space between `**` and `#`) are not displayed in the outline<br />修复 `**#`、`**##`（即 `**`与 `#`之间没空格） | 2025-12-30         |
| 0.1.2             | Add shortcut key function.<br />添加快捷键功能。                                                                                                                                         | 2025-12-26         |
| 0.1.0 - 0.1.1     | Matches Stata's bookmark style, with comment lines starting with `**#`, etc. as section titles.<br />匹配Stata的书签风格，以 `**#`等开头的注释行作为节标题。                         | 2025-12-25         |
