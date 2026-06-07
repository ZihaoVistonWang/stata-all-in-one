const fs = require('fs');
const os = require('os');
const path = require('path');

const GRAPH_FORMATS = ['svg'];
const GRAPH_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let _lastCacheCleanupAt = 0;

function getGraphCacheDir(context) {
    const baseDir = context && context.globalStorageUri && context.globalStorageUri.fsPath
        ? context.globalStorageUri.fsPath
        : (context && context.globalStoragePath ? context.globalStoragePath : os.tmpdir());
    const graphDir = path.join(baseDir, 'embedded-console-graphs');
    fs.mkdirSync(graphDir, { recursive: true });
    cleanupGraphCache(graphDir);
    return graphDir;
}

function cleanupGraphCache(graphDir) {
    const now = Date.now();
    if (!graphDir || now - _lastCacheCleanupAt < 60 * 60 * 1000) {
        return;
    }
    _lastCacheCleanupAt = now;

    try {
        const entries = fs.readdirSync(graphDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !/\.(svg|png)$/i.test(entry.name)) {
                continue;
            }
            const filePath = path.join(graphDir, entry.name);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > GRAPH_CACHE_MAX_AGE_MS) {
                fs.unlinkSync(filePath);
            }
        }
    } catch (error) {
        console.error('Stata All in One: Failed to clean graph cache:', error.message);
    }
}

async function beginGraphCapture(consoleSession) {
    try {
        const result = await consoleSession.execute('quietly _gr_list on', false);
        return { enabled: Boolean(result && result.success) };
    } catch (error) {
        console.error('Stata All in One: Failed to enable graph capture:', error.message);
        return { enabled: false };
    }
}

async function endGraphCapture(consoleSession, captureState) {
    if (!captureState || !captureState.enabled) {
        return;
    }

    try {
        await consoleSession.execute('quietly _gr_list off', false);
    } catch (error) {
        console.error('Stata All in One: Failed to disable graph capture:', error.message);
    }
}

async function exportCapturedGraphs(consoleSession, graphDir) {
    if (!consoleSession || !graphDir) {
        return [];
    }

    const graphNames = await getCapturedGraphNames(consoleSession);
    if (!graphNames.length) {
        return [];
    }

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const exported = [];
    for (let index = 0; index < graphNames.length; index += 1) {
        const graphName = graphNames[index];
        const exportedGraph = await exportGraph(consoleSession, graphDir, graphName, runId, index);
        if (exportedGraph) {
            exported.push(exportedGraph);
        }
    }
    return exported;
}

async function getCapturedGraphNames(consoleSession) {
    try {
        const listResult = await consoleSession.execute('quietly _gr_list list', false);
        if (!listResult || !listResult.success) {
            return [];
        }

        const result = await consoleSession.execute('display "`r(_grlist)\'"', false);
        if (!result || !result.success || !result.output) {
            return [];
        }

        return parseGraphNames(result.output);
    } catch (error) {
        console.error('Stata All in One: Failed to list captured graphs:', error.message);
        return [];
    }
}

function parseGraphNames(output) {
    const names = String(output || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split(/\s+/)
        .map(item => item.trim())
        .filter(item => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item));
    return Array.from(new Set(names));
}

async function exportGraph(consoleSession, graphDir, graphName, runId, index) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(graphName)) {
        return null;
    }

    for (const format of GRAPH_FORMATS) {
        const filePath = path.join(graphDir, `${runId}-${index}-${sanitizeFilePart(graphName)}.${format}`);
        try {
            const escapedPath = escapeStataString(filePath);
            const command = `quietly graph export "${escapedPath}", name(${graphName}) replace`;
            const result = await consoleSession.execute(command, false);
            if (result && result.success && fileExistsWithContent(filePath)) {
                return {
                    graphName,
                    format,
                    filePath
                };
            }
        } catch (error) {
            console.error(`Stata All in One: Failed to export graph ${graphName} as ${format}:`, error.message);
        }
    }

    return null;
}

function fileExistsWithContent(filePath) {
    try {
        return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
    } catch (_error) {
        return false;
    }
}

function sanitizeFilePart(value) {
    return String(value || 'graph')
        .replace(/[^A-Za-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        || 'graph';
}

function escapeStataString(value) {
    return String(value || '').replace(/"/g, '""');
}

module.exports = {
    beginGraphCapture,
    endGraphCapture,
    exportCapturedGraphs,
    getGraphCacheDir
};
