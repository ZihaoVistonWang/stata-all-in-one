const PWD_BEGIN_MARKER = '__SAIO_PWD_BEGIN__';
const PWD_END_MARKER = '__SAIO_PWD_END__';

function parseStataWorkingDirectory(output) {
    const text = String(output || '');
    const start = text.indexOf(PWD_BEGIN_MARKER);
    const end = text.indexOf(PWD_END_MARKER, start + PWD_BEGIN_MARKER.length);
    if (start < 0 || end < 0) {
        return null;
    }

    const value = text
        .slice(start + PWD_BEGIN_MARKER.length, end)
        .replace(/\r?\n/g, '')
        .trim();
    return value || null;
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

    const result = await consoleSession.execute(
        `display "${PWD_BEGIN_MARKER}" c(pwd) "${PWD_END_MARKER}"`,
        false
    );
    if (!result.success) {
        throw new Error(result.error || 'Failed to read the Stata working directory.');
    }

    const workingDirectory = parseStataWorkingDirectory(result.output);
    if (!workingDirectory) {
        throw new Error('Stata returned an invalid working directory.');
    }
    consoleSession.setWorkingDirectory(workingDirectory);
    return workingDirectory;
}

module.exports = {
    ensureSessionWorkingDirectory,
    parseStataWorkingDirectory
};
