<p align="center">
   <img src="icon-wide.png" alt="Stata All in One Icon" style="width:300px;" />
</p>

<h1 align="center">
Stata All in One
</h1>

<p align="center">`Stata All in One` is derived from  <a href="https://github.com/ZihaoVistonWang/stata-outline">`Stata Outline`</a>, with extended features and improvements.</p>

<p align="center">
   | <b>Version:</b><a href="https://github.com/ZihaoVistonWang/stata-all-in-one/releases"> 0.2.3</a>｜<b>Author:</b> <a href="https://zihaowang.cn">Zihao Viston Wang</a> | <b>Translate:</b>
  <a href="README_CN.md">中文版本</a> |
</p>

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

- **Platform Support**: Seamlessly integrates with Stata on both **macOS** and **Windows** without requiring additional extensions.
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

---

## Installation

### Extension Marketplace

1. Search for "Stata All in One" in VS Code extensions and install.
2. Open any `.do` file and navigate to Outline panel (Explorer → Outline) to view hierarchical structure.

### Manual Installation

1. Download `stata-all-in-one-x.x.x.vsix` from [releases page](https://github.com/ZihaoVistonWang/stata-all-in-one/releases).
2. In VS Code → Extensions panel → `...` → `Install from VSIX...`.
3. Select the downloaded file to complete installation.
4. Open any `.do` file and view Outline panel.

---

## Configuration

Search for "Stata All in One" in VS Code settings and configure:

### Outline & Navigation

1. **Display Multi-level Numbering** (`stata-all-in-one.showNumbering`)

   - `true`: Outline displays `1.1`, `1.2.1` style numbering.
   - `false` (default): Displays original headings.
2. **Auto-update File Content** (`stata-all-in-one.updateFileContent`)

   - `true`: When numbering is enabled, automatically update section titles in .do files to include numbers. **Requires reopening .do files**
   - `false` (default): Only displays numbering in outline, doesn't modify file.

### Code Execution

3. **Show Run Button** (`stata-all-in-one.showRunButton`)

   - `true` (default): Whether to show the run button in the editor title bar.
   - `false`: Hides button.
4. **Stata Version on macOS** (`stata-all-in-one.stataVersionOnMacOS`)

   - **[macOS]** Stata version. Select between `StataMP`, `StataIC`, `StataSE`.
   - Default: `StataMP`
5. **Stata Path on Windows** (`stata-all-in-one.stataPathOnWindows`)

   - **[Windows]** Path to Stata executable file (e.g., `C:\Program Files\Stata17\StataMP-64.exe`).
6. **Active Stata Window After Running Code** (`stata-all-in-one.activateStataWindow`)

   - `true` (default): Activate the Stata window after running code (bring it to the foreground).
   - `false`: Does not change focus.

### Code Style

7. **Comment Style** (`stata-all-in-one.commentStyle`)

   - `// ` (default): Comment style used for toggling comments. Options include `//`, `*`, or `/* ... */`
8. **Separator Length** (`stata-all-in-one.separatorLength`)

   - Total character length of the separator line (including the '** #' prefix and separators). Default: `60`

> **Note**: Changes take effect after reopening `.do` files. When `updateFileContent` is disabled, existing numbering in `.do` files will be automatically removed.

---

## Changelog

| Version     | Changes                                                                                | Release Date |
| ----------- | -------------------------------------------------------------------------------------- | ------------ |
| 0.2.3       | Added migration prompt and auto-migrated settings from Stata Outline                   | 2026-01-27   |
| 0.2.2       | Windows native support for executing Stata code                                        | 2026-01-27   |
| 0.2.0-0.2.1 | macOS native support for executing Stata code; new divider line commands and shortcuts | 2026-01-25   |
| 0.1.9       | Outline now follows cursor, highlighting corresponding sections in real-time           | 2026-01-24   |
| 0.1.7-0.1.8 | Added toggle comments functionality with customizable comment styles                   | 2026-01-22   |
| 0.1.5-0.1.6 | Added "Run Current Section" feature                                                    | 2026-01-12   |
| 0.1.4       | Added multi-level numbering display and auto-update file content                       | 2026-01-12   |
| 0.1.3       | Fixed display issue with `**#` without spaces                                        | 2025-12-30   |
| 0.1.2       | Added keyboard shortcut functionality                                                  | 2025-12-26   |
| 0.1.0-0.1.1 | Initial release matching Stata bookmark style                                          | 2025-12-25   |
