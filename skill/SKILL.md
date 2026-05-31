---
name: stata-all-in-one-skill
description: 在 VS Code 中运行 Stata 代码并读取结果。当用户需要执行 Stata 命令、做回归分析、数据分析、生成统计量，或处理 .do 文件和 .dta 数据集时使用此 skill。触发词包括"运行 Stata 代码"、"做回归"、"汇总数据"、"用 Stata 分析"、"t 检验"、"regress"、"summarize"等。需要 VS Code 和 Stata All in One 扩展。零外部依赖。
compatibility: 需要 macOS/Windows，VS Code + Stata All in One 扩展。零外部依赖——只需系统自带的 curl。
---

# Stata All in One Skill

通过 HTTP 接口与 VS Code 中的 Stata 会话通信，运行代码并获取结果。

## 前置条件

1. VS Code 已安装 Stata All in One 扩展
2. 已在 VS Code 中运行过 `Stata All in One: Install AI Coding Skill`（首次使用）
3. 在扩展设置中 `AI Skill Enabled` 已开启（默认开启）

## 启动 VS Code（如果未运行）

执行 Stata 代码前，先确保 VS Code 已打开且 HTTP 服务在线。

### 第一步：检查服务

**macOS / Linux:**
```bash
curl -s --connect-timeout 2 http://127.0.0.1:19521/status 2>/dev/null || echo "OFFLINE"
```

**Windows (PowerShell):**
```powershell
try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:19521/status" -TimeoutSec 2 -UseBasicParsing; $r.Content } catch { "OFFLINE" }
```

如果返回 `{"status":"running","sessionActive":true}` → 可以执行代码了。

如果返回 `OFFLINE` 或连接失败 → 需要启动 VS Code。

### 第二步：启动 VS Code

**macOS（依次尝试）：**
```bash
# A: code 命令（如果安装时勾选了"添加到 PATH"）
code --new-window 2>/dev/null &

# B: open 命令（macOS 系统自带，100% 可用）
open -a "Visual Studio Code" 2>/dev/null &

# C: 直接启动应用
open /Applications/Visual\ Studio\ Code.app 2>/dev/null &
```

**Windows（依次尝试）：**
```powershell
# A: code 命令（如果安装时勾选了"添加到 PATH"）
code --new-window

# B: 通过快捷方式启动
start "" "C:\Users\$env:USERNAME\AppData\Local\Programs\Microsoft VS Code\Code.exe"

# C: 通过 Program Files 启动
start "" "C:\Program Files\Microsoft VS Code\Code.exe"
```

依次尝试以上任一方案，成功启动 VS Code 即可。

### 第三步：等待 VS Code 就绪

VS Code 启动和扩展激活需要几秒钟。启动后轮询等待 HTTP 服务：

**macOS:**
```bash
for i in $(seq 1 15); do
  result=$(curl -s --connect-timeout 2 http://127.0.0.1:19521/status 2>/dev/null)
  if echo "$result" | grep -q '"status":"running"'; then
    echo "✅ Stata ready"
    break
  fi
  sleep 2
done
```

**Windows (PowerShell):**
```powershell
for ($i=1; $i -le 15; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:19521/status" -TimeoutSec 2 -UseBasicParsing
    if ($r.Content -match '"status":"running"') { Write-Host "✅ Stata ready"; break }
  } catch {}
  Start-Sleep -Seconds 2
}
```

最多等 30 秒。如果超时仍未就绪 → 告知用户手动打开 VS Code，打开一个 `.do` 文件，并确认设置中 `AI Skill Enabled` 已开启。

## 执行 Stata 代码

### 基本用法

**macOS / Linux (bash):**
```bash
curl -s -X POST http://127.0.0.1:19521/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"<Stata 代码>"}'
```

**Windows (PowerShell):**
```powershell
$body = '{"code":"<Stata 代码>"}'
Invoke-WebRequest -Uri "http://127.0.0.1:19521/execute" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | Select-Object -ExpandProperty Content
```

**Windows (CMD / curl.exe):**
```cmd
curl -s -X POST http://127.0.0.1:19521/execute -H "Content-Type: application/json" -d "{\"code\":\"<Stata 代码>\"}"
```

返回 JSON：
```json
{
  "success": true,
  "returnCode": 0,
  "output": "<Stata 输出>",
  "error": ""
}
```

### 单行命令

**macOS:**
```bash
curl -s -X POST http://127.0.0.1:19521/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"summarize price mpg"}'
```

**Windows (PowerShell):**
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:19521/execute" -Method POST -ContentType "application/json" -Body '{"code":"summarize price mpg"}' -UseBasicParsing | Select-Object -ExpandProperty Content
```

### 多行代码（用 \n 分隔）

**macOS:**
```bash
curl -s -X POST http://127.0.0.1:19521/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"sysuse auto, clear\nregress price mpg, robust"}'
```

**Windows (PowerShell):**
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:19521/execute" -Method POST -ContentType "application/json" -Body '{"code":"sysuse auto, clear\nregress price mpg, robust"}' -UseBasicParsing | Select-Object -ExpandProperty Content
```

### JSON 转义规则

**macOS bash `-d '...'`（单引号包裹）：**
- 双引号加 `\`：`\"`
- 换行用 `\n`
- 反斜杠用 `\\`
- 示例：`-d '{"code":"cd \"/path/to/dir\"\ndescribe"}'`

**Windows PowerShell（单引号字符串）：**
- 双引号不需要转义（外层用单引号）
- 换行用 `\n`
- 示例：`-Body '{"code":"cd \"C:\\data\"\ndescribe"}'`

**Windows CMD（双引号包裹，所有内部双引号都要转义）：**
- 每个 `"` 变成 `\"`
- 每个 `\` 变成 `\\`
- 换行用 `\n`
- 示例：`-d "{\"code\":\"sysuse auto\\ndescribe\"}"`

**建议：优先使用 PowerShell 语法（转义最简单）**

## 会话状态

Stata 会话是**持久化**的。数据集、全局宏、估计结果在多次调用之间保留：

```bash
# 第一步：加载数据
curl -s -X POST ... -d '{"code":"sysuse auto, clear"}'

# 第二步：运行回归（数据集仍在内存中）
curl -s -X POST ... -d '{"code":"regress price mpg"}'

# 第三步：使用上一步的估计结果
curl -s -X POST ... -d '{"code":"estimates store model1"}'

# 第四步：查看已存储的估计
curl -s -X POST ... -d '{"code":"estimates list"}'
```

## 错误处理

### Stata 命令错误（returnCode ≠ 0）
```json
{"success":false,"returnCode":111,"output":"variable xxx not found\nr(111);","error":"Execution failed with return code 111"}
```
→ 向用户解释错误原因，并提供修正后的代码。

### 连接失败（Connection refused）
→ 按上述「启动 VS Code」流程尝试自动启动 VS Code。如果多次尝试均失败，引导用户手动打开 VS Code，确认 `AI Skill Enabled` 已开启，并打开一个 `.do` 文件。

### 会话未初始化（sessionActive: false）
→ 引导用户在 VS Code 中打开任意 `.do` 文件以激活 Stata 会话。等待几秒后重试。

## 常见使用模式

### 数据探索
```bash
# 加载数据
-d '{"code":"sysuse auto, clear"}'
# 查看结构
-d '{"code":"describe"}'
# 汇总统计
-d '{"code":"summarize"}'
# 频数统计
-d '{"code":"tabulate foreign"}'
```

### 回归分析
```bash
# OLS 回归
-d '{"code":"regress price mpg weight, robust"}'
# Logit 回归
-d '{"code":"logit foreign mpg price"}'
# 边际效应
-d '{"code":"margins, dydx(*)"}'
```

### 数据处理
```bash
# 生成新变量
-d '{"code":"generate price_log = log(price)"}'
# 条件筛选
-d '{"code":"keep if foreign == 1"}'
# 合并数据
-d '{"code":"merge 1:1 id using other_data.dta"}'
```

## 注意事项

- 输出是纯文本，直接阅读 Stata 的原始输出
- 长时间命令可能需要几秒到几十秒，`curl` 会自动等待
- 不要一次性发送超大代码块（如几百行），分批执行更可控
- 不要关闭 VS Code 中的 Stata 会话，以免丢失数据状态
