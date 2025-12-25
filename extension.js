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

function activate(context) {
    const provider = {
        provideDocumentSymbols(document) {
            const regex = /^\*{1,2}\s*(#+)\s+(.*)$/;  // * ## title
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

                    items.push({
                        title: title,
                        level: level,
                        range: range
                    });
                }
            }

            // Step 2: 构建 Outline 树结构
            const rootSymbols = [];
            const stack = [];   // { level, symbol }

            for (const item of items) {
                const symbol = new vscode.DocumentSymbol(
                    item.title,
                    `H${item.level}`,
                    // symbolKindByLevel(item.level),
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
