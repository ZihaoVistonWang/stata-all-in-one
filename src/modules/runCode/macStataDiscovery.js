const fs = require('fs');
const path = require('path');
const { parseNumericVersion, sortStataCandidates } = require('./stataDiscovery');

const DEFAULT_TIMEOUT_MS = 3000;

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

function buildCandidate(appPath, parentName) {
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

async function scanApplications(baseDir) {
    const candidates = [];
    const seenPaths = new Set();
    const rootEntries = await readDirectories(baseDir);

    for (const entry of rootEntries) {
        if (!entry.isDirectory()) continue;
        const entryPath = path.join(baseDir, entry.name);
        if (entry.name.endsWith('.app') && /stata/i.test(entry.name)) {
            const candidate = buildCandidate(entryPath, path.basename(baseDir));
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
            const candidate = buildCandidate(path.join(entryPath, subEntry.name), entry.name);
            if (!seenPaths.has(candidate.appPath)) {
                seenPaths.add(candidate.appPath);
                candidates.push(candidate);
            }
        }
    }

    return sortStataCandidates(candidates);
}

async function discoverMacStataInstallations(options = {}) {
    const startedAt = Date.now();
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
    const baseDir = options.baseDir || '/Applications';
    if (process.platform !== 'darwin' && !options.allowUnsupportedPlatform) {
        return { supported: false, candidates: [], elapsedMs: 0, timedOut: false, errors: [] };
    }

    let timeoutId;
    const timeoutResult = new Promise(resolve => {
        timeoutId = setTimeout(() => resolve({ timedOut: true, candidates: [] }), timeoutMs);
    });
    const scanResult = scanApplications(baseDir)
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

module.exports = {
    DEFAULT_TIMEOUT_MS,
    discoverMacStataInstallations,
    editionFromAppName
};
