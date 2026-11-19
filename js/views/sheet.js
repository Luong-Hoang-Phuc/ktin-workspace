// =====================================================================
// BẢNG TÍNH KIỂU EXCEL (Cơ sở dữ liệu) + bản xem chỉ đọc (Trang xem)
// - Chữ cột A, B, C… và số dòng 1, 2, 3…; gõ công thức =C3*D3, =SUM(G1:G9), =IF(...)
// - Cột công thức: áp dụng cho cả cột, @ = dòng hiện tại (VD: =D@*E@)
// - Thanh công thức như Excel; chèn/xoá dòng tự dịch tham chiếu
// =====================================================================
import db, { logActivity } from '../db.js';
import { store, on, nameOf } from '../store.js';
import { h, toast, toastErr, prompt, confirmBox, modal, popMenu, fill, downloadNote } from '../ui.js';
import { computeSheet, internalToA1, a1ToInternal, shiftRefs, isFormula, parseNum, fmtValue, colLetter, FORMATS, FErr } from '../formula.js';
import { watchSheets, bookOf } from './book.js';
import { exportExcel, pickExcel } from './excel.js';
import { BLANK_SHEET, sheetRows } from './templates.js';

const TYPES = { text: 'Văn bản', number: 'Số', formula: 'Công thức (cả cột)', select: 'Lựa chọn', person: 'Thành viên', date: 'Ngày', check: 'Hộp kiểm' };
const keyOf = (label, cols) => { let k = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'cot'; let i = 2; const base = k; while (cols.some(c => c.key === k)) k = base + i++; return k; };
const sorted = (rows) => [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
const showsSum = (c) => (c.type === 'number' || c.formula) && c.sum !== false && c.fmt !== 'date';
const cellText = (c, v) => c.type === 'person' ? nameOf(v) : c.type === 'check' ? (v ? '✓' : '') : fmtValue(v, c);

// =====================================================================
// Nhiều bảng trong một mục: thanh tab (tab cố định + các bảng + “＋ Bảng mới”)
// =====================================================================
export function mountSheets(el, { folder, sub, go, fixed = [], templates = [], intro, title = 'Bảng tính' }) {
  let tables = [], curKey = null, curCleanup = null;
  const book = { data: [], subs: new Set() };
  const offBook = watchSheets(folder.id, (d) => { book.data = d; book.subs.forEach(f => f()); });
  const wrap = h('div', { class: 'dt-wrap' });
  const tabs = h('div', { class: 'dt-list' });
  const body = h('div', { class: 'dt-body' });
  wrap.append(intro || '', tabs, body);
  el.append(wrap);

  const keys = () => [...fixed.map(f => f.key), ...tables.map(t => t.id)];
  function renderTabs() {
    fill(tabs,
      fixed.map(f => h('button', { class: `dt-pill fixed ${curKey === f.key ? 'on' : ''}`, onclick: () => open(f.key) }, f.label)),
      tables.map(t => h('button', { class: `dt-pill ${curKey === t.id ? 'on' : ''}`, onclick: () => open(t.id) }, '▦ ', t.name)),
      h('button', { class: 'btn btn-sm', onclick: (e) => popMenu(e.currentTarget, [{ icon: '＋', label: 'Bảng trống', run: () => create(BLANK_SHEET) }, ...(templates.length ? ['-'] : []), ...templates.map(T => ({ icon: '▦', label: 'Mẫu: ' + T.name, run: () => create(T) }))]) }, '＋ Bảng mới ▾'),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn btn-sm btn-xl', title: 'Nhập tệp Excel (.xlsx) – mỗi trang tính thành một bảng, giữ nguyên hàm', onclick: () => pickExcel(folder, book.data) }, '⬆ Nhập Excel'),
      h('button', { class: 'btn btn-sm btn-xl', title: 'Tải toàn bộ bảng của mục này thành tệp Excel (.xlsx) có hàm', onclick: () => exportExcel(book.data, title) }, '⬇ Tải Excel'));
  }
  function open(key) {
    if (!keys().includes(key)) key = keys()[0] ?? null;
    curCleanup?.(); curCleanup = null;
    curKey = key; go?.(key); renderTabs();
    fill(body);
    if (key == null) { fill(body, h('div', { class: 'empty' }, h('div', { class: 'big' }, '▦'), h('p', {}, 'Chưa có bảng nào trong mục này.'), h('p', { class: 'small' }, 'Bấm “＋ Bảng mới” để tạo bảng trống hoặc từ mẫu đã đặt sẵn công thức.'))); return; }
    const f = fixed.find(x => x.key === key);
    if (f) { curCleanup = f.mount(body) || null; return; }
    curCleanup = mountSheet(body, { table: tables.find(t => t.id === key), book, onDeleted: () => { tables = tables.filter(t => t.id !== key); open(keys()[0]); } });
  }
  async function create(T) {
    const name = await prompt('Bảng mới', 'Tên bảng', T === BLANK_SHEET ? '' : T.name);
    if (!name) return;
    try {
      const t = await db.insert('data_tables', { folder_id: folder.id, name, columns: T.columns, created_by: store.user.id });
      const rows = sheetRows(T);
      if (rows.length) await db.insertMany('data_rows', rows.map((cells, i) => ({ table_id: t.id, position: i, updated_by: store.user.id, cells })));
      logActivity(store.user, 'tạo bảng', name);
      if (!tables.some(x => x.id === t.id)) tables.push(t);
      open(t.id);
    } catch (e) { toastErr(e); }
  }
  const off = db.subscribe('data_tables', ['folder_id', folder.id], (e) => {
    if (e.type === 'DELETE') { if (!tables.some(t => t.id === e.old.id)) return; tables = tables.filter(t => t.id !== e.old.id); if (curKey === e.old.id) open(keys()[0]); else renderTabs(); return; }
    const i = tables.findIndex(t => t.id === e.new.id); if (i >= 0) tables[i] = e.new; else tables.push(e.new);
    renderTabs();
  });
  (async () => {
    try { tables = await db.select('data_tables', { eq: { folder_id: folder.id }, order: ['created_at', true] }); open(sub && keys().includes(sub) ? sub : keys()[0]); }
    catch (e) { toastErr(e); }
  })();
  return () => { off(); offBook(); curCleanup?.(); };
}

// =====================================================================
// Một bảng tính
// =====================================================================
export function mountSheet(el, { table, tableId, compact = false, onDeleted, book }) {
  let cur = table || null, rows = [], comp = null, sel = null; // sel = { ri, key }
  const offs = [];
  const tools = h('div', { class: 'toolbar sheet-tools' });
  const gridBox = h('div');
  el.append(h('div', { class: 'sheet' }, tools, gridBox));
  const room = db.room(`table-${tableId || table?.id}`, onRoom);
  const editing = new Map();
  const cols = () => cur?.columns || [];
  let bctx = { cols: [], offset: 0 };
  const recompute = () => { const B = bookOf(book?.data || [], { table: { ...cur, columns: cols() }, rows }); comp = B.sheet(cur.id); bctx = B.ctx(cur.id); };
  const toDisplay = (f) => internalToA1(f, { ...bctx, cols: cols(), offset: 0 });
  const toInternal = (t, cs) => a1ToInternal(t, { ...bctx, cols: cs || cols(), offset: 0 });
  const onBook = () => { if (cur) refreshValues(); };
  book?.subs.add(onBook);

  // ---------- thanh công cụ ----------
  function renderTools() {
    if (!cur) { fill(tools); return; }
    fill(tools,
      h('div', { class: 'grow' }),
      h('button', { class: 'btn btn-sm', onclick: () => addRow(rows.length) }, '＋ Dòng'),
      h('button', { class: 'btn btn-sm', onclick: () => addColumn(cols().length) }, '＋ Cột'),
      h('button', { class: 'icon-btn', onclick: (e) => popMenu(e.currentTarget, [
        { icon: '✏️', label: 'Đổi tên bảng', run: async () => { const n = await prompt('Đổi tên bảng', 'Tên', cur.name); if (n) db.update('data_tables', cur.id, { name: n }).catch(toastErr); } },
        { icon: 'ƒ', label: 'Cách viết công thức', run: helpFormula },
        { icon: '⬇', label: 'Tải bảng này dạng CSV', run: exportCsv },
        { icon: '⬆', label: 'Nhập thêm dòng từ CSV', run: importCsv },
        '-',
        { icon: '🗑️', label: 'Xoá bảng', danger: true, run: async () => { if (await confirmBox('Xoá bảng?', `Xoá “${cur.name}” và toàn bộ dữ liệu?`)) { try { await db.remove('data_tables', cur.id); logActivity(store.user, 'xoá bảng', cur.name); onDeleted?.(); } catch (e) { toastErr(e); } } } },
      ]) }, '⋯'));
  }

  // ---------- thanh công thức ----------
  function rawOf(ri, key) {
    const c = cols().find(x => x.key === key); if (!c) return '';
    if (c.formula) return toDisplay(c.formula);
    const v = rows[ri]?.cells?.[key];
    if (isFormula(v)) return toDisplay(v);
    return v == null ? '' : typeof v === 'boolean' ? (v ? 'ĐÚNG' : '') : String(v);
  }
  function setSel(ri, key) {
    sel = ri == null ? null : { ri, key };
    gridBox.querySelectorAll('td.sel').forEach(td => td.classList.remove('sel'));
    if (sel) gridBox.querySelector(`tr[data-i="${ri}"] td[data-key="${key}"]`)?.classList.add('sel');
  }

  const parseInput = (c, text) => {
    const t = String(text ?? '').replace(/\n$/, '');
    if (isFormula(t)) return toInternal(t);
    if (c.type === 'number') return parseNum(t) ?? (t.trim() ? t : '');
    return t;
  };

  // ---------- lưới ----------
  function renderGrid() {
    if (!cur) { fill(gridBox, h('div', { class: 'empty' }, 'Không tìm thấy bảng.')); return; }
    recompute();
    const cs = cols();
    const table = h('table', { class: 'grid xl' },
      h('thead', {}, h('tr', {}, h('th', { class: 'idx corner' }, ''),
        cs.map((c, i) => h('th', { style: { minWidth: (c.width || (c.type === 'number' ? 110 : 130)) + 'px' }, class: c.formula ? 'fx' : '' },
          h('div', { class: 'th' }, h('span', { class: 'colL' }, colLetter(i)), h('span', { class: 'lbl', title: c.formula ? 'Cột công thức: ' + toDisplay(c.formula) : c.label }, c.label),
            c.formula ? h('span', { class: 'ty' }, 'ƒ') : null,
            h('button', { class: 'icon-btn', title: 'Tuỳ chọn cột', onclick: (e) => colMenu(i, e.currentTarget) }, '▾')))))),
      h('tbody', {}, rows.map((r, ri) => h('tr', { 'data-row': r.id, 'data-i': ri },
        h('td', { class: 'idx', title: 'Tuỳ chọn dòng', onclick: (e) => rowMenu(ri, e.currentTarget) }, ri + 1),
        cs.map(c => cell(r, ri, c))))),
      cs.some(showsSum) ? h('tfoot', {}, h('tr', {}, h('td', { class: 'idx' }, 'Σ'), cs.map(c => {
        const t = showsSum(c) ? comp.total(c.key) : null;
        return h('td', { class: showsSum(c) ? 'num' : '', 'data-tot': showsSum(c) ? c.key : null }, h('div', { class: 'cell tot' }, t == null ? '' : fmtValue(t, c)));
      }))) : null);
    fill(gridBox, h('div', { class: `grid-scroll ${compact ? 'compact' : ''}` }, table),
      h('div', { class: 'row', style: { marginTop: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-sm', onclick: () => addRow(rows.length) }, '＋ Thêm dòng'),
));
    if (sel) setSel(sel.ri, sel.key);
  }

  function cell(r, ri, c0) {
    const c = r.cells?._f?.[c0.key] ? { ...c0, fmt: r.cells._f[c0.key] } : c0;
    const v = r.cells?.[c.key] ?? '';
    const computed = comp.get(ri, c.key);
    const isNum = c.type === 'number' || c.formula || typeof computed === 'number';
    const td = h('td', { class: `${isNum ? 'num' : ''} ${c.formula || isFormula(v) ? 'calc' : ''} ${computed instanceof FErr ? 'err' : ''}`, 'data-key': c.key });
    const who = editing.get(`${r.id}:${c.key}`);
    if (who) { td.classList.add('busy'); td.title = `${who} đang sửa`; }
    const set = (val) => saveCell(r, c, val);
    const focusSel = () => setSel(ri, c.key);
    if (c.formula) { td.classList.add('lock'); td.append(h('div', { class: 'cell', title: toDisplay(c.formula) }, fmtValue(computed, c))); return td; }
    if ((c.type === 'select' || c.type === 'person') && !isFormula(v)) {
      const opts = c.type === 'person' ? [...store.profiles.values()].map(p => [p.id, p.display_name || p.email]) : (c.options || []).map(o => [o, o]);
      td.append(h('select', { class: 'cell', onfocus: focusSel, onchange: (e) => set(e.target.value) }, h('option', { value: '' }, ''), opts.map(([val, label]) => h('option', { value: val, selected: v === val }, label)),
        c.type === 'select' && v && !(c.options || []).includes(v) ? h('option', { value: v, selected: true }, v) : null));
      return td;
    }
    if (c.type === 'date' && !isFormula(v)) { td.append(h('input', { class: 'cell', type: 'date', value: isFormula(v) ? '' : v, onfocus: focusSel, onchange: (e) => set(e.target.value) })); return td; }
    if (c.type === 'check' && !isFormula(v)) { td.append(h('div', { class: 'cell', style: { textAlign: 'center' } }, h('input', { type: 'checkbox', checked: !!v, onfocus: focusSel, onchange: (e) => set(e.target.checked) }))); return td; }
    const shown = fmtValue(computed, c);
    const locked = isFormula(v);
    const div = h('div', { class: 'cell', contenteditable: locked ? 'false' : 'plaintext-only', spellcheck: false, title: locked ? toDisplay(v) + '  (bấm đúp để sửa)' : null }, shown);
    if (locked) { td.classList.add('lock'); div.addEventListener('dblclick', () => { div.contentEditable = 'plaintext-only'; td.classList.remove('lock'); div.focus(); }); }
    div.addEventListener('focus', () => { div.textContent = rawOf(ri, c.key); focusSel(); room.send({ t: 'edit', k: `${r.id}:${c.key}`, name: store.me?.display_name }); });
    div.addEventListener('blur', () => {
      room.send({ t: 'done', k: `${r.id}:${c.key}` });
      const nv = parseInput(c, div.textContent);
      if (isFormula(nv)) { div.contentEditable = 'false'; td.classList.add('lock'); div.title = toDisplay(nv); }
      if (String(nv) !== String(v)) set(nv); else div.textContent = shown;
    });
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); div.blur(); focusCell(ri + 1, c.key); }
      if (e.key === 'Tab') { e.preventDefault(); const cs = cols(); const d = e.shiftKey ? -1 : 1; let ci = cs.findIndex(x => x.key === c.key) + d; while (cs[ci]?.formula) ci += d; const nk = cs[ci]?.key; div.blur(); if (nk) focusCell(ri, nk); }
      if (e.key === 'Escape') { div.textContent = rawOf(ri, c.key); div.blur(); }
    });
    div.addEventListener('paste', (e) => { const t = e.clipboardData.getData('text'); if (t.includes('\t') || t.replace(/\r/g, '').split('\n').filter(Boolean).length > 1) { e.preventDefault(); pasteGrid(ri, c, t); } });
    td.append(div);
    return td;
  }

  // Lưới có thể vừa vẽ lại sau khi lưu → tìm ô theo toạ độ trên DOM mới
  function focusCell(ri, key, retry = true) {
    const el = gridBox.querySelector(`tr[data-i="${ri}"] td[data-key="${key}"] .cell`);
    if (!el) { if (retry) setTimeout(() => focusCell(ri, key, false), 0); return; }
    el.focus();
    if (el.isContentEditable) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  }
  // Cập nhật giá trị tính toán tại chỗ (không vẽ lại lưới → không mất ô đang gõ)
  function refreshValues() {
    recompute();
    const cs = cols();
    gridBox.querySelectorAll('tbody tr[data-i]').forEach(tr => {
      const ri = Number(tr.getAttribute('data-i'));
      tr.querySelectorAll('td[data-key]').forEach(td => {
        if (td.contains(document.activeElement)) return;
        const c0 = cs.find(x => x.key === td.getAttribute('data-key')); if (!c0 || ['select', 'person', 'date', 'check'].includes(c0.type)) return;
        const c = rows[ri]?.cells?._f?.[c0.key] ? { ...c0, fmt: rows[ri].cells._f[c0.key] } : c0;
        const v = comp.get(ri, c.key); const cell = td.querySelector('.cell'); if (!cell) return;
        const t = fmtValue(v, c); if (cell.textContent !== t) cell.textContent = t;
        td.classList.toggle('err', v instanceof FErr);
        const f = !!c.formula || isFormula(rows[ri]?.cells?.[c.key]);
        td.classList.toggle('calc', f); td.classList.toggle('lock', f);
      });
    });
    gridBox.querySelectorAll('tfoot td[data-tot]').forEach(td => { const c = cs.find(x => x.key === td.getAttribute('data-tot')); const t = c ? comp.total(c.key) : null; td.firstChild.textContent = t == null ? '' : fmtValue(t, c); });
  }

  // ---------- dữ liệu ----------
  async function saveCell(r, c, val) {
    const cells = { ...(r.cells || {}), [c.key]: val };
    r.cells = cells;
    try { await db.update('data_rows', r.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() }); }
    catch (e) { toastErr(e); }
    if (gridBox.contains(document.activeElement)) refreshValues(); else renderGrid();
  }
  // Dịch số dòng trong công thức khi chèn / xoá dòng (dòng thứ `at`, tính từ 1)
  async function shiftAll(at, delta, skipId) {
    const jobs = [];
    const fix = (r, opt, skip) => {
      if (r.id === skip) return;
      let changed = false; const cells = { ...(r.cells || {}) };
      for (const [k, v] of Object.entries(cells)) if (isFormula(v)) { const nv = shiftRefs(v, { ...opt, at, delta }); if (nv !== v) { cells[k] = nv; changed = true; } }
      if (changed) { r.cells = cells; jobs.push(db.update('data_rows', r.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() })); }
    };
    rows.forEach(r => fix(r, { own: true }, skipId));
    for (const d of book?.data || []) if (d.table.id !== cur.id) d.rows.forEach(r => fix(r, { tid: cur.id }));
    const nc = cols().map(c => c.formula ? { ...c, formula: shiftRefs(c.formula, { own: true, at, delta }) } : c);
    if (JSON.stringify(nc) !== JSON.stringify(cols())) jobs.push(saveColumns(nc, false));
    await Promise.all(jobs).catch(toastErr);
  }
  async function addRow(index, cells = {}) {
    try {
      const before = rows[index - 1], after = rows[index];
      const pos = !rows.length ? 0 : !after ? (before.position ?? 0) + 1 : !before ? (after.position ?? 0) - 1 : ((before.position ?? 0) + (after.position ?? 0)) / 2;
      if (after) await shiftAll(index + 1, 1);
      const r = await db.insert('data_rows', { table_id: cur.id, cells, position: pos, updated_by: store.user.id });
      if (!rows.some(x => x.id === r.id)) { rows.push(r); rows = sorted(rows); }
      renderGrid(); renderTools();
      const k = cols().find(c => !c.formula && !['select', 'person', 'date', 'check'].includes(c.type))?.key; if (k) focusCell(rows.findIndex(x => x.id === r.id), k);
    } catch (e) { toastErr(e); }
  }
  async function delRow(ri) {
    const r = rows[ri]; if (!r) return;
    if (Object.values(r.cells || {}).some(v => v !== '' && v != null && v !== false) && !await confirmBox('Xoá dòng?', `Dòng ${ri + 1} có dữ liệu. Xoá luôn? Công thức đang trỏ tới dòng này sẽ báo #REF!.`)) return;
    rows = rows.filter(x => x.id !== r.id);
    await shiftAll(ri + 1, -1, r.id);
    renderGrid(); renderTools();
    db.remove('data_rows', r.id).catch(toastErr);
  }
  function rowMenu(ri, anchor) {
    popMenu(anchor, [
      { icon: '⤒', label: 'Chèn dòng phía trên', run: () => addRow(ri) },
      { icon: '⤓', label: 'Chèn dòng phía dưới', run: () => addRow(ri + 1) },
      { icon: '⧉', label: 'Nhân bản dòng', run: () => addRow(ri + 1, { ...(rows[ri].cells || {}) }) },
      '-', { icon: '🗑️', label: 'Xoá dòng', danger: true, run: () => delRow(ri) },
    ]);
  }
  async function saveColumns(columns, rerender = true) { cur.columns = columns; if (rerender) renderGrid(); try { await db.update('data_tables', cur.id, { columns }); } catch (e) { toastErr(e); } }
  async function addColumn(at) {
    const r = await colDialog({ label: '', type: 'text', options: [] }, at);
    if (!r) return;
    const cs = [...cols()]; cs.splice(at, 0, { key: keyOf(r.label, cs), ...r });
    saveColumns(cs);
  }
  async function colDialog(c, at) {
    const csNow = cols();
    const label = h('input', { class: 'input', value: c.label, placeholder: 'VD: Thành tiền' });
    const type = h('select', { class: 'select' }, Object.entries(TYPES).map(([k, v]) => h('option', { value: k, selected: (c.formula ? 'formula' : c.type) === k }, v)));
    const formula = h('input', { class: 'input mono', value: c.formula ? toDisplay(c.formula) : '', placeholder: 'VD: =D@*E@  (@ = dòng hiện tại)' });
    const fmt = h('select', { class: 'select' }, Object.entries(FORMATS).map(([k, v]) => h('option', { value: k, selected: (c.fmt || 'auto') === k }, v)));
    const sum = h('input', { type: 'checkbox', checked: c.sum !== false });
    const opts = h('input', { class: 'input', value: (c.options || []).join(', '), placeholder: 'VD: Chưa làm, Đang làm, Xong' });
    const fF = h('label', { class: 'field' }, h('span', {}, 'Công thức cho cả cột'), formula, h('small', { class: 'muted' }, 'Dùng chữ cột + @ cho dòng hiện tại: =D@*E@, =IF(F@="","",F@/G@). Có thể trỏ ô cố định: =D@*$C$1 → viết =D@*C1.'));
    const fN = h('div', { class: 'row', style: { gap: '12px', alignItems: 'flex-end' } }, h('label', { class: 'field grow' }, h('span', {}, 'Định dạng hiển thị'), fmt), h('label', { class: 'field row small', style: { gap: '6px' } }, sum, 'Hiện tổng cuối cột'));
    const fO = h('label', { class: 'field' }, h('span', {}, 'Các lựa chọn (cách nhau bởi dấu phẩy)'), opts);
    const sync = () => { fF.style.display = type.value === 'formula' ? '' : 'none'; fN.style.display = ['number', 'formula'].includes(type.value) ? '' : 'none'; fO.style.display = type.value === 'select' ? '' : 'none'; };
    type.onchange = sync; sync();
    const letters = h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Các cột hiện có: ', csNow.map((x, i) => `${colLetter(i)} = ${x.label}`).join(' · '));
    const r = await modal(c.label ? 'Sửa cột' : 'Thêm cột', h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Tên cột'), label), h('label', { class: 'field' }, h('span', {}, 'Kiểu dữ liệu'), type), fF, fN, fO, letters), [{ label: 'Huỷ', value: null }, { label: 'Lưu', value: 'ok', primary: true }]);
    if (r !== 'ok') return null;
    const isF = type.value === 'formula';
    if (isF && !isFormula(formula.value)) { toast('Công thức phải bắt đầu bằng dấu =', 'error'); return null; }
    const ref = at != null ? [...csNow.slice(0, at), { key: '__new' }, ...csNow.slice(at)] : csNow;
    return { label: label.value.trim(), type: isF ? 'number' : type.value, formula: isF ? toInternal(formula.value, ref).replace(/\{__new\}/g, '{__self}') : undefined,
      fmt: ['number', 'formula'].includes(type.value) && fmt.value !== 'auto' ? fmt.value : undefined, sum: ['number', 'formula'].includes(type.value) ? sum.checked : undefined,
      options: type.value === 'select' ? opts.value.split(',').map(s => s.trim()).filter(Boolean) : undefined, width: c.width };
  }
  function colMenu(i, anchor) {
    const cs = [...cols()];
    popMenu(anchor, [
      { icon: '✏️', label: 'Sửa cột (tên, kiểu, công thức)', run: async () => { const r = await colDialog(cs[i]); if (r) { cs[i] = { ...cs[i], ...r }; if (!r.formula) delete cs[i].formula; saveColumns(cs); } } },
      { icon: '⇤', label: 'Chèn cột bên trái', run: () => addColumn(i) },
      { icon: '⇥', label: 'Chèn cột bên phải', run: () => addColumn(i + 1) },
      { icon: '⬅️', label: 'Chuyển sang trái', run: () => { if (i > 0) { [cs[i - 1], cs[i]] = [cs[i], cs[i - 1]]; saveColumns(cs); } } },
      { icon: '➡️', label: 'Chuyển sang phải', run: () => { if (i < cs.length - 1) { [cs[i + 1], cs[i]] = [cs[i], cs[i + 1]]; saveColumns(cs); } } },
      { icon: '↔️', label: 'Rộng hơn', run: () => { cs[i] = { ...cs[i], width: (cs[i].width || 130) + 60 }; saveColumns(cs); } },
      { icon: '↕️', label: 'Hẹp hơn', run: () => { cs[i] = { ...cs[i], width: Math.max(70, (cs[i].width || 130) - 40) }; saveColumns(cs); } },
      { icon: '🔤', label: 'Sắp xếp theo cột này', run: () => sortBy(cs[i]) },
      '-',
      { icon: '🗑️', label: 'Xoá cột', danger: true, run: async () => { if (await confirmBox('Xoá cột?', `Xoá cột “${cs[i].label}”? Công thức đang dùng cột này sẽ báo #REF!.`)) { cs.splice(i, 1); saveColumns(cs); } } },
    ]);
  }
  async function sortBy(c) {
    if (rows.some(r => Object.values(r.cells || {}).some(v => isFormula(v) && /\{[a-z0-9_]+\}\d/.test(v))) && !await confirmBox('Sắp xếp bảng có công thức?', 'Bảng có công thức trỏ tới số dòng cố định – sắp xếp có thể làm sai kết quả. Vẫn sắp xếp?', false)) return;
    const val = (r, i) => { const v = comp.get(rows.indexOf(r), c.key); const n = parseNum(v); return n ?? String(v ?? ''); };
    const order = rows.map((r, i) => [r, val(r, i)]).sort((a, b) => typeof a[1] === 'number' && typeof b[1] === 'number' ? a[1] - b[1] : String(a[1]).localeCompare(String(b[1]), 'vi')).map(x => x[0]);
    rows = order; renderGrid();
    try { await Promise.all(rows.map((r, i) => r.position !== i ? db.update('data_rows', r.id, { position: i }).then(() => { r.position = i; }) : null)); } catch (e) { toastErr(e); }
  }
  async function pasteGrid(ri, c, text) {
    const lines = text.replace(/\r/g, '').split('\n'); if (lines[lines.length - 1] === '') lines.pop();
    const cs = cols(); const ci = cs.findIndex(x => x.key === c.key);
    for (const line of lines) {
      const vals = line.split('\t');
      const row = rows[ri];
      const cells = { ...(row?.cells || {}) };
      vals.forEach((v, j) => { const col = cs[ci + j]; if (col && !col.formula) cells[col.key] = parseInput(col, v); });
      if (row) { row.cells = cells; await db.update('data_rows', row.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() }).catch(toastErr); }
      else { const pos = rows.length ? (rows[rows.length - 1].position ?? 0) + 1 : 0; const nr = await db.insert('data_rows', { table_id: cur.id, cells, position: pos, updated_by: store.user.id }).catch(toastErr); if (nr && !rows.some(x => x.id === nr.id)) rows.push(nr); }
      ri++;
    }
    renderGrid(); renderTools(); toast(`Đã dán ${lines.length} dòng`, 'ok');
  }
  function exportCsv() {
    recompute();
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = [cols().map(c => q(c.label)).join(','), ...rows.map((r, ri) => cols().map(c => { const v = comp.get(ri, c.key); return q(c.type === 'person' ? nameOf(v) : c.type === 'check' ? (v ? 'x' : '') : v instanceof FErr ? v.code : v); }).join(','))].join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })), download: cur.name + '.csv' }); a.click(); downloadNote();
  }
  function importCsv() {
    const inp = h('input', { type: 'file', accept: '.csv,text/csv', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const parsed = parseCsv((await f.text()).replace(/^﻿/, '')); if (parsed.length < 2) { toast('Tệp CSV trống', 'error'); return; }
      const [head, ...body] = parsed;
      const cs = [...cols()];
      const map = head.map(lbl => { let c = cs.find(x => x.label.toLowerCase() === lbl.trim().toLowerCase()); if (!c) { c = { key: keyOf(lbl, cs), label: lbl.trim() || 'Cột', type: 'text' }; cs.push(c); } return c; });
      if (cs.length !== cols().length) await saveColumns(cs);
      let pos = rows.length ? (rows[rows.length - 1].position ?? 0) + 1 : 0;
      const newRows = body.filter(r => r.some(v => v.trim())).map(r => ({ table_id: cur.id, position: pos++, updated_by: store.user.id, cells: Object.fromEntries(map.map((c, j) => c.formula ? null : [c.key, parseInput(c, r[j] ?? '')]).filter(Boolean)) }));
      try { const ins = await db.insertMany('data_rows', newRows); ins.forEach(r => { if (!rows.some(x => x.id === r.id)) rows.push(r); }); renderGrid(); renderTools(); toast(`Đã nhập ${ins.length} dòng`, 'ok'); logActivity(store.user, `nhập ${ins.length} dòng vào`, cur.name); } catch (er) { toastErr(er); }
    } });
    inp.click();
  }
  function helpFormula() {
    modal('Cách viết công thức', h('div', { class: 'small', style: { lineHeight: 1.7 } },
      h('p', {}, 'Giống Excel: ô bắt đầu bằng dấu ', h('code', {}, '='), ' là công thức. Cột đánh chữ A, B, C…; dòng đánh số 1, 2, 3…'),
      h('ul', {}, h('li', {}, h('code', {}, '=C3*D3'), ' – nhân 2 ô'), h('li', {}, h('code', {}, '=SUM(G1:G9)'), ' – cộng một vùng'),
        h('li', {}, h('code', {}, '=ROUNDUP(C7/C4,0)'), ' – làm tròn lên'), h('li', {}, h('code', {}, '=IF(C2>0,C2*2,"")'), ' – điều kiện'),
        h('li', {}, 'Cột công thức (ƒ): một công thức cho cả cột, ', h('code', {}, '@'), ' = dòng hiện tại, VD ', h('code', {}, '=D@*E@*(1+F@/100)'))),
      h('p', {}, 'Hàm có sẵn: SUM, AVERAGE, MIN, MAX, COUNT, ROUND, ROUNDUP, ROUNDDOWN, CEILING, FLOOR, INT, ABS, SQRT, POWER, MOD, IF, IFERROR, AND, OR, NOT.'),
      h('p', {}, 'Ô trắng là ô nhập. Ô xám là ô tự tính – bấm đúp để sửa công thức của ô đó. Bấm số dòng để chèn / xoá dòng, công thức tự dịch như Excel.')), [{ label: 'Đã hiểu', value: 1, primary: true }]);
  }

  // ---------- realtime ----------
  async function load() {
    if (!cur && tableId) cur = await db.get('data_tables', tableId);
    if (!cur) { renderGrid(); return; }
    rows = sorted(await db.select('data_rows', { eq: { table_id: cur.id } }));
    renderTools(); renderGrid();
    offs.push(db.subscribe('data_rows', ['table_id', cur.id], (e) => {
      if (e.type === 'DELETE') { if (!rows.some(r => r.id === e.old.id)) return; rows = rows.filter(r => r.id !== e.old.id); }
      else {
        const i = rows.findIndex(r => r.id === e.new.id);
        const changed = i >= 0 ? Object.keys(e.new.cells || {}).filter(k => JSON.stringify(e.new.cells[k]) !== JSON.stringify(rows[i].cells?.[k])) : [];
        if (i >= 0 && !changed.length && (rows[i].position ?? 0) === (e.new.position ?? 0)) { rows[i] = e.new; refreshValues(); return; } // tiếng vọng của chính mình
        if (i >= 0) rows[i] = e.new; else rows.push(e.new);
        rows = sorted(rows);
        const focused = document.activeElement?.closest?.('td');
        if (focused && gridBox.contains(focused) && i >= 0) {
          const tr = focused.parentElement;
          if (tr.getAttribute('data-row') === e.new.id && changed.includes(focused.getAttribute('data-key')) && e.new.updated_by !== store.user.id) toast(`${nameOf(e.new.updated_by)} vừa sửa ô bạn đang gõ`, 'error');
          refreshValues();
          if (e.new.updated_by !== store.user.id) changed.forEach(k => gridBox.querySelector(`tr[data-row="${e.new.id}"] td[data-key="${k}"]`)?.classList.add('flash'));
          renderTools(); return;
        }
        renderGrid(); renderTools();
        if (e.new.updated_by !== store.user.id) changed.forEach(k => gridBox.querySelector(`tr[data-row="${e.new.id}"] td[data-key="${k}"]`)?.classList.add('flash'));
        return;
      }
      if (!gridBox.contains(document.activeElement) || !document.activeElement.isContentEditable) renderGrid();
      renderTools();
    }));
    offs.push(db.subscribe('data_tables', ['id', cur.id], (e) => { if (e.type === 'UPDATE' && e.new.id === cur.id) { cur = e.new; if (!document.activeElement?.isContentEditable) renderGrid(); renderTools(); } }));
  }
  function onRoom(m) {
    if (m.t === 'edit') editing.set(m.k, m.name); else if (m.t === 'done') editing.delete(m.k); else return;
    const [rid, key] = m.k.split(':');
    const td = gridBox.querySelector(`tr[data-row="${rid}"] td[data-key="${key}"]`);
    if (td) { td.classList.toggle('busy', m.t === 'edit'); td.title = m.t === 'edit' ? `${m.name} đang sửa` : ''; }
  }
  load().catch(toastErr);
  offs.push(on('profiles', () => cur && !document.activeElement?.isContentEditable && renderGrid()));
  return () => { offs.forEach(f => f()); room.close(); book?.subs.delete(onBook); };
}

function parseCsv(t) {
  const first = t.split('\n')[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const out = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { row.push(f); f = ''; } else if (ch === '\n') { row.push(f.replace(/\r$/, '')); out.push(row); row = []; f = ''; } else f += ch;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}

// =====================================================================
// BẢN XEM CHỈ ĐỌC (Trang xem)
// =====================================================================
export function renderStatic(table, rows, { hide = [], highlight, book } = {}) {
  const rs = sorted(rows);
  const s = book ? book.sheet(table.id) : computeSheet(table.columns, rs);
  const cs = table.columns.filter(c => !hide.includes(c.key));
  const any = cs.some(showsSum) && rs.length > 1;
  return h('div', { class: 'sv-scroll' }, h('table', { class: 'sv' },
    h('thead', {}, h('tr', {}, h('th', { class: 'idx' }, '#'), cs.map((c, ci) => h('th', { class: c.type === 'number' || c.formula ? 'num' : '', style: c.type === 'text' ? { minWidth: Math.round((c.width || 120) * 0.7) + 'px' } : null }, c.label || colLetter(table.columns.indexOf(c)))))),
    h('tbody', {}, rs.map((r, ri) => h('tr', { class: highlight?.(r, ri, s) ? 'hl' : '' }, h('td', { class: 'idx' }, ri + 1), cs.map(c => {
      const v = s.get(ri, c.key); c = r.cells?._f?.[c.key] ? { ...c, fmt: r.cells._f[c.key] } : c;
      return h('td', { class: `${c.type === 'number' || c.formula || typeof v === 'number' ? 'num' : ''} ${v instanceof FErr ? 'err' : ''}` }, cellText(c, v));
    })))),
    any ? h('tfoot', {}, h('tr', {}, h('td', { class: 'idx' }, 'Σ'), cs.map(c => { const t = showsSum(c) ? s.total(c.key) : null; return h('td', { class: 'num' }, t == null ? '' : fmtValue(t, c)); }))) : null));
}
export { computeSheet };
