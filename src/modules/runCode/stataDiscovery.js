/**
 * Cross-platform Stata installation discovery.
 *
 * macOS scans /Applications directly. Windows runs the bundled standalone BAT
 * registry probe and consumes its JSON report. Linux scans the conventional
 * installation roots (/usr/local, /opt, $HOME) for Stata directories. Platform
 * differences remain internal so callers use one discovery entry point.
 *
 * This module is deliberately free of `vscode` so the Console session, the
 * hover provider and the tests can share the Linux path helpers below.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDITION_ORDER = Object.freeze({ mp: 0, se: 1, be: 2, ic: 3 });
const DISCOVERY_TIMEOUT_MS = Object.freeze({ darwin: 3000, win32: 5000, linux: 3000 });
const DISCOVERY_SCRIPT_NAME = 'discover_stata_windows.bat';
const DLL_NAMES_BY_EDITION = {
    mp: ['mp-64.dll', 'StataMP-64.dll'],
    se: ['se-64.dll', 'StataSE-64.dll'],
    be: ['be-64.dll', 'StataBE-64.dll'],
    ic: ['ic-64.dll', 'StataIC-64.dll']
};
// Linux ships every edition in one directory (for example /usr/local/stata18):
// the shared library and the console executable are named after the edition.
// `libstata.so` / `stata` is BE from Stata 17 on and IC before that.
const LINUX_LIBRARY_NAMES_BY_EDITION = Object.freeze({
    mp: 'libstata-mp.so',
    se: 'libstata-se.so',
    be: 'libstata.so',
    ic: 'libstata.so'
});
const LINUX_EXECUTABLE_NAMES_BY_EDITION = Object.freeze({
    mp: 'stata-mp',
    se: 'stata-se',
    be: 'stata',
    ic: 'stata'
});
const LINUX_SEARCH_ROOTS = Object.freeze(['/usr/local', '/opt']);

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

function isDirectory(directoryPath) {
    try {
        return fs.statSync(directoryPath).isDirectory();
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
        const commandArgs = getWindowsDiscoveryCommandArgs(scriptPath);
        execFile('cmd.exe', commandArgs, {
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

function getWindowsDiscoveryCommandArgs(scriptPath) {
    return ['/d', '/s', '/c', 'call', scriptPath, '--stdout-only', '--no-pause'];
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

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

/**
 * Edition encoded in a Linux library file name.
 * `libstata.so` is BE from Stata 17 on and IC before that, so the numeric
 * version decides when it is known.
 * @param {string} fileName - file name or full path
 * @param {number|null} [version]
 * @returns {'mp'|'se'|'be'|'ic'|null}
 */
function editionFromLinuxLibraryName(fileName, version = null) {
    const name = path.basename(String(fileName || ''));
    if (name === LINUX_LIBRARY_NAMES_BY_EDITION.mp) return 'mp';
    if (name === LINUX_LIBRARY_NAMES_BY_EDITION.se) return 'se';
    if (name === LINUX_LIBRARY_NAMES_BY_EDITION.be) {
        return Number(version) && Number(version) < 17 ? 'ic' : 'be';
    }
    return null;
}

/**
 * Edition encoded in a Linux executable name (`stata-mp`, `xstata-se`, `stata`).
 * @param {string} fileName - file name or full path
 * @param {number|null} [version]
 * @returns {'mp'|'se'|'be'|'ic'|null}
 */
function editionFromLinuxExecutableName(fileName, version = null) {
    const match = path.basename(String(fileName || '')).match(/^x?stata(?:-(mp|se))?$/);
    if (!match) return null;
    if (match[1]) return match[1];
    return Number(version) && Number(version) < 17 ? 'ic' : 'be';
}

/**
 * Numeric version of a Linux installation directory: from the directory name
 * (stata18, StataNow19), otherwise from the `isstata.180` marker Stata writes.
 */
function parseLinuxInstallationVersion(installDirectory, parentName = null) {
    const fromName = parseNumericVersion(path.basename(installDirectory), parentName);
    if (fromName) return fromName;
    try {
        const marker = fs.readdirSync(installDirectory).find(name => /^isstata\.\d{3}$/.test(name));
        return marker ? Math.floor(Number(marker.slice('isstata.'.length)) / 10) : null;
    } catch {
        return null;
    }
}

/**
 * Console executable in `directory` for `edition`, falling back to any Stata
 * console executable found there. Returns '' when none exists.
 */
function findLinuxExecutable(directory, edition = null) {
    const normalizedEdition = normalizeEdition(edition);
    const names = [
        ...(normalizedEdition ? [LINUX_EXECUTABLE_NAMES_BY_EDITION[normalizedEdition]] : []),
        'stata-mp',
        'stata-se',
        'stata'
    ].filter((name, index, values) => values.indexOf(name) === index);
    for (const name of names) {
        const candidate = path.join(directory, name);
        if (isFile(candidate)) return candidate;
    }
    return '';
}

/**
 * Stata executable that matches a Linux shared library, used as argv[0] when
 * the library is started: /usr/local/stata18/libstata-mp.so → .../stata-mp.
 * @param {string} libraryPath
 * @returns {string} executable path, or '' when no executable exists
 */
function linuxExecutablePathForLibrary(libraryPath) {
    const normalized = String(libraryPath || '');
    if (!normalized) return '';
    return findLinuxExecutable(path.dirname(normalized), editionFromLinuxLibraryName(normalized));
}

/**
 * Describe the Stata installation in `installDirectory`: one candidate per
 * edition whose shared library is present, best edition first (MP > SE > BE).
 * Returns [] when the directory does not exist or holds no Stata library.
 * @param {string} installDirectory
 * @param {string|null} [parentName] - used as a secondary version hint
 */
function inspectLinuxInstallation(installDirectory, parentName = null) {
    const directory = path.resolve(String(installDirectory || '').trim() || '.');
    if (!String(installDirectory || '').trim() || !isDirectory(directory)) return [];
    const version = parseLinuxInstallationVersion(directory, parentName);
    const licensePath = path.join(directory, 'stata.lic');
    const hasLicense = isFile(licensePath);
    const candidates = [];
    for (const libraryName of new Set(Object.values(LINUX_LIBRARY_NAMES_BY_EDITION))) {
        const libraryPath = path.join(directory, libraryName);
        if (!isFile(libraryPath)) continue;
        const edition = editionFromLinuxLibraryName(libraryPath, version);
        const executablePath = path.join(directory, LINUX_EXECUTABLE_NAMES_BY_EDITION[edition]);
        candidates.push({
            installDirectory: directory,
            displayName: ['Stata', version, edition.toUpperCase()].filter(Boolean).join(' '),
            edition,
            version,
            libraryPath,
            hasLibrary: true,
            executablePath,
            hasExecutable: isFile(executablePath),
            licensePath,
            hasLicense
        });
    }
    return sortStataCandidates(candidates);
}

/**
 * Pick one candidate of an installation.
 * A library path that is present wins, then the requested edition, then the
 * best edition available (the candidates are already sorted MP > SE > BE).
 * @param {object[]} candidates - from inspectLinuxInstallation()
 * @param {{ edition?: string|null, preferredLibraryPath?: string|null }} [preferences]
 * @returns {object|null}
 */
function selectLinuxCandidate(candidates, preferences = {}) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return null;
    const preferredLibraryPath = String(preferences.preferredLibraryPath || '');
    if (preferredLibraryPath) {
        const byLibrary = list.find(item => path.resolve(item.libraryPath) === path.resolve(preferredLibraryPath));
        if (byLibrary) return byLibrary;
    }
    const edition = normalizeEdition(preferences.edition);
    if (edition) {
        const byEdition = list.find(item => item.edition === edition);
        if (byEdition) return byEdition;
    }
    return list[0];
}

/**
 * Interpret the `stataPathOnLinux` setting (or a path reported by Stata).
 * Accepts an installation directory, or a library / executable inside it,
 * which additionally pins the edition. `~` refers to the home directory.
 * @param {string} rawValue
 * @param {{ homeDirectory?: string }} [options]
 * @returns {{ installDirectory: string, edition: string|null, pinnedPath: string|null }|null}
 */
function resolveLinuxInstallationPath(rawValue, options = {}) {
    let value = String(rawValue || '').trim().replace(/^["']+|["']+$/g, '').trim();
    if (!value) return null;
    if (value === '~' || value.startsWith('~/')) {
        value = path.join(options.homeDirectory || os.homedir(), value.slice(1));
    }
    value = path.resolve(value);
    if (isDirectory(value)) {
        return { installDirectory: value, edition: null, pinnedPath: null };
    }
    if (isFile(value)) {
        const installDirectory = path.dirname(value);
        const version = parseLinuxInstallationVersion(installDirectory);
        const edition = editionFromLinuxLibraryName(value, version)
            || editionFromLinuxExecutableName(value, version);
        return edition
            ? { installDirectory, edition, pinnedPath: value }
            : { installDirectory, edition: null, pinnedPath: null };
    }
    return null;
}

/**
 * Directories scanned for Stata installations on Linux.
 */
function getLinuxSearchRoots(homeDirectory = os.homedir()) {
    return [...LINUX_SEARCH_ROOTS, homeDirectory].filter(Boolean);
}

/**
 * Scan `roots` for Stata installation directories (names starting with
 * "stata", case-insensitively, such as stata18 or StataNow19). Symlinked
 * duplicates (e.g. /usr/local/stata → /usr/local/stata18) are reported once.
 * Synchronous so the hover provider can reuse it.
 * @param {string[]} roots
 */
function scanLinuxInstallations(roots = getLinuxSearchRoots()) {
    const candidates = [];
    const seen = new Set();
    for (const root of roots) {
        let entries = [];
        try {
            entries = fs.readdirSync(root);
        } catch {
            continue;
        }
        for (const name of entries) {
            if (!/^stata/i.test(name)) continue;
            const directory = path.join(root, name);
            if (!isDirectory(directory)) continue;
            let realDirectory = directory;
            try {
                realDirectory = fs.realpathSync(directory);
            } catch {
                // Keep the path as listed.
            }
            if (seen.has(realDirectory)) continue;
            seen.add(realDirectory);
            candidates.push(...inspectLinuxInstallation(realDirectory, path.basename(root)));
        }
    }
    return sortStataCandidates(candidates);
}

async function discoverOnLinux(options, timeoutMs) {
    const startedAt = Date.now();
    const roots = Array.isArray(options.baseDirs) && options.baseDirs.length
        ? options.baseDirs
        : getLinuxSearchRoots();
    let timeoutId;
    const timeoutResult = new Promise(resolve => {
        timeoutId = setTimeout(() => resolve({ timedOut: true, candidates: [] }), timeoutMs);
    });
    const scanResult = Promise.resolve()
        .then(() => ({ timedOut: false, candidates: scanLinuxInstallations(roots) }))
        .catch(error => ({ timedOut: false, candidates: [], error }));
    const result = await Promise.race([scanResult, timeoutResult]);
    clearTimeout(timeoutId);
    return {
        supported: true,
        candidates: result.candidates,
        elapsedMs: Date.now() - startedAt,
        timedOut: result.timedOut,
        errors: result.error ? [result.error.message] : [],
        searchedRoots: roots
    };
}

function getDiscoveryTimeout(platform = process.platform) {
    return DISCOVERY_TIMEOUT_MS[platform] || 0;
}

/**
 * Discover Stata installations for macOS, Windows or Linux.
 *
 * @param {{
 *   platform?: 'darwin'|'win32'|'linux',
 *   timeoutMs?: number,
 *   baseDir?: string,
 *   baseDirs?: string[],
 *   scriptPath?: string,
 *   scriptRunner?: Function,
 *   allowUnsupportedPlatform?: boolean
 * }} options
 */
async function discoverStataInstallations(options = {}) {
    const platform = options.platform || process.platform;
    const supportedPlatform = platform === 'darwin' || platform === 'win32' || platform === 'linux';
    if (!supportedPlatform || (platform !== process.platform && !options.allowUnsupportedPlatform)) {
        return { supported: false, candidates: [], elapsedMs: 0, timedOut: false, errors: [] };
    }
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || getDiscoveryTimeout(platform));
    if (platform === 'win32') return discoverOnWindows(options, timeoutMs);
    if (platform === 'linux') return discoverOnLinux(options, timeoutMs);
    return discoverOnMac(options, timeoutMs);
}

module.exports = {
    DISCOVERY_SCRIPT_NAME,
    DISCOVERY_TIMEOUT_MS,
    EDITION_ORDER,
    LINUX_EXECUTABLE_NAMES_BY_EDITION,
    LINUX_LIBRARY_NAMES_BY_EDITION,
    discoverStataInstallations,
    editionFromAppName,
    editionFromLinuxExecutableName,
    editionFromLinuxLibraryName,
    findLinuxExecutable,
    getDiscoveryScriptPath,
    getDiscoveryTimeout,
    getLinuxSearchRoots,
    getWindowsDiscoveryCommandArgs,
    getInstallationSignals,
    inspectLinuxInstallation,
    linuxExecutablePathForLibrary,
    normalizeEdition,
    parseDiscoveryReport,
    parseNumericVersion,
    resolveLinuxInstallationPath,
    scanLinuxInstallations,
    selectLinuxCandidate,
    sortStataCandidates
};
