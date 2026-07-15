/**
 * Cross-platform Stata installation discovery.
 *
 * macOS scans /Applications directly. Windows runs the bundled standalone BAT
 * registry probe and consumes its JSON report. Platform differences remain
 * internal so callers use one discovery entry point.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDITION_ORDER = Object.freeze({ mp: 0, se: 1, be: 2, ic: 3 });
const DISCOVERY_TIMEOUT_MS = Object.freeze({ darwin: 3000, win32: 5000 });
const DISCOVERY_SCRIPT_NAME = 'discover_stata_windows.bat';
const DLL_NAMES_BY_EDITION = {
    mp: ['mp-64.dll', 'StataMP-64.dll'],
    se: ['se-64.dll', 'StataSE-64.dll'],
    be: ['be-64.dll', 'StataBE-64.dll'],
    ic: ['ic-64.dll', 'StataIC-64.dll']
};

function normalizeEdition(value) {
    const edition = String(value || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(EDITION_ORDER, edition) ? edition : null;
}

function parseNumericVersion(...values) {
    for (const value of values) {
        const text = String(value || '');
        const stataMatch = text.match(/Stata(?:Now)?\s*(\d{1,2})/i);
        if (stataMatch) return Number(stataMatch[1]);
    }
    for (const value of values) {
        const genericMatch = String(value || '').match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
        if (genericMatch) return Number(genericMatch[1]);
    }
    return null;
}

function sortStataCandidates(candidates) {
    return [...candidates].sort((left, right) => {
        const versionDifference = (right.version || 0) - (left.version || 0);
        if (versionDifference) return versionDifference;
        const leftOrder = EDITION_ORDER[normalizeEdition(left.edition)] ?? 99;
        const rightOrder = EDITION_ORDER[normalizeEdition(right.edition)] ?? 99;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        const leftPath = String(left.executablePath || left.appPath || '');
        const rightPath = String(right.executablePath || right.appPath || '');
        return leftPath.localeCompare(rightPath);
    });
}

function isFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

function editionFromAppName(appName) {
    const match = String(appName || '').match(/^Stata(MP|SE|BE|IC)$/i);
    return match ? match[1].toLowerCase() : null;
}

async function readDirectories(directory) {
    try {
        return await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
        return [];
    }
}

function buildMacCandidate(appPath, parentName) {
    const appName = path.basename(appPath, '.app');
    const edition = editionFromAppName(appName);
    const dylibPath = edition
        ? path.join(appPath, 'Contents', 'MacOS', `libstata-${edition}.dylib`)
        : null;
    const licensePath = path.join(path.dirname(appPath), 'stata.lic');
    return {
        appName,
        appPath,
        edition,
        version: parseNumericVersion(parentName, appName, appPath),
        dylibPath,
        hasDylib: Boolean(dylibPath && fs.existsSync(dylibPath)),
        licensePath,
        hasLicense: fs.existsSync(licensePath)
    };
}

async function scanMacApplications(baseDir) {
    const candidates = [];
    const seenPaths = new Set();
    const rootEntries = await readDirectories(baseDir);
    for (const entry of rootEntries) {
        if (!entry.isDirectory()) continue;
        const entryPath = path.join(baseDir, entry.name);
        if (entry.name.endsWith('.app') && /stata/i.test(entry.name)) {
            const candidate = buildMacCandidate(entryPath, path.basename(baseDir));
            if (!seenPaths.has(candidate.appPath)) {
                seenPaths.add(candidate.appPath);
                candidates.push(candidate);
            }
            continue;
        }
        const subEntries = await readDirectories(entryPath);
        for (const subEntry of subEntries) {
            if (!subEntry.isDirectory() || !subEntry.name.endsWith('.app') || !/stata/i.test(subEntry.name)) {
                continue;
            }
            const candidate = buildMacCandidate(path.join(entryPath, subEntry.name), entry.name);
            if (!seenPaths.has(candidate.appPath)) {
                seenPaths.add(candidate.appPath);
                candidates.push(candidate);
            }
        }
    }
    return sortStataCandidates(candidates);
}

async function discoverOnMac(options, timeoutMs) {
    const startedAt = Date.now();
    const baseDir = options.baseDir || '/Applications';
    let timeoutId;
    const timeoutResult = new Promise(resolve => {
        timeoutId = setTimeout(() => resolve({ timedOut: true, candidates: [] }), timeoutMs);
    });
    const scanResult = scanMacApplications(baseDir)
        .then(candidates => ({ timedOut: false, candidates }))
        .catch(error => ({ timedOut: false, candidates: [], error }));
    const result = await Promise.race([scanResult, timeoutResult]);
    clearTimeout(timeoutId);
    return {
        supported: true,
        candidates: result.candidates,
        elapsedMs: Date.now() - startedAt,
        timedOut: result.timedOut,
        errors: result.error ? [result.error.message] : []
    };
}

function getDiscoveryScriptPath() {
    return path.resolve(__dirname, '..', '..', '..', 'scripts', DISCOVERY_SCRIPT_NAME);
}

function getInstallationSignals(executablePath, edition) {
    const installDirectory = path.dirname(executablePath);
    const editionsToTry = edition && DLL_NAMES_BY_EDITION[edition]
        ? [edition, ...Object.keys(DLL_NAMES_BY_EDITION).filter(item => item !== edition)]
        : Object.keys(DLL_NAMES_BY_EDITION);
    const checkedDllPaths = [];
    let dllPath = null;
    let dllEdition = null;
    for (const editionToTry of editionsToTry) {
        for (const dllName of DLL_NAMES_BY_EDITION[editionToTry]) {
            const candidatePath = path.join(installDirectory, dllName);
            checkedDllPaths.push(candidatePath);
            if (!dllPath && isFile(candidatePath)) {
                dllPath = candidatePath;
                dllEdition = editionToTry;
            }
        }
    }
    return {
        hasLicense: isFile(path.join(installDirectory, 'stata.lic')),
        hasMatchingDll: Boolean(dllPath),
        dllPath,
        dllEdition,
        checkedDllPaths
    };
}

function parseDiscoveryReport(stdout) {
    const jsonText = String(stdout || '').replace(/^\uFEFF/, '').trim();
    if (!jsonText) throw new Error('Stata discovery script returned no JSON output.');
    const report = JSON.parse(jsonText);
    if (!report || report.schemaVersion !== 1 || !Array.isArray(report.candidates)) {
        throw new Error('Stata discovery script returned an unsupported JSON schema.');
    }
    return report;
}

function runWindowsDiscoveryBatch(scriptPath, timeoutMs) {
    return new Promise(resolve => {
        const commandLine = `""${scriptPath}" --stdout-only --no-pause"`;
        execFile('cmd.exe', ['/d', '/s', '/c', commandLine], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: Math.max(1, timeoutMs),
            maxBuffer: 4 * 1024 * 1024
        }, (error, stdout, stderr) => {
            resolve({
                stdout: stdout || '',
                stderr: stderr || '',
                error: error ? error.message : null,
                timedOut: Boolean(error && (error.killed || error.code === 'ETIMEDOUT'))
            });
        });
    });
}

function normalizeWindowsCandidate(candidate) {
    const executablePath = path.normalize(String(candidate.executablePath || ''));
    return {
        executablePath,
        installDirectory: path.dirname(executablePath),
        displayName: String(candidate.displayName || 'Stata'),
        edition: normalizeEdition(candidate.edition),
        version: Number(candidate.version) || parseNumericVersion(candidate.displayName),
        registryKey: String(candidate.registryKey || ''),
        registryView: String(candidate.registryView || ''),
        hasLicense: Boolean(candidate.hasLicense),
        licensePath: candidate.licensePath ? path.normalize(String(candidate.licensePath)) : null,
        hasMatchingDll: Boolean(candidate.hasMatchingDll),
        dllPath: candidate.dllPath ? path.normalize(String(candidate.dllPath)) : null,
        dllEdition: normalizeEdition(candidate.dllEdition),
        checkedDllPaths: Array.isArray(candidate.checkedDllPaths)
            ? candidate.checkedDllPaths.map(item => path.normalize(String(item)))
            : []
    };
}

function emptyWindowsResult(startedAt, scriptPath, overrides = {}) {
    return {
        supported: true,
        candidates: [],
        elapsedMs: Date.now() - startedAt,
        scriptElapsedMs: 0,
        timedOut: false,
        searchedKeys: 0,
        registryEntries: [],
        errors: [],
        scriptPath,
        ...overrides
    };
}

async function discoverOnWindows(options, timeoutMs) {
    const startedAt = Date.now();
    const scriptPath = options.scriptPath || getDiscoveryScriptPath();
    const scriptRunner = options.scriptRunner || runWindowsDiscoveryBatch;
    let execution;
    try {
        execution = await scriptRunner(scriptPath, timeoutMs);
    } catch (error) {
        execution = { stdout: '', stderr: '', error: error.message, timedOut: false };
    }
    if (execution.timedOut) {
        return emptyWindowsResult(startedAt, scriptPath, {
            timedOut: true,
            errors: [execution.error || `Stata discovery script exceeded ${timeoutMs} ms.`]
        });
    }
    let report;
    try {
        report = parseDiscoveryReport(execution.stdout);
    } catch (error) {
        const details = [error.message, execution.error, String(execution.stderr || '').trim()].filter(Boolean);
        return emptyWindowsResult(startedAt, scriptPath, { errors: [...new Set(details)] });
    }
    const candidates = report.candidates
        .map(normalizeWindowsCandidate)
        .filter(candidate => candidate.executablePath && isFile(candidate.executablePath));
    const errors = [
        ...(Array.isArray(report.errors) ? report.errors.map(String) : []),
        execution.error,
        String(execution.stderr || '').trim()
    ].filter(Boolean);
    return {
        supported: report.supported !== false,
        candidates: sortStataCandidates(candidates),
        elapsedMs: Date.now() - startedAt,
        scriptElapsedMs: Number(report.elapsedMs) || 0,
        timedOut: false,
        searchedKeys: Number(report.searchedKeys) || 0,
        registryEntries: Array.isArray(report.registryEntries) ? report.registryEntries : [],
        errors: [...new Set(errors)],
        scriptPath
    };
}

function getDiscoveryTimeout(platform = process.platform) {
    return DISCOVERY_TIMEOUT_MS[platform] || 0;
}

/**
 * Discover Stata installations for macOS or Windows.
 *
 * @param {{
 *   platform?: 'darwin'|'win32',
 *   timeoutMs?: number,
 *   baseDir?: string,
 *   scriptPath?: string,
 *   scriptRunner?: Function,
 *   allowUnsupportedPlatform?: boolean
 * }} options
 */
async function discoverStataInstallations(options = {}) {
    const platform = options.platform || process.platform;
    const supportedPlatform = platform === 'darwin' || platform === 'win32';
    if (!supportedPlatform || (platform !== process.platform && !options.allowUnsupportedPlatform)) {
        return { supported: false, candidates: [], elapsedMs: 0, timedOut: false, errors: [] };
    }
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || getDiscoveryTimeout(platform));
    return platform === 'win32'
        ? discoverOnWindows(options, timeoutMs)
        : discoverOnMac(options, timeoutMs);
}

module.exports = {
    DISCOVERY_SCRIPT_NAME,
    DISCOVERY_TIMEOUT_MS,
    EDITION_ORDER,
    discoverStataInstallations,
    editionFromAppName,
    getDiscoveryScriptPath,
    getDiscoveryTimeout,
    getInstallationSignals,
    normalizeEdition,
    parseDiscoveryReport,
    parseNumericVersion,
    sortStataCandidates
};
