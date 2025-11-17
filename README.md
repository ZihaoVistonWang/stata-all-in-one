# Stata Outline / Stata 大纲扩展

**版本 / Version:** 0.0.2 
**作者 / Author:** Zihao Viston Wang

---

### Introduction / 介绍
This VS Code extension adds **Outline support for Stata `.do` files**.  

It automatically recognizes comment lines with multiple `%` symbols as section headers, supporting hierarchical structure in the Outline view.

此VS Code扩展添加了 ** 对Stata `.do`文件的Outline支持 **。

它自动识别带有多个“%”符号的注释行作为节头，支持Outline视图中的层次结构。

- `* %%` → Level 1  
- `* %%%` → Level 2  
- `* %%%%` → Level 3  
- and so on…

### Features / 特点
- Display hierarchical sections in Outline view based on comment markers.  在大纲视图中根据注释标记显示层次结构部分。
- Supports unlimited levels by adding more `%`.  通过添加更多的“%”支持无限级别。
- Easy to navigate large `.do` files.  便于浏览大型 `.do` 文件。  

### Installation / 安装
1. Download the `.vsix` file from this repository.   从此仓库下载 `.vsix` 文件。  
2. Open VS Code → Extensions panel → Click `...` → `Install from VSIX...`  打开 VS Code → 扩展面板 → 点击 `...` → `从 VSIX 安装...` 
3. Select the downloaded `.vsix` file.  选择下载的 `.vsix` 文件。  
4. Open any `.do` file and open the Outline panel (Explorer → Outline) to see the hierarchical sections.  打开任何 `.do` 文件并打开大纲面板（资源管理器 → 大纲）以查看层次结构部分。

### Usage Example / 使用案例
```stata
* %% Data Processing
* %%% Cleaning
* %%%% Remove duplicates
* %% Model Estimation
