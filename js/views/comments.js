// =====================================================================
// BÌNH LUẬN & GIAO VIỆC TRÊN TỪNG Ô BẢNG TÍNH
// - Chuột phải vào ô → 💬 Bình luận; gõ @tên để nhắc / giao việc cho bạn
// - Ô có bình luận chưa giải quyết: tam giác đỏ góc trên phải (như Excel)
// - “✓ Đã giải quyết” đóng cả luồng; mỗi bình luận mới cũng hiện trong Tin nhắn (bấm để mở đúng ô)
// =====================================================================
import db, { logActivity } from '../db.js';
import { store, nameOf, profileOf, folderOf } from '../store.js';
import { h, fill, toast, toastErr, avatar, fmtTime, esc } from '../ui.js';
import { softDelete } from '../trash.js';

export const NEED_SQL = 'Chức năng bình luận cần chạy đoạn SQL “Bình luận trên ô” trên Supabase trước.';

// Đường dẫn mở đúng bảng chứa ô (dùng cho tin nhắn, Ctrl+K, Việc của tôi)
export function cellHref(table) {
  const f = folderOf(table.folder_id);
  const pid = f?.product_id || store.productId;
  return `#/db/${pid}/${f?.section || 'factory'}/${table.id}`;
}
export function openCell(focus, href) {
  store.focus = focus;
  if (location.hash === href) store.actions.go?.(href); else location.hash = href;
}

const people = () => [...store.profiles.values()];
const nameOfP = (p) => p.display_name || p.email;
// @Tên trong nội dung → danh sách id được nhắc
function mentionsIn(text) {
  return people().filter(p => text.includes('@' + nameOfP(p))).map(p => p.id);
}
function bodyHtml(text) {
  let s = esc(text);
  for (const p of people()) { const n = esc('@' + nameOfP(p)); s = s.split(n).join(`<b class="mention">${n}</b>`); }
  return s.replace(/\n/g, '<br>');
}

// Hộp thoại luồng bình luận của 1 ô
// ctx = { table, row, col, addr, anchor (td), list: () => bình luận của bảng, onChange }
export function openThread(ctx) {
  document.querySelectorAll('.cmt-pop').forEach(x => x.remove());
  const { table, row, col, addr } = ctx;
  const pop = h('div', { class: 'cmt-pop', role: 'dialog', 'aria-label': `Bình luận ô ${addr}` });
  const input = h('textarea', { class: 'input', rows: 2, placeholder: 'Viết bình luận… gõ @ để nhắc / giao việc cho bạn' });
  const sug = h('div', { class: 'cmt-sug' });
  const thread = () => ctx.list().filter(c => c.row_id === row.id && c.col_key === col.key).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const close = () => { pop.remove(); removeEventListener('pointerdown', outside, true); removeEventListener('keydown', onEsc, true); };
  const outside = (e) => { if (!pop.contains(e.target) && !e.target.closest('.toast')) close(); };
  const onEsc = (e) => { if (e.key === 'Escape' && !sug.childElementCount) { e.stopPropagation(); close(); } };

  function render() {
    const list = thread(), open = list.some(c => !c.resolved);
    fill(pop,
      h('div', { class: 'cmt-head' }, h('b', {}, `💬 Ô ${addr}`), h('span', { class: 'small muted' }, ` · ${table.name} · ${col.label}`), h('div', { class: 'grow' }),
        list.length ? h('button', { class: `btn btn-sm ${open ? 'btn-primary' : ''}`, title: open ? 'Đánh dấu cả luồng là đã xong' : 'Mở lại luồng', onclick: () => setResolved(open) }, open ? '✓ Đã giải quyết' : '↺ Mở lại') : null,
        h('button', { class: 'icon-btn', title: 'Đóng (Esc)', onclick: close }, '✕')),
      list.length ? h('div', { class: 'cmt-list' }, list.map(c => h('div', { class: `cmt ${c.resolved ? 'resolved' : ''}` },
        avatar(profileOf(c.author) || { display_name: nameOf(c.author) }, 24),
        h('div', { class: 'grow' }, h('div', { class: 'small' }, h('b', {}, nameOf(c.author)), ' · ', h('span', { class: 'muted' }, fmtTime(c.created_at)), c.resolved ? h('span', { class: 'badge badge-ok', style: { marginLeft: '6px' } }, 'đã xong') : null),
          h('div', { class: 'cmt-body', html: bodyHtml(c.body) })),
        c.author === store.user.id ? h('button', { class: 'icon-btn', title: 'Xoá bình luận', onclick: () => remove(c) }, '🗑') : null)))
        : h('p', { class: 'small muted', style: { margin: '6px 0' } }, 'Chưa có bình luận. Gõ @ để nhắc tên bạn cần làm việc này.'),
      h('div', { class: 'cmt-new' }, input, sug,
        h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '6px' } }, h('span', { class: 'small muted grow' }, 'Ctrl + Enter để gửi'), h('button', { class: 'btn btn-sm btn-primary', onclick: send }, 'Gửi'))));
    setTimeout(() => input.focus(), 0);
  }
  // gợi ý @tên
  function suggest() {
    const before = input.value.slice(0, input.selectionStart);
    const m = /@([^\s@]*)$/.exec(before);
    if (!m) { fill(sug); return; }
    const q = m[1].toLowerCase();
    const list = people().filter(p => nameOfP(p).toLowerCase().includes(q)).slice(0, 6);
    fill(sug, list.map((p, i) => h('button', { class: `cmt-sug-i ${i === 0 ? 'on' : ''}`, onmousedown: (e) => { e.preventDefault(); pick(p); } }, avatar(p, 20), ' ', nameOfP(p))));
    sug._list = list;
  }
  function pick(p) {
    const pos = input.selectionStart, before = input.value.slice(0, pos).replace(/@([^\s@]*)$/, '@' + nameOfP(p) + ' ');
    input.value = before + input.value.slice(pos); input.setSelectionRange(before.length, before.length); fill(sug); input.focus();
  }
  input.addEventListener('input', suggest);
  input.addEventListener('keydown', (e) => {
    if (sug.childElementCount && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pick(sug._list[0]); return; }
    if (sug.childElementCount && e.key === 'Escape') { e.preventDefault(); fill(sug); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  });

  async function send() {
    const body = input.value.trim(); if (!body) return;
    const mentions = mentionsIn(body);
    try {
      const c = await db.insert('cell_comments', { table_id: table.id, row_id: row.id, col_key: col.key, body, author: store.user.id, mentions, resolved: false });
      if (!ctx.list().some(x => x.id === c.id)) ctx.list().push(c);
      input.value = ''; ctx.onChange?.(); render();
      logActivity(store.user, `bình luận ô ${addr} ·`, table.name);
      // hiện trong Tin nhắn, bấm để mở đúng ô
      const href = cellHref(table);
      db.insert('messages', { user_id: store.user.id, body: `💬 ${body}`, attachments: [{ kind: 'ref', label: `${table.name} · ô ${addr} (${col.label})`, href, focus: { tableId: table.id, rowId: row.id, key: col.key }, mentions }] }).catch(() => {});
    } catch (e) { if (/cell_comments|relation|schema cache/i.test(e?.message || '')) toast(NEED_SQL, 'error'); else toastErr(e); }
  }
  async function setResolved(v) {
    try {
      for (const c of thread()) if (!!c.resolved !== v) { c.resolved = v; await db.update('cell_comments', c.id, { resolved: v, resolved_by: v ? store.user.id : null }); }
      ctx.onChange?.(); render();
      if (v) toast(`Đã giải quyết bình luận ô ${addr}`, 'ok');
    } catch (e) { toastErr(e); }
  }
  async function remove(c) {
    try {
      const arr = ctx.list(); const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1);
      ctx.onChange?.(); render();
      await softDelete('cell_comments', c.id, { label: c.body.slice(0, 40), what: 'bình luận', onUndo: () => { if (!ctx.list().some(x => x.id === c.id)) ctx.list().push(c); ctx.onChange?.(); } });
    } catch (e) { toastErr(e); }
  }

  render();
  document.body.append(pop);
  const r = ctx.anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.right + 6)) + 'px';
  pop.style.top = Math.max(8, Math.min(innerHeight - ph - 8, r.top)) + 'px';
  setTimeout(() => { addEventListener('pointerdown', outside, true); addEventListener('keydown', onEsc, true); }, 0);
  return close;
}
