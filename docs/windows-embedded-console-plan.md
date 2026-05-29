# Windows 嵌入式控制台 — 实现计划

> 创建时间: 2026-05-29 | 当前版本: v0.3.0 | 最后更新: 2026-05-29

---

## 背景

macOS 版嵌入式控制台已完成，四层架构：

```
panel.js (Webview UI) → renderer.js (终端渲染) → session.js (会话管理) → stata_bridge.node (C++ 原生桥接) → libstata-*.dylib (Stata C API)
```

Windows 版需将底层从 `dlopen`/`dlsym` 移植为 `LoadLibrary`/`GetProcAddress`，上层 JS 大部分复用。

### macOS 已完成的功能

| 功能 | 状态 |
|---|---|
| ✅ 嵌入式控制台执行 + 输出流式传输 | 完成 |
| ✅ 语法高亮渲染 (TextMate grammar) | 完成 |
| ✅ 图表导出 (SVG/PNG)、复制、全屏 | 完成 |
| ✅ Data Viewer (.dta 文件) | 完成 |
| ✅ 自动补全 (命令/函数/变量) | 完成 |
| ✅ 控制台输入历史 | 完成 |
| ✅ **优雅降级**：Console 失败 → 自动切 External App + 右下角提示 + "永久切换"按钮 | **2026-05-29 完成** |

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

**✅ 实际结果（2026-05-29 ~ 2026-05-30 在 Windows 11 上确认）:**

```
Stata 安装目录: D:\Stata18
关键 DLL:  D:\Stata18\mp-64.dll (57 MB, Stata/MP Edition 18)

DLL 导出的全部函数 (dumpbin /EXPORTS):
  ordinal hint RVA      name
       15    E 01ED32D0 StataSO_AllowStataExitCommand
       16    F 01ED3370 StataSO_AppendOutputBuffer
       17   10 01ED3300 StataSO_ClearOutputBuffer
       18   11 01ED3310 StataSO_EchoStdout
       19   12 01ED32E0 StataSO_Execute
       20   13 01ED32F0 StataSO_GetOutputBuffer
       21   14 01F83410 StataSO_Main
       22   15 01ED33A0 StataSO_QueueInteractiveCommand
       23   16 01ED3380 StataSO_RunInteractiveLoop
       24   17 01ED3350 StataSO_SetBreak
       25   18 01ED3320 StataSO_SetOutputBufferSz
       26   19 01ED3330 StataSO_SetOutputBufferSz_K
       27   1A 01ED3340 StataSO_SetOutputBufferSz_M
       28   1B 01ED32C0 StataSO_Shutdown

构建工具: Visual Studio 2022 Community (MSVC 14.44) + BuildTools
Node.js:  v24.15.0
```

### 1.2 确认 StataSO C API 是否可用

- [x] ✅ 找到 Stata 的 DLL 文件: `D:\Stata18\mp-64.dll` (57 MB, Stata/MP 18)
- [x] ✅ 用 dumpbin 检查 DLL 导出: **全部 14 个 StataSO_* 函数均可用**

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
- [ ] macOS 优雅降级已实现（`maybeOfferGuiFallback` 自动切 External App + 非阻塞通知）

### 3.5 可复用模块（无需改动）

- ✅ `panel.js` — VS Code Webview API 跨平台
- ✅ `renderer.js` — 纯 JS 终端渲染
- ✅ `textmateTokenizer.js` — TextMate 语法高亮
- ✅ `consoleFonts.js` — 已有 Windows 字体探测
- ✅ `common.js` — 已添加 `consoleFallback*` i18n 键（en + zh），Windows 可复用

---

## 步骤 4: 配置和本地化

- [ ] `package.json` — 可能需要新的 Windows 配置项（如 DLL 搜索路径）
- [ ] `package.nls.json` / `package.nls.zh-cn.json` — 更新 Windows 相关文案
- [ ] `src/utils/config.js` — 添加 Windows DLL 路径配置读取
- [ ] `src/utils/common.js` — 如需要，添加 Windows 专用 UI 文案

---

## 步骤 5: 构建与测试（需 Windows 设备）

- [x] ✅ Node.js v24.15.0, node-gyp v10.3.1, Visual Studio 2022 Community + BuildTools
- [x] ✅ 编译 `bin/stata_bridge.node` (253 KB, Windows x64) — `npx node-gyp build --arch=x64`
- [x] ✅ Node.js 命令行测试: InitSession, ExecuteSync, Execute async streaming, getDatasetInfo, getVarMetadata, getDataRows, shutdown — 全部通过
- [ ] 在 VS Code 中加载插件，测试嵌入式控制台 (需要 `vsce package` + 安装 .vsix)
- [ ] 测试图表导出 (需要在完整 VS Code 环境内测试)
- [ ] 测试 Data Viewer (.dta 文件)

### 测试结果 (2026-05-30, Node.js 命令行)

```
✅ InitSession:       D:/Stata18/mp-64.dll 加载成功, StataSO_Main 返回 OK
✅ display:           "Hello from Windows Embedded Console!" 输出正确
✅ sysuse auto:       数据集加载 (1978 automobile data, 74 obs, 12 vars)
✅ summarize mpg:     统计分析输出正确
✅ getDatasetInfo:    {observations:74, variables:12, ...}
✅ getVarMetadata:    12 个变量的元数据解析正确
✅ getDataRows:       数据行读取正确 (columns + rows)
✅ execute (async):   流式输出正确, ThreadSafeFunction 回调正常
✅ shutdown:          会话正确关闭, isInitialized → false
```

### 实测 DLL 导出 (dumpbin /EXPORTS D:\Stata18\mp-64.dll)

mp-64.dll 导出 28 个函数，其中 14 个 StataSO_* (序号 15-28)，涵盖全部 6 个必需函数 + 8 个额外函数。

---

## 进度总结

| 步骤 | 状态 | 备注 |
|---|---|---|
| 1. Windows DLL 调研 | ✅ 完成 | D:\Stata18\mp-64.dll 导出全部 StataSO_* 函数 |
| 2. C++ 桥接移植 | ✅ 完成 | `stata_bridge.cc` 添加 `#ifdef _WIN32`，使用 LoadLibraryA/GetProcAddress/FreeLibrary |
| 3. JS 层实现 | ✅ 完成 | `windows.js` 完整实现, `session.js` 平台感知, `execute/index.js` 调度修正 |
| 4. 配置和本地化 | ✅ 完成 | `binding.gyp` Windows 条件, `build-native.ps1` 构建脚本 |
| 5. 构建与测试 | 🟡 构建+命令行测试通过 | VS Code 内加载测试待完成 |

---

## 实现文件清单

| 文件 | 改动 | 状态 |
|---|---|---|
| `native/stata_bridge/src/stata_bridge.cc` | `#ifdef _WIN32` — LoadLibraryA/GetProcAddress/FreeLibrary | ✅ |
| `native/stata_bridge/binding.gyp` | MSVC 构建条件, `conditions: [OS=='win']` | ✅ |
| `scripts/build-native.ps1` | 新建 Windows PowerShell 构建脚本 | ✅ |
| `bin/stata_bridge.node` | 编译输出 (253 KB, Windows x64) | ✅ |
| `src/modules/runCode/embeddedConsole/windows.js` | 完整重写 — findStataDll + runOnWindowsEmbeddedConsole | ✅ |
| `src/modules/runCode/embeddedConsole/session.js` | 平台感知 stHome 提取 + 状态 key | ✅ |
| `src/modules/runCode/execute/index.js` | Windows 调度逻辑修正 + maybeOfferGuiFallback 双平台 | ✅ |
