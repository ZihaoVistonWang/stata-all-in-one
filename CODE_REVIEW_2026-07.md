# Stata All in One — 全项目 Review（2026-07-26，v0.3.8）

覆盖范围:6 个方向并行审查(嵌入式控制台 UI 层 / 会话·native 后端 / 数据查看器 / 编辑器语言功能 / 安全·脚本 / 工程卫生)。约 3.5 万行 JS/C++。

## 总体结论

项目基础是健康的:322 个单测全过(336ms),i18n 键完全对齐(102/102、234/234),webview 无 XSS(数据一律走 `textContent`),CSP 严格且能抵御 DNS rebinding,数据过滤器是 AST 解释执行而非 `eval` 沙箱。**但有 4 个必须尽快修的问题(1 个 RCE、1 个静默改写用户文件、2 个会导致功能卡死/资源泄漏),以及一批在"大输出 / Windows 非 ASCII 路径 / 并发"场景下的正确性与性能问题。** 另外打包和 git 仓库有明显冗余。

---

## 🔴 P0 — 必修(安全 / 数据损坏 / 功能不可用)

### 1. 外部 App 模式命令注入(RCE) — `src/modules/runCode/externalApp/mac.js:170-172`
`exec()` 的命令字符串由 `appName`、`tmpFilePath` 直接拼接,外层是单引号包裹的 `osascript`。`tmpFilePath = path.join(docDir, 'stata_all_in_one_temp.do')`,`docDir` 是用户 do 文件所在目录,**无任何转义**。
- 触发:受害者克隆/打开一个文件夹名形如 `x';open -a Calculator;'` 的项目(这些字符在 macOS 目录名里都合法),在其中打开 `.do` 文件并点"运行"(External App 是嵌入式控制台不可用时的默认回退)。
- `isStataRunning` 的 `pgrep -x "${appName}"`(:107,双引号内)是第二个注入点,可被 `$(...)` 触发。
- 修复:改用 `execFile('osascript', ['-e', script])` 传参数组,不走 `/bin/sh`;`appName` 用 `^Stata(MP|SE|BE|IC)$` 校验。

### 2. Outline 会静默改写并弄脏用户源文件 — `src/modules/outlineView.js:324-359`
`provideDocumentSymbols`(一个本应只读的符号提供器)在默认配置下,每次大纲/面包屑刷新都对每个标题调用 `removeNumberingFromLine` 发起 `applyEdit`。面包屑默认开启 ⇒ **对所有用户生效**。
- 后果:仅仅打开一个含 `**# 2024 Annual Report` 的文件,标题前的数字就会被正则(`outlineView.js:137`)当作"编号"剥掉,变成 `**# Annual Report`,文件被标记为已修改。开了 `numberingAdd` 时则是每次按键触发 N 个无版本号的并发编辑,可在输入时错位改坏文本。
- 修复:让符号提供器变纯函数;把加/删编号移到显式命令或保存钩子;所有编辑合并成一个带版本号的 `WorkspaceEdit`。

### 3. Windows 初始化失败时永久挂死 — `native/stata_bridge/src/stata_bridge.cc:483-499`
`StataSO_Main` 失败时只置 `main_error` 就退出线程,没动 `g_initialized`/`g_stata_running`,等待循环 `while(!g_initialized && g_stata_running)` 永远自旋。
- 触发:Windows 上 license 过期/DLL 不匹配(现有 `stata.lic` 预检只能发现"文件缺失")⇒ `initSession` 的 IPC 请求永不返回 ⇒ 之后每次运行都无限 await,无报错、无恢复。
- 附带:`main_ok`/`args`/`argv` 按引用捕获进了一个比函数活得久的线程(潜在 UB)。
- 修复:用原子 `init_done` + 全局错误串通知完成;循环等 `init_done`;状态按值捕获。

### 4. worker 关闭→重启竞态:泄漏整个 Stata 进程 + 拒绝新会话 — `src/modules/runCode/embeddedConsole/native/stata_process.js:196-215, 57-61`
`shutdown()` SIGKILL 旧 worker 但没摘掉它的 `once('exit', handleWorkerExit)`;`session.init()` 立刻 fork 新 worker。旧 worker 的 `exit` 几毫秒后触发,因为 `pendingRequests` 是模块级共享的,它会把**新** worker 的 pending 请求 reject 掉,并把新 `worker` 引用置空。
- 触发:用户切换 Stata 版本/库路径 ⇒ 初始化报 "worker exited (SIGKILL)",而新 worker 已在后台把 Stata 加载成孤儿进程(多占一个 license 席位 + 内存,直到窗口关闭)。
- 修复:exit/error 处理器判断 `worker === thisChild` 才生效;pending 请求按 child 隔离。

---

## 🟠 P1 — 高优先级(按主题归并)

### A. 并发 / 双提交竞态(三处 review 指向同一根因)
- **同步 in-flight 标记缺失**:webview `executeInput`(`panel.js:3440`)发消息后不立即禁用输入框,`_status` 要等异步 `status` 回来才变 `running`;dispatch 的 `isWebviewTerminalRunning()` 检查(`execute/index.js:171`)与真正置位之间隔着数秒的 `await`(冷启动)。两次快速回车 ⇒ 两个并发 run 共享同一 `_activeOutputSink`。
- **native 层扛不住并发**:Windows 上并发 `Execute` 给已 joinable 的 `g_poll_thread` 赋值 ⇒ `std::terminate`(`stata_bridge.cc:616`);macOS 上第二个 worker 的 `ClearOutputBuffer` 会在第一个还在 drain 时清空缓冲 ⇒ 输出串台/乱码。
- **数据访问助手串台 + 冻结事件循环**:两个并发 `SubmitStataCommand` 会互换完成信号(`stata_bridge.cc:362-389`);macOS 上 `ExecuteStataAndGetOutput` 跑在 worker 主线程并阻塞在 `g_stata_mutex`,长运行期间数据查看器/变量服务一查询就冻结 worker 事件循环,连 `break` 信号都处理不了,Stop 退化成 750ms SIGKILL。
- 修复:在 `runCurrentSection`/`runArbitraryCode` 顶部同步置一个模块级 in-flight 标记;webview 端立即 `input.disabled = true`;C++ `Execute` 在已有执行时直接 reject;每次提交带独立 ticket。

### B. 大输出下内存无上限 / 卡顿(四处 review 指向同一根因)
- **控制台 host 端 `_history` 永不截断**(`consoleHistory.js`,只在 clear/dispose 时重置),而 DOM 是窗口化的 ⇒ UI 看着有界,host 进程 RSS 却涨到数百 MB 直至 OOM。
- **同一份输出被留存 4–5 份**:worker `latestOutput`、`streamedOutput`、C++ `emitted_output`、`SmclSidecar.finish()` 把整个 SMCL 日志重读成一个大字符串、`entryCharacterMap` 给整段输出**每个字符**分配一个 `{entryIndex,charIndex}` 对象(`fileLinks.js:490`)。
- **数据查看器**:字符串列在读任何一行前就按满长 `N` 预分配数组(`dtaParser.js:746`)⇒ 大文件/构造文件可致多 GB 分配、host 崩溃;过滤/翻页/自适应列宽是主线程同步全表扫描,翻页 O(N²)(`directDtaStore.js:121-185`)⇒ 百万行数据每次刷新都冻结 UI。
- **每次链接更新全量重建 DOM**:`applySemanticLinks` → `replaceRecent` → `renderAllEntries()` 清空并重建全部 ~3000 个节点(`panel.js:3684, 2908`),流式期间每 200ms 触发一次 ⇒ 回归输出可见卡顿、吃满一个核。
- **每条命令固定 ~250–350ms 隐藏开销**:C++ drain 前强制 sleep 50ms(`stata_bridge.cc:741`),而每条可见命令背后还有 `_gr_list list`、临时 do 文件读 `r(_grlist)`、`pwd` 读共约 4 次 execute ⇒ 10 行选区浪费 ~3 秒。
- 修复:`_history` 上限化(环形缓冲);SMCL 增量解析(offset reader 已存在);索引用 typed array;数据查看器过滤结果建一次索引数组后翻页复用 + `setImmediate` 分片;`replaceRecent` 只 splice 变化节点(已算好 `localStart`/`deleteCount`);drain 在 `execution_finished` 后立即读、只在非空读之间 sleep;合并/按需触发 sidecar 查询。

### C. Windows / 国际化正确性
- **ANSI Win32 API 收到 UTF-8 字符串** — `stata_bridge.cc:135-151,420-428`:`LoadLibraryA`/`SetDllDirectoryA`/`SetEnvironmentVariableA` 拿到的是 `Utf8Value()` 字节。在 GBK 系统(zh-cn 是核心受众)上,装在 `D:\软件\Stata18\mp-64.dll` 这类非 ASCII 路径下会加载失败或写乱 `SYSDIR_STATA`。修复:`MultiByteToWideChar` 转 UTF-16 走 `W` 系列 API。
- **`//` 注释剥离破坏 URL** — `mac.js:1014`(windows.js:915 重复):`stripTrailingLineComment` 在任意未加引号的 `//` 处截断,`use https://www.stata-press.com/...` 被截成 `use https:` 后直接执行,而回显还是原文 ⇒ 报错与显示不符。修复:仅当 `//`/`///` 在行首或前面是空白时才当注释(与 Stata 一致)。

### D. 激活与启动成本(每个窗口都付费)
- **`onStartupFinished` 在每个窗口拉起完整 Stata 引擎** — `extension.js:410`:默认 `embeddedConsole` 且装了 Stata 时,每个窗口(包括非 Stata 项目)都会 dlopen dylib 启动 in-process 会话 ⇒ 每窗口一份 CPU/RAM,可能每窗口一个 license 席位。真正需要 `onStartupFinished` 的只有 setup 服务器。
- **`activate()` 内联 await 慢操作 + 可能被模态框挂住** — `extension.js:416`:先同步跑 `system_profiler SPFontsDataType`(15s 超时,且每次升级都重跑),再 `await startupStataSetupPromise`(首次运行强制模态框 ⇒ 未确认前 `activate()` 一直不 resolve)。修复:先注册所有命令/provider,字体探测与 setup 改 fire-and-forget,嵌入式会话延迟到首次打开/运行 `.do` 时再启动。

### E. 停止 / 会话健壮性
- **首次点 Stop 750ms 后就 SIGKILL 整个会话** — `stata_process.js:184`:若 Stata 没在 `FORCE_STOP_GRACE_MS` 内响应 `SetBreak`(大数据 `sort`/`import` 时很常见,恰恰是用户最想停的时候),worker 被杀 ⇒ 内存数据、宏、估计结果全丢,下次冷启动。修复:750ms 只做"响应性检查",SIGKILL 升级到"第二次点击"或更长且有可见倒计时。
- **restart/reset 与新 run 无锁竞态** — `session.js:326`:`waitUntilIdle()` 与 `resetState()` 之间的按键会把用户命令插到 `clear all`/`cd` 中间;若有 pending 永不 settle(见 P0-3),`waitUntilIdle` 会永久挂住 restart。

### F. 安全(P1)
- **Windows 启动的 Stata 路径可被工作区设置左右** — `windows.js:149` `Start-Process -FilePath $stataPath`(还会 `-Verb RunAs` 提权 `/Register`):`stataPathOnWindows` 可由恶意仓库的 `.vscode/settings.json` 或 localhost `/setup` 设置,现有校验只查基名匹配 `Stata*.exe` + 文件存在,`\\attacker\share\StataMP-64.exe` 可绕过。修复:对可信安装列表 + 签名/发行者校验,execution path 绝不接受来自工作区设置/localhost 的值而不经用户确认。
- **`appName` 命令替换注入** — `mac.js:107,170`:`appName` 可经 `/setup` 信号从攻击者提供的 `sysdirStata` 构造,`pgrep -x "Stata$(touch ~/pwned)"` 触发替换。(与 P0-1 同源,一并修。)
- **localhost setup 服务器默认对所有本地进程开放** — `extension.js:355`:任何本地进程可 `GET /status` 读到轮换 token 再驱动 `/setup` 改写 Stata 安装路径(喂给上面两条)。**好消息:对浏览器/DNS-rebinding 防得很好**(只绑 127.0.0.1、强制 `Host` 头、拒绝带 `Origin` 的请求、无 CORS、GET-only、无文件服务、token 门控)。修复:多用户主机上把 localhost 边界视为不可信,`/status` 也应需要网页拿不到的 nonce。

### G. 编辑器 provider 性能与正确性
- **每次按键两遍全文档扫描,无 debounce/缓存** — `variableSuggestionService.js:142`:`onDidChangeTextDocument` 全文跑 6+ 正则/行,补全又在同一次按键绕过缓存再扫一遍,并每次重建 ~450 命令的 Set。修复:按 `uri`+`version` 缓存,change 监听 debounce ~300ms,命令池预算。
- **rename 会改到字符串/注释里的匹配,且不理会 CancellationToken** — `renameProvider.js:297`:重命名变量 `price` 会连 `label variable price "price in US dollars"` 里引号内的也改。修复:先按 token 分类跳过字符串/注释区间;`token.isCancellationRequested` 时退出。
- **hover 先做贵活再做便宜的拒绝判断** — `hoverProvider.js:2004`:每次 hover 先遍历数千 key + 两遍 ~450 builtin,才做 O(1) 的位置/注释拒绝;首次命中还同步 `readFileSync` + 全量 SMCL 解析(可达 100KB)。修复:位置/注释/黑名单判断前置,I/O 前查 token,改 `fs.promises`。
- **`customCommandHighlight.js` 运行时往安装目录写 `grammars/stata-custom.json`** — `:58-85`:只读安装上写失败(仅 `console.error`,且返回 false 连重载提示都不弹);每次升级目录被重置;**开发者自己的个人命令 `repaircn`/`bdiff` 被提交进 git 并打进 VSIX**;多窗口 last-writer-wins。每次改动要整窗口 reload。修复:改用 `DocumentSemanticTokensProvider` 直接按配置高亮,不写文件、不 reload、支持工作区级。
- **逐行解析忽略 `///` 续行、`#delimit ;`、`/* */` 块** — `completionContext.js:163` 等:`reg y ///` 的续行首词被当成命令位置;delimit 模式下注释/命令/变量提取全错;多行块注释内的 hover/补全不被抑制。修复:抽一个共享的、感知续行/delimit/字符串/块注释状态的行分类器,供 hover/补全/rename/outline 共用。

### H. 数据查看器生命周期与健壮性
- **单一 `_panels.file` 槽装不下两个 `.dta`** — `panel.js:1871`:开第二个文件覆盖槽位,第一个 panel 变僵尸,dispose 时 `if(_panels[mode]===panel)` 为假 ⇒ 其整份解析数据永不释放。修复:panel/ready/pendingFilter 按 panel(WeakMap)或 filePath 键控。
- **列存储用不可信变量名做 `{}` 的 key** — `dtaParser.js:828`:一个名叫 `__proto__` 的合法 Stata 变量会把对象原型改成 typed array;filter compiler 查 `constructor`/`toString` 等继承 key 会绕过"未知变量"错误返回 undefined 结果。修复:`Object.create(null)`/`Map` + `hasOwnProperty` 门控。
- **250 行死的 Stata-session 数据路径把 filter 文本插进实时 Stata 命令** — `provider.js:106-286`:无生产调用者,却把 `ifClause`/`inClause` 直接拼进 `replace ... if !(...)`/`export delimited`。修复:删掉,`splitFilterSpec` 单独成模块。

---

## 🟡 P2 — 可维护性 / 打包 / 结构

**打包与仓库**
- VSIX 未压缩体积约 47% 是垃圾:`native/stata_bridge/build/**`(1.44MB 中间产物)、`src/__tests__/**`(38 个测试)、README-only 图片(`example-marked-en.jpg` 1.06MB 等)、`TODO.md`。补进 `.vscodeignore`,长期用 `vsce package --target` 停止跨平台混装 `bin/`。
- git 历史里 26 个 `.vsix`(size-pack 68.97 MiB),`.gitignore` 里 `*.vsix` 被注释掉了。改发 GitHub Releases,`releases/` 加进 `.gitignore`,可选 `git filter-repo` 清历史。

**重复代码**
- `mac.js`/`windows.js` ~700 行几乎逐行重复且已开始漂移(`getProgressPayloadFromLine` 正则已不一致)⇒ 抽 `embeddedConsoleRunner.js`,平台差异用钩子注入。
- builtin 命令表在 rename/completion/hover 各抄一份(~85 行)并已漂移:rename 里有拼写错误项 `'sun'` 会挡住真名叫 `sun` 的变量,三份都重复 `'histogram'`。`extractVariableNames` 在 completionProvider 里也有一份死代码。⇒ 合并成单一数据模块。
- `renderer.js` 约 40–50% 是死代码(整条 ANSI 字符串管线 `paint`/`render*` 无生产调用者,仅被单测撑活)⇒ 删除,消除段路径与 ANSI 路径悄悄分叉的风险。
- `escapeHtml` 在 `panel.js:3776` 与 `consoleExport.js:225` 重复;webview 的 nonce/CSP/主题/字体样板在控制台与数据查看器两个 panel 间复制粘贴 ⇒ 抽共享 `webviewShell`。

**结构**
- `panel.js` 3801 行,其中 `getWebviewHtml` 是一个 ~2540 行的模板字符串(760 行 CSS + 1690 行客户端 JS)⇒ 抽到 `media/console.js` + `media/console.css` 经 `asWebviewUri` 加载,客户端半边才能被 lint/测试,并可让 CSP 去掉 `style-src 'unsafe-inline'`。
- `common.js` 790 行 god module(65% 是 UI_TEXT 字典,还混了分隔符/标题的领域解析)⇒ i18n 拆到 `src/i18n/`,分隔符解析挪到 `separator.js` 旁。
- `updateNotification.js` 把每个版本的中英 changelog 硬编码在源码里(~21KB)且只显示当前版本 ⇒ 只留最近 1–3 条或打包时从 CHANGELOG.md 生成。

**配置 / 契约**
- 11 组重复 keybindings(`setLevelN`+`contextSetLevelN` 等,前者是死的);7 个 `debug*` 命令暴露在命令面板;52 个命令都没 `category`。
- `engines.vscode ^1.70.0` 低报真实底线:`vscode.l10n`(1.73)已用于 `dtaParser.js:33`,`"editor.wordBasedSuggestions":"off"` 字符串形式需 1.85。⇒ 提到 ^1.73。
- `npm test` 的 glob 依赖 node 版本(node 20 会失败)⇒ 改 `node --test src/__tests__/`。
- `config.js` 有 5 个代码兜底默认值与 package.json 的 schema 默认值矛盾(schema 胜出,但误导读者)⇒ 对齐。
- CSP nonce 用 `String(Date.now())`(两个 panel + dataViewer 都是)⇒ 改 `crypto.randomBytes(16)`。
- 无 CI、无 linter ⇒ 加 ~20 行 GitHub Actions(node 20/22 矩阵 + `npm test` + `vsce package` dry-run,能自动抓到打包混入 native/build 这类问题)+ flat-config ESLint。

**其他小项**
- `lineBreak.js:8` 导入了不存在的 `showWarning`(实际导出是 `showWarn`)⇒ 无编辑器时会抛 TypeError。
- `renameProvider.js:333` 的 `escapeRegExp` 字符类写坏(`/[.*+?^${}()|[\\]\\]/g`),目前因只用 `\w` word range 而潜伏。
- `variableSuggestionService` 的 `documentVars` 无 `onDidCloseTextDocument` 清理;separator 在 `workspaceState` 给每个打开过的 `.do` 存一条永不清理的记录。
- `helpCommand.js:110`、`execute/tempfile.js` 把固定名临时 do 文件写进用户目录(污染项目、只读目录失败、两个窗口相互覆盖)⇒ 写 `os.tmpdir()` 唯一名并即时清理。
- AI Skill 安装提示让 AI agent 去 fetch 远程 `installation.md` 并安装/运行 native 服务,无 hash/签名钉扎;卸载扩展时 19522 端口的 Rust 服务不会被停止/移除。
- `enableHoverDocs` 只在激活时读一次,改设置要 reload 才生效。

---

## 建议的修复顺序

1. **本周(安全 + 数据安全)**:P0-1 shell 注入、P0-2 Outline 改写文件。这两个一个是 RCE、一个默认伤所有用户的源文件,风险最高、改动局部。
2. **下一个补丁版**:P0-3/P0-4(Windows 挂死 + worker 泄漏)、B 主题的 `_history` 上限 + 数据查看器 OOM/卡顿、C 主题(Windows 非 ASCII 路径 + `//` URL 截断)——这些直接影响 Windows 与大数据用户的可用性。
3. **一个小重构窗口**:A 并发竞态(同步 in-flight 标记,一处修多处受益)、D 激活成本(延迟启动 Stata)、G 编辑器 provider 性能。
4. **持续**:抽 `embeddedConsoleRunner`、合并命令表、删 `renderer.js` 死代码、`getWebviewHtml` 外置、打包瘦身、加 CI/ESLint。

## 快速见效(各 <1 小时)
- 扩展 `.vscodeignore`(native/build、tests、README 图、TODO.md)重打包 → 下载体积约减半。
- 修 `npm test` 的 glob;删 11 组重复 keybindings;从面板隐藏 7 个 `debug*` 命令。
- `releases/` 加进 `.gitignore` 停止提交 vsix;`engines.vscode` 提到 ^1.73;CSP nonce 改 `crypto.randomBytes`。
