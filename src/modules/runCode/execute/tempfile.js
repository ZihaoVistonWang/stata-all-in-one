'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_DO_FILENAME = 'stata_all_in_one_temp.do';

/**
 * 生成临时文件名
 * @param {string|null} targetDir - 优先写入的目录；为空时回退到系统临时目录
 * @returns {string} 临时文件的绝对路径
 */
function getTempFilePath(targetDir = null) {
    const tmpDir = targetDir && fs.existsSync(targetDir) ? targetDir : os.tmpdir();
    return path.join(tmpDir, TEMP_DO_FILENAME);
}

/**
 * 生成临时 do 文件并写入代码内容
 * @param {string} code - 要写入的代码内容
 * @param {string|null} docDir - do 文件所在目录（用于 first run 时 cd）
 * @param {boolean} isFirstRun - 是否是首次运行（需要添加 cd 命令）
 * @returns {string} 临时文件的绝对路径
 */
function generateTempDoFile(code, docDir, isFirstRun) {
    const tmpFilePath = getTempFilePath(docDir);
    
    let finalCode = code;
    
    // 如果是首次运行且存在 docDir，则在开头添加 cd 命令
    if (isFirstRun && docDir) {
        const escapedDir = docDir.replace(/"/g, '\\"');
        finalCode = `cd "${escapedDir}"\n${code}`;
    }
    
    // 写入文件，使用 UTF-8 编码
    fs.writeFileSync(tmpFilePath, finalCode, 'utf8');
    
    return tmpFilePath;
}

/**
 * 延迟清理临时文件
 * @param {string} filePath - 要删除的文件路径
 * @param {number} delayMs - 延迟删除的时间（毫秒），默认 2000ms
 * @returns {Promise<void>} 异步清理操作
 */
function cleanupTempFile(filePath, delayMs = 2000) {
    return new Promise((resolve) => {
        setTimeout(() => {
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                // 静默处理删除错误
                console.error('Failed to delete temporary file:', e);
            }
            resolve();
        }, delayMs);
    });
}

module.exports = {
    generateTempDoFile,
    cleanupTempFile,
    getTempFilePath
};
