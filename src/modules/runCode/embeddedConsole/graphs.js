const fs = require('fs');
const os = require('os');
const path = require('path');

let sharp = null;
try {
    sharp = require('sharp');
} catch (_error) {
    sharp = null;
}

const GRAPH_FORMATS = ['svg'];
const BITMAP_EXPORT_FORMATS = new Set(['png', 'jpg', 'jpeg']);
const BITMAP_EXPORT_MAX_DENSITY = 144;
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

async function executeBitmapGraphExport(consoleSession, graphDir, command, workingDirectory = null) {
    const request = parseBitmapGraphExportCommand(command);
    if (!request) {
        return null;
    }

    if (!sharp) {
        return {
            success: false,
            returnCode: 198,
            output: '',
            error: 'PNG/JPG graph export requires sharp, but sharp is not available.'
        };
    }

    const targetPath = resolveGraphExportPath(request.filePath, workingDirectory);
    if (!request.replace && fs.existsSync(targetPath)) {
        return {
            success: false,
            returnCode: 602,
            output: '',
            error: `file ${request.filePath} already exists`
        };
    }

    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
        return {
            success: false,
            returnCode: 601,
            output: '',
            error: `directory ${targetDir} not found`
        };
    }

    const tempDir = graphDir || os.tmpdir();
    fs.mkdirSync(tempDir, { recursive: true });
    const tempSvgPath = path.join(
        tempDir,
        `manual-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.svg`
    );

    try {
        const escapedSvgPath = escapeStataString(tempSvgPath);
        const nameOption = request.graphName ? ` name(${request.graphName})` : '';
        const svgResult = await consoleSession.execute(
            `quietly graph export "${escapedSvgPath}",${nameOption} replace`,
            false
        );

        if (!svgResult || !svgResult.success || !fileExistsWithContent(tempSvgPath)) {
            return {
                success: false,
                returnCode: svgResult && Number.isInteger(svgResult.returnCode) ? svgResult.returnCode : 693,
                output: '',
                error: svgResult && svgResult.error
                    ? svgResult.error
                    : `failed to export graph as temporary SVG for ${request.filePath}`
            };
        }

        await convertSvgToBitmap(tempSvgPath, targetPath, request);
        if (!fileExistsWithContent(targetPath)) {
            return {
                success: false,
                returnCode: 693,
                output: '',
                error: `failed to save ${request.filePath}`
            };
        }

        const label = request.format === 'jpg' ? 'JPG' : request.format.toUpperCase();
        return {
            success: true,
            returnCode: 0,
            output: `file ${request.filePath} saved as ${label} format\n`,
            error: ''
        };
    } catch (error) {
        return {
            success: false,
            returnCode: 693,
            output: '',
            error: error.message || String(error)
        };
    } finally {
        try {
            if (fs.existsSync(tempSvgPath)) {
                fs.unlinkSync(tempSvgPath);
            }
        } catch (_error) {}
    }
}

function parseBitmapGraphExportCommand(command) {
    const graphExport = stripGraphExportPrefixes(command);
    if (!/^graph\s+export\b/i.test(graphExport)) {
        return null;
    }

    const rest = graphExport.replace(/^graph\s+export\b/i, '').trim();
    const parsedFile = parseStataFileToken(rest);
    if (!parsedFile || !parsedFile.value) {
        return null;
    }

    const options = String(parsedFile.rest || '');
    const format = normalizeExportFormat(parseGraphExportFormat(parsedFile.value, options));
    if (!BITMAP_EXPORT_FORMATS.has(format)) {
        return null;
    }

    return {
        filePath: parsedFile.value,
        format,
        graphName: parseGraphExportName(options),
        replace: hasGraphExportReplaceOption(options),
        width: parsePositiveIntegerOption(options, 'width'),
        height: parsePositiveIntegerOption(options, 'height')
    };
}

function stripGraphExportPrefixes(command) {
    let text = String(command || '').trim().replace(/^\.\s?/, '').trim();
    let changed = true;

    while (changed) {
        changed = false;
        const match = text.match(/^(quietly|qui|capture|cap|noisily|noi)\b\s*:?\s*/i);
        if (match) {
            text = text.slice(match[0].length).trim();
            changed = true;
        }
    }

    return text;
}

function parseStataFileToken(input) {
    const text = String(input || '').trim();
    if (!text) {
        return null;
    }

    if (text[0] === '"') {
        let value = '';
        for (let index = 1; index < text.length; index += 1) {
            const char = text[index];
            if (char === '"') {
                if (text[index + 1] === '"') {
                    value += '"';
                    index += 1;
                    continue;
                }
                return {
                    value,
                    rest: text.slice(index + 1).trim()
                };
            }
            value += char;
        }
        return null;
    }

    const match = text.match(/^([^,\s]+)([\s\S]*)$/);
    return match ? { value: match[1], rest: String(match[2] || '').trim() } : null;
}

function parseGraphExportFormat(filePath, options) {
    const asMatch = String(options || '').match(/(?:^|[\s,])as\(\s*([A-Za-z0-9]+)\s*\)/i);
    if (asMatch) {
        return asMatch[1];
    }

    return path.extname(String(filePath || '')).replace(/^\./, '');
}

function normalizeExportFormat(format) {
    const normalized = String(format || '').trim().toLowerCase();
    return normalized === 'jpeg' ? 'jpg' : normalized;
}

function parseGraphExportName(options) {
    const match = String(options || '').match(/(?:^|[\s,])name\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/i);
    return match ? match[1] : '';
}

function hasGraphExportReplaceOption(options) {
    return /(?:^|[\s,])replace(?:$|[\s,)])/i.test(String(options || ''));
}

function parsePositiveIntegerOption(options, name) {
    const pattern = new RegExp(`(?:^|[\\s,])${name}\\(\\s*([0-9]+)\\s*\\)`, 'i');
    const match = String(options || '').match(pattern);
    if (!match) {
        return null;
    }

    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveGraphExportPath(filePath, workingDirectory) {
    const rawPath = String(filePath || '');
    if (path.isAbsolute(rawPath)) {
        return rawPath;
    }

    return path.resolve(workingDirectory || process.cwd(), rawPath);
}

async function convertSvgToBitmap(svgPath, targetPath, request) {
    let image = sharp(svgPath, { density: getGraphRasterDpi() });
    if (request.width || request.height) {
        image = image.resize({
            width: request.width || undefined,
            height: request.height || undefined,
            fit: request.width && request.height ? 'fill' : 'inside'
        });
    }

    if (request.format === 'png') {
        await image.png().toFile(targetPath);
        return;
    }

    await image.flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toFile(targetPath);
}

function getGraphRasterDpi() {
    try {
        const config = require('../../../utils/config');
        return Math.min(config.getGraphPngDpi(), BITMAP_EXPORT_MAX_DENSITY);
    } catch (_error) {
        return BITMAP_EXPORT_MAX_DENSITY;
    }
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
    executeBitmapGraphExport,
    exportCapturedGraphs,
    getGraphCacheDir
};
