// =====================================================================
// Ctrl + K: TÌM MỌI THỨ & CHẠY LỆNH  ·  phím ?: BẢNG PHÍM TẮT
// Tìm trong: mục, bảng & nội dung từng ô, tệp, ghi chú, tin nhắn, bảng trắng, máy + các lệnh nhanh
// Không phân biệt dấu: gõ "giay couche" vẫn ra "Giấy Couche"
// =====================================================================
import db from '../db.js';
import { store, productOf, folderOf, folderPath } from '../store.js';
import { h, fill, modal } from '../ui.js';
import { SECTIONS, WORK_SECTIONS } from './templates.js';
import { colLetter, isFormula } from '../formula.js';
import { cellHref, openCell } from './comments.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const go = (hash) => store.actions.go?.(hash);

// ---------- chỉ mục dữ liệu (tải khi mở Ctrl+K lần đầu, dùng lại 2 phút) ----------
let index = null, indexAt = 0, loading = null;
async function loadIndex() {
  if (index && Date.now() - indexAt < 120e3) return index;
  if (loading) return loading;
  loading = (async () => {
    const safe = (p) => p.catch(() => []);
    const [tables, rows, files, notes, messages, boards, items, machines] = await Promise.all([
      safe(db.select('data_tables')), safe(db.selectAll('data_rows')), safe(db.select('files')), safe(db.select('notes')),
      safe(db.select('messages', { order: ['created_at', false] })), safe(db.select('boards')), safe(db.selectAll('board_items')), safe(db.select('machines')),
    ]);
    const byTable = new Map();
    rows.forEach(r => { if (!byTable.has(r.table_id)) byTable.set(r.table_id, []); byTable.get(r.table_id).push(r); });
    byTable.forEach(list => list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    index = { tables, byTable, files, notes, messages: messages.slice(0, 1500), boards, items, machines };
    indexAt = Date.now(); loading = null;
    return index;
  })();
  return loading;
}

// nơi chứa một thư mục → { pid, section } (thư mục của sản phẩm / công ty / tài liệu)
function placeOf(folderId) {
  const root = folderPath(folderId)[0] || folderOf(folderId);
  if (!root) return null;
  return { pid: root.product_id || store.productId, section: root.section, root };
}
const secName = (key) => { const s = SECTIONS.find(x => x.key === key); return s ? (s.n ? s.n + '. ' : '') + s.label : key === 'lecturer' ? 'Tài liệu giảng viên' : key === 'team' ? 'Tài liệu nhóm' : key === 'board' ? 'Bảng trắng' : ''; };

// ---------- lệnh & mục ----------
function commands() {
  const pid = store.productId || store.products[0]?.id, p = productOf(pid);
  const A = store.actions;
  const list = [];
  if (pid) {
    SECTIONS.forEach(s => list.push({ icon: s.n || '◎', label: `Xem: ${s.n ? s.n + '. ' : ''}${s.label}`, sub: p?.name, run: () => go(`#/p/${pid}/${s.key}`) }));
    list.push({ icon: '◎', label: 'Nhập liệu: Tiến độ đồ án', sub: 'Thêm / bớt / sửa các bước', run: () => go(`#/db/${pid}/progress`) });
    WORK_SECTIONS.forEach(s => list.push({ icon: '🗄', label: `Nhập liệu: ${s.n}. ${s.label}`, sub: 'Cơ sở dữ liệu', run: () => go(`#/db/${pid}/${s.key}`) }));
    list.push({ icon: '✅', label: 'Kiểm tra số liệu trước khi nộp', sub: 'Liệt kê ô lỗi / cần xem lại', run: () => go(`#/db/${pid}/check`) });
    list.push({ icon: '📄', label: 'Xuất báo cáo Word / PDF', sub: 'Thuyết minh 8 chương', run: () => go(`#/report/${pid}`) });
  }
  store.products.forEach(pp => pp.id !== pid && list.push({ icon: '⇄', label: `Chuyển sang sản phẩm: ${pp.name}`, run: () => go(`#/p/${pp.id}/overview`) }));
  list.push(
    { icon: '📚', label: 'Tài liệu giảng viên', run: () => go('#/docs/lecturer') },
    { icon: '🗂️', label: 'Tài liệu nhóm', run: () => go('#/docs/team') },
    { icon: '💬', label: 'Tin nhắn nhóm', run: () => go('#/chat') },
    { icon: '✏️', label: 'Bảng trắng nhóm', run: () => go('#/board') },
    { icon: '🗑', label: 'Thùng rác (khôi phục mục đã xoá)', run: () => go('#/trash') },
    { icon: '👤', label: 'Hồ sơ của bạn (tên, màu)', run: () => A.openProfile?.() },
    { icon: '🌓', label: 'Bật / tắt chế độ tối', sub: 'Ctrl + Shift + L', run: () => A.toggleTheme?.() },
    { icon: '⌨', label: 'Bảng phím tắt', sub: 'phím ?', run: openShortcuts },
    { icon: '⇤', label: 'Thu gọn / mở rộng thanh bên trái', sub: 'Ctrl + B', run: () => A.toggleSide?.() },
    { icon: '✦', label: 'Mở Canva của nhóm', run: () => A.openCanva?.() },
  );
  return list.map(c => ({ ...c, group: 'Lệnh & mục', key: norm(c.label + ' ' + (c.sub || '')) }));
}

// ---------- tìm trong dữ liệu ----------
function searchData(ix, q) {
  const out = { 'Ô trong bảng': [], 'Bảng': [], 'Tệp': [], 'Ghi chú': [], 'Tin nhắn': [], 'Bảng trắng': [], 'Máy': [] };
  const has = (s) => norm(s).includes(q);
  const LIM = 12;
  for (const t of ix.tables) {
    const pl = placeOf(t.folder_id), where = [secName(pl?.section), productOf(pl?.pid)?.name].filter(Boolean).join(' · ');
    if (has(t.name) && out['Bảng'].length < LIM) out['Bảng'].push({ icon: '▦', label: t.name, sub: where, run: () => go(cellHref(t)) });
    const rows = ix.byTable.get(t.id) || [];
    rows.forEach((r, ri) => {
      if (out['Ô trong bảng'].length >= 40) return;
      (t.columns || []).forEach((c, ci) => {
        const v = r.cells?.[c.key];
        if (v == null || v === '' || typeof v === 'boolean' || isFormula(v) || !has(v)) return;
        out['Ô trong bảng'].push({ icon: '▤', label: String(v).slice(0, 90), sub: `${t.name} · ô ${colLetter(ci)}${ri + 1} (${c.label})${where ? ' · ' + where : ''}`, run: () => openCell({ tableId: t.id, rowId: r.id, key: c.key }, cellHref(t)) });
      });
    });
  }
  for (const f of ix.files) if (has(f.name) || has(f.description)) {
    if (out['Tệp'].length >= LIM || f.parent_file_id) continue;
    const pl = placeOf(f.folder_id);
    const href = pl?.section === 'lecturer' ? '#/docs/lecturer' : pl?.section === 'team' ? '#/docs/team' : pl ? `#/p/${pl.pid}/${pl.section}/files` : '#/docs/team';
    out['Tệp'].push({ icon: '📄', label: f.name, sub: [secName(pl?.section), productOf(pl?.pid)?.name].filter(Boolean).join(' · '), run: () => go(href) });
  }
  for (const n of ix.notes) if ((has(n.title) || has(n.content)) && out['Ghi chú'].length < LIM) {
    const pl = placeOf(n.folder_id);
    const i = norm(n.content).indexOf(q), snip = i >= 0 ? '…' + String(n.content).slice(Math.max(0, i - 20), i + 60) + '…' : '';
    out['Ghi chú'].push({ icon: '📝', label: n.title || 'Ghi chú', sub: [secName(pl?.section), snip].filter(Boolean).join(' · '), run: () => go(pl ? `#/p/${pl.pid}/${pl.section}/notes/${n.id}` : '#/pick') });
  }
  for (const m of ix.messages) if (has(m.body) && out['Tin nhắn'].length < LIM) out['Tin nhắn'].push({ icon: '💬', label: String(m.body).slice(0, 90), sub: new Date(m.created_at).toLocaleString('vi-VN'), run: () => { store.focusMsg = m.id; go('#/chat'); } });
  for (const b of ix.boards) if (has(b.name) && out['Bảng trắng'].length < LIM) out['Bảng trắng'].push({ icon: '✏️', label: b.name, sub: 'Bảng trắng', run: () => go(`#/board/${b.id}`) });
  for (const it of ix.items) {
    const txt = it.data?.text || Object.values(it.data?.cells || {}).join(' ');
    if (txt && has(txt) && out['Bảng trắng'].length < LIM) out['Bảng trắng'].push({ icon: '🟨', label: String(txt).replace(/\s+/g, ' ').slice(0, 90), sub: 'Trên ' + (ix.boards.find(b => b.id === it.board_id)?.name || 'bảng trắng'), run: () => go(`#/board/${it.board_id}`) });
  }
  const pid = store.productId || store.products[0]?.id;
  for (const m of ix.machines) if (has(m.name) && out['Máy'].length < LIM) out['Máy'].push({ icon: '⚙', label: m.name, sub: 'Bảng thiết bị', run: () => go(`#/db/${pid}/factory/machines`) });
  return Object.entries(out).flatMap(([g, list]) => list.map(x => ({ ...x, group: g })));
}

// ---------- hộp Ctrl + K ----------
export function openPalette() {
  if (document.querySelector('.pal-wrap')) return;
  let active = 0, results = [], seq = 0;
  const input = h('input', { class: 'pal-in', placeholder: 'Tìm mục, bảng, ô, tệp, ghi chú, tin nhắn… hoặc gõ lệnh', 'aria-label': 'Tìm kiếm', autocomplete: 'off', spellcheck: false });
  const list = h('div', { class: 'pal-list', role: 'listbox' });
  const hint = h('div', { class: 'pal-foot small muted' }, '↑ ↓ chọn · Enter mở · Esc đóng · không cần gõ dấu');
  const wrap = h('div', { class: 'pal-wrap', onmousedown: (e) => { if (e.target === wrap) close(); } }, h('div', { class: 'pal', role: 'dialog', 'aria-label': 'Tìm kiếm nhanh' }, h('div', { class: 'pal-top' }, h('span', { 'aria-hidden': 'true' }, '🔍'), input, h('kbd', {}, 'Esc')), list, hint));
  const close = () => wrap.remove();
  function draw() {
    let g = null;
    fill(list, results.length ? results.map((r, i) => {
      const head = r.group !== g ? h('div', { class: 'pal-g' }, (g = r.group)) : null;
      return [head, h('button', { class: `pal-i ${i === active ? 'on' : ''}`, role: 'option', 'aria-selected': i === active, onmousemove: () => { if (active !== i) { active = i; draw(); } }, onclick: () => pick(i) },
        h('span', { class: 'pal-ic' }, r.icon), h('span', { class: 'grow' }, h('b', {}, r.label), r.sub ? h('small', {}, r.sub) : null))];
    }) : h('div', { class: 'pal-empty small muted' }, input.value.trim().length >= 2 ? (loading ? 'Đang tìm…' : 'Không tìm thấy kết quả.') : 'Gõ ít nhất 2 chữ để tìm trong dữ liệu.'));
    list.querySelector('.pal-i.on')?.scrollIntoView({ block: 'nearest' });
  }
  function pick(i) { const r = results[i]; if (!r) return; close(); r.run(); }
  async function update() {
    const my = ++seq, q = norm(input.value.trim());
    const cmds = commands();
    const words = q.split(/\s+/).filter(Boolean);
    const cm = !q ? cmds : cmds.filter(c => words.every(w => c.key.includes(w))).sort((a, b) => (b.key.startsWith(words[0] || '') - a.key.startsWith(words[0] || '')));
    results = cm.slice(0, q ? 8 : 14); active = 0; draw();
    if (q.length < 2) return;
    const ix = await loadIndex();
    if (my !== seq) return;
    results = [...cm.slice(0, 6), ...searchData(ix, q)]; active = 0; draw();
  }
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(results.length - 1, active + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  document.body.append(wrap);
  input.focus(); update();
  loadIndex().catch(() => {});
}

// ---------- bảng phím tắt ----------
const SHORTCUTS = [
  ['Chung', [['Ctrl + K', 'Tìm mọi thứ / chạy lệnh nhanh'], ['?', 'Mở bảng phím tắt này'], ['Ctrl + Shift + L', 'Bật / tắt chế độ tối'], ['Ctrl + B', 'Thu gọn / mở rộng thanh bên trái'], ['Esc', 'Đóng hộp thoại, menu']]],
  ['Bảng tính (Cơ sở dữ liệu)', [['Enter', 'Lưu ô, xuống ô dưới'], ['Tab / Shift + Tab', 'Sang ô phải / trái'], ['Esc', 'Huỷ chữ đang gõ trong ô'], ['Ctrl + Z', 'Hoàn tác thao tác của bạn'], ['Ctrl + Y · Ctrl + Shift + Z', 'Làm lại'],
    ['Kéo chuột · Shift + nhấp', 'Chọn nhiều ô (để gộp ô)'], ['Ctrl + V', 'Dán nhiều ô từ Excel'], ['Chuột phải vào ô', 'Bình luận / giao việc (@tên)'], ['Bấm đúp ô xám', 'Sửa công thức của ô']]],
  ['Bảng trắng', [['V · H', 'Chọn · Kéo bảng'], ['Giữ phím cách + kéo', 'Kéo bảng (đang ở công cụ nào cũng được)'], ['N · T · R · O', 'Ghi chú · Chữ · Khung · Elip'], ['A · P · B', 'Mũi tên · Bút · Bảng'], ['Enter / F2 / nhấp đúp', 'Sửa chữ'], ['Delete', 'Xoá mục đang chọn'],
    ['Ctrl + Z · Ctrl + Y', 'Hoàn tác · Làm lại'], ['Ctrl + A', 'Chọn tất cả'], ['Ctrl + D', 'Nhân bản'], ['Ctrl + G · Ctrl + Shift + G', 'Nhóm · Bỏ nhóm'], ['Kéo vùng trống · Shift', 'Quét chọn · chọn thêm'],
    ['Chuột phải / giữa + kéo', 'Kéo bảng'], ['Alt khi kéo', 'Tắt tự hút thẳng hàng'], ['Ctrl + lăn chuột', 'Phóng to / thu nhỏ']]],
  ['Tin nhắn', [['Enter', 'Gửi'], ['Shift + Enter', 'Xuống dòng'], ['Esc', 'Huỷ trả lời'], ['Ctrl + V', 'Dán ảnh để gửi']]],
];
export function openShortcuts() {
  if (document.querySelector('.modal-wrap .kbd-grid')) return;
  modal('⌨ Phím tắt', h('div', { class: 'kbd-grid' }, SHORTCUTS.map(([g, list]) => h('section', {}, h('h4', {}, g),
    h('table', { class: 'kbd-t' }, list.map(([k, d]) => h('tr', {}, h('td', {}, k.split(' · ').map((x, i) => [i ? ' · ' : null, ...x.split(' + ').map((y, j) => [j ? ' + ' : null, h('kbd', {}, y)])])), h('td', {}, d))))))),
  [{ label: 'Đóng', value: 1, primary: true }]);
}

// Phím tắt toàn cục: Ctrl+K, ?, Ctrl+Shift+L
export function installGlobalKeys() {
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && k === 'k') { e.preventDefault(); openPalette(); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'l') { e.preventDefault(); store.actions.toggleTheme?.(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && k === 'b' && !document.activeElement?.closest?.('textarea, input')) { e.preventDefault(); store.actions.toggleSide?.(); return; }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      const a = document.activeElement;
      if (a && (a.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"], .wb-canvas') || a.isContentEditable)) return;
      if (document.querySelector('.modal-wrap, .pal-wrap')) return;
      e.preventDefault(); openShortcuts();
    }
  });
}
