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
const timeOf = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function mountChat(el, { onRead }) {
  let msgs = [];
  const typing = new Map();
  const list = h('div', { class: 'chat-list' });
  const typingEl = h('div', { class: 'chat-typing small muted' });
  const box = h('textarea', { class: 'input chat-in', rows: 1, placeholder: 'Nhắn cho cả nhóm…  (Enter để gửi, Shift + Enter xuống dòng)' });
  const send = h('button', { class: 'btn btn-primary', onclick: () => submit() }, 'Gửi');
  el.append(h('div', { class: 'chat' }, list, h('div', { class: 'chat-foot' }, typingEl, h('div', { class: 'chat-compose' }, box, send))));
  const room = db.room('chat-team', (m) => { if (m.t === 'typing' && m.uid !== store.user.id) { typing.set(m.uid, { name: m.name, at: Date.now() }); renderTyping(); setTimeout(renderTyping, 3200); } });

  function renderTyping() {
    const who = [...typing.values()].filter(x => Date.now() - x.at < 3000).map(x => x.name);
    typingEl.textContent = who.length ? `${who.join(', ')} đang nhập…` : '';
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
            h('div', { class: 'bubble', html: linkify(m.body) })))];
      day = d; prev = m; return out;
    }) : h('div', { class: 'empty' }, h('div', { class: 'big' }, '💬'), h('p', {}, 'Chưa có tin nhắn.')));
    if (atBottom || !render.done) list.scrollTop = list.scrollHeight;
    render.done = true;
    if (msgs.length) { markRead(msgs[msgs.length - 1].created_at); onRead?.(); }
  }
  async function submit() {
    const body = box.value.trim(); if (!body) return;
    box.value = ''; autosize();
    try { const m = await db.insert('messages', { user_id: store.user.id, body }); if (!msgs.some(x => x.id === m.id)) { msgs.push(m); render(); list.scrollTop = list.scrollHeight; } }
    catch (e) { toastErr(e); box.value = body; }
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
  return () => { off(); offP(); room.close(); };
}
