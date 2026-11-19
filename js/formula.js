// =====================================================================
// Bộ tính công thức kiểu Excel cho bảng dữ liệu
// - Lưu trong CSDL theo khoá cột: ={kl}3*{ns}3 , =SUM({tt}1:{tt}9) , cả cột: ={kl}@/{ns}@
// - Hiển thị cho người dùng theo chữ cột: =C3*D3 , =SUM(G1:G9) , =C@/D@ (@ = dòng hiện tại)
//   → đổi thứ tự / thêm cột không làm hỏng công thức.
// =====================================================================
export class FErr { constructor(code) { this.code = code; } toString() { return this.code; } }
const E = (c) => new FErr(c);

export function colLetter(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
export function letterIdx(L) { let n = 0; for (const ch of L) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
export const isFormula = (v) => typeof v === 'string' && v.trim().startsWith('=');

const REF = /\{([a-z0-9_]+)\}(\d+|@)/gi;
export function toDisplay(f, cols) {
  if (!isFormula(f)) return f;
  return f.replace(REF, (m, k, r) => { const i = cols.findIndex(c => c.key === k); return i < 0 ? '#REF!' : colLetter(i) + r; });
}
export function toInternal(text, cols) {
  if (!isFormula(text)) return text;
  return text.trim().split(/("[^"]*")/).map((seg, i) => i % 2 ? seg :
    seg.replace(/\$?\b([A-Za-z]{1,2})\$?(\d+|@)(?![\w(])/g, (m, L, r) => {
      const idx = letterIdx(L.toUpperCase());
      return idx >= 0 && idx < cols.length ? `{${cols[idx].key}}${r}` : m;
    })).join('');
}
// Khi chèn / xoá dòng: dịch số dòng trong công thức (như Excel)
export function shiftRows(f, at, delta) {
  if (!isFormula(f)) return f;
  return f.replace(/\{([a-z0-9_]+)\}(\d+)/gi, (m, k, r) => {
    const n = Number(r);
    if (delta < 0 && n === at) return '#REF!';
    return n >= at + (delta < 0 ? 1 : 0) ? `{${k}}${n + delta}` : m;
  });
}

// ---------- chuyển giá trị ----------
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const dateToSerial = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5);
export const serialToISO = (n) => new Date(Math.round(n) * 864e5).toISOString().slice(0, 10);
export function parseNum(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v).trim().replace(/\s/g, '').replace(/đ$/i, '');
  if (!s) return null;
  if (ISO.test(s)) return dateToSerial(s);
  let pct = false; if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
  // 1.234.567,89 (VN) | 1,234,567.89 (EN) | 12,5 | 12.5
  if (/,\d{1,4}$/.test(s) && !/,.*\./.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,(?=\d{3}(\D|$))/g, '');
  if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isNaN(n) ? null : (pct ? n / 100 : n);
}
function num(v) {
  if (v instanceof FErr) throw v;
  if (v == null || v === '') return 0;
  const n = parseNum(v);
  if (n == null) throw E('#VALUE!');
  return n;
}
const flat = (args) => args.flat(Infinity);
const nums = (args) => flat(args).filter(v => { if (v instanceof FErr) throw v; return v !== '' && v != null && parseNum(v) != null; }).map(parseNum);
const round = (x, n = 0) => { const k = 10 ** n; return Math.round((x + Number.EPSILON * Math.sign(x)) * k) / k; };

const FN = {
  SUM: (a) => nums(a).reduce((s, x) => s + x, 0),
  AVERAGE: (a) => { const v = nums(a); if (!v.length) throw E('#DIV/0!'); return v.reduce((s, x) => s + x, 0) / v.length; },
  MIN: (a) => { const v = nums(a); return v.length ? Math.min(...v) : 0; },
  MAX: (a) => { const v = nums(a); return v.length ? Math.max(...v) : 0; },
  COUNT: (a) => nums(a).length,
  ROUND: ([x, n]) => round(num(x), num(n ?? 0)),
  ROUNDUP: ([x, n]) => { const k = 10 ** num(n ?? 0), v = num(x); return Math.sign(v) * Math.ceil(Math.abs(v) * k - 1e-9) / k; },
  ROUNDDOWN: ([x, n]) => { const k = 10 ** num(n ?? 0), v = num(x); return Math.sign(v) * Math.floor(Math.abs(v) * k + 1e-9) / k; },
  CEILING: ([x, s]) => { const g = num(s ?? 1) || 1; return Math.ceil(num(x) / g - 1e-9) * g; },
  FLOOR: ([x, s]) => { const g = num(s ?? 1) || 1; return Math.floor(num(x) / g + 1e-9) * g; },
  INT: ([x]) => Math.floor(num(x)),
  ABS: ([x]) => Math.abs(num(x)),
  SQRT: ([x]) => { const v = num(x); if (v < 0) throw E('#NUM!'); return Math.sqrt(v); },
  POWER: ([x, y]) => num(x) ** num(y),
  MOD: ([x, y]) => { const d = num(y); if (!d) throw E('#DIV/0!'); return num(x) % d; },
  IF: ([c, a, b]) => (truthy(c) ? (a ?? true) : (b ?? false)),
  IFERROR: ([a, b]) => (a instanceof FErr ? b : a),
  AND: (a) => flat(a).every(truthy),
  OR: (a) => flat(a).some(truthy),
  NOT: ([x]) => !truthy(x),
  PI: () => Math.PI,
};
const LAZY = new Set(['IF', 'IFERROR']);
function truthy(v) { if (v instanceof FErr) throw v; if (typeof v === 'string') return v !== '' && v.toUpperCase() !== 'FALSE'; return !!v; }

// ---------- phân tích cú pháp ----------
function tokenize(s) {
  const t = []; let i = 0;
  while (i < s.length) {
    const rest = s.slice(i); let m;
    if (/^\s/.test(rest)) { i++; continue; }
    if ((m = rest.match(/^\{([a-z0-9_]+)\}(\d+|@)(?::\{([a-z0-9_]+)\}(\d+|@))?/i))) { t.push(m[3] ? { t: 'range', a: [m[1], m[2]], b: [m[3], m[4]] } : { t: 'ref', k: m[1], r: m[2] }); i += m[0].length; continue; }
    if ((m = rest.match(/^\d+(\.\d+)?([eE][+-]?\d+)?/))) { t.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^"([^"]*)"/))) { t.push({ t: 'str', v: m[1] }); i += m[0].length; continue; }
    if (rest.startsWith('#REF!')) throw E('#REF!');
    if ((m = rest.match(/^[A-Za-z_][A-Za-z0-9_.]*/))) { t.push({ t: 'id', v: m[0].toUpperCase() }); i += m[0].length; continue; }
    if ((m = rest.match(/^(<=|>=|<>|[-+*/^&=<>(),;%:])/))) { t.push({ t: 'op', v: m[0] === ';' ? ',' : m[0] }); i += m[0].length; continue; }
    throw E('#NAME?');
  }
  return t;
}
function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p], isOp = (v) => tokens[p]?.t === 'op' && tokens[p].v === v;
  const eat = (v) => { if (!isOp(v)) throw E('#ERR!'); p++; };
  const bin = (next, ops) => () => { let l = next(); while (tokens[p]?.t === 'op' && ops.includes(tokens[p].v)) { const op = tokens[p++].v; l = { op, l, r: next() }; } return l; };
  const primary = () => {
    const tk = tokens[p++];
    if (!tk) throw E('#ERR!');
    if (tk.t === 'num') return { n: tk.v };
    if (tk.t === 'str') return { s: tk.v };
    if (tk.t === 'ref') return { ref: tk };
    if (tk.t === 'range') return { range: tk };
    if (tk.t === 'id') {
      if (tk.v === 'TRUE' || tk.v === 'FALSE') return { b: tk.v === 'TRUE' };
      if (!isOp('(')) throw E('#NAME?');
      p++; const args = [];
      if (!isOp(')')) { do { args.push(cmp()); } while (isOp(',') && ++p); }
      eat(')');
      if (!FN[tk.v]) throw E('#NAME?');
      return { fn: tk.v, args };
    }
    if (tk.t === 'op' && tk.v === '(') { const e = cmp(); eat(')'); return e; }
    if (tk.t === 'op' && (tk.v === '-' || tk.v === '+')) { const e = postfix(); return tk.v === '-' ? { neg: e } : e; }
    throw E('#ERR!');
  };
  const postfix = () => { let e = primary(); while (isOp('%')) { p++; e = { pct: e }; } return e; };
  const pow = bin(postfix, ['^']);
  const mul = bin(pow, ['*', '/']);
  const add = bin(mul, ['+', '-']);
  const cat = bin(add, ['&']);
  const cmp = bin(cat, ['=', '<>', '<', '>', '<=', '>=']);
  const ast = cmp();
  if (p < tokens.length) throw E('#ERR!');
  return ast;
}
const astCache = new Map();
function compile(src) {
  let a = astCache.get(src);
  if (!a) { try { a = parse(tokenize(src)); } catch (e) { a = { err: e instanceof FErr ? e : E('#ERR!') }; } astCache.set(src, a); if (astCache.size > 4000) astCache.clear(); }
  return a;
}

function evalAst(a, ri, get, nrows) {
  const rowOf = (r) => (r === '@' ? ri : Number(r) - 1);
  const ev = (x) => {
    if (x.err) throw x.err;
    if ('n' in x) return x.n;
    if ('s' in x) return x.s;
    if ('b' in x) return x.b;
    if (x.ref) { const r = rowOf(x.ref.r); if (r < 0) throw E('#REF!'); const v = get(r, x.ref.k); if (v instanceof FErr) throw v; return v; }
    if (x.range) {
      const r1 = rowOf(x.range.a[1]), r2 = rowOf(x.range.b[1]);
      const keys = get.keysBetween(x.range.a[0], x.range.b[0]);
      if (!keys) throw E('#REF!');
      const out = [];
      for (let r = Math.min(r1, r2); r <= Math.min(Math.max(r1, r2), nrows - 1); r++) for (const k of keys) out.push(get(r, k));
      return out;
    }
    if (x.neg) return -num(ev(x.neg));
    if (x.pct) return num(ev(x.pct)) / 100;
    if (x.fn) {
      if (LAZY.has(x.fn)) {
        if (x.fn === 'IF') return truthy(ev(x.args[0])) ? (x.args[1] ? ev(x.args[1]) : true) : (x.args[2] ? ev(x.args[2]) : false);
        try { return ev(x.args[0]); } catch (e) { if (e instanceof FErr) return x.args[1] ? ev(x.args[1]) : ''; throw e; }
      }
      return FN[x.fn](x.args.map(ev));
    }
    if (x.op) {
      const l = ev(x.l), r = ev(x.r);
      switch (x.op) {
        case '+': return num(l) + num(r);
        case '-': return num(l) - num(r);
        case '*': return num(l) * num(r);
        case '/': { const d = num(r); if (d === 0) throw E('#DIV/0!'); return num(l) / d; }
        case '^': return num(l) ** num(r);
        case '&': return `${l ?? ''}${r ?? ''}`;
        default: {
          const both = parseNum(l) != null && parseNum(r) != null;
          const A = both ? parseNum(l) : String(l ?? ''), B = both ? parseNum(r) : String(r ?? '');
          return { '=': A === B, '<>': A !== B, '<': A < B, '>': A > B, '<=': A <= B, '>=': A >= B }[x.op];
        }
      }
    }
    throw E('#ERR!');
  };
  const v = ev(a);
  if (Array.isArray(v)) return v[0] ?? '';
  if (typeof v === 'number' && !isFinite(v)) throw E('#NUM!');
  return v;
}

// =====================================================================
// Tính cả bảng. columns: [{key, formula?}], rows: [{cells}] đã sắp theo thứ tự.
// =====================================================================
export function computeSheet(columns, rows) {
  const cache = new Map(), visiting = new Set();
  const byKey = new Map(columns.map((c, i) => [c.key, { c, i }]));
  const get = (ri, key) => {
    if (ri < 0 || ri >= rows.length) return '';
    const id = ri + ':' + key;
    if (cache.has(id)) return cache.get(id);
    const col = byKey.get(key);
    if (!col) return E('#REF!');
    const raw = col.c.formula ? col.c.formula : rows[ri]?.cells?.[key];
    let v = raw;
    if (isFormula(raw)) {
      if (visiting.has(id)) return E('#CYCLE!');
      visiting.add(id);
      try { v = evalAst(compile(raw.trim().slice(1)), ri, get, rows.length); }
      catch (e) { v = e instanceof FErr ? e : E('#ERR!'); }
      visiting.delete(id);
    }
    cache.set(id, v);
    return v;
  };
  get.keysBetween = (k1, k2) => {
    const a = byKey.get(k1), b = byKey.get(k2);
    if (!a || !b) return null;
    const [lo, hi] = a.i <= b.i ? [a.i, b.i] : [b.i, a.i];
    return columns.slice(lo, hi + 1).map(c => c.key);
  };
  const isComputed = (ri, key) => !!byKey.get(key)?.c.formula || isFormula(rows[ri]?.cells?.[key]);
  const total = (key) => { let s = 0, any = false; for (let r = 0; r < rows.length; r++) { const v = get(r, key); const n = v instanceof FErr ? null : parseNum(v); if (n != null && v !== '' && typeof v !== 'boolean') { s += n; any = true; } } return any ? s : null; };
  return { get, isComputed, total };
}

// ---------- hiển thị ----------
const nfCache = {};
const nfmt = (d) => (nfCache[d] ||= new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d }));
export const FORMATS = { auto: 'Tự động', int: 'Số nguyên', dec2: '2 chữ số thập phân', vnd: 'Tiền (đ)', pct: 'Phần trăm (%)', date: 'Ngày' };
export function fmtNumber(n, fmt = 'auto') {
  switch (fmt) {
    case 'int': return nfmt(0).format(round(n, 0));
    case 'dec2': return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    case 'vnd': return nfmt(0).format(round(n, 0)) + ' đ';
    case 'pct': return nfmt(2).format(n) + ' %';
    case 'date': { const d = serialToISO(n); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`; }
    default: { const a = Math.abs(n); return nfmt(a !== 0 && a < 1 ? 6 : a < 100 ? 4 : 2).format(n); }
  }
}
export function fmtValue(v, col = {}) {
  if (v instanceof FErr) return v.code;
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'ĐÚNG' : 'SAI';
  const numeric = typeof v === 'number' || ((col.type === 'number' || col.formula || col.fmt) && parseNum(v) != null && !(col.type === 'date' && ISO.test(v)));
  if (col.type === 'date' && typeof v === 'string' && ISO.test(v)) return fmtNumber(dateToSerial(v), 'date');
  if (numeric) return fmtNumber(parseNum(v), col.fmt || 'auto');
  return String(v);
}
