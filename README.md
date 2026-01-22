# Stata Outline

**Version:** 0.1.7
**Author:** Zihao Viston Wang

[中文版本](README_CN.md)

---

## Features

- **Outline Support**: Automatically recognizes `**#` formatted comment lines as hierarchical headings, supporting unlimited nesting levels.
- **Keyboard Shortcuts**: `Ctrl/Cmd + 1-6` converts current line to corresponding heading level, `Ctrl/Cmd + 0` converts to normal line.
- **Multi-level Numbering**: Optional display of `1.1`, `1.2.1` style numbering in outline (toggle in settings).
- **Auto-sync Numbering**: Automatically adds/removes numbering in `.do` files when enabled (requires numbering display).
- **Run Current Section**: Click the "Run" button in editor title bar to execute current section code (requires [stataRun extension](https://marketplace.visualstudio.com/items?itemName=yeaoh.statarun)).
- **Toggle Comments**: `Ctrl/Cmd + /` toggles comments on selected lines with customizable comment style (settings).

> ![fig](./example.png)
> *Hierarchical outline view in Stata `.do` files (Left: VS Code, Right: Stata)*

---

## Installation

### Via Extension Marketplace

1. Search for "Stata Outline" in VS Code extensions and install.
2. Open any `.do` file and navigate to Outline panel (Explorer → Outline) to view hierarchical structure.

### Manual Installation

1. Download `stata-outline-x.x.x.vsix` from [releases page](https://github.com/ZihaoVistonWang/stata-outline/releases).
2. In VS Code → Extensions panel → `...` → `Install from VSIX...`.
3. Select the downloaded file to complete installation.
4. Open any `.do` file and view Outline panel.

---

## Configuration

Search for "Stata Outline" in VS Code settings and configure:

1. **Display Multi-level Numbering** (`stata-outline.showNumbering`)

   - `true`: Outline displays `1.1`, `1.2.1` style numbering.
   - `false` (default): Displays original headings.
2. **Auto-update File Content** (`stata-outline.updateFileContent`)

   - `true`: Automatically adds/removes numbering in `.do` files (requires numbering display).
   - `false` (default): Only displays numbering in outline, doesn't modify file.
3. **Show Run Button** (`stata-outline.showRunButton`)

   - `true` (default): Shows play button in editor title bar.
   - `false`: Hides button.
4. **Comment Style** (`stata-outline.commentStyle`)

   - `// ` (default): Line comments with double slash.
   - `* `: Stata single-line comments.
   - `/* ... */`: Block-style comments.

> **Note**: Changes take effect after reopening `.do` files. When `updateFileContent` is disabled, existing numbering in `.do` files will be automatically removed.

---

## Usage Example

```stata
**# Data Processing
**## Cleaning
**### Remove duplicates
**# Model Estimation
***## Regression Analysis
```

- **With numbering** (`showNumbering: true`):Outline shows `1. Data Processing`, `1.1 Cleaning`, `1.1.1 Remove duplicates`, etc.
- **Without numbering** (`showNumbering: false`):
  Outline shows original headings `Data Processing`, `Cleaning`, etc.

---

## Changelog

| Version     | Changes                                                              | Release Date |
| ----------- | -------------------------------------------------------------------- | ------------ |
| 0.1.7-0.1.8 | Added toggle comments functionality with customizable comment styles | 2026-01-22   |
| 0.1.5-0.1.6 | Added "Run Current Section" feature (requires stataRun extension)    | 2026-01-12   |
| 0.1.4       | Added multi-level numbering display and auto-update file content     | 2026-01-12   |
| 0.1.3       | Fixed display issue with `**#` without spaces                      | 2025-12-30   |
| 0.1.2       | Added keyboard shortcut functionality                                | 2025-12-26   |
| 0.1.0-0.1.1 | Initial release matching Stata bookmark style                        | 2025-12-25   |
