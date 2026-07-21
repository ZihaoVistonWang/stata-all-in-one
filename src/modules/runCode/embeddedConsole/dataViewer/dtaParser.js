"use strict";
// Portions derived from the MIT-licensed stata-preview project by LiuQi and Diego Menares.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../../../../../../private/tmp/stata-preview-audit.F9rg1F/repo/src/dta/parser.ts
var parser_exports = {};
__export(parser_exports, {
  DtaParser: () => DtaParser
});
module.exports = __toCommonJS(parser_exports);
var import_node_buffer = require("node:buffer");
var import_vscode3 = require("vscode");
var dtaL10n3 = import_vscode3.l10n || { t: (text) => text };

// ../../../../../../../private/tmp/stata-preview-audit.F9rg1F/repo/src/dta/parserLegacy.ts
var import_vscode = require("vscode");
var dtaL10n = import_vscode.l10n || { t: (text) => text };
function readUInt16(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}
function readInt16(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readInt16LE(offset) : buf.readInt16BE(offset);
}
function readInt32(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readInt32LE(offset) : buf.readInt32BE(offset);
}
function readFloat(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readFloatLE(offset) : buf.readFloatBE(offset);
}
function readDouble(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
}
function readCString(buf, offset, maxLen) {
  let end = offset;
  const limit = Math.min(offset + maxLen, buf.length);
  while (end < limit && buf[end] !== 0)
    end++;
  return buf.toString("latin1", offset, end);
}
function isMissingNumeric(v, t) {
  if (v === null || v === void 0 || Number.isNaN(v))
    return true;
  if (t === "byte")
    return v > 100;
  if (t === "int")
    return v > 32740;
  if (t === "long")
    return v > 2147483620;
  if (t === "float")
    return v >= 17014118e31 || !Number.isFinite(v);
  if (t === "double")
    return v >= 898846567431158e293 || !Number.isFinite(v);
  return false;
}
function allocColumn(type, n) {
  if (type === "byte")
    return new Int8Array(n);
  if (type === "int")
    return new Int16Array(n);
  if (type === "long")
    return new Int32Array(n);
  if (type === "float")
    return new Float32Array(n);
  if (type === "double")
    return new Float64Array(n);
  return Array.from({ length: n }).fill("");
}
function decodeLegacyType(code) {
  if (code === 251)
    return { type: "byte", size: 1 };
  if (code === 252)
    return { type: "int", size: 2 };
  if (code === 253)
    return { type: "long", size: 4 };
  if (code === 254)
    return { type: "float", size: 4 };
  if (code === 255)
    return { type: "double", size: 8 };
  if (code >= 1 && code <= 244)
    return { type: `str${code}`, size: code };
  return null;
}
function createLegacyColumns(headers, types, typeSizes, nobs) {
  const columns = {};
  const missing = {};
  const colOffsets = [];
  let acc = 0;
  for (let j = 0; j < types.length; j++) {
    colOffsets.push(acc);
    acc += typeSizes[j];
  }
  for (let j = 0; j < headers.length; j++) {
    columns[headers[j]] = allocColumn(types[j], nobs);
    missing[headers[j]] = new Uint8Array(nobs);
  }
  return { columns, missing, colOffsets };
}
function readLegacyRow(buf, rowOff, i, headers, types, typeSizes, columns, missing, colOffsets, byteOrder) {
  const nvar = headers.length;
  for (let j = 0; j < nvar; j++) {
    const off = rowOff + colOffsets[j];
    const t = types[j];
    const size = typeSizes[j];
    const col = columns[headers[j]];
    const miss = missing[headers[j]];
    try {
      switch (t) {
        case "byte": {
          const v = buf.readInt8(off);
          if (isMissingNumeric(v, "byte"))
            miss[i] = 1;
          else
            col[i] = v;
          break;
        }
        case "int": {
          const v = readInt16(buf, off, byteOrder);
          if (isMissingNumeric(v, "int"))
            miss[i] = 1;
          else
            col[i] = v;
          break;
        }
        case "long": {
          const v = readInt32(buf, off, byteOrder);
          if (isMissingNumeric(v, "long"))
            miss[i] = 1;
          else
            col[i] = v;
          break;
        }
        case "float": {
          const v = readFloat(buf, off, byteOrder);
          if (isMissingNumeric(v, "float")) {
            miss[i] = 1;
            col[i] = Number.NaN;
          } else {
            col[i] = v;
          }
          break;
        }
        case "double": {
          const v = readDouble(buf, off, byteOrder);
          if (isMissingNumeric(v, "double")) {
            miss[i] = 1;
            col[i] = Number.NaN;
          } else {
            col[i] = v;
          }
          break;
        }
        default: {
          if (t.startsWith("str")) {
            const s = readCString(buf, off, size);
            if (s.length === 0)
              miss[i] = 1;
            col[i] = s;
          }
          break;
        }
      }
    } catch {
      miss[i] = 1;
    }
  }
}
function computeLegacyLayout(buf) {
  const ds = buf[0];
  if (ds !== 113 && ds !== 114 && ds !== 115) {
    throw new Error(dtaL10n.t("Not a legacy Stata dta (format {0}).", ds));
  }
  const release = ds;
  const byteorderMarker = buf[1];
  let byteOrder;
  if (byteorderMarker === 1)
    byteOrder = "MSF";
  else if (byteorderMarker === 2)
    byteOrder = "LSF";
  else
    throw new Error(dtaL10n.t("Unexpected byte order marker: {0}", byteorderMarker));
  const filetype = buf[2];
  if (filetype !== 1) {
    throw new Error(dtaL10n.t("Unexpected filetype byte: {0}", filetype));
  }
  const nvar = readUInt16(buf, 4, byteOrder);
  const nobs = readInt32(buf, 6, byteOrder);
  if (nobs < 0 || nobs > 1e9)
    throw new Error(dtaL10n.t("Implausible nobs: {0}", nobs));
  if (nvar < 0 || nvar > 32767)
    throw new Error(dtaL10n.t("Implausible nvar: {0}", nvar));
  let off = 109;
  const types = [];
  const typeSizes = [];
  for (let j = 0; j < nvar; j++) {
    const code = buf[off + j];
    const dec = decodeLegacyType(code);
    if (!dec)
      throw new Error(dtaL10n.t("Unknown type code {0} at variable {1}", code, j));
    types.push(dec.type);
    typeSizes.push(dec.size);
  }
  off += nvar;
  const headers = [];
  for (let j = 0; j < nvar; j++) {
    headers.push(readCString(buf, off + j * 33, 33));
  }
  off += nvar * 33;
  off += (nvar + 1) * 2;
  const fmtLen = release === 113 ? 12 : 49;
  const formats = [];
  for (let j = 0; j < nvar; j++)
    formats.push(readCString(buf, off + j * fmtLen, fmtLen));
  off += nvar * fmtLen;
  const lblNames = [];
  for (let j = 0; j < nvar; j++) {
    lblNames.push(readCString(buf, off + j * 33, 33));
  }
  off += nvar * 33;
  const labels = [];
  for (let j = 0; j < nvar; j++) {
    labels.push(readCString(buf, off + j * 81, 81));
  }
  off += nvar * 81;
  while (off + 5 <= buf.length) {
    const tag = buf[off];
    const len = readInt32(buf, off + 1, byteOrder);
    if (tag === 0 && len === 0) {
      off += 5;
      break;
    }
    if (tag !== 1 || len < 0 || off + 5 + len > buf.length)
      throw new Error(dtaL10n.t("Malformed expansion field."));
    off += 5 + len;
  }
  const rowSize = typeSizes.reduce((a, b) => a + b, 0);
  const dataStart = off;
  const dataEnd = dataStart + nobs * rowSize;
  if (!Number.isSafeInteger(dataEnd) || dataEnd > buf.length)
    throw new Error(dtaL10n.t("DTA metadata is inconsistent: data section is shorter than expected."));
  const valueLabels = {};
  if (dataEnd <= buf.length) {
    let vlOff = dataEnd;
    while (vlOff + 4 + 33 + 3 + 4 + 4 <= buf.length) {
      const tableLen = readInt32(buf, vlOff, byteOrder);
      vlOff += 4;
      const lblName = readCString(buf, vlOff, 33);
      vlOff += 33;
      vlOff += 3;
      if (vlOff + 8 > buf.length)
        break;
      const n = readInt32(buf, vlOff, byteOrder);
      vlOff += 4;
      const txtlen = readInt32(buf, vlOff, byteOrder);
      vlOff += 4;
      if (n < 0 || n > 1e6 || txtlen < 0 || txtlen > 1e8)
        break;
      if (vlOff + 8 * n + txtlen > buf.length)
        break;
      const offs = [];
      for (let k = 0; k < n; k++) {
        offs.push(readInt32(buf, vlOff, byteOrder));
        vlOff += 4;
      }
      const vals = [];
      for (let k = 0; k < n; k++) {
        vals.push(readInt32(buf, vlOff, byteOrder));
        vlOff += 4;
      }
      const txtStart = vlOff;
      const txtEnd = txtStart + txtlen;
      const map = {};
      for (let k = 0; k < n; k++) {
        const s = txtStart + offs[k];
        if (s < txtStart || s >= txtEnd)
          continue;
        map[vals[k]] = readCString(buf, s, txtEnd - s);
      }
      if (lblName)
        valueLabels[lblName] = map;
      vlOff = txtEnd;
      void tableLen;
    }
  }
  const varValueLabels = {};
  for (let j = 0; j < nvar; j++) {
    const ln = lblNames[j];
    if (ln && valueLabels[ln])
      varValueLabels[headers[j]] = valueLabels[ln];
  }
  return {
    release,
    nvar,
    nobs,
    headers,
    labels,
    formats,
    types,
    typeSizes,
    rowSize,
    dataStart,
    valueLabelsStart: dataEnd,
    valueLabels: varValueLabels,
    byteOrder
  };
}
function parseColumnarLegacy(buf) {
  const layout = computeLegacyLayout(buf);
  const { nobs, headers, types, typeSizes, rowSize, dataStart } = layout;
  const { columns, missing, colOffsets } = createLegacyColumns(headers, types, typeSizes, nobs);
  for (let i = 0; i < nobs; i++) {
    const rowOff = dataStart + i * rowSize;
    if (rowOff + rowSize > buf.length)
      break;
    readLegacyRow(buf, rowOff, i, headers, types, typeSizes, columns, missing, colOffsets, layout.byteOrder);
  }
  return {
    meta: {
      headers,
      labels: layout.labels,
      formats: layout.formats,
      types,
      typeSizes,
      valueLabels: layout.valueLabels,
      nobs,
      release: layout.release,
      byteOrder: layout.byteOrder
    },
    columns,
    missing
  };
}
async function parseColumnarLegacyAsync(buf, opts = {}) {
  const layout = computeLegacyLayout(buf);
  const { nobs, headers, types, typeSizes, rowSize, dataStart } = layout;
  const { columns, missing, colOffsets } = createLegacyColumns(headers, types, typeSizes, nobs);
  const progressStep = opts.progressStep ?? 1e4;
  const yieldEvery = opts.yieldEvery ?? 2e4;
  const onProgress = opts.onProgress;
  for (let i = 0; i < nobs; i++) {
    const rowOff = dataStart + i * rowSize;
    if (rowOff + rowSize > buf.length)
      break;
    readLegacyRow(buf, rowOff, i, headers, types, typeSizes, columns, missing, colOffsets, layout.byteOrder);
    if (onProgress && (i + 1) % progressStep === 0)
      onProgress(i + 1, nobs);
    if ((i + 1) % yieldEvery === 0)
      await new Promise((r) => setImmediate(r));
  }
  if (onProgress)
    onProgress(nobs, nobs);
  return {
    meta: {
      headers,
      labels: layout.labels,
      formats: layout.formats,
      types,
      typeSizes,
      valueLabels: layout.valueLabels,
      nobs,
      release: layout.release,
      byteOrder: layout.byteOrder
    },
    columns,
    missing
  };
}
function isLegacyDtaFormat(buf) {
  if (buf.length < 4)
    return false;
  const ds = buf[0];
  return ds === 113 || ds === 114 || ds === 115;
}

// ../../../../../../../private/tmp/stata-preview-audit.F9rg1F/repo/src/dta/tabulator.ts
var import_vscode2 = require("vscode");
var MAX_DISCRETE_CATEGORIES = 20;
var MAX_INT_BAR_VALUES = 200;
var HISTOGRAM_BINS = 30;
function tabulateColumnar(columnar, varName, indices) {
  const profile = collectVariableProfile(columnar, varName, indices);
  if (!profile.isNumeric && !profile.isString)
    return createEmptyStringTabResult(profile);
  if (profile.statType === "discrete")
    return createDiscreteTabResult(profile);
  if (profile.isNumeric)
    return createContinuousTabResult(profile);
  return createStringTabResult(profile);
}
function createEmptyStringTabResult(profile) {
  return {
    kind: "string",
    varName: profile.varName,
    nValid: 0,
    nMissing: profile.nMissing,
    nUnique: 0,
    topValues: []
  };
}
function createDiscreteTabResult(profile) {
  const total = profile.nValid;
  const sortedKeys = [...profile.uniqueCounter.keys()].sort((a, b) => {
    if (typeof a === "number" && typeof b === "number")
      return a - b;
    return String(a).localeCompare(String(b));
  });
  let cum = 0;
  const entries = sortedKeys.map((value) => {
    const freq = profile.uniqueCounter.get(value);
    const pct = total > 0 ? freq / total * 100 : 0;
    cum += pct;
    const label = profile.labelMap && profile.labelMap[value];
    return { value, label, freq, pct, cum };
  });
  return {
    kind: "discrete",
    varName: profile.varName,
    nValid: profile.nValid,
    nMissing: profile.nMissing,
    nUnique: profile.uniqueCounter.size,
    entries
  };
}
function createContinuousTabResult(profile) {
  const values = profile.numericValues;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  let sqSum = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - mean;
    sqSum += d * d;
  }
  const sd = n > 1 ? Math.sqrt(sqSum / (n - 1)) : 0;
  return {
    kind: "continuous",
    varName: profile.varName,
    nValid: n,
    nMissing: profile.nMissing,
    min,
    max,
    mean,
    sd,
    median: percentile(sorted, n, 50),
    p1: percentile(sorted, n, 1),
    p25: percentile(sorted, n, 25),
    p75: percentile(sorted, n, 75),
    p99: percentile(sorted, n, 99),
    chart: createContinuousChart(profile, min, max, n),
    nUnique: profile.uniqueCounter.size
  };
}
function createStringTabResult(profile) {
  const topValues = [...profile.uniqueCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, freq]) => ({ value: String(value), freq, pct: freq / profile.nValid * 100 }));
  return {
    kind: "string",
    varName: profile.varName,
    nValid: profile.nValid,
    nMissing: profile.nMissing,
    nUnique: profile.uniqueCounter.size,
    topValues
  };
}
function createContinuousChart(profile, min, max, n) {
  const useBars = allUniqueValuesAreIntegers(profile.uniqueCounter) && profile.uniqueCounter.size > MAX_DISCRETE_CATEGORIES && profile.uniqueCounter.size <= MAX_INT_BAR_VALUES;
  if (useBars) {
    const bars = [...profile.uniqueCounter.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value);
    return { type: "bars", bars };
  }
  const bins = createHistogramBins(profile.numericValues, min, max, n);
  return { type: "histogram", bins };
}
function createHistogramBins(values, min, max, n) {
  const histogram = [];
  if (min === max) {
    histogram.push({ bin: 0, lo: min, hi: max, count: n });
    return histogram;
  }
  const width = (max - min) / HISTOGRAM_BINS;
  const counts = Array.from({ length: HISTOGRAM_BINS }).fill(0);
  for (let i = 0; i < n; i++) {
    let binIndex = Math.floor((values[i] - min) / width);
    if (binIndex >= HISTOGRAM_BINS)
      binIndex = HISTOGRAM_BINS - 1;
    if (binIndex < 0)
      binIndex = 0;
    counts[binIndex]++;
  }
  for (let binIndex = 0; binIndex < HISTOGRAM_BINS; binIndex++) {
    histogram.push({
      bin: binIndex,
      lo: min + binIndex * width,
      hi: min + (binIndex + 1) * width,
      count: counts[binIndex]
    });
  }
  return histogram;
}
function percentile(sorted, n, p) {
  if (n === 0)
    return Number.NaN;
  const idx = p / 100 * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi)
    return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}
function collectVariableProfile(columnar, varName, indices) {
  const builder = createVariableProfileBuilder(columnar, varName, true);
  const total = indices ? indices.length : columnar.meta.nobs;
  for (let k = 0; k < total; k++)
    ingestProfileRow(builder, indices ? indices[k] : k);
  return finishVariableProfile(builder);
}
function createVariableProfileBuilder(columnar, varName, collectValues) {
  const colIndex = columnar.meta.headers.indexOf(varName);
  if (colIndex === -1)
    throw new Error(import_vscode2.l10n.t("Variable not found: {0}", varName));
  const colType = columnar.meta.types[colIndex] || "";
  return {
    columnar,
    varName,
    colIndex,
    colType,
    isNumeric: isNumericDtaType(colType),
    isString: colType.startsWith("str"),
    collectValues,
    numericValues: [],
    stringValues: [],
    uniqueCounter: /* @__PURE__ */ new Map(),
    nMissing: 0
  };
}
function ingestProfileRow(builder, rowIndex) {
  const col = builder.columnar.columns[builder.varName];
  const miss = builder.columnar.missing[builder.varName];
  const value = col[rowIndex];
  if (isProfileMissingValue(value, !!miss[rowIndex], builder.isString)) {
    builder.nMissing++;
    return;
  }
  if (builder.isNumeric) {
    const numericValue = value;
    if (builder.collectValues)
      builder.numericValues.push(numericValue);
    addUniqueValue(builder.uniqueCounter, numericValue);
    return;
  }
  if (builder.isString) {
    const stringValue = value;
    if (builder.collectValues)
      builder.stringValues.push(stringValue);
    addUniqueValue(builder.uniqueCounter, stringValue);
    return;
  }
  builder.nMissing++;
}
function finishVariableProfile(builder) {
  const labelMap = builder.columnar.meta.valueLabels[builder.varName];
  const nValid = builder.isNumeric || builder.isString ? countProfileValidValues(builder.uniqueCounter) : 0;
  const profile = {
    varName: builder.varName,
    colIndex: builder.colIndex,
    colType: builder.colType,
    isNumeric: builder.isNumeric,
    isString: builder.isString,
    label: builder.columnar.meta.labels[builder.colIndex] || "",
    labelMap,
    numericValues: builder.numericValues,
    stringValues: builder.stringValues,
    uniqueCounter: builder.uniqueCounter,
    nValid,
    nMissing: builder.nMissing,
    statType: "string"
  };
  profile.statType = inferProfileStatType(profile);
  return profile;
}
function isProfileMissingValue(value, markedMissing, isString) {
  if (markedMissing)
    return true;
  if (isString)
    return value === "";
  return typeof value === "number" && Number.isNaN(value);
}
function addUniqueValue(counter, value) {
  counter.set(value, (counter.get(value) || 0) + 1);
}
function countProfileValidValues(counter) {
  let total = 0;
  for (const count of counter.values())
    total += count;
  return total;
}
function inferProfileStatType(profile) {
  if (!profile.isNumeric && !profile.isString)
    return "string";
  const hasLabels = !!profile.labelMap && Object.keys(profile.labelMap).length > 0;
  const isFloatLike = profile.colType === "float" || profile.colType === "double";
  const treatDiscrete = hasLabels || profile.uniqueCounter.size > 0 && profile.uniqueCounter.size <= MAX_DISCRETE_CATEGORIES && (!isFloatLike || allUniqueValuesAreIntegers(profile.uniqueCounter));
  if (treatDiscrete)
    return "discrete";
  return profile.isNumeric ? "continuous" : "string";
}
function isNumericDtaType(colType) {
  return colType === "byte" || colType === "int" || colType === "long" || colType === "float" || colType === "double";
}
function allUniqueValuesAreIntegers(uniqueValues) {
  for (const value of uniqueValues.keys()) {
    if (typeof value !== "number" || !Number.isInteger(value))
      return false;
  }
  return true;
}

// ../../../../../../../private/tmp/stata-preview-audit.F9rg1F/repo/src/dta/parser.ts
function readUInt162(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}
function readInt162(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readInt16LE(offset) : buf.readInt16BE(offset);
}
function readUInt32(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
}
function readInt322(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readInt32LE(offset) : buf.readInt32BE(offset);
}
function readBigUInt64(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readBigUInt64LE(offset) : buf.readBigUInt64BE(offset);
}
function readFloat2(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readFloatLE(offset) : buf.readFloatBE(offset);
}
function readDouble2(buf, offset, byteOrder) {
  return byteOrder === "LSF" ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
}
var FMT_117 = {
  release: 117,
  varnameLen: 33,
  varlabelLen: 81,
  formatLen: 49,
  valueLabelNameLen: 33,
  nobsBytes: 4,
  kBytes: 2,
  maxVariables: 32767,
  encoding: "latin1"
};
var FMT_118 = {
  release: 118,
  varnameLen: 129,
  varlabelLen: 321,
  formatLen: 57,
  valueLabelNameLen: 129,
  nobsBytes: 8,
  kBytes: 2,
  maxVariables: 32767,
  encoding: "utf8"
};
var FMT_119 = {
  release: 119,
  varnameLen: 129,
  varlabelLen: 321,
  formatLen: 57,
  valueLabelNameLen: 129,
  nobsBytes: 8,
  kBytes: 4,
  maxVariables: 12e4,
  encoding: "utf8"
};
var BINARY_DTA_RELEASE_LABELS = /* @__PURE__ */ new Map([
  [102, "Stata 1 (format 102)"],
  [103, "Stata 2/3 (format 103)"],
  [104, "Stata 4 (format 104)"],
  [105, "Stata 5 (format 105)"],
  [108, "Stata 6 (format 108)"],
  [110, "Stata 7 (format 110)"],
  [111, "Stata 7SE (format 111)"],
  [112, "Stata 8/9 (format 112)"],
  [113, "Stata 8/9 (format 113)"],
  [114, "Stata 10/11 (format 114)"],
  [115, "Stata 12 (format 115)"]
]);
function decodeTypeCode(code) {
  if (code === 65526)
    return { type: "double", size: 8 };
  if (code === 65527)
    return { type: "float", size: 4 };
  if (code === 65528)
    return { type: "long", size: 4 };
  if (code === 65529)
    return { type: "int", size: 2 };
  if (code === 65530)
    return { type: "byte", size: 1 };
  if (code === 32768)
    return { type: "strL", size: 8 };
  if (code >= 1 && code <= 2045)
    return { type: `str${code}`, size: code };
  return null;
}
function isMissingNumeric2(v, t) {
  if (v === null || v === void 0 || Number.isNaN(v))
    return true;
  if (t === "byte")
    return v > 100;
  if (t === "int")
    return v > 32740;
  if (t === "long")
    return v > 2147483620;
  if (t === "float")
    return v >= 17014118e31 || !Number.isFinite(v);
  if (t === "double")
    return v >= 898846567431158e293 || !Number.isFinite(v);
  return false;
}
function allocColumn2(type, size, n) {
  if (type === "byte")
    return new Int8Array(n);
  if (type === "int")
    return new Int16Array(n);
  if (type === "long")
    return new Int32Array(n);
  if (type === "float")
    return new Float32Array(n);
  if (type === "double")
    return new Float64Array(n);
  return Array.from({ length: n }).fill("");
}
function readCString2(buf, offset, maxLen, encoding) {
  let end = offset;
  const limit = Math.min(offset + maxLen, buf.length);
  while (end < limit && buf[end] !== 0)
    end++;
  return buf.toString(encoding, offset, end);
}
function strLKey(v, o) {
  return `${v}:${typeof o === "bigint" ? o.toString() : o}`;
}
function readPackedUInt(buffer, offset, byteLength, byteOrder) {
  let out = 0n;
  if (byteOrder === "LSF") {
    for (let i = byteLength - 1; i >= 0; i--) {
      out = (out << 8n) + BigInt(buffer[offset + i]);
    }
  } else {
    for (let i = 0; i < byteLength; i++) {
      out = (out << 8n) + BigInt(buffer[offset + i]);
    }
  }
  return out;
}
function readStrLRef(buffer, offset, fmt, strls, byteOrder) {
  if (offset + 8 > buffer.length)
    return "";
  let v;
  let o;
  if (fmt.release === 117) {
    v = Number(readPackedUInt(buffer, offset, 4, byteOrder));
    o = readPackedUInt(buffer, offset + 4, 4, byteOrder);
  } else if (fmt.release === 118) {
    v = Number(readPackedUInt(buffer, offset, 2, byteOrder));
    o = readPackedUInt(buffer, offset + 2, 6, byteOrder);
  } else {
    v = Number(readPackedUInt(buffer, offset, 3, byteOrder));
    o = readPackedUInt(buffer, offset + 3, 5, byteOrder);
  }
  return strls.get(strLKey(v, o)) || "";
}
function readStrLs(buffer, fmt, tagStart, byteOrder) {
  const out = /* @__PURE__ */ new Map();
  out.set(strLKey(0, 0n), "");
  if (tagStart < 0 || tagStart >= buffer.length)
    return out;
  const start = tagStart + "<strls>".length;
  const end = findTagClose(buffer, "strls", start);
  if (end === -1)
    return out;
  let off = start;
  while (off + 3 <= end) {
    if (buffer.toString("latin1", off, off + 3) !== "GSO")
      break;
    off += 3;
    const minHeader = fmt.release === 117 ? 13 : 17;
    if (off + minHeader > end)
      break;
    const v = readUInt32(buffer, off, byteOrder);
    off += 4;
    const o = fmt.release === 117 ? BigInt(readUInt32(buffer, off, byteOrder)) : readBigUInt64(buffer, off, byteOrder);
    off += fmt.release === 117 ? 4 : 8;
    const type = buffer.readUInt8(off);
    off += 1;
    const len = readUInt32(buffer, off, byteOrder);
    off += 4;
    if (off + len > end)
      break;
    const raw = buffer.subarray(off, off + len);
    off += len;
    let value;
    if (type === 130) {
      const text = raw.length > 0 && raw[raw.length - 1] === 0 ? raw.subarray(0, raw.length - 1) : raw;
      value = text.toString(fmt.encoding);
    } else {
      value = raw.toString("latin1");
    }
    out.set(strLKey(v, o), value);
  }
  return out;
}
function createColumnarStorage(headers, types, typeSizes, N) {
  const columns = {};
  const missing = {};
  const colOffsets = [];
  let acc = 0;
  for (let j = 0; j < headers.length; j++) {
    colOffsets.push(acc);
    acc += typeSizes[j];
    columns[headers[j]] = allocColumn2(types[j], typeSizes[j], N);
    missing[headers[j]] = new Uint8Array(N);
  }
  return { columns, missing, colOffsets };
}
function readColumnarRow(buffer, rowOff, i, headers, types, typeSizes, columns, missing, colOffsets, fmt, strls, byteOrder) {
  const K = headers.length;
  for (let j = 0; j < K; j++) {
    const off = rowOff + colOffsets[j];
    const t = types[j];
    const size = typeSizes[j];
    const col = columns[headers[j]];
    const miss = missing[headers[j]];
    try {
      if (t === "byte") {
        const v = buffer.readInt8(off);
        if (isMissingNumeric2(v, "byte"))
          miss[i] = 1;
        else
          col[i] = v;
      } else if (t === "int") {
        const v = readInt162(buffer, off, byteOrder);
        if (isMissingNumeric2(v, "int"))
          miss[i] = 1;
        else
          col[i] = v;
      } else if (t === "long") {
        const v = readInt322(buffer, off, byteOrder);
        if (isMissingNumeric2(v, "long"))
          miss[i] = 1;
        else
          col[i] = v;
      } else if (t === "float") {
        const v = readFloat2(buffer, off, byteOrder);
        if (isMissingNumeric2(v, "float")) {
          miss[i] = 1;
          col[i] = Number.NaN;
        } else {
          col[i] = v;
        }
      } else if (t === "double") {
        const v = readDouble2(buffer, off, byteOrder);
        if (isMissingNumeric2(v, "double")) {
          miss[i] = 1;
          col[i] = Number.NaN;
        } else {
          col[i] = v;
        }
      } else if (t === "strL") {
        const s = readStrLRef(buffer, off, fmt, strls, byteOrder);
        if (s.length === 0)
          miss[i] = 1;
        col[i] = s;
      } else if (t.startsWith("str")) {
        const s = readCString2(buffer, off, size, fmt.encoding);
        if (s.length === 0)
          miss[i] = 1;
        col[i] = s;
      }
    } catch {
      miss[i] = 1;
    }
  }
}
function findTagStart(buf, tag, fromOffset = 0) {
  const needle = import_node_buffer.Buffer.from(`<${tag}>`, "latin1");
  return buf.indexOf(needle, fromOffset);
}
function findTagOpen(buf, tag, fromOffset = 0) {
  const idx = findTagStart(buf, tag, fromOffset);
  return idx === -1 ? -1 : idx + tag.length + 2;
}
function findTagClose(buf, tag, fromOffset = 0) {
  const needle = import_node_buffer.Buffer.from(`</${tag}>`, "latin1");
  return buf.indexOf(needle, fromOffset);
}
function readMapOffsets(buffer, byteOrder) {
  const mapOpen = findTagOpen(buffer, "map");
  if (mapOpen === -1 || mapOpen + 14 * 8 > buffer.length)
    return null;
  const offsets = [];
  for (let i = 0; i < 14; i++) {
    offsets.push(Number(readBigUInt64(buffer, mapOpen + i * 8, byteOrder)));
  }
  return offsets;
}
function isTagStart(buffer, tag, offset) {
  if (!Number.isFinite(offset) || offset < 0)
    return false;
  const needle = import_node_buffer.Buffer.from(`<${tag}>`, "latin1");
  if (offset + needle.length > buffer.length)
    return false;
  return buffer.subarray(offset, offset + needle.length).equals(needle);
}
function resolveMappedTagStart(buffer, mapOffsets, mapIdx, tag) {
  const mapped = mapOffsets?.[mapIdx];
  if (typeof mapped === "number") {
    if (isTagStart(buffer, tag, mapped))
      return mapped;
    const contentMappedStart = mapped - (tag.length + 2);
    if (isTagStart(buffer, tag, contentMappedStart))
      return contentMappedStart;
  }
  return findTagStart(buffer, tag);
}
function sliceMappedTagContent(buffer, mapOffsets, mapIdx, tag) {
  const tagStart = resolveMappedTagStart(buffer, mapOffsets, mapIdx, tag);
  if (tagStart === -1)
    throw new Error(dtaL10n3.t("Missing <{0}> tag.", tag));
  const start = tagStart + tag.length + 2;
  const end = findTagClose(buffer, tag, start);
  if (end === -1)
    throw new Error(dtaL10n3.t("Missing </{0}> close tag.", tag));
  return { start, end };
}
function requireTagOpen(buffer, tag, bytesNeeded) {
  const open = findTagOpen(buffer, tag);
  if (open === -1)
    throw new Error(dtaL10n3.t("Missing <{0}> tag.", tag));
  if (open + bytesNeeded > buffer.length)
    throw new Error(dtaL10n3.t("The <{0}> tag is truncated.", tag));
  return open;
}
function readByteOrder(head) {
  const byteorderMatch = head.match(/<byteorder>(LSF|MSF)<\/byteorder>/);
  return byteorderMatch?.[1] === "MSF" ? "MSF" : "LSF";
}
function readObservationCount(buffer, fmt, nOpen, byteOrder) {
  if (fmt.nobsBytes === 4)
    return readUInt32(buffer, nOpen, byteOrder);
  const big = readBigUInt64(buffer, nOpen, byteOrder);
  if (big > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error(dtaL10n3.t("Observation count is too large to load: {0}", big.toString()));
  return Number(big);
}
function readVariableCount(buffer, fmt, kOpen, byteOrder) {
  return fmt.kBytes === 2 ? readUInt162(buffer, kOpen, byteOrder) : readUInt32(buffer, kOpen, byteOrder);
}
function formatForModernRelease(releaseNum) {
  if (releaseNum === 117)
    return FMT_117;
  if (releaseNum === 118)
    return FMT_118;
  if (releaseNum === 119)
    return FMT_119;
  return null;
}
function readModernValueLabels(buffer, fmt, K, headers, mapOffsets, byteOrder) {
  const rawLabels = readRawValueLabelTables(buffer, fmt, mapOffsets, byteOrder);
  return bindValueLabelsToVariables(buffer, fmt, K, headers, rawLabels, mapOffsets);
}
function readRawValueLabelTables(buffer, fmt, mapOffsets, byteOrder) {
  const rawLabels = {};
  try {
    const valueLabelSection = sliceMappedTagContent(buffer, mapOffsets, 11, "value_labels");
    let cursor = valueLabelSection.start;
    const labelOpen = import_node_buffer.Buffer.from("<lbl>", "latin1");
    const labelClose = import_node_buffer.Buffer.from("</lbl>", "latin1");
    while (cursor < valueLabelSection.end) {
      const openStart = buffer.indexOf(labelOpen, cursor);
      if (openStart === -1 || openStart >= valueLabelSection.end)
        break;
      const closeStart = buffer.indexOf(labelClose, openStart + labelOpen.length);
      if (closeStart === -1 || closeStart > valueLabelSection.end)
        break;
      const blockStart = openStart + labelOpen.length;
      const blockEnd = closeStart;
      cursor = closeStart + labelClose.length;
      const table = readValueLabelTable(buffer, fmt, blockStart, blockEnd, byteOrder);
      if (table)
        rawLabels[table.name] = table.values;
    }
  } catch {
  }
  return rawLabels;
}
function readValueLabelTable(buffer, fmt, blockStart, blockEnd, byteOrder) {
  let offset = blockStart;
  if (offset + 4 > blockEnd)
    return null;
  offset += 4;
  if (offset + fmt.valueLabelNameLen + 3 > blockEnd)
    return null;
  const name = readCString2(buffer, offset, fmt.valueLabelNameLen, fmt.encoding);
  offset += fmt.valueLabelNameLen + 3;
  if (offset + 8 > blockEnd)
    return null;
  const count = readInt322(buffer, offset, byteOrder);
  offset += 4;
  const textLength = readInt322(buffer, offset, byteOrder);
  offset += 4;
  if (count < 0 || count > 1e6)
    return null;
  if (offset + 8 * count + textLength > blockEnd)
    return null;
  const textOffsets = [];
  for (let index = 0; index < count; index++) {
    textOffsets.push(readInt322(buffer, offset, byteOrder));
    offset += 4;
  }
  const values = [];
  for (let index = 0; index < count; index++) {
    values.push(readInt322(buffer, offset, byteOrder));
    offset += 4;
  }
  const textStart = offset;
  const textEnd = textStart + textLength;
  const table = {};
  for (let index = 0; index < count; index++) {
    const start = textStart + textOffsets[index];
    if (start < textStart || start >= textEnd)
      continue;
    table[values[index]] = readCString2(buffer, start, textEnd - start, fmt.encoding);
  }
  return name ? { name, values: table } : null;
}
function bindValueLabelsToVariables(buffer, fmt, K, headers, rawLabels, mapOffsets) {
  const valueLabels = {};
  try {
    const valueLabelNames = sliceMappedTagContent(buffer, mapOffsets, 6, "value_label_names");
    for (let index = 0; index < K; index++) {
      const labelName = readCString2(
        buffer,
        valueLabelNames.start + index * fmt.valueLabelNameLen,
        fmt.valueLabelNameLen,
        fmt.encoding
      );
      if (labelName && rawLabels[labelName])
        valueLabels[headers[index]] = rawLabels[labelName];
    }
  } catch {
  }
  return valueLabels;
}
function detectBinaryDtaRelease(buffer) {
  if (buffer.length < 1)
    return null;
  const release = buffer[0];
  return BINARY_DTA_RELEASE_LABELS.has(release) ? release : null;
}
function formatDtaReleaseLabel(release) {
  return BINARY_DTA_RELEASE_LABELS.get(release) ?? `Stata (format ${release})`;
}
function unsupportedDtaFileError(fileDescription) {
  return new Error(dtaL10n3.t(
    "Unsupported file: {0}. This viewer supports formats 113 (Stata 8/9), 114 (Stata 10/11), 115 (Stata 12), 117 (Stata 13), 118 (Stata 14+), and 119 (Stata 15+). Open the file in Stata and re-save it as a supported version to use it here.",
    fileDescription
  ));
}
function columnarToPreviewData(columnar, limitRows = 1e3) {
  const meta = columnar.meta;
  const rowCount = Math.min(meta.nobs, limitRows);
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push(meta.headers.map((header) => {
      if (columnar.missing[header]?.[i])
        return null;
      return columnar.columns[header]?.[i] ?? null;
    }));
  }
  return {
    headers: meta.headers,
    labels: meta.labels,
    rows,
    valueLabels: meta.valueLabels,
    nobs: meta.nobs
  };
}
function assertModernDimensions(fmt, K, N) {
  if (!Number.isInteger(K) || K < 0 || K > fmt.maxVariables)
    throw new Error(dtaL10n3.t("Implausible variable count: {0}", K));
  if (!Number.isSafeInteger(N) || N < 0)
    throw new Error(dtaL10n3.t("Implausible observation count: {0}", N));
}
function assertDataSectionFits(buffer, dataStart, rowSize, N) {
  if (dataStart < 0 || dataStart > buffer.length)
    throw new Error(dtaL10n3.t("DTA metadata is inconsistent: invalid data section offset."));
  const dataBytes = rowSize * N;
  if (!Number.isSafeInteger(dataBytes))
    throw new Error(dtaL10n3.t("DTA data section is too large to load: {0} rows \xD7 {1} bytes per row.", N, rowSize));
  if (dataStart + dataBytes > buffer.length)
    throw new Error(dtaL10n3.t("DTA metadata is inconsistent: data section is shorter than expected."));
}
var DtaParser = class {
  /**
   * 解析少量行式预览数据
   */
  static parse(buffer) {
    const head = buffer.toString("latin1", 0, 200);
    if (!head.includes("<stata_dta>")) {
      if (isLegacyDtaFormat(buffer))
        return columnarToPreviewData(parseColumnarLegacy(buffer));
      const binaryRelease = detectBinaryDtaRelease(buffer);
      if (binaryRelease !== null)
        throw unsupportedDtaFileError(formatDtaReleaseLabel(binaryRelease));
      throw new Error(dtaL10n3.t("Not a Stata file (or unrecognized format)."));
    }
    const releaseMatch = head.match(/<release>(\d+)<\/release>/);
    const releaseNum = releaseMatch ? Number.parseInt(releaseMatch[1], 10) : 0;
    const fmt = formatForModernRelease(releaseNum);
    if (!fmt)
      throw unsupportedDtaFileError(releaseNum ? formatDtaReleaseLabel(releaseNum) : dtaL10n3.t("unknown"));
    const byteOrder = readByteOrder(head);
    const kOpen = requireTagOpen(buffer, "K", fmt.kBytes);
    const K = readVariableCount(buffer, fmt, kOpen, byteOrder);
    const nOpen = requireTagOpen(buffer, "N", fmt.nobsBytes);
    const N = readObservationCount(buffer, fmt, nOpen, byteOrder);
    assertModernDimensions(fmt, K, N);
    const mapOffsets = readMapOffsets(buffer, byteOrder);
    if (!mapOffsets)
      throw new Error(dtaL10n3.t("Missing <{0}> tag.", "map"));
    const sliceTagContent = (mapIdx, tag) => {
      return sliceMappedTagContent(buffer, mapOffsets, mapIdx, tag);
    };
    const vt = sliceTagContent(2, "variable_types");
    const types = [];
    const typeSizes = [];
    for (let j = 0; j < K; j++) {
      const code = readUInt162(buffer, vt.start + j * 2, byteOrder);
      const dec = decodeTypeCode(code);
      if (!dec) {
        types.push("byte");
        typeSizes.push(1);
      } else {
        types.push(dec.type);
        typeSizes.push(dec.size);
      }
    }
    const vn = sliceTagContent(3, "varnames");
    const headers = [];
    for (let j = 0; j < K; j++) {
      headers.push(readCString2(buffer, vn.start + j * fmt.varnameLen, fmt.varnameLen, fmt.encoding));
    }
    const fm = sliceTagContent(5, "formats");
    const formats = [];
    for (let j = 0; j < K; j++)
      formats.push(readCString2(buffer, fm.start + j * fmt.formatLen, fmt.formatLen, fmt.encoding));
    const vl = sliceTagContent(7, "variable_labels");
    const labels = [];
    for (let j = 0; j < K; j++) {
      labels.push(readCString2(buffer, vl.start + j * fmt.varlabelLen, fmt.varlabelLen, fmt.encoding));
    }
    const variableValueLabels = readModernValueLabels(buffer, fmt, K, headers, mapOffsets, byteOrder);
    const strls = readStrLs(buffer, fmt, resolveMappedTagStart(buffer, mapOffsets, 10, "strls"), byteOrder);
    const dataTagStart = resolveMappedTagStart(buffer, mapOffsets, 9, "data");
    if (dataTagStart === -1)
      throw new Error(dtaL10n3.t("Missing <{0}> tag.", "data"));
    const dataContentStart = dataTagStart + "<data>".length;
    const rowSize = typeSizes.reduce((a, b) => a + b, 0);
    assertDataSectionFits(buffer, dataContentStart, rowSize, N);
    const limitRows = Math.min(N, 1e3);
    const rows = [];
    if (rowSize > 0 && N > 0) {
      let offset = dataContentStart;
      for (let i = 0; i < limitRows; i++) {
        if (offset + rowSize > buffer.length)
          break;
        const row = [];
        for (let j = 0; j < K; j++) {
          const type = types[j];
          const size = typeSizes[j];
          let val = null;
          try {
            if (type === "byte") {
              val = buffer.readInt8(offset);
            } else if (type === "int") {
              val = readInt162(buffer, offset, byteOrder);
            } else if (type === "long") {
              val = readInt322(buffer, offset, byteOrder);
            } else if (type === "float") {
              val = readFloat2(buffer, offset, byteOrder);
              if (Number.isFinite(val))
                val = Number.parseFloat(val.toFixed(6));
            } else if (type === "double") {
              val = readDouble2(buffer, offset, byteOrder);
              if (Number.isFinite(val))
                val = Number.parseFloat(val.toFixed(6));
            } else if (type === "strL") {
              val = readStrLRef(buffer, offset, fmt, strls, byteOrder);
            } else if (type.startsWith("str")) {
              val = readCString2(buffer, offset, size, fmt.encoding);
            }
          } catch {
            val = null;
          }
          row.push(val);
          offset += size;
        }
        rows.push(row);
      }
    }
    return {
      headers,
      labels,
      rows,
      valueLabels: variableValueLabels,
      nobs: N
    };
  }
  /**
   * 使用列式数据为单个变量计算汇总结果
   *
   * 统计实现位于 tabulator.ts；这里保留旧入口，降低外部调用迁移成本
   */
  static tabulate(columnar, varName, indices) {
    return tabulateColumnar(columnar, varName, indices);
  }
  /**
   * 异步解析完整文件为列式数据
   */
  static async parseColumnarAsync(buffer, opts = {}) {
    if (isLegacyDtaFormat(buffer)) {
      return parseColumnarLegacyAsync(buffer, opts);
    }
    const layout = computeLayout(buffer);
    const { fmt, K, N, headers, formats, types, typeSizes, dataStart, strls, valueLabels, byteOrder } = layout;
    const labels = readVarLabels(buffer, fmt, K, byteOrder);
    const rowSize = typeSizes.reduce((a, b) => a + b, 0);
    const { columns, missing, colOffsets } = createColumnarStorage(headers, types, typeSizes, N);
    const progressStep = opts.progressStep ?? 1e4;
    const yieldEvery = opts.yieldEvery ?? 2e4;
    const onProgress = opts.onProgress;
    for (let i = 0; i < N; i++) {
      const rowOff = dataStart + i * rowSize;
      if (rowOff + rowSize > buffer.length)
        break;
      readColumnarRow(buffer, rowOff, i, headers, types, typeSizes, columns, missing, colOffsets, fmt, strls, byteOrder);
      if (onProgress && (i + 1) % progressStep === 0) {
        onProgress(i + 1, N);
      }
      if ((i + 1) % yieldEvery === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    if (onProgress)
      onProgress(N, N);
    return {
      meta: {
        headers,
        labels,
        formats,
        types,
        typeSizes,
        valueLabels,
        nobs: N,
        release: fmt.release,
        byteOrder
      },
      columns,
      missing
    };
  }
  /**
   * 同步解析完整文件为列式数据
   */
  static parseColumnar(buffer, opts = {}) {
    if (isLegacyDtaFormat(buffer)) {
      return parseColumnarLegacy(buffer);
    }
    const layout = computeLayout(buffer);
    const { fmt, K, N, headers, formats, types, typeSizes, dataStart, strls, valueLabels, byteOrder } = layout;
    const labels = readVarLabels(buffer, fmt, K, byteOrder);
    const rowSize = typeSizes.reduce((a, b) => a + b, 0);
    const { columns, missing, colOffsets } = createColumnarStorage(headers, types, typeSizes, N);
    const progressStep = opts.progressStep ?? 1e4;
    const onProgress = opts.onProgress;
    for (let i = 0; i < N; i++) {
      const rowOff = dataStart + i * rowSize;
      if (rowOff + rowSize > buffer.length)
        break;
      readColumnarRow(buffer, rowOff, i, headers, types, typeSizes, columns, missing, colOffsets, fmt, strls, byteOrder);
      if (onProgress && (i + 1) % progressStep === 0) {
        onProgress(i + 1, N);
      }
    }
    if (onProgress)
      onProgress(N, N);
    return {
      meta: {
        headers,
        labels,
        formats,
        types,
        typeSizes,
        valueLabels,
        nobs: N,
        release: fmt.release,
        byteOrder
      },
      columns,
      missing
    };
  }
};
function readVarLabels(buffer, fmt, K, byteOrder) {
  let vl;
  try {
    vl = sliceMappedTagContent(buffer, readMapOffsets(buffer, byteOrder), 7, "variable_labels");
  } catch {
    return Array.from({ length: K }).fill("");
  }
  const labels = [];
  for (let j = 0; j < K; j++) {
    labels.push(readCString2(buffer, vl.start + j * fmt.varlabelLen, fmt.varlabelLen, fmt.encoding));
  }
  return labels;
}
function computeLayout(buffer) {
  const head = buffer.toString("latin1", 0, 200);
  if (!head.includes("<stata_dta>")) {
    const binaryRelease = detectBinaryDtaRelease(buffer);
    if (binaryRelease !== null)
      throw unsupportedDtaFileError(formatDtaReleaseLabel(binaryRelease));
    throw new Error(dtaL10n3.t("Not a Stata file (or unrecognized format)."));
  }
  const releaseMatch = head.match(/<release>(\d+)<\/release>/);
  const releaseNum = releaseMatch ? Number.parseInt(releaseMatch[1], 10) : 0;
  const fmt = formatForModernRelease(releaseNum);
  if (!fmt)
    throw unsupportedDtaFileError(releaseNum ? formatDtaReleaseLabel(releaseNum) : dtaL10n3.t("unknown"));
  const byteOrder = readByteOrder(head);
  const kOpen = requireTagOpen(buffer, "K", fmt.kBytes);
  const K = readVariableCount(buffer, fmt, kOpen, byteOrder);
  const nOpen = requireTagOpen(buffer, "N", fmt.nobsBytes);
  const N = readObservationCount(buffer, fmt, nOpen, byteOrder);
  assertModernDimensions(fmt, K, N);
  const mapOffsets = readMapOffsets(buffer, byteOrder);
  if (!mapOffsets)
    throw new Error(dtaL10n3.t("Missing <{0}> tag.", "map"));
  const sliceTagContent = (mapIdx, tag) => {
    return sliceMappedTagContent(buffer, mapOffsets, mapIdx, tag);
  };
  const vt = sliceTagContent(2, "variable_types");
  const types = [];
  const typeSizes = [];
  for (let j = 0; j < K; j++) {
    const code = readUInt162(buffer, vt.start + j * 2, byteOrder);
    const dec = decodeTypeCode(code);
    types.push(dec ? dec.type : "byte");
    typeSizes.push(dec ? dec.size : 1);
  }
  const vn = sliceTagContent(3, "varnames");
  const headers = [];
  for (let j = 0; j < K; j++) {
    headers.push(readCString2(buffer, vn.start + j * fmt.varnameLen, fmt.varnameLen, fmt.encoding));
  }
  const fm = sliceTagContent(5, "formats");
  const formats = [];
  for (let j = 0; j < K; j++)
    formats.push(readCString2(buffer, fm.start + j * fmt.formatLen, fmt.formatLen, fmt.encoding));
  const valueLabels = readModernValueLabels(buffer, fmt, K, headers, mapOffsets, byteOrder);
  const dataTagStart = resolveMappedTagStart(buffer, mapOffsets, 9, "data");
  if (dataTagStart === -1)
    throw new Error(dtaL10n3.t("Missing <{0}> tag.", "data"));
  const dataStart = dataTagStart + "<data>".length;
  const rowSize = typeSizes.reduce((a, b) => a + b, 0);
  assertDataSectionFits(buffer, dataStart, rowSize, N);
  const strls = readStrLs(buffer, fmt, resolveMappedTagStart(buffer, mapOffsets, 10, "strls"), byteOrder);
  return { fmt, K, N, headers, formats, types, typeSizes, dataStart, strls, valueLabels, byteOrder };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DtaParser
});
