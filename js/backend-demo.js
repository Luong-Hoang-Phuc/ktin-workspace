// CHẾ ĐỘ DEMO: dữ liệu lưu trong trình duyệt (localStorage), "realtime" giữa các tab qua BroadcastChannel.
// Dùng để xem thử giao diện khi chưa cấu hình Supabase.
const KEY = 'ktin-demo-v1';
const bc = 'BroadcastChannel' in self ? new BroadcastChannel('ktin-demo') : null;
const listeners = new Set();
const rooms = new Map();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
const now = () => new Date().toISOString();

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return s; } catch {}
  return seed();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Demo storage full', e); } }
function seed() {
  const folders = [
    ['00. Tài liệu giảng viên', '📚'], ['01. Phương án nhà máy & CSDL', '🏭'], ['02. Dữ liệu máy', '⚙️'],
    ['03. Thông số sản phẩm – Hộp', '📦'], ['04. Thông số sản phẩm – Sách', '📖'], ['05. Phương án sản xuất', '🗺️'],
    ['06. Vật tư & thời gian', '🧮'], ['07. Giá thành', '💰'], ['08. Kế hoạch sản xuất', '📅'], ['09. Báo cáo Word', '📝'],
  ].map(([name, icon], i) => ({ id: uuid(), parent_id: null, name, icon, position: i, created_by: null, created_at: now() }));
  return { t: { profiles: [], folders, files: [], notes: [], boards: [], board_items: [], data_tables: [], data_rows: [], activity: [] }, blobs: {}, user: null };
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
  if (data.kind === 'db') { state = load(); emit(data.table, data.evt, false); }
  if (data.kind === 'room') rooms.get(data.name)?.forEach(fn => fn(data.payload));
  if (data.kind === 'presence') presenceIn(data.p);
};

// presence
const peers = new Map(); let presenceCb = null; let mePresence = null;
function presenceIn(p) { if (p.leave) peers.delete(p.id); else peers.set(p.id, { ...p, seen: Date.now() }); firePresence(); }
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
  async signInPassword(email) {
    let p = state.t.profiles.find(x => x.email === email);
    if (!p) { p = { id: uuid(), email, display_name: email.split('@')[0], color: ['#2563eb', '#db2777', '#059669', '#d97706'][state.t.profiles.length % 4], created_at: now() }; state.t.profiles.push(p); }
    state.user = { id: p.id, email }; save(); authCbs.forEach(cb => cb(state.user));
  },
  async setPassword() {},
  async signOut() { state.user = null; save(); authCbs.forEach(cb => cb(null)); },

  async select(table, { eq = {}, order = null, isNull = [] } = {}) {
    let rows = (state.t[table] || []).filter(r => Object.entries(eq).every(([k, v]) => r[k] === v) && isNull.every(k => r[k] == null));
    if (order) rows = [...rows].sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : a[order[0]] < b[order[0]] ? -1 : 0) * (order[1] === false ? -1 : 1));
    return structuredClone(rows);
  },
  async get(table, id) { return structuredClone((state.t[table] || []).find(r => r.id === id) || null); },
  async insert(table, row) {
    const r = { id: table === 'activity' ? Date.now() + Math.random() : uuid(), created_at: now(), updated_at: now(), ...row };
    state.t[table].push(r); save(); emit(table, { type: 'INSERT', new: r, old: {} }); return structuredClone(r);
  },
  async insertMany(table, rows) { const out = []; for (const r of rows) out.push(await this.insert(table, r)); return out; },
  async update(table, id, patch) {
    const r = state.t[table].find(x => x.id === id); if (!r) return null;
    const old = { ...r }; Object.assign(r, patch); save(); emit(table, { type: 'UPDATE', new: r, old }); return structuredClone(r);
  },
  async remove(table, id) {
    const i = state.t[table].findIndex(x => x.id === id); if (i < 0) return;
    const [old] = state.t[table].splice(i, 1);
    // xoá dây chuyền đơn giản
    const cascade = { folders: [['folders', 'parent_id'], ['files', 'folder_id'], ['notes', 'folder_id'], ['boards', 'folder_id'], ['data_tables', 'folder_id']], boards: [['board_items', 'board_id']], data_tables: [['data_rows', 'table_id']], files: [['files', 'parent_file_id']] }[table] || [];
    save(); emit(table, { type: 'DELETE', new: {}, old });
    for (const [t, col] of cascade) for (const r of state.t[t].filter(x => x[col] === id)) await this.remove(t, r.id);
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
    catch { delete state.blobs[path]; throw new Error('Chế độ demo: bộ nhớ trình duyệt đầy (file quá lớn). Hãy cấu hình Supabase để upload file thật.'); }
    return path;
  },
  async fileUrl(path) { return state.blobs[path] || '#'; },
  async removeFile(path) { delete state.blobs[path]; save(); },
};
export default db;
