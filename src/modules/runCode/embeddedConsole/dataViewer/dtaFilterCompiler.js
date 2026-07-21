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

// ../../../../../../../private/tmp/stata-preview-audit.F9rg1F/repo/src/dta/filterCompiler.ts
var filterCompiler_exports = {};
__export(filterCompiler_exports, {
  FilterCompileError: () => FilterCompileError,
  compileFilter: () => compileFilter
});
module.exports = __toCommonJS(filterCompiler_exports);
var import_vscode = require("vscode");
var dtaL10n = import_vscode.l10n || { t: (text) => text };
var compileCache = /* @__PURE__ */ new WeakMap();
var FilterCompileError = class extends Error {
  constructor(message, position) {
    super(message);
    this.position = position;
  }
  position;
};
function tokenTypeLabel(type) {
  switch (type) {
    case "NUMBER":
      return dtaL10n.t("number literal");
    case "STRING":
      return dtaL10n.t("string literal");
    case "IDENT":
      return dtaL10n.t("variable name");
    case "LPAREN":
      return dtaL10n.t("left parenthesis");
    case "RPAREN":
      return dtaL10n.t("right parenthesis");
    case "COMMA":
      return dtaL10n.t("comma");
    case "PLUS":
      return dtaL10n.t("plus operator");
    case "MINUS":
      return dtaL10n.t("minus operator");
    case "STAR":
      return dtaL10n.t("multiply operator");
    case "SLASH":
      return dtaL10n.t("divide operator");
    case "CARET":
      return dtaL10n.t("power operator");
    case "AND":
      return dtaL10n.t("AND operator");
    case "OR":
      return dtaL10n.t("OR operator");
    case "NOT":
      return dtaL10n.t("NOT operator");
    case "EQ":
      return dtaL10n.t("equality operator");
    case "NEQ":
      return dtaL10n.t("inequality operator");
    case "LT":
      return dtaL10n.t("less-than operator");
    case "LE":
      return dtaL10n.t("less-than-or-equal operator");
    case "GT":
      return dtaL10n.t("greater-than operator");
    case "GE":
      return dtaL10n.t("greater-than-or-equal operator");
    case "EOF":
      return dtaL10n.t("end of expression");
  }
}
function codePointAt(src, pos) {
  return String.fromCodePoint(src.codePointAt(pos));
}
function isIdentifierStart(c) {
  return c === "_" || /\p{L}/u.test(c);
}
function isIdentifierPart(c) {
  return c === "_" || /[\p{L}\p{N}\p{M}]/u.test(c);
}
function tokenize(src) {
  const tokens = [];
  let i = 0;
  const L = src.length;
  while (i < L) {
    const c = codePointAt(src, i);
    if (/\s/.test(c)) {
      i += c.length;
      continue;
    }
    const start = i;
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let s = "";
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < src.length) {
          s += src[i + 1];
          i += 2;
        } else {
          s += src[i++];
        }
      }
      if (i >= src.length)
        throw new FilterCompileError(dtaL10n.t("Unterminated string literal"), start);
      i++;
      tokens.push({ type: "STRING", value: s, pos: start });
      continue;
    }
    if (c >= "0" && c <= "9") {
      let s = "";
      while (i < src.length && /[0-9.e+\-]/i.test(src[i])) {
        if ((src[i] === "+" || src[i] === "-") && !(s.endsWith("e") || s.endsWith("E")))
          break;
        s += src[i++];
      }
      const n = Number(s);
      if (Number.isNaN(n))
        throw new FilterCompileError(dtaL10n.t("Invalid number: {0}", s), start);
      tokens.push({ type: "NUMBER", value: s, pos: start });
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "LPAREN", value: "(", pos: start });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "RPAREN", value: ")", pos: start });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "COMMA", value: ",", pos: start });
      i++;
      continue;
    }
    if (c === "+") {
      tokens.push({ type: "PLUS", value: "+", pos: start });
      i++;
      continue;
    }
    if (c === "-") {
      tokens.push({ type: "MINUS", value: "-", pos: start });
      i++;
      continue;
    }
    if (c === "*") {
      tokens.push({ type: "STAR", value: "*", pos: start });
      i++;
      continue;
    }
    if (c === "/") {
      tokens.push({ type: "SLASH", value: "/", pos: start });
      i++;
      continue;
    }
    if (c === "^") {
      tokens.push({ type: "CARET", value: "^", pos: start });
      i++;
      continue;
    }
    if (c === "&") {
      tokens.push({ type: "AND", value: "&", pos: start });
      i += src[i + 1] === "&" ? 2 : 1;
      continue;
    }
    if (c === "|") {
      tokens.push({ type: "OR", value: "|", pos: start });
      i += src[i + 1] === "|" ? 2 : 1;
      continue;
    }
    if (c === "=" && src[i + 1] === "=") {
      tokens.push({ type: "EQ", value: "==", pos: start });
      i += 2;
      continue;
    }
    if (c === "!" && src[i + 1] === "=") {
      tokens.push({ type: "NEQ", value: "!=", pos: start });
      i += 2;
      continue;
    }
    if (c === "~" && src[i + 1] === "=") {
      tokens.push({ type: "NEQ", value: "~=", pos: start });
      i += 2;
      continue;
    }
    if (c === "<" && src[i + 1] === "=") {
      tokens.push({ type: "LE", value: "<=", pos: start });
      i += 2;
      continue;
    }
    if (c === ">" && src[i + 1] === "=") {
      tokens.push({ type: "GE", value: ">=", pos: start });
      i += 2;
      continue;
    }
    if (c === "<") {
      tokens.push({ type: "LT", value: "<", pos: start });
      i++;
      continue;
    }
    if (c === ">") {
      tokens.push({ type: "GT", value: ">", pos: start });
      i++;
      continue;
    }
    if (c === "!") {
      tokens.push({ type: "NOT", value: "!", pos: start });
      i++;
      continue;
    }
    if (isIdentifierStart(c)) {
      let s = "";
      while (i < src.length) {
        const ch = codePointAt(src, i);
        if (!isIdentifierPart(ch))
          break;
        s += ch;
        i += ch.length;
      }
      const keyword = s.toLowerCase();
      if (keyword === "and") {
        tokens.push({ type: "AND", value: "and", pos: start });
        continue;
      }
      if (keyword === "or") {
        tokens.push({ type: "OR", value: "or", pos: start });
        continue;
      }
      if (keyword === "not") {
        tokens.push({ type: "NOT", value: "not", pos: start });
        continue;
      }
      tokens.push({ type: "IDENT", value: s, pos: start });
      continue;
    }
    throw new FilterCompileError(dtaL10n.t('Unexpected character "{0}"', c), start);
  }
  tokens.push({ type: "EOF", value: "", pos: src.length });
  return tokens;
}
var Parser = class {
  constructor(tokens) {
    this.tokens = tokens;
  }
  tokens;
  p = 0;
  parse() {
    const expr = this.parseOr();
    if (this.peek().type !== "EOF") {
      const t = this.peek();
      throw new FilterCompileError(dtaL10n.t('Unexpected token "{0}"', t.value), t.pos);
    }
    return expr;
  }
  peek() {
    return this.tokens[this.p];
  }
  consume() {
    return this.tokens[this.p++];
  }
  expect(type) {
    const t = this.peek();
    if (t.type !== type)
      throw new FilterCompileError(dtaL10n.t('Expected {0}, got {1} "{2}"', tokenTypeLabel(type), tokenTypeLabel(t.type), t.value), t.pos);
    return this.consume();
  }
  parseOr() {
    let left = this.parseAnd();
    while (this.peek().type === "OR") {
      this.consume();
      left = { kind: "or", a: left, b: this.parseAnd() };
    }
    return left;
  }
  parseAnd() {
    let left = this.parseCmp();
    while (this.peek().type === "AND") {
      this.consume();
      left = { kind: "and", a: left, b: this.parseCmp() };
    }
    return left;
  }
  parseCmp() {
    const a = this.parseAdd();
    const t = this.peek();
    const cmpMap = {
      EQ: "eq",
      NEQ: "neq",
      LT: "lt",
      LE: "le",
      GT: "gt",
      GE: "ge"
    };
    if (cmpMap[t.type]) {
      this.consume();
      const b = this.parseAdd();
      return { kind: "cmp", op: cmpMap[t.type], a, b };
    }
    return a;
  }
  parseAdd() {
    let left = this.parseMul();
    while (this.peek().type === "PLUS" || this.peek().type === "MINUS") {
      const t = this.consume();
      left = {
        kind: "binary",
        op: t.type === "PLUS" ? "add" : "sub",
        a: left,
        b: this.parseMul()
      };
    }
    return left;
  }
  parseMul() {
    let left = this.parsePower();
    while (this.peek().type === "STAR" || this.peek().type === "SLASH") {
      const t = this.consume();
      left = {
        kind: "binary",
        op: t.type === "STAR" ? "mul" : "div",
        a: left,
        b: this.parsePower()
      };
    }
    return left;
  }
  parsePower() {
    const left = this.parseUnary();
    if (this.peek().type === "CARET") {
      this.consume();
      return { kind: "binary", op: "pow", a: left, b: this.parsePower() };
    }
    return left;
  }
  parseUnary() {
    if (this.peek().type === "NOT") {
      this.consume();
      return { kind: "not", expr: this.parseUnary() };
    }
    if (this.peek().type === "PLUS") {
      this.consume();
      return { kind: "unary", op: "pos", expr: this.parseUnary() };
    }
    if (this.peek().type === "MINUS") {
      this.consume();
      return { kind: "unary", op: "neg", expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  parsePrimary() {
    const t = this.peek();
    if (t.type === "LPAREN") {
      this.consume();
      const e = this.parseOr();
      this.expect("RPAREN");
      return e;
    }
    if (t.type === "NUMBER") {
      this.consume();
      return { kind: "num", value: Number(t.value) };
    }
    if (t.type === "STRING") {
      this.consume();
      return { kind: "str", value: t.value };
    }
    if (t.type === "IDENT") {
      this.consume();
      if (this.peek().type === "LPAREN") {
        this.consume();
        const args = [];
        if (this.peek().type !== "RPAREN") {
          while (true) {
            args.push(this.parseOr());
            if (this.peek().type !== "COMMA")
              break;
            this.consume();
          }
        }
        this.expect("RPAREN");
        return { kind: "call", name: t.value, args };
      }
      return { kind: "var", name: t.value };
    }
    throw new FilterCompileError(dtaL10n.t('Unexpected token "{0}"', t.value), t.pos);
  }
};
var MISSING_VALUE = { v: null, missing: true };
function isTruthyValue(x) {
  if (x.missing)
    return false;
  if (typeof x.v === "number")
    return x.v !== 0 && !Number.isNaN(x.v);
  if (typeof x.v === "string")
    return x.v.length > 0;
  return x.v;
}
function scalarEquals(a, b) {
  return a === b;
}
function isComparable(v) {
  return typeof v === "number" || typeof v === "string";
}
function compareScalars(a, b, op) {
  if (!isComparable(a) || !isComparable(b) || typeof a !== typeof b)
    return false;
  switch (op) {
    case "lt":
      return a < b;
    case "le":
      return a <= b;
    case "gt":
      return a > b;
    case "ge":
      return a >= b;
  }
}
function scalarToString(v) {
  return String(v);
}
function expectNumber(v, label) {
  if (typeof v === "number")
    return v;
  throw new FilterCompileError(dtaL10n.t("{0} expects numeric values", label));
}
function expectArgCount(name, got, expected) {
  if (got !== expected)
    throw new FilterCompileError(dtaL10n.t('Function "{0}" expects {1} arguments, got {2}', name, expected, got));
}
function expectMinArgCount(name, got, min) {
  if (got < min)
    throw new FilterCompileError(dtaL10n.t('Function "{0}" expects at least {1} arguments, got {2}', name, min, got));
}
function toDate(value) {
  if (typeof value === "number") {
    const stataEpoch = Date.UTC(1960, 0, 1);
    const ms = Math.abs(value) > 1e6 ? stataEpoch + value : stataEpoch + value * 864e5;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function compileVal(node, data, referenced) {
  if (node.kind === "num") {
    const v = node.value;
    return () => ({ v, missing: false });
  }
  if (node.kind === "str") {
    const v = node.value;
    return () => ({ v, missing: false });
  }
  if (node.kind === "unary") {
    const r = compileVal(node.expr, data, referenced);
    const label = node.op === "neg" ? "-" : "+";
    return (i) => {
      const x = r(i);
      if (x.missing)
        return MISSING_VALUE;
      const n = expectNumber(x.v, label);
      return { v: node.op === "neg" ? -n : n, missing: false };
    };
  }
  if (node.kind === "binary") {
    const ra = compileVal(node.a, data, referenced);
    const rb = compileVal(node.b, data, referenced);
    const opLabel = {
      add: "+",
      sub: "-",
      mul: "*",
      div: "/",
      pow: "^"
    };
    return (i) => {
      const A = ra(i);
      if (A.missing)
        return MISSING_VALUE;
      const B = rb(i);
      if (B.missing)
        return MISSING_VALUE;
      if (node.op === "add" && typeof A.v === "string" && typeof B.v === "string")
        return { v: A.v + B.v, missing: false };
      const label = opLabel[node.op];
      const a = expectNumber(A.v, label);
      const b = expectNumber(B.v, label);
      const v = node.op === "add" ? a + b : node.op === "sub" ? a - b : node.op === "mul" ? a * b : node.op === "div" ? a / b : a ** b;
      return Number.isFinite(v) ? { v, missing: false } : MISSING_VALUE;
    };
  }
  if (node.kind === "call") {
    return compileCall(node, data, referenced);
  }
  if (node.kind === "var") {
    const arr = data.columns[node.name];
    const miss = data.missing[node.name];
    if (!arr) {
      throw new FilterCompileError(dtaL10n.t("Unknown variable: {0}", node.name));
    }
    referenced.add(node.name);
    if (Array.isArray(arr)) {
      const sa = arr;
      return (i) => miss[i] ? { v: null, missing: true } : { v: sa[i], missing: false };
    } else {
      const na = arr;
      return (i) => miss[i] ? { v: null, missing: true } : { v: na[i], missing: false };
    }
  }
  throw new FilterCompileError(dtaL10n.t('Expected a value, got expression of kind "{0}"', node.kind));
}
function compileCall(node, data, referenced) {
  const name = node.name.toLowerCase();
  const args = node.args.map((arg) => compileVal(arg, data, referenced));
  if (name === "missing") {
    expectMinArgCount(name, args.length, 1);
    return (i) => ({ v: args.some((arg) => arg(i).missing), missing: false });
  }
  if (name === "inlist") {
    expectMinArgCount(name, args.length, 2);
    return (i) => {
      const needle = args[0](i);
      if (needle.missing)
        return { v: false, missing: false };
      for (let k = 1; k < args.length; k++) {
        const item = args[k](i);
        if (!item.missing && scalarEquals(needle.v, item.v))
          return { v: true, missing: false };
      }
      return { v: false, missing: false };
    };
  }
  if (name === "inrange") {
    expectArgCount(name, args.length, 3);
    return (i) => {
      const value = args[0](i);
      const lo = args[1](i);
      const hi = args[2](i);
      if (value.missing || lo.missing || hi.missing)
        return { v: false, missing: false };
      return {
        v: compareScalars(value.v, lo.v, "ge") && compareScalars(value.v, hi.v, "le"),
        missing: false
      };
    };
  }
  if (name === "contains") {
    expectArgCount(name, args.length, 2);
    return (i) => {
      const text = args[0](i);
      const part = args[1](i);
      if (text.missing || part.missing)
        return { v: false, missing: false };
      return { v: scalarToString(text.v).includes(scalarToString(part.v)), missing: false };
    };
  }
  if (name === "strpos") {
    expectArgCount(name, args.length, 2);
    return (i) => {
      const text = args[0](i);
      const part = args[1](i);
      if (text.missing || part.missing)
        return { v: 0, missing: false };
      const pos = scalarToString(text.v).indexOf(scalarToString(part.v));
      return { v: pos < 0 ? 0 : pos + 1, missing: false };
    };
  }
  if (name === "regexm") {
    expectArgCount(name, args.length, 2);
    const regexCache = /* @__PURE__ */ new Map();
    const getRegex = (pattern) => {
      let re = regexCache.get(pattern);
      if (!re) {
        try {
          re = new RegExp(pattern);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new FilterCompileError(dtaL10n.t("Invalid regular expression: {0}", msg));
        }
        regexCache.set(pattern, re);
      }
      return re;
    };
    return (i) => {
      const text = args[0](i);
      const pattern = args[1](i);
      if (text.missing || pattern.missing)
        return { v: false, missing: false };
      return { v: getRegex(scalarToString(pattern.v)).test(scalarToString(text.v)), missing: false };
    };
  }
  if (name === "lower" || name === "upper" || name === "trim" || name === "length") {
    expectArgCount(name, args.length, 1);
    return (i) => {
      const value = args[0](i);
      if (value.missing)
        return MISSING_VALUE;
      const text = scalarToString(value.v);
      if (name === "lower")
        return { v: text.toLowerCase(), missing: false };
      if (name === "upper")
        return { v: text.toUpperCase(), missing: false };
      if (name === "trim")
        return { v: text.trim(), missing: false };
      return { v: text.length, missing: false };
    };
  }
  if (name === "year" || name === "month" || name === "day") {
    expectArgCount(name, args.length, 1);
    return (i) => {
      const value = args[0](i);
      if (value.missing)
        return MISSING_VALUE;
      const date = toDate(value.v);
      if (!date)
        return MISSING_VALUE;
      if (name === "year")
        return { v: date.getUTCFullYear(), missing: false };
      if (name === "month")
        return { v: date.getUTCMonth() + 1, missing: false };
      return { v: date.getUTCDate(), missing: false };
    };
  }
  throw new FilterCompileError(dtaL10n.t("Unknown function: {0}", node.name));
}
function compileBool(node, data, referenced) {
  if (node.kind === "not") {
    const inner = compileBool(node.expr, data, referenced);
    return (i) => !inner(i);
  }
  if (node.kind === "and") {
    const a = compileBool(node.a, data, referenced);
    const b = compileBool(node.b, data, referenced);
    return (i) => a(i) && b(i);
  }
  if (node.kind === "or") {
    const a = compileBool(node.a, data, referenced);
    const b = compileBool(node.b, data, referenced);
    return (i) => a(i) || b(i);
  }
  if (node.kind === "cmp") {
    const ra = compileVal(node.a, data, referenced);
    const rb = compileVal(node.b, data, referenced);
    const op = node.op;
    return (i) => {
      const A = ra(i);
      if (A.missing)
        return false;
      const B = rb(i);
      if (B.missing)
        return false;
      const va = A.v;
      const vb = B.v;
      switch (op) {
        case "eq":
          return va === vb;
        case "neq":
          return va !== vb;
        case "lt":
        case "le":
        case "gt":
        case "ge":
          return compareScalars(va, vb, op);
      }
    };
  }
  const r = compileVal(node, data, referenced);
  return (i) => isTruthyValue(r(i));
}
function compileFilter(expression, data) {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { fn: () => true, referencedVars: [] };
  }
  let dataCache = compileCache.get(data);
  if (dataCache) {
    const cached = dataCache.get(trimmed);
    if (cached)
      return cached;
  } else {
    dataCache = /* @__PURE__ */ new Map();
    compileCache.set(data, dataCache);
  }
  const tokens = tokenize(trimmed);
  const ast = new Parser(tokens).parse();
  const referenced = /* @__PURE__ */ new Set();
  const fn = compileBool(ast, data, referenced);
  const result = { fn, referencedVars: [...referenced] };
  dataCache.set(trimmed, result);
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FilterCompileError,
  compileFilter
});
