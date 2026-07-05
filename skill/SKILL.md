---
name: stata-ai-skill
description: Run Stata code and statistical analysis through the native Stata AI Skill background service at http://127.0.0.1:19522. Use when the user asks to run Stata commands, regressions, summarize data, t tests, hypothesis tests, do-files, .do scripts, .dta datasets, econometrics workflows, or search Stata articles and cookbook-style resources with lianxh. Uses the packaged native executable and localhost HTTP API.
---

# Stata AI Skill

Requires Apple Silicon macOS or Windows, the native `stata-ai-skill`
executable, and a locally installed/licensed Stata. Intel Mac is not
supported. If automatic Stata discovery fails, ask the user where the Stata
app/program is installed and configure it with the executable CLI.

This native service provides the Stata AI Skill HTTP workflow through the
packaged executable and localhost API.

Use the native localhost service at `http://127.0.0.1:19522` to run Stata.
Do not import internal modules. The stable interface is HTTP.

## Locate The Executable

Agents must resolve the executable from this skill directory before using PATH
or build outputs. Do not require the user to know Cargo's `target/release`
directory.

Expected packaged layout:

```text
stata-ai-skill/
  SKILL.md
  bin/
    macos/
      stata-ai-skill            (legacy fallback)
    macos-arm64/
      stata-ai-skill            (Apple Silicon)
    windows/
      stata-ai-skill.exe          (x64)
    windows-arm64/
      stata-ai-skill.exe          (ARM64)
```

Resolution order:

1. If `STATA_AI_SKILL_BIN` is set, use that exact executable path.
2. macOS Apple Silicon: use `<this-skill-directory>/bin/macos-arm64/stata-ai-skill`.
3. macOS Intel (`x86_64`): stop and tell the user this skill does not support Intel Mac.
4. macOS Apple Silicon fallback: use `<this-skill-directory>/bin/macos/stata-ai-skill`.
5. Windows x64: use `<this-skill-directory>\bin\windows\stata-ai-skill.exe`.
6. Windows ARM64: use `<this-skill-directory>\bin\windows-arm64\stata-ai-skill.exe`.
7. Fallback only if packaged binary is missing on a supported platform: use `stata-ai-skill` from PATH.

To detect macOS architecture:

```bash
case "$(uname -m)" in
  arm64) exe="./bin/macos-arm64/stata-ai-skill" ;;
  x86_64)
    echo "Stata AI Skill does not support Intel Mac."
    exit 1
    ;;
  *) exe="./bin/macos/stata-ai-skill" ;;
esac
```

To detect Windows architecture from PowerShell:

```powershell
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
    $exe = ".\bin\windows-arm64\stata-ai-skill.exe"
} else {
    $exe = ".\bin\windows\stata-ai-skill.exe"
}
```

For development builds, refresh the packaged executable with:

```bash
cargo run -p xtask -- dist
```

When writing commands below, replace `stata-ai-skill` with the resolved
executable path. Examples:

```bash
# macOS, from the skill directory
./bin/macos-arm64/stata-ai-skill serve
```

```powershell
# Windows, from the skill directory
.\bin\windows\stata-ai-skill.exe serve
```

## Agent Workflow

1. Check whether the service is running:

```bash
curl -s --connect-timeout 2 http://127.0.0.1:19522/status 2>/dev/null || echo "OFFLINE"
```

2. If offline, start the native executable:

```bash
stata-ai-skill serve
```

Use the resolved executable path from "Locate The Executable"; the bare command
above is only shorthand. Run the service as a long-lived background process so
the agent can continue issuing HTTP requests. On macOS/zsh:

```bash
nohup ./bin/macos-arm64/stata-ai-skill serve > /tmp/stata-ai-skill.log 2>&1 &
```

If startup fails because the port is already in use, first recheck `/status`.
If another Stata AI Skill service is already responding, reuse it. Otherwise
choose another port and persist it:

```bash
./bin/macos-arm64/stata-ai-skill config set --port 19523
nohup ./bin/macos-arm64/stata-ai-skill serve > /tmp/stata-ai-skill.log 2>&1 &
curl -s http://127.0.0.1:19523/status
```

3. If `/status` returns `needsConfiguration: true`, ask the user where the Stata
app/program is installed. Avoid saying only "Stata path" because some users do
not know what a path is. Then configure it:

```bash
stata-ai-skill config set --stata-path "<USER_PROVIDED_STATA_PATH>"
```

Again, use the resolved executable path. For example:

```bash
./bin/macos/stata-ai-skill config set --stata-path "/Applications/StataNow/StataMP.app"
```

```powershell
.\bin\windows\stata-ai-skill.exe config set --stata-path "C:\Program Files\Stata18"
```

**Important:** After running `config set`, the running service does NOT pick up
the new configuration. You must shut down and restart the service:

```bash
curl -s -X POST http://127.0.0.1:19522/shutdown
# then start again:
./bin/macos/stata-ai-skill serve
```

User-facing wording:

- macOS: "Open Finder > Applications, find the Stata app icon, and tell me its
  name/location. You can also drag the Stata app into Terminal to reveal a path
  like `/Applications/StataNow/StataMP.app`."
- Windows: "Find Stata in the Start menu or under `C:\Program Files\Stata...`.
  The program may be named `StataMP-64.exe`, `StataSE-64.exe`, or similar."

Accepted paths include the Stata app/exe, install directory, or shared library:

- macOS: `/Applications/StataMP.app`
- macOS: `/Applications/StataNow/StataMP.app`
- macOS: `/Applications/StataMP.app/Contents/MacOS/libstata-mp.dylib`
- Windows: `C:\Program Files\Stata18`
- Windows: `C:\Program Files\Stata18\StataMP-64.exe`
- Windows: `C:\Program Files\Stata18\mp-64.dll`

4. Recheck `/status`. If `sessionActive: true`, call `/execute`.

`/status` includes diagnostic fields agents should use for troubleshooting:

- `config.port`
- `config.stataPath`
- `config.configFile`
- `config.logDir`
- `config.tempDir`
- `config.graphDir`
- `capabilities.cwd`
- `capabilities.timeoutMaxSeconds`

If `/status` returns `needsLicense: true` or `missing: "stata_license"`, Stata
was found but the license file was not found. Tell the user:

"Stata is installed, but the service cannot find the Stata license file
`stata.lic` / `STATA.lic`. Please open Stata once to confirm it is licensed, or
check that the license file exists in the Stata installation folder."

Common license locations:

- macOS: `/Applications/StataNow/stata.lic`
- Windows: `C:\Program Files\Stata18\STATA.lic`

## Execute

### Read Command Help First

Before using a specific Stata command, first run `help <command>` through
`/execute` and read its documentation. Confirm the command syntax, options, and
version-specific behavior before composing the final analysis command. For
example, run `help regress` before using `regress`.

If Stata reports that the help file or command is unavailable, do not guess its
syntax. Report the missing command and request approval before installing any
community-contributed package.

### Run Existing Do-Files Directly

When the user provides an existing `.do` file, pass its path in the `file`
field. Prefer this over copying the file, reading it with Python or shell
commands, or sending its contents through `code`.

- Use `file` for an existing `.do` file and `code` for inline Stata commands.
- Use an absolute `file` path whenever possible. Paths containing spaces are
  supported; JSON-encode the path normally and do not copy it to `/tmp`.
- Set `cwd` to the do-file's project directory when it uses relative paths for
  datasets, included do-files, logs, or generated output.
- The file must be accessible to the local Stata AI Skill service process.
- Do not send both `file` and `code`; if both are present, `file` takes
  precedence.

#### macOS And Linux

Use `curl` from bash or zsh:

```bash
curl -s -X POST http://127.0.0.1:19522/execute \
  -H "Content-Type: application/json" \
  -d '{"file":"/Users/me/project/analysis.do","cwd":"/Users/me/project","timeout":120}'
```

#### Windows Command Prompt

Windows supports both Command Prompt (`cmd.exe`) and PowerShell; PowerShell is
not required. From Command Prompt, escape the JSON double quotes:

```cmd
curl.exe -s -X POST http://127.0.0.1:19522/execute -H "Content-Type: application/json" -d "{\"file\":\"C:\\Users\\me\\project\\analysis.do\",\"cwd\":\"C:\\Users\\me\\project\",\"timeout\":120}"
```

#### Windows PowerShell

Write the request JSON, not the do-file, to a temporary UTF-8 file without a
BOM, then send it with `curl.exe`:

```powershell
$body = '{"file":"C:\\Users\\me\\project\\analysis.do","cwd":"C:\\Users\\me\\project","timeout":120}'
[System.IO.File]::WriteAllText("$env:TEMP\stata_body.json", $body, [System.Text.UTF8Encoding]::new($false))
curl.exe -s -X POST http://127.0.0.1:19522/execute `
  -H "Content-Type: application/json" `
  --data-binary "@$env:TEMP\stata_body.json"
```

In all three cases, the service executes the do-file directly and applies `cwd`
before the `do` command.

### PowerShell Curl Notes

In PowerShell, `curl.exe -d` with a JSON body containing double quotes is
often mangled because PowerShell intercepts the quotes before they reach curl.
The double quotes inside `-d '{"code":"..."}'` get stripped or misinterpreted.

**Do NOT use inline JSON with curl.exe in PowerShell.** Instead, always write
the JSON body to a temporary file and use `--data-binary @file`.

**Critical:** PowerShell 5.1's `Out-File -Encoding utf8` writes a UTF-8 BOM
(byte-order mark) that breaks JSON parsers (serde_json returns "expected value
at line 1 column 1"). Use `[System.IO.File]::WriteAllText` with
`[System.Text.UTF8Encoding]::new($false)` to write clean UTF-8 without BOM:

```powershell
# Correct — UTF-8 without BOM
$body = '{"code":"display 2+2"}'
[System.IO.File]::WriteAllText("$env:TEMP\stata_body.json", $body, [System.Text.UTF8Encoding]::new($false))
curl.exe -s -X POST http://127.0.0.1:19522/execute `
  -H "Content-Type: application/json" `
  --data-binary "@$env:TEMP\stata_body.json"
```

`Invoke-RestMethod` in PowerShell 5.1 has similar encoding issues; prefer the
file approach above.

For multi-line Stata code, use a literal `\n` (backslash + n) inside the JSON
string — the JSON parser will convert it to an actual newline:

```powershell
$body = '{"code":"sysuse auto, clear\nsummarize price mpg"}'
[System.IO.File]::WriteAllText("$env:TEMP\stata_body.json", $body, [System.Text.UTF8Encoding]::new($false))
curl.exe -s -X POST http://127.0.0.1:19522/execute `
  -H "Content-Type: application/json" `
  --data-binary "@$env:TEMP\stata_body.json"
```

On macOS/Linux (bash/zsh), inline JSON works as expected:

```bash
curl -s -X POST http://127.0.0.1:19522/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"display 2+2"}'
```

Response:

```json
{
  "success": true,
  "returnCode": 0,
  "output": "4",
  "error": "",
  "graphs": []
}
```

For long commands, set `timeout` in seconds:

```bash
curl -s -X POST http://127.0.0.1:19522/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"bootstrap r(mean), reps(1000): summarize price", "timeout": 300}'
```

For workflows that use relative paths, set `cwd`. The service prepends a Stata
`cd` command before running inline code or a do-file:

```bash
curl -s -X POST http://127.0.0.1:19522/execute \
  -H "Content-Type: application/json" \
  -d '{"cwd":"/Users/me/project","code":"use data/auto.dta, clear\nsummarize"}'
```

### Graph Export

The standalone service enables Stata graph capture with `quietly _gr_list on`
after session initialization. If user code contains `graph export`,
`. graph export`, or `quietly graph export`, the service parses the requested
path and common options such as `replace` and `name(...)`.

Explicit SVG exports are executed safely and returned in the response
`graphs` array:

```json
[{ "name": "Graph", "svg": "/absolute/path/to/foo.svg", "png": null }]
```

PNG/JPG/JPEG exports are supported without asking Stata to write those formats
directly. The standalone service exports SVG first, converts it with bundled
Rust libraries, keeps the SVG path, and writes the requested bitmap path. For
PNG requests, the `png` field contains the generated PNG path. For JPG/JPEG
requests, `png` remains `null` and the graph object includes `file` and
`format` fields for the generated bitmap. Other unsafe bitmap formats such as
TIF and TIFF are still rewritten to SVG and reported in `output`.

If user code does not contain an explicit `graph export`, successful executions
keep the automatic `_gr_list` SVG export behavior and return generated SVG
paths under `graphs`.

## Lianxh Search

When the user needs Stata cookbook-style examples, command tutorials, or
high-quality Stata articles, use the `lianxh` Stata command to search
**Lianxh** (连享会, https://www.lianxh.cn/), a third-party website that
publishes Stata tutorials, econometrics articles, and resource lists.

### Limits

Limit each user task to at most three `lianxh <keywords>, md` search queries to
avoid excessive output and token use. `help lianxh_cn`, `help lianxh`, and an
explicitly approved `ssc install lianxh` do not count toward this three-query
search limit.

### Installation

Before the first `lianxh` search in a conversation, check whether the command
is installed:

```stata
which lianxh
```

If Stata reports "command lianxh not found", stop before installing anything.
Use the host agent's best available interactive confirmation mechanism to
present a yes/no choice to the user. Prefer a structured approval or binary
choice UI when available. If the host does not expose such a tool in the current
mode, ask in ordinary chat and wait for an explicit user reply. Do not treat a
general request to "test lianxh" as permission to install it.

The prompt must explain what Lianxh is, why installing the command helps (it
enables help files and structured search directly from Stata), and where it
installs (SSC writes into the local Stata ado directory). The table below maps
agent platforms to equivalent mechanisms:

| Agent / Platform | Interactive prompt mechanism |
|---|---|
| **Claude Code** | `AskUserQuestion` tool — set `"header"` to `"Install lianxh?"`, provide two options: **安装 (Recommended)** and **跳过** |
| **Codex (OpenAI)** | Use a structured approval/question tool if the current surface exposes one; otherwise ask in chat and wait |
| **OpenCode** | Use CLI interactive input (`read` / prompt) or stop and ask in chat |
| **Cline / Roo Code** | `ask_followup_question` tool with two options |
| **Aider** | Architecture-level prompt via `/ask` or inline confirmation |
| **GitHub Copilot Chat** | `followup` prompt with option array |
| **Hermes** | Custom dialog tool — format as a structured binary choice |

Use this fallback wording when no structured prompt tool is available:

```text
检测到 lianxh 未安装。

lianxh 是连享会提供的第三方 Stata 命令。安装后会写入本机 Stata ado 目录，
用于通过 Stata 检索连享会文章、教程和资源列表。

是否允许安装 lianxh？
- 安装：运行 ssc install lianxh，然后继续测试/检索
- 跳过：不修改 Stata ado 环境，并跳过 lianxh 检索
```

Only if the user explicitly agrees, run:

```stata
ssc install lianxh
```

Then proceed with the help and search steps below. If the user declines, skip
`lianxh`-based search and continue with available local context.

### Help

After confirming `lianxh` is installed, inspect the help file to confirm
command syntax and available filters:

```stata
help lianxh_cn
```

If Chinese help is not suitable for the conversation, or if it is unavailable,
use:

```stata
help lianxh
```

### Search

Use the `lianxh` command with Markdown output so article titles and links are
easy to inspect:

```stata
lianxh 关键词1 关键词2 关键词3, md
```

- Prefer Chinese search keywords when they fit the user's topic.
- Run no more than three search commands for the task.
- Treat the Markdown list returned by `lianxh ..., md` as candidate references.
- Use the article titles and `https://www.lianxh.cn/` links to decide which
  resources are relevant before summarizing or citing them.

If installation or search fails because Stata cannot reach the network, report
the error to the user and continue with available local context.

### Timeout

A timed-out `lianxh` execution returns HTTP 408 with:

```json
{"success":false,"returnCode":-1,"output":"Execution timed out after 3s","error":"Execution timed out after 3s","graphs":[]}
```

### Session Recovery After Timeout

After a timeout kills execution, the Stata session may briefly be in a
recovering state. The **first** execution immediately after a timeout may
return a stale timeout error even though Stata completed. Always verify by
running a trivial command after timeout:

```bash
curl -s -X POST http://127.0.0.1:19522/execute \
  -H "Content-Type: application/json" \
  -d '{"code":"display 123"}'
```

If it returns `success: true`, the session is healthy. If it returns another
timeout error, check `/status` and retry once more. The service itself does
not crash on timeout.

## Break And Shutdown

Interrupt the current Stata execution:

```bash
curl -s -X POST http://127.0.0.1:19522/break
```

Close the background service:

```bash
curl -s -X POST http://127.0.0.1:19522/shutdown
```

## Files

The service uses system directories only. It does not create `.stata-all-in-one/`
in the current repository or working directory. Temporary `.do` files are unique
and deleted after execution. Graphs are first exported as SVG and returned as
absolute paths in `graphs`; explicit PNG/JPG/JPEG requests are converted from
that SVG without requiring a system image converter.
