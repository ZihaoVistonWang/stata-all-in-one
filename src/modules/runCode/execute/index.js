/**
 * Execute Dispatcher Module
 * 代码执行调度层 - 在 CLI 和 GUI 之间路由
 * 
 * Wave 2 实现：创建统一接口，检查 CLI 可用性并路由
 */

const vscode = require('vscode');
const path = require('path');

// 工具函数导入
const { isWindows, isMacOS, showError, stripSurroundingQuotes, msg } = require('../../../utils/common');
const config = require('../../../utils/config');

// GUI 执行函数导入
const { runOnMac } = require('../gui/mac');
const { runOnWindows } = require('../gui/windows');

// CLI 执行函数导入
const { runOnMacCLI } = require('../cli/mac');

// 临时文件处理
const { generateTempDoFile, cleanupTempFile } = require('./tempfile');

// Fallback 机制
const { showCliUnavailableMessage } = require('./fallback');

/**
 * 获取要运行的代码
 * 基于当前选择或节来确定要执行的代码范围
 * 
 * @param {vscode.TextEditor} editor - VS Code 文本编辑器
 * @returns {string} - 要执行的代码内容
 */
function getCodeToRun(editor) {
    const document = editor.document;
    const selection = editor.selection;

    if (!selection.isEmpty) {
        // 运行选中的代码（完整行）
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        
        const startPos = new vscode.Position(startLine, 0);
        const endLineText = document.lineAt(endLine);
        const endPos = new vscode.Position(endLine, endLineText.text.length);
        
        return document.getText(new vscode.Range(startPos, endPos));
    } else {
        // 未选中：检查当前行是否是标题行
        const currentLine = editor.selection.active.line;
        const lineText = document.lineAt(currentLine).text;
        const headerRegex = /^\*{1,2}\s*#+/;
        
        if (headerRegex.test(lineText)) {
            // 当前行是标题：运行当前节
            const regex = /^\*{1,2}\s*(#+)\s?(.*)$/;
            
            let sectionStart = -1;
            let sectionLevel = -1;
            
            // 找到当前节的标题
            for (let i = currentLine; i >= 0; i--) {
                const line = document.lineAt(i).text;
                const match = regex.exec(line);
                if (match) {
                    sectionStart = i;
                    sectionLevel = match[1].length;
                    break;
                }
            }
            
            if (sectionStart === -1) {
                sectionStart = 0;
                sectionLevel = 0;
            }
            
            // 找到下一个同级或更高级的节
            let sectionEnd = document.lineCount - 1;
            
            for (let i = sectionStart + 1; i < document.lineCount; i++) {
                const line = document.lineAt(i).text;
                const match = regex.exec(line);
                if (match) {
                    const currentLevel = match[1].length;
                    if (currentLevel <= sectionLevel && sectionLevel > 0) {
                        sectionEnd = i - 1;
                        break;
                    }
                    if (sectionLevel === 0) {
                        sectionEnd = i - 1;
                        break;
                    }
                }
            }
            
            const startPos = new vscode.Position(sectionStart, 0);
            const endLine = document.lineAt(sectionEnd);
            const endPos = new vscode.Position(sectionEnd, endLine.text.length);
            
            return document.getText(new vscode.Range(startPos, endPos));
        } else {
            // 当前行不是标题：只运行当前行
            const lineObj = document.lineAt(currentLine);
            const startPos = new vscode.Position(currentLine, 0);
            const endPos = new vscode.Position(currentLine, lineObj.text.length);
            
            return document.getText(new vscode.Range(startPos, endPos));
        }
    }
}

/**
 * 主调度函数：运行当前节/行/选区
 * 检查 CLI 可用性，路由到 CLI 或 GUI 执行路径
 * 
 * @param {vscode.ExtensionContext} context - VS Code 扩展上下文
 * @param {vscode.TextEditor} editor - VS Code 文本编辑器（可选，默认使用 activeTextEditor）
 * @returns {Promise<void>}
 */
async function runCurrentSection(context, editor = null) {
    // 获取编辑器
    const activeEditor = editor || vscode.window.activeTextEditor;
    if (!activeEditor) {
        showError(msg('noEditor'));
        return;
    }

    const document = activeEditor.document;

    // 平台检查
    const onWindows = isWindows();
    const onMac = isMacOS();

    if (!onWindows && !onMac) {
        showError(msg('unsupportedPlatform'));
        return;
    }

    // Windows 平台特定验证
    let stataPathOnWindows = null;
    if (onWindows) {
        const rawPath = config.getStataPathOnWindows();
        stataPathOnWindows = stripSurroundingQuotes(rawPath.trim());
        if (!stataPathOnWindows) {
            // 提示用户输入 Stata 路径
            const userPath = await vscode.window.showInputBox({
                prompt: msg('promptWinPath'),
                placeHolder: msg('promptWinPathPlaceholder'),
                ignoreFocusOut: true
            });
            
            if (!userPath) {
                return; // 用户取消
            }
            
            // 保存路径到设置
            await vscode.workspace.getConfiguration('stata-all-in-one').update(
                'stataPathOnWindows',
                userPath.trim(),
                vscode.ConfigurationTarget.Global
            );
            
            stataPathOnWindows = stripSurroundingQuotes(userPath.trim());
            vscode.window.showInformationMessage(msg('configSaved'));
        }
    }
    
    // macOS 平台特定验证
    if (onMac) {
        const stataVersion = config.getStataVersion();
        if (!stataVersion || stataVersion.trim() === '') {
            // 提示用户选择 Stata 版本
            const selectedVersion = await vscode.window.showQuickPick(
                ['StataMP', 'StataIC', 'StataSE'],
                {
                    placeHolder: msg('promptMacVersion'),
                    ignoreFocusOut: true
                }
            );
            
            if (!selectedVersion) {
                return; // 用户取消
            }
            
            // 保存版本到设置
            await vscode.workspace.getConfiguration('stata-all-in-one').update(
                'stataVersionOnMacOS',
                selectedVersion,
                vscode.ConfigurationTarget.Global
            );
            
            vscode.window.showInformationMessage(msg('configSaved'));
        }
    }

    // 获取要运行的代码
    const codeToRun = getCodeToRun(activeEditor);
    
    // 获取文档目录
    const docDir = path.dirname(document.fileName);
    
    // 创建临时文件路径（用于 GUI 模式）
    const tmpFilePath = path.join(docDir, 'stata_all_in_one_temp.do');
    
    try {
        // === 调度逻辑 ===
        
        if (onWindows) {
            // Windows: 总是使用 GUI（CLI 未实现）
            runOnWindows(codeToRun, tmpFilePath, stataPathOnWindows, docDir);
            
            // 设置 context 变量：CLI 不可用
            vscode.commands.executeCommand('setContext', 'stata-all-in-one.cliSessionActive', false);
            
        } else if (onMac) {
            const cliResult = await runOnMacCLI(codeToRun, tmpFilePath, docDir, context);
            if (cliResult.success) {
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.cliSessionActive', true);
            } else if (cliResult.shouldOfferGuiFallback) {
                await maybeOfferGuiFallback(codeToRun, tmpFilePath, docDir, context, cliResult.message || 'CLI 执行失败');
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.cliSessionActive', false);
            } else {
                vscode.commands.executeCommand('setContext', 'stata-all-in-one.cliSessionActive', true);
            }
        }
        
    } catch (error) {
        showError(msg('tmpFileFailed', { message: error.message }));
        console.error('[execute] 执行异常:', error.message);
        vscode.commands.executeCommand('setContext', 'stata-all-in-one.cliSessionActive', false);
    }
}

async function maybeOfferGuiFallback(codeToRun, tmpFilePath, docDir, context, reason) {
    const useGuiLabel = msg('useStataApp');
    const stayInCliLabel = msg('stayInCli');

    const choice = await vscode.window.showWarningMessage(
        msg('cliOfferGuiFallback', { reason }),
        useGuiLabel,
        stayInCliLabel
    );

    if (choice === useGuiLabel) {
        showCliUnavailableMessage(reason);
        runOnMac(codeToRun, tmpFilePath, false, docDir, context);
    }
}

/**
 * 注册执行命令
 * 将 'stata-all-in-one.runSection' 命令绑定到调度函数
 * 
 * @param {vscode.ExtensionContext} context - VS Code 扩展上下文
 */
function registerExecuteCommand(context) {
    const disposable = vscode.commands.registerCommand(
        'stata-all-in-one.runSection',
        async () => {
            await runCurrentSection(context);
        }
    );
    context.subscriptions.push(disposable);
}

// 导出接口
module.exports = {
    runCurrentSection,
    registerExecuteCommand,
    getCodeToRun  // 导出供测试或其他模块使用
};
