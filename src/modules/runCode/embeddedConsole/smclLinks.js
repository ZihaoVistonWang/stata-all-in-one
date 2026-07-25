const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { StringDecoder } = require('string_decoder');
const { executeSilentStataScript } = require('./silentStataCommand');

const MONTH_DIRECTORY = /^\d{6}$/;
const MAX_SCAN_TEXT_LENGTH = 65536;

function pad(value, length = 2) {
    return String(value).padStart(length, '0');
}

function monthKey(date) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}`;
}

function timestampKey(date) {
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('') + '-' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join('') + '-' + pad(date.getMilliseconds(), 3);
}

function createSmclLogPath(options = {}) {
    const now = options.now || new Date();
    const tempDirectory = options.tempDirectory || os.tmpdir();
    return path.join(
        tempDirectory,
        'stata-all-in-one',
        'log',
        monthKey(now),
        `${timestampKey(now)}.smcl`
    );
}

function createSmclLogName(options = {}) {
    const randomBytes = options.randomBytes || crypto.randomBytes;
    return `__saio_${randomBytes(6).toString('hex')}`;
}

function retainedMonthKeys(now = new Date(), count = 3) {
    const keys = new Set();
    for (let offset = 0; offset < count; offset += 1) {
        keys.add(monthKey(new Date(now.getFullYear(), now.getMonth() - offset, 1)));
    }
    return keys;
}

function pruneOldSmclLogs(options = {}) {
    const tempDirectory = options.tempDirectory || os.tmpdir();
    const root = path.join(tempDirectory, 'stata-all-in-one', 'log');
    const retained = retainedMonthKeys(options.now || new Date(), 3);
    let entries;
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (error) {
        if (error && error.code === 'ENOENT') return;
        throw error;
    }
    for (const entry of entries) {
        if (!entry.isDirectory() || !MONTH_DIRECTORY.test(entry.name) || retained.has(entry.name)) {
            continue;
        }
        fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
    }
}

function unwrapStataQuotedValue(value) {
    const text = String(value || '').trim();
    if (text.startsWith('`"') && text.endsWith('"\'') && text.length >= 4) {
        return text.slice(2, -2).replace(/""/g, '"');
    }
    if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
        return text.slice(1, -1).replace(/""/g, '"');
    }
    return text;
}

function isWebTarget(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
}

function parseExplicitSmclLinks(smclText) {
    const links = [];
    const regex = /\{(browse|view)\s+(`"[\s\S]*?"'|"[^"\r\n]*"|[^}: \r\n]+)(?:\s*:\s*([^}]*))?\}/gi;
    let match;
    while ((match = regex.exec(String(smclText || ''))) !== null) {
        const target = unwrapStataQuotedValue(match[2]);
        if (!target) continue;
        const label = String(match[3] || '').trim() || target;
        links.push({
            kind: isWebTarget(target)
                ? 'url'
                : (/^dir$/i.test(label) ? 'directory' : 'path'),
            target,
            label,
            source: 'smcl-explicit'
        });
    }
    return links;
}

function stripSmclFormatting(value) {
    return String(value || '')
        .replace(/\{(?:txt|res|bf|rm|sf|it|ul(?:\s+off)?|p(?:\s+[^}]*)?|p_end)\}/gi, '')
        .replace(/\{space\s+\d+\}/gi, ' ')
        .replace(/\{col\s+\d+\}/gi, ' ')
        .replace(/\r/g, '');
}

function parsePlainSmclFileLinks(smclText) {
    const outputOnly = String(smclText || '')
        .split('\n')
        .filter(line => !/^\s*\{com\}/i.test(line))
        .join('\n');
    const text = stripSmclFormatting(outputOnly);
    const links = [];
    const patterns = [
        /\b(?:has been written to file|written to file|output written to)\s+([^\r\n]+?\.[A-Za-z0-9]{1,12})(?=\s*$)/gim,
        /\bfile\s+([\s\S]+?\.[A-Za-z0-9]{1,12})\s+(?=saved(?:\s+as)?\b)/gim
    ];
    for (const regex of patterns) {
        let match;
        while ((match = regex.exec(text)) !== null) {
            const target = match[1]
                .replace(/\n\s*>?\s*/g, '')
                .trim()
                .replace(/[!),;:]+$/, '');
            if (!target || /[$`*?]/.test(target)) continue;
            links.push({
                kind: 'path',
                target,
                label: target,
                source: 'smcl-output'
            });
        }
    }
    return links;
}

function uniqueSmclLinks(links) {
    const seen = new Set();
    return links.filter(link => {
        const key = `${link.kind}\u0000${link.target}\u0000${link.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function parseSmclLinks(smclText) {
    return uniqueSmclLinks([
        ...parseExplicitSmclLinks(smclText),
        ...parsePlainSmclFileLinks(smclText)
    ]);
}

class SmclSidecar {
    constructor(consoleSession, logPath, options = {}) {
        this.consoleSession = consoleSession;
        this.logPath = logPath;
        this.logName = options.logName || createSmclLogName(options);
        this.offset = 0;
        this.scanText = '';
        this.keys = new Set();
        this.active = false;
        this.decoder = new StringDecoder('utf8');
        this.scanIntervalMs = options.scanIntervalMs === undefined
            ? 200
            : Math.max(0, Number(options.scanIntervalMs) || 0);
        this.nowMs = options.nowMs || Date.now;
        this.lastScanAt = 0;
        this.drainPromise = Promise.resolve([]);
        this.executeSilentScript = options.executeSilentScript || executeSilentStataScript;
    }

    async start() {
        await fs.promises.mkdir(path.dirname(this.logPath), { recursive: true });
        const escapedPath = this.logPath.replace(/"/g, '""');
        const result = await this.executeSilentScript(
            this.consoleSession,
            `quietly capture log using "${escapedPath}", replace smcl name(${this.logName}) nomsg`
        );
        try {
            await fs.promises.access(this.logPath);
            this.active = Boolean(result && result.success);
        } catch (_error) {
            this.active = false;
        }
        return this.active;
    }

    drain() {
        const task = this.drainPromise.then(() => this._drainIncrement());
        this.drainPromise = task.catch(() => []);
        return task;
    }

    async _drainIncrement() {
        if (!this.active) return [];
        const now = this.nowMs();
        if (this.lastScanAt && now - this.lastScanAt < this.scanIntervalMs) return [];
        this.lastScanAt = now;

        let size;
        try {
            size = (await fs.promises.stat(this.logPath)).size;
        } catch (_error) {
            return [];
        }
        if (size <= this.offset) return [];

        let descriptor = null;
        try {
            descriptor = await fs.promises.open(this.logPath, 'r');
            const buffer = Buffer.allocUnsafe(size - this.offset);
            await descriptor.read(buffer, 0, buffer.length, this.offset);
            this.offset = size;
            this.scanText += this.decoder.write(buffer);
        } catch (_error) {
            return [];
        } finally {
            if (descriptor) await descriptor.close();
        }

        const fresh = [];
        for (const link of parseSmclLinks(this.scanText)) {
            const key = `${link.kind}\u0000${link.target}\u0000${link.label}`;
            if (this.keys.has(key)) continue;
            this.keys.add(key);
            fresh.push(link);
        }
        if (this.scanText.length > MAX_SCAN_TEXT_LENGTH) {
            this.scanText = this.scanText.slice(-MAX_SCAN_TEXT_LENGTH);
        }
        return fresh;
    }

    async finish() {
        if (!this.active) return [];
        await this.drainPromise;
        await this.executeSilentScript(
            this.consoleSession,
            `quietly capture log close ${this.logName}`
        );
        let links = [];
        try {
            links = parseSmclLinks(await fs.promises.readFile(this.logPath, 'utf8'));
        } catch (_error) {
            links = [];
        }
        this.active = false;
        return links;
    }
}

async function startSmclSidecar(consoleSession, options = {}) {
    try {
        pruneOldSmclLogs(options);
        const sidecar = new SmclSidecar(
            consoleSession,
            options.logPath || createSmclLogPath(options),
            options
        );
        return await sidecar.start() ? sidecar : null;
    } catch (error) {
        console.warn('Stata All in One: SMCL sidecar unavailable:', error.message);
        return null;
    }
}

module.exports = {
    SmclSidecar,
    createSmclLogName,
    createSmclLogPath,
    parseExplicitSmclLinks,
    parsePlainSmclFileLinks,
    parseSmclLinks,
    pruneOldSmclLogs,
    retainedMonthKeys,
    startSmclSidecar,
    unwrapStataQuotedValue
};
