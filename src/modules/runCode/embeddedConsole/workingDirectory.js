const { readSilentStataValue } = require('./silentStataValue');

async function querySessionWorkingDirectory(consoleSession) {
    return readSilentStataValue(consoleSession, '(c(pwd))');
}

async function syncSessionWorkingDirectory(consoleSession) {
    const workingDirectory = await querySessionWorkingDirectory(consoleSession);
    if (workingDirectory) {
        consoleSession.setWorkingDirectory(workingDirectory);
        return workingDirectory;
    }
    return consoleSession.getWorkingDirectory() || null;
}

async function ensureSessionWorkingDirectory(consoleSession, docDir, cdToDoFileDir) {
    const existing = consoleSession.getWorkingDirectory();
    if (existing) {
        return existing;
    }

    if (docDir && cdToDoFileDir) {
        const escapedDir = String(docDir).replace(/"/g, '""');
        const cdResult = await consoleSession.execute(`quietly cd "${escapedDir}"`, false);
        if (!cdResult.success) {
            throw new Error(cdResult.error || 'Failed to initialize working directory.');
        }
        consoleSession.setWorkingDirectory(docDir);
        return docDir;
    }

    const workingDirectory = await querySessionWorkingDirectory(consoleSession);
    if (!workingDirectory) {
        throw new Error('Stata returned an invalid working directory.');
    }
    consoleSession.setWorkingDirectory(workingDirectory);
    return workingDirectory;
}

module.exports = {
    ensureSessionWorkingDirectory,
    querySessionWorkingDirectory,
    syncSessionWorkingDirectory
};
