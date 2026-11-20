import db, { logActivity } from '../db.js';
import { store } from '../store.js';
import { h, toastErr, prompt, confirmBox, throttle, popMenu, esc, fill, downloadNote } from '../ui.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); return e; };
const COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa', '#1f2937', '#dc2626', '#2563eb', '#059669'];
const TOOLS = [
  ['select', '🖱️ Chọn', 'V'], ['pan', '✋ Kéo', 'H'], ['sticky', '🟨 Ghi chú', 'N'], ['text', '🔤 Chữ', 'T'],
  ['rect', '▭ Khung', 'R'], ['ellipse', '◯ Elip', 'O'], ['arrow', '➜ Mũi tên', 'A'], ['path', '✏️ Bút', 'P'],
];
const BOX = new Set(['sticky', 'text', 'rect', 'ellipse']);
const FONTS = [
  ['Montserrat', "'Montserrat', sans-serif"], ['Roboto', "'Roboto', sans-serif"], ['Arial', 'Arial, Helvetica, sans-serif'],
  ['Bitter (có chân)', "'Bitter', serif"], ['Lora (có chân)', "'Lora', serif"], ['Times New Roman', "'Times New Roman', Times, serif"],
  ['Patrick Hand (viết tay)', "'Patrick Hand', cursive"], ['Dancing Script (bay bướm)', "'Dancing Script', cursive"], ['Anonymous Pro (đơn cách)', "'Anonymous Pro', monospace"],
];
const fontCss = (name) => (FONTS.find(f => f[0] === name) || FONTS[0])[1];
const TEXT_COLORS = ['#1f2937', '#ffffff', '#64748b', '#dc2626', '#ea580c', '#ca8a04', '#059669', '#2563eb', '#7c3aed', '#db2777'];
// Kiểu chữ mặc định theo loại hình
const defStyle = (kind) => ({ size: kind === 'text' ? 20 : 15, align: kind === 'rect' || kind === 'ellipse' ? 'center' : 'left', valign: kind === 'rect' || kind === 'ellipse' ? 'middle' : 'top' });
const styleOf = (it) => ({ font: 'Montserrat', bold: false, italic: false, underline: false, ...defStyle(it.kind), ...Object.fromEntries(Object.entries(it.data).filter(([k]) => ['font', 'size', 'bold', 'italic', 'underline', 'align', 'valign', 'tcolor'].includes(k))) });

export function mountBoards(el, { folder, sub, go }) {
  let boards = [], board = null, items = new Map(), sel = null;
  let tool = 'select', color = COLORS[0];
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
      h('span', { class: 'wb-sep' }),
      COLORS.map(c => h('span', { class: `swatch ${color === c ? 'on' : ''}`, style: { background: c }, title: 'Màu', onclick: () => { color = c; if (sel && items.get(sel)) patch(sel, { color: c }, true); renderBar(); } })),
      h('span', { class: 'wb-sep' }),
      h('button', { class: 'wb-tool', disabled: !sel, title: 'Xoá (Delete)', onclick: delSel }, '🗑️'),
      h('button', { class: 'wb-tool', disabled: !sel, title: 'Đưa lên trên', onclick: () => sel && patchZ(sel) }, '⬆️'),
      h('button', { class: 'wb-tool', disabled: !sel, title: 'Nhân bản (Ctrl+D)', onclick: dup }, '⧉'),
      h('div', { class: 'grow' }),
      h('span', { class: 'small muted' }, 'Kéo nền để di chuyển · Cuộn chuột để phóng to · Nhấp đúp để sửa chữ'));
    renderFmt();
    fill(zoomBox, h('button', { class: 'icon-btn', onclick: () => zoomAt(1 / 1.2) }, '－'), h('span', { class: 'small', style: { padding: '4px 6px', minWidth: '44px', textAlign: 'center' } }, Math.round(view.z * 100) + '%'), h('button', { class: 'icon-btn', onclick: () => zoomAt(1.2) }, '＋'), h('button', { class: 'icon-btn', title: 'Vừa khung', onclick: fit }, '⤢'));
  }
  // ---------- thanh định dạng chữ ----------
  function renderFmt() {
    const it = sel ? items.get(sel) : null;
    const on = !!(it && BOX.has(it.kind));
    fmt.classList.toggle('off', !on);
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
  function setTool(t) { tool = t; canvas.className = `wb-canvas tool-${t === 'select' ? 'select' : t === 'pan' ? 'pan' : 'draw'}`; renderBar(); }

  // ---------- vẽ ----------
  const applyView = () => { world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.z})`); renderBar(); placeCursors(); };
  function drawItem(it) {
    const d = it.data, g = S('g', { class: 'wb-item', 'data-id': it.id });
    const stroke = d.color || '#1f2937';
    if (it.kind === 'sticky') {
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
    if (sel === it.id) {
      const b = bbox(it);
      g.append(S('rect', { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8, fill: 'none', stroke: '#2563eb', 'stroke-width': 1.5 / view.z }));
      if (BOX.has(it.kind)) g.append(S('rect', { class: 'wb-handle', 'data-handle': 'se', x: b.x + b.w - 5 / view.z, y: b.y + b.h - 5 / view.z, width: 10 / view.z, height: 10 / view.z }));
      if (it.kind === 'arrow') { g.append(S('circle', { class: 'wb-handle', 'data-handle': 'p1', cx: d.x1, cy: d.y1, r: 6 / view.z }), S('circle', { class: 'wb-handle', 'data-handle': 'p2', cx: d.x2, cy: d.y2, r: 6 / view.z })); }
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
    if (BOX.has(it.kind)) return { x: Math.min(d.x, d.x + d.w), y: Math.min(d.y, d.y + d.h), w: Math.abs(d.w), h: Math.abs(d.h) };
    if (it.kind === 'arrow') return { x: Math.min(d.x1, d.x2), y: Math.min(d.y1, d.y2), w: Math.abs(d.x2 - d.x1), h: Math.abs(d.y2 - d.y1) };
    const xs = (d.points || []).map(p => p[0] + (d.dx || 0)), ys = (d.points || []).map(p => p[1] + (d.dy || 0));
    if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  function redraw() {
    fill(world, ...[...items.values()].sort((a, b) => (a.z || 0) - (b.z || 0)).map(drawItem));
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
  let drag = null, lastDown = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!board || e.button > 1 || e.target.closest('.wb-zoom') || e.target.closest('.wb-text-edit')) return;
    canvas.focus();
    const p = toWorld(e);
    const g = e.target.closest('.wb-item');
    const handle = e.target.getAttribute?.('data-handle');
    lastDown = g ? g.getAttribute('data-id') : null;
    canvas.setPointerCapture(e.pointerId);
    if (tool === 'pan' || e.button === 1 || (tool === 'select' && !g)) {
      if (tool === 'select' && !g && sel) { sel = null; redraw(); renderBar(); }
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; canvas.style.cursor = 'grabbing'; return;
    }
    if (tool === 'select' && g) {
      const id = g.getAttribute('data-id'); const it = items.get(id);
      if (sel !== id) { sel = id; redraw(); renderBar(); }
      drag = { mode: handle ? 'resize' : 'move', handle, id, start: p, orig: structuredClone(it.data) };
      return;
    }
    // tạo mới
    const base = { color };
    if (tool === 'sticky') { createItem('sticky', { ...base, x: p.x - 90, y: p.y - 70, w: 180, h: 140, text: '' }, true); setTool('select'); return; }
    if (tool === 'text') { createItem('text', { ...base, color: color, x: p.x, y: p.y - 20, w: 260, h: 60, text: '', size: 20 }, true); setTool('select'); return; }
    if (tool === 'rect' || tool === 'ellipse') drag = { mode: 'create', kind: tool, temp: { id: 'temp', kind: tool, z: 1e9, data: { ...base, x: p.x, y: p.y, w: 1, h: 1, text: '' } }, start: p };
    if (tool === 'arrow') drag = { mode: 'create', kind: 'arrow', temp: { id: 'temp', kind: 'arrow', z: 1e9, data: { ...base, x1: p.x, y1: p.y, x2: p.x, y2: p.y } }, start: p };
    if (tool === 'path') drag = { mode: 'create', kind: 'path', temp: { id: 'temp', kind: 'path', z: 1e9, data: { ...base, points: [[Math.round(p.x), Math.round(p.y)]], width: 3 } }, start: p };
    if (drag?.temp) { items.set('temp', drag.temp); redraw(); }
  });
  const sendMove = throttle((id, data) => room?.send({ t: 'move', id, data }), 50);
  const sendCursor = throttle((p) => room?.send({ t: 'cur', uid: store.user.id, name: store.me?.display_name, color: store.me?.color, x: p.x, y: p.y }), 60);
  canvas.addEventListener('pointermove', (e) => {
    const p = toWorld(e);
    sendCursor(p);
    if (!drag) return;
    if (drag.mode === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); return; }
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (drag.mode === 'move') {
      const it = items.get(drag.id); if (!it) return; const o = drag.orig;
      if (BOX.has(it.kind)) Object.assign(it.data, { x: o.x + dx, y: o.y + dy });
      else if (it.kind === 'arrow') Object.assign(it.data, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy });
      else Object.assign(it.data, { dx: (o.dx || 0) + dx, dy: (o.dy || 0) + dy });
      drag.moved = true; redraw(); sendMove(it.id, it.data);
    } else if (drag.mode === 'resize') {
      const it = items.get(drag.id); const o = drag.orig;
      if (drag.handle === 'se') Object.assign(it.data, { w: Math.max(30, o.w + dx), h: Math.max(24, o.h + dy) });
      if (drag.handle === 'p1') Object.assign(it.data, { x1: o.x1 + dx, y1: o.y1 + dy });
      if (drag.handle === 'p2') Object.assign(it.data, { x2: o.x2 + dx, y2: o.y2 + dy });
      drag.moved = true; redraw(); sendMove(it.id, it.data);
    } else if (drag.mode === 'create') {
      const d = drag.temp.data;
      if (drag.kind === 'arrow') Object.assign(d, { x2: p.x, y2: p.y });
      else if (drag.kind === 'path') d.points.push([Math.round(p.x), Math.round(p.y)]);
      else Object.assign(d, { x: Math.min(drag.start.x, p.x), y: Math.min(drag.start.y, p.y), w: Math.abs(dx), h: Math.abs(dy) });
      redraw();
    }
  });
  canvas.addEventListener('pointerup', async () => {
    const dr = drag; drag = null; canvas.style.cursor = '';
    if (!dr) return;
    if ((dr.mode === 'move' || dr.mode === 'resize') && dr.moved) patch(dr.id, items.get(dr.id).data);
    if (dr.mode === 'create') {
      items.delete('temp');
      const d = dr.temp.data;
      const tooSmall = dr.kind === 'arrow' ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 8 : dr.kind === 'path' ? d.points.length < 2 : (d.w < 8 || d.h < 8);
      if (tooSmall && dr.kind !== 'rect' && dr.kind !== 'ellipse') { redraw(); return; }
      if (tooSmall) Object.assign(d, { w: 160, h: 100 });
      await createItem(dr.kind, d, false);
      if (dr.kind !== 'path') setTool('select');
    }
  });
  canvas.addEventListener('dblclick', (e) => {
    const g = e.target.closest('.wb-item');
    const it = items.get(g ? g.getAttribute('data-id') : lastDown);
    if (it && BOX.has(it.kind)) editText(it);
  });
  canvas.addEventListener('keydown', (e) => {
    if (e.target.closest('.wb-text-edit')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); delSel(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); dup(); }
    else if (e.key === 'Escape') { sel = null; redraw(); renderBar(); }
    else if (!e.ctrlKey && !e.metaKey) { const t = TOOLS.find(t => t[2] === e.key.toUpperCase()); if (t) setTool(t[0]); }
  });

  function editText(it) {
    const d = it.data, r = canvas.getBoundingClientRect();
    const ta = h('textarea', { class: 'wb-text-edit' });
    ta.value = d.text || '';
    const st = styleOf(it);
    Object.assign(ta.style, { left: view.x + d.x * view.z + 'px', top: view.y + d.y * view.z + 'px', width: Math.max(120, d.w * view.z) + 'px', height: Math.max(50, d.h * view.z) + 'px', fontSize: st.size * view.z + 'px', background: it.kind === 'sticky' ? d.color : '#fff',
      fontFamily: fontCss(st.font), fontWeight: st.bold ? 700 : 500, fontStyle: st.italic ? 'italic' : 'normal', textDecoration: st.underline ? 'underline' : 'none', textAlign: st.align, color: st.tcolor || (it.kind === 'sticky' && isDark(d.color) ? '#fff' : '#1f2937') });
    canvas.append(ta); ta.focus(); ta.select();
    const t0 = Date.now();
    const done = () => { if (!ta.isConnected) return; if (Date.now() - t0 < 400) { setTimeout(() => ta.focus(), 0); return; } const v = ta.value; ta.remove(); if (v !== (d.text || '')) patch(it.id, { ...d, text: v }); else if (!v && it.kind === 'text') removeItem(it.id); canvas.focus(); };
    ta.addEventListener('blur', done);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); done(); } e.stopPropagation(); });
    void r;
  }

  // ---------- đồng bộ ----------
  async function createItem(kind, data, edit) {
    const z = Math.max(0, ...[...items.values()].map(i => i.z || 0)) + 1;
    try {
      const it = await db.insert('board_items', { board_id: board.id, kind, data, z, updated_by: store.user.id });
      items.set(it.id, it); sel = it.id; redraw(); renderBar();
      if (edit) editText(it);
    } catch (e) { toastErr(e); }
  }
  async function patch(id, data, local = false) {
    const it = items.get(id); if (!it) return;
    it.data = { ...it.data, ...data };
    if (local) redraw();
    try { await db.update('board_items', id, { data: it.data, updated_by: store.user.id, updated_at: new Date().toISOString() }); } catch (e) { toastErr(e); }
  }
  async function patchZ(id) { const z = Math.max(...[...items.values()].map(i => i.z || 0)) + 1; const it = items.get(id); it.z = z; redraw(); db.update('board_items', id, { z }).catch(toastErr); }
  async function removeItem(id) { items.delete(id); if (sel === id) sel = null; redraw(); renderBar(); try { await db.remove('board_items', id); } catch (e) { toastErr(e); } }
  const delSel = () => sel && removeItem(sel);
  async function dup() {
    const it = sel && items.get(sel); if (!it) return;
    const d = structuredClone(it.data);
    if (BOX.has(it.kind)) { d.x += 24; d.y += 24; } else if (it.kind === 'arrow') { d.x1 += 24; d.x2 += 24; d.y1 += 24; d.y2 += 24; } else { d.dx = (d.dx || 0) + 24; d.dy = (d.dy || 0) + 24; }
    createItem(it.kind, d, false);
  }
  function onRoom(m) {
    if (m.t === 'move') { const it = items.get(m.id); if (it && !(drag && drag.id === m.id)) { it.data = m.data; redraw(); } }
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

  let offItems = null;
  async function openBoard(id) {
    offItems?.(); room?.close(); items = new Map(); sel = null; cursors.clear();
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
      redraw(); fit();
    } catch (e) { toastErr(e); }
    offItems = db.subscribe('board_items', ['board_id', board.id], (e) => {
      if (e.type === 'DELETE') { if (items.delete(e.old.id)) { if (sel === e.old.id) sel = null; redraw(); } return; }
      if (drag && drag.id === e.new.id) return;
      items.set(e.new.id, e.new); redraw();
    });
  }
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
  return () => { offs.forEach(f => f()); offItems?.(); room?.close(); clearInterval(curTick); };
}
