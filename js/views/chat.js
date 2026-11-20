// =====================================================================
// TIN NHẮN NHÓM – trò chuyện realtime giữa các thành viên
// =====================================================================
import db from '../db.js';
import { store, on, profileOf, nameOf } from '../store.js';
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

const timeOf = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function mountChat(el, { onRead }) {
  let msgs = [];
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
  function render() {
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    let day = '', prev = null;
    fill(list, msgs.length ? msgs.map(m => {
      const d = dayOf(m.created_at), mine = m.user_id === store.user.id;
      const grouped = prev && prev.user_id === m.user_id && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000 && d === day;
      const out = [d !== day ? h('div', { class: 'chat-day' }, d) : null,
        h('div', { class: `msg ${mine ? 'mine' : ''} ${grouped ? 'grp' : ''}` },
          !mine && !grouped ? avatar(profileOf(m.user_id) || { display_name: nameOf(m.user_id) }, 30) : h('span', { class: 'msg-sp' }),
          h('div', { class: 'msg-b' },
            !grouped ? h('div', { class: 'msg-h' }, h('b', {}, mine ? 'Bạn' : nameOf(m.user_id)), h('small', {}, timeOf(m.created_at))) : null,
            atts(m).length ? h('div', { class: `msg-imgs n${Math.min(atts(m).length, 3)}` }, atts(m).map(a => thumb(a))) : null,
            m.body ? h('div', { class: 'bubble', html: linkify(m.body) }) : null))];
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
      if (attachments.length) row.attachments = attachments;
      const m = await db.insert('messages', row);
      files.forEach(p => URL.revokeObjectURL(p.url));
      if (!msgs.some(x => x.id === m.id)) { msgs.push(m); render(); list.scrollTop = list.scrollHeight; }
    } catch (e) {
      toastErr(e); box.value = body; autosize();
      if (files.length && !pending.length) { pending = files; renderTray(); }
    } finally { sending = false; send.disabled = false; attachBtn.disabled = false; send.textContent = 'Gửi'; }
  }
  const autosize = () => { box.style.height = 'auto'; box.style.height = Math.min(160, box.scrollHeight) + 'px'; };
  let lastTyping = 0;
  box.addEventListener('input', () => { autosize(); if (Date.now() - lastTyping > 1500) { lastTyping = Date.now(); room.send({ t: 'typing', uid: store.user.id, name: store.me?.display_name }); } });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });

  const off = db.subscribe('messages', null, (e) => {
    if (e.type === 'DELETE') msgs = msgs.filter(m => m.id !== e.old.id);
    else if (!msgs.some(m => m.id === e.new.id)) { msgs.push(e.new); typing.delete(e.new.user_id); renderTyping(); }
    msgs.sort((a, b) => a.created_at.localeCompare(b.created_at)); render();
  });
  const offP = on('profiles', render);
  (async () => { try { msgs = await db.select('messages', { order: ['created_at', true] }); msgs = msgs.slice(-500); render(); box.focus(); } catch (e) { toastErr(e); } })();
  return () => { off(); offP(); room.close(); pending.forEach(p => URL.revokeObjectURL(p.url)); };
}
