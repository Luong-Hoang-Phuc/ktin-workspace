// =====================================================================
// TIN NHẮN NHÓM – trò chuyện realtime giữa các thành viên
// =====================================================================
import db from '../db.js';
import { store, on, profileOf, nameOf, colorOf } from '../store.js';
import { h, fill, toastErr, avatar, esc } from '../ui.js';

const READ = 'ktin-chat-read';
export const lastRead = () => { try { return localStorage.getItem(READ) || ''; } catch { return ''; } };
export const markRead = (iso = new Date().toISOString()) => { try { localStorage.setItem(READ, iso); } catch {} };

const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
const dayOf = (iso) => new Date(iso).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const MAX_SIDE = 1920, MAX_FILES = 10, MAX_MB = 20;
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const urlCache = new Map();
const urlOf = async (path) => { if (!urlCache.has(path)) urlCache.set(path, db.fileUrl(path).catch((e) => { urlCache.delete(path); throw e; })); return urlCache.get(path); };

// Thu nhỏ ảnh lớn trước khi tải lên (cạnh dài tối đa 1920 px) để gửi nhanh và đỡ tốn dung lượng
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp|bmp)$/i.test(file.type)) return { blob: file, ...(await dims(file)) };
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { blob: file, w: 0, h: 0 };
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), hh = Math.round(bmp.height * k);
  if (k === 1 && file.size < 1.5e6) { bmp.close?.(); return { blob: file, w, h: hh }; }
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const g = c.getContext('2d');
  const png = file.type === 'image/png';
  if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); }
  g.drawImage(bmp, 0, 0, w, hh); bmp.close?.();
  const blob = await new Promise(r => c.toBlob(r, png ? 'image/webp' : 'image/jpeg', 0.86));
  return blob && blob.size < file.size ? { blob, w, h: hh } : { blob: file, w, h: hh };
}
function dims(file) {
  return new Promise((res) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { res({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(u); }; im.onerror = () => { res({ w: 0, h: 0 }); URL.revokeObjectURL(u); }; im.src = u; });
}
const extOf = (type, name) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type] || (name.split('.').pop() || 'img').toLowerCase());

// Xem ảnh lớn
function viewImage(att) {
  const img = h('img', { alt: att.name || 'Ảnh' });
  const dl = h('a', { class: 'btn btn-sm', target: '_blank', rel: 'noopener', download: att.name || 'anh' }, '⬇ Tải ảnh');
  const close = () => { ov.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const ov = h('div', { class: 'img-view', onclick: (e) => { if (e.target === ov) close(); } },
    h('div', { class: 'img-view-bar' }, h('span', { class: 'small' }, att.name || ''), dl, h('button', { class: 'btn btn-sm', onclick: close }, '✕ Đóng')), img);
  document.body.append(ov); addEventListener('keydown', onKey);
  urlOf(att.path).then(u => { img.src = u; dl.href = u; }).catch(toastErr);
  db.fileUrl(att.path, att.name || 'anh').then(u => { dl.href = u; }).catch(() => {});
}

const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MORE = ['🔥', '👏', '🎉', '✅', '❌', '👀', '💯', '🤔', '😅', '😍', '🥲', '😡', '💪', '🙌', '👌', '⭐', '📌', '⏰'];
// màu chữ đọc được trên nền màu tài khoản
const ink = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fff'; const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1f2937' : '#fff'; };

const timeOf = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function mountChat(el, { onRead }) {
  let msgs = [], reacts = [];
  const typing = new Map();
  const list = h('div', { class: 'chat-list' });
  const typingEl = h('div', { class: 'chat-typing small muted' });
  const box = h('textarea', { class: 'input chat-in', rows: 1, placeholder: 'Nhắn cho cả nhóm…  (Enter để gửi, Shift + Enter xuống dòng)' });
  const send = h('button', { class: 'btn btn-primary', onclick: () => submit() }, 'Gửi');
  const picker = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => { addFiles(picker.files); picker.value = ''; } });
  const attachBtn = h('button', { class: 'icon-btn chat-attach', title: 'Gửi ảnh (có thể dán Ctrl + V hoặc kéo thả ảnh vào đây)', onclick: () => picker.click() }, '🖼');
  const tray = h('div', { class: 'chat-tray' });
  let pending = [];   // [{ file, url }]
  const chatEl = h('div', { class: 'chat' }, list, h('div', { class: 'chat-foot' }, typingEl, tray, h('div', { class: 'chat-compose' }, attachBtn, picker, box, send)));
  el.append(chatEl);

  function addFiles(files) {
    const imgs = [...(files || [])].filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    for (const f of imgs) {
      if (pending.length >= MAX_FILES) { toastErr(new Error(`Mỗi lần gửi tối đa ${MAX_FILES} ảnh.`)); break; }
      if (f.size > MAX_MB * 1e6) { toastErr(new Error(`Ảnh “${f.name}” lớn hơn ${MAX_MB} MB.`)); continue; }
      pending.push({ file: f, url: URL.createObjectURL(f) });
    }
    renderTray(); box.focus();
  }
  function renderTray() {
    fill(tray, pending.map((p, i) => h('span', { class: 'tray-it' }, h('img', { src: p.url, alt: '' }),
      h('button', { class: 'tray-x', title: 'Bỏ ảnh này', onclick: () => { URL.revokeObjectURL(p.url); pending.splice(i, 1); renderTray(); } }, '×'))));
    tray.classList.toggle('on', pending.length > 0);
  }
  box.addEventListener('paste', (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.some(f => f.type.startsWith('image/'))) { e.preventDefault(); addFiles(fs); } });
  chatEl.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); chatEl.classList.add('drop'); } });
  chatEl.addEventListener('dragleave', (e) => { if (e.target === chatEl || !chatEl.contains(e.relatedTarget)) chatEl.classList.remove('drop'); });
  chatEl.addEventListener('drop', (e) => { e.preventDefault(); chatEl.classList.remove('drop'); addFiles(e.dataTransfer?.files); });
  const room = db.room('chat-team', (m) => { if (m.t === 'typing' && m.uid !== store.user.id) { typing.set(m.uid, { name: m.name, at: Date.now() }); renderTyping(); setTimeout(renderTyping, 3200); } });

  function renderTyping() {
    const who = [...typing.values()].filter(x => Date.now() - x.at < 3000).map(x => x.name);
    typingEl.textContent = who.length ? `${who.join(', ')} đang nhập…` : '';
  }
  const atts = (m) => Array.isArray(m.attachments) ? m.attachments : [];
  function thumb(a) {
    const img = h('img', { alt: a.name || 'Ảnh', loading: 'lazy', onload: () => { if (list.scrollHeight - list.scrollTop - list.clientHeight < 400) list.scrollTop = list.scrollHeight; } });
    if (a.w && a.h) img.style.aspectRatio = `${a.w} / ${a.h}`;
    urlOf(a.path).then(u => { img.src = u; }).catch(() => { img.alt = 'Không tải được ảnh'; });
    return h('button', { class: 'msg-img', title: 'Bấm để xem ảnh lớn', onclick: () => viewImage(a) }, img);
  }
  // ---------- cảm xúc ----------
  function reactRow(m) {
    const mine = reacts.filter(r => r.message_id === m.id);
    if (!mine.length) return null;
    const by = new Map();
    mine.forEach(r => { if (!by.has(r.emoji)) by.set(r.emoji, []); by.get(r.emoji).push(r); });
    return h('div', { class: 'msg-reacts' }, [...by].map(([emo, rs]) => {
      const meIn = rs.some(r => r.user_id === store.user.id);
      const names = rs.map(r => r.user_id === store.user.id ? 'Bạn' : nameOf(r.user_id)).join(', ');
      return h('button', { class: `react-chip ${meIn ? 'on' : ''}`, title: `${names} đã thả ${emo}${meIn ? ' · bấm để bỏ' : ''}`, onclick: () => toggleReact(m, emo) }, h('span', { class: 'emo' }, emo), rs.length > 1 ? h('b', {}, rs.length) : h('span', { class: 'dots' }, rs.slice(0, 1).map(r => h('i', { style: { background: colorOf(r.user_id) } }))));
    }));
  }
  let busy = new Set();
  async function toggleReact(m, emo) {
    const key = m.id + emo; if (busy.has(key)) return; busy.add(key);
    const had = reacts.find(r => r.message_id === m.id && r.user_id === store.user.id && r.emoji === emo);
    try {
      if (had) { reacts = reacts.filter(r => r !== had); render(); await db.remove('message_reactions', had.id); }
      else {
        const tmp = { id: 'tmp-' + key, message_id: m.id, user_id: store.user.id, emoji: emo }; reacts.push(tmp); render();
        const r = await db.insert('message_reactions', { message_id: m.id, user_id: store.user.id, emoji: emo });
        reacts = reacts.filter(x => x !== tmp && x.id !== r.id); reacts.push(r); render();
      }
    } catch (e) { reacts = reacts.filter(r => !String(r.id).startsWith('tmp-')); render(); if (!/duplicate|unique/i.test(e.message || '')) toastErr(e); }
    finally { busy.delete(key); }
  }
  function pickReact(m, anchor) {
    document.querySelectorAll('.react-pick').forEach(x => x.remove());
    let more = false;
    const pop = h('div', { class: 'react-pick' });
    const draw = () => fill(pop, h('div', { class: 'rp-row' }, QUICK.map(e => h('button', { class: 'rp-e', onclick: () => { close(); toggleReact(m, e); } }, e)),
        h('button', { class: 'rp-e rp-more', title: 'Thêm biểu tượng', onclick: (ev) => { ev.stopPropagation(); more = !more; draw(); } }, more ? '−' : '+')),
      more ? h('div', { class: 'rp-grid' }, MORE.map(e => h('button', { class: 'rp-e', onclick: () => { close(); toggleReact(m, e); } }, e))) : null);
    draw();
    document.body.append(pop);
    const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left + r.width / 2 - pw / 2)) + 'px';
    pop.style.top = (r.top - ph - 8 < 8 ? r.bottom + 8 : r.top - ph - 8) + 'px';
    const close = () => { pop.remove(); removeEventListener('pointerdown', outside, true); removeEventListener('keydown', esc1, true); };
    const outside = (e) => { if (!pop.contains(e.target)) close(); };
    const esc1 = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    setTimeout(() => { addEventListener('pointerdown', outside, true); addEventListener('keydown', esc1, true); }, 0);
  }

  // ---------- trả lời tin nhắn ----------
  let replyTo = null;
  const snippet = (m) => (m.body || '').replace(/\s+/g, ' ').trim().slice(0, 90) + ((m.body || '').length > 90 ? '…' : '') || (atts(m).length ? `🖼 ${atts(m).length > 1 ? atts(m).length + ' ảnh' : 'Ảnh'}` : '');
  const whoOf = (m) => m.user_id === store.user.id ? 'Bạn' : nameOf(m.user_id);
  function quoteOf(m) {
    const src = msgs.find(x => x.id === m.reply_to);
    const mine = m.user_id === store.user.id;
    if (!src) return h('div', { class: 'msg-quote gone' }, '↩ Tin nhắn gốc đã bị xoá');
    const target = src.user_id === store.user.id ? (mine ? 'chính mình' : 'bạn') : nameOf(src.user_id);
    return h('button', { class: 'msg-quote', title: 'Đến tin nhắn gốc', onclick: () => jumpTo(src.id) },
      h('span', { class: 'q-who' }, `↩ ${mine ? 'Bạn' : nameOf(m.user_id)} trả lời ${target}`),
      h('span', { class: 'q-txt' }, snippet(src)));
  }
  function jumpTo(id) {
    const el = list.querySelector(`.msg[data-id="${id}"]`); if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  const replyBar = h('div', { class: 'reply-bar' });
  function startReply(m) { replyTo = m; renderReply(); box.focus(); }
  function cancelReply() { replyTo = null; renderReply(); }
  function renderReply() {
    replyBar.classList.toggle('on', !!replyTo);
    fill(replyBar, replyTo ? [h('div', { class: 'rb-txt' }, h('b', {}, `Đang trả lời ${whoOf(replyTo) === 'Bạn' ? 'chính mình' : whoOf(replyTo)}`), h('span', {}, snippet(replyTo))),
      h('button', { class: 'tray-x rb-x', title: 'Huỷ trả lời (Esc)', onclick: cancelReply }, '×')] : []);
  }
  tray.before(replyBar);

  function render() {
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    let day = '', prev = null;
    fill(list, msgs.length ? msgs.map(m => {
      const d = dayOf(m.created_at), mine = m.user_id === store.user.id;
      const grouped = prev && prev.user_id === m.user_id && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000 && d === day;
      const out = [d !== day ? h('div', { class: 'chat-day' }, d) : null,
        h('div', { class: `msg ${mine ? 'mine' : ''} ${grouped && !m.reply_to ? 'grp' : ''}`, 'data-id': m.id, style: { '--uc': colorOf(m.user_id), '--uc-ink': ink(colorOf(m.user_id)) } },
          !mine && !grouped ? avatar(profileOf(m.user_id) || { display_name: nameOf(m.user_id) }, 30) : h('span', { class: 'msg-sp' }),
          h('div', { class: 'msg-b' },
            !grouped || m.reply_to ? h('div', { class: 'msg-h' }, h('b', {}, mine ? 'Bạn' : nameOf(m.user_id)), h('small', {}, timeOf(m.created_at))) : null,
            m.reply_to ? quoteOf(m) : null,
            atts(m).length ? h('div', { class: `msg-imgs n${Math.min(atts(m).length, 3)}` }, atts(m).map(a => thumb(a))) : null,
            m.body ? h('div', { class: 'bubble', html: linkify(m.body) }) : null,
            reactRow(m)),
          h('div', { class: 'msg-acts' },
            h('button', { class: 'msg-act', title: 'Thả cảm xúc', onclick: (e) => pickReact(m, e.currentTarget) }, '☺'),
            h('button', { class: 'msg-act', title: 'Trả lời tin nhắn này', onclick: () => startReply(m) }, '↩')))];
      day = d; prev = m; return out;
    }) : h('div', { class: 'empty' }, h('div', { class: 'big' }, '💬'), h('p', {}, 'Chưa có tin nhắn.')));
    if (atBottom || !render.done) list.scrollTop = list.scrollHeight;
    render.done = true;
    if (msgs.length) { markRead(msgs[msgs.length - 1].created_at); onRead?.(); }
  }
  let sending = false;
  async function submit() {
    const body = box.value.trim();
    if ((!body && !pending.length) || sending) return;
    sending = true; send.disabled = true; attachBtn.disabled = true;
    const files = pending; pending = []; renderTray();
    const reply = replyTo; cancelReply();
    box.value = ''; autosize();
    if (files.length) send.textContent = 'Đang gửi ảnh…';
    try {
      const attachments = [];
      for (const p of files) {
        const { blob, w, h: hh } = await shrink(p.file);
        const path = `chat/${store.user.id}/${rid()}.${extOf(blob.type || p.file.type, p.file.name)}`;
        await db.upload(path, blob instanceof File ? blob : new File([blob], p.file.name, { type: blob.type }));
        attachments.push({ path, name: p.file.name, w, h: hh, size: blob.size, mime: blob.type || p.file.type });
      }
      const row = { user_id: store.user.id, body };
      if (reply) row.reply_to = reply.id;
      if (attachments.length) row.attachments = attachments;
      const m = await db.insert('messages', row);
      files.forEach(p => URL.revokeObjectURL(p.url));
      if (!msgs.some(x => x.id === m.id)) { msgs.push(m); render(); list.scrollTop = list.scrollHeight; }
    } catch (e) {
      toastErr(e); box.value = body; autosize();
      if (files.length && !pending.length) { pending = files; renderTray(); }
      if (reply && !replyTo) startReply(reply);
    } finally { sending = false; send.disabled = false; attachBtn.disabled = false; send.textContent = 'Gửi'; }
  }
  const autosize = () => { box.style.height = 'auto'; box.style.height = Math.min(160, box.scrollHeight) + 'px'; };
  let lastTyping = 0;
  box.addEventListener('input', () => { autosize(); if (Date.now() - lastTyping > 1500) { lastTyping = Date.now(); room.send({ t: 'typing', uid: store.user.id, name: store.me?.display_name }); } });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && replyTo) { e.preventDefault(); cancelReply(); return; } if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });

  const off = db.subscribe('messages', null, (e) => {
    if (e.type === 'DELETE') msgs = msgs.filter(m => m.id !== e.old.id);
    else if (!msgs.some(m => m.id === e.new.id)) { msgs.push(e.new); typing.delete(e.new.user_id); renderTyping(); }
    msgs.sort((a, b) => a.created_at.localeCompare(b.created_at)); render();
  });
  const offP = on('profiles', render);
  const offR = db.subscribe('message_reactions', null, (e) => {
    if (e.type === 'DELETE') reacts = reacts.filter(r => r.id !== e.old.id);
    else if (!reacts.some(r => r.id === e.new.id)) { reacts = reacts.filter(r => !(String(r.id).startsWith('tmp-') && r.message_id === e.new.message_id && r.user_id === e.new.user_id && r.emoji === e.new.emoji)); reacts.push(e.new); }
    render();
  });
  (async () => {
    try { msgs = await db.select('messages', { order: ['created_at', true] }); msgs = msgs.slice(-500); render(); box.focus(); } catch (e) { toastErr(e); }
    try { reacts = await db.select('message_reactions'); render(); } catch (e) { console.warn('Chưa có bảng cảm xúc', e); }
  })();
  return () => { off(); offP(); offR(); document.querySelectorAll('.react-pick').forEach(x => x.remove()); room.close(); pending.forEach(p => URL.revokeObjectURL(p.url)); };
}
