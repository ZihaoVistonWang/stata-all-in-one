const vscode = require('vscode');

// function symbolKindByLevel(level) {
//     switch (level) {
//         case 1:
//             return vscode.SymbolKind.Method;      // 一级标题
//         case 2:
//             return vscode.SymbolKind.Interface;   // 二级标题
//         case 3:
//             return vscode.SymbolKind.Field;       // 三级标题
//         case 4:
//             return vscode.SymbolKind.Property;      // 四级标题
//         default:
//             return vscode.SymbolKind.Class;    // 更深层
//     }
// }

// 设置标题级别的函数
function setHeadingLevel(level) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    
    // 获取选中的行，如果没有选中则使用当前行
    let startLine = selection.start.line;
    let endLine = selection.end.line;
    
    // 如果没有选中任何内容，只处理当前行
    if (selection.isEmpty) {
        endLine = startLine;
    }

    editor.edit(editBuilder => {
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text;
            
            // 删除行首的所有标题标记（**#、**##、***### 等）
            // 匹配模式：行首的任意数量的星号，后跟任意数量的#，再跟空格
            const cleanedText = lineText.replace(/^(\*+\s*#+\s?)+/, '');
            
            let newText;
            if (level === 0) {
                // level 0 表示清除标题，只保留清理后的文本
                newText = cleanedText;
            } else {
                // 添加 level 个 # 和一个空格
                const hashes = '#'.repeat(level);
                newText = `**${hashes} ${cleanedText}`;
            }
            
            // 替换整行
            const range = new vscode.Range(lineNum, 0, lineNum, lineText.length);
            editBuilder.replace(range, newText);
        }
    });
}

// 自动更新文件内容，添加或删除序号
function updateFileContentWithNumbering(document, items, counters) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }

    const config = vscode.workspace.getConfiguration('stata-outline');
    const showNumbering = config.get('showNumbering', true);
    const updateFileContent = config.get('updateFileContent', false);

    // 只在启用文件更新时执行
    if (!updateFileContent) {
        return;
    }

    const editBuilder = new vscode.WorkspaceEdit();
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const line = document.lineAt(item.range.start.line);
        const lineText = line.text;
        
        let newText;
        
        if (showNumbering) {
            // 生成序号
            const numbering = counters.slice(0, item.level).join('.');
            
            // 检查当前行是否已经包含序号（避免重复添加）
            const regex = /^\*{1,2}\s*(#+)\s+(\d+(?:\.\d+)*)\s+(.*)$/;
            const match = regex.exec(lineText);
            
            if (match) {
                // 已有序号，替换为新的序号（确保序号正确）
                const hashes = match[1];
                const title = match[3];
                newText = `**${hashes} ${numbering} ${title}`;
            } else {
                // 没有序号，添加序号
                const regexNoNumber = /^\*{1,2}\s*(#+)\s+(.*)$/;
                const matchNoNumber = regexNoNumber.exec(lineText);
                if (matchNoNumber) {
                    const hashes = matchNoNumber[1];
                    const title = matchNoNumber[2];
                    newText = `**${hashes} ${numbering} ${title}`;
                } else {
                    continue; // 不是标题行，跳过
                }
            }
        } else {
            // 关闭序号显示，删除所有序号
            const regexWithNumber = /^\*{1,2}\s*(#+)\s+(?:\d+(?:\.\d+)*)\s+(.*)$/;
            const match = regexWithNumber.exec(lineText);
            
            if (match) {
                // 有序号，删除序号
                const hashes = match[1];
                const title = match[2];
                newText = `**${hashes} ${title}`;
            } else {
                // 没有序号，保持不变
                continue;
            }
        }
        
        if (newText && newText !== lineText) {
            const range = new vscode.Range(item.range.start.line, 0, item.range.start.line, lineText.length);
            editBuilder.replace(document.uri, range, newText);
        }
    }

    // 应用编辑
    if (editBuilder.size > 0) {
        vscode.workspace.applyEdit(editBuilder).then(success => {
            if (!success) {
                console.error('Failed to update file content with numbering');
            }
        });
    }
}

// 删除指定行的序号
function removeNumberingFromLine(document, item) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }

    const line = document.lineAt(item.range.start.line);
    const lineText = line.text;
    
    // 检查是否包含序号
    const regexWithNumber = /^\*{1,2}\s*(#+)\s+(?:\d+(?:\.\d+)*)\s+(.*)$/;
    const match = regexWithNumber.exec(lineText);
    
    if (match) {
        // 有序号，删除序号
        const hashes = match[1];
        const title = match[2];
        const newText = `**${hashes} ${title}`;
        
        const range = new vscode.Range(item.range.start.line, 0, item.range.start.line, lineText.length);
        const editBuilder = new vscode.WorkspaceEdit();
        editBuilder.replace(document.uri, range, newText);
        
        vscode.workspace.applyEdit(editBuilder).then(success => {
            if (!success) {
                console.error('Failed to remove numbering from line');
            }
        });
    }
}

// 切换注释功能
function toggleComment() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    
    // 获取配置的注释样式
    const config = vscode.workspace.getConfiguration('stata-outline');
    const commentStyle = config.get('commentStyle', '// ');

    const startLine = selection.start.line;
    const endLine = selection.end.line;

    // 获取选中的所有行
    editor.edit(editBuilder => {
        for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
            const line = document.lineAt(lineNum);
            const lineText = line.text.trim();

            if (commentStyle === '/* ... */') {
                // 处理块注释
                if (lineText.startsWith('/*') && lineText.endsWith('*/')) {
                    // 移除块注释
                    const uncommentedText = lineText.replace(/^\/\*/, '').replace(/\*\/$/, '').trim();
                    const range = new vscode.Range(lineNum, 0, lineNum, line.text.length);
                    editBuilder.replace(range, uncommentedText);
                } else {
                    // 添加块注释
                    const commentedText = `/* ${lineText} */`;
                    const range = new vscode.Range(lineNum, 0, lineNum, line.text.length);
                    editBuilder.replace(range, commentedText);
                }
            } else {
                // 处理行注释
                // 创建一个正则表达式，匹配注释符号（忽略其后是否有空格）
                const baseCommentStyle = commentStyle.trim(); // 获取基础注释符号，如 "//"
                const escapedBaseStyle = baseCommentStyle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // 匹配基础注释符号，后面可跟任意数量的空格
                const commentPattern = new RegExp(`^${escapedBaseStyle}\\s*`);
                
                if (commentPattern.test(lineText)) {
                    // 如果行以注释符号开头（可能后面有空格），则移除注释符号和其后的所有空格
                    const uncommentedText = lineText.replace(commentPattern, '');
                    const range = new vscode.Range(lineNum, 0, lineNum, line.text.length);
                    editBuilder.replace(range, uncommentedText);
                } else {
                    // 如果行不是注释，则添加注释（使用用户配置的完整样式）
                    const commentedText = commentStyle + lineText;
                    const range = new vscode.Range(lineNum, 0, lineNum, line.text.length);
                    editBuilder.replace(range, commentedText);
                }
            }
        }
    });
}

// 检查是否安装了 stataRun 扩展
function isStataRunInstalled() {
    const stataRunExtension = vscode.extensions.getExtension('yeaoh.statarun');
    return stataRunExtension !== undefined;
}

// 获取当前光标所在的 section 范围并运行
async function runCurrentSection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    const document = editor.document;
    
    // 检查是否安装了 stataRun
    if (!isStataRunInstalled()) {
        const answer = await vscode.window.showErrorMessage(
            'stataRun extension is not installed. Would you like to install it?',
            'Install',
            'Cancel'
        );
        if (answer === 'Install') {
            vscode.commands.executeCommand('workbench.extensions.search', 'yeaoh.statarun');
            vscode.window.showInformationMessage('Please complete the `Stata Run` extension configuration if needed.');

        }
        return;
    }

    const currentLine = editor.selection.active.line;
    const regex = /^\*{1,2}\s*(#+)\s?(.*)$/;
    
    // 找到当前光标所在的 section 起始行和级别
    let sectionStart = -1;
    let sectionLevel = -1;
    
    // 向上查找最近的标题
    for (let i = currentLine; i >= 0; i--) {
        const line = document.lineAt(i).text;
        const match = regex.exec(line);
        if (match) {
            sectionStart = i;
            sectionLevel = match[1].length; // # 的数量
            break;
        }
    }
    
    // 如果没找到标题，从文件开始处开始
    if (sectionStart === -1) {
        sectionStart = 0;
        sectionLevel = 0; // 表示在第一个标题之前
    }
    
    // 向下查找下一个同级或更高级的标题
    let sectionEnd = document.lineCount - 1;
    
    for (let i = sectionStart + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        const match = regex.exec(line);
        if (match) {
            const currentLevel = match[1].length;
            // 如果找到同级或更高级的标题（level 更小），结束当前 section
            if (currentLevel <= sectionLevel && sectionLevel > 0) {
                sectionEnd = i - 1;
                break;
            }
            // 如果我们在第一个标题之前（sectionLevel === 0），遇到第一个标题就结束
            if (sectionLevel === 0) {
                sectionEnd = i - 1;
                break;
            }
        }
    }
    
    // 选择要运行的代码范围
    const startPos = new vscode.Position(sectionStart, 0);
    const endLine = document.lineAt(sectionEnd);
    const endPos = new vscode.Position(sectionEnd, endLine.text.length);
    
    editor.selection = new vscode.Selection(startPos, endPos);
    
    // 使用 stataRun.runSelection 命令运行选中的代码
    try {
        await vscode.commands.executeCommand('stataRun.runSelection');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to run section: ${error.message}`);
    }
}

function activate(context) {
    // 注册命令
    const commands = [
        { id: 'stata-outline.setLevel1', level: 1 },
        { id: 'stata-outline.setLevel2', level: 2 },
        { id: 'stata-outline.setLevel3', level: 3 },
        { id: 'stata-outline.setLevel4', level: 4 },
        { id: 'stata-outline.setLevel5', level: 5 },
        { id: 'stata-outline.setLevel6', level: 6 },
        { id: 'stata-outline.clearHeading', level: 0 },
        { id: 'stata-outline.toggleComment' }  // 添加注释切换命令
    ];

    commands.forEach(cmd => {
        const disposable = vscode.commands.registerCommand(cmd.id, () => {
            if (cmd.id === 'stata-outline.toggleComment') {
                toggleComment();  // 特殊处理注释命令
            } else {
                setHeadingLevel(cmd.level);
            }
        });
        context.subscriptions.push(disposable);
    });

    // 注册运行 section 的命令
    const runSectionCommand = vscode.commands.registerCommand('stata-outline.runSection', runCurrentSection);
    context.subscriptions.push(runSectionCommand);

    // 原有的 DocumentSymbolProvider
    const provider = {
        provideDocumentSymbols(document) {
            const regex = /^\*{1,2}\s*(#+)\s?(.*)$/;  // * ## title
            const items = [];

            // Step 1: 收集所有标题项
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                const m = regex.exec(line);
                if (m) {
                    const marks = m[1];     // #  ##  ### ...
                    const title = m[2].trim();
                    const level = marks.length;  // # → 1, ## → 2, etc.

                    const range = new vscode.Range(i, 0, i, line.length);

                    // 如果标题已经包含序号，提取原始标题（去掉序号）
                    let originalTitle = title;
                    const numberingMatch = /^(\d+(?:\.\d+)*)\s+(.*)$/.exec(title);
                    if (numberingMatch) {
                        originalTitle = numberingMatch[2];
                    }

                    items.push({
                        title: originalTitle,  // 始终使用原始标题
                        level: level,
                        range: range
                    });
                }
            }

            // 获取配置：是否显示序号
            const config = vscode.workspace.getConfiguration('stata-outline');
            const showNumbering = config.get('showNumbering', true);

            // Step 2: 构建 Outline 树结构
            const rootSymbols = [];
            const stack = [];   // { level, symbol }
            const counters = []; // 用于跟踪每级标题的计数器

            for (const item of items) {
                let displayTitle;
                
                if (showNumbering) {
                    // 生成多级序号
                    let numbering = '';
                    
                    // 确保计数器数组足够长，初始化为0
                    while (counters.length < item.level) {
                        counters.push(0);
                    }

                    // 重置当前级别之后的所有计数器
                    for (let i = item.level; i < counters.length; i++) {
                        counters[i] = 0;
                    }

                    // 当前级别计数器加1
                    counters[item.level - 1]++;

                    // 构建序号字符串（如 "1.2.3"）
                    numbering = counters.slice(0, item.level).join('.');

                    // 带序号的显示标题
                    displayTitle = `${numbering} ${item.title}`;
                } else {
                    // 不显示序号，使用原始标题
                    displayTitle = item.title;
                }

                const symbol = new vscode.DocumentSymbol(
                    displayTitle,
                    `H${item.level}`,
                    vscode.SymbolKind.Method,
                    item.range,
                    item.range
                );

                symbol.children = [];   // 重要！！必须先初始化 children

                // 维持层级关系：栈顶必须比当前 level 小
                while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
                    stack.pop();
                }

                if (stack.length === 0) {
                    // 顶层节点
                    rootSymbols.push(symbol);
                } else {
                    // 子节点
                    stack[stack.length - 1].symbol.children.push(symbol);
                }

                // 压栈
                stack.push({ level: item.level, symbol: symbol });
            }

            // 根据配置决定是否更新文件内容
            const updateFileContent = config.get('updateFileContent', false);
            
            if (items.length > 0) {
                if (updateFileContent) {
                    // 启用文件内容更新：添加或更新序号
                    const fileCounters = [];
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        while (fileCounters.length < item.level) {
                            fileCounters.push(0);
                        }
                        for (let j = item.level; j < fileCounters.length; j++) {
                            fileCounters[j] = 0;
                        }
                        fileCounters[item.level - 1]++;
                        
                        // 为当前项创建临时计数器数组
                        const tempCounters = [...fileCounters].slice(0, item.level);
                        
                        // 调用文件更新函数（添加/更新序号）
                        updateFileContentWithNumbering(document, [item], tempCounters);
                    }
                } else {
                    // 关闭文件内容更新：删除所有序号
                    for (const item of items) {
                        removeNumberingFromLine(document, item);
                    }
                }
            }

            return rootSymbols;
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: "stata" },
            provider
        )
    );
}

function deactivate() {}

module.exports = { activate, deactivate };
