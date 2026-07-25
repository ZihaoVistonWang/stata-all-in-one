const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { executeSilentStataScript } = require('./silentStataCommand');

async function readSilentStataValue(consoleSession, writeArgument, options = {}) {
    const randomBytes = options.randomBytes || crypto.randomBytes;
    const suffix = randomBytes(6).toString('hex');
    const handle = `__saio_f${suffix}`;
    const directory = options.directory || path.join(
        os.tmpdir(),
        'stata-all-in-one',
        'state'
    );
    const filePath = path.join(directory, `value-${suffix}.txt`);
    fs.mkdirSync(directory, { recursive: true });
    const stataPath = filePath.replace(/\\/g, '/').replace(/"/g, '""');
    const command = [
        `quietly capture file open ${handle} using "${stataPath}", write text replace`,
        `quietly capture file write ${handle} ${writeArgument}`,
        `quietly capture file close ${handle}`
    ].join('\n');

    try {
        const executeScript = options.executeSilentScript || executeSilentStataScript;
        const result = await executeScript(consoleSession, command, options);
        if (!result || !result.success) return null;
        return fs.readFileSync(filePath, 'utf8').trim() || null;
    } catch (_error) {
        return null;
    } finally {
        try {
            fs.unlinkSync(filePath);
        } catch (_error) {}
    }
}

module.exports = {
    readSilentStataValue
};
