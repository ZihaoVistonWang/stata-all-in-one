# 项目结构说明

```text
stata-all-in-one/
├── extension.js                    # 根入口（委托到src/extension.js）
├── package.json                    # VS Code扩展配置
├── src/
│   ├── extension.js               # 主入口 - 注册所有命令和提供者
│   ├── utils/
│   │   ├── common.js              # 通用工具函数
│   │   │   ├── showInfo/showWarn/showError()  # 消息提示
│   │   │   ├── isWindows/isMacOS()            # 平台检测
│   │   │   ├── removeSeparators()             # 移除装饰符
│   │   │   ├── isSeparatorLine()              # 分隔线检测
│   │   │   ├── buildSeparatorSegment()        # 构建分隔符
│   │   │   └── 其他工具函数
│   │   └── config.js              # 配置管理
│   │       ├── getShowNumbering()
│   │       ├── getCommentStyle()
│   │       ├── getSeparatorLength()
│   │       └── 其他配置getter
│   └── modules/
│       ├── outlineView.js         # 大纲视图模块
│       │   ├── setHeadingLevel()   # 设置标题级别
│       │   └── createDocumentSymbolProvider()
│       ├── separator.js            # 分隔线模块
│       │   ├── insertSeparator()
│       │   └── registerSeparatorCommands()
│       ├── comment.js              # 注释模块
│       │   ├── toggleComment()
│       │   └── registerCommentCommand()
│       └── runCode/                # 代码执行模块
│           ├── index.js            # 主模块
│           │   ├── runCurrentSection()
│           │   └── registerRunCommand()
│           ├── mac.js              # macOS 实现
│           │   ├── findStataApp()
│           │   └── runOnMac()
│           └── windows.js          # Windows 实现
│               └── runOnWindows()
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
