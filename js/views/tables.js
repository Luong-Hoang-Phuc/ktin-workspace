import db, { logActivity } from '../db.js';
import { store, on, nameOf } from '../store.js';
import { h, toast, toastErr, prompt, confirmBox, modal, popMenu, fill } from '../ui.js';
import { TABLE_TEMPLATES } from './templates.js';

const TYPES = { text: 'Văn bản', number: 'Số', select: 'Lựa chọn', person: 'Thành viên', date: 'Ngày', check: 'Hộp kiểm' };
const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 });
const toNum = (v) => { if (v === '' || v == null) return null; if (typeof v === 'number') return v; const s = String(v).trim().replace(/\s/g, ''); const n = Number(/,\d{1,4}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/[.,](?=\d{3}(\D|$))/g, '')); return isNaN(n) ? null : n; };
const keyOf = (label, cols) => { let k = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'cot'; let i = 2, base = k; while (cols.some(c => c.key === k)) k = base + i++; return k; };

export function mountTables(el, { folder, sub, go }) {
  let tables = [], cur = null, rows = [];
  const offs = [];
  const wrap = h('div', { class: 'dt-wrap' });
  el.append(wrap);
  const pills = h('div', { class: 'dt-list' });
  const tools = h('div', { class: 'toolbar' });
  const gridBox = h('div');
  wrap.append(pills, tools, gridBox);
  const room = db.room(`table-${folder.id}`, onRoom);
  const editing = new Map(); // `${rowId}:${key}` → tên người đang sửa

  function renderPills() {
    fill(pills, 
      tables.map(t => h('button', { class: `dt-pill ${cur?.id === t.id ? 'on' : ''}`, onclick: () => openTable(t.id) }, '📊 ', t.name)),
      h('button', { class: 'btn btn-sm', onclick: (e) => popMenu(e.currentTarget, Object.keys(TABLE_TEMPLATES).map(k => ({ icon: k === 'Bảng trống' ? '＋' : '📋', label: k === 'Bảng trống' ? k : 'Mẫu: ' + k, run: () => createTable(k) }))) }, '＋ Bảng mới ▾'));
  }
  function renderTools() {
    if (!cur) { fill(tools, ); return; }
    fill(tools, 
      h('h3', { style: { margin: 0, fontSize: '17px' } }, cur.name),
      h('span', { class: 'small muted' }, `${rows.length} dòng`),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn btn-sm', onclick: () => addRow() }, '＋ Dòng'),
      h('button', { class: 'btn btn-sm', onclick: addColumn }, '＋ Cột'),
      h('button', { class: 'btn btn-sm', onclick: exportCsv }, '⬇️ CSV (mở bằng Excel)'),
      h('button', { class: 'btn btn-sm', onclick: importCsv }, '⬆️ Nhập CSV'),
      h('button', { class: 'icon-btn', onclick: (e) => popMenu(e.currentTarget, [
        { icon: '✏️', label: 'Đổi tên bảng', run: async () => { const n = await prompt('Đổi tên bảng', 'Tên', cur.name); if (n) db.update('data_tables', cur.id, { name: n }).catch(toastErr); } },
        '-',
        { icon: '🗑️', label: 'Xoá bảng', danger: true, run: async () => { if (await confirmBox('Xoá bảng?', `Xoá “${cur.name}” và toàn bộ dữ liệu?`)) { try { await db.remove('data_tables', cur.id); logActivity(store.user, 'xoá bảng', cur.name); tables = tables.filter(t => t.id !== cur.id); openTable(tables[0]?.id); } catch (e) { toastErr(e); } } } },
      ]) }, '⋯'));
  }

  // ---------- lưới ----------
  function renderGrid() {
    if (!cur) { fill(gridBox, h('div', { class: 'empty' }, h('div', { class: 'big' }, '📊'), h('p', {}, 'Chưa có bảng dữ liệu trong thư mục này.'), h('p', { class: 'small' }, 'Tạo từ mẫu: Dữ liệu máy (đã điền sẵn từ CSDL), Thông số hộp/sách, Giá vật tư, Phân công công việc.'))); return; }
    const cols = cur.columns || [];
    const sums = cols.map(c => c.type === 'number' ? rows.reduce((s, r) => s + (toNum(r.cells?.[c.key]) || 0), 0) : null);
    const table = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', { class: 'idx' }, '#'), cols.map((c, i) => h('th', { style: { minWidth: (c.width || 130) + 'px' } }, h('div', { class: 'th' }, h('span', {}, c.label), h('span', { class: 'small muted', style: { flex: 'none' } }, c.type === 'number' ? '#' : c.type === 'date' ? '📅' : c.type === 'person' ? '👤' : c.type === 'select' ? '▾' : c.type === 'check' ? '☑' : ''), h('button', { class: 'icon-btn', onclick: (e) => colMenu(i, e.currentTarget) }, '⋯')))), h('th', { style: { width: '36px' } }))),
      h('tbody', {}, rows.map((r, ri) => h('tr', { 'data-row': r.id }, h('td', { class: 'idx' }, ri + 1), cols.map(c => cell(r, c)), h('td', { style: { minWidth: '36px', textAlign: 'center' } }, h('button', { class: 'icon-btn row-del', title: 'Xoá dòng', onclick: () => delRow(r) }, '✕'))))),
      sums.some(s => s != null) ? h('tfoot', {}, h('tr', {}, h('td', { class: 'idx' }, 'Σ'), sums.map((s, i) => h('td', { class: cols[i].type === 'number' ? 'num' : '' }, h('div', { class: 'cell', style: { fontWeight: 600, color: '#475467' } }, s == null ? '' : nf.format(s)))), h('td'))) : null);
    fill(gridBox, h('div', { class: 'grid-scroll' }, table),
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn btn-sm', onclick: () => addRow() }, '＋ Thêm dòng'), h('span', { class: 'small muted' }, 'Nhấp vào ô để sửa · Enter để lưu · Shift+Enter xuống dòng · Thay đổi hiện ngay cho cả nhóm')));
  }
  function cell(r, c) {
    const v = r.cells?.[c.key] ?? '';
    const td = h('td', { class: c.type === 'number' ? 'num' : '', 'data-key': c.key });
    const who = editing.get(`${r.id}:${c.key}`);
    if (who) td.style.boxShadow = 'inset 0 0 0 2px #f59e0b', td.title = `${who} đang sửa`;
    const set = (val) => saveCell(r, c.key, val);
    if (c.type === 'select' || c.type === 'person') {
      const opts = c.type === 'person' ? [...store.profiles.values()].map(p => [p.id, p.display_name || p.email]) : (c.options || []).map(o => [o, o]);
      td.append(h('select', { class: 'cell', onchange: (e) => set(e.target.value) }, h('option', { value: '' }, ''), opts.map(([val, label]) => h('option', { value: val, selected: v === val }, label)),
        c.type === 'select' && v && !(c.options || []).includes(v) ? h('option', { value: v, selected: true }, v) : null));
    } else if (c.type === 'date') {
      td.append(h('input', { class: 'cell', type: 'date', value: v, style: { border: 0, width: '100%', background: 'transparent' }, onchange: (e) => set(e.target.value) }));
    } else if (c.type === 'check') {
      td.append(h('div', { class: 'cell', style: { textAlign: 'center' } }, h('input', { type: 'checkbox', checked: !!v, onchange: (e) => set(e.target.checked) })));
    } else {
      const shown = c.type === 'number' && toNum(v) != null ? nf.format(toNum(v)) : v;
      const div = h('div', { class: 'cell', contenteditable: 'plaintext-only', spellcheck: false }, shown);
      div.addEventListener('focus', () => { div.textContent = v; room.send({ t: 'edit', k: `${r.id}:${c.key}`, name: store.me?.display_name }); });
      div.addEventListener('blur', () => { room.send({ t: 'done', k: `${r.id}:${c.key}` }); let nv = div.textContent.replace(/\n$/, ''); if (c.type === 'number') nv = toNum(nv) ?? (nv.trim() ? nv : ''); if (String(nv) !== String(v)) set(nv); else div.textContent = shown; });
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); div.blur(); const next = td.parentElement.nextElementSibling?.querySelector(`td[data-key="${c.key}"] .cell`); next?.focus(); }
        if (e.key === 'Escape') { div.textContent = v; div.blur(); }
      });
      div.addEventListener('paste', (e) => { const t = e.clipboardData.getData('text'); if (t.includes('\t') || t.split('\n').length > 2) { e.preventDefault(); pasteGrid(r, c, t); } });
      td.append(div);
    }
    return td;
  }

  // ---------- dữ liệu ----------
  async function saveCell(r, key, val) {
    const cells = { ...(r.cells || {}), [key]: val };
    r.cells = cells;
    try { await db.update('data_rows', r.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() }); }
    catch (e) { toastErr(e); }
    if (!gridBox.contains(document.activeElement)) renderGrid();
  }
  async function addRow(cells = {}) {
    try {
      const pos = rows.length ? Math.max(...rows.map(r => r.position || 0)) + 1 : 0;
      const r = await db.insert('data_rows', { table_id: cur.id, cells, position: pos, updated_by: store.user.id });
      if (!rows.some(x => x.id === r.id)) rows.push(r);
      renderGrid(); renderTools();
      setTimeout(() => gridBox.querySelector(`tr[data-row="${r.id}"] .cell[contenteditable]`)?.focus(), 30);
    } catch (e) { toastErr(e); }
  }
  async function delRow(r) {
    if (Object.values(r.cells || {}).some(v => v !== '' && v != null && v !== false) && !await confirmBox('Xoá dòng?', 'Dòng này có dữ liệu. Xoá luôn?')) return;
    rows = rows.filter(x => x.id !== r.id); renderGrid(); renderTools();
    db.remove('data_rows', r.id).catch(toastErr);
  }
  async function saveColumns(columns) { cur.columns = columns; renderGrid(); try { await db.update('data_tables', cur.id, { columns }); } catch (e) { toastErr(e); } }
  async function addColumn() {
    const r = await colDialog({ label: '', type: 'text', options: [] });
    if (r) saveColumns([...(cur.columns || []), { key: keyOf(r.label, cur.columns || []), ...r }]);
  }
  async function colDialog(c) {
    const label = h('input', { class: 'input', value: c.label, placeholder: 'VD: Năng suất' });
    const type = h('select', { class: 'select' }, Object.entries(TYPES).map(([k, v]) => h('option', { value: k, selected: c.type === k }, v)));
    const opts = h('input', { class: 'input', value: (c.options || []).join(', '), placeholder: 'VD: Chưa làm, Đang làm, Xong' });
    const optField = h('label', { class: 'field' }, h('span', {}, 'Các lựa chọn (cách nhau bởi dấu phẩy)'), opts);
    const sync = () => optField.style.display = type.value === 'select' ? '' : 'none'; type.onchange = sync; sync();
    const r = await modal(c.label ? 'Sửa cột' : 'Thêm cột', h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Tên cột'), label), h('label', { class: 'field' }, h('span', {}, 'Kiểu dữ liệu'), type), optField), [{ label: 'Huỷ', value: null }, { label: 'Lưu', value: 'ok', primary: true }]);
    if (r !== 'ok' || !label.value.trim()) return null;
    return { label: label.value.trim(), type: type.value, options: type.value === 'select' ? opts.value.split(',').map(s => s.trim()).filter(Boolean) : undefined, width: c.width };
  }
  function colMenu(i, anchor) {
    const cols = [...cur.columns];
    popMenu(anchor, [
      { icon: '✏️', label: 'Sửa cột (tên, kiểu)', run: async () => { const r = await colDialog(cols[i]); if (r) { cols[i] = { ...cols[i], ...r }; saveColumns(cols); } } },
      { icon: '⬅️', label: 'Chuyển sang trái', run: () => { if (i > 0) { [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; saveColumns(cols); } } },
      { icon: '➡️', label: 'Chuyển sang phải', run: () => { if (i < cols.length - 1) { [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; saveColumns(cols); } } },
      { icon: '↔️', label: 'Rộng hơn', run: () => { cols[i] = { ...cols[i], width: (cols[i].width || 130) + 60 }; saveColumns(cols); } },
      { icon: '↕️', label: 'Hẹp hơn', run: () => { cols[i] = { ...cols[i], width: Math.max(70, (cols[i].width || 130) - 40) }; saveColumns(cols); } },
      { icon: '🔤', label: 'Sắp xếp theo cột này', run: () => sortBy(cols[i]) },
      '-',
      { icon: '🗑️', label: 'Xoá cột', danger: true, run: async () => { if (await confirmBox('Xoá cột?', `Xoá cột “${cols[i].label}”? Dữ liệu trong cột sẽ bị ẩn.`)) { cols.splice(i, 1); saveColumns(cols); } } },
    ]);
  }
  async function sortBy(c) {
    const val = (r) => c.type === 'number' ? (toNum(r.cells?.[c.key]) ?? Infinity) : String(r.cells?.[c.key] ?? '');
    rows.sort((a, b) => { const x = val(a), y = val(b); return typeof x === 'number' ? x - y : x.localeCompare(y, 'vi'); });
    renderGrid();
    try { await Promise.all(rows.map((r, i) => r.position !== i ? db.update('data_rows', r.id, { position: i }).then(() => { r.position = i; }) : null)); } catch (e) { toastErr(e); }
  }
  async function pasteGrid(r, c, text) {
    const lines = text.replace(/\r/g, '').split('\n').filter((l, i, a) => l !== '' || i < a.length - 1);
    const cols = cur.columns; const ci = cols.findIndex(x => x.key === c.key); let ri = rows.findIndex(x => x.id === r.id);
    for (const line of lines) {
      const vals = line.split('\t');
      let row = rows[ri];
      const cells = { ...(row?.cells || {}) };
      vals.forEach((v, j) => { const col = cols[ci + j]; if (col) cells[col.key] = col.type === 'number' ? (toNum(v) ?? v) : v; });
      if (row) { row.cells = cells; await db.update('data_rows', row.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() }).catch(toastErr); }
      else { const pos = rows.length ? Math.max(...rows.map(x => x.position || 0)) + 1 : 0; const nr = await db.insert('data_rows', { table_id: cur.id, cells, position: pos, updated_by: store.user.id }).catch(toastErr); if (nr && !rows.some(x => x.id === nr.id)) rows.push(nr); }
      ri++;
    }
    renderGrid(); renderTools(); toast(`Đã dán ${lines.length} dòng`, 'ok');
  }
  function exportCsv() {
    const cols = cur.columns;
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const disp = (r, c) => { const v = r.cells?.[c.key]; if (c.type === 'person') return nameOf(v); if (c.type === 'check') return v ? 'x' : ''; return v ?? ''; };
    const csv = [cols.map(c => q(c.label)).join(','), ...rows.map(r => cols.map(c => q(disp(r, c))).join(','))].join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })), download: cur.name + '.csv' }); a.click();
  }
  function importCsv() {
    const inp = h('input', { type: 'file', accept: '.csv,text/csv', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const text = (await f.text()).replace(/^﻿/, '');
      const parsed = parseCsv(text); if (parsed.length < 2) { toast('File CSV trống', 'error'); return; }
      const [head, ...body] = parsed;
      const cols = [...cur.columns];
      const map = head.map(lbl => { let c = cols.find(x => x.label.toLowerCase() === lbl.trim().toLowerCase()); if (!c) { c = { key: keyOf(lbl, cols), label: lbl.trim() || 'Cột', type: 'text' }; cols.push(c); } return c; });
      if (cols.length !== cur.columns.length) await saveColumns(cols);
      let pos = rows.length ? Math.max(...rows.map(x => x.position || 0)) + 1 : 0;
      const newRows = body.filter(r => r.some(v => v.trim())).map(r => ({ table_id: cur.id, position: pos++, updated_by: store.user.id, cells: Object.fromEntries(map.map((c, j) => [c.key, c.type === 'number' ? (toNum(r[j]) ?? r[j] ?? '') : (r[j] ?? '')])) }));
      try { const ins = await db.insertMany('data_rows', newRows); ins.forEach(r => { if (!rows.some(x => x.id === r.id)) rows.push(r); }); renderGrid(); renderTools(); toast(`Đã nhập ${ins.length} dòng`, 'ok'); logActivity(store.user, `nhập ${ins.length} dòng vào`, cur.name); } catch (er) { toastErr(er); }
    } });
    inp.click();
  }
  function parseCsv(t) {
    const sep = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const out = []; let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(f); f = ''; } else if (ch === '\n') { row.push(f.replace(/\r$/, '')); out.push(row); row = []; f = ''; } else f += ch;
    }
    if (f || row.length) { row.push(f); out.push(row); }
    return out;
  }

  async function createTable(tpl) {
    const T = TABLE_TEMPLATES[tpl];
    const name = await prompt('Bảng dữ liệu mới', 'Tên bảng', tpl === 'Bảng trống' ? '' : tpl);
    if (!name) return;
    try {
      const t = await db.insert('data_tables', { folder_id: folder.id, name, columns: T.columns, created_by: store.user.id });
      if (T.rows.length) await db.insertMany('data_rows', T.rows.map((vals, i) => ({ table_id: t.id, position: i, updated_by: store.user.id, cells: Object.fromEntries(T.columns.map((c, j) => [c.key, vals[j] ?? ''])) })));
      logActivity(store.user, 'tạo bảng dữ liệu', name);
      if (!tables.some(x => x.id === t.id)) tables.push(t);
      openTable(t.id);
    } catch (e) { toastErr(e); }
  }

  let offRows = null;
  async function openTable(id) {
    offRows?.(); editing.clear();
    cur = tables.find(t => t.id === id) || null;
    go(cur?.id || null);
    rows = cur ? await db.select('data_rows', { eq: { table_id: cur.id }, order: ['position', true] }).catch((e) => { toastErr(e); return []; }) : [];
    renderPills(); renderTools(); renderGrid();
    if (!cur) return;
    offRows = db.subscribe('data_rows', ['table_id', cur.id], (e) => {
      if (e.type === 'DELETE') { if (!rows.some(r => r.id === e.old.id)) return; rows = rows.filter(r => r.id !== e.old.id); }
      else {
        const i = rows.findIndex(r => r.id === e.new.id);
        const changed = i >= 0 ? Object.keys(e.new.cells || {}).filter(k => JSON.stringify(e.new.cells[k]) !== JSON.stringify(rows[i].cells?.[k])) : [];
        if (i >= 0) rows[i] = e.new; else rows.push(e.new);
        rows.sort((a, b) => (a.position || 0) - (b.position || 0));
        const focused = document.activeElement?.closest?.('td');
        if (focused && gridBox.contains(focused)) { // đang gõ: chỉ cập nhật ô khác
          const tr = focused.parentElement; const fk = focused.getAttribute('data-key');
          if (tr.getAttribute('data-row') === e.new.id && changed.includes(fk)) toast(`${nameOf(e.new.updated_by)} vừa sửa ô bạn đang gõ`, 'error');
          renderTools(); return;
        }
        renderGrid();
        if (e.new.updated_by !== store.user.id) changed.forEach(k => gridBox.querySelector(`tr[data-row="${e.new.id}"] td[data-key="${k}"]`)?.classList.add('flash'));
        renderTools(); return;
      }
      if (!gridBox.contains(document.activeElement)) renderGrid();
      renderTools();
    });
  }
  function onRoom(m) {
    if (m.t === 'edit') editing.set(m.k, m.name); else if (m.t === 'done') editing.delete(m.k); else return;
    const [rid, key] = m.k.split(':');
    const td = gridBox.querySelector(`tr[data-row="${rid}"] td[data-key="${key}"]`);
    if (td) { td.style.boxShadow = m.t === 'edit' ? 'inset 0 0 0 2px #f59e0b' : ''; td.title = m.t === 'edit' ? `${m.name} đang sửa` : ''; }
  }

  (async () => {
    try {
      tables = await db.select('data_tables', { eq: { folder_id: folder.id }, order: ['created_at', true] });
      await openTable((tables.find(t => t.id === sub) || tables[0])?.id);
    } catch (e) { toastErr(e); }
  })();
  offs.push(db.subscribe('data_tables', ['folder_id', folder.id], (e) => {
    if (e.type === 'DELETE') { if (!tables.some(t => t.id === e.old.id)) return; tables = tables.filter(t => t.id !== e.old.id); if (cur?.id === e.old.id) openTable(tables[0]?.id); else renderPills(); return; }
    const i = tables.findIndex(t => t.id === e.new.id); if (i >= 0) tables[i] = e.new; else tables.push(e.new);
    if (cur?.id === e.new.id) { cur = e.new; if (!gridBox.contains(document.activeElement)) renderGrid(); renderTools(); }
    renderPills();
  }));
  offs.push(on('profiles', () => cur && renderGrid()));
  return () => { offs.forEach(f => f()); offRows?.(); room.close(); };
}
