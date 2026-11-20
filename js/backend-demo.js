// CHẾ ĐỘ DEMO: dữ liệu lưu trong trình duyệt (localStorage), "realtime" giữa các tab qua BroadcastChannel.
// Dùng để xem thử giao diện khi chưa cấu hình máy chủ.
import { buildSeed } from './demo-seed.js';
const KEY = 'ktin-demo-v7';
let bc = null; try { bc = new BroadcastChannel('ktin-demo'); } catch {}
const listeners = new Set();
const rooms = new Map();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
const now = () => new Date().toISOString();

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return s; } catch {}
  return seed();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Demo storage unavailable', e); } }
function seed() {
  const s = buildSeed(uuid);
  return { t: s.t, blobs: s.blobs, user: null, meta: s.meta };
}
let state = load();

function emit(table, evt, local = true) {
  for (const l of listeners) if (l.table === table) {
    if (evt.type !== 'DELETE' && l.filter && (evt.new?.[l.filter[0]] !== l.filter[1])) continue;
    l.cb(evt);
  }
  if (local && bc) bc.postMessage({ kind: 'db', table, evt });
}
if (bc) bc.onmessage = ({ data }) => {
  if (data.kind === 'db') { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) state = s; } catch {} emit(data.table, data.evt, false); }
  if (data.kind === 'room') rooms.get(data.name)?.forEach(fn => fn(data.payload));
  if (data.kind === 'presence') presenceIn(data.p);
};

// presence
const peers = new Map(); let presenceCb = null; let mePresence = null;
function presenceIn(p, ttl = 0) { if (p.leave) peers.delete(p.id); else peers.set(p.id, { ...p, seen: Date.now() + ttl }); firePresence(); }
function firePresence() {
  if (!presenceCb) return;
  for (const [k, v] of peers) if (Date.now() - v.seen > 15000) peers.delete(k);
  presenceCb([mePresence, ...peers.values()].filter(Boolean));
}

const authCbs = [];
const db = {
  demo: true,
  async getUser() { return state.user; },
  onAuth(cb) { authCbs.push(cb); },
  async signInOtp(email) { return this.signInPassword(email); },
  async signInPassword(email, nick) {
    let p = state.t.profiles.find(x => x.email === email);
    if (!p) { p = { id: uuid(), email, display_name: nick || email.split('@')[0], color: '#2563eb', created_at: now() }; state.t.profiles.push(p); }
    state.user = { id: p.id, email }; save(); authCbs.forEach(cb => cb(state.user));
  },
  async setPassword() {},
  async signOut() { state.user = null; save(); authCbs.forEach(cb => cb(null)); },

  async select(table, { eq = {}, order = null, isNull = [] } = {}) {
    let rows = (state.t[table] || []).filter(r => Object.entries(eq).every(([k, v]) => (r[k] ?? null) === v) && isNull.every(k => r[k] == null));
    if (order) rows = [...rows].sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : a[order[0]] < b[order[0]] ? -1 : 0) * (order[1] === false ? -1 : 1));
    return structuredClone(rows);
  },
  async selectAll(table, opts) { return this.select(table, opts); },
  async get(table, id) { return structuredClone((state.t[table] || []).find(r => r.id === id) || null); },
  async insert(table, row) {
    const r = { id: table === 'activity' ? Date.now() + Math.random() : uuid(), created_at: now(), updated_at: now(), ...row };
    (state.t[table] ||= []).push(r); save(); emit(table, { type: 'INSERT', new: r, old: {} }); return structuredClone(r);
  },
  async insertMany(table, rows) {
    const out = rows.map(row => ({ id: uuid(), created_at: now(), updated_at: now(), ...row }));
    (state.t[table] ||= []).push(...out); save(); out.forEach(r => emit(table, { type: 'INSERT', new: r, old: {} })); return structuredClone(out);
  },
  async removeMany(table, ids) {
    const set = new Set(ids); const olds = (state.t[table] || []).filter(r => set.has(r.id));
    state.t[table] = (state.t[table] || []).filter(r => !set.has(r.id)); save(); olds.forEach(o => emit(table, { type: 'DELETE', new: {}, old: o }));
  },
  async update(table, id, patch) {
    const r = (state.t[table] || []).find(x => x.id === id); if (!r) return null;
    const old = { ...r }; Object.assign(r, patch); save(); emit(table, { type: 'UPDATE', new: r, old }); return structuredClone(r);
  },
  async remove(table, id) {
    const i = (state.t[table] || []).findIndex(x => x.id === id); if (i < 0) return;
    const [old] = state.t[table].splice(i, 1);
    // xoá dây chuyền đơn giản
    const cascade = { folders: [['folders', 'parent_id'], ['files', 'folder_id'], ['notes', 'folder_id'], ['boards', 'folder_id'], ['data_tables', 'folder_id']], boards: [['board_items', 'board_id']], messages: [['message_reactions', 'message_id']], data_tables: [['data_rows', 'table_id'], ['cell_comments', 'table_id']], data_rows: [['cell_comments', 'row_id']], files: [['files', 'parent_file_id']], factory_nodes: [['factory_nodes', 'parent_id']], machines: [['factory_nodes', 'machine_id']] }[table] || [];
    save(); emit(table, { type: 'DELETE', new: {}, old });
    for (const [t, col] of cascade) for (const r of (state.t[t] || []).filter(x => x[col] === id)) await this.remove(t, r.id);
  },
  subscribe(table, filter, cb) { const l = { table, filter, cb }; listeners.add(l); return () => listeners.delete(l); },
  room(name, onMessage) {
    if (!rooms.has(name)) rooms.set(name, new Set());
    rooms.get(name).add(onMessage);
    return { send: (payload) => bc?.postMessage({ kind: 'room', name, payload }), close: () => rooms.get(name)?.delete(onMessage) };
  },
  presence(me, onSync) {
    presenceCb = onSync; mePresence = me;
    const beat = () => { bc?.postMessage({ kind: 'presence', p: mePresence }); firePresence(); };
    const iv = setInterval(beat, 5000); beat();
    addEventListener('beforeunload', () => bc?.postMessage({ kind: 'presence', p: { id: me.id, leave: true } }));
    return { update: (s) => { mePresence = { ...mePresence, ...s }; beat(); }, leave: () => { clearInterval(iv); bc?.postMessage({ kind: 'presence', p: { id: me.id, leave: true } }); } };
  },
  async upload(path, file) {
    const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
    state.blobs[path] = data;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { delete state.blobs[path]; throw new Error('Chế độ xem thử: bộ nhớ trình duyệt đầy (tệp quá lớn). Hãy dùng bản chính thức để tải lên tệp thật.'); }
    return path;
  },
  async fileUrl(path) { return state.blobs[path] || '#'; },
  async removeFile(path) { delete state.blobs[path]; save(); },

  // ---- chỉ dùng cho bản xem thử: mô phỏng thành viên khác ----
  _sim: {
    meta: () => state.meta || {},
    peer: (p) => presenceIn(p, 1e12),
    room: (name, payload) => rooms.get(name)?.forEach(fn => fn(payload)),
    reset: () => { try { localStorage.removeItem(KEY); } catch {} },
  },
};
export default db;
