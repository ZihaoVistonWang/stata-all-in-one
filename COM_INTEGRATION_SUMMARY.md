# Stata COM Automation 集成总结

## 项目背景

**Stata All in One** VS Code 扩展，在 Windows 上通过 `runMode=externalApp` 执行 Stata 代码。

## 用户需求

当 `runMode=externalApp` 时：

1. **首选方案**：使用 Stata Automation COM (`stata.StataOLEApp`) 发送代码给 Stata，而非模拟按键
2. **发送方式**：把用户选中的代码保存为临时 `.do` 文件，通过 COM 发送 `do "文件路径"` 命令（与现有 PS1 按键脚本的思路一致）
3. **异步非阻塞**：用 `DoCommandAsync` 发送命令，VS Code 不卡住
4. **cdToDoFileDir**：如果用户启用该设置，在 do 文件头部写入 `cd "目录"`
5. **前台显示**：发送代码后把 Stata 窗口（包括 Graph 图窗口）调到前台
6. **降级**：如果 COM 不可用（未注册 / 出错），右下角通知用户，自动降级到现有 PS1 按键脚本
7. **多版本**：根据 `stataPathOnWindows` 路径变化自动重新注册 COM（不同版本共用 ProgID）
8. **closeStataOtherWindowsBeforeSendingCode**：COM 模式下此设置不适用（无按键模拟），降级时保持原逻辑

## 参考资料

### Stata Automation COM 文档
- https://www.stata.com/automation/
- ProgID: `stata.StataOLEApp`（单实例 out-of-process server）
- 注册：`StataMP-64.exe /Register`（需管理员权限 `-Verb RunAs`）
- 反注册：`StataMP-64.exe /Unregister`
- 关键方法：`DoCommand`（同步）、`DoCommandAsync`（异步）、`UtilShowStata(0/1/2)`、`UtilIsStataFree()`、`UtilSetStataBreak()`
- **PowerShell 调用注意**：Stata 17/18 类型库用 `[out, retval]`，errorCode 直接作为返回值，**不要用 `[ref]`**
- **UTF-8 编码**：中文 Windows 上 `[Console]::In.ReadLine()` 默认 GBK，必须设 `[Console]::InputEncoding = UTF8`

### 实测验证
- Stata 18 MP (`D:\Stata18\StataMP-64.exe`) ✅ 67 个 COM 方法全部可用
- Stata 17 SE (`D:\Stata17\StataSE-64.exe`) ✅ 同样 67 个方法，API 一致
- 两个版本共用同一个 ProgID，同时只能注册一个
- `DoCommandAsync` 返回立即 0，命令在 Stata 内排队
- 基础命令（`sysuse`、`regress`、`display`）通过 COM 正常执行

## 已实现的功能

### 架构
```
VS Code → windows.js → comService.js (Node.js 单例)
                          │ spawn + JSON-line stdin/stdout
                          ▼
                    stata_com_service.ps1 (长期运行)
                          │ New-Object -ComObject
                          ▼
                    Stata.exe (COM automation)
```

### 文件清单

| 文件 | 角色 | 状态 |
|------|------|------|
| `scripts/stata_com_service.ps1` | PS COM 桥接进程 | ✅ 已有 |
| `src/modules/runCode/externalApp/comService.js` | Node.js 单例管理器 | ✅ 已有 |
| `src/modules/runCode/externalApp/windows.js` | 调度入口（COM 优先 + 降级） | ✅ 已有 |
| `src/modules/runCode/execute/index.js` | 调用处加 `await` + `context` | ✅ 已改 |
| `src/modules/helpCommand.js` | 帮助命令 | ✅ 已改 |
| `src/extension.js` | deactivate 清理 COM | ✅ 已改 |
| `src/utils/common.js` | i18n 消息 | ✅ 已改 |

### JSON-line 协议
```
→ {"id":1,"action":"init","doRegister":false}
← {"id":1,"success":true}

→ {"id":2,"action":"execute","command":"do \"e:/path/to/file.do\""}
← {"id":2,"success":true,"errorCode":0}

→ {"id":3,"action":"foreground"}
← {"id":3,"success":true}

→ {"id":4,"action":"shutdown"}
← {"id":4,"success":true}
```

### COM 路径执行流程
```
1. 检查 comService.isUnavailable() → 跳过
2. 首次调用 → comService.init(stataPath, context)
   ├── 对比 globalState.stataComLastRegisteredPath
   ├── 路径相同 → 直接 New-Object -ComObject
   ├── 路径不同 → showInfo → Start-Process -Verb RunAs /Register → New-Object
   └── 初始化成功 → UtilShowStata(0) + 预热 DoCommand → 持久化路径
3. 写临时 .do 文件
4. cdToDoFileDir? → prepend `cd "目录"` 到 .do 文件
5. DoCommandAsync('do "文件路径"')
6. waitAndForeground → 轮询 UtilIsStataFree → foreground
```

### 注册持久化
- `globalState` key: `stataComLastRegisteredPath`
- 路径不变不触发 UAC，路径变了自动重新注册

## 已处理的问题

### 1. Graph 作图窗口消失
- **现象**：`twoway line` 等作图命令执行后，Graph 窗口闪现后消失，最后没有可见作图窗口
- **调研结论**：
  - Stata Automation 官方文档说明 `DoCommandAsync()` 是把命令加入 Stata 队列，等价于在 Stata Command window 输入命令；未说明 COM 会主动关闭 Graph 窗口
  - Stata 图形窗口机制说明：关闭 Graph 窗口不会删除底层 graph，可以通过 `graph display` 重新显示
- **修复方案**：
  - Windows COM 路径检测到作图命令后，先继续用 `DoCommandAsync('do "..."')` 保持 VS Code 非阻塞
  - 后台轮询 `UtilIsStataFree()`，确认 do-file 执行完
  - 再通过同步 `DoCommand('capture graph display')` 重新显示当前 graph
  - 最后优先把 Graph 窗口置前；如果没有 Graph 窗口则回退到 Stata 主窗口
  - 若用户显式 `graph close` / `graph drop` / `set graphics off`，或作图命令带 `nodraw`，不会强制重显图窗

## ⚠️ 未解决的问题

### 1. DoCommandAsync 超时风险
- `waitAndForeground` 轮询 `UtilIsStataFree()` 时，do-file 可能需要很长时间
- 当前超时 60 秒，超时后强制 foreground（但图可能还没渲染）

### 2. 未测试其他 Stata 版本（15、16）
- 只测了 17 SE 和 18 MP，旧版本 API 可能有差异

## key Files for Implementation

- `E:\stata-all-in-one\scripts\stata_com_service.ps1` — PS COM bridge (main logic)
- `E:\stata-all-in-one\src\modules\runCode\externalApp\comService.js` — Node.js singleton
- `E:\stata-all-in-one\src\modules\runCode\externalApp\windows.js` — dispatcher
- `E:\stata-all-in-one\scripts\win_run_do_file_with_all_windows.ps1` — existing keystroke script (reference for WindowManager C# code)
- `E:\stata-all-in-one\scripts\win_run_do_file_close_all_windows.ps1` — existing keystroke script (reference for WindowManager C# code)
