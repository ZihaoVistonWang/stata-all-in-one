# 项目结构说明

```text
stata-all-in-one/
├── extension.js              # 根入口（委托到src/extension.js）
├── package.json              # VS Code扩展配置
├── grammars/                 # 语法定义文件夹
│   ├── stata.json                  # Stata主语法定义（完整）
│   └── stata-custom.json           # 自定义命令注入语法（动态生成）
├── src/                      # 源代码文件夹
│   ├── extension.js                # 主入口 - 注册所有命令和提供者
│   ├── utils/                      # 工具层
│   │   ├── common.js                      # 通用工具函数
│   │   │   ├── showInfo/showWarn/showError()     # 消息提示
│   │   │   ├── isWindows/isMacOS()               # 平台检测
│   │   │   ├── removeSeparators()                # 移除装饰符
│   │   │   ├── isSeparatorLine()                 # 分隔线检测
│   │   │   ├── buildSeparatorSegment()           # 构建分隔符
│   │   │   └── 其他工具函数
│   │   └── config.js                       # 配置管理
│   │       ├── getnumberingShow()                # 获取是否显示序号
│   │       ├── getCommentStyle()                 # 获取注释风格
│   │       ├── getSeparatorLength()              # 获取分隔符长度
│   │       ├── getCustomCommands()               # 获取自定义命令
│   │       └── 其他配置getter
│   └── modules/                    # 功能模块
│       ├── outlineView.js                  # 大纲视图模块
│       │   ├── setHeadingLevel()                 # 设置标题级别
│       │   └── createDocumentSymbolProvider()    # 提供大纲符号
│       ├── separator.js                    # 分隔线模块
│       │   ├── insertSeparator()                 # 插入分隔线
│       │   └── registerSeparatorCommands()       # 注册分隔线命令
│       ├── comment.js                      # 注释模块
│       │   ├── toggleComment()                   # 切换注释
│       │   └── registerCommentCommand()          # 注册注释命令
│       ├── customCommandHighlight.js       # 自定义命令高亮模块
│       │   ├── buildGrammarPattern()             # 构建正则模式（大小写不敏感）
│       │   ├── createInjectionGrammar()          # 创建注入语法
│       │   ├── updateGrammarFile()               # 动态更新语法文件
│       │   └── registerCustomCommandHighlight()  # 注册并监听配置变化
│       ├── completionProvider.js           # 代码补全模块
│       ├── helpCommand.js                  # Stata帮助命令模块
│       └── runCode/                        # 代码执行模块
│           ├── index.js                          # 主模块
│           │   ├── runCurrentSection()                  # 运行当前节代码
│           │   └── registerRunCommand()                 # 注册运行命令
│           ├── mac.js                            # macOS 实现
│           │   ├── findStataApp()                       # 查找 Stata 应用路径
│           │   └── runOnMac()                           # 在 macOS 上运行代码
│           └── windows.js                        # Windows 实现
│               └── runOnWindows()                       # 在 Windows 上运行代码
```

## 模块说明

### 1. Utils 工具层

#### common.js

- 包含通用工具函数和常量
- 核心函数：
  - `removeSeparators()`: 从标题中移除装饰符（如 `=== Title ===` → `Title`）
  - `isSeparatorLine()`: 判断一行是否是分隔线
  - `buildSeparatorSegment()`: 按指定长度构建分隔符

#### config.js

- 管理所有配置项的获取
- 集中处理VS Code配置读取
- 提供语义化的getter函数，而非直接访问配置

### 2. Modules 功能模块

#### outlineView.js

**职责**: 处理Stata代码的大纲视图和标题结构

- `setHeadingLevel()`: 将选中行转换为指定级别的标题
- `createDocumentSymbolProvider()`: 为VS Code提供符号信息，用于渲染大纲树
- 支持多级标题、序号显示、自动更新等

#### separator.js

**职责**: 管理分隔线插入和管理

- `insertSeparator()`: 插入分隔线（支持独立行或标题修饰）
- 支持多种符号：`-`, `=`, `*`，以及自定义符号
- 智能判断插入位置（上方/下方）

#### comment.js

**职责**: 处理代码注释的切换

- `toggleComment()`: 快速切换行注释或块注释
- 支持多种注释风格：`//`, `*`, `/* ... */`
- 跟随用户配置进行切换

#### customCommandHighlight.js

**职责**: 为用户自定义的Stata第三方命令提供原生语法高亮

- `buildGrammarPattern()`: 根据命令列表生成大小写不敏感的正则表达式模式
  - 例如：`reghdfe` → `[Rr][Ee][Gg][Hh][Dd][Ff][Ee]`
  - 支持转义特殊字符
- `createInjectionGrammar()`: 创建TextMate注入语法对象
  - 使用 `keyword.control.flow.stata` 作用域，与内置命令保持颜色一致
- `updateGrammarFile()`: 动态生成/更新 `grammars/stata-custom.json` 文件
  - 插件激活时读取配置并生成语法文件
- `registerCustomCommandHighlight()`: 主函数
  - 初始化时更新语法文件
  - 监听配置变化，自动提示重载窗口

**工作流程**：

1. 扩展激活 → 读取 `customCommands` 配置
2. 根据命令列表生成正则表达式模式
3. 写入 `stata-custom.json`（TextMate注入语法）
4. VS Code加载该注入语法到源代码中
5. 输入时即时高亮（无延迟）
6. 用户修改配置 → 自动更新语法文件 → 提示重载

#### completionProvider.js

**职责**: 提供Stata命令和函数的代码补全

- 实现VS Code的CompletionItemProvider接口
- 支持命令补全、函数补全
- 跟随用户配置开启/关闭

#### helpCommand.js

**职责**: 集成Stata帮助系统

- 获取选中命令名称
- 调用Stata帮助（`help` 命令）

#### runCode/

**职责**: 跨平台代码执行

- **index.js**: 核心逻辑

  - `getCodeToRun()`: 解析选中或当前section的代码
  - `runCurrentSection()`: 主函数，处理平台差异
- **mac.js**: macOS特定实现

  - 使用AppleScript与Stata通信
  - 自动查找Stata安装位置
  - 支持配置窗口激活
- **windows.js**: Windows特定实现

  - 通过PowerShell脚本与Stata交互
  - 支持用户配置Stata路径

## 开发指南

### 添加新功能

1. 确定功能属于哪个模块（或创建新模块）
2. 在相应模块中实现功能函数
3. 在 `src/extension.js` 中导入和注册
4. 如果需要配置项，在 `utils/config.js` 中添加getter

### 修改现有功能

- 直接编辑对应模块的文件
- 确保更新接口的导入方（如有变化）
- 参考现有模块的模式保持代码风格一致
