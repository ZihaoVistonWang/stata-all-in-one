---
name: stata-all-in-one-skill
description: 在 VS Code 中运行 Stata 代码并读取结果。当用户需要执行 Stata 命令、做回归分析、数据分析、生成统计量，或处理 .do 文件和 .dta 数据集时使用此 skill。触发词包括"运行 Stata 代码"、"做回归"、"汇总数据"、"用 Stata 分析"、"t 检验"、"regress"、"summarize"等。需要 VS Code 和 Stata All in One 扩展。通过宿主机/VS Code 外部环境的 localhost HTTP API 调用 Stata，零额外依赖。
compatibility: 需要 macOS/Windows，VS Code + Stata All in One 扩展。零额外依赖——只需宿主机系统自带的 curl；如果 AI 工具运行在沙箱/容器中，必须通过可访问宿主机 localhost 的外部 shell、授权命令或用户协助来调用 API。
---

# Stata All in One Skill

通过 HTTP 接口与 VS Code 中的 Stata 会话通信，运行代码并获取结果。

## 运行环境关键规则（必须先读）

Stata 会话和 HTTP API 运行在用户宿主机上的 VS Code 扩展进程中，地址通常是 `http://127.0.0.1:19521`。许多 AI 编程工具（例如 Codex、Claude Code 的某些运行模式、远程容器、Dev Container、CI shell）会把命令放在沙箱或容器里执行；此时沙箱内的 `127.0.0.1` 可能是沙箱自己，不是用户宿主机，也可能不能启动 GUI 应用。

因此 agent 必须按以下顺序处理：

1. 先在当前 shell 中用 `/status` 做 2 秒健康检查。
2. 如果成功，直接使用当前 shell 的 `curl` 调用 API。
3. 如果连接失败、超时、返回 `OFFLINE`，或 `open` / `code` / GUI 启动命令因为沙箱权限失败，不要假设 Stata 不可用。应判断为“当前执行环境无法访问宿主机 VS Code 的 localhost API”。
4. 在有权限审批机制的工具中，请求在宿主机/非沙箱环境执行 `curl http://127.0.0.1:19521/status`、启动 VS Code，或运行后续 `/execute` 命令。例如 Codex 中应请求 escalated/unsandboxed shell，而不是继续在沙箱内反复重试。
5. 如果工具没有外部命令能力，请明确告诉用户：需要在宿主机打开 VS Code、启用 AI Skill、打开一个 `.do` 文件，并在宿主机终端执行文档中的 `curl` 命令。

不要直接导入或调用 VS Code 扩展内部的 JavaScript/N-API 模块。AI Skill 的稳定接口是 localhost HTTP API；扩展内部 API 只能由 VS Code 扩展进程访问。

## 前置条件

1. VS Code 已安装 Stata All in One 扩展
2. 已在 VS Code 中运行过 `Stata All in One: Install AI Coding Skill`（首次使用）
3. 在扩展设置中 `AI Skill Enabled` 已开启（默认开启）

## 工作目录与临时文件

所有临时 .do 文件、.log 文件和导出的图表都存放在项目工作目录的 `./.stata-all-in-one/` 下。

### 创建目录（首次使用）

**macOS:**
```bash
mkdir -p ./.stata-all-in-one
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path ".\.stata-all-in-one"
```

### 文件命名规范

- 所有临时文件以时间戳结尾，格式：`名称_YYYYMMDD_HHMMSS.扩展名`
- 示例：`script_20260607_143021.do`、`output_20260607_143021.log`、`scatter_20260607_143021.png`

### 自动清理

**清理由服务器自动完成** —— 每次 `/execute` 被调用后，服务器自动扫描 `.stata-all-in-one/` 目录，**每种格式（.log、.do、.svg、.png 等）各保留最新 10 个**，删除更旧的。你**无需**手动运行任何清理命令。

---

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

如果返回 `{"status":"running","sessionActive":true,"busy":false}` → 可以执行代码了。
`busy: true` 表示 Stata 正在执行命令，agent 应等待或发送 `/break` 中断。

如果返回 `OFFLINE` 或连接失败：

- 如果当前工具确认运行在宿主机 shell 中，可以继续执行下面的“启动 VS Code”流程。
- 如果当前工具运行在沙箱、容器、远程环境，或无法确认 `127.0.0.1` 是否指向宿主机，应先请求宿主机/非沙箱命令权限来执行 `/status` 和后续 `/execute`，不要在沙箱内反复重试。
- 如果无法获得宿主机命令权限，请让用户手动打开 VS Code、启用 AI Skill、打开一个 `.do` 文件，并在宿主机终端运行下面的 `curl` 命令验证。

### 第二步：启动 VS Code

仅在能够访问用户宿主机 GUI 的环境中执行以下命令。Codex 等工具如果默认 shell 是沙箱，应先申请外部/非沙箱执行权限；沙箱内执行 `open` 或 `code` 通常不会启动用户正在使用的 VS Code。

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

上述路径是 VS Code 的默认安装路径，如果用户自定义安装位置，请相应的寻找并修改上述命令。
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

最多等 30 秒。如果超时仍未就绪 → 先判断是否仍在沙箱/容器里访问了错误的 `127.0.0.1`。如果是，改用宿主机/非沙箱命令重试；如果已经在宿主机仍失败，再告知用户手动打开 VS Code，打开一个 `.do` 文件，并确认设置中 `AI Skill Enabled` 已开启。

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
  "error": "",
  "graphs": []
}
```
`graphs` 数组包含服务器自动导出的图形文件路径（SVG + PNG），通常为空；当代码包含画图命令（`scatter`、`histogram` 等）时自动填充。

### 超时设置

默认超时 **30 秒**。长时间运行的命令（bootstrap、大型回归等）需要显式设置 `timeout`（秒）：

```bash
# 设置 5 分钟超时
curl -s -X POST http://127.0.0.1:19521/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"bootstrap r(p50), reps(1000): summarize price", "timeout": 300}'
```

| 场景 | 建议 timeout（秒） |
|------|-------------------|
| 普通命令（`summarize`、`regress` 等） | 默认 30，无需设置 |
| bootstrap、permute 等重复抽样 | 300（5 分钟） |
| 超大循环、大型数据合并 | 600（10 分钟，上限） |

超时后服务器会中断 Stata 执行并返回 408 状态码，已生成的图形仍会导出。

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
  -d '{"code":"sysuse auto, clear\nregress price mpg, vce(robust)"}'
```

**Windows (PowerShell):**
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:19521/execute" -Method POST -ContentType "application/json" -Body '{"code":"sysuse auto, clear\nregress price mpg, vce(robust)"}' -UseBasicParsing | Select-Object -ExpandProperty Content
```

### 运行 .do 文件并读取日志（推荐复杂代码使用）

对于较长的 Stata 代码（超过 5 行、含循环/宏/局部变量、或输出量很大），**务必**写入临时 .do 文件运行并生成 .log 日志文件，由 agent 读取 .log 获取完整输出。这避免了 JSON 转义问题，且能确保捕获全部结果。

**长时间运行的 .do 文件（bootstrap、大型循环等）必须设置 `timeout`：**

**macOS:**
```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p ./.stata-all-in-one

# 1. 写入 .do 文件（分两步：先用双引号 heredoc 让 bash 展开 $TIMESTAMP，再用单引号 heredoc 保护 Stata 的 $ 宏）
cat > ./.stata-all-in-one/script_${TIMESTAMP}.do << STATAEOF
log using "./.stata-all-in-one/output_${TIMESTAMP}.log", text replace
STATAEOF

cat >> ./.stata-all-in-one/script_${TIMESTAMP}.do << 'STATAEOF'
sysuse auto, clear
regress price mpg, vce(robust)
estimates store m1
log close
STATAEOF

# 2. 通过 API 运行 .do 文件（普通命令 30s 默认超时，bootstrap 等需加 "timeout"）
curl -s -X POST http://127.0.0.1:19521/execute \
  -H "Content-Type: application/json" \
  -d "{\"file\":\"./.stata-all-in-one/script_${TIMESTAMP}.do\"}"

# 长时间运行需设置 timeout（单位秒）：
# curl -s -X POST ... -d "{\"file\":\"...\", \"timeout\": 300}"

# 3. 读取日志文件查看完整输出
cat ./.stata-all-in-one/output_${TIMESTAMP}.log
```

**Windows (PowerShell):**
```powershell
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Force -Path ".\.stata-all-in-one"

# 1. 写入 .do 文件（含 log 开关）
@"
log using "./.stata-all-in-one/output_${timestamp}.log", text replace
sysuse auto, clear
regress price mpg, vce(robust)
estimates store m1
log close
"@ | Out-File -FilePath ".\.stata-all-in-one\script_${timestamp}.do" -Encoding UTF8

# 2. 通过 API 运行（长时间运行需加 "timeout": 300）
$filePath = ".\.stata-all-in-one\script_${timestamp}.do"
Invoke-WebRequest -Uri "http://127.0.0.1:19521/execute" -Method POST -ContentType "application/json" -Body "{`"file`":`"$filePath`"}" -UseBasicParsing | Select-Object -ExpandProperty Content

# 3. 读取日志文件
Get-Content ".\.stata-all-in-one\output_${timestamp}.log" -Raw
```

### 何时使用哪种执行方式

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| 单行简单命令（如 `summarize`、`describe`） | 直接 `curl` 传 `code` | 输出简短，JSON 转义简单 |
| 2-5 行简单代码 | `\n` 分隔传 `code` | 代码量小，转义可控 |
| 5 行以上或含复杂语法（引号、`$` 宏） | .do 文件 + .log | 避免 JSON 转义出错 |
| 含循环（`foreach`/`forvalues`）、宏定义 | .do 文件 + .log | 多行结构在 JSON 中极易出错 |
| 预计输出很长（大型回归表、多步骤结果） | .do 文件 + .log | agent 可直接读 .log，避免输出截断 |
| 需要生成图表 | .do 文件（服务器自动导出图形） | 画图命令即可，服务器自动导出 SVG+PNG |
| 多步骤分析（加载数据→处理→回归→检验） | .do 文件 + .log | 一次执行保证上下文连续，避免模型分批丢失状态 |
| bootstrap / permute / 大型循环 | .do 文件 + .log + `"timeout": 300` | 默认 30s 不够，需 5 分钟超时 |

### 处理图表输出

**图表由服务器自动导出，无需在代码中写 `graph export`。** 服务器已启用图形捕获（`_gr_list on`），每次执行后自动将生成的图形导出为 SVG 和 PNG，路径在响应 JSON 的 `graphs` 字段中。

**macOS / Linux:**
```bash
# 只需写画图命令，不需要 graph export
curl -s -X POST http://127.0.0.1:19521/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"sysuse auto, clear\nscatter price mpg"}'
```

返回 JSON：
```json
{
  "success": true,
  "returnCode": 0,
  "output": "...",
  "error": "",
  "graphs": [
    {
      "name": "Graph",
      "svg": "./.stata-all-in-one/Graph_1718123456789_0.svg",
      "png": "./.stata-all-in-one/Graph_1718123456789_0.png"
    }
  ]
}
```

然后 agent 使用 Read 工具读取 PNG 文件展示给用户。

**命名图形也会自动导出：**
```bash
# 创建命名图形，服务器自动导出为 Graph_xxx_0.svg / .png 和 mygraph_xxx_1.svg / .png
curl -s -X POST http://127.0.0.1:19521/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"sysuse auto, clear\nscatter price mpg, name(mygraph, replace)"}'
```

**⚠️ 严禁在代码中使用 `graph export`：** 服务器会自动剥离所有 `graph export` 行并追加提示到 output 中。原因是 Stata 的 PNG 导出需要显示服务器，在 AI Skill 环境中会卡死会话。图形由服务器通过 `_gr_list` + sharp 自动导出为 SVG 和 PNG。**唯一例外：** 在 `.do` 文件中可以使用 `quietly graph export ... .svg`（仅 SVG），但通常不需要。

### JSON 转义规则

**macOS bash `-d '...'`（单引号包裹）：**
- 双引号加 `\`：`\"`
- 换行用 `\n`
- 反斜杠用 `\\`

**Windows PowerShell（单引号字符串）：**
- 双引号不需要转义（外层用单引号）
- 换行用 `\n`

**Windows CMD（双引号包裹，所有内部双引号都要转义）：**
- 每个 `"` 变成 `\"`、每个 `\` 变成 `\\`、换行用 `\n`

**建议：复杂代码优先用 .do 文件方式，彻底避免转义问题。**

## 会话状态

Stata 会话是**持久化**的。数据集、全局宏、估计结果在多次调用之间保留：

```bash
# 第一步：加载数据
curl -s -X POST ... -d '{"code":"sysuse auto, clear"}'

# 第二步：运行回归（数据集仍在内存中）
curl -s -X POST ... -d '{"code":"regress price mpg, vce(robust)"}'

# 第三步：使用上一步的估计结果
curl -s -X POST ... -d '{"code":"estimates store model1"}'

# 第四步：查看已存储的估计
curl -s -X POST ... -d '{"code":"estimates list"}'
```

## 中断执行

当 agent 发现代码执行时间过长或需要取消当前命令时，发送中断信号（不关闭服务器，只停止当前 Stata 命令）。

### 工作流：检查 busy → 等待或中断

```bash
# 1. 检查状态
curl -s http://127.0.0.1:19521/status
# → {"busy":true}  Stata 正在忙
# → {"busy":false} Stata 空闲，可以发下一个命令

# 2. 如果 busy=true，可以选择：
#    A. 等待（轮询直到 busy=false）
#    B. 发送中断
curl -s -X POST http://127.0.0.1:19521/break
```

**macOS 轮询等待：**
```bash
for i in $(seq 1 30); do
  result=$(curl -s http://127.0.0.1:19521/status)
  if echo "$result" | grep -q '"busy":false'; then
    echo "✅ Stata idle"
    break
  fi
  sleep 2
done
```

**Windows (PowerShell) 轮询等待：**
```powershell
for ($i=1; $i -le 30; $i++) {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:19521/status" -UseBasicParsing
  if ($r.Content -match '"busy":false') { Write-Host "✅ Stata idle"; break }
  Start-Sleep -Seconds 2
}
```

返回 `{"success":true,"message":"Break signal sent"}`。中断后 Stata 会话仍然可用，可以继续执行新命令。

## 错误处理

### Stata 命令错误（returnCode ≠ 0）
```json
{"success":false,"returnCode":198,"output":"invalid syntax\nr(198);","error":"..."}
```
→ 检查 Stata 语法是否正确（注意逗号、引号等），修正后重试。

### 连接失败（Connection refused / Timeout / OFFLINE）
→ 先判断当前 shell 是否为沙箱、容器或远程环境：

- 如果是沙箱/容器：请求宿主机/非沙箱命令权限调用 `http://127.0.0.1:19521`。在 Codex 中应使用需要用户批准的外部命令执行方式；不要继续在沙箱内重试。
- 如果是宿主机 shell：按上述「启动 VS Code」流程尝试自动启动 VS Code。
- 如果多次尝试均失败：引导用户手动打开 VS Code，确认 `AI Skill Enabled` 已开启，并打开一个 `.do` 文件。

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
-d '{"code":"regress price mpg weight, vce(robust)"}'
# Logit 回归
-d '{"code":"logit foreign mpg price"}'
# 边际效应
-d '{"code":"margins, dydx(*)"}'
```

### 双重差分 (DID)
```bash
# 经典 2×2 DID（需要 treat 和 post 变量）
-d '{"code":"regress y treat##post, vce(cluster id)"}'

# 带协变量的 DID
-d '{"code":"regress y treat##post x1 x2, vce(cluster id)"}'

# 事件研究 (Event Study)
-d '{"code":"eventdd y x1 x2, timevar(rel_time) method(fe, cluster(id))"}'

# 多期 DID (CSDID)
-d '{"code":"csdid y, time(time) gvar(first_treat) method(dripw)"}'
```

### 高维固定效应 (reghdfe)
```bash
# 双向固定效应
-d '{"code":"reghdfe y x, absorb(id year) vce(cluster id)"}'

# 多维固定效应
-d '{"code":"reghdfe y x1 x2, absorb(id year industry) vce(cluster id)"}'

# 保存固定效应
-d '{"code":"reghdfe y x, absorb(id year, savefe)"}'

# 分组回归
-d '{"code":"reghdfe y x, absorb(id year) vce(cluster id) groupvar(region)"}'
```

### 工具变量 + 高维固定效应 (ivreghdfe)
```bash
# IV + 固定效应（内生变量 x2，工具变量 z）
-d '{"code":"ivreghdfe y x1 (x2 = z), absorb(id year) cluster(id)"}'

# 多个内生变量和工具变量
-d '{"code":"ivreghdfe y x1 (x2 x3 = z1 z2), absorb(id year) cluster(id)"}'

# 汇报第一阶段结果
-d '{"code":"ivreghdfe y x1 (x2 = z), absorb(id year) cluster(id) first"}'

# 弱工具变量检验
-d '{"code":"ivreghdfe y x1 (x2 = z), absorb(id year) cluster(id) weaktest"}'
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

- **默认超时 30 秒**：普通命令（`summarize`、`regress` 等）在 30s 内完成。bootstrap、大型循环等需显式设置 `"timeout": 300`（5 分钟），上限 600（10 分钟）
- **严禁 `graph export`**：服务器会自动剥离代码中的 `graph export` 行（因 PNG 导出需要显示服务器会卡死）。图形由服务器自动导出为 SVG + PNG，出现在响应 JSON 的 `graphs` 字段中。唯一的例外：在 `.do` 文件中可使用 `quietly graph export ... .svg`
- **复杂代码（5 行以上、含循环/宏、输出量大）务必使用 .do 文件 + .log 方式**，不要通过 JSON `code` 字段发送。原因：① 避免 JSON 转义错误（引号、`$` 宏等）；② .log 文件捕获完整输出，agent 直接读取更可靠；③ 一次执行保证上下文连续，避免模型在多轮对话中丢失状态
- 所有临时文件写入 `./.stata-all-in-one/`，每次 `/execute` 后服务器按格式分类清理，**每种格式各保留最新 10 个**——agent 无需手动清理
- 不要关闭 VS Code 中的 Stata 会话，以免丢失数据状态
- 图形保存在响应的 `graphs` 数组和 output 末尾的 `[Stata All in One]` 提示中，agent 应用 Read 工具读取 PNG 文件展示给用户
