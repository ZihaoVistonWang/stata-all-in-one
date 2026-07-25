const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function executeSilentStataScript(consoleSession, code, options = {}) {
    const randomBytes = options.randomBytes || crypto.randomBytes;
    const suffix = randomBytes(6).toString('hex');
    const directory = options.directory || path.join(
        os.tmpdir(),
        'stata-all-in-one',
        'state'
    );
    const scriptPath = path.join(directory, `control-${suffix}.do`);
    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(scriptPath, String(code || ''), 'utf8');
    const stataPath = scriptPath.replace(/\\/g, '/').replace(/"/g, '""');
    try {
        return await consoleSession.execute(`run "${stataPath}"`, false);
    } finally {
        try {
            await fs.promises.unlink(scriptPath);
        } catch (_error) {}
    }
}

module.exports = {
    executeSilentStataScript
};
