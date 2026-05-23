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

function splitFilterSpec(text) {
    const raw = trim(text);
    const comma = raw.indexOf(',');
    const main = comma >= 0 ? trim(raw.slice(0, comma)) : raw;
    const optionText = comma >= 0 ? raw.slice(comma + 1) : '';
    const options = optionText.split(/\s+/).map(function (s) { return trim(s).toLowerCase(); }).filter(Boolean);
    const nolabel = options.indexOf('nolabel') >= 0;

    const matches = [];
    const re = /\b(if|in)\b/gi;
    let m;
    while ((m = re.exec(main)) !== null) {
        matches.push({ keyword: m[1].toLowerCase(), index: m.index, end: re.lastIndex });
    }
    const first = matches.length ? matches[0] : null;
    const varList = trim(first ? main.slice(0, first.index) : main);
    let ifClause = '';
    let inClause = '';
    for (let i = 0; i < matches.length; i++) {
        const cur = matches[i];
        const next = matches[i + 1];
        const value = trim(main.slice(cur.end, next ? next.index : main.length));
        if (cur.keyword === 'if') ifClause = value;
        if (cur.keyword === 'in') inClause = value;
    }
    return { raw, varList, ifClause, inClause, nolabel };
}

async function resolveVarNames(session, varList, allVarNames) {
    if (!varList) return allVarNames;
    await execStata(session, 'quietly unab __dvvars : ' + varList);
    const out = await execStata(session, 'display "`__dvvars\'"');
    const lines = splitLines(out).map(trim).filter(Boolean);
    const expanded = lines.length ? lines[lines.length - 1].split(/\s+/).filter(Boolean) : [];
    return expanded.length ? expanded : varList.split(/\s+/).filter(Boolean);
}

function makeTempVarName(prefix) {
    return prefix + Math.random().toString(36).slice(2, 10);
}

function getFilterCommands(filterSpec) {
    const keepVar = makeTempVarName('__dvk');
    const commands = ['quietly generate byte ' + keepVar + ' = 1'];
    if (filterSpec.ifClause) {
        commands.push('quietly replace ' + keepVar + ' = 0 if !(' + filterSpec.ifClause + ')');
    }
    if (filterSpec.inClause) {
        const inVar = makeTempVarName('__dvi');
        commands.push('quietly generate byte ' + inVar + ' = 0');
        commands.push('quietly replace ' + inVar + ' = 1 in ' + filterSpec.inClause);
        commands.push('quietly replace ' + keepVar + ' = 0 if !' + inVar);
    }
    commands.push('quietly keep if ' + keepVar);
    return commands;
}

async function execPreserved(session, commands) {
    let output = '';
    await execStata(session, 'preserve');
    try {
        for (const command of commands) {
            output += await execStata(session, command);
        }
    } finally {
        await execStata(session, 'restore');
    }
    return output;
}

async function getFilteredObservationCount(session, filterSpec) {
    if (!filterSpec.ifClause && !filterSpec.inClause) return null;
    const out = await execPreserved(session, getFilterCommands(filterSpec).concat([
        'quietly count',
        'display "__DV_NOBS__" r(N)'
    ]));
    for (const line of splitLines(out)) {
        const idx = line.indexOf('__DV_NOBS__');
        if (idx >= 0) {
            return parseInteger(line.slice(idx + '__DV_NOBS__'.length));
        }
    }
    return null;
}

/** Export data rows via export delimited (handles value labels correctly) */
async function exportDataRows(session, varNames, startObs, count, tmpFile, filterSpec) {
    const endObs = startObs + count - 1;
    const varList = varNames.join(' ');
    const options = ['delimiter(tab)', 'novar', 'replace'];
    if (filterSpec && filterSpec.nolabel) {
        options.push('nolabel');
    }
    const exportCmd = 'quietly export delimited ' + varList + ' using "' + tmpFile + '" in ' + startObs + '/' + endObs + ', ' + options.join(' ');
    if (filterSpec && (filterSpec.ifClause || filterSpec.inClause)) {
        await execPreserved(session, getFilterCommands(filterSpec).concat([exportCmd]));
    } else {
        await execStata(session, exportCmd);
    }
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
async function fetchDataSnapshot(rowLimit, filterText) {
    const maxRows = rowLimit || 500;
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
        const filterSpec = splitFilterSpec(filterText);
        const dataVarNames = await resolveVarNames(session, filterSpec.varList, allVarNames);
        const filteredObs = await getFilteredObservationCount(session, filterSpec);
        if (filteredObs !== null) {
            info.observations = filteredObs;
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
        const actualRows = info.observations === 0 ? 0 : Math.min(maxRows, info.observations || 999999);
        const tmpFile = path.join(os.tmpdir(), 'stata_dv_data.tsv').replace(/\\/g, '/');
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        const dataRows = actualRows > 0 ? await exportDataRows(session, dataVarNames, 1, actualRows, tmpFile, filterSpec) : [];

        return { info, vars, dataColumns: dataVarNames, dataRows, allVarNames, filterText: filterSpec.raw };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Fetch additional rows (for lazy loading). Returns just the rows data.
 */
async function fetchMoreRows(startObs, count, filterText) {
    const session = getActiveSession();
    if (!session) return [];

    try {
        const varNamesOut = await execMata(session, 'for(i=1;i<=st_nvar();i++) printf("%s\\n", st_varname(i))');
        const allVarNames = splitLines(varNamesOut).filter(function (v) { return v.length > 0; });
        if (!allVarNames.length) return [];
        const filterSpec = splitFilterSpec(filterText);
        const dataVarNames = await resolveVarNames(session, filterSpec.varList, allVarNames);

        const tmpFile = path.join(os.tmpdir(), 'stata_dv_more.tsv').replace(/\\/g, '/');
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        return await exportDataRows(session, dataVarNames, startObs, count, tmpFile, filterSpec);
    } catch (e) {
        return [];
    }
}

module.exports = { fetchDataSnapshot, fetchMoreRows };
