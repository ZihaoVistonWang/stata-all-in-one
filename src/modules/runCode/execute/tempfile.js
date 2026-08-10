'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TEMP_DO_PREFIX = 'stata-all-in-one-';
const TEMP_DO_SUFFIX = '.do';
const STALE_TEMP_FILE_AGE_MS = 24 * 60 * 60 * 1000;

function isOwnedTempFileName(fileName) {
    return fileName.startsWith(TEMP_DO_PREFIX) && fileName.endsWith(TEMP_DO_SUFFIX);
}

function cleanupStaleTempFiles(options = {}) {
    const tempDirectory = options.tempDirectory || os.tmpdir();
    const now = options.now ?? Date.now();
    const maxAgeMs = options.maxAgeMs ?? STALE_TEMP_FILE_AGE_MS;
    let entries;
    try {
        entries = fs.readdirSync(tempDirectory, { withFileTypes: true });
    } catch {
        return 0;
    }

    let removed = 0;
    for (const entry of entries) {
        if (!entry.isFile() || !isOwnedTempFileName(entry.name)) continue;
        const filePath = path.join(tempDirectory, entry.name);
        try {
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs < maxAgeMs) continue;
            fs.unlinkSync(filePath);
            removed += 1;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn(`Stata All in One: failed to clean stale temporary do-file: ${error.message}`);
            }
        }
    }
    return removed;
}

/**
 * 生成临时文件名
 * @param {string|null} _targetDir - 保留的兼容参数；临时文件始终写入系统临时目录
 * @returns {string} 临时文件的绝对路径
 */
function getTempFilePath(_targetDir = null) {
    const tmpDir = os.tmpdir();
    cleanupStaleTempFiles({ tempDirectory: tmpDir });
    return path.join(
        tmpDir,
        `${TEMP_DO_PREFIX}${process.pid}-${crypto.randomUUID()}${TEMP_DO_SUFFIX}`
    );
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
 * @param {number} delayMs - 延迟删除的时间（毫秒），默认立即删除
 * @returns {Promise<void>} 异步清理操作
 */
function cleanupTempFile(filePath, delayMs = 0) {
    return new Promise((resolve) => {
        const remove = () => {
            try {
                fs.unlinkSync(filePath);
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    console.error('Failed to delete temporary file:', e);
                }
            }
            resolve();
        };
        if (delayMs > 0) {
            setTimeout(remove, delayMs);
        } else {
            remove();
        }
    });
}

module.exports = {
    generateTempDoFile,
    cleanupTempFile,
    cleanupStaleTempFiles,
    getTempFilePath,
    isOwnedTempFileName,
    STALE_TEMP_FILE_AGE_MS
};
