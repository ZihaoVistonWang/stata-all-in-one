# Stata Outline / Stata 大纲扩展

**版本 / Version:** 0.0.1  
**作者 / Author:** yourname

---

## English Version

### Introduction
This VS Code extension adds **Outline support for Stata `.do` files**.  
It automatically recognizes comment lines with multiple `%` symbols as section headers, supporting hierarchical structure in the Outline view.

- `* %%` → Level 1  
- `* %%%` → Level 2  
- `* %%%%` → Level 3  
- and so on…

### Features
- Display hierarchical sections in Outline view based on comment markers.  
- Supports unlimited levels by adding more `%`.  
- Easy to navigate large `.do` files.  
- Works entirely offline; no external dependencies.

### Installation
1. Download the `.vsix` file from this repository.  
2. Open VS Code → Extensions panel → Click `...` → `Install from VSIX...`  
3. Select the downloaded `.vsix` file.  
4. Open any `.do` file and open the Outline panel (Explorer → Outline) to see the hierarchical sections.

### Usage Example
```stata
* %% Data Processing
* %%% Cleaning
* %%%% Remove duplicates
* %% Model Estimation
