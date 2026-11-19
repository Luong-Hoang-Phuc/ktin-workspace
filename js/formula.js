// =====================================================================
// Bộ tính công thức kiểu Excel
// Lưu trong CSDL (theo khoá cột, không phụ thuộc thứ tự cột):
//   {kl}3            ô cột kl, dòng 3 (dòng dữ liệu thứ 3 trên web)
//   {kl}@            cùng dòng (cột công thức)
//   {a}1:{c}9        vùng      {a}:{c}   cả cột
//   [tableId]{kl}3   ô của bảng khác (sheet khác) trong cùng mục
// Hiển thị / Excel: =C3*D3, =SUM(G1:G9), ='VẬT TƯ '!F8, =VLOOKUP(A2,'Giá giấy'!A:C,3,0)
// =====================================================================
export class FErr { constructor(code) { this.code = code; } toString() { return this.code; } }
const E = (c) => new FErr(c);

export function colLetter(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
export function letterIdx(L) { let n = 0; for (const ch of L.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
export const isFormula = (v) => typeof v === 'string' && v.length > 1 && v.trim().startsWith('=');

// ---------- ngày: số sê-ri giống Excel (1 = 01/01/1900, 25569 = 01/01/1970) ----------
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const dateToSerial = (s) => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5) + 25569;
export const serialToISO = (n) => new Date((Math.round(n) - 25569) * 864e5).toISOString().slice(0, 10);
const ymdToSerial = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 864e5) + 25569;
const serialParts = (n) => { const d = new Date((Math.floor(n) - 25569) * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() }; };

export function parseNum(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof FErr || Array.isArray(v)) return null;
  let s = String(v).trim().replace(/\s/g, '').replace(/(đ|₫|VND)$/i, '');
  if (!s) return null;
  if (ISO.test(s)) return dateToSerial(s);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return ymdToSerial(+m[3], +m[2], +m[1]);
  let pct = false; if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
  if (/,\d{1,4}$/.test(s) && !/,.*\./.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,(?=\d{3}(\D|$))/g, '');
  if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isNaN(n) ? null : (pct ? n / 100 : n);
}

// =====================================================================
// CHUYỂN ĐỔI  A1 (người dùng / Excel)  ⇄  nội bộ
// ctx: { cols, offset, selfId, resolve(name) → {id, cols, offset}, info(id) → {name, cols, offset} }
// offset = số dòng tiêu đề phía trên (Excel dòng N ↔ web dòng N − offset)
// =====================================================================
const NAME_CH = /[A-Za-z0-9_.$\u00C0-\uFFFF]/;
const RANGE_A1 = '(\\$?[A-Za-z]{1,3}\\$?(?:\\d+|@)(?::\\$?[A-Za-z]{1,3}\\$?(?:\\d+|@))?|\\$?[A-Za-z]{1,3}:\\$?[A-Za-z]{1,3})';
const SHEET_RE = new RegExp(`(?:'((?:[^']|'')+)'|([A-Za-z_\\u00C0-\\uFFFF][\\w.\\u00C0-\\uFFFF]*))!${RANGE_A1}`, 'y');
const LOCAL_RE = new RegExp(RANGE_A1, 'y');

function refA1ToInternal(txt, target, prefix) {
  const parts = txt.replace(/\$/g, '').split(':');
  const conv = (p) => {
    const m = p.match(/^([A-Za-z]{1,3})(\d+|@)?$/); if (!m) return null;
    const i = letterIdx(m[1]); const key = target.cols[i]?.key; if (!key) return null;
    let row = '';
    if (m[2] === '@') row = '@';
    else if (m[2]) { const n = Number(m[2]) - (target.offset || 0); if (n < 1) return null; row = String(n); }
    return `{${key}}${row}`;
  };
  const a = conv(parts[0]), b = parts[1] != null ? conv(parts[1]) : '';
  if (a == null || b == null) return '#REF!';
  return prefix + a + (parts[1] != null ? ':' + b : '');
}
export function a1ToInternal(text, ctx) {
  if (!isFormula(text)) return text;
  const body = text.trim().slice(1).replace(/_xlfn\.|_xlws\.|_xlpm\./g, '');
  const self = { id: ctx.selfId, cols: ctx.cols, offset: ctx.offset || 0 };
  let out = '=', i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '"') { let j = i + 1; while (j < body.length) { if (body[j] === '"' && body[j + 1] === '"') j += 2; else if (body[j] === '"') break; else j++; } out += body.slice(i, j + 1); i = j + 1; continue; }
    if (!i || !NAME_CH.test(body[i - 1])) {
      SHEET_RE.lastIndex = i;
      let m = SHEET_RE.exec(body);
      if (m) {
        const name = m[1] != null ? m[1].replace(/''/g, "'") : m[2];
        const t = ctx.resolve?.(name);
        out += !t ? '#REF!' : refA1ToInternal(m[3], t, t.id === ctx.selfId ? '' : `[${t.id}]`);
        i = SHEET_RE.lastIndex; continue;
      }
      LOCAL_RE.lastIndex = i;
      m = LOCAL_RE.exec(body);
      if (m && !/[\w(!]/.test(body[LOCAL_RE.lastIndex] || '')) {
        const first = m[1].replace(/\$/g, '').match(/^[A-Za-z]+/)[0];
        if (letterIdx(first) < self.cols.length || /\d|@/.test(m[1])) { out += refA1ToInternal(m[1], self, ''); i = LOCAL_RE.lastIndex; continue; }
      }
    }
    out += ch; i++;
  }
  return out;
}
const INT_REF = /(\[([\w-]+)\])?\{([a-z0-9_]+)\}(\d+|@)?(?::\{([a-z0-9_]+)\}(\d+|@)?)?/gi;
const quoteName = (n) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`;
export function internalToA1(f, ctx) {
  if (!isFormula(f)) return f;
  return f.split(/("(?:[^"]|"")*")/).map((seg, si) => si % 2 ? seg : seg.replace(INT_REF, (m, _p, tid, k1, r1, k2, r2) => {
    const t = tid && tid !== ctx.selfId ? ctx.info?.(tid) : { cols: ctx.cols, offset: ctx.offset || 0 };
    if (!t) return '#REF!';
    const L = (k) => { const i = t.cols.findIndex(c => c.key === k); return i < 0 ? null : colLetter(i); };
    const R = (r) => r == null ? '' : r === '@' ? (ctx.ri != null ? String(ctx.ri + 1 + (t.offset || 0)) : '@') : String(Number(r) + (t.offset || 0));
    const a = L(k1); if (a == null) return '#REF!';
    let s = a + R(r1);
    if (k2) { const b = L(k2); if (b == null) return '#REF!'; s += ':' + b + R(r2); }
    return (tid && tid !== ctx.selfId ? quoteName(t.name) + '!' : '') + s;
  })).join('');
}
// API cũ (ô trong cùng bảng, đánh số dòng của web)
export const toDisplay = (f, cols, book) => internalToA1(f, { cols, offset: 0, selfId: book?.selfId, info: book?.info });
export const toInternal = (text, cols, book) => a1ToInternal(text, { cols, offset: 0, selfId: book?.selfId, resolve: book?.resolve });

// Chèn / xoá dòng: dịch số dòng. own = true → tham chiếu trong chính bảng (không tiền tố); tid → tham chiếu [tid] từ bảng khác
export function shiftRefs(f, { own, tid, at, delta }) {
  if (!isFormula(f)) return f;
  const fix = (r) => { if (r == null || r === '@') return r; const n = Number(r); if (delta < 0 && n === at) return null; return String(n >= at + (delta < 0 ? 1 : 0) ? n + delta : n); };
  return f.split(/("(?:[^"]|"")*")/).map((seg, si) => si % 2 ? seg : seg.replace(INT_REF, (m, p, t, k1, r1, k2, r2) => {
    const mine = own ? !t : t === tid;
    if (!mine) return m;
    const a = fix(r1), b = k2 ? fix(r2) : undefined;
    if (a === null || b === null) return '#REF!';
    return (p || '') + `{${k1}}${a ?? ''}` + (k2 ? `:{${k2}}${b ?? ''}` : '');
  })).join('');
}
export const shiftRows = (f, at, delta) => shiftRefs(f, { own: true, at, delta });

// =====================================================================
// GIÁ TRỊ & HÀM
// =====================================================================
const isArr = Array.isArray;
function num(v) {
  if (v instanceof FErr) throw v;
  if (isArr(v)) return num(v[0]?.[0] ?? v[0]);
  if (v == null || v === '') return 0;
  const n = parseNum(v);
  if (n == null) throw E('#VALUE!');
  return n;
}
const str = (v) => { if (v instanceof FErr) throw v; if (isArr(v)) return str(v[0]?.[0] ?? v[0]); if (v == null) return ''; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; return String(v); };
const flat = (args) => args.flat(Infinity);
const nums = (args) => flat(args).filter(v => { if (v instanceof FErr) throw v; return v !== '' && v != null && typeof v !== 'boolean' && parseNum(v) != null; }).map(parseNum);
const to2D = (v) => isArr(v) ? (isArr(v[0]) ? v : [v]) : [[v]];
const vec = (v) => flat([v]);
const round = (x, n = 0) => { const k = 10 ** n; return Math.round((x + Number.EPSILON * Math.sign(x)) * k) / k; };
function truthy(v) { if (v instanceof FErr) throw v; if (isArr(v)) return truthy(v[0]?.[0]); if (typeof v === 'string') { const n = parseNum(v); if (n != null) return n !== 0; if (v === '') return false; if (/^(TRUE|FALSE)$/i.test(v)) return /^TRUE$/i.test(v); throw E('#VALUE!'); } return !!v; }
const blank = (v) => v === '' || v == null;
const wild = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i');
function same(a, x) { // so khớp chính xác kiểu Excel (không phân biệt hoa thường, hỗ trợ * ?)
  if (a instanceof FErr) return false;
  const na = typeof a === 'number' ? a : (typeof a === 'string' ? null : parseNum(a)), nx = typeof x === 'number' ? x : null;
  if (nx != null) return na != null ? Math.abs(na - nx) < 1e-12 : (typeof a === 'string' && parseNum(a) === nx);
  if (typeof x === 'string' && /[*?]/.test(x)) return wild(x).test(str(a));
  return str(a).toLowerCase() === str(x).toLowerCase();
}
function cmpLook(a, x) { // dùng cho dò tìm gần đúng: -1, 0, 1 hoặc null nếu khác kiểu
  if (a instanceof FErr || blank(a)) return null;
  if (typeof x === 'number') { if (typeof a !== 'number') return null; return a < x ? -1 : a > x ? 1 : 0; }
  if (typeof a === 'number') return null;
  return str(a).localeCompare(str(x), 'vi', { sensitivity: 'base' });
}
function crit(c) {
  if (c instanceof FErr) throw c;
  if (typeof c === 'number' || typeof c === 'boolean') return (v) => same(v, typeof c === 'boolean' ? c : c);
  const s = str(c); const m = s.match(/^(<=|>=|<>|<|>|=)?([\s\S]*)$/);
  const op = m[1] || '=', t = m[2]; const tn = parseNum(t);
  if (t === '') return op === '<>' ? (v) => !blank(v) : (v) => blank(v);
  return (v) => {
    if (v instanceof FErr) return false;
    const vn = typeof v === 'number' ? v : (typeof v === 'string' ? null : parseNum(v));
    if (tn != null && (op !== '=' && op !== '<>' || vn != null)) {
      if (vn == null) return op === '<>';
      return { '=': vn === tn, '<>': vn !== tn, '<': vn < tn, '>': vn > tn, '<=': vn <= tn, '>=': vn >= tn }[op];
    }
    if (op === '=' || op === '<>') { const r = blank(v) ? false : (/[*?]/.test(t) ? wild(t).test(str(v)) : str(v).toLowerCase() === t.toLowerCase()); return op === '=' ? r : !r; }
    if (typeof v !== 'string' || blank(v)) return false;
    const r = str(v).localeCompare(t, 'vi', { sensitivity: 'base' });
    return { '<': r < 0, '>': r > 0, '<=': r <= 0, '>=': r >= 0 }[op];
  };
}
function ifs(pairs, pick) { // trả về danh sách vị trí thoả mọi điều kiện
  const ranges = pairs.map(([r]) => vec(r)); const tests = pairs.map(([, c]) => crit(c));
  const n = ranges[0].length; const out = [];
  for (let i = 0; i < n; i++) if (ranges.every((r, j) => tests[j](r[i]))) out.push(i);
  return pick ? out.map(i => vec(pick)[i]) : out;
}
const pairsOf = (a, start) => { const p = []; for (let i = start; i + 1 < a.length; i += 2) p.push([a[i], a[i + 1]]); return p; };
function textFmt(v, f) {
  const n = num(v); f = str(f);
  if (/[dmy]/i.test(f) && !/0/.test(f)) { const p = serialParts(n); return f.replace(/yyyy/i, p.y).replace(/yy/i, String(p.y).slice(2)).replace(/mm/i, String(p.m).padStart(2, '0')).replace(/dd/i, String(p.d).padStart(2, '0')).replace(/\bm\b/i, p.m).replace(/\bd\b/i, p.d); }
  const pct = f.includes('%'); const dec = (f.split('.')[1] || '').replace(/[^0#]/g, '').length;
  const x = pct ? n * 100 : n;
  const s = f.includes(',') ? new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(x) : x.toFixed(dec);
  return s + (pct ? '%' : '');
}
function workday(start, days, hol = []) {
  const H = new Set(vec(hol).map(parseNum).filter(x => x != null).map(Math.floor));
  let d = Math.floor(num(start)), n = Math.trunc(num(days)); const step = n < 0 ? -1 : 1;
  while (n !== 0) { d += step; const wd = serialParts(d).wd; if (wd !== 0 && wd !== 6 && !H.has(d)) n -= step; }
  return d;
}

const FN = {
  // toán học, thống kê
  SUM: (a) => nums(a).reduce((s, x) => s + x, 0),
  PRODUCT: (a) => nums(a).reduce((s, x) => s * x, 1),
  AVERAGE: (a) => { const v = nums(a); if (!v.length) throw E('#DIV/0!'); return v.reduce((s, x) => s + x, 0) / v.length; },
  MIN: (a) => { const v = nums(a); return v.length ? Math.min(...v) : 0; },
  MAX: (a) => { const v = nums(a); return v.length ? Math.max(...v) : 0; },
  COUNT: (a) => nums(a).length,
  COUNTA: (a) => flat(a).filter(v => !blank(v)).length,
  COUNTBLANK: (a) => flat(a).filter(blank).length,
  LARGE: ([r, k]) => { const v = nums([r]).sort((x, y) => y - x); const i = num(k) - 1; if (i < 0 || i >= v.length) throw E('#NUM!'); return v[i]; },
  SMALL: ([r, k]) => { const v = nums([r]).sort((x, y) => x - y); const i = num(k) - 1; if (i < 0 || i >= v.length) throw E('#NUM!'); return v[i]; },
  ROUND: ([x, n]) => round(num(x), num(n ?? 0)),
  ROUNDUP: ([x, n]) => { const k = 10 ** num(n ?? 0), v = num(x); return Math.sign(v) * Math.ceil(Math.abs(v) * k - 1e-9) / k; },
  ROUNDDOWN: ([x, n]) => { const k = 10 ** num(n ?? 0), v = num(x); return Math.sign(v) * Math.floor(Math.abs(v) * k + 1e-9) / k; },
  TRUNC: ([x, n]) => FN.ROUNDDOWN([x, n ?? 0]),
  MROUND: ([x, m]) => { const g = num(m); return g ? Math.round(num(x) / g) * g : 0; },
  CEILING: ([x, s]) => { const g = num(s ?? 1) || 1; return Math.ceil(num(x) / g - 1e-9) * g; },
  'CEILING.MATH': ([x, s]) => FN.CEILING([x, s]),
  FLOOR: ([x, s]) => { const g = num(s ?? 1) || 1; return Math.floor(num(x) / g + 1e-9) * g; },
  'FLOOR.MATH': ([x, s]) => FN.FLOOR([x, s]),
  INT: ([x]) => Math.floor(num(x)),
  ABS: ([x]) => Math.abs(num(x)),
  SIGN: ([x]) => Math.sign(num(x)),
  SQRT: ([x]) => { const v = num(x); if (v < 0) throw E('#NUM!'); return Math.sqrt(v); },
  POWER: ([x, y]) => num(x) ** num(y),
  EXP: ([x]) => Math.exp(num(x)),
  LN: ([x]) => { const v = num(x); if (v <= 0) throw E('#NUM!'); return Math.log(v); },
  LOG: ([x, b]) => { const v = num(x); if (v <= 0) throw E('#NUM!'); return Math.log(v) / Math.log(num(b ?? 10)); },
  LOG10: ([x]) => FN.LOG([x, 10]),
  MOD: ([x, y]) => { const d = num(y); if (!d) throw E('#DIV/0!'); const a = num(x); return a - d * Math.floor(a / d); },
  QUOTIENT: ([x, y]) => { const d = num(y); if (!d) throw E('#DIV/0!'); return Math.trunc(num(x) / d); },
  PI: () => Math.PI,
  SUMPRODUCT: (a) => { const vs = a.map(vec); const n = vs[0].length; if (vs.some(v => v.length !== n)) throw E('#VALUE!'); let s = 0; for (let i = 0; i < n; i++) { let p = 1; for (const v of vs) { if (v[i] instanceof FErr) throw v[i]; p *= typeof v[i] === 'number' ? v[i] : (typeof v[i] === 'boolean' ? +v[i] : 0); } s += p; } return s; },
  // có điều kiện
  SUMIF: ([r, c, s]) => ifs([[r, c]], s ?? r).map(parseNum).filter(x => x != null).reduce((a, b) => a + b, 0),
  SUMIFS: ([s, ...rest]) => ifs(pairsOf(rest, 0), s).map(parseNum).filter(x => x != null).reduce((a, b) => a + b, 0),
  COUNTIF: ([r, c]) => ifs([[r, c]]).length,
  COUNTIFS: (a) => ifs(pairsOf(a, 0)).length,
  AVERAGEIF: ([r, c, s]) => { const v = ifs([[r, c]], s ?? r).map(parseNum).filter(x => x != null); if (!v.length) throw E('#DIV/0!'); return v.reduce((a, b) => a + b, 0) / v.length; },
  AVERAGEIFS: ([s, ...rest]) => { const v = ifs(pairsOf(rest, 0), s).map(parseNum).filter(x => x != null); if (!v.length) throw E('#DIV/0!'); return v.reduce((a, b) => a + b, 0) / v.length; },
  MAXIFS: ([s, ...rest]) => { const v = ifs(pairsOf(rest, 0), s).map(parseNum).filter(x => x != null); return v.length ? Math.max(...v) : 0; },
  MINIFS: ([s, ...rest]) => { const v = ifs(pairsOf(rest, 0), s).map(parseNum).filter(x => x != null); return v.length ? Math.min(...v) : 0; },
  // dò tìm
  VLOOKUP: ([x, t, c, approx]) => {
    const T = to2D(t), k = num(c) - 1; if (k < 0) throw E('#VALUE!'); if (k >= (T[0]?.length || 0)) throw E('#REF!');
    if (approx === undefined || truthy(approx)) { let hit = -1; for (let i = 0; i < T.length; i++) { const r = cmpLook(T[i][0], x); if (r == null) continue; if (r <= 0) hit = i; else break; } if (hit < 0) throw E('#N/A'); return T[hit][k]; }
    for (const row of T) if (same(row[0], x)) return row[k];
    throw E('#N/A');
  },
  HLOOKUP: ([x, t, r, approx]) => { const T = to2D(t); const tr = T[0].map((_, j) => T.map(row => row[j])); return FN.VLOOKUP([x, tr, r, approx]); },
  MATCH: ([x, arr, type]) => {
    const v = vec(arr), ty = type === undefined ? 1 : num(type);
    if (ty === 0) { const i = v.findIndex(a => same(a, x)); if (i < 0) throw E('#N/A'); return i + 1; }
    let hit = -1;
    for (let i = 0; i < v.length; i++) { const r = cmpLook(v[i], x); if (r == null) continue; if (ty > 0 ? r <= 0 : r >= 0) hit = i; else break; }
    if (hit < 0) throw E('#N/A'); return hit + 1;
  },
  INDEX: ([arr, r, c]) => {
    const T = to2D(arr);
    let ri = num(r ?? 0), ci = c === undefined ? null : num(c);
    if (ci == null) { if (T.length === 1) { ci = ri; ri = 1; } else ci = 1; }
    if (ri === 0) { const col = T.map(row => [row[ci - 1]]); if (ci < 1 || ci > T[0].length) throw E('#REF!'); return col; }
    if (ci === 0) { if (ri < 1 || ri > T.length) throw E('#REF!'); return [T[ri - 1]]; }
    if (ri < 1 || ri > T.length || ci < 1 || ci > T[0].length) throw E('#REF!');
    return T[ri - 1][ci - 1];
  },
  XLOOKUP: ([x, look, ret, nf]) => { const L = vec(look), R = to2D(ret); const i = L.findIndex(a => same(a, x)); if (i < 0) { if (nf !== undefined) return nf; throw E('#N/A'); } return R.length === 1 ? R[0][i] : R[i].length === 1 ? R[i][0] : [R[i]]; },
  LOOKUP: ([x, look, res]) => { const L = vec(look), R = vec(res ?? look); let hit = -1; for (let i = 0; i < L.length; i++) { const r = cmpLook(L[i], x); if (r == null) continue; if (r <= 0) hit = i; else break; } if (hit < 0) throw E('#N/A'); return R[hit]; },
  CHOOSE: ([i, ...xs]) => { const k = num(i); if (k < 1 || k > xs.length) throw E('#VALUE!'); return xs[k - 1]; },
  // logic
  AND: (a) => flat(a).filter(v => !blank(v)).every(truthy),
  OR: (a) => flat(a).filter(v => !blank(v)).some(truthy),
  NOT: ([x]) => !truthy(x),
  XOR: (a) => flat(a).filter(v => !blank(v)).filter(truthy).length % 2 === 1,
  TRUE: () => true, FALSE: () => false,
  NA: () => { throw E('#N/A'); },
  ISNUMBER: ([x]) => typeof x === 'number',
  ISTEXT: ([x]) => typeof x === 'string' && x !== '',
  ISBLANK: ([x]) => blank(x),
  ISLOGICAL: ([x]) => typeof x === 'boolean',
  // chữ
  CONCATENATE: (a) => flat(a).map(str).join(''),
  CONCAT: (a) => flat(a).map(str).join(''),
  TEXTJOIN: ([d, ign, ...a]) => flat(a).filter(v => !(truthy(ign) && blank(v))).map(str).join(str(d)),
  LEFT: ([s, n]) => str(s).slice(0, num(n ?? 1)),
  RIGHT: ([s, n]) => { const t = str(s), k = num(n ?? 1); return k ? t.slice(-k) : ''; },
  MID: ([s, a, n]) => str(s).substr(num(a) - 1, num(n)),
  LEN: ([s]) => str(s).length,
  UPPER: ([s]) => str(s).toUpperCase(),
  LOWER: ([s]) => str(s).toLowerCase(),
  PROPER: ([s]) => str(s).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()),
  TRIM: ([s]) => str(s).trim().replace(/\s+/g, ' '),
  SUBSTITUTE: ([s, o, n]) => str(s).split(str(o)).join(str(n)),
  REPT: ([s, n]) => str(s).repeat(Math.max(0, num(n))),
  FIND: ([f, s, st]) => { const i = str(s).indexOf(str(f), num(st ?? 1) - 1); if (i < 0) throw E('#VALUE!'); return i + 1; },
  SEARCH: ([f, s, st]) => { const i = str(s).toLowerCase().indexOf(str(f).toLowerCase(), num(st ?? 1) - 1); if (i < 0) throw E('#VALUE!'); return i + 1; },
  VALUE: ([s]) => num(s),
  TEXT: ([v, f]) => textFmt(v, f),
  EXACT: ([a, b]) => str(a) === str(b),
  // ngày
  TODAY: () => dateToSerial(new Date().toISOString().slice(0, 10)),
  NOW: () => Date.now() / 864e5 + 25569,
  DATE: ([y, m, d]) => ymdToSerial(num(y), num(m), num(d)),
  YEAR: ([d]) => serialParts(num(d)).y,
  MONTH: ([d]) => serialParts(num(d)).m,
  DAY: ([d]) => serialParts(num(d)).d,
  WEEKDAY: ([d, t]) => { const w = serialParts(num(d)).wd; const ty = num(t ?? 1); return ty === 2 ? (w + 6) % 7 + 1 : ty === 3 ? (w + 6) % 7 : w + 1; },
  DAYS: ([e, s]) => Math.floor(num(e)) - Math.floor(num(s)),
  EDATE: ([d, m]) => { const p = serialParts(num(d)); return ymdToSerial(p.y, p.m + num(m), p.d); },
  EOMONTH: ([d, m]) => { const p = serialParts(num(d)); return ymdToSerial(p.y, p.m + num(m) + 1, 0); },
  WORKDAY: ([s, n, hol]) => workday(s, n, hol),
  NETWORKDAYS: ([s, e, hol]) => { let a = Math.floor(num(s)), b = Math.floor(num(e)), sg = 1; if (a > b) { [a, b] = [b, a]; sg = -1; } const H = new Set(vec(hol ?? []).map(parseNum).filter(x => x != null)); let c = 0; for (let d = a; d <= b; d++) { const w = serialParts(d).wd; if (w && w !== 6 && !H.has(d)) c++; } return c * sg; },
};
export const FUNCTIONS = Object.keys(FN).concat(['IF', 'IFERROR', 'IFNA', 'IFS', 'SWITCH', 'ISERROR', 'ISERR', 'ISNA']).sort();
const LAZY = {
  IF: (args, ev) => truthy(ev(args[0])) ? (args[1] ? ev(args[1]) : true) : (args[2] ? ev(args[2]) : false),
  IFERROR: (args, ev) => { try { const v = ev(args[0]); if (v instanceof FErr) throw v; return v; } catch (e) { if (e instanceof FErr) return args[1] ? ev(args[1]) : ''; throw e; } },
  IFNA: (args, ev) => { try { return ev(args[0]); } catch (e) { if (e instanceof FErr && e.code === '#N/A') return args[1] ? ev(args[1]) : ''; throw e; } },
  ISERROR: (args, ev) => { try { const v = ev(args[0]); return v instanceof FErr; } catch (e) { if (e instanceof FErr) return true; throw e; } },
  ISERR: (args, ev) => { try { ev(args[0]); return false; } catch (e) { if (e instanceof FErr) return e.code !== '#N/A'; throw e; } },
  ISNA: (args, ev) => { try { ev(args[0]); return false; } catch (e) { if (e instanceof FErr) return e.code === '#N/A'; throw e; } },
  IFS: (args, ev) => { for (let i = 0; i + 1 < args.length; i += 2) if (truthy(ev(args[i]))) return ev(args[i + 1]); throw E('#N/A'); },
  SWITCH: (args, ev) => { const x = ev(args[0]); let i = 1; for (; i + 1 < args.length; i += 2) if (same(ev(args[i]), x)) return ev(args[i + 1]); if (i < args.length) return ev(args[i]); throw E('#N/A'); },
};

// ---------- phân tích cú pháp ----------
const ERR_LIT = /^#(REF!|N\/A|DIV\/0!|VALUE!|NAME\?|NUM!|NULL!|CYCLE!)/;
function tokenize(s) {
  const t = []; let i = 0;
  while (i < s.length) {
    const rest = s.slice(i); let m;
    if (/^\s/.test(rest)) { i++; continue; }
    if ((m = rest.match(/^(?:\[([\w-]+)\])?\{([a-z0-9_]+)\}(\d+|@)?(?::\{([a-z0-9_]+)\}(\d+|@)?)?/i))) {
      if (m[4] !== undefined) { if ((m[3] === undefined) !== (m[5] === undefined)) throw E('#REF!'); t.push({ t: 'range', tid: m[1], a: [m[2], m[3]], b: [m[4], m[5]] }); }
      else if (m[3] !== undefined) t.push({ t: 'ref', tid: m[1], k: m[2], r: m[3] });
      else throw E('#REF!');
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/))) { t.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^"((?:[^"]|"")*)"/))) { t.push({ t: 'str', v: m[1].replace(/""/g, '"') }); i += m[0].length; continue; }
    if ((m = rest.match(ERR_LIT))) { t.push({ t: 'err', v: m[0] }); i += m[0].length; continue; }
    if ((m = rest.match(/^[A-Za-z_][A-Za-z0-9_.]*/))) { t.push({ t: 'id', v: m[0].toUpperCase() }); i += m[0].length; continue; }
    if ((m = rest.match(/^(<=|>=|<>|[-+*/^&=<>(),;%])/))) { t.push({ t: 'op', v: m[0] === ';' ? ',' : m[0] }); i += m[0].length; continue; }
    throw E('#NAME?');
  }
  return t;
}
function parse(tokens) {
  let p = 0;
  const isOp = (v) => tokens[p]?.t === 'op' && tokens[p].v === v;
  const eat = (v) => { if (!isOp(v)) throw E('#ERR!'); p++; };
  const bin = (next, ops) => () => { let l = next(); while (tokens[p]?.t === 'op' && ops.includes(tokens[p].v)) { const op = tokens[p++].v; l = { op, l, r: next() }; } return l; };
  const primary = () => {
    const tk = tokens[p++];
    if (!tk) throw E('#ERR!');
    if (tk.t === 'num') return { n: tk.v };
    if (tk.t === 'str') return { s: tk.v };
    if (tk.t === 'err') return { e: tk.v };
    if (tk.t === 'ref') return { ref: tk };
    if (tk.t === 'range') return { range: tk };
    if (tk.t === 'id') {
      if ((tk.v === 'TRUE' || tk.v === 'FALSE') && !isOp('(')) return { b: tk.v === 'TRUE' };
      if (!isOp('(')) throw E('#NAME?');
      p++; const args = [];
      if (!isOp(')')) { do { if (isOp(',') || isOp(')')) args.push({ s: '', missing: true }); else args.push(cmp()); } while (isOp(',') && ++p); }
      eat(')');
      if (!FN[tk.v] && !LAZY[tk.v]) throw E('#NAME?');
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
  if (!a) { try { a = parse(tokenize(src)); } catch (e) { a = { err: e instanceof FErr ? e : E('#ERR!') }; } astCache.set(src, a); if (astCache.size > 8000) astCache.clear(); }
  return a;
}
// Hàm có trong công thức mà web chưa hỗ trợ (để báo khi nhập Excel)
export function unsupportedIn(f) {
  if (!isFormula(f)) return [];
  const out = new Set();
  f.replace(/"(?:[^"]|"")*"/g, '').replace(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g, (m, n) => { n = n.toUpperCase().replace(/^_XLFN\.|^_XLWS\./, ''); if (!FN[n] && !LAZY[n]) out.add(n); return m; });
  return [...out];
}

// phép toán có thể áp lên mảng (vùng) từng phần tử
function lift2(l, r, fn) {
  if (!isArr(l) && !isArr(r)) return fn(l, r);
  const L = to2D(l), R = to2D(r);
  const rows = Math.max(L.length, R.length), cols = Math.max(L[0].length, R[0].length);
  const at = (A, i, j) => A[A.length === 1 ? 0 : i]?.[A[0].length === 1 ? 0 : j];
  return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => { try { const a = at(L, i, j), b = at(R, i, j); return a === undefined || b === undefined ? E('#N/A') : fn(a, b); } catch (e) { if (e instanceof FErr) return e; throw e; } }));
}
const lift1 = (v, fn) => isArr(v) ? to2D(v).map(row => row.map(x => { try { return fn(x); } catch (e) { if (e instanceof FErr) return e; throw e; } })) : fn(v);
function compare(op, l, r) {
  if (l instanceof FErr) throw l; if (r instanceof FErr) throw r;
  const ln = typeof l === 'number' ? l : (blank(l) ? (typeof r === 'number' ? 0 : null) : (typeof l === 'boolean' ? null : null));
  const rn = typeof r === 'number' ? r : (blank(r) ? (typeof l === 'number' ? 0 : null) : null);
  let A, B;
  if (ln != null && rn != null) { A = ln; B = rn; }
  else if (typeof l === 'boolean' || typeof r === 'boolean') { A = typeof l === 'boolean' ? +l : null; B = typeof r === 'boolean' ? +r : null; if (A == null || B == null) return op === '<>'; }
  else if (typeof l === 'number' || typeof r === 'number') { if (op === '=') return false; if (op === '<>') return true; return typeof l === 'number' ? op[0] === '<' : op[0] === '>'; }
  else { A = str(l).toLowerCase(); B = str(r).toLowerCase(); }
  return { '=': A === B, '<>': A !== B, '<': A < B, '>': A > B, '<=': A <= B, '>=': A >= B }[op];
}

function evalAst(a, ctx) {
  const { book, tid, ri } = ctx;
  const rowOf = (r) => (r === '@' ? ri : Number(r) - 1);
  const ev = (x) => {
    if (x.err) throw x.err;
    if ('n' in x) return x.n;
    if ('s' in x) return x.s;
    if ('b' in x) return x.b;
    if (x.e) throw E(x.e);
    if (x.ref) {
      const t = x.ref.tid || tid; const r = rowOf(x.ref.r); if (r < 0) throw E('#REF!');
      const v = book.get(t, r, x.ref.k); if (v instanceof FErr) throw v; return v;
    }
    if (x.range) {
      const t = x.range.tid || tid; const T = book.table(t); if (!T) throw E('#REF!');
      const keys = T.keysBetween(x.range.a[0], x.range.b[0]); if (!keys) throw E('#REF!');
      let r1, r2;
      if (x.range.a[1] === undefined) { r1 = 0; r2 = T.rows.length - 1; }
      else { r1 = rowOf(x.range.a[1]); r2 = rowOf(x.range.b[1]); if (r1 > r2) [r1, r2] = [r2, r1]; if (r1 < 0) throw E('#REF!'); r2 = Math.min(r2, Math.max(T.rows.length - 1, r1)); }
      const out = [];
      for (let r = r1; r <= r2; r++) out.push(keys.map(k => book.get(t, r, k)));
      if (!out.length) out.push(keys.map(() => ''));
      return out;
    }
    if (x.neg) return lift1(ev(x.neg), v => -num(v));
    if (x.pct) return lift1(ev(x.pct), v => num(v) / 100);
    if (x.fn) {
      if (LAZY[x.fn]) return LAZY[x.fn](x.args.filter(a => !a.missing || true), (arg) => arg.missing ? '' : ev(arg));
      return FN[x.fn](x.args.map(arg => arg.missing ? undefined : ev(arg)));
    }
    if (x.op) {
      const l = ev(x.l), r = ev(x.r);
      switch (x.op) {
        case '+': return lift2(l, r, (a, b) => num(a) + num(b));
        case '-': return lift2(l, r, (a, b) => num(a) - num(b));
        case '*': return lift2(l, r, (a, b) => num(a) * num(b));
        case '/': return lift2(l, r, (a, b) => { const d = num(b); if (d === 0) throw E('#DIV/0!'); return num(a) / d; });
        case '^': return lift2(l, r, (a, b) => num(a) ** num(b));
        case '&': return lift2(l, r, (a, b) => str(a) + str(b));
        default: return lift2(l, r, (a, b) => compare(x.op, a, b));
      }
    }
    throw E('#ERR!');
  };
  let v = ev(a);
  if (isArr(v)) { const T = to2D(v); v = T.length > 1 && T.length > ri && a.range?.a[1] === undefined ? T[ri][0] : T[0][0]; if (v === undefined) v = ''; }
  if (v instanceof FErr) throw v;
  if (typeof v === 'number' && !isFinite(v)) throw E('#NUM!');
  return v;
}

// =====================================================================
// TÍNH CẢ "SỔ" (các bảng trong cùng mục) – list: [{ id, name, columns, rows }]
// =====================================================================
export function computeBook(list) {
  const T = new Map();
  for (const t of list) {
    const byKey = new Map(t.columns.map((c, i) => [c.key, { c, i }]));
    T.set(t.id, { ...t, byKey, keysBetween: (k1, k2) => { const a = byKey.get(k1), b = byKey.get(k2); if (!a || !b) return null; const [lo, hi] = a.i <= b.i ? [a.i, b.i] : [b.i, a.i]; return t.columns.slice(lo, hi + 1).map(c => c.key); } });
  }
  const cache = new Map(), visiting = new Set();
  const book = { table: (id) => T.get(id) };
  book.get = (tid, ri, key) => {
    const t = T.get(tid); if (!t) return E('#REF!');
    if (ri < 0 || ri >= t.rows.length) return '';
    const id = tid + '|' + ri + '|' + key;
    if (cache.has(id)) return cache.get(id);
    const col = t.byKey.get(key);
    if (!col) return '';
    const raw = col.c.formula ? col.c.formula : t.rows[ri]?.cells?.[key];
    let v = raw ?? '';
    if (isFormula(raw)) {
      if (visiting.has(id)) return E('#CYCLE!');
      visiting.add(id);
      try { v = evalAst(compile(raw.trim().slice(1)), { book, tid, ri }); }
      catch (e) { v = e instanceof FErr ? e : E('#ERR!'); }
      visiting.delete(id);
    }
    cache.set(id, v);
    return v;
  };
  book.sheet = (tid) => {
    const t = T.get(tid);
    const get = (ri, key) => book.get(tid, ri, key);
    return {
      get,
      isComputed: (ri, key) => !!t?.byKey.get(key)?.c.formula || isFormula(t?.rows[ri]?.cells?.[key]),
      total: (key) => { if (!t) return null; let s = 0, any = false; for (let r = 0; r < t.rows.length; r++) { const v = get(r, key); const n = v instanceof FErr || typeof v === 'boolean' ? null : parseNum(v); if (n != null && v !== '') { s += n; any = true; } } return any ? s : null; },
    };
  };
  // Ngữ cảnh chuyển A1 ⇄ nội bộ cho bảng tid (tên sheet ⇄ id)
  book.ctx = (tid, offsetOf = () => 0) => ({
    selfId: tid, cols: T.get(tid)?.columns || [], offset: offsetOf(T.get(tid)),
    resolve: (name) => { const n = String(name).trim().toLowerCase(); const t = [...T.values()].find(x => String(x.name).trim().toLowerCase() === n); return t ? { id: t.id, cols: t.columns, offset: offsetOf(t) } : null; },
    info: (id) => { const t = T.get(id); return t ? { name: t.name, cols: t.columns, offset: offsetOf(t) } : null; },
  });
  return book;
}
export function computeSheet(columns, rows) { return computeBook([{ id: '_', name: '', columns, rows }]).sheet('_'); }

// ---------- hiển thị ----------
const nfCache = {};
const nfmt = (d) => (nfCache[d] ||= new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d }));
export const FORMATS = { auto: 'Tự động', int: 'Số nguyên', dec2: '2 chữ số thập phân', vnd: 'Tiền (đ)', pct: 'Phần trăm – nhập 15 = 15 %', pctx: 'Phần trăm kiểu Excel – 0,15 = 15 %', date: 'Ngày' };
export function fmtNumber(n, fmt = 'auto') {
  switch (fmt) {
    case 'int': return nfmt(0).format(round(n, 0));
    case 'dec2': return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    case 'vnd': return nfmt(0).format(round(n, 0)) + ' đ';
    case 'pct': return nfmt(2).format(n) + ' %';
    case 'pctx': return nfmt(2).format(n * 100) + ' %';
    case 'date': { const d = serialToISO(n); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`; }
    default: { const a = Math.abs(n); return nfmt(a !== 0 && a < 1 ? 6 : a < 100 ? 4 : 2).format(n); }
  }
}
export function fmtValue(v, col = {}) {
  if (v instanceof FErr) return v.code;
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'ĐÚNG' : 'SAI';
  if (isArr(v)) return fmtValue(to2D(v)[0][0], col);
  if (col.type === 'date' && typeof v === 'string' && ISO.test(v)) return fmtNumber(dateToSerial(v), 'date');
  const numeric = typeof v === 'number' || ((col.type === 'number' || col.formula || (col.fmt && col.fmt !== 'auto')) && parseNum(v) != null && typeof v !== 'string') || (col.type === 'number' && typeof v === 'string' && parseNum(v) != null && /^[-\d.,\s%]+$/.test(v));
  if (numeric) return fmtNumber(parseNum(v), col.fmt || 'auto');
  return String(v);
}
