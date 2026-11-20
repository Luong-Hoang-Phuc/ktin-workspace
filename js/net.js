// =====================================================================
// LÀM VIỆC KHI MẤT MẠNG
// - Mất mạng: mọi thay đổi (thêm / sửa / xoá) được giữ tạm trên máy theo đúng thứ tự,
//   giao diện vẫn cập nhật ngay; có mạng lại thì tự gửi lên máy chủ
// - Trang đã mở vẫn xem được (dùng bản dữ liệu đã tải gần nhất)
// - Có mạng lại: tải lại trang đang mở để không sót thay đổi của bạn khác trong lúc mất mạng
// =====================================================================
import db from './db.js';
import { store } from './store.js';
import { h, toast } from './ui.js';

const KEY = 'ktin-outbox';
const isNetErr = (e) => !navigator.onLine || /failed to fetch|networkerror|load failed|fetch failed|network request failed|err_internet|timed? ?out/i.test(e?.message || String(e || ''));
const now = () => new Date().toISOString();
let queue = [], orig = null, flushing = false, wasOffline = false, bar = null;
const cache = new Map();   // bản đọc gần nhất (để xem lại khi mất mạng)

function load() { try { queue = JSON.parse(localStorage.getItem(KEY)) || []; } catch { queue = []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch {} renderBar(); }
const offline = () => !navigator.onLine;

function renderBar() {
  if (!bar) { bar = h('div', { class: 'net-banner', role: 'status', 'aria-live': 'polite' }); document.body.append(bar); }
  const n = queue.length;
  if (offline()) { bar.className = 'net-banner off'; bar.textContent = n ? `📴 Đang mất mạng – ${n} thay đổi đang giữ tạm trên máy, sẽ tự đồng bộ khi có mạng.` : '📴 Đang mất mạng – bạn vẫn xem và sửa được, thay đổi sẽ tự đồng bộ khi có mạng.'; }
  else if (n) { bar.className = 'net-banner sync'; bar.textContent = `⏳ Đang đồng bộ ${n} thay đổi…`; }
  else bar.className = 'net-banner';
}

function enqueue(op, table, args, result) {
  queue.push({ op, table, args, at: now() });
  save();
  return result;
}

async function flush() {
  if (flushing || offline() || !queue.length) return;
  flushing = true;
  let done = 0, dropped = 0;
  try {
    while (queue.length && !offline()) {
      const { op, table, args } = queue[0];
      try { await orig[op](table, ...args); done++; }
      catch (e) {
        if (isNetErr(e)) break;                 // vẫn chưa có mạng → thử lại sau
        console.warn('Bỏ thay đổi không gửi được', op, table, e); dropped++;   // VD đã có sẵn (trùng) → bỏ qua
      }
      queue.shift(); save();
    }
  } finally { flushing = false; renderBar(); }
  if (done) toast(`✅ Đã đồng bộ ${done} thay đổi làm lúc mất mạng`, 'ok');
  if (dropped) toast(`${dropped} thay đổi không gửi được (có thể bạn khác đã sửa / xoá trước) – hãy kiểm tra lại.`, 'error');
  if (!queue.length && (done || wasOffline)) resync();
}
// tải lại trang đang mở (nếu không có ai đang gõ dở) để lấy thay đổi của bạn khác trong lúc mất mạng
function resync() {
  wasOffline = false;
  const a = document.activeElement;
  if (a && (a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { toast('Đã có mạng lại – bấm F5 nếu dữ liệu chưa khớp với các bạn.', 'info'); return; }
  store.actions.go?.(location.hash);
}

export function initNet({ force = false } = {}) {
  if (orig) return;
  let test = false; try { test = localStorage.getItem('ktin-net-test') === '1'; } catch {}
  if (db.demo && !force && !test) return;   // bản xem thử không dùng mạng
  load();
  orig = Object.fromEntries(['insert', 'insertMany', 'update', 'remove', 'removeMany', 'select', 'selectAll', 'get', 'upload'].map(k => [k, db[k].bind(db)]));
  const withId = (table, row) => (table === 'activity' || row.id) ? row : { id: crypto.randomUUID(), ...row };
  const write = (op, table, args, optimistic) => async () => {
    if (offline() || queue.length) return enqueue(op, table, args, optimistic);
    try { return await orig[op](table, ...args); }
    catch (e) { if (isNetErr(e)) return enqueue(op, table, args, optimistic); throw e; }
  };
  db.insert = (table, row) => { const r = withId(table, row); return write('insert', table, [r], { created_at: now(), updated_at: now(), ...r })(); };
  db.insertMany = (table, rows) => { const rs = rows.map(r => withId(table, r)); return write('insertMany', table, [rs], rs.map(r => ({ created_at: now(), updated_at: now(), ...r })))(); };
  db.update = (table, id, patch) => write('update', table, [id, patch], { id, ...patch })();
  db.remove = (table, id) => write('remove', table, [id], undefined)();
  db.removeMany = (table, ids) => write('removeMany', table, [ids], undefined)();
  const read = (op) => async (...args) => {
    const k = op + JSON.stringify(args);
    try { const r = await orig[op](...args); cache.set(k, r); return r; }
    catch (e) { if (isNetErr(e) && cache.has(k)) return structuredClone(cache.get(k)); throw e; }
  };
  db.select = read('select'); db.selectAll = read('selectAll'); db.get = read('get');
  db.upload = async (...a) => { if (offline()) throw new Error('Đang mất mạng – chưa tải tệp / ảnh lên được. Thử lại khi có mạng.'); return orig.upload(...a); };
  addEventListener('offline', () => { wasOffline = true; renderBar(); });
  addEventListener('online', () => { renderBar(); flush(); if (!queue.length && wasOffline) resync(); });
  setInterval(flush, 15000);
  renderBar();
  flush();
}
