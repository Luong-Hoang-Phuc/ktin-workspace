// =====================================================================
// NHẬP / XUẤT EXCEL cho một mục của Cơ sở dữ liệu
// Mỗi sheet ⇄ một bảng. Giữ hàm (kể cả hàm trỏ sang sheet khác).
// Chế độ bảng: "raw" = giữ nguyên số dòng như Excel (dòng 1 là dòng 1)
//              mặc định = dòng 1 của Excel là tên cột, dữ liệu từ dòng 2
// =====================================================================
import db, { logActivity } from '../db.js';
import { store, nameOf } from '../store.js';
import { h, toast, toastErr, modal, downloadNote } from '../ui.js';
import { a1ToInternal, internalToA1, isFormula, parseNum, dateToSerial, colLetter, letterIdx, unsupportedIn, FErr } from '../formula.js';
import { readXlsx, writeXlsx, safeSheetNames } from '../xlsx.js';
import { bookOf, offsetOf } from './book.js';
import { mergeMap } from './sheet.js';

const keyOf = (label, used) => { let k = String(label).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'cot'; let i = 2; const b = k; while (used.has(k)) k = b + i++; used.add(k); return k; };
const norm = (s) => String(s ?? '').trim().toLowerCase();

// ---------- XUẤT ----------
export async function exportExcel(data, filename) {
  if (!data.length) { toast('Mục này chưa có bảng nào', 'error'); return; }
  const B = bookOf(data);
  const names = safeSheetNames(data.map(d => d.table.name));
  const nameById = Object.fromEntries(data.map((d, i) => [d.table.id, names[i]]));
  const sheets = data.map(({ table: t, rows }, i) => {
    const off = offsetOf(t);
    const ctx = { selfId: t.id, cols: t.columns, offset: off, info: (id) => { const x = data.find(d => d.table.id === id)?.table; return x ? { name: nameById[id], cols: x.columns, offset: offsetOf(x) } : null; } };
    const out = [];
    if (off) out.push(t.columns.map((c, ci) => ({ v: c.label || colLetter(ci) })));
    rows.forEach((r, ri) => out.push(t.columns.map(c => {
      const raw = c.formula || r.cells?.[c.key];
      const fmt = r.cells?._f?.[c.key] || (c.type === 'date' ? 'date' : c.fmt);
      if (isFormula(raw)) {
        let v = B.get(t.id, ri, c.key);
        if (Array.isArray(v)) v = v[0]?.[0] ?? '';
        if (typeof v === 'string' && c.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) v = dateToSerial(v);
        return { f: internalToA1(raw, { ...ctx, ri }).slice(1), v: v instanceof FErr ? { code: v.code } : v, fmt };
      }
      let v = raw;
      if (v == null || v === '') return null;
      if (c.type === 'person') v = nameOf(v);
      else if (c.type === 'check') v = !!v;
      else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) v = dateToSerial(v);
      else if (typeof v === 'string' && c.type === 'number' && /^[-\d.,\s%]+$/.test(v) && parseNum(v) != null) v = parseNum(v);
      return { v, fmt };
    })));
    const merges = [...mergeMap(t.columns, rows).anchors.values()].map(m => `${colLetter(m.ci)}${m.ri + 1 + off}:${colLetter(m.ci + m.cs - 1)}${m.ri + m.rs + off}`);
    return { name: names[i], merges, rows: out, widths: t.columns.map(c => c.width || (c.type === 'number' ? 110 : 140)), bold: off ? new Set([0]) : null, freeze: off };
  });
  const blob = await writeXlsx(sheets);
  const a = h('a', { href: URL.createObjectURL(blob), download: filename.replace(/[\\/:*?"<>|]/g, '-') + '.xlsx' });
  document.body.append(a); a.click(); a.remove();
  downloadNote();
  logActivity(store.user, 'tải Excel', filename);
}

// ---------- NHẬP ----------
export function pickExcel(folder, data) {
  const inp = h('input', { type: 'file', accept: '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await importExcel(folder, data, f); } catch (er) { toastErr(er); }
  } });
  inp.click();
}

// Dòng 1 có phải dòng tên cột không?
function guessHeader(sh, allSheets) {
  if (sh.maxRow < 2) return false;
  const first = []; for (let c = 0; c < sh.maxCol; c++) { const x = sh.cells.get('0,' + c); if (x) first.push(x); }
  if (first.length < Math.max(1, Math.ceil(sh.maxCol * 0.5))) return false;
  if (!first.every(x => !x.f && typeof x.v === 'string' && x.v.trim())) return false;
  const own = /(^|[^A-Za-z0-9_.!'$])\$?[A-Z]{1,3}\$?1(?!\d)/;
  for (const x of sh.cells.values()) if (x.f && own.test(x.f.replace(/'[^']*'!\$?[A-Z]+\$?\d+|[A-Za-z_][\w.]*!\$?[A-Z]+\$?\d+/g, ''))) return false;
  const esc = sh.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const other = new RegExp(`(?:'${esc.replace(/'/g, "''")}'|${esc})!\\$?[A-Z]{1,3}\\$?1(?!\\d)`);
  for (const s of allSheets) if (s !== sh) for (const x of s.cells.values()) if (x.f && other.test(x.f)) return false;
  return true;
}
// Cột lớn nhất mà các công thức trỏ tới trên từng sheet (để không thiếu cột)
function referencedCols(sheets) {
  const max = new Map(sheets.map(s => [norm(s.name), s.maxCol]));
  const re = /(?:^|[^A-Za-z0-9_.])((?:'((?:[^']|'')+)'|([A-Za-z_À-￿][\w.À-￿]*))!)?\$?([A-Z]{1,3})(?:\$?\d+|:\$?([A-Z]{1,3})(?![\w(]))/g;
  for (const s of sheets) for (const x of s.cells.values()) {
    if (!x.f) continue;
    const f = x.f.replace(/"(?:[^"]|"")*"/g, '');
    let m; re.lastIndex = 0;
    while ((m = re.exec(f))) {
      const target = m[1] ? norm((m[2] ?? m[3]).replace(/''/g, "'")) : norm(s.name);
      if (!max.has(target)) continue;
      const c = Math.max(letterIdx(m[4]), m[5] ? letterIdx(m[5]) : 0) + 1;
      if (c <= 60) max.set(target, Math.max(max.get(target), c));
    }
  }
  return max;
}

export async function importExcel(folder, data, file) {
  const sheets = (await readXlsx(await file.arrayBuffer())).filter(s => s.maxRow > 0);
  if (!sheets.length) { toast('Tệp không có dữ liệu', 'error'); return; }
  const colMax = referencedCols(sheets);
  const existing = data.map(d => d.table);
  const plan = sheets.map(sh => {
    const formulas = [...sh.cells.values()].filter(x => x.f);
    return { sh, on: true, header: guessHeader(sh, sheets), target: existing.find(t => norm(t.name) === norm(sh.name))?.id || '', formulas: formulas.length, unsupported: [...new Set(formulas.flatMap(x => unsupportedIn(x.f)))] };
  });
  const unsupported = [...new Set(plan.flatMap(p => p.unsupported))];

  // ----- hộp thoại xem trước -----
  const rowsUI = plan.map(p => h('tr', {},
    h('td', {}, h('input', { type: 'checkbox', checked: p.on, onchange: (e) => { p.on = e.target.checked; } })),
    h('td', {}, h('b', {}, p.sh.name)),
    h('td', { class: 'small muted' }, `${p.sh.maxRow} dòng × ${colMax.get(norm(p.sh.name))} cột`, p.formulas ? ` · ${p.formulas} hàm` : ''),
    h('td', {}, h('label', { class: 'row small', style: { gap: '6px' } }, h('input', { type: 'checkbox', checked: p.header, onchange: (e) => { p.header = e.target.checked; } }), 'Dòng 1 là tên cột')),
    h('td', {}, h('select', { class: 'select', onchange: (e) => { p.target = e.target.value; } }, h('option', { value: '' }, 'Tạo bảng mới'), existing.map(t => h('option', { value: t.id, selected: p.target === t.id }, `Ghi đè “${t.name}”`))))));
  const body = h('div', { class: 'xl-import' },
    h('p', { class: 'small', style: { margin: '0 0 10px' } }, h('b', {}, file.name), ` – ${sheets.length} sheet`),
    h('div', { class: 'sv-scroll' }, h('table', { class: 'sv' }, h('tbody', {}, rowsUI))),
    unsupported.length ? h('div', { class: 'warn small' }, '⚠ Hàm web chưa tính được: ', h('b', {}, unsupported.join(', ')), ' – ô dùng hàm này sẽ báo #NAME?.') : null);
  const ok = await modal('Nhập tệp Excel', body, [{ label: 'Huỷ', value: null }, { label: 'Nhập', value: 'ok', primary: true }]);
  if (ok !== 'ok') return;
  const chosen = plan.filter(p => p.on);
  if (!chosen.length) return;
  toast('Đang nhập…');

  // ----- 1. tạo / ghi đè bảng, dựng cột -----
  const usedNames = new Set(existing.filter(t => !chosen.some(p => p.target === t.id)).map(t => norm(t.name)));
  const targets = [];
  for (const p of chosen) {
    const sh = p.sh, nCol = colMax.get(norm(sh.name)) || sh.maxCol, mode = p.header ? 'header' : 'raw';
    const used = new Set(); const startRow = p.header ? 1 : 0;
    const columns = Array.from({ length: nCol }, (_, c) => {
      const head = p.header ? sh.cells.get('0,' + c)?.v : '';
      const label = p.header ? (String(head ?? '').trim() || colLetter(c)) : '';
      const key = p.header ? keyOf(label, used) : colLetter(c).toLowerCase();
      let numeric = 0, text = 0; const fmts = {};
      for (let r = startRow; r < sh.maxRow; r++) { const x = sh.cells.get(r + ',' + c); if (!x) continue; if (x.f || typeof x.v === 'number') numeric++; else if (x.v !== '') text++; if (x.fmt) fmts[x.fmt] = (fmts[x.fmt] || 0) + 1; }
      const fmt = Object.entries(fmts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const col = { key, label, type: numeric && numeric >= text ? 'number' : 'text', sum: false };
      if (fmt && p.header) col.fmt = fmt;
      col.width = Math.min(360, Math.max(70, sh.widths[c] || (col.type === 'number' ? 110 : 140)));
      return col;
    });
    let name = sh.name.trim() || 'Sheet';
    const meta = { mode, source: file.name };
    let id = p.target;
    if (id) {
      await db.update('data_tables', id, { columns, meta, name: existing.find(t => t.id === id)?.name || name });
      const old = data.find(d => d.table.id === id)?.rows || [];
      if (old.length) await db.removeMany('data_rows', old.map(r => r.id));
      name = existing.find(t => t.id === id)?.name || name;
    } else {
      let n = name, i = 2; while (usedNames.has(norm(n))) n = `${name} (${i++})`; name = n;
      id = (await db.insert('data_tables', { folder_id: folder.id, name, columns, meta, created_by: store.user.id })).id;
    }
    usedNames.add(norm(name));
    targets.push({ p, id, name, columns, offset: mode === 'raw' ? 0 : 1, sheetName: sh.name });
  }

  // ----- 2. chuyển công thức & giá trị -----
  const others = existing.filter(t => !targets.some(x => x.id === t.id)).map(t => ({ id: t.id, names: [t.name], cols: t.columns, offset: offsetOf(t) }));
  const all = [...targets.map(t => ({ id: t.id, names: [t.name, t.sheetName], cols: t.columns, offset: t.offset })), ...others];
  const resolve = (name) => { const n = norm(name); const t = all.find(x => x.names.some(y => norm(y) === n)); return t ? { id: t.id, cols: t.cols, offset: t.offset } : null; };
  let nRows = 0, nF = 0;
  for (const t of targets) {
    const sh = t.p.sh, ctx = { selfId: t.id, cols: t.columns, offset: t.offset, resolve };
    const rows = [];
    for (let r = t.offset; r < sh.maxRow; r++) {
      const cells = {};
      t.columns.forEach((c, ci) => {
        const x = sh.cells.get(r + ',' + ci); if (!x) return;
        if (x.f) { cells[c.key] = a1ToInternal(x.f, ctx); nF++; }
        else cells[c.key] = x.v;
        if (x.fmt && x.fmt !== c.fmt) (cells._f ||= {})[c.key] = x.fmt;
      });
      rows.push({ table_id: t.id, position: r - t.offset, updated_by: store.user.id, cells });
    }
    if (rows.length) await db.insertMany('data_rows', rows);
    nRows += rows.length;
  }
  logActivity(store.user, `nhập Excel (${targets.length} trang tính)`, file.name);
  toast(`Đã nhập ${targets.length} trang tính · ${nRows} dòng · ${nF} hàm`, 'ok');
  return targets.map(t => t.id);
}
