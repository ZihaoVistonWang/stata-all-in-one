const fs = require('fs');
const path = require('path');
const os = require('os');
const { getActiveSession } = require('../session');

function splitLines(text) {
    return (text || '').split(/\r?\n/);
}

function trim(s) {
    return (s || '').trim();
}

function parseInteger(s) {
    const m = trim(s).match(/(\d[\d,]*)/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
}

async function execMata(session, mataCode) {
    const r = await session.execute('mata: ' + mataCode, false);
    return r.success ? r.output : '';
}

async function execStata(session, code) {
    const r = await session.execute(code, false);
    return r.success ? r.output : '';
}


/** Export data rows via export delimited (handles value labels correctly) */
async function exportDataRows(session, varNames, startObs, count, tmpFile) {
    const endObs = startObs + count - 1;
    const varList = varNames.join(' ');
    const cmd = 'quietly export delimited ' + varList + ' using "' + tmpFile + '" in ' + startObs + '/' + endObs + ', delimiter(tab) novar replace';
    await execStata(session, cmd);
    if (!fs.existsSync(tmpFile)) return [];

    const text = fs.readFileSync(tmpFile, 'utf8');
    const rows = [];
    const lines = splitLines(text);
    for (let ri = 0; ri < lines.length; ri++) {
        const dl = trim(lines[ri]);
        if (!dl) continue;
        rows.push({ rowNum: startObs + ri, values: dl.split('\t') });
    }
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return rows;
}

/**
 * Fetch initial dataset snapshot:
 * - info: observations, variables, source file
 * - vars: all variable metadata (name, type, format, label)
 * - dataColumns: all variable names
 * - dataRows: first N rows of data
 */
async function fetchDataSnapshot(rowLimit) {
    const maxRows = rowLimit || 100;
    const session = getActiveSession();
    if (!session) return { error: 'Stata session not initialized' };

    try {
        // Check if dataset exists
        const nobsOut = trim(await execMata(session, 'st_nobs()'));
        if (!nobsOut || nobsOut === '0' || nobsOut.startsWith('.')) {
            return { info: { observations: 0, variables: 0 }, vars: [], dataColumns: [], dataRows: [] };
        }
        const nobs = parseInteger(nobsOut);

        // 1. Basic info
        const nvarOut = trim(await execMata(session, 'st_nvar()'));
        const infoOut = await execStata(session, 'describe, short');
        const info = { observations: nobs, variables: parseInteger(nvarOut), source: '', sortedBy: null };
        for (const line of splitLines(infoOut)) {
            const l = trim(line);
            if (!l) continue;
            const low = l.toLowerCase();
            if (low.includes('contains data from')) {
                info.source = trim(l.substring(l.indexOf('from') + 4));
            } else if (low.includes('obs:')) {
                info.observations = parseInteger(l) || info.observations;
            } else if (low.includes('vars:')) {
                info.variables = parseInteger(l) || info.variables;
            } else if (low.includes('sorted by:')) {
                info.sortedBy = trim(l.substring(l.indexOf(':') + 1));
            }
        }

        // 2. All variable names via Mata (reliable, no text parsing)
        const varNamesOut = await execMata(session, 'for(i=1;i<=st_nvar();i++) printf("%s\\n", st_varname(i))');
        const allVarNames = splitLines(varNamesOut).filter(function (v) { return v.length > 0; });
        if (!allVarNames.length) {
            return { info, vars: [], dataColumns: [], dataRows: [] };
        }

        // 3. Variable metadata
        const metaOut = await execMata(session,
            'for(i=1;i<=st_nvar();i++) printf("%s|%s|%s|%s\\n", st_varname(i), st_vartype(i), st_varformat(i), st_varlabel(i))'
        );
        const vars = [];
        for (const line of splitLines(metaOut)) {
            const parts = trim(line).split('|');
            if (parts.length >= 3) {
                vars.push({ name: parts[0], type: parts[1], format: parts[2], label: parts[3] || null, valueLabel: null });
            }
        }

        // 4. Data rows: export delimited (handles value labels, fast for limited rows)
        const actualRows = Math.min(maxRows, info.observations || 999999);
        const tmpFile = path.join(os.tmpdir(), 'stata_dv_data.tsv').replace(/\\/g, '/');
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        const dataRows = await exportDataRows(session, allVarNames, 1, actualRows, tmpFile);

        return { info, vars, dataColumns: allVarNames, dataRows };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Fetch additional rows (for lazy loading). Returns just the rows data.
 */
async function fetchMoreRows(startObs, count) {
    const session = getActiveSession();
    if (!session) return [];

    try {
        const varNamesOut = await execMata(session, 'for(i=1;i<=st_nvar();i++) printf("%s\\n", st_varname(i))');
        const allVarNames = splitLines(varNamesOut).filter(function (v) { return v.length > 0; });
        if (!allVarNames.length) return [];

        const tmpFile = path.join(os.tmpdir(), 'stata_dv_more.tsv').replace(/\\/g, '/');
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        return await exportDataRows(session, allVarNames, startObs, count, tmpFile);
    } catch (e) {
        return [];
    }
}

module.exports = { fetchDataSnapshot, fetchMoreRows };
