import db, { logActivity } from '../db.js';
import { store } from '../store.js';
import { h, toast, toastErr, prompt, confirmBox, modal, throttle, popMenu, esc, fill, downloadNote } from '../ui.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); return e; };
const COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa', '#1f2937', '#dc2626', '#2563eb', '#059669'];
const TOOLS = [
  ['select', '🖱️ Chọn', 'V'], ['pan', '✋ Kéo', 'H'], ['sticky', '🟨 Ghi chú', 'N'], ['text', '🔤 Chữ', 'T'],
  ['rect', '▭ Khung', 'R'], ['ellipse', '◯ Elip', 'O'], ['arrow', '➜ Mũi tên', 'A'], ['path', '✏️ Bút', 'P'], ['table', '▦ Bảng', 'B'],
];
const BOX = new Set(['sticky', 'text', 'rect', 'ellipse']);
const RECT = new Set([...BOX, 'group', 'image', 'table']);   // hình có x, y, w, h
const IMG_SIDE = 1920, IMG_MAX_MB = 20;
const GROUP_HEAD = 40;
const FONTS = [
  ['Montserrat', "'Montserrat', sans-serif"], ['Roboto', "'Roboto', sans-serif"], ['Arial', 'Arial, Helvetica, sans-serif'],
  ['Bitter (có chân)', "'Bitter', serif"], ['Lora (có chân)', "'Lora', serif"], ['Times New Roman', "'Times New Roman', Times, serif"],
  ['Patrick Hand (viết tay)', "'Patrick Hand', cursive"], ['Dancing Script (bay bướm)', "'Dancing Script', cursive"], ['Anonymous Pro (đơn cách)', "'Anonymous Pro', monospace"],
];
// ---------- bảng (table) trên bảng trắng: cw = độ rộng cột, rh = chiều cao hàng, cells["r,c"] = chữ, mg = [[r, c, số hàng, số cột]] ô gộp ----------
const TK = (r, c) => r + ',' + c;
const sum = (a) => a.reduce((t, v) => t + v, 0);
const tMerges = (d) => (d.mg || []).filter(m => m[2] * m[3] > 1);
const tOwner = (d, r, c) => tMerges(d).find(([mr, mc, rs, cs]) => r >= mr && r < mr + rs && c >= mc && c < mc + cs);
function tGeom(d) { const xs = [d.x], ys = [d.y]; d.cw.forEach(w => xs.push(xs.at(-1) + w)); d.rh.forEach(v => ys.push(ys.at(-1) + v)); return { xs, ys }; }
function tFit(d, q) {
  let { r0, r1, c0, c1 } = q, grow = true;
  r0 = Math.max(0, r0); c0 = Math.max(0, c0); r1 = Math.min(d.rh.length - 1, r1); c1 = Math.min(d.cw.length - 1, c1);
  while (grow) {
    grow = false;
    for (const [mr, mc, rs, cs] of tMerges(d)) {
      if (mr > r1 || mr + rs - 1 < r0 || mc > c1 || mc + cs - 1 < c0) continue;
      const n = [Math.min(r0, mr), Math.max(r1, mr + rs - 1), Math.min(c0, mc), Math.max(c1, mc + cs - 1)];
      if (n[0] !== r0 || n[1] !== r1 || n[2] !== c0 || n[3] !== c1) { [r0, r1, c0, c1] = n; grow = true; }
    }
  }
  return { ...q, r0, r1, c0, c1 };
}
// chèn (delta = 1) hoặc xoá (delta = -1) một hàng ('r') / cột ('c') ở vị trí at; ô gộp tự giãn / co như Excel / Word
function tLine(d, axis, at, delta) {
  const isR = axis === 'r';
  const remap = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      const [r, c] = k.split(',').map(Number); let i = isR ? r : c;
      if (delta > 0) { if (i >= at) i++; }
      else if (i === at) { const m = tOwner(d, r, c); if (!(m && m[0] === r && m[1] === c && (isR ? m[2] : m[3]) > 1)) continue; }
      else if (i > at) i--;
      out[isR ? TK(i, c) : TK(r, i)] = v;
    }
    return out;
  };
  const mg = [];
  for (const [r, c, rs, cs] of tMerges(d)) {
    let s = isR ? r : c, n = isR ? rs : cs;
    if (delta > 0) { if (s >= at) s++; else if (at < s + n) n++; }
    else { if (s > at) s--; else if (at < s + n) n--; }
    const m = isR ? [s, c, n, cs] : [r, s, rs, n];
    if (m[2] * m[3] > 1) mg.push(m);
  }
  const cw = [...d.cw], rh = [...d.rh], arr = isR ? rh : cw;
  if (delta > 0) arr.splice(at, 0, arr[Math.min(at, arr.length - 1)] || (isR ? 40 : 120)); else arr.splice(at, 1);
  return { cells: remap(d.cells), al: remap(d.al), mg, cw, rh, w: sum(cw), h: sum(rh) };
}
const fontCss = (name) => (FONTS.find(f => f[0] === name) || FONTS[0])[1];
const TEXT_COLORS = ['#1f2937', '#ffffff', '#64748b', '#dc2626', '#ea580c', '#ca8a04', '#059669', '#2563eb', '#7c3aed', '#db2777'];
// Kiểu chữ mặc định theo loại hình
const defStyle = (kind) => ({ size: kind === 'text' ? 20 : 15, align: kind === 'rect' || kind === 'ellipse' ? 'center' : 'left', valign: kind === 'rect' || kind === 'ellipse' ? 'middle' : 'top' });
const styleOf = (it) => ({ font: 'Montserrat', bold: false, italic: false, underline: false, ...defStyle(it.kind), ...Object.fromEntries(Object.entries(it.data).filter(([k]) => ['font', 'size', 'bold', 'italic', 'underline', 'align', 'valign', 'tcolor'].includes(k))) });

export function mountBoards(el, { folder, sub, go }) {
  let boards = [], board = null, items = new Map(), sel = null;
  const selSet = new Set();   // các đối tượng đang chọn (Shift + nhấp hoặc Shift + kéo vùng để chọn nhiều)
  const selectOnly = (id) => { selSet.clear(); if (id) selSet.add(id); sel = id || null; };
  let tool = 'select', color = COLORS[0];
  let tsel = null;   // ô đang chọn trong bảng { id, r0, r1, c0, c1 }
  const tcur = () => { if (!tsel || sel !== tsel.id || selSet.size !== 1) return null; const it = items.get(tsel.id); return it?.kind === 'table' ? tFit(it.data, tsel) : null; };
  let view = { x: 40, y: 30, z: 1 };
  const offs = [];
  const root = h('div', { class: 'wb' });
  el.append(root);
  const pick = h('div', { class: 'wb-pick' });
  const bar = h('div', { class: 'wb-bar' });
  const fmt = h('div', { class: 'wb-fmt' });
  const canvas = h('div', { class: 'wb-canvas tool-select', tabindex: 0 });
  const svg = S('svg');
  const world = S('g');
  svg.append(world); canvas.append(svg);
  const zoomBox = h('div', { class: 'wb-zoom' });
  canvas.append(zoomBox);
  root.append(pick, bar, fmt, canvas);
  let room = null; const cursors = new Map();

  // ---------- danh sách bảng ----------
  function renderPick() {
    fill(pick, h('b', { class: 'small muted' }, 'Bảng:'),
      boards.map(b => h('button', { class: `dt-pill ${board?.id === b.id ? 'on' : ''}`, onclick: () => openBoard(b.id), oncontextmenu: (e) => { e.preventDefault(); boardMenu(b, e.currentTarget); } }, b.name)),
      h('button', { class: 'btn btn-sm', onclick: newBoard }, '＋ Bảng mới'),
      board ? h('button', { class: 'icon-btn', title: 'Tuỳ chọn bảng', onclick: (e) => boardMenu(board, e.currentTarget) }, '⋯') : null);
  }
  async function newBoard() {
    const name = await prompt('Bảng trắng mới', 'Tên bảng', 'Sơ đồ quy trình');
    if (!name) return;
    try { const b = await db.insert('boards', { folder_id: folder.id, name, created_by: store.user.id }); logActivity(store.user, 'tạo bảng trắng', name); if (!boards.some(x => x.id === b.id)) boards.push(b); openBoard(b.id); } catch (e) { toastErr(e); }
  }
  function boardMenu(b, anchor) {
    popMenu(anchor, [
      { icon: '✏️', label: 'Đổi tên', run: async () => { const n = await prompt('Đổi tên bảng', 'Tên', b.name); if (n) { await db.update('boards', b.id, { name: n }).catch(toastErr); b.name = n; renderPick(); } } },
      { icon: '🖼️', label: 'Tải ảnh SVG', run: exportSvg },
      { icon: '🎯', label: 'Về giữa / vừa khung', run: fit },
      '-',
      { icon: '🗑️', label: 'Xoá bảng', danger: true, run: async () => { if (await confirmBox('Xoá bảng trắng?', `Xoá “${b.name}” và mọi nội dung trên bảng?`)) { await db.remove('boards', b.id).catch(toastErr); boards = boards.filter(x => x.id !== b.id); openBoard(boards[0]?.id); } } },
    ]);
  }

  // ---------- thanh công cụ ----------
  function renderBar() {
    fill(bar, 
      TOOLS.map(([k, label, key]) => h('button', { class: `wb-tool ${tool === k ? 'on' : ''}`, title: `${label} (${key})`, onclick: () => setTool(k) }, label)),
      h('button', { class: 'wb-tool', disabled: !board, title: 'Thêm hình từ máy (hoặc dán Ctrl + V / kéo thả ảnh vào bảng)', onclick: () => imgPicker.click() }, '🖼 Hình'),
      h('span', { class: 'wb-sep' }),
      h('button', { class: 'wb-tool', disabled: !board || !undoStack.length, title: 'Hoàn tác thao tác trước của bạn (Ctrl + Z)', onclick: undo }, '↶'),
      h('button', { class: 'wb-tool', disabled: !board || !redoStack.length, title: 'Làm lại (Ctrl + Y hoặc Ctrl + Shift + Z)', onclick: redo }, '↷'),
      h('span', { class: 'wb-sep' }),
      COLORS.map(c => h('span', { class: `swatch ${color === c ? 'on' : ''}`, style: { background: c }, title: 'Màu', onclick: () => { color = c; selSet.forEach(id => { if (items.get(id)) patch(id, { color: c }, true); }); renderBar(); } })),
      h('span', { class: 'wb-sep' }),
      h('button', { class: 'wb-tool', disabled: !selSet.size, title: 'Xoá (Delete)', onclick: delSel }, '🗑️'),
      h('button', { class: 'wb-tool', disabled: !sel, title: 'Đưa lên trên', onclick: () => sel && patchZ(sel) }, '⬆️'),
      h('button', { class: 'wb-tool', disabled: !sel, title: 'Nhân bản (Ctrl+D)', onclick: dup }, '⧉'),
      h('span', { class: 'wb-sep' }),
      h('button', { class: 'wb-tool', disabled: ![...selSet].some(id => items.get(id)?.kind !== 'group'), title: 'Gom các mục đang chọn thành nhóm có tiêu đề (Ctrl+G)', onclick: makeGroup }, '▣ Nhóm'),
      h('button', { class: 'wb-tool', disabled: ![...selSet].some(id => items.get(id)?.kind === 'group'), title: 'Bỏ khung nhóm, giữ lại các ghi chú bên trong (Ctrl+Shift+G)', onclick: ungroup }, 'Bỏ nhóm'),
      h('div', { class: 'grow' }),
      h('span', { class: 'small muted' }, 'Kéo vùng trống để quét chọn (Shift để chọn thêm) · chuột phải/giữa hoặc ✋ để kéo bảng · Nhấp đúp hoặc Enter để sửa chữ'));
    renderFmt();
    fill(zoomBox, h('button', { class: 'icon-btn', onclick: () => zoomAt(1 / 1.2) }, '－'), h('span', { class: 'small', style: { padding: '4px 6px', minWidth: '44px', textAlign: 'center' } }, Math.round(view.z * 100) + '%'), h('button', { class: 'icon-btn', onclick: () => zoomAt(1.2) }, '＋'), h('button', { class: 'icon-btn', title: 'Vừa khung', onclick: fit }, '⤢'));
  }
  // ---------- căn hàng ----------
  const rectOf = (d) => ({ x: Math.min(d.x, d.x + d.w), y: Math.min(d.y, d.y + d.h), w: Math.abs(d.w), h: Math.abs(d.h) });
  function snapMove(dr, dx, dy) {
    const moving = [...dr.origs].filter(([id]) => RECT.has(items.get(id)?.kind)).map(([, o]) => rectOf(o));
    if (!moving.length) return { dx, dy, guides: [] };
    const x0 = Math.min(...moving.map(b => b.x)) + dx, y0 = Math.min(...moving.map(b => b.y)) + dy;
    const x1 = Math.max(...moving.map(b => b.x + b.w)) + dx, y1 = Math.max(...moving.map(b => b.y + b.h)) + dy;
    const others = [...items.values()].filter(it => RECT.has(it.kind) && !dr.origs.has(it.id) && it.id !== 'temp').map(bbox);
    const T = 6 / view.z;
    const mx = [x0, (x0 + x1) / 2, x1], my = [y0, (y0 + y1) / 2, y1];
    let bx = null, by = null;
    for (const o of others) {
      for (const tx of [o.x, o.x + o.w / 2, o.x + o.w]) for (const m of mx) { const d = tx - m; if (Math.abs(d) <= T && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d }; }
      for (const ty of [o.y, o.y + o.h / 2, o.y + o.h]) for (const m of my) { const d = ty - m; if (Math.abs(d) <= T && (!by || Math.abs(d) < Math.abs(by.d))) by = { d }; }
    }
    const sdx = dx + (bx ? bx.d : 0), sdy = dy + (by ? by.d : 0);
    const guides = [];
    const X0 = x0 + (bx ? bx.d : 0), X1 = x1 + (bx ? bx.d : 0), Y0 = y0 + (by ? by.d : 0), Y1 = y1 + (by ? by.d : 0);
    const E = 0.5 / view.z;
    if (bx) for (const gx of [X0, (X0 + X1) / 2, X1]) {
      const hits = others.filter(o => [o.x, o.x + o.w / 2, o.x + o.w].some(v => Math.abs(v - gx) < E));
      if (hits.length) guides.push({ x1: gx, x2: gx, y1: Math.min(Y0, ...hits.map(o => o.y)) - 12 / view.z, y2: Math.max(Y1, ...hits.map(o => o.y + o.h)) + 12 / view.z });
    }
    if (by) for (const gy of [Y0, (Y0 + Y1) / 2, Y1]) {
      const hits = others.filter(o => [o.y, o.y + o.h / 2, o.y + o.h].some(v => Math.abs(v - gy) < E));
      if (hits.length) guides.push({ y1: gy, y2: gy, x1: Math.min(X0, ...hits.map(o => o.x)) - 12 / view.z, x2: Math.max(X1, ...hits.map(o => o.x + o.w)) + 12 / view.z });
    }
    return { dx: sdx, dy: sdy, guides };
  }
  // Dời một mục (và nội dung nếu là nhóm) đi (dx, dy); trả về danh sách id đã đổi
  function shiftItem(it, dx, dy, skip, out) {
    touch(it.id);
    const d = it.data;
    if (RECT.has(it.kind)) Object.assign(d, { x: Math.round(d.x + dx), y: Math.round(d.y + dy) });
    else if (it.kind === 'arrow') Object.assign(d, d.from ? {} : { x1: d.x1 + dx, y1: d.y1 + dy }, d.to ? {} : { x2: d.x2 + dx, y2: d.y2 + dy });
    else Object.assign(d, { dx: (d.dx || 0) + dx, dy: (d.dy || 0) + dy });
    out.add(it.id);
  }
  function alignSel(mode) {
    const sels = [...selSet].map(id => items.get(id)).filter(it => it && RECT.has(it.kind));
    if (sels.length < 2) return;
    const bs = new Map(sels.map(it => [it.id, bbox(it)]));
    // nội dung các nhóm được chọn (đi theo nhóm), tính trước khi dời
    const inner = new Map(sels.filter(it => it.kind === 'group').map(g => [g.id, contents(g).filter(c => !selSet.has(c.id))]));
    const all = [...bs.values()];
    const L = Math.min(...all.map(b => b.x)), R = Math.max(...all.map(b => b.x + b.w)), Tp = Math.min(...all.map(b => b.y)), Bt = Math.max(...all.map(b => b.y + b.h));
    const moves = new Map();
    if (mode === 'dh' || mode === 'dv') {
      if (sels.length < 3) return;
      const hz = mode === 'dh';
      const sorted = [...sels].sort((a, b) => hz ? bs.get(a.id).x + bs.get(a.id).w / 2 - bs.get(b.id).x - bs.get(b.id).w / 2 : bs.get(a.id).y + bs.get(a.id).h / 2 - bs.get(b.id).y - bs.get(b.id).h / 2);
      const total = sorted.reduce((t, it) => t + (hz ? bs.get(it.id).w : bs.get(it.id).h), 0);
      const gap = ((hz ? R - L : Bt - Tp) - total) / (sorted.length - 1);
      let cur = hz ? L : Tp;
      for (const it of sorted) { const b = bs.get(it.id); moves.set(it.id, hz ? [cur - b.x, 0] : [0, cur - b.y]); cur += (hz ? b.w : b.h) + gap; }
    } else {
      for (const it of sels) {
        const b = bs.get(it.id);
        const dx = mode === 'l' ? L - b.x : mode === 'c' ? (L + R) / 2 - (b.x + b.w / 2) : mode === 'r' ? R - (b.x + b.w) : 0;
        const dy = mode === 't' ? Tp - b.y : mode === 'm' ? (Tp + Bt) / 2 - (b.y + b.h / 2) : mode === 'b' ? Bt - (b.y + b.h) : 0;
        moves.set(it.id, [dx, dy]);
      }
    }
    const changed = new Set();
    for (const it of sels) {
      const [dx, dy] = moves.get(it.id) || [0, 0]; if (!dx && !dy) continue;
      shiftItem(it, dx, dy, null, changed);
      (inner.get(it.id) || []).forEach(c => shiftItem(c, dx, dy, null, changed));
    }
    redraw();
    changed.forEach(id => { const it = items.get(id); if (it) { if (it.kind === 'arrow') freezeArrow(it.data); patch(id, it.data); } });
  }
  function alignBar() {
    const n = [...selSet].filter(id => RECT.has(items.get(id)?.kind)).length;
    const I = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">${body}</svg>`;
    const B = (mode, title, icon, dis) => h('button', { class: 'wb-tool fmt-i', title, disabled: dis, onclick: () => alignSel(mode), html: I(icon) });
    return [h('span', { class: 'fmt-lb' }, `Căn hàng · ${n} mục`),
      B('l', 'Căn trái', '<path d="M2 1.5v13"/><rect x="4" y="3.5" width="9" height="3" rx=".6"/><rect x="4" y="9.5" width="5.5" height="3" rx=".6"/>'),
      B('c', 'Căn giữa (theo chiều ngang)', '<path d="M8 1.5v13"/><rect x="2.5" y="3.5" width="11" height="3" rx=".6"/><rect x="4.5" y="9.5" width="7" height="3" rx=".6"/>'),
      B('r', 'Căn phải', '<path d="M14 1.5v13"/><rect x="3" y="3.5" width="9" height="3" rx=".6"/><rect x="6.5" y="9.5" width="5.5" height="3" rx=".6"/>'),
      h('span', { class: 'wb-sep' }),
      B('t', 'Căn trên', '<path d="M1.5 2h13"/><rect x="3.5" y="4" width="3" height="9" rx=".6"/><rect x="9.5" y="4" width="3" height="5.5" rx=".6"/>'),
      B('m', 'Căn giữa (theo chiều dọc)', '<path d="M1.5 8h13"/><rect x="3.5" y="2.5" width="3" height="11" rx=".6"/><rect x="9.5" y="4.5" width="3" height="7" rx=".6"/>'),
      B('b', 'Căn dưới', '<path d="M1.5 14h13"/><rect x="3.5" y="3" width="3" height="9" rx=".6"/><rect x="9.5" y="6.5" width="3" height="5.5" rx=".6"/>'),
      h('span', { class: 'wb-sep' }),
      B('dh', 'Giãn đều theo chiều ngang (từ 3 mục)', '<path d="M1.5 2v12M14.5 2v12"/><rect x="6.5" y="4.5" width="3" height="7" rx=".6"/>', n < 3),
      B('dv', 'Giãn đều theo chiều dọc (từ 3 mục)', '<path d="M2 1.5h12M2 14.5h12"/><rect x="4.5" y="6.5" width="7" height="3" rx=".6"/>', n < 3),
      h('span', { class: 'small muted', style: { marginLeft: '8px' } }, 'Kéo gần mục khác sẽ tự hút thẳng hàng · giữ Alt để tắt')];
  }

  // ---------- thanh định dạng chữ ----------
  function renderFmt() {
    const it = sel ? items.get(sel) : null;
    const on = !!(it && BOX.has(it.kind) && selSet.size === 1);
    fmt.classList.toggle('off', !on);
    if (it?.kind === 'table' && selSet.size === 1) { fmt.classList.remove('off'); fill(fmt, tableBar(it)); return; }
    if (!on && [...selSet].filter(id => RECT.has(items.get(id)?.kind)).length >= 2) { fmt.classList.remove('off'); fill(fmt, alignBar()); return; }
    if (!on) { fill(fmt, h('span', { class: 'small muted' }, 'Chọn một ghi chú, chữ, khung hoặc elip để chỉnh kiểu chữ.')); return; }
    const st = styleOf(it);
    const set = (p) => patch(it.id, p, true).then(() => renderFmt());
    const tog = (k, label, title, css) => h('button', { class: `wb-tool fmt-b ${st[k] ? 'on' : ''}`, title, style: css, onclick: () => set({ [k]: !st[k] }) }, label);
    const al = (k, v, icon, title) => h('button', { class: `wb-tool fmt-i ${st[k] === v ? 'on' : ''}`, title, onclick: () => set({ [k]: v }), html: icon });
    const fontSel = h('select', { class: 'input fmt-font', title: 'Phông chữ', onchange: () => set({ font: fontSel.value }) },
      FONTS.map(([n, css]) => h('option', { value: n, selected: n === st.font, style: { fontFamily: css } }, n)));
    const sizeIn = h('input', { class: 'input fmt-size', type: 'number', min: 8, max: 120, value: st.size, title: 'Cỡ chữ', onchange: () => { const v = Math.min(120, Math.max(8, Math.round(+sizeIn.value || st.size))); set({ size: v }); } });
    const colIn = h('input', { type: 'color', class: 'fmt-color', title: 'Màu khác…', value: /^#[0-9a-f]{6}$/i.test(st.tcolor || '') ? st.tcolor : '#1f2937', onchange: () => set({ tcolor: colIn.value }) });
    const L = (a, b, c) => `<svg viewBox="0 0 16 16" width="16" height="16"><path d="M${a} 3h${b}M2 6.5h12M${c} 10h${16 - 2 * c}M2 13.5h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    const V = (y) => `<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 ${y}h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    fill(fmt,
      h('span', { class: 'fmt-lb' }, 'Chữ'),
      fontSel,
      h('button', { class: 'wb-tool fmt-i', title: 'Nhỏ hơn', onclick: () => set({ size: Math.max(8, st.size - 2) }) }, 'A−'),
      sizeIn,
      h('button', { class: 'wb-tool fmt-i', title: 'Lớn hơn', onclick: () => set({ size: Math.min(120, st.size + 2) }) }, 'A+'),
      h('span', { class: 'wb-sep' }),
      tog('bold', 'B', 'Đậm', { fontWeight: 800 }), tog('italic', 'I', 'Nghiêng', { fontStyle: 'italic', fontFamily: 'Georgia, serif' }), tog('underline', 'U', 'Gạch chân', { textDecoration: 'underline' }),
      h('span', { class: 'wb-sep' }),
      al('align', 'left', L(2, 9, 2), 'Căn trái'), al('align', 'center', L(4.5, 7, 4), 'Căn giữa'), al('align', 'right', L(7, 7, 6), 'Căn phải'),
      h('span', { class: 'wb-sep' }),
      al('valign', 'top', V(4.5), 'Căn trên'), al('valign', 'middle', V(8), 'Căn giữa theo chiều dọc'), al('valign', 'bottom', V(11.5), 'Căn dưới'),
      h('span', { class: 'wb-sep' }),
      h('span', { class: 'fmt-lb' }, 'Màu chữ'),
      h('button', { class: `wb-tool fmt-i ${!st.tcolor ? 'on' : ''}`, title: 'Tự động (theo nền)', onclick: () => set({ tcolor: null }) }, 'Tự động'),
      TEXT_COLORS.map(c => h('span', { class: `swatch sm ${st.tcolor === c ? 'on' : ''}`, style: { background: c }, title: c, onclick: () => set({ tcolor: c }) })),
      colIn);
  }
  function tableBar(it) {
    const d = it.data, R0 = d.rh.length, C0 = d.cw.length, T = tcur();
    const at = T || { r0: R0 - 1, r1: R0 - 1, c0: C0 - 1, c1: C0 - 1 };
    const set = (nd, keep) => { if (!keep) tsel = null; patch(it.id, nd, true).then(() => renderFmt()); };
    const B = (label, title, run, dis) => h('button', { class: 'wb-tool fmt-i', title, disabled: dis, onclick: run }, label);
    const delLines = (axis) => { let nd = d; const a = axis === 'r' ? at.r0 : at.c0, b = axis === 'r' ? at.r1 : at.c1; for (let i = b; i >= a; i--) nd = { ...nd, ...tLine(nd, axis, i, -1) }; set(nd); };
    const hitM = T ? tMerges(d).filter(([r, c, rs, cs]) => r <= T.r1 && r + rs - 1 >= T.r0 && c <= T.c1 && c + cs - 1 >= T.c0) : [];
    const merge = () => {
      if (!T) return;
      const cells = { ...(d.cells || {}) }, texts = [];
      for (let r = T.r0; r <= T.r1; r++) for (let c = T.c0; c <= T.c1; c++) { const v = cells[TK(r, c)]; if (v && String(v).trim()) texts.push(v); delete cells[TK(r, c)]; }
      if (texts.length) cells[TK(T.r0, T.c0)] = texts.join('\n');   // như Word: gộp ô thì nối chữ các ô lại, không mất chữ
      const mg = tMerges(d).filter(([r, c]) => !(r >= T.r0 && r <= T.r1 && c >= T.c0 && c <= T.c1));
      mg.push([T.r0, T.c0, T.r1 - T.r0 + 1, T.c1 - T.c0 + 1]);
      const al = { ...(d.al || {}) }; if (!al[TK(T.r0, T.c0)]) al[TK(T.r0, T.c0)] = 'center';
      tsel = { id: it.id, r0: T.r0, c0: T.c0, r1: T.r1, c1: T.c1 };
      set({ cells, mg, al }, true);
    };
    const unmerge = () => { tsel = { id: it.id, r0: T.r0, c0: T.c0, r1: T.r0, c1: T.c0 }; set({ mg: tMerges(d).filter(m => !hitM.includes(m)) }, true); };
    const align = (v) => { if (!T) return; const al = { ...(d.al || {}) }; for (let r = T.r0; r <= T.r1; r++) for (let c = T.c0; c <= T.c1; c++) al[TK(r, c)] = v; set({ al }, true); };
    const size = d.size || 14;
    const L = (a, b, c) => `<svg viewBox="0 0 16 16" width="16" height="16"><path d="M${a} 3h${b}M2 6.5h12M${c} 10h${16 - 2 * c}M2 13.5h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    const AL = (v, icon, title) => h('button', { class: 'wb-tool fmt-i', title, disabled: !T, onclick: () => align(v), html: icon });
    return [h('span', { class: 'fmt-lb' }, `Bảng ${R0}×${C0}` + (T ? ` · chọn ${T.r1 - T.r0 + 1}×${T.c1 - T.c0 + 1} ô` : '')),
      B('＋ Hàng trên', 'Chèn hàng phía trên ô đang chọn', () => set(tLine(d, 'r', at.r0, 1))),
      B('＋ Hàng dưới', 'Chèn hàng phía dưới ô đang chọn', () => set(tLine(d, 'r', at.r1 + 1, 1))),
      B('＋ Cột trái', 'Chèn cột bên trái ô đang chọn', () => set(tLine(d, 'c', at.c0, 1))),
      B('＋ Cột phải', 'Chèn cột bên phải ô đang chọn', () => set(tLine(d, 'c', at.c1 + 1, 1))),
      B('− Hàng', 'Xoá các hàng đang chọn', () => delLines('r'), !T || T.r1 - T.r0 + 1 >= R0),
      B('− Cột', 'Xoá các cột đang chọn', () => delLines('c'), !T || T.c1 - T.c0 + 1 >= C0),
      h('span', { class: 'wb-sep' }),
      B('⊞ Gộp ô', 'Gộp các ô đang chọn thành một ô (chữ trong các ô được nối lại)', merge, !T || (T.r0 === T.r1 && T.c0 === T.c1)),
      B('⊟ Tách ô', 'Tách ô đã gộp', unmerge, !hitM.length),
      h('span', { class: 'wb-sep' }),
      AL('left', L(2, 9, 2), 'Căn trái các ô đang chọn'), AL('center', L(4.5, 7, 4), 'Căn giữa các ô đang chọn'), AL('right', L(7, 7, 6), 'Căn phải các ô đang chọn'),
      h('span', { class: 'wb-sep' }),
      h('button', { class: `wb-tool fmt-i ${d.head !== false ? 'on' : ''}`, title: 'Tô màu và in đậm hàng đầu tiên (đổi màu bằng các ô màu ở thanh trên)', onclick: () => set({ head: d.head === false }, true) }, 'Hàng tiêu đề'),
      B('A−', 'Chữ nhỏ hơn', () => set({ size: Math.max(9, size - 1) }, true)), h('span', { class: 'small', style: { minWidth: '22px', textAlign: 'center' } }, size), B('A+', 'Chữ lớn hơn', () => set({ size: Math.min(40, size + 1) }, true)),
      h('span', { class: 'small muted', style: { marginLeft: '8px' } }, 'Nhấp ô để chọn · kéo để chọn nhiều ô · nhấp đúp / gõ phím để nhập · kéo ✥ để di chuyển · kéo đường kẻ để đổi cỡ')];
  }
  async function newTable(p) {
    const rIn = h('input', { class: 'input', type: 'number', min: 1, max: 30, value: 3 }), cIn = h('input', { class: 'input', type: 'number', min: 1, max: 15, value: 3 });
    const r = await modal('Tạo bảng', h('div', { class: 'row', style: { gap: '12px' } }, h('label', { class: 'field grow' }, h('span', {}, 'Số hàng'), rIn), h('label', { class: 'field grow' }, h('span', {}, 'Số cột'), cIn)), [{ label: 'Huỷ', value: null }, { label: 'Tạo bảng', value: 'ok', primary: true }]);
    if (r !== 'ok') return;
    const R0 = Math.min(30, Math.max(1, Math.round(+rIn.value || 3))), C0 = Math.min(15, Math.max(1, Math.round(+cIn.value || 3)));
    const cw = Array(C0).fill(130), rh = Array(R0).fill(40);
    const it = await createItem('table', { x: Math.round(p.x), y: Math.round(p.y), w: sum(cw), h: sum(rh), cw, rh, cells: {}, mg: [], al: {}, head: true, size: 14, color: color === COLORS[0] ? '#bfdbfe' : color });
    if (it) { tsel = { id: it.id, r0: 0, c0: 0, r1: 0, c1: 0 }; redraw(); renderBar(); canvas.focus(); }
  }
  function setTool(t) { tool = t; canvas.className = `wb-canvas tool-${t === 'select' ? 'select' : t === 'pan' ? 'pan' : 'draw'}`; renderBar(); }

  // ---------- vẽ ----------
  const applyView = () => { world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.z})`); renderBar(); placeCursors(); };
  function drawItem(it) {
    let d = it.data; const g = S('g', { class: 'wb-item', 'data-id': it.id });
    const stroke = d.color || '#1f2937';
    if (it.kind === 'image') {
      g.append(S('rect', { x: d.x, y: d.y, width: d.w, height: d.h, fill: '#fff', stroke: '#e2d6c0', 'stroke-width': 1 }));
      const im = S('image', { x: d.x, y: d.y, width: d.w, height: d.h, preserveAspectRatio: 'xMidYMid meet' });
      imgUrl(d.path).then(u => im.setAttribute('href', u)).catch(() => {});
      if (imgCache.get(d.path)?.url) im.setAttribute('href', imgCache.get(d.path).url);
      g.append(im);
    } else if (it.kind === 'group') {
      const col = d.color || COLORS[0];
      g.append(S('rect', { x: d.x, y: d.y, width: d.w, height: d.h, rx: 10, fill: col, 'fill-opacity': .22, stroke: col, 'stroke-width': 2 }));
      g.append(S('path', { d: `M${d.x} ${d.y + GROUP_HEAD} V${d.y + 10} Q${d.x} ${d.y} ${d.x + 10} ${d.y} H${d.x + d.w - 10} Q${d.x + d.w} ${d.y} ${d.x + d.w} ${d.y + 10} V${d.y + GROUP_HEAD} Z`, fill: col, 'fill-opacity': .75 }));
      const fo = S('foreignObject', { x: d.x, y: d.y, width: Math.max(10, d.w), height: GROUP_HEAD });
      const t = document.createElement('div');
      t.style.cssText = `height:100%;display:flex;align-items:center;gap:8px;padding:0 14px;font:700 16px 'Montserrat',sans-serif;color:${isDark(col) ? '#fff' : '#1f2937'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
      t.innerHTML = `<span style="opacity:.6">▣</span><span style="overflow:hidden;text-overflow:ellipsis">${esc(d.text || 'Nhóm chưa đặt tên')}</span><span style="margin-left:auto;font-weight:500;font-size:12px;opacity:.65">${contents(it).filter(c => c.kind !== 'arrow' && c.kind !== 'path').length} mục</span>`;
      fo.append(t); g.append(fo);
    } else if (it.kind === 'table') {
      const { xs, ys } = tGeom(d), head = d.head !== false, col = d.color || '#bfdbfe', fs = d.size || 14;
      g.append(S('rect', { x: d.x, y: d.y, width: d.w, height: d.h, fill: '#fff' }));
      const cov = new Set(); tMerges(d).forEach(([r, c, rs, cs]) => { for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) if (i !== r || j !== c) cov.add(TK(i, j)); });
      for (let r = 0; r < d.rh.length; r++) for (let c = 0; c < d.cw.length; c++) {
        if (cov.has(TK(r, c))) continue;
        const m = tOwner(d, r, c), rs = m ? m[2] : 1, cs = m ? m[3] : 1;
        const X = xs[c], Y = ys[r], W = xs[Math.min(c + cs, d.cw.length)] - X, H = ys[Math.min(r + rs, d.rh.length)] - Y;
        g.append(S('rect', { x: X, y: Y, width: W, height: H, fill: head && r === 0 ? col : '#fff', 'fill-opacity': head && r === 0 ? .7 : 1, stroke: '#94a3b8', 'stroke-width': 1 }));
        const t = d.cells?.[TK(r, c)];
        if (t) {
          const fo = S('foreignObject', { x: X, y: Y, width: Math.max(4, W), height: Math.max(4, H) });
          const div = document.createElement('div');
          div.style.cssText = `width:100%;height:100%;box-sizing:border-box;padding:4px 8px;display:flex;flex-direction:column;justify-content:center;overflow:hidden;font:${head && r === 0 ? 700 : 500} ${fs}px 'Montserrat',sans-serif;color:${head && r === 0 && isDark(col) ? '#fff' : '#1f2937'};text-align:${d.al?.[TK(r, c)] || 'left'};white-space:pre-wrap;word-break:break-word;line-height:1.3;`;
          div.textContent = t; fo.append(div); g.append(fo);
        }
      }
      g.append(S('rect', { x: d.x, y: d.y, width: d.w, height: d.h, fill: 'none', stroke: '#475569', 'stroke-width': 1.6 }));
      const T = tcur();
      if (T && T.id === it.id) g.append(S('rect', { x: xs[T.c0], y: ys[T.r0], width: xs[T.c1 + 1] - xs[T.c0], height: ys[T.r1 + 1] - ys[T.r0], fill: 'rgba(37,99,235,.12)', stroke: '#2563eb', 'stroke-width': 2 / view.z, 'pointer-events': 'none' }));
      if (sel === it.id && selSet.size === 1) {
        const k = 4 / view.z;
        xs.slice(1).forEach((x, i) => g.append(S('rect', { class: 'wb-cgrip', 'data-handle': 'col:' + i, x: x - k, y: d.y, width: 2 * k, height: d.h, fill: 'transparent' })));
        ys.slice(1).forEach((y, i) => g.append(S('rect', { class: 'wb-rgrip', 'data-handle': 'row:' + i, x: d.x, y: y - k, width: d.w, height: 2 * k, fill: 'transparent' })));
        const gx = d.x - 16 / view.z, gy = d.y - 16 / view.z, gr = 11 / view.z;
        g.append(S('circle', { class: 'wb-grip', 'data-handle': 'grip', cx: gx, cy: gy, r: gr }));
        const tt = S('text', { x: gx, y: gy + 5 / view.z, 'text-anchor': 'middle', 'font-size': 14 / view.z, fill: '#fff', 'pointer-events': 'none' }); tt.textContent = '✥'; g.append(tt);
      }
    } else if (it.kind === 'sticky') {
      g.append(S('rect', { x: d.x + 3, y: d.y + 4, width: d.w, height: d.h, rx: 4, fill: 'rgba(0,0,0,.08)' }), S('rect', { x: d.x, y: d.y, width: d.w, height: d.h, rx: 4, fill: d.color || COLORS[0] }));
      g.append(textBox(it, isDark(d.color) ? '#fff' : '#1f2937'));
    } else if (it.kind === 'text') {
      g.append(S('rect', { x: d.x, y: d.y, width: d.w, height: d.h, fill: 'transparent' }));
      g.append(textBox(it, COLORS.indexOf(d.color) < 6 ? '#1f2937' : d.color));
    } else if (it.kind === 'rect') {
      g.append(S('rect', { x: d.x, y: d.y, width: d.w, height: d.h, rx: 6, fill: COLORS.indexOf(d.color) < 6 ? d.color : 'rgba(255,255,255,.6)', stroke: COLORS.indexOf(d.color) < 6 ? '#64748b' : stroke, 'stroke-width': 2 }));
      if (d.text) g.append(textBox(it, '#1f2937'));
    } else if (it.kind === 'ellipse') {
      g.append(S('ellipse', { cx: d.x + d.w / 2, cy: d.y + d.h / 2, rx: Math.abs(d.w / 2), ry: Math.abs(d.h / 2), fill: COLORS.indexOf(d.color) < 6 ? d.color : 'rgba(255,255,255,.6)', stroke: COLORS.indexOf(d.color) < 6 ? '#64748b' : stroke, 'stroke-width': 2 }));
      if (d.text) g.append(textBox(it, '#1f2937'));
    } else if (it.kind === 'arrow') {
      const c = COLORS.indexOf(d.color) < 6 ? '#334155' : stroke;
      const d0 = d; d = { ...d0, ...arrowPts(d0) };
      const ang = Math.atan2(d.y2 - d.y1, d.x2 - d.x1), L = 14;
      g.append(S('line', { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, stroke: 'transparent', 'stroke-width': 14 }));
      g.append(S('line', { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, stroke: c, 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
      g.append(S('path', { d: `M${d.x2},${d.y2} L${d.x2 - L * Math.cos(ang - .4)},${d.y2 - L * Math.sin(ang - .4)} L${d.x2 - L * Math.cos(ang + .4)},${d.y2 - L * Math.sin(ang + .4)} Z`, fill: c }));
    } else if (it.kind === 'path') {
      const c = COLORS.indexOf(d.color) < 6 ? '#334155' : stroke;
      const pts = d.points || [];
      const pd = pts.map((p, i) => (i ? 'L' : 'M') + (p[0] + (d.dx || 0)) + ',' + (p[1] + (d.dy || 0))).join(' ');
      g.append(S('path', { d: pd, stroke: 'transparent', 'stroke-width': 14, fill: 'none' }), S('path', { d: pd, stroke: c, 'stroke-width': d.width || 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    }
    if (selSet.has(it.id)) {
      const b = bbox(it);
      g.append(S('rect', { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8, fill: 'none', stroke: '#2563eb', 'stroke-width': 1.5 / view.z }));
    }
    if (sel === it.id && selSet.size === 1) {
      const b = bbox(it);
      if (RECT.has(it.kind)) g.append(S('rect', { class: 'wb-handle', 'data-handle': 'se', x: b.x + b.w - 5 / view.z, y: b.y + b.h - 5 / view.z, width: 10 / view.z, height: 10 / view.z }));
      if (it.kind === 'arrow') { g.append(S('circle', { class: `wb-handle ${it.data.from ? 'anchored' : ''}`, 'data-handle': 'p1', cx: d.x1, cy: d.y1, r: 6 / view.z }), S('circle', { class: `wb-handle ${it.data.to ? 'anchored' : ''}`, 'data-handle': 'p2', cx: d.x2, cy: d.y2, r: 6 / view.z })); }
    }
    return g;
  }
  function textBox(it, autoCol) {
    const d = it.data, st = styleOf(it);
    const fo = S('foreignObject', { x: Math.min(d.x, d.x + d.w), y: Math.min(d.y, d.y + d.h), width: Math.max(10, Math.abs(d.w)), height: Math.max(10, Math.abs(d.h)) });
    const div = document.createElement('div');
    const jc = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[st.valign] || 'flex-start';
    div.style.cssText = `width:100%;height:100%;padding:10px 12px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:${jc};overflow:hidden;`;
    const inner = document.createElement('div');
    inner.style.cssText = `font-family:${fontCss(st.font)};font-size:${st.size}px;font-weight:${st.bold ? 700 : 500};font-style:${st.italic ? 'italic' : 'normal'};text-decoration:${st.underline ? 'underline' : 'none'};color:${st.tcolor || autoCol};text-align:${st.align};white-space:pre-wrap;word-break:break-word;line-height:1.35;`;
    inner.innerHTML = esc(d.text || '');
    div.append(inner); fo.append(div); return fo;
  }
  const isDark = (c) => ['#1f2937', '#dc2626', '#2563eb', '#059669'].includes(c);
  function bbox(it) {
    const d = it.data;
    if (RECT.has(it.kind)) return { x: Math.min(d.x, d.x + d.w), y: Math.min(d.y, d.y + d.h), w: Math.abs(d.w), h: Math.abs(d.h) };
    if (it.kind === 'arrow') { const q = (d.from || d.to) ? arrowPts(d) : d; return { x: Math.min(q.x1, q.x2), y: Math.min(q.y1, q.y2), w: Math.abs(q.x2 - q.x1), h: Math.abs(q.y2 - q.y1) }; }
    const xs = (d.points || []).map(p => p[0] + (d.dx || 0)), ys = (d.points || []).map(p => p[1] + (d.dy || 0));
    if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  // ---------- mũi tên neo vào ghi chú/khung ----------
  // data.from / data.to = id của mục được neo; đầu mũi tên tự bám theo mép mục khi mục di chuyển
  const anchorOf = (id) => { const t = id && items.get(id); return t && RECT.has(t.kind) ? t : null; };
  const centerOf = (t) => { const b = bbox(t); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
  function edgePoint(t, toward, gap = 6) {
    const b = bbox(t), c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const vx = toward.x - c.x, vy = toward.y - c.y;
    if (!vx && !vy) return c;
    let k;
    if (t.kind === 'ellipse') { const a = b.w / 2, bb = b.h / 2; k = 1 / Math.sqrt((vx * vx) / (a * a) + (vy * vy) / (bb * bb)); }
    else k = Math.min(Math.abs(vx) > 1e-9 ? (b.w / 2) / Math.abs(vx) : Infinity, Math.abs(vy) > 1e-9 ? (b.h / 2) / Math.abs(vy) : Infinity);
    const len = Math.hypot(vx, vy);
    return { x: c.x + vx * k + (vx / len) * gap, y: c.y + vy * k + (vy / len) * gap };
  }
  function arrowPts(d) {
    const A = anchorOf(d.from), B = anchorOf(d.to);
    const ra = A ? centerOf(A) : { x: d.x1, y: d.y1 }, rb = B ? centerOf(B) : { x: d.x2, y: d.y2 };
    const p1 = A ? edgePoint(A, rb) : ra, p2 = B ? edgePoint(B, ra) : rb;
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
  // Mục (ghi chú, chữ, khung, elip, nhóm) nằm dưới điểm p – ưu tiên mục trên cùng, nhóm xét sau
  function itemAt(p, exclude) {
    const list = [...items.values()].filter(it => RECT.has(it.kind) && it.id !== exclude && it.id !== 'temp')
      .sort((a, b) => ((a.kind === 'group') - (b.kind === 'group')) || ((b.z || 0) - (a.z || 0)));
    return list.find(it => { const b = bbox(it); return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }) || null;
  }
  // Ghi lại toạ độ hiện tại vào x1..y2 (để mũi tên vẫn đúng chỗ nếu mục được neo bị xoá)
  const freezeArrow = (d) => Object.assign(d, arrowPts(d));

  // Các mục nằm trong khung nhóm (tâm của mục nằm trong khung) – kéo nhóm thì chúng đi theo
  function contents(grp) {
    const G = bbox(grp);
    const inG = (x, y) => x >= G.x && x <= G.x + G.w && y >= G.y && y <= G.y + G.h;
    return [...items.values()].filter(it => {
      if (it.id === grp.id || it.id === 'temp' || (it.kind === 'group' && (it.z || 0) <= (grp.z || 0))) return false;
      // mũi tên chỉ thuộc nhóm khi cả hai đầu nằm trong khung (mũi tên nối ra ngoài thì giữ nguyên)
      if (it.kind === 'arrow') { const q = arrowPts(it.data); return !(it.data.from && it.data.to) && inG(q.x1, q.y1) && inG(q.x2, q.y2); }
      const b = bbox(it); return inG(b.x + b.w / 2, b.y + b.h / 2);
    });
  }
  function redraw() {
    fill(world, ...[...items.values()].sort((a, b) => (a.z || 0) - (b.z || 0)).map(drawItem));
    if (drag?.hover && items.get(drag.hover)) { const b = bbox(items.get(drag.hover)); world.append(S('rect', { x: b.x - 6, y: b.y - 6, width: b.w + 12, height: b.h + 12, rx: 8, fill: 'none', stroke: '#059669', 'stroke-width': 2.5 / view.z, 'pointer-events': 'none' })); }
    if (drag?.guides?.length) for (const gd of drag.guides) world.append(S('line', { ...gd, stroke: '#e11d74', 'stroke-width': 1.2 / view.z, 'pointer-events': 'none' }));
    if (drag?.mode === 'marquee') { const m = drag.rect; world.append(S('rect', { x: m.x, y: m.y, width: m.w, height: m.h, fill: 'rgba(37,99,235,.08)', stroke: '#2563eb', 'stroke-width': 1 / view.z })); }
    if (!items.size && board) {
      const t = S('text', { x: 40, y: 60, fill: '#94a3b8', 'font-size': 16 }); t.textContent = 'Bảng trống – chọn 🟨 Ghi chú rồi nhấp vào bảng để bắt đầu.'; world.append(t);
    }
  }

  // ---------- toạ độ ----------
  const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z }; };
  function zoomAt(f, cx, cy) {
    const r = canvas.getBoundingClientRect(); cx ??= r.width / 2; cy ??= r.height / 2;
    const nz = Math.min(4, Math.max(0.2, view.z * f));
    view.x = cx - (cx - view.x) * nz / view.z; view.y = cy - (cy - view.y) * nz / view.z; view.z = nz;
    applyView(); redraw();
  }
  function fit() {
    if (!items.size) { view = { x: 40, y: 30, z: 1 }; applyView(); redraw(); return; }
    const bs = [...items.values()].map(bbox);
    const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.w)), y1 = Math.max(...bs.map(b => b.y + b.h));
    const r = canvas.getBoundingClientRect();
    const z = Math.min(2, Math.max(0.2, Math.min((r.width - 80) / Math.max(1, x1 - x0), (r.height - 80) / Math.max(1, y1 - y0))));
    view = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z };
    applyView(); redraw();
  }
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); if (e.ctrlKey || e.metaKey || !e.shiftKey) zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); else { view.x -= e.deltaX || e.deltaY; applyView(); } }, { passive: false });

  // ---------- thao tác chuột ----------
  let drag = null, lastDown = null, lastClick = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!board || e.button > 2 || e.target.closest('.wb-zoom') || e.target.closest('.wb-text-edit')) return;
    canvas.focus();
    const p = toWorld(e);
    const g = e.target.closest('.wb-item');
    const handle = e.target.getAttribute?.('data-handle');
    lastDown = g ? g.getAttribute('data-id') : null;
    canvas.setPointerCapture(e.pointerId);
    if (tool === 'pan' || e.button === 1 || e.button === 2) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; canvas.style.cursor = 'grabbing'; return;
    }
    // Kéo trên vùng trống = quét chọn vùng (giữ Shift để chọn thêm vào các mục đang chọn)
    if (tool === 'select' && !g) {
      if (!e.shiftKey && selSet.size) { selectOnly(null); renderBar(); }
      drag = { mode: 'marquee', start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 }, base: new Set(e.shiftKey ? selSet : []) }; redraw(); return;
    }
    if (tool === 'select' && g) {
      const id = g.getAttribute('data-id'); const it = items.get(id);
      // Nhấp 2 lần vào cùng một mục → sửa chữ (tự nhận, không phụ thuộc sự kiện dblclick của trình duyệt
      // vì bảng vẽ lại sau lần nhấp đầu làm trình duyệt bỏ lỡ nhấp đúp)
      const now = Date.now();
      if (!e.shiftKey && !handle && lastClick && lastClick.id === id && now - lastClick.t < 450 && Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 6 && RECT.has(it.kind) && it.kind !== 'image') {
        lastClick = null; selectOnly(id);
        if (it.kind === 'table') { const c = cellAt(it, p); tsel = { id, r0: c.r, c0: c.c, r1: c.r, c1: c.c }; redraw(); renderBar(); editCell(it, c.r, c.c); return; }
        redraw(); renderBar(); editText(it); return;
      }
      lastClick = { id, t: now, x: e.clientX, y: e.clientY };
      if (e.shiftKey && it.kind === 'table' && tcur()?.id === id) { const a = cellAt(it, null, tsel.r0, tsel.c0), b = cellAt(it, p); tsel = tFit(it.data, { id, r0: Math.min(a.r, b.r), r1: Math.max(a.r + a.rs, b.r + b.rs) - 1, c0: Math.min(a.c, b.c), c1: Math.max(a.c + a.cs, b.c + b.cs) - 1 }); redraw(); renderBar(); return; }
      if (e.shiftKey) { if (selSet.has(id)) { selSet.delete(id); sel = [...selSet].pop() || null; } else { selSet.add(id); sel = id; } redraw(); renderBar(); return; }
      const wasOnly = sel === id && selSet.size === 1;
      if (!selSet.has(id)) selectOnly(id); else sel = id;
      if (tsel && tsel.id !== id) tsel = null;
      // bảng đang được chọn: nhấp vào ô = chọn ô, kéo = chọn nhiều ô (di chuyển bảng bằng nút ✥)
      if (it.kind === 'table' && wasOnly && !handle && !e.shiftKey) { const c = cellAt(it, p); tsel = { id, r0: c.r, c0: c.c, r1: c.r + c.rs - 1, c1: c.c + c.cs - 1 }; drag = { mode: 'cells', id, a: c, start: p }; redraw(); renderBar(); return; }
      if (it.kind === 'table' && !wasOnly) tsel = null;
      redraw(); renderBar();
      if (handle && handle !== 'grip') { drag = { mode: 'resize', handle, id, start: p, orig: structuredClone(it.data) }; return; }
      // kéo: mọi mục đang chọn + những gì nằm trong các nhóm đang chọn
      const ids = new Set(selSet);
      for (const x of selSet) { const gi = items.get(x); if (gi?.kind === 'group') contents(gi).forEach(c => ids.add(c.id)); }
      drag = { mode: 'move', id, start: p, origs: new Map([...ids].filter(x => items.has(x)).map(x => [x, structuredClone(items.get(x).data)])) };
      return;
    }
    // tạo mới
    const base = { color };
    if (tool === 'sticky') { createItem('sticky', { ...base, x: p.x - 90, y: p.y - 70, w: 180, h: 140, text: '' }, true); setTool('select'); return; }
    if (tool === 'table') { newTable(p); setTool('select'); return; }
    if (tool === 'text') { createItem('text', { ...base, color: color, x: p.x, y: p.y - 20, w: 260, h: 60, text: '', size: 20 }, true); setTool('select'); return; }
    if (tool === 'rect' || tool === 'ellipse') drag = { mode: 'create', kind: tool, temp: { id: 'temp', kind: tool, z: 1e9, data: { ...base, x: p.x, y: p.y, w: 1, h: 1, text: '' } }, start: p };
    if (tool === 'arrow') { const A = itemAt(p); drag = { mode: 'create', kind: 'arrow', temp: { id: 'temp', kind: 'arrow', z: 1e9, data: { ...base, x1: p.x, y1: p.y, x2: p.x, y2: p.y, from: A?.id || null, to: null } }, start: p }; }
    if (tool === 'path') drag = { mode: 'create', kind: 'path', temp: { id: 'temp', kind: 'path', z: 1e9, data: { ...base, points: [[Math.round(p.x), Math.round(p.y)]], width: 3 } }, start: p };
    if (drag?.temp) { items.set('temp', drag.temp); redraw(); }
  });
  const sendMove = throttle((id, data) => room?.send({ t: 'move', id, data }), 50);
  const sendMoves = throttle((list) => room?.send({ t: 'moves', list }), 50);
  const sendCursor = throttle((p) => room?.send({ t: 'cur', uid: store.user.id, name: store.me?.display_name, color: store.me?.color, x: p.x, y: p.y }), 60);
  canvas.addEventListener('pointermove', (e) => {
    const p = toWorld(e);
    sendCursor(p);
    if (!drag) return;
    if (drag.mode === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); return; }
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (drag.mode === 'marquee') {
      drag.rect = { x: Math.min(drag.start.x, p.x), y: Math.min(drag.start.y, p.y), w: Math.abs(dx), h: Math.abs(dy) };
      const m = drag.rect; selSet.clear(); drag.base.forEach(x => selSet.add(x));
      for (const it of items.values()) { const b = bbox(it); if (b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h) selSet.add(it.id); }
      sel = [...selSet].pop() || null; redraw(); return;
    }
    if (drag.mode === 'cells') {
      const it = items.get(drag.id); if (!it) return;
      const a = drag.a, b = cellAt(it, p);
      const n = tFit(it.data, { id: drag.id, r0: Math.min(a.r, b.r), r1: Math.max(a.r + a.rs, b.r + b.rs) - 1, c0: Math.min(a.c, b.c), c1: Math.max(a.c + a.cs, b.c + b.cs) - 1 });
      if (JSON.stringify(n) !== JSON.stringify(tsel)) { tsel = n; redraw(); }
      return;
    }
    if (drag.mode === 'move') {
      const list = [];
      // Tự căn hàng (như Canva): mép/tâm gần khớp với mục khác thì hút vào và hiện đường gióng. Giữ Alt để tắt.
      const sn = e.altKey ? { dx, dy, guides: [] } : snapMove(drag, dx, dy);
      drag.guides = sn.guides;
      for (const [id, o] of drag.origs) {
        const it = items.get(id); if (!it) continue;
        const dx = sn.dx, dy = sn.dy;
        if (RECT.has(it.kind)) Object.assign(it.data, { x: o.x + dx, y: o.y + dy });
        else if (it.kind === 'arrow') Object.assign(it.data, o.from ? {} : { x1: o.x1 + dx, y1: o.y1 + dy }, o.to ? {} : { x2: o.x2 + dx, y2: o.y2 + dy });
        else Object.assign(it.data, { dx: (o.dx || 0) + dx, dy: (o.dy || 0) + dy });
        list.push({ id, data: it.data });
      }
      drag.moved = true; redraw(); sendMoves(list);
    } else if (drag.mode === 'resize') {
      const it = items.get(drag.id); const o = drag.orig;
      if (it.kind === 'table' && (drag.handle === 'se' || /^(col|row):/.test(drag.handle))) {
        const [kind, ks] = drag.handle.split(':'), k = +ks;
        let cw = [...o.cw], rh = [...o.rh];
        if (kind === 'se') { const kx = Math.max(0.2, (o.w + dx) / o.w), ky = Math.max(0.2, (o.h + dy) / o.h); cw = o.cw.map(v => Math.max(30, Math.round(v * kx))); rh = o.rh.map(v => Math.max(24, Math.round(v * ky))); }
        else if (kind === 'col') cw[k] = Math.max(30, Math.round(o.cw[k] + dx));
        else rh[k] = Math.max(24, Math.round(o.rh[k] + dy));
        Object.assign(it.data, { cw, rh, w: sum(cw), h: sum(rh) });
        drag.moved = true; redraw(); sendMove(it.id, it.data); return;
      }
      if (drag.handle === 'se' && it.kind === 'image') { const k = Math.max(40 / o.w, (o.w + dx) / o.w); Object.assign(it.data, { w: Math.round(o.w * k), h: Math.round(o.h * k) }); }
      else if (drag.handle === 'se') Object.assign(it.data, { w: Math.max(it.kind === 'group' ? 120 : 30, o.w + dx), h: Math.max(it.kind === 'group' ? GROUP_HEAD + 30 : 24, o.h + dy) });
      if (drag.handle === 'p1' || drag.handle === 'p2') {
        const one = drag.handle === 'p1', T = itemAt(p, one ? o.to : o.from);
        const q = arrowPts(o);   // toạ độ thật lúc bắt đầu kéo
        if (one) Object.assign(it.data, { x1: p.x, y1: p.y, from: T?.id || null }, o.to ? {} : { x2: q.x2, y2: q.y2 });
        else Object.assign(it.data, { x2: p.x, y2: p.y, to: T?.id || null }, o.from ? {} : { x1: q.x1, y1: q.y1 });
        drag.hover = T?.id || null;
      }
      drag.moved = true; redraw(); sendMove(it.id, it.data);
    } else if (drag.mode === 'create') {
      const d = drag.temp.data;
      if (drag.kind === 'arrow') { const B = itemAt(p, d.from); Object.assign(d, { x2: p.x, y2: p.y, to: B?.id || null }); drag.hover = B?.id || null; }
      else if (drag.kind === 'path') d.points.push([Math.round(p.x), Math.round(p.y)]);
      else Object.assign(d, { x: Math.min(drag.start.x, p.x), y: Math.min(drag.start.y, p.y), w: Math.abs(dx), h: Math.abs(dy) });
      redraw();
    }
  });
  canvas.addEventListener('pointerup', async () => {
    const dr = drag; drag = null; canvas.style.cursor = '';
    if (!dr) return;
    if (dr.mode === 'marquee') { redraw(); renderBar(); return; }
    if (dr.mode === 'cells') { renderBar(); return; }
    if (dr.mode === 'move' && dr.moved) for (const [id, o] of dr.origs) touch(id, items.has(id) ? { ...snap(id), data: structuredClone(o) } : null);
    if (dr.mode === 'resize' && dr.moved && items.has(dr.id)) touch(dr.id, { ...snap(dr.id), data: structuredClone(dr.orig) });
    if (dr.mode === 'move' && dr.moved) for (const id of dr.origs.keys()) { const it = items.get(id); if (it) { if (it.kind === 'arrow') freezeArrow(it.data); patch(id, it.data); } }
    if (dr.mode === 'resize' && dr.moved) { const it = items.get(dr.id); if (it.kind === 'arrow') freezeArrow(it.data); patch(dr.id, it.data); }
    if (dr.hover || dr.guides?.length) redraw();
    if (dr.mode === 'create') {
      items.delete('temp');
      const d = dr.temp.data;
      if (dr.kind === 'arrow') { if (d.from && d.from === d.to) d.to = null; freezeArrow(d); }
      const tooSmall = dr.kind === 'arrow' ? (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 8 || (d.from && !d.to && Math.hypot(dr.start.x - d.x2, dr.start.y - d.y2) < 8)) : dr.kind === 'path' ? d.points.length < 2 : (d.w < 8 || d.h < 8);
      if (tooSmall && dr.kind !== 'rect' && dr.kind !== 'ellipse') { redraw(); return; }
      if (tooSmall) Object.assign(d, { w: 160, h: 100 });
      await createItem(dr.kind, d, false);
      if (dr.kind !== 'path') setTool('select');
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());   // chuột phải dùng để kéo bảng
  canvas.addEventListener('dblclick', (e) => {
    if (canvas.querySelector('.wb-text-edit')) return;
    const g = e.target.closest('.wb-item');
    const it = items.get(g ? g.getAttribute('data-id') : lastDown);
    if (it && RECT.has(it.kind) && it.kind !== 'image' && it.kind !== 'table') editText(it);
  });
  canvas.addEventListener('keydown', (e) => {
    if (e.target.closest('.wb-text-edit')) return;
    const T = tcur(), tb = sel && selSet.size === 1 && items.get(sel)?.kind === 'table' ? items.get(sel) : null;
    if (tb && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!T && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); tsel = { id: tb.id, r0: 0, c0: 0, r1: 0, c1: 0 }; redraw(); renderBar(); editCell(tb, 0, 0); return; }
      if (T) {
        const d = tb.data;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); const cells = { ...(d.cells || {}) }; for (let r = T.r0; r <= T.r1; r++) for (let c = T.c0; c <= T.c1; c++) delete cells[TK(r, c)]; patch(tb.id, { cells }, true); return; }
        if (e.key === 'Escape') { tsel = null; redraw(); renderBar(); return; }
        if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); editCell(tb, T.r0, T.c0); return; }
        const mv = { ArrowUp: [T.r0 - 1, T.c0], ArrowDown: [T.r1 + 1, T.c0], ArrowLeft: [T.r0, T.c0 - 1], ArrowRight: [T.r0, T.c1 + 1], Tab: e.shiftKey ? [T.r0, T.c0 - 1] : [T.r0, T.c1 + 1] }[e.key];
        if (mv) { e.preventDefault(); const c = cellAt(tb, null, Math.min(d.rh.length - 1, Math.max(0, mv[0])), Math.min(d.cw.length - 1, Math.max(0, mv[1]))); tsel = { id: tb.id, r0: c.r, c0: c.c, r1: c.r + c.rs - 1, c1: c.c + c.cs - 1 }; redraw(); renderBar(); return; }
        if (e.key.length === 1) { e.preventDefault(); editCell(tb, T.r0, T.c0, e.key); return; }
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selSet.size) { e.preventDefault(); delSel(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); e.shiftKey ? ungroup() : makeGroup(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selSet.clear(); items.forEach((_, id) => selSet.add(id)); sel = [...selSet].pop() || null; redraw(); renderBar(); }
    else if (e.key === 'Escape') { selectOnly(null); redraw(); renderBar(); }
    else if ((e.key === 'Enter' || e.key === 'F2') && sel && selSet.size === 1 && RECT.has(items.get(sel)?.kind) && !['image', 'table'].includes(items.get(sel)?.kind)) { e.preventDefault(); editText(items.get(sel)); }
    // Đang chọn 1 ghi chú/khung mà gõ phím chữ → vào sửa luôn, nối thêm chữ vào cuối
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && sel && selSet.size === 1 && BOX.has(items.get(sel)?.kind)) { e.preventDefault(); editText(items.get(sel), e.key); }
    else if (!e.ctrlKey && !e.metaKey) { const t = TOOLS.find(t => t[2] === e.key.toUpperCase()); if (t) setTool(t[0]); }
  });

  // ô ở điểm p (hoặc ô r, c); ô nằm trong vùng gộp → trả về ô gộp
  function cellAt(it, p, r, c) {
    const d = it.data;
    if (p) {
      const { xs, ys } = tGeom(d);
      c = 0; while (c < d.cw.length - 1 && p.x >= xs[c + 1]) c++;
      r = 0; while (r < d.rh.length - 1 && p.y >= ys[r + 1]) r++;
    }
    const m = tOwner(d, r, c);
    return m ? { r: m[0], c: m[1], rs: m[2], cs: m[3] } : { r, c, rs: 1, cs: 1 };
  }
  function editCell(it, r, c, typed) {
    if (canvas.querySelector('.wb-text-edit')) return;
    const d = it.data, { xs, ys } = tGeom(d), m = tOwner(d, r, c);
    if (m) [r, c] = m;
    const rs = m ? m[2] : 1, cs = m ? m[3] : 1, k = TK(r, c);
    const X = xs[c], Y = ys[r], W = xs[c + cs] - X, H = ys[r + rs] - Y, fs = d.size || 14;
    const ta = h('textarea', { class: 'wb-text-edit' });
    ta.value = (d.cells?.[k] || '') + (typed || '');
    Object.assign(ta.style, { left: view.x + X * view.z + 'px', top: view.y + Y * view.z + 'px', width: Math.max(80, W * view.z) + 'px', height: Math.max(30, H * view.z) + 'px', fontSize: fs * view.z + 'px', fontFamily: "'Montserrat', sans-serif", fontWeight: d.head !== false && r === 0 ? 700 : 500, textAlign: d.al?.[k] || 'left', padding: `${4 * view.z}px ${8 * view.z}px`, background: '#fff', color: '#1f2937', lineHeight: 1.3 });
    canvas.append(ta); ta.focus();
    const end = ta.value.length; ta.setSelectionRange(end, end);
    const t0 = Date.now(); let finished = false;
    const done = (force, next) => {
      if (finished || !ta.isConnected) return;
      if (!force && Date.now() - t0 < 400) { setTimeout(() => ta.focus(), 0); return; }
      finished = true; const v = ta.value; ta.remove();
      const cur = items.get(it.id);
      if (cur && v !== (cur.data.cells?.[k] || '')) {
        const cells = { ...(cur.data.cells || {}) }; if (v) cells[k] = v; else delete cells[k];
        // chữ dài hơn ô → hàng tự cao lên cho vừa (ô không gộp nhiều hàng)
        let rh = cur.data.rh;
        if (rs === 1 && v) {
          const width = Math.max(20, W - 16), cw = fs * 0.56;
          const lines = v.split('\n').reduce((t, ln) => t + Math.max(1, Math.ceil(ln.length * cw / width)), 0);
          const need = Math.ceil(lines * fs * 1.3 + 10);
          if (need > rh[r]) { rh = [...rh]; rh[r] = need; }
        }
        patch(it.id, { cells, rh, h: sum(rh) }, true);
      }
      if (next && cur) {
        const d2 = cur.data; let nr = r, nc = c + cs;
        if (next < 0) { nc = c - 1; if (nc < 0) { nr = r - 1; nc = d2.cw.length - 1; } } else if (nc >= d2.cw.length) { nr = r + rs; nc = 0; }
        if (nr >= 0 && nr < d2.rh.length) { const o = cellAt(cur, null, nr, nc); tsel = { id: it.id, r0: o.r, c0: o.c, r1: o.r + o.rs - 1, c1: o.c + o.cs - 1 }; redraw(); renderBar(); editCell(cur, o.r, o.c); return; }
      }
      redraw(); renderBar(); canvas.focus();
    };
    ta.addEventListener('blur', () => done(false));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && !e.altKey)) { e.preventDefault(); done(true); }
      else if (e.key === 'Tab') { e.preventDefault(); done(true, e.shiftKey ? -1 : 1); }
      e.stopPropagation();
    });
  }
  function editText(it, typed) {
    if (canvas.querySelector('.wb-text-edit')) return;
    const d = it.data, r = canvas.getBoundingClientRect();
    const ta = h('textarea', { class: 'wb-text-edit' });
    ta.value = d.text || '';
    const st = styleOf(it);
    const grp = it.kind === 'group';
    Object.assign(ta.style, { left: view.x + d.x * view.z + 'px', top: view.y + d.y * view.z + 'px', width: Math.max(120, d.w * view.z) + 'px', height: (grp ? Math.max(34, GROUP_HEAD * view.z) : Math.max(50, d.h * view.z)) + 'px', fontSize: st.size * view.z + 'px', background: it.kind === 'sticky' ? d.color : '#fff',
      fontFamily: fontCss(st.font), fontWeight: st.bold ? 700 : 500, fontStyle: st.italic ? 'italic' : 'normal', textDecoration: st.underline ? 'underline' : 'none', textAlign: st.align, color: st.tcolor || (it.kind === 'sticky' && isDark(d.color) ? '#fff' : '#1f2937') });
    if (grp) Object.assign(ta.style, { fontSize: 16 * view.z + 'px', fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#1f2937', fontFamily: "'Montserrat', sans-serif", padding: '6px 12px', whiteSpace: 'nowrap' });
    canvas.append(ta); ta.focus();
    // Đặt con trỏ ở cuối để gõ tiếp (không bôi đen cả đoạn – tránh lỡ tay gõ đè mất chữ cũ)
    if (typed) ta.value += typed;
    const end = ta.value.length; ta.setSelectionRange(end, end); ta.scrollTop = ta.scrollHeight;
    const t0 = Date.now();
    let finished = false;
    const done = (force) => { if (finished || !ta.isConnected) return; if (!force && Date.now() - t0 < 400) { setTimeout(() => ta.focus(), 0); return; } finished = true; const v = ta.value; ta.remove(); if (v !== (d.text || '')) patch(it.id, { ...d, text: v }); else if (!v && it.kind === 'text') { const top = undoStack.at(-1); if (top?.length === 1 && top[0].id === it.id && !top[0].before) { undoStack.pop(); histOff++; removeItem(it.id); histOff--; } else removeItem(it.id); } canvas.focus(); };
    ta.addEventListener('blur', () => done(false));
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey || grp))) { e.preventDefault(); done(true); } e.stopPropagation(); });
    void r;
  }

  // ---------- đồng bộ ----------
  async function createItem(kind, data, edit, zAt) {
    const z = zAt ?? Math.max(0, ...[...items.values()].map(i => i.z || 0)) + 1;
    try {
      const it = await db.insert('board_items', { board_id: board.id, kind, data, z, updated_by: store.user.id });
      items.set(it.id, it); touch(it.id, null); selectOnly(it.id); redraw(); renderBar();
      if (edit) editText(it);
      return it;
    } catch (e) { toastErr(e); }
  }
  async function patch(id, data, local = false) {
    const it = items.get(id); if (!it) return;
    touch(id);
    it.data = { ...it.data, ...data };
    if (local) redraw();
    try { await db.update('board_items', id, { data: it.data, updated_by: store.user.id, updated_at: new Date().toISOString() }); } catch (e) { toastErr(e); }
  }
  async function patchZ(id) { const z = Math.max(...[...items.values()].map(i => i.z || 0)) + 1; const it = items.get(id); touch(id); it.z = z; redraw(); db.update('board_items', id, { z }).catch(toastErr); }
  async function removeItem(id) {
    // mũi tên đang neo vào mục bị xoá: giữ lại ở vị trí hiện tại và bỏ neo
    for (const ar of items.values()) if (ar.kind === 'arrow' && (ar.data.from === id || ar.data.to === id) && !selSet.has(ar.id)) { const d = freezeArrow({ ...ar.data }); if (d.from === id) d.from = null; if (d.to === id) d.to = null; patch(ar.id, d); }
    touch(id);
    items.delete(id); selSet.delete(id); if (sel === id) sel = [...selSet].pop() || null; redraw(); renderBar(); try { await db.remove('board_items', id); } catch (e) { toastErr(e); } }
  // ---------- hoàn tác / làm lại (chỉ thao tác của chính mình, không đụng tới thao tác của người khác) ----------
  let undoStack = [], redoStack = [], tx = null, histOff = 0;
  const snap = (id) => { const it = items.get(id); return it && id !== 'temp' ? structuredClone({ kind: it.kind, data: it.data, z: it.z || 0 }) : null; };
  // ghi trạng thái TRƯỚC khi đổi; mọi thay đổi trong cùng một lượt xử lý gộp thành 1 bước hoàn tác
  function touch(id, before) {
    if (histOff || id === 'temp') return;
    if (!tx) { tx = new Map(); queueMicrotask(commitTx); }
    if (!tx.has(id)) tx.set(id, before !== undefined ? before : snap(id));
  }
  function commitTx() {
    const t = tx; tx = null; if (!t) return;
    const list = [...t].map(([id, before]) => ({ id, before, after: snap(id) })).filter(e => JSON.stringify(e.before) !== JSON.stringify(e.after));
    if (!list.length) return;
    undoStack.push(list); if (undoStack.length > 100) undoStack.shift();
    redoStack = []; renderBar();
  }
  async function applyHist(list, useBefore) {
    const jobs = [], keep = [];
    histOff++;
    try {
      for (const e of list) {
        const want = useBefore ? e.before : e.after, cur = items.get(e.id);
        if (!want) { if (cur) jobs.push(removeItem(e.id)); continue; }
        keep.push(e.id);
        const row = { data: structuredClone(want.data), z: want.z };
        if (cur) { Object.assign(cur, row); jobs.push(db.update('board_items', e.id, { ...row, updated_by: store.user.id, updated_at: new Date().toISOString() })); }
        else { const it = { id: e.id, board_id: board.id, kind: want.kind, ...row, updated_by: store.user.id }; items.set(e.id, it); jobs.push(db.insert('board_items', it)); }
      }
    } finally { histOff--; }
    selSet.clear(); keep.forEach(id => selSet.add(id)); sel = keep.at(-1) || null;
    redraw(); renderBar();
    (await Promise.allSettled(jobs)).forEach(r => { if (r.status === 'rejected') toastErr(r.reason); });
  }
  function undo() {
    if (drag || canvas.querySelector('.wb-text-edit')) return;
    commitTx();
    const l = undoStack.pop(); if (!l) return toast('Không còn thao tác nào để hoàn tác');
    redoStack.push(l); applyHist(l, true); toast('↶ Đã hoàn tác');
  }
  function redo() {
    if (drag || canvas.querySelector('.wb-text-edit')) return;
    commitTx();
    const l = redoStack.pop(); if (!l) return;
    undoStack.push(l); applyHist(l, false); toast('↷ Đã làm lại');
  }
  const onUndoKey = (e) => {
    if (!root.isConnected || !board || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.modal-bg, .modal')) return;   // đang gõ chữ: để trình duyệt tự hoàn tác chữ
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
  };
  document.addEventListener('keydown', onUndoKey);
  async function delSel() {
    if (!selSet.size) return;
    const ids = new Set(selSet);
    const groups = [...ids].map(id => items.get(id)).filter(it => it?.kind === 'group');
    if (groups.length) {
      const inner = new Set(); groups.forEach(g => contents(g).forEach(c => { if (!ids.has(c.id)) inner.add(c.id); }));
      if (inner.size && !(await confirmBox('Xoá nhóm?', `Xoá khung nhóm cùng ${inner.size} mục bên trong? (Muốn giữ các mục bên trong thì bấm “Bỏ nhóm”.)`))) return;
      inner.forEach(id => ids.add(id));
    }
    ids.forEach(id => removeItem(id));
  }

  // ---------- nhóm ----------
  async function makeGroup() {
    const its = [...selSet].map(id => items.get(id)).filter(it => it && it.kind !== 'group');
    if (!its.length) return;
    const bs = its.map(bbox), P = 24;
    const x0 = Math.min(...bs.map(b => b.x)) - P, y0 = Math.min(...bs.map(b => b.y)) - P - GROUP_HEAD, x1 = Math.max(...bs.map(b => b.x + b.w)) + P, y1 = Math.max(...bs.map(b => b.y + b.h)) + P;
    const title = await prompt('Tạo nhóm', 'Tiêu đề của nhóm', 'Nhóm mới');
    if (title == null) return;
    // khung nằm dưới mọi thứ trong vùng của nó để vẫn bấm được các mục (và nhóm con) bên trong
    const inArea = [...items.values()].filter(it => { const b = bbox(it), cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1; });
    const zMin = Math.min(...its.map(i => i.z || 0), ...inArea.map(i => i.z || 0));
    const g = await createItem('group', { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0), text: title.trim() || 'Nhóm mới', color: color === COLORS[0] ? '#fed7aa' : color }, false, zMin - 1);
    if (g) logActivity(store.user, 'tạo nhóm trên bảng trắng', g.data.text);
  }
  function ungroup() {
    const gs = [...selSet].map(id => items.get(id)).filter(it => it?.kind === 'group');
    gs.forEach(g => removeItem(g.id));
  }
  async function dup() {
    const it = sel && items.get(sel); if (!it) return;
    const d = structuredClone(it.data);
    if (RECT.has(it.kind)) { d.x += 24; d.y += 24; } else if (it.kind === 'arrow') { freezeArrow(d); d.from = d.to = null; d.x1 += 24; d.x2 += 24; d.y1 += 24; d.y2 += 24; } else { d.dx = (d.dx || 0) + 24; d.dy = (d.dy || 0) + 24; }
    createItem(it.kind, d, false);
  }
  function onRoom(m) {
    if (m.t === 'move') { const it = items.get(m.id); if (it && !(drag && drag.id === m.id)) { it.data = m.data; redraw(); } }
    if (m.t === 'moves' && !(drag && drag.mode === 'move')) { let ch = false; for (const x of m.list || []) { const it = items.get(x.id); if (it) { it.data = x.data; ch = true; } } if (ch) redraw(); }
    if (m.t === 'cur' && m.uid !== store.user.id) { cursors.set(m.uid, { ...m, at: Date.now() }); placeCursors(); }
  }
  function placeCursors() {
    canvas.querySelectorAll('.wb-cursor').forEach(c => c.remove());
    for (const [uid, c] of cursors) {
      if (Date.now() - c.at > 8000) { cursors.delete(uid); continue; }
      canvas.append(h('div', { class: 'wb-cursor', style: { left: view.x + c.x * view.z + 'px', top: view.y + c.y * view.z + 'px', background: c.color || '#2563eb' } }, '➤ ' + (c.name || '')));
    }
  }
  const curTick = setInterval(placeCursors, 3000);

  // Mũi tên cũ (vẽ trước khi có chức năng neo): đầu nào nằm sát mép một ghi chú/khung thì tự neo vào đó
  function autoAnchor() {
    const near = (x, y, ex) => { const P = 16; return [...items.values()].filter(t => BOX.has(t.kind) && t.id !== ex).sort((a, b) => (b.z || 0) - (a.z || 0)).find(t => { const b = bbox(t); return x >= b.x - P && x <= b.x + b.w + P && y >= b.y - P && y <= b.y + b.h + P; }); };
    for (const it of items.values()) {
      if (it.kind !== 'arrow' || 'from' in it.data || 'to' in it.data) continue;
      const d = it.data, A = near(d.x1, d.y1), B = near(d.x2, d.y2, A?.id);
      it.data = { ...d, from: A?.id || null, to: B?.id || null };
      if (A || B) { histOff++; patch(it.id, it.data); histOff--; }
    }
  }
  let offItems = null;
  async function openBoard(id) {
    tsel = null; offItems?.(); room?.close(); items = new Map(); selectOnly(null); cursors.clear(); tx = null; undoStack = []; redoStack = [];
    board = boards.find(b => b.id === id) || null;
    go(board?.id || null);
    renderPick(); renderBar();
    if (!board) {
      fill(world, );
      const t = S('text', { x: 40, y: 60, fill: '#94a3b8', 'font-size': 16 }); t.textContent = 'Chưa có bảng trắng. Bấm “＋ Bảng mới” để tạo (VD: Sơ đồ quy trình hộp, Layout tờ in…).'; world.append(t);
      return;
    }
    room = db.room(`board-${board.id}`, onRoom);
    try {
      (await db.select('board_items', { eq: { board_id: board.id } })).forEach(it => items.set(it.id, it));
      autoAnchor();
      redraw(); fit();
    } catch (e) { toastErr(e); }
    offItems = db.subscribe('board_items', ['board_id', board.id], (e) => {
      if (e.type === 'DELETE') { if (items.delete(e.old.id)) { selSet.delete(e.old.id); if (sel === e.old.id) sel = [...selSet].pop() || null; redraw(); renderBar(); } return; }
      if (drag && drag.id === e.new.id) return;
      items.set(e.new.id, e.new); redraw();
    });
  }
  // ---------- hình ảnh ----------
  const imgCache = new Map();   // path → { url, at, p }
  function imgUrl(path) {
    const c = imgCache.get(path);
    if (c && Date.now() - c.at < 45 * 60e3) return c.p;   // liên kết tạm của kho tệp có hạn 1 giờ
    const p = db.fileUrl(path).then(url => { imgCache.set(path, { url, at: Date.now(), p }); return url; });
    imgCache.set(path, { url: c?.url, at: Date.now(), p });
    p.catch(() => imgCache.delete(path));
    return p;
  }
  async function shrinkImg(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return { blob: file, w: 400, h: 300 };
    const k = Math.min(1, IMG_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), hh = Math.round(bmp.height * k);
    if (file.type === 'image/gif' || (k === 1 && file.size < 1.5e6)) { bmp.close?.(); return { blob: file, w, h: hh }; }
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const g = c.getContext('2d'); const png = file.type === 'image/png';
    if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); }
    g.drawImage(bmp, 0, 0, w, hh); bmp.close?.();
    const blob = await new Promise(r => c.toBlob(r, png ? 'image/webp' : 'image/jpeg', 0.86));
    return blob && blob.size < file.size ? { blob, w, h: hh } : { blob: file, w, h: hh };
  }
  async function addImages(files, at) {
    const imgs = [...(files || [])].filter(f => f.type.startsWith('image/'));
    if (!imgs.length || !board) return;
    const r = canvas.getBoundingClientRect();
    let p = at || { x: (r.width / 2 - view.x) / view.z, y: (r.height / 2 - view.y) / view.z };
    for (const f of imgs) {
      if (f.size > IMG_MAX_MB * 1e6) { toastErr(new Error(`Ảnh “${f.name}” lớn hơn ${IMG_MAX_MB} MB.`)); continue; }
      try {
        const { blob, w, h: hh } = await shrinkImg(f);
        const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[blob.type || f.type] || 'img';
        const path = `board/${board.id}/${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)}.${ext}`;
        await db.upload(path, blob instanceof File ? blob : new File([blob], f.name, { type: blob.type }));
        const k = Math.min(1, 420 / Math.max(w, hh));   // hiện trên bảng tối đa ~420 px, kéo góc để phóng to
        const W = Math.max(40, Math.round(w * k)), H = Math.max(40, Math.round(hh * k));
        await createItem('image', { x: Math.round(p.x - W / 2), y: Math.round(p.y - H / 2), w: W, h: H, path, name: f.name });
        p = { x: p.x + 30, y: p.y + 30 };
      } catch (e) { toastErr(e); }
    }
    setTool('select');
  }
  const imgPicker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => { addImages(imgPicker.files); imgPicker.value = ''; } });
  root.append(imgPicker);
  canvas.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  canvas.addEventListener('drop', (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); addImages(e.dataTransfer.files, toWorld(e)); });
  const onPaste = (e) => {
    if (!root.isConnected || e.target.closest?.('input, textarea, [contenteditable]')) return;
    const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (fs.length) { e.preventDefault(); addImages(fs); }
  };
  document.addEventListener('paste', onPaste);

  function exportSvg() {
    const clone = svg.cloneNode(true);
    const bs = [...items.values()].map(bbox);
    if (!bs.length) return;
    const x0 = Math.min(...bs.map(b => b.x)) - 20, y0 = Math.min(...bs.map(b => b.y)) - 20, x1 = Math.max(...bs.map(b => b.x + b.w)) + 20, y1 = Math.max(...bs.map(b => b.y + b.h)) + 20;
    clone.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`); clone.setAttribute('width', x1 - x0); clone.setAttribute('height', y1 - y0);
    clone.querySelector('g').removeAttribute('transform');
    clone.setAttribute('xmlns', NS);
    const a = h('a', { href: URL.createObjectURL(new Blob([clone.outerHTML], { type: 'image/svg+xml' })), download: (board?.name || 'bang-trang') + '.svg' }); a.click(); downloadNote();
  }

  (async () => {
    try {
      boards = await db.select('boards', { eq: { folder_id: folder.id }, order: ['created_at', true] });
      renderBar(); applyView();
      await openBoard((boards.find(b => b.id === sub) || boards[0])?.id);
    } catch (e) { toastErr(e); }
  })();
  offs.push(db.subscribe('boards', ['folder_id', folder.id], (e) => {
    if (e.type === 'DELETE') { if (!boards.some(b => b.id === e.old.id)) return; boards = boards.filter(b => b.id !== e.old.id); if (board?.id === e.old.id) openBoard(boards[0]?.id); else renderPick(); return; }
    const i = boards.findIndex(b => b.id === e.new.id); if (i >= 0) boards[i] = e.new; else boards.push(e.new);
    if (board?.id === e.new.id) board = e.new; renderPick();
  }));
  return () => { offs.forEach(f => f()); offItems?.(); room?.close(); clearInterval(curTick); document.removeEventListener('paste', onPaste); document.removeEventListener('keydown', onUndoKey); };
}
