import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { API_URL, API_KEY, STORAGE_BUCKET } from './config.js';

const sb = createClient(API_URL, API_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
});
const rooms = new Map(), subs = new Map();
const presenceFns = new Set();
let presenceCh = null, presenceMe = null;

const must = ({ data, error }) => { if (error) throw error; return data; };
const uid = () => Math.random().toString(36).slice(2, 10);

const db = {
  demo: false,

  // ---------- AUTH ----------
  async getUser() {
    const { data } = await sb.auth.getSession();
    return data.session?.user ?? null;
  },
  onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s?.user ?? null)); },
  async signInOtp(email) {
    must(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } }));
  },
  async signInPassword(email, password) { must(await sb.auth.signInWithPassword({ email, password })); },
  async setPassword(password) { must(await sb.auth.updateUser({ password })); },
  async signOut() { await sb.auth.signOut(); },

  // ---------- CRUD ----------
  async select(table, { eq = {}, order = null, isNull = [] } = {}) {
    let q = sb.from(table).select('*');
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
    for (const k of isNull) q = q.is(k, null);
    if (order) q = q.order(order[0], { ascending: order[1] !== false });
    return must(await q);
  },
  // Lấy hết (Supabase mỗi lần trả tối đa 1.000 dòng → lấy theo từng trang)
  async selectAll(table, { eq = {} } = {}) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select('*').range(from, from + 999);
      for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
      const d = must(await q); out.push(...d);
      if (d.length < 1000) return out;
    }
  },
  async get(table, id) { return must(await sb.from(table).select('*').eq('id', id).maybeSingle()); },
  async insert(table, row) { return must(await sb.from(table).insert(row).select().single()); },
  async insertMany(table, rows) { const out = []; for (let i = 0; i < rows.length; i += 500) out.push(...must(await sb.from(table).insert(rows.slice(i, i + 500)).select())); return out; },
  async removeMany(table, ids) { for (let i = 0; i < ids.length; i += 200) must(await sb.from(table).delete().in('id', ids.slice(i, i + 200))); },
  async update(table, id, patch) { return must(await sb.from(table).update(patch).eq('id', id).select().maybeSingle()); },
  async remove(table, id) { must(await sb.from(table).delete().eq('id', id)); },

  // ---------- REALTIME ----------
  // cb({type:'INSERT'|'UPDATE'|'DELETE', new, old})
  // Các nơi theo dõi cùng một bảng + cùng bộ lọc dùng chung 1 kênh realtime (đỡ tốn kết nối, đỡ nhận trùng dữ liệu)
  subscribe(table, filter, cb) {
    const f = filter ? `${filter[0]}=eq.${filter[1]}` : undefined;
    const key = `${table}|${f || ''}`;
    let s = subs.get(key);
    if (!s) {
      const ch = sb.channel(`db-${table}-${uid()}`);
      s = { ch, fns: new Set() };
      const relay = (p) => { const ev = { type: p.eventType, new: p.new, old: p.old }; [...s.fns].forEach(fn => { try { fn(ev); } catch (e) { console.error(e); } }); };
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: f }, relay);
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: f }, relay);
      // Sự kiện DELETE không lọc được theo cột → nhận hết, phía giao diện tự bỏ qua id không liên quan
      ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, relay);
      ch.subscribe();
      subs.set(key, s);
    }
    s.fns.add(cb);
    return () => { s.fns.delete(cb); if (!s.fns.size && subs.get(key) === s) { subs.delete(key); sb.removeChannel(s.ch); } };
  },

  // Kênh phát nhanh (không lưu DB): dùng cho con trỏ, "đang gõ"…
  // Mỗi tên kênh chỉ tạo 1 lần rồi dùng chung — Supabase không cho đăng ký thêm sự kiện
  // vào kênh đã subscribe, nên mở lại cùng một kênh (chuyển trang qua lại) sẽ gây lỗi.
  room(name, onMessage) {
    let r = rooms.get(name);
    if (!r) {
      const ch = sb.channel(`room-${name}`, { config: { broadcast: { self: false } } });
      r = { ch, fns: new Set() };
      ch.on('broadcast', { event: 'msg' }, ({ payload }) => r.fns.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } }));
      ch.subscribe();
      rooms.set(name, r);
    }
    r.fns.add(onMessage);
    return {
      send: (payload) => r.ch.send({ type: 'broadcast', event: 'msg', payload }),
      close: () => r.fns.delete(onMessage),
    };
  },

  // Ai đang online, đang ở đâu (một kênh duy nhất cho cả phiên)
  presence(me, onSync) {
    presenceFns.add(onSync);
    if (!presenceCh) {
      presenceMe = me;
      presenceCh = sb.channel('presence-team', { config: { presence: { key: me.id } } });
      presenceCh.on('presence', { event: 'sync' }, () => {
        const list = Object.values(presenceCh.presenceState()).map(arr => arr[arr.length - 1]);
        presenceFns.forEach(fn => fn(list));
      });
      presenceCh.subscribe(async (s) => { if (s === 'SUBSCRIBED') await presenceCh.track(presenceMe); });
    }
    return {
      update: (state) => { presenceMe = { ...presenceMe, ...state }; return presenceCh?.track(presenceMe); },
      leave: () => { presenceFns.clear(); const ch = presenceCh; presenceCh = null; if (ch) sb.removeChannel(ch); },
    };
  },

  // ---------- STORAGE ----------
  async upload(path, file) {
    must(await sb.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' }));
    return path;
  },
  async fileUrl(path, downloadName) {
    const d = must(await sb.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600, downloadName ? { download: downloadName } : undefined));
    return d.signedUrl;
  },
  async removeFile(path) { must(await sb.storage.from(STORAGE_BUCKET).remove([path])); },
};

export default db;
