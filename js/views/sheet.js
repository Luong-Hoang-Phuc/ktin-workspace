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
import { softDelete } from '../trash.js';
import { cellIssue, markIssue } from './cellcheck.js';
import { openThread, NEED_SQL } from './comments.js';

const TYPES = { text: 'Văn bản', number: 'Số', formula: 'Công thức (cả cột)', select: 'Lựa chọn', person: 'Thành viên', date: 'Ngày', check: 'Hộp kiểm' };
const keyOf = (label, cols) => { let k = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'cot'; let i = 2; const base = k; while (cols.some(c => c.key === k)) k = base + i++; return k; };
const sorted = (rows) => [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
const showsSum = (c) => (c.type === 'number' || c.formula) && c.sum !== false && c.fmt !== 'date';
// Ô gộp (như Excel / Word): lưu ở dòng chứa ô trên-trái: cells._m = { [khoá cột]: { r: số dòng, c: số cột } }
export function mergeMap(cols, rows) {
  const anchors = new Map(), covered = new Map();
  rows.forEach((r, ri) => {
    for (const [k, sp] of Object.entries(r.cells?._m || {})) {
      const ci = cols.findIndex(c => c.key === k); if (ci < 0) continue;
      const rs = Math.min(sp?.r || 1, rows.length - ri), cs = Math.min(sp?.c || 1, cols.length - ci);
      if (rs * cs < 2 || covered.has(`${ri}:${ci}`) || anchors.has(`${ri}:${ci}`)) continue;
      let clash = false;
      for (let i = ri; i < ri + rs; i++) for (let j = ci; j < ci + cs; j++) if ((i !== ri || j !== ci) && (covered.has(`${i}:${j}`) || anchors.has(`${i}:${j}`))) clash = true;
      if (clash) continue;
      anchors.set(`${ri}:${ci}`, { ri, ci, rs, cs, key: k });
      for (let i = ri; i < ri + rs; i++) for (let j = ci; j < ci + cs; j++) if (i !== ri || j !== ci) covered.set(`${i}:${j}`, `${ri}:${ci}`);
    }
  });
  return { anchors, covered };
}
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
  let rng = null, dragFrom = null;   // vùng chọn nhiều ô { r0, r1, c0, c1 } (kéo chuột hoặc Shift + nhấp)
  const offs = [];
  const phone = matchMedia('(max-width: 640px)').matches;   // điện thoại: bảng tính chỉ xem
  let cmts = [], cmtOk = true;   // bình luận trên ô của bảng này
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
    if (phone) { fill(tools, h('span', { class: 'small muted' }, '📱 Trên điện thoại bảng tính chỉ xem – mở bằng máy tính để sửa.')); return; }
    fill(tools,
      h('button', { class: 'btn btn-sm', disabled: !hist.undo.length, title: 'Hoàn tác thao tác trước của bạn (Ctrl + Z)', onclick: undo }, '↶'),
      h('button', { class: 'btn btn-sm', disabled: !hist.redo.length, title: 'Làm lại (Ctrl + Y hoặc Ctrl + Shift + Z)', onclick: redo }, '↷'),
      h('span', { class: 'small muted' }, rng ? `Đang chọn ${rng.r1 - rng.r0 + 1} dòng × ${rng.c1 - rng.c0 + 1} cột` : 'Kéo chuột qua nhiều ô (hoặc Shift + nhấp) để chọn vùng'),
      h('button', { class: 'btn btn-sm', disabled: !rng || (rng.r0 === rng.r1 && rng.c0 === rng.c1), title: 'Gộp các ô đang chọn thành một ô (như Merge trong Excel / Word)', onclick: mergeRange }, '⊞ Gộp ô'),
      h('button', { class: 'btn btn-sm', disabled: !mergesHit().length, title: 'Tách ô đã gộp về như cũ', onclick: unmerge }, '⊟ Tách ô'),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn btn-sm', onclick: () => addRow(rows.length) }, '＋ Dòng'),
      h('button', { class: 'btn btn-sm', onclick: () => addColumn(cols().length) }, '＋ Cột'),
      h('button', { class: 'icon-btn', onclick: (e) => popMenu(e.currentTarget, [
        { icon: '✏️', label: 'Đổi tên bảng', run: async () => { const n = await prompt('Đổi tên bảng', 'Tên', cur.name); if (n) db.update('data_tables', cur.id, { name: n }).catch(toastErr); } },
        { icon: 'ƒ', label: 'Cách viết công thức', run: helpFormula },
        { icon: '⬇', label: 'Tải bảng này dạng CSV', run: exportCsv },
        { icon: '⬆', label: 'Nhập thêm dòng từ CSV', run: importCsv },
        '-',
        { icon: '🗑️', label: 'Xoá bảng', danger: true, run: async () => { if (await confirmBox('Xoá bảng?', `Xoá “${cur.name}” và toàn bộ ${rows.length} dòng dữ liệu? (Có thể khôi phục trong 🗑 Thùng rác 30 ngày.)`, true, `Xoá bảng “${cur.name}”`)) { try { const t = cur; onDeleted?.(); await softDelete('data_tables', t.id, { label: t.name, what: 'bảng' }); } catch (e) { toastErr(e); } } } },
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
    const M = mergeMap(cs, rows);
    if (rng) rng = fitRange(rng);
    const table = h('table', { class: 'grid xl' },
      h('thead', {}, h('tr', {}, h('th', { class: 'idx corner' }, ''),
        cs.map((c, i) => h('th', { style: { minWidth: (c.width || (c.type === 'number' ? 110 : 130)) + 'px' }, class: c.formula ? 'fx' : '' },
          h('div', { class: 'th' }, h('span', { class: 'colL' }, colLetter(i)), h('span', { class: 'lbl', title: c.formula ? 'Cột công thức: ' + toDisplay(c.formula) : c.label }, c.label),
            c.formula ? h('span', { class: 'ty' }, 'ƒ') : null,
            h('button', { class: 'icon-btn', title: 'Tuỳ chọn cột', onclick: (e) => colMenu(i, e.currentTarget) }, '▾')))))),
      h('tbody', {}, rows.map((r, ri) => h('tr', { 'data-row': r.id, 'data-i': ri },
        h('td', { class: 'idx', title: 'Tuỳ chọn dòng', onclick: (e) => rowMenu(ri, e.currentTarget) }, ri + 1),
        cs.map((c, ci) => {
          if (M.covered.has(`${ri}:${ci}`)) return null;
          const td = cell(r, ri, c); td.setAttribute('data-ci', ci);
          const a = M.anchors.get(`${ri}:${ci}`);
          if (a) { td.rowSpan = a.rs; td.colSpan = a.cs; td.classList.add('mg'); }
          return td;
        })))),
      cs.some(showsSum) ? h('tfoot', {}, h('tr', {}, h('td', { class: 'idx' }, 'Σ'), cs.map(c => {
        const t = showsSum(c) ? comp.total(c.key) : null;
        return h('td', { class: showsSum(c) ? 'num' : '', 'data-tot': showsSum(c) ? c.key : null }, h('div', { class: 'cell tot' }, t == null ? '' : fmtValue(t, c)));
      }))) : null);
    fill(gridBox, h('div', { class: `grid-scroll ${compact ? 'compact' : ''}` }, table),
      phone ? null : h('div', { class: 'row', style: { marginTop: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn btn-sm', onclick: () => addRow(rows.length) }, '＋ Thêm dòng'),
        h('span', { class: 'small muted' }, 'Chuột phải vào ô để bình luận / giao việc · ô viền đỏ = lỗi số liệu, viền vàng = cần kiểm tra (rê chuột để xem)')));
    if (sel) setSel(sel.ri, sel.key);
    paintRange(); paintComments();
  }

  // ---------- chọn vùng & gộp ô ----------
  // nới vùng chọn cho trùm trọn các ô đã gộp nằm chạm vào nó
  function fitRange(q) {
    const M = mergeMap(cols(), rows);
    let { r0, r1, c0, c1 } = q, grow = true;
    r1 = Math.min(r1, rows.length - 1); c1 = Math.min(c1, cols().length - 1);
    if (r0 > r1 || c0 > c1) return null;
    while (grow) {
      grow = false;
      for (const a of M.anchors.values()) {
        if (a.ri > r1 || a.ri + a.rs - 1 < r0 || a.ci > c1 || a.ci + a.cs - 1 < c0) continue;
        const n = { r0: Math.min(r0, a.ri), r1: Math.max(r1, a.ri + a.rs - 1), c0: Math.min(c0, a.ci), c1: Math.max(c1, a.ci + a.cs - 1) };
        if (n.r0 !== r0 || n.r1 !== r1 || n.c0 !== c0 || n.c1 !== c1) { ({ r0, r1, c0, c1 } = n); grow = true; }
      }
    }
    return { ...q, r0, r1, c0, c1 };
  }
  function setRange(a, b) {
    rng = fitRange({ r0: Math.min(a.ri, b.ri), r1: Math.max(a.ri, b.ri), c0: Math.min(a.ci, b.ci), c1: Math.max(a.ci, b.ci), ar: a.ri, ac: a.ci });
    paintRange(); renderTools();
  }
  function clearRange() { if (!rng) return; rng = null; paintRange(); renderTools(); }
  function paintRange() {
    gridBox.querySelectorAll('td.rsel').forEach(td => td.classList.remove('rsel'));
    if (!rng) return;
    gridBox.querySelectorAll('tbody td[data-ci]').forEach(td => {
      const ri = +td.parentElement.getAttribute('data-i'), ci = +td.getAttribute('data-ci');
      if (ri <= rng.r1 && ri + (td.rowSpan || 1) - 1 >= rng.r0 && ci <= rng.c1 && ci + (td.colSpan || 1) - 1 >= rng.c0) td.classList.add('rsel');
    });
  }
  const posOf = (td) => ({ ri: +td.parentElement.getAttribute('data-i'), ci: +td.getAttribute('data-ci') });
  gridBox.addEventListener('mousedown', (e) => {
    const td = e.target.closest?.('tbody td[data-ci]'); if (!td || e.button) return;
    const p = posOf(td);
    if (e.shiftKey && (rng || sel)) {
      e.preventDefault();
      setRange(rng ? { ri: rng.ar, ci: rng.ac } : { ri: sel.ri, ci: cols().findIndex(c => c.key === sel.key) }, p);
      return;
    }
    dragFrom = p; clearRange();
  });
  gridBox.addEventListener('mouseover', (e) => {
    if (!dragFrom) return;
    if (!(e.buttons & 1)) { dragFrom = null; gridBox.classList.remove('ranging'); return; }
    const td = e.target.closest?.('tbody td[data-ci]'); if (!td) return;
    const p = posOf(td);
    if (!rng && p.ri === dragFrom.ri && p.ci === dragFrom.ci) return;
    if (!gridBox.classList.contains('ranging')) { gridBox.classList.add('ranging'); if (gridBox.contains(document.activeElement)) document.activeElement.blur(); }
    getSelection()?.removeAllRanges();
    setRange(dragFrom, p);
  });
  const endDrag = () => { dragFrom = null; gridBox.classList.remove('ranging'); };
  document.addEventListener('mouseup', endDrag);
  gridBox.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearRange(); });
  const hasVal = (v) => v !== '' && v != null && v !== false;
  const saveRow = (r, cells) => { r.cells = cells; return db.update('data_rows', r.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() }); };
  async function mergeRange0() {
    if (!rng) return;
    const cs = cols(), { r0, r1, c0, c1 } = rng;
    if (r0 === r1 && c0 === c1) return;
    let lost = 0;
    for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) if ((i !== r0 || j !== c0) && !cs[j].formula && hasVal(rows[i]?.cells?.[cs[j].key])) lost++;
    if (lost && !await confirmBox('Gộp ô?', `Ô gộp chỉ giữ dữ liệu của ô trên cùng bên trái (${colLetter(c0)}${r0 + 1}). ${lost} ô khác trong vùng đang có dữ liệu sẽ bị xoá. Vẫn gộp?`)) return;
    const jobs = [];
    for (let i = r0; i <= r1; i++) {
      const r = rows[i]; if (!r) continue;
      const cells = { ...(r.cells || {}) }; let ch = false;
      if (cells._m) { const m = { ...cells._m }; for (const k of Object.keys(m)) { const ci = cs.findIndex(c => c.key === k); if (ci >= c0 && ci <= c1) { delete m[k]; ch = true; } } cells._m = m; }
      for (let j = c0; j <= c1; j++) if ((i !== r0 || j !== c0) && !cs[j].formula && cs[j].key in cells) { delete cells[cs[j].key]; ch = true; }
      if (i === r0) { cells._m = { ...(cells._m || {}), [cs[c0].key]: { r: r1 - r0 + 1, c: c1 - c0 + 1 } }; ch = true; }
      if (cells._m && !Object.keys(cells._m).length) delete cells._m;
      if (ch) jobs.push(saveRow(r, cells));
    }
    rng = null; renderGrid(); renderTools();
    try { await Promise.all(jobs); logActivity(store.user, 'gộp ô trong bảng', cur.name); } catch (e) { toastErr(e); }
  }
  function mergesHit() {
    if (!cur) return [];
    const M = mergeMap(cols(), rows);
    const q = rng || (sel ? { r0: sel.ri, r1: sel.ri, c0: cols().findIndex(c => c.key === sel.key), c1: cols().findIndex(c => c.key === sel.key) } : null);
    if (!q) return [];
    return [...M.anchors.values()].filter(a => a.ri <= q.r1 && a.ri + a.rs - 1 >= q.r0 && a.ci <= q.c1 && a.ci + a.cs - 1 >= q.c0);
  }
  async function unmerge0() {
    const hit = mergesHit(); if (!hit.length) return;
    const jobs = [];
    for (const a of hit) { const r = rows[a.ri]; const m = { ...(r.cells?._m || {}) }; delete m[a.key]; const cells = { ...r.cells, _m: m }; if (!Object.keys(m).length) delete cells._m; jobs.push(saveRow(r, cells)); }
    renderGrid(); renderTools();
    await Promise.all(jobs).catch(toastErr);
  }
  // Chèn / xoá dòng hoặc cột nằm giữa vùng gộp → vùng gộp tự giãn / co theo (như Excel)
  function adjustMerges(kind, at, delta) {
    const cs = cols(), jobs = [];
    const M = mergeMap(cs, rows);
    for (const a of M.anchors.values()) {
      const start = kind === 'row' ? a.ri : a.ci, len = kind === 'row' ? a.rs : a.cs;
      const inside = at > start && at <= start + len - 1;
      if (!inside) continue;
      const r = rows[a.ri]; const m = { ...(r.cells?._m || {}) };
      m[a.key] = { r: a.rs + (kind === 'row' ? delta : 0), c: a.cs + (kind === 'col' ? delta : 0) };
      jobs.push(saveRow(r, { ...r.cells, _m: m }));
    }
    return Promise.all(jobs).catch(toastErr);
  }

  function cell(r, ri, c0) {
    const c = r.cells?._f?.[c0.key] ? { ...c0, fmt: r.cells._f[c0.key] } : c0;
    const v = r.cells?.[c.key] ?? '';
    const computed = comp.get(ri, c.key);
    const isNum = c.type === 'number' || c.formula || typeof computed === 'number';
    const td = h('td', { class: `${isNum ? 'num' : ''} ${c.formula || isFormula(v) ? 'calc' : ''} ${computed instanceof FErr ? 'err' : ''}`, 'data-key': c.key });
    const who = editing.get(`${r.id}:${c.key}`);
    if (who) { td.classList.add('busy'); td.title = `${who} đang sửa`; }
    markIssue(td, cellIssue(c, v, computed));
    if (phone) { td.append(h('div', { class: 'cell' }, cellText(c, computed))); return td; }
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
        markIssue(td, cellIssue(c, rows[ri]?.cells?.[c.key] ?? '', v));
        const f = !!c.formula || isFormula(rows[ri]?.cells?.[c.key]);
        td.classList.toggle('calc', f); td.classList.toggle('lock', f);
      });
    });
    gridBox.querySelectorAll('tfoot td[data-tot]').forEach(td => { const c = cs.find(x => x.key === td.getAttribute('data-tot')); const t = c ? comp.total(c.key) : null; td.firstChild.textContent = t == null ? '' : fmtValue(t, c); });
  }

  // ---------- dữ liệu ----------
  async function saveCell0(r, c, val) {
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
  async function addRow0(index, cells = {}) {
    try {
      const before = rows[index - 1], after = rows[index];
      const pos = !rows.length ? 0 : !after ? (before.position ?? 0) + 1 : !before ? (after.position ?? 0) - 1 : ((before.position ?? 0) + (after.position ?? 0)) / 2;
      if (after) await shiftAll(index + 1, 1);
      if (after) await adjustMerges('row', index, 1);
      const r = await db.insert('data_rows', { table_id: cur.id, cells, position: pos, updated_by: store.user.id });
      if (!rows.some(x => x.id === r.id)) { rows.push(r); rows = sorted(rows); }
      renderGrid(); renderTools();
      const k = cols().find(c => !c.formula && !['select', 'person', 'date', 'check'].includes(c.type))?.key; if (k) focusCell(rows.findIndex(x => x.id === r.id), k);
    } catch (e) { toastErr(e); }
  }
  // xoá dòng: không hỏi lại – có nút “Hoàn tác” trong thông báo, dòng nằm trong 🗑 Thùng rác 30 ngày
  async function delRow0(ri) {
    const r = rows[ri]; if (!r) return;
    await adjustMerges('row', ri, -1);
    rows = rows.filter(x => x.id !== r.id);
    await shiftAll(ri + 1, -1, r.id);
    renderGrid(); renderTools();
    try { const d = await softDelete('data_rows', r.id, { label: `dòng ${ri + 1} – ${cur.name}`, what: 'dòng', silent: true }); if (d?.trashId) trashOf.set(r.id, d.trashId); } catch (e) { toastErr(e); }
  }
  function rowMenu(ri, anchor) {
    popMenu(anchor, [
      { icon: '⤒', label: 'Chèn dòng phía trên', run: () => addRow(ri) },
      { icon: '⤓', label: 'Chèn dòng phía dưới', run: () => addRow(ri + 1) },
      { icon: '⧉', label: 'Nhân bản dòng', run: () => { const cells = { ...(rows[ri].cells || {}) }; delete cells._m; addRow(ri + 1, cells); } },
      '-', { icon: '🗑️', label: 'Xoá dòng', danger: true, run: () => delRow(ri) },
    ]);
  }
  async function saveColumns(columns, rerender = true) { cur.columns = columns; if (rerender) renderGrid(); try { await db.update('data_tables', cur.id, { columns }); } catch (e) { toastErr(e); } }
  async function addColumn0(at) {
    const r = await colDialog({ label: '', type: 'text', options: [] }, at);
    if (!r) return;
    const cs = [...cols()]; cs.splice(at, 0, { key: keyOf(r.label, cs), ...r });
    if (at < cols().length) await adjustMerges('col', at, 1);
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
    popMenu(anchor, trackItems([
      { icon: '✏️', label: 'Sửa cột (tên, kiểu, công thức)', run: async () => { const r = await colDialog(cs[i]); if (r) { cs[i] = { ...cs[i], ...r }; if (!r.formula) delete cs[i].formula; await saveColumns(cs); } } },
      { icon: '⇤', label: 'Chèn cột bên trái', run: () => addColumn(i) },
      { icon: '⇥', label: 'Chèn cột bên phải', run: () => addColumn(i + 1) },
      { icon: '⬅️', label: 'Chuyển sang trái', run: () => { if (i > 0) { [cs[i - 1], cs[i]] = [cs[i], cs[i - 1]]; return saveColumns(cs); } } },
      { icon: '➡️', label: 'Chuyển sang phải', run: () => { if (i < cs.length - 1) { [cs[i + 1], cs[i]] = [cs[i], cs[i + 1]]; return saveColumns(cs); } } },
      { icon: '↔️', label: 'Rộng hơn', run: () => { cs[i] = { ...cs[i], width: (cs[i].width || 130) + 60 }; return saveColumns(cs); } },
      { icon: '↕️', label: 'Hẹp hơn', run: () => { cs[i] = { ...cs[i], width: Math.max(70, (cs[i].width || 130) - 40) }; return saveColumns(cs); } },
      { icon: '🔤', label: 'Sắp xếp theo cột này', run: () => sortBy(cs[i]) },
      '-',
      { icon: '🗑️', label: 'Xoá cột', danger: true, run: async () => { if (await confirmBox('Xoá cột?', `Xoá cột “${cs[i].label}”? Công thức đang dùng cột này sẽ báo #REF!. (Bấm Ctrl + Z để hoàn tác.)`, true, `Xoá cột “${cs[i].label}”`)) { await adjustMerges('col', i, -1); cs.splice(i, 1); await saveColumns(cs); } } },
    ]));
  }
  async function sortBy0(c) {
    if (mergeMap(cols(), rows).anchors.size) { toast('Bảng có ô gộp – hãy “⊟ Tách ô” trước khi sắp xếp.', 'error'); return; }
    if (rows.some(r => Object.values(r.cells || {}).some(v => isFormula(v) && /\{[a-z0-9_]+\}\d/.test(v))) && !await confirmBox('Sắp xếp bảng có công thức?', 'Bảng có công thức trỏ tới số dòng cố định – sắp xếp có thể làm sai kết quả. Vẫn sắp xếp?', false)) return;
    const val = (r, i) => { const v = comp.get(rows.indexOf(r), c.key); const n = parseNum(v); return n ?? String(v ?? ''); };
    const order = rows.map((r, i) => [r, val(r, i)]).sort((a, b) => typeof a[1] === 'number' && typeof b[1] === 'number' ? a[1] - b[1] : String(a[1]).localeCompare(String(b[1]), 'vi')).map(x => x[0]);
    rows = order; renderGrid();
    try { await Promise.all(rows.map((r, i) => r.position !== i ? db.update('data_rows', r.id, { position: i }).then(() => { r.position = i; }) : null)); } catch (e) { toastErr(e); }
  }
  async function pasteGrid0(ri, c, text) {
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
    const inp = h('input', { type: 'file', accept: '.csv,text/csv', onchange: (e) => track(async () => {
      const f = e.target.files[0]; if (!f) return;
      const parsed = parseCsv((await f.text()).replace(/^﻿/, '')); if (parsed.length < 2) { toast('Tệp CSV trống', 'error'); return; }
      const [head, ...body] = parsed;
      const cs = [...cols()];
      const map = head.map(lbl => { let c = cs.find(x => x.label.toLowerCase() === lbl.trim().toLowerCase()); if (!c) { c = { key: keyOf(lbl, cs), label: lbl.trim() || 'Cột', type: 'text' }; cs.push(c); } return c; });
      if (cs.length !== cols().length) await saveColumns(cs);
      let pos = rows.length ? (rows[rows.length - 1].position ?? 0) + 1 : 0;
      const newRows = body.filter(r => r.some(v => v.trim())).map(r => ({ table_id: cur.id, position: pos++, updated_by: store.user.id, cells: Object.fromEntries(map.map((c, j) => c.formula ? null : [c.key, parseInput(c, r[j] ?? '')]).filter(Boolean)) }));
      try { const ins = await db.insertMany('data_rows', newRows); ins.forEach(r => { if (!rows.some(x => x.id === r.id)) rows.push(r); }); renderGrid(); renderTools(); toast(`Đã nhập ${ins.length} dòng`, 'ok'); logActivity(store.user, `nhập ${ins.length} dòng vào`, cur.name); } catch (er) { toastErr(er); }
    }) });
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

  // ---------- hoàn tác / làm lại (chỉ thao tác của chính mình) ----------
  // Mỗi thao tác: chụp trạng thái bảng trước & sau → lưu phần khác nhau (dòng, cột) để đảo ngược
  const hist = { undo: [], redo: [] }, trashOf = new Map();
  let tracking = 0, applying = false;
  const snapState = () => ({ cols: JSON.stringify(cols()), rows: new Map(rows.map(r => [r.id, JSON.stringify({ cells: r.cells || {}, position: r.position ?? 0 })])) });
  async function track(fn) {
    if (applying || tracking || !cur) return fn();
    tracking++;
    const before = snapState();
    try { return await fn(); } finally { tracking--; record(before); }
  }
  function record(before) {
    const after = snapState(), d = [];
    for (const id of new Set([...before.rows.keys(), ...after.rows.keys()])) {
      const b = before.rows.get(id) ?? null, a = after.rows.get(id) ?? null;
      if (b !== a) d.push({ id, b: b && JSON.parse(b), a: a && JSON.parse(a) });
    }
    const colsD = before.cols !== after.cols ? { b: JSON.parse(before.cols), a: JSON.parse(after.cols) } : null;
    if (!d.length && !colsD) return null;
    const entry = { rows: d, cols: colsD };
    hist.undo.push(entry); if (hist.undo.length > 100) hist.undo.shift();
    hist.redo = []; renderTools();
    return entry;
  }
  async function applyHist(entry, back) {
    applying = true;
    const jobs = [], at = new Date().toISOString();
    try {
      if (entry.cols) { const c = back ? entry.cols.b : entry.cols.a; cur.columns = c; jobs.push(db.update('data_tables', cur.id, { columns: c })); }
      for (const d of entry.rows) {
        const want = back ? d.b : d.a, i = rows.findIndex(r => r.id === d.id);
        if (!want) { if (i >= 0) { rows.splice(i, 1); jobs.push(db.remove('data_rows', d.id)); } continue; }
        if (i >= 0) { rows[i] = { ...rows[i], ...want }; jobs.push(db.update('data_rows', d.id, { ...want, updated_by: store.user.id, updated_at: at })); }
        else {
          const r = { id: d.id, table_id: cur.id, ...want, updated_by: store.user.id }; rows.push(r);
          jobs.push(db.insert('data_rows', r).then(() => { const t = trashOf.get(d.id); if (t) { trashOf.delete(d.id); return db.remove('trash', t).catch(() => {}); } }));
        }
      }
      rows = sorted(rows); renderGrid(); renderTools();
      await Promise.all(jobs);
    } catch (e) { toastErr(e); } finally { applying = false; }
  }
  function undo() { const e = hist.undo.pop(); if (!e) return toast('Không còn thao tác nào để hoàn tác'); hist.redo.push(e); applyHist(e, true); toast('↶ Đã hoàn tác'); }
  function redo() { const e = hist.redo.pop(); if (!e) return; hist.undo.push(e); applyHist(e, false); toast('↷ Đã làm lại'); }
  function undoEntry(e) { const i = hist.undo.indexOf(e); if (i < 0) return; hist.undo.splice(i, 1); hist.redo.push(e); return applyHist(e, true); }
  const trackItems = (items) => items.map(it => it && it !== '-' && it.run ? { ...it, run: () => track(it.run) } : it);
  const saveCell = (...a) => track(() => saveCell0(...a));
  const addRow = (...a) => track(() => addRow0(...a));
  const sortBy = (...a) => track(() => sortBy0(...a));
  const pasteGrid = (...a) => track(() => pasteGrid0(...a));
  const mergeRange = () => track(mergeRange0);
  const unmerge = () => track(unmerge0);
  const addColumn = (...a) => track(() => addColumn0(...a));
  async function delRow(ri) {
    const n = ri + 1;
    await track(() => delRow0(ri));
    const e = hist.undo.at(-1);
    toast(`Đã xoá dòng ${n}`, 'info', { action: { label: 'Hoàn tác', run: () => undoEntry(e) } });
  }
  const onUndoKey = (e) => {
    if (!el.isConnected || !(e.ctrlKey || e.metaKey) || e.altKey || phone) return;
    const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'y') return;
    if (document.querySelector('.modal-wrap, .cmt-pop')) return;
    const a = document.activeElement;
    if (a && a !== document.body && !gridBox.contains(a) && a.closest('input, textarea, select, [contenteditable]')) return;
    if (a?.isContentEditable && gridBox.contains(a)) {
      const td = a.closest('td'), ri = +td.parentElement.getAttribute('data-i');
      if (a.textContent !== rawOf(ri, td.getAttribute('data-key'))) return;   // đang gõ dở trong ô: để trình duyệt hoàn tác chữ
      a.blur();
    }
    e.preventDefault();
    if (k === 'y' || e.shiftKey) redo(); else undo();
  };
  document.addEventListener('keydown', onUndoKey);

  // ---------- bình luận trên ô ----------
  const addrOf = (ri, key) => colLetter(cols().findIndex(c => c.key === key)) + (ri + 1);
  function paintComments() {
    gridBox.querySelectorAll('.cmt-dot').forEach(x => x.remove());
    if (!cmts.length) return;
    const open = new Map();
    cmts.forEach(c => { if (!c.resolved) open.set(`${c.row_id}:${c.col_key}`, (open.get(`${c.row_id}:${c.col_key}`) || 0) + 1); });
    for (const [k, n] of open) {
      const [rid, key] = k.split(':');
      const td = gridBox.querySelector(`tr[data-row="${rid}"] td[data-key="${key}"]`); if (!td) continue;
      td.append(h('button', { class: 'cmt-dot', title: `${n} bình luận chưa giải quyết – bấm để xem`, onmousedown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); thread(rid, key, td); } }, n > 1 ? n : ''));
    }
  }
  function thread(rid, key, td) {
    if (!cmtOk) { toast(NEED_SQL, 'error'); return; }
    const ri = rows.findIndex(r => r.id === rid), col = cols().find(c => c.key === key);
    if (ri < 0 || !col) return;
    openThread({ table: cur, row: rows[ri], col, addr: addrOf(ri, key), anchor: td, list: () => cmts, onChange: paintComments });
  }
  gridBox.addEventListener('contextmenu', (e) => {
    const td = e.target.closest?.('tbody td[data-key]'); if (!td || phone) return;
    e.preventDefault();
    const rid = td.parentElement.getAttribute('data-row'), key = td.getAttribute('data-key');
    const n = cmts.filter(c => c.row_id === rid && c.col_key === key).length;
    popMenu(td, [{ icon: '💬', label: n ? `Xem bình luận (${n})` : 'Bình luận / giao việc (@tên)', run: () => thread(rid, key, td) },
      { icon: '↶', label: 'Hoàn tác (Ctrl + Z)', run: undo }]);
  });
  async function loadComments() {
    try { cmts = await db.select('cell_comments', { eq: { table_id: cur.id } }); paintComments(); }
    catch { cmtOk = false; return; }
    offs.push(db.subscribe('cell_comments', ['table_id', cur.id], (e) => {
      if (e.type === 'DELETE') cmts = cmts.filter(c => c.id !== e.old.id);
      else { const i = cmts.findIndex(c => c.id === e.new.id); if (i >= 0) cmts[i] = e.new; else cmts.push(e.new); }
      paintComments();
    }));
  }
  // mở từ liên kết (Tin nhắn, Ctrl + K, Kiểm tra số liệu): nhảy tới đúng ô
  function focusFromLink() {
    const f = store.focus; if (!f || f.tableId !== cur?.id) return;
    store.focus = null;
    const ri = rows.findIndex(r => r.id === f.rowId); if (ri < 0) return;
    setTimeout(() => {
      const td = gridBox.querySelector(`tr[data-i="${ri}"] td[data-key="${f.key}"]`); if (!td) return;
      td.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      td.classList.remove('flash'); void td.offsetWidth; td.classList.add('flash');
      setSel(ri, f.key);
      if (f.comment) thread(f.rowId, f.key, td);
    }, 60);
  }

  // ---------- realtime ----------
  async function load() {
    if (!cur && tableId) cur = await db.get('data_tables', tableId);
    if (!cur) { renderGrid(); return; }
    rows = sorted(await db.select('data_rows', { eq: { table_id: cur.id } }));
    renderTools(); renderGrid();
    loadComments(); focusFromLink();
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
  return () => { offs.forEach(f => f()); room.close(); book?.subs.delete(onBook); document.removeEventListener('mouseup', endDrag); document.removeEventListener('keydown', onUndoKey); document.querySelectorAll('.cmt-pop').forEach(x => x.remove()); };
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
  const M = mergeMap(table.columns, rs);
  return h('div', { class: 'sv-scroll' }, h('table', { class: 'sv' },
    h('thead', {}, h('tr', {}, h('th', { class: 'idx' }, '#'), cs.map((c, ci) => h('th', { class: c.type === 'number' || c.formula ? 'num' : '', style: c.type === 'text' ? { minWidth: Math.round((c.width || 120) * 0.7) + 'px' } : null }, c.label || colLetter(table.columns.indexOf(c)))))),
    h('tbody', {}, rs.map((r, ri) => h('tr', { class: highlight?.(r, ri, s) ? 'hl' : '' }, h('td', { class: 'idx' }, ri + 1), cs.map(c => {
      const ci = table.columns.indexOf(c);
      if (M.covered.has(`${ri}:${ci}`)) return null;
      const v = s.get(ri, c.key); c = r.cells?._f?.[c.key] ? { ...c, fmt: r.cells._f[c.key] } : c;
      const td = h('td', { class: `${c.type === 'number' || c.formula || typeof v === 'number' ? 'num' : ''} ${v instanceof FErr ? 'err' : ''}` }, cellText(c, v));
      const a = M.anchors.get(`${ri}:${ci}`);
      if (a) { td.rowSpan = a.rs; td.colSpan = table.columns.slice(a.ci, a.ci + a.cs).filter(x => cs.includes(x)).length || 1; td.classList.add('mg'); }
      return td;
    })))),
    any ? h('tfoot', {}, h('tr', {}, h('td', { class: 'idx' }, 'Σ'), cs.map(c => { const t = showsSum(c) ? s.total(c.key) : null; return h('td', { class: 'num' }, t == null ? '' : fmtValue(t, c)); }))) : null));
}
export { computeSheet };
