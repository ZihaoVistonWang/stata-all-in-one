# Windows 嵌入式控制台 — 实现计划

> 创建时间: 2026-05-29 | 当前版本: v0.3.0

---

## 背景

macOS 版嵌入式控制台已完成，四层架构：

```
panel.js (Webview UI) → renderer.js (终端渲染) → session.js (会话管理) → stata_bridge.node (C++ 原生桥接) → libstata-*.dylib (Stata C API)
```

Windows 版需将底层从 `dlopen`/`dlsym` 移植为 `LoadLibrary`/`GetProcAddress`，上层 JS 大部分复用。

---

## ⚠️ 步骤 1: Windows 端关键信息确认（需在 Windows 设备上操作）

> **这是整个方案的前提。请在你的 Windows 设备上完成以下检查并填写结果。**

### 1.1 Stata 安装目录结构

- [ ] 打开 Stata 安装目录（通常是 `C:\Program Files\Stata18\` 或 `C:\Program Files\StataNow\`）
- [ ] 列出目录下所有 `.dll` 文件

```powershell
# 在 PowerShell 中运行:
Get-ChildItem -Path "C:\Program Files\Stata18" -Filter "*.dll" -Recurse -ErrorAction SilentlyContinue | Select-Object FullName
```

**你的结果（请填写）:**
```
# 粘贴 PowerShell 输出
```

### 1.2 确认 StataSO C API 是否可用

- [ ] 找到 Stata 的 DLL 文件（可能是 `StataMP-64.dll`、`StataSE.dll`、`libstata.dll` 等）
- [ ] 用工具检查 DLL 导出的函数名

```powershell
# 方法1: 用 dumpbin (Visual Studio 自带)
# 打开 "Developer Command Prompt for VS" 或 "x64 Native Tools Command Prompt"
dumpbin /EXPORTS "C:\Program Files\Stata18\StataMP-64.dll" | findstr StataSO

# 方法2: 用 PowerShell 检查 DLL 是否存在
Get-ChildItem -Path "C:\Program Files" -Recurse -Filter "*.dll" -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*stata*" -or $_.Name -like "*Stata*" } | Select-Object FullName, Length
```

**你的结果（请填写）:**
```
# 找到的 DLL 完整路径:
# dumpbin 导出的 StataSO 函数名:
```

### 1.3 期望的 DLL 导出函数列表

macOS 版 `libstata-*.dylib` 导出以下函数，Windows DLL 应导出相同或类似函数：

| macOS 函数名 | 用途 | Windows 上是否存在？ |
|---|---|---|
| `StataSO_Main` | 初始化 Stata 运行时 | - [ ] 是 / - [ ] 否 |
| `StataSO_Execute` | 执行 Stata 命令 | - [ ] 是 / - [ ] 否 |
| `StataSO_ClearOutputBuffer` | 清空输出缓冲 | - [ ] 是 / - [ ] 否 |
| `StataSO_GetOutputBuffer` | 获取输出缓冲内容 | - [ ] 是 / - [ ] 否 |
| `StataSO_SetBreak` | 中断当前执行 | - [ ] 是 / - [ ] 否 |
| `StataSO_Shutdown` | 关闭 Stata 运行时 | - [ ] 是 / - [ ] 否 |

### 1.4 替代方案（如果 DLL 不导出 StataSO）

如果 Stata Windows 不提供 `StataSO_*` DLL 导出，备选方案：

| 方案 | 描述 | 复杂度 | 输出流式传输 |
|---|---|---|---|
| A. Stata Automation (OLE/COM) | 通过 COM 接口控制 Stata | 中 | 有限 |
| B. 管道通信 | 外部进程 + 管道/stdio 通信 | 低 | 可支持 |
| C. 网络端口 | `stata-mp -q ` 通过端口通信 | 中 | 可支持 |
| D. 保持现有外部 App 方案 | 继续用 PowerShell 脚本 | 无需改动 | 不支持 |

- [ ] 如果 StataSO 不可用，你倾向于哪个方案？______

---

## 步骤 2: C++ 原生桥接移植

> 可在 Mac 上完成代码编写，需在 Windows 上编译

### 2.1 源文件修改

修改 `native/stata_bridge/src/stata_bridge.cc`，添加 `#ifdef _WIN32` 条件编译：

| 项目 | macOS | Windows |
|---|---|---|
| 动态库加载 | `dlopen(path, RTLD_LAZY)` | `LoadLibraryA(path)` |
| 符号解析 | `dlsym(handle, "name")` | `GetProcAddress(handle, "name")` |
| 卸载 | `dlclose(handle)` | `FreeLibrary(handle)` |
| 错误信息 | `dlerror()` | `GetLastError()` + `FormatMessage()` |
| 库文件扩展名 | `.dylib` | `.dll` |
| 路径分隔符 | `/` | `\` |
| SYSDIR_STATA 环境变量 | `setenv` | `SetEnvironmentVariable` / `_putenv` |
| 线程 | `pthread` (POSIX) | Windows threads 或 `std::thread` |

### 2.2 构建配置

创建/修改以下文件：

- [ ] `native/stata_bridge/binding.gyp` — 添加 Windows 构建条件
- [ ] `scripts/build-native.bat` 或 `scripts/build-native.ps1` — Windows 构建脚本

### 2.3 预编译二进制

- [ ] 编译 Windows x64 `.node` 文件 → `bin/stata_bridge.node`
- [ ] 编译 Windows ARM64 `.node` 文件（如果需要 Windows on ARM 支持）

---

## 步骤 3: JS 层实现

> ✅ 全部可在 Mac 上完成

### 3.1 `embeddedConsole/windows.js` — 完整编排器

- [ ] `findStataDll(preferredEdition)` — 扫描 Windows 上的 Stata DLL
- [ ] `runOnWindowsEmbeddedConsole(code, tmpFilePath, docDir, context)` — 主编排函数
- [ ] `ensureConsoleSession()` — macOS 版 `ensureConsoleSession()` 的 Windows 适配
- [ ] `createExecutionPlan()` — 从 macOS 版复用
- [ ] 进度处理、输出剥离 — 从 macOS 版复用
- [ ] `stopConsoleExecution()` / `forceShutdownConsoleSession()` — 终止控制

### 3.2 `native/stata_session.js` — 路径适配

- [ ] 根据 `process.platform` 解析正确的 `.node` 路径
- [ ] Windows 上加载 `bin/stata_bridge.node`

### 3.3 `session.js` — 路径处理

- [ ] `stHome` 从 DLL 路径提取（Windows 路径格式）
- [ ] `SYSDIR_STATA` 环境变量设置（Windows 格式）

### 3.4 `execute/index.js` — 调度更新

- [ ] Windows 上 `runMode !== 'externalApp'` 时正确调用 Windows 嵌入式控制台
- [ ] 移除 "Embedded Console is not supported on Windows" 警告

### 3.5 可复用模块（无需改动）

- ✅ `panel.js` — VS Code Webview API 跨平台
- ✅ `renderer.js` — 纯 JS 终端渲染
- ✅ `textmateTokenizer.js` — TextMate 语法高亮
- ✅ `consoleFonts.js` — 已有 Windows 字体探测

---

## 步骤 4: 配置和本地化

- [ ] `package.json` — 可能需要新的 Windows 配置项（如 DLL 搜索路径）
- [ ] `package.nls.json` / `package.nls.zh-cn.json` — 更新 Windows 相关文案
- [ ] `src/utils/config.js` — 添加 Windows DLL 路径配置读取
- [ ] `src/utils/common.js` — 如需要，添加 Windows 专用 UI 文案

---

## 步骤 5: 构建与测试（需 Windows 设备）

- [ ] 安装 Node.js、node-gyp、Visual Studio Build Tools
- [ ] 运行 `npm run build:native` 编译 `.node` 文件
- [ ] 在 VS Code 中加载插件，测试嵌入式控制台
- [ ] 测试各种 Stata 命令执行
- [ ] 测试图表导出
- [ ] 测试 Data Viewer (.dta 文件)

---

## 进度总结

| 步骤 | 状态 | 备注 |
|---|---|---|
| 1. Windows DLL 调研 | ⏳ 等待用户在 Windows 上确认 | **阻塞项** |
| 2. C++ 桥接移植 | ⏳ 等待步骤 1 结果后开始 | 代码在 Mac 写，编译需 Windows |
| 3. JS 层实现 | ⏳ 等待步骤 1 结果后开始 | 全部在 Mac 完成 |
| 4. 配置和本地化 | ⏳ 待开始 | 全部在 Mac 完成 |
| 5. 构建与测试 | ⏳ 需 Windows 设备 | |

---

## 给用户的检查清单（带去 Windows 设备）

```
□ 1. 打开 PowerShell，运行:
     Get-ChildItem -Path "C:\Program Files" -Recurse -Filter "*.dll" -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -match "stata|Stata" } |
       Select-Object FullName, Length

□ 2. 记下找到的 DLL 路径

□ 3. 如果你有 Visual Studio，打开 "x64 Native Tools Command Prompt"，运行:
     dumpbin /EXPORTS "上一步找到的DLL完整路径" | findstr StataSO
     如果没有 Visual Studio，告诉我结果，我提供替代检查方法

□ 4. 把结果贴回这个文档的 1.1 和 1.2 节
```
