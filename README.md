# Stata Outline

**Version:** 0.2.1
**Author:** Zihao Viston Wang

[中文版本](README_CN.md)

---

## Features

### 1. Smart Outline & Structural Navigation

- **Multi-level Outline Recognition**: Automatically detects comment lines from `**#` to `**######` as hierarchical headers, supporting up to **6 levels**.
  - **Shortcuts**: `Ctrl/Cmd + 1-6` to quickly convert to the corresponding header level; `Ctrl/Cmd + 0` to revert to a standard code line.
- **Cursor Sync (Auto-Reveal)**: The outline view automatically highlights and navigates to the corresponding section as the cursor moves in the editor.
  - *Setup: Click the "···" button in the top-right of the Outline view and check "Follow Cursor".* (Note: This is a VS Code GUI setting and cannot be configured via code).
- **Multi-level Numbering**: Optional display of logical numbering (e.g., `1.1`, `1.2.1`) within the outline (must be enabled in settings).
- **Auto-Sync Numbering**: When enabled, the extension automatically adds or removes numbering directly within the `.do` file based on the outline structure.

### 2. Code Execution (Stata Interaction)

- **Native Support (macOS)**: Communicates directly with Stata without requiring additional extensions. *Note: Windows is currently not supported.*
- **Flexible Execution Modes**:
  - **Global Execution**: Click the ▶️ button in the editor title bar or Outline view header to run the current script.
  - **Smart Section Run**: When **no code is selected**, pressing `Ctrl/Cmd + D` automatically detects the current section and executes from that header down to (but not including) the next header of the same or higher level.
  - **Precision Selection Run**: Press `Ctrl/Cmd + D` to run the selected block. Supports **fuzzy selection**, executing complete lines even if not fully highlighted.

### 3. Efficient Separators & Styling

- **Quick Insertion**: Supports various symbols to enhance code readability.
  - **Standard Separators**: Use `Ctrl/Cmd + Symbol` to insert a divider:
    - `Ctrl/Cmd + -` (Dash) | `Ctrl/Cmd + =` (Equal) | `Ctrl/Cmd + Shift + 8` (Asterisk)
  - **Custom Separators**:
    - `Ctrl + Alt + S` (Windows) | `Ctrl + Cmd + S` (macOS), where **S** stands for "**S**eparator".
    - After the shortcut, simply input **your desired character** to generate the line.
- **Intelligent Wrap Mode**:
  - **Blank Line Insertion**: Generates a full-width divider (length adjustable in settings).
  - **Non-blank Line Insertion**: Pressing the shortcut once inserts a divider above the line; pressing it again inserts one below, creating a "wrapped" header effect.
  - **Header Decoration**: Select header text and press the shortcut to generate a title with balanced decorative symbols (e.g., `**# === Title ===`). These decorations do not interfere with outline recognition.

### 4. Enhanced Commenting

- **Toggle Comments**: Quickly toggle line comments using `Ctrl/Cmd + /`.
- **Optional Styles**: Defaults to `//`, with support for switching to other valid Stata comment delimiters in settings.

> ![fig](./example.png)
> *Hierarchical outline view in Stata `.do` files (Left: VS Code, Right: Stata)*

---

## Installation

### Extension Marketplace

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
3. **Show Run Button (macOS)** (`stata-outline.showRunButton`)

   - `true`: Shows play button in editor title bar and Outline view.
   - `false` (default): Hides button (macOS-only feature).
4. **Stata Version (macOS)** (`stata-outline.stataVersion`)

   - Select between `StataMP`, `StataIC`, `StataSE` when running on macOS.

5. **Active Stata Window After Running Code (macOS)** (`stata-outline.activateStataWindow`)

   - `true` (default): Brings Stata window to the foreground after code execution.
   - `false`: Does not change focus.

6. **Comment Style** (`stata-outline.commentStyle`)

   - `// ` (default): Line comments with double slash.
   - `* `: Stata single-line comments.
   - `/* ... */`: Block-style comments.
7. **Separator Length** (`stata-outline.separatorLength`)

   - Numeric length used to size divider lines (including prefixes). Larger values produce longer separators.

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

| Version     | Changes                                                                                                                              | Release Date |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 0.2.0-0.2.1 | macOS native section/run support (no external dependency); play button also in Outline view; new divider line commands and shortcuts | 2026-01-25   |
| 0.1.9       | Outline now follows cursor, highlighting corresponding sections in real-time                                                         | 2026-01-24   |
| 0.1.7-0.1.8 | Added toggle comments functionality with customizable comment styles                                                                 | 2026-01-22   |
| 0.1.5-0.1.6 | Added "Run Current Section" feature                                                                                                  | 2026-01-12   |
| 0.1.4       | Added multi-level numbering display and auto-update file content                                                                     | 2026-01-12   |
| 0.1.3       | Fixed display issue with `**#` without spaces                                                                                      | 2025-12-30   |
| 0.1.2       | Added keyboard shortcut functionality                                                                                                | 2025-12-26   |
| 0.1.0-0.1.1 | Initial release matching Stata bookmark style                                                                                        | 2025-12-25   |
