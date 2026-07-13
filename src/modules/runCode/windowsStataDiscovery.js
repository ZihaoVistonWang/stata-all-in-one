/**
 * Fast Windows Stata discovery through the uninstall registry.
 *
 * This module is intentionally not connected to the normal execution path yet.
 * Call discoverStataInstallationsFromRegistry() from diagnostics or experiments.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 2000;
const UNINSTALL_ROOTS = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
];
const REGISTRY_VIEWS = ['64', '32'];
const STATA_EXECUTABLE_NAMES = [
    'StataMP-64.exe',
    'StataSE-64.exe',
    'StataBE-64.exe',
    'StataIC-64.exe',
    'StataMP.exe',
    'StataSE.exe',
    'StataBE.exe',
    'StataIC.exe',
    'Stata.exe'
];
const DLL_NAMES_BY_EDITION = {
    mp: ['mp-64.dll', 'StataMP-64.dll'],
    se: ['se-64.dll', 'StataSE-64.dll'],
    be: ['be-64.dll', 'StataBE-64.dll'],
    ic: ['ic-64.dll', 'StataIC-64.dll']
};

function runReg(args, timeoutMs) {
    return new Promise((resolve) => {
        const startedAt = Date.now();
        execFile('reg.exe', args, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: Math.max(1, timeoutMs),
            maxBuffer: 4 * 1024 * 1024
        }, (error, stdout, stderr) => {
            resolve({
                ok: !error,
                stdout: stdout || '',
                stderr: stderr || '',
                error: error ? error.message : null,
                timedOut: Boolean(error && (error.killed || error.code === 'ETIMEDOUT')),
                elapsedMs: Date.now() - startedAt
            });
        });
    });
}

function registryKeysFromSearchOutput(output) {
    return String(output || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^HKEY_(?:LOCAL_MACHINE|CURRENT_USER)\\/i.test(line));
}

function registryValuesFromQueryOutput(output) {
    const values = {};
    for (const line of String(output || '').split(/\r?\n/)) {
        const match = line.match(/^\s*(DisplayName|InstallLocation|DisplayIcon)\s+REG_\w+\s+(.*?)\s*$/i);
        if (match) {
            values[match[1].toLowerCase()] = match[2];
        }
    }
    return values;
}

function normalizeDisplayIcon(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const quoted = raw.match(/^"([^"]+)"/);
    if (quoted) return quoted[1];
    return raw.replace(/,\s*-?\d+\s*$/, '').trim();
}

function isFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

function editionFromExecutable(executablePath) {
    const match = path.basename(executablePath).match(/^Stata(MP|SE|BE|IC)(?:-64)?\.exe$/i);
    return match ? match[1].toLowerCase() : null;
}

function versionFromDisplayName(displayName) {
    const match = String(displayName || '').match(/Stata(?:Now)?\s*(\d{1,2})/i);
    return match ? Number(match[1]) : null;
}

function findExecutables(values) {
    const paths = [];
    const displayIconPath = normalizeDisplayIcon(values.displayicon);
    if (/^Stata(?:MP|SE|BE|IC)?(?:-64)?\.exe$/i.test(path.basename(displayIconPath)) && isFile(displayIconPath)) {
        paths.push(displayIconPath);
    }

    const installLocation = String(values.installlocation || '').replace(/^"|"$/g, '').trim();
    if (installLocation) {
        for (const executableName of STATA_EXECUTABLE_NAMES) {
            const executablePath = path.join(installLocation, executableName);
            if (isFile(executablePath)) paths.push(executablePath);
        }
    }

    return [...new Set(paths.map(item => path.normalize(item)))];
}

function getInstallationSignals(executablePath, edition) {
    const installDirectory = path.dirname(executablePath);
    const dllNames = DLL_NAMES_BY_EDITION[edition] || [];
    return {
        hasLicense: isFile(path.join(installDirectory, 'stata.lic')),
        hasMatchingDll: dllNames.some(name => isFile(path.join(installDirectory, name)))
    };
}

function sortCandidates(candidates) {
    const editionOrder = { mp: 0, se: 1, be: 2, ic: 3 };
    return candidates.sort((left, right) => {
        const versionDifference = (right.version || 0) - (left.version || 0);
        if (versionDifference) return versionDifference;
        return (editionOrder[left.edition] ?? 99) - (editionOrder[right.edition] ?? 99);
    });
}

/**
 * Discover installed Stata executables using Windows uninstall registry data.
 * No filesystem directory traversal is performed. Only explicit paths returned
 * by the registry and a fixed executable-name list are checked.
 *
 * @param {{ timeoutMs?: number }} options
 * @returns {Promise<{
 *   supported: boolean,
 *   candidates: Array<object>,
 *   elapsedMs: number,
 *   timedOut: boolean,
 *   searchedKeys: number,
 *   errors: string[]
 * }>}
 */
async function discoverStataInstallationsFromRegistry(options = {}) {
    const startedAt = Date.now();
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
    if (process.platform !== 'win32') {
        return {
            supported: false,
            candidates: [],
            elapsedMs: Date.now() - startedAt,
            timedOut: false,
            searchedKeys: 0,
            errors: []
        };
    }

    const deadline = startedAt + timeoutMs;
    const searches = [];
    for (const root of UNINSTALL_ROOTS) {
        for (const view of REGISTRY_VIEWS) {
            searches.push(runReg(
                ['query', root, '/s', '/f', 'Stata', '/d', `/reg:${view}`],
                Math.max(1, deadline - Date.now())
            ).then(result => ({ root, view, result })));
        }
    }

    const searchResults = await Promise.all(searches);
    const errors = searchResults
        .filter(item => !item.result.ok && !item.result.timedOut && item.result.error)
        .map(item => item.result.error);
    const registryKeyMap = new Map();
    for (const item of searchResults) {
        for (const registryKey of registryKeysFromSearchOutput(item.result.stdout)) {
            registryKeyMap.set(`${item.view}:${registryKey.toLowerCase()}`, {
                registryKey,
                registryView: item.view
            });
        }
    }
    const registryKeys = [...registryKeyMap.values()];
    let timedOut = searchResults.some(item => item.result.timedOut) || Date.now() >= deadline;

    const detailQueries = [];
    if (!timedOut) {
        for (const item of registryKeys) {
            detailQueries.push(runReg(
                ['query', item.registryKey, `/reg:${item.registryView}`],
                Math.max(1, deadline - Date.now())
            ).then(result => ({ ...item, result })));
        }
    }

    const details = await Promise.all(detailQueries);
    timedOut = timedOut || details.some(item => item.result.timedOut) || Date.now() >= deadline;
    for (const item of details) {
        if (!item.result.ok && !item.result.timedOut && item.result.error) errors.push(item.result.error);
    }

    const candidates = [];
    for (const item of details) {
        const values = registryValuesFromQueryOutput(item.result.stdout);
        if (!/\bStata(?:Now)?\s*\d*/i.test(values.displayname || '')) continue;

        for (const executablePath of findExecutables(values)) {
            const edition = editionFromExecutable(executablePath);
            candidates.push({
                executablePath,
                installDirectory: path.dirname(executablePath),
                displayName: values.displayname || 'Stata',
                edition,
                version: versionFromDisplayName(values.displayname),
                registryKey: item.registryKey,
                registryView: item.registryView,
                ...getInstallationSignals(executablePath, edition)
            });
        }
    }

    const uniqueCandidates = [...new Map(
        candidates.map(candidate => [candidate.executablePath.toLowerCase(), candidate])
    ).values()];

    return {
        supported: true,
        candidates: sortCandidates(uniqueCandidates),
        elapsedMs: Date.now() - startedAt,
        timedOut,
        searchedKeys: registryKeys.length,
        errors: [...new Set(errors)]
    };
}

module.exports = {
    DEFAULT_TIMEOUT_MS,
    discoverStataInstallationsFromRegistry,
    normalizeDisplayIcon,
    registryKeysFromSearchOutput,
    registryValuesFromQueryOutput,
    versionFromDisplayName
};
