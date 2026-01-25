const vscode = require('vscode');

const EXT_LABEL = 'Stata Outline';
const showInfo = (msg, ...items) => vscode.window.showInformationMessage(`${EXT_LABEL}: ${msg}`, ...items);
const showWarn = (msg, ...items) => vscode.window.showWarningMessage(`${EXT_LABEL}: ${msg}`, ...items);
const showError = (msg, ...items) => vscode.window.showErrorMessage(`${EXT_LABEL}: ${msg}`, ...items);

// 从重复字符序列中提取中心文本
function extractCenterText(title) {
    // 将文本转换为Unicode码位数组，以正确处理emoji等复合字符
    const cps = Array.from(title);
    const len = cps.length;
    
    // 尝试从左到右找到一个重复模式
    for (let patternLen = 1; patternLen <= Math.floor(len / 3); patternLen++) {
        // 检查左边是否有连续的重复模式
        let leftEnd = 0;
        let rightStart = len;
        
        // 从左边匹配重复模式
        while (leftEnd < len / 3) {
            let match = true;
            for (let i = 0; i < patternLen; i++) {
                if (leftEnd + i >= len || cps[leftEnd + i] !== cps[i]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                leftEnd += patternLen;
            } else {
                break;
            }
        }
        
        // 如果找到了左边的重复模式，尝试在右边也找到相同的模式
        if (leftEnd > 0) {
            // 从右边匹配相同的模式
            let rightMatch = true;
            while (rightMatch && (len - rightStart) < leftEnd) {
                if (rightStart - patternLen >= leftEnd) {
                    for (let i = 0; i < patternLen; i++) {
                        if (cps[rightStart - patternLen + i] !== cps[i]) {
                            rightMatch = false;
                            break;
                        }
                    }
                    if (rightMatch) {
                        rightStart -= patternLen;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            
            // 如果左右都有匹配的模式，提取中间的内容
            if ((len - rightStart) === leftEnd && rightStart > leftEnd) {
                return cps.slice(leftEnd, rightStart).join('').trim();
            }
        }
    }
    
    // 如果上面的方法没成功，尝试更简单的中心提取方法
    // 查找最长的重复子串作为边界
    const str = title.trim();
    for (let i = 1; i <= Math.floor(str.length / 3); i++) {
        // 尝试从开头提取i个字符作为可能的重复模式
        const pattern = str.substring(0, i);
        
        // 检查是否以这个模式开头和结尾
        if (str.startsWith(pattern) && str.endsWith(pattern)) {
            // 检查中间是否有足够的空间放有意义的文本
            if (str.length > 2 * pattern.length) {
                const middle = str.substring(pattern.length, str.length - pattern.length).trim();
                // 确保中间部分不是重复的模式字符
                if (middle && !middle.includes(pattern)) {
                    return middle;
                }
            }
        }
    }
    
    // 如果都没找到，返回原始标题
    return title;
}

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

// 判断是否为分割线行：以 '** ' 开头，后面是重复的模式（单位长度1-6 code points）且总长度≥3
function isSeparatorLine(lineText) {
    const trimmed = lineText.trim();
    if (!trimmed.startsWith('** ')) {
        return false;
    }
    const body = trimmed.slice(3);
    if (!body) {
        return false;
    }

    const cps = Array.from(body);
    if (cps.length < 3) {
        return false;
    }

    for (let k = 1; k <= Math.min(6, cps.length); k++) {
        const unit = cps.slice(0, k);
        let ok = true;
        for (let i = 0; i < cps.length; i++) {
            if (cps[i] !== unit[i % k]) {
                ok = false;
                break;
            }
        }
        if (ok) {
            return true;
        }
    }
    return false;
}

// 获取分割线总长度（来自配置，默认 60，最小为 10）
function getSeparatorLength() {
    const config = vscode.workspace.getConfiguration('stata-outline');
    const len = config.get('separatorLength', 60);
    if (typeof len !== 'number' || !isFinite(len) || len < 10) {
        return 60;
    }
    return Math.floor(len);
}

// 将分隔符单位重复/截断到指定长度（按 code point 数量，避免截断 emoji）
function buildSeparatorSegment(unit, length) {
    if (!unit || length <= 0) {
        return '';
    }
    const codepoints = Array.from(unit);
    if (codepoints.length === 0) {
        return '';
    }
    const result = [];
    while (result.length < length) {
        for (const cp of codepoints) {
            if (result.length >= length) {
                break;
            }
            result.push(cp);
        }
    }
    return result.join('');
}

function hasNonAsciiCodePoint(text) {
    if (!text) return false;
    return Array.from(text).some(ch => ch.codePointAt(0) > 0x7f);
}

// 插入分割线，char 为分隔符字符（可以是单个字符或短字符串）
function insertSeparator(char) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const totalLength = getSeparatorLength();
    const effectiveTotalLength = hasNonAsciiCodePoint(char) ? Math.max(10, Math.floor(totalLength * 2 / 3)) : totalLength;

    // 先判断是否在单行标题内有选区，如果是，则将该行替换为带分隔符的标题
    if (!selection.isEmpty && selection.start.line === selection.end.line) {
        const line = document.lineAt(selection.start.line);
        const text = line.text;
        // 修改正则：# 后面的空格改为可选
        const headingMatch = /^\*\*\s*(#+)\s*(.*)$/.exec(text.trim());
        if (headingMatch) {
            const level = headingMatch[1]; // # 或 ## 等
            let titleText = headingMatch[2].trim();
            
            // 如果已经是分隔符格式，先提取纯标题
            const existingSepMatch = /^([=\-*#%]+)\s+(.+?)\s+[=\-*#%]+$/.exec(titleText);
            if (existingSepMatch) {
                titleText = existingSepMatch[2].trim();
            }
            
            // 计算前缀长度：`**` + `#...` + ` ` = 2 + level.length + 1
            const prefixLength = 2 + level.length + 1; // `**# `
            // 标题文本长度
            const titleLength = Array.from(titleText).length;
            // 剩余给分隔符和空格的长度
            const remaining = effectiveTotalLength - prefixLength - titleLength;
            
            if (remaining < 4) {
                // 剩余空间不足，至少需要 ` sep ` + ` sep ` = 4个字符
                showWarn('Line would be too long. Increase separator length setting.');
                return;
            }
            
            // 左右各一个空格，剩余的分给分隔符
            // ` <sep> title <sep> ` 
            const sepTotal = remaining - 2; // 减去左右空格
            const leftSepLen = Math.floor(sepTotal / 2);
            const rightSepLen = sepTotal - leftSepLen;
            
            const leftSep = buildSeparatorSegment(char, leftSepLen);
            const rightSep = buildSeparatorSegment(char, rightSepLen);
            
            const newLine = `**${level} ${leftSep} ${titleText} ${rightSep}`;
            
            editor.edit(editBuilder => {
                const range = line.range;
                editBuilder.replace(range, newLine);
            });
            return;
        }
    }

    // 否则按原逻辑插入独立分割线（占用整行）
    const separatorBody = buildSeparatorSegment(char, effectiveTotalLength - 3); // 减去 `** ` 的3个字符
    const separatorLine = `** ${separatorBody}`;
    
    let targetLine = selection.start.line;
    const currentLineText = document.lineAt(targetLine).text;
    const isCurrentEmpty = currentLineText.trim().length === 0;
    const currentIsSep = isSeparatorLine(currentLineText);
    const prevIsSep = targetLine > 0 && isSeparatorLine(document.lineAt(targetLine - 1).text);
    const nextIsSep = (targetLine + 1 < document.lineCount) && isSeparatorLine(document.lineAt(targetLine + 1).text);

    // 如果当前行本身是分割线，或上下都有分割线，则提醒并退出
    if (currentIsSep || (prevIsSep && nextIsSep)) {
        showInfo('Separator already present here.');
        return;
    }

    if (!isCurrentEmpty) {
        if (prevIsSep) {
            // 上一行已是分割线，则在当前行下方插入，但若下方也是分割线就提示
            if (nextIsSep) {
                showInfo('Separator already present above and below.');
                return;
            }
            targetLine = targetLine + 1;
        } else {
            // 在当前行上方插入
            // targetLine 保持不变
        }
    }

    // 如果目标行超出文件末尾，则追加
    const insertLine = Math.min(targetLine, document.lineCount);
    const position = new vscode.Position(insertLine, 0);

    editor.edit(editBuilder => {
        editBuilder.insert(position, separatorLine + "\n");
    });
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

// 检查是否是macOS系统
function isMacOS() {
    return process.platform === 'darwin';
}

// 查找可用的 Stata 应用（优先使用用户选择的版本），若未找到则回退到已安装的第一个
function findStataApp(preferredName) {
    const fs = require('fs');

    const checkPaths = (appName) => {
        const candidates = [
            `/Applications/${appName}.app`,
            `/Applications/Stata/${appName}.app`
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return null;
    };

    const orderedNames = Array.from(new Set([
        preferredName,
        'StataMP',
        'StataSE',
        'StataIC',
        'Stata'
    ].filter(Boolean)));

    const installed = [];
    let chosenName = null;
    let chosenPath = null;

    for (const name of orderedNames) {
        const p = checkPaths(name);
        if (p) {
            installed.push(name);
            if (!chosenPath) {
                chosenName = name;
                chosenPath = p;
            }
        }
    }

    return { name: chosenName, path: chosenPath, installed };
}

// 获取当前光标所在的 section 范围并运行
async function runCurrentSection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        showError('No active editor found');
        return;
    }

    // 检查是否是macOS
    if (!isMacOS()) {
        showError('Running Stata code is only supported on macOS');
        return;
    }

    const document = editor.document;
    const config = vscode.workspace.getConfiguration('stata-outline');
    const stataVersion = config.get('stataVersion', 'StataMP');
    const activateStataWindow = config.get('activateStataWindow', true);
    
        // 查找可用的 Stata 应用：优先用户设置，若未安装则自动回退到已安装版本
        const foundApp = findStataApp(stataVersion);
        if (!foundApp.path) {
            const installedList = (foundApp.installed && foundApp.installed.length > 0)
                ? foundApp.installed.join(', ')
                : 'none detected';
            showError(`No Stata installation detected. Please install Stata or set an existing version. Installed: ${installedList}.`);
            return;
        }
        const appName = foundApp.name;
        const appPath = foundApp.path;
    
    let codeToRun;
    
    // 检查是否有选中的代码
    const selection = editor.selection;
    if (!selection.isEmpty) {
        // 有选中代码，运行选中的完整行
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        
        const startPos = new vscode.Position(startLine, 0);
        const endLineText = document.lineAt(endLine);
        const endPos = new vscode.Position(endLine, endLineText.text.length);
        
        codeToRun = document.getText(new vscode.Range(startPos, endPos));
    } else {
        // 没有选中代码，运行当前 section
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
        
        // 获取要运行的代码范围
        const startPos = new vscode.Position(sectionStart, 0);
        const endLine = document.lineAt(sectionEnd);
        const endPos = new vscode.Position(sectionEnd, endLine.text.length);
        
        codeToRun = document.getText(new vscode.Range(startPos, endPos));
    }
    
    // 创建临时文件在当前文档的目录中
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    // 获取当前文档的目录，如果无法获取则使用系统临时目录
    const docDir = path.dirname(document.fileName);
    const tmpFilePath = path.join(docDir, 'stata_outline_temp.do');
    
    try {
        // 写入临时文件到文档所在目录
        fs.writeFileSync(tmpFilePath, codeToRun, 'utf8');
        
            // 构建Stata命令（使用已检测到的应用名和路径）
            let stataCommand = `pgrep -x "${appName}" > /dev/null || (open -a "${appPath}" && while ! pgrep -x "${appName}" > /dev/null; do sleep 0.2; done && sleep 0.5); osascript -e 'tell application "${appName}" to DoCommand "do \\"${tmpFilePath}\\""'`;
            
            // 如果需要激活Stata窗口，则添加activate命令
            if (activateStataWindow) {
                stataCommand += ` -e 'tell application "${appName}" to activate'`;
            }
        
        // 执行命令
        const { exec } = require('child_process');
        exec(stataCommand, (error, stdout, stderr) => {
            // 清理临时文件
            setTimeout(() => {
                try {
                    fs.unlinkSync(tmpFilePath);
                } catch (e) {
                    console.error('Failed to delete temporary file:', e);
                }
            }, 2000); // 延迟删除，确保Stata已完成读取
            
            if (error) {
                showError(`Failed to run Stata code: ${error.message}`);
                return;
            }
            
            showInfo(`Code sent to ${appName}`);
        });
    } catch (error) {
        showError(`Failed to create temporary file: ${error.message}`);
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
        { id: 'stata-outline.toggleComment' },  // 添加注释切换命令
        { id: 'stata-outline.insertSeparatorDash', separatorChar: '-' },
        { id: 'stata-outline.insertSeparatorEqual', separatorChar: '=' },
        { id: 'stata-outline.insertSeparatorStar', separatorChar: '*' }
    ];

    commands.forEach(cmd => {
        const disposable = vscode.commands.registerCommand(cmd.id, () => {
            if (cmd.separatorChar) {
                insertSeparator(cmd.separatorChar);
            } else if (cmd.id === 'stata-outline.toggleComment') {
                toggleComment();  // 特殊处理注释命令
            } else {
                setHeadingLevel(cmd.level);
            }
        });
        context.subscriptions.push(disposable);
    });

    // 注册自定义分隔符命令（通过输入框）
    const customSeparatorCommand = vscode.commands.registerCommand('stata-outline.insertCustomSeparator', async () => {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter separator character (symbols / letters / emoji, defaults to "=")',
            placeHolder: '='
        });

        if (input) {
            const cps = Array.from(input);
            if (cps.length > 6) {
                showWarn('Please enter at most 6 symbols/letters/emoji.');
                return;
            }
            if (/[\x00-\x1F\x7F]/.test(input)) {
                showWarn('Control characters are not supported.');
                return;
            }
        }

        const char = (input && input.length > 0) ? input : '=';
        insertSeparator(char);
    });
    context.subscriptions.push(customSeparatorCommand);

    // 注册运行 section 的命令
    const runSectionCommand = vscode.commands.registerCommand('stata-outline.runSection', runCurrentSection);
    context.subscriptions.push(runSectionCommand);

    // 原有的 DocumentSymbolProvider
    const provider = {
        provideDocumentSymbols(document) {
            const regex = /^\*\*\s*(#+)\s*(.*)$/;  // * ## title (空格可选)
            const items = [];

            // Step 1: 收集所有标题项
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                const m = regex.exec(line);
                if (m) {
                    const marks = m[1];     // #  ##  ### ...
                    const title = m[2].trim();
                    const level = marks.length;  // # → 1, ## → 2, etc.

                    const titleRange = new vscode.Range(i, 0, i, line.length);

                    // 去除分隔符：检查是否为带分隔符的标题格式 `=== title ===` 或 `*** title ***`
                    let originalTitle = title;
                    const separatorMatch = /^([=\-*#%]+)\s+(.+?)\s+[=\-*#%]+$/.exec(originalTitle);
                    if (separatorMatch) {
                        originalTitle = separatorMatch[2].trim();
                    }
                    
                    // 检查是否为自定义分隔符格式，如 "separator text separator"
                    // 例如: "xxxxxxxxxxxxxxxxxxxxx level 1 xxxxxxxxxxxxxxxxxxxxxxx"
                    const customSeparatorMatch = /^(.+)\s+(\S.*?)\s+\1$/.exec(originalTitle);
                    if (customSeparatorMatch) {
                        originalTitle = customSeparatorMatch[2].trim();
                    }
                    
                    // 更通用的处理：检测重复字符序列包围的文本
                    // 例如: "aaaa bbb cccc bbb aaaa" -> 提取 "bbb"
                    if (!customSeparatorMatch) {
                        originalTitle = extractCenterText(originalTitle);
                    }
                    
                    // 如果标题已经包含序号，提取原始标题（去掉序号）
                    const numberingMatch = /^(\d+(?:\.\d+)*)\s+(.*)$/.exec(originalTitle);
                    if (numberingMatch) {
                        originalTitle = numberingMatch[2];
                    }

                    items.push({
                        title: originalTitle,  // 始终使用原始标题
                        level: level,
                        titleRange: titleRange,  // 标题行的范围
                        lineNumber: i  // 标题所在的行号
                    });
                }
            }
            
            // Step 1.5: 计算每个标题的完整范围（包括其下的所有内容直到下一个同级或更高级标题）
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                let endLine = document.lineCount - 1;  // 默认到文件末尾
                
                // 查找下一个同级或更高级的标题
                for (let j = i + 1; j < items.length; j++) {
                    if (items[j].level <= item.level) {
                        endLine = items[j].lineNumber - 1;  // 到下一个标题的前一行
                        break;
                    }
                }
                
                // 设置完整范围：从标题行开始到 endLine 结束
                const endLineText = document.lineAt(endLine);
                item.fullRange = new vscode.Range(
                    item.lineNumber, 
                    0, 
                    endLine, 
                    endLineText.text.length
                );
            }

            // 获取配置：是否显示序号
            const config = vscode.workspace.getConfiguration('stata-outline');
            const showNumbering = config.get('showNumbering', true);

            // Step 2: 构建 Outline 树结构
            const rootSymbols = [];
            const stack = [];   // { level, symbol, itemIndex }
            const counters = []; // 用于跟踪每级标题的计数器

            for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
                const item = items[itemIndex];
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

                // 计算该项的范围：从当前标题开始到下一个同级或更高级标题之前
                let endLine = document.lineCount - 1;  // 默认到文件末尾
                for (let j = itemIndex + 1; j < items.length; j++) {
                    if (items[j].level <= item.level) {
                        endLine = items[j].lineNumber - 1;
                        break;
                    }
                }
                
                const endLineText = document.lineAt(endLine);
                const fullRange = new vscode.Range(
                    item.lineNumber, 
                    0, 
                    endLine, 
                    endLineText.text.length
                );

                const symbol = new vscode.DocumentSymbol(
                    displayTitle,
                    '',
                    vscode.SymbolKind.Method,
                    fullRange,           // 使用完整范围
                    item.titleRange      // 选择范围（标题行）
                );

                symbol.children = [];

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
                stack.push({ level: item.level, symbol: symbol, itemIndex: itemIndex });
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
                        
                        // 创建一个临时对象用于更新文件内容
                        const tempItem = {
                            title: item.title,
                            level: item.level,
                            range: item.titleRange  // 使用标题范围进行文件更新
                        };
                        
                        // 调用文件更新函数（添加/更新序号）
                        updateFileContentWithNumbering(document, [tempItem], tempCounters);
                    }
                } else {
                    // 关闭文件内容更新：删除所有序号
                    for (const item of items) {
                        const tempItem = {
                            title: item.title,
                            level: item.level,
                            range: item.titleRange  // 使用标题范围进行文件更新
                        };
                        removeNumberingFromLine(document, tempItem);
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
