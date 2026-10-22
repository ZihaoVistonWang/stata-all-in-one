const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    DISCOVERY_TIMEOUT_MS,
    discoverStataInstallations,
    editionFromLinuxExecutableName,
    editionFromLinuxLibraryName,
    inspectLinuxInstallation,
    linuxExecutablePathForLibrary,
    resolveLinuxInstallationPath,
    scanLinuxInstallations,
    selectLinuxCandidate
} = require('../modules/runCode/stataDiscovery');

const LIBRARY_NAMES = { mp: 'libstata-mp.so', se: 'libstata-se.so', be: 'libstata.so' };
const EXECUTABLE_NAMES = { mp: 'stata-mp', se: 'stata-se', be: 'stata' };

function createLinuxInstallation(root, name, options = {}) {
    const {
        editions = ['mp'],
        license = true,
        executables = true,
        marker = null
    } = options;
    const directory = path.join(root, name);
    fs.mkdirSync(directory, { recursive: true });
    for (const edition of editions) {
        fs.writeFileSync(path.join(directory, LIBRARY_NAMES[edition]), 'test');
        if (executables) fs.writeFileSync(path.join(directory, EXECUTABLE_NAMES[edition]), 'test');
    }
    if (license) fs.writeFileSync(path.join(directory, 'stata.lic'), 'test');
    if (marker) fs.writeFileSync(path.join(directory, marker), '');
    return directory;
}

async function withTempRoot(run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-linux-discovery-'));
    try {
        return await run(root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('Linux discovery default timeout is three seconds', () => {
    assert.equal(DISCOVERY_TIMEOUT_MS.linux, 3000);
});

test('Linux discovery prefers the newest version, then MP over SE over BE', async () => {
    await withTempRoot(async root => {
        createLinuxInstallation(root, 'stata17', { editions: ['be', 'se', 'mp'] });
        createLinuxInstallation(root, 'stata18', { editions: ['se'], license: false });
        const result = await discoverStataInstallations({
            platform: 'linux',
            baseDirs: [root],
            timeoutMs: 3000,
            allowUnsupportedPlatform: true
        });
        assert.equal(result.supported, true);
        assert.equal(result.timedOut, false);
        assert.deepEqual(result.searchedRoots, [root]);
        assert.deepEqual(
            result.candidates.map(item => `${item.version}-${item.edition}`),
            ['18-se', '17-mp', '17-se', '17-be']
        );
        const [newest, mp] = result.candidates;
        assert.equal(newest.displayName, 'Stata 18 SE');
        assert.equal(newest.installDirectory, path.join(root, 'stata18'));
        assert.equal(newest.libraryPath, path.join(root, 'stata18', 'libstata-se.so'));
        assert.equal(newest.executablePath, path.join(root, 'stata18', 'stata-se'));
        assert.equal(newest.hasExecutable, true);
        assert.equal(newest.hasLicense, false);
        assert.equal(mp.hasLicense, true);
        assert.equal(mp.licensePath, path.join(root, 'stata17', 'stata.lic'));
    });
});

test('Linux discovery ignores directories that are not named after Stata', async () => {
    await withTempRoot(async root => {
        createLinuxInstallation(root, 'data', { editions: ['mp'] });
        createLinuxInstallation(root, 'stata-tools', { editions: [] });
        const result = await discoverStataInstallations({
            platform: 'linux',
            baseDirs: [root, path.join(root, 'missing-root')],
            timeoutMs: 3000,
            allowUnsupportedPlatform: true
        });
        assert.deepEqual(result.candidates, []);
        assert.deepEqual(result.errors, []);
    });
});

test('libstata.so is BE from Stata 17 on and IC before that', async () => {
    await withTempRoot(root => {
        const stata16 = createLinuxInstallation(root, 'stata16', { editions: ['be'] });
        const stata17 = createLinuxInstallation(root, 'stata17', { editions: ['be'] });
        assert.equal(inspectLinuxInstallation(stata16)[0].edition, 'ic');
        assert.equal(inspectLinuxInstallation(stata16)[0].executablePath, path.join(stata16, 'stata'));
        assert.equal(inspectLinuxInstallation(stata17)[0].edition, 'be');
    });
    assert.equal(editionFromLinuxLibraryName('libstata-mp.so'), 'mp');
    assert.equal(editionFromLinuxLibraryName('/usr/local/stata18/libstata-se.so'), 'se');
    assert.equal(editionFromLinuxLibraryName('libstata.so'), 'be');
    assert.equal(editionFromLinuxLibraryName('libstata.so', 16), 'ic');
    assert.equal(editionFromLinuxLibraryName('libfoo.so'), null);
    assert.equal(editionFromLinuxExecutableName('stata-mp'), 'mp');
    assert.equal(editionFromLinuxExecutableName('xstata-se'), 'se');
    assert.equal(editionFromLinuxExecutableName('stata', 18), 'be');
    assert.equal(editionFromLinuxExecutableName('stata_br'), null);
});

test('the installation version falls back to the isstata marker file', async () => {
    await withTempRoot(root => {
        const directory = createLinuxInstallation(root, 'stata', { editions: ['mp'], marker: 'isstata.180' });
        const [candidate] = inspectLinuxInstallation(directory);
        assert.equal(candidate.version, 18);
        assert.equal(candidate.displayName, 'Stata 18 MP');
    });
});

test('Linux discovery reports a symlinked installation directory once', { skip: process.platform === 'win32' }, async () => {
    await withTempRoot(root => {
        const stata18 = createLinuxInstallation(root, 'stata18', { editions: ['mp'] });
        fs.symlinkSync(stata18, path.join(root, 'stata'), 'dir');
        const candidates = scanLinuxInstallations([root]);
        assert.equal(candidates.length, 1);
        assert.equal(candidates[0].installDirectory, fs.realpathSync(stata18));
    });
});

test('the Linux executable is chosen to match the library edition', async () => {
    await withTempRoot(root => {
        const directory = createLinuxInstallation(root, 'stata18', { editions: ['mp', 'se'] });
        assert.equal(
            linuxExecutablePathForLibrary(path.join(directory, 'libstata-se.so')),
            path.join(directory, 'stata-se')
        );
        fs.unlinkSync(path.join(directory, 'stata-se'));
        // No matching executable: fall back to any Stata console executable.
        assert.equal(
            linuxExecutablePathForLibrary(path.join(directory, 'libstata-se.so')),
            path.join(directory, 'stata-mp')
        );
        fs.unlinkSync(path.join(directory, 'stata-mp'));
        assert.equal(linuxExecutablePathForLibrary(path.join(directory, 'libstata-se.so')), '');
        assert.equal(linuxExecutablePathForLibrary(''), '');
    });
});

test('the stataPathOnLinux setting accepts a directory, a library or an executable', async () => {
    await withTempRoot(root => {
        const directory = createLinuxInstallation(root, 'stata18', { editions: ['mp', 'se'] });
        assert.deepEqual(resolveLinuxInstallationPath(` "${directory}/" `), {
            installDirectory: directory,
            edition: null,
            pinnedPath: null
        });
        assert.deepEqual(resolveLinuxInstallationPath(path.join(directory, 'libstata-se.so')), {
            installDirectory: directory,
            edition: 'se',
            pinnedPath: path.join(directory, 'libstata-se.so')
        });
        assert.deepEqual(resolveLinuxInstallationPath(path.join(directory, 'stata-mp')), {
            installDirectory: directory,
            edition: 'mp',
            pinnedPath: path.join(directory, 'stata-mp')
        });
        // A file that is not a Stata library or executable only names the directory.
        assert.deepEqual(resolveLinuxInstallationPath(path.join(directory, 'stata.lic')), {
            installDirectory: directory,
            edition: null,
            pinnedPath: null
        });
        assert.equal(resolveLinuxInstallationPath(path.join(root, 'stata19')), null);
        assert.equal(resolveLinuxInstallationPath(''), null);
        assert.equal(
            resolveLinuxInstallationPath('~/stata18', { homeDirectory: root }).installDirectory,
            directory
        );
    });
});

test('candidate selection honours the remembered library, then the edition, then the best edition', async () => {
    await withTempRoot(root => {
        const directory = createLinuxInstallation(root, 'stata18', { editions: ['mp', 'se', 'be'] });
        const candidates = inspectLinuxInstallation(directory);
        assert.deepEqual(candidates.map(item => item.edition), ['mp', 'se', 'be']);
        assert.equal(selectLinuxCandidate(candidates).edition, 'mp');
        assert.equal(selectLinuxCandidate(candidates, { edition: 'se' }).edition, 'se');
        assert.equal(selectLinuxCandidate(candidates, { edition: 'ic' }).edition, 'mp');
        assert.equal(selectLinuxCandidate(candidates, {
            edition: 'se',
            preferredLibraryPath: path.join(directory, 'libstata.so')
        }).edition, 'be');
        assert.equal(selectLinuxCandidate(candidates, {
            preferredLibraryPath: path.join(root, 'stata17', 'libstata.so')
        }).edition, 'mp');
        assert.equal(selectLinuxCandidate([], { edition: 'mp' }), null);
        assert.deepEqual(inspectLinuxInstallation(path.join(root, 'nowhere')), []);
        assert.deepEqual(inspectLinuxInstallation(''), []);
    });
});

test('Linux discovery is skipped on other hosts unless explicitly allowed', async () => {
    if (process.platform === 'linux') return;
    const result = await discoverStataInstallations({ platform: 'linux' });
    assert.equal(result.supported, false);
    assert.deepEqual(result.candidates, []);
});
