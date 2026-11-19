import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
});

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
  async get(table, id) { return must(await sb.from(table).select('*').eq('id', id).maybeSingle()); },
  async insert(table, row) { return must(await sb.from(table).insert(row).select().single()); },
  async insertMany(table, rows) { const out = []; for (let i = 0; i < rows.length; i += 500) out.push(...must(await sb.from(table).insert(rows.slice(i, i + 500)).select())); return out; },
  async removeMany(table, ids) { for (let i = 0; i < ids.length; i += 200) must(await sb.from(table).delete().in('id', ids.slice(i, i + 200))); },
  async update(table, id, patch) { return must(await sb.from(table).update(patch).eq('id', id).select().maybeSingle()); },
  async remove(table, id) { must(await sb.from(table).delete().eq('id', id)); },

  // ---------- REALTIME ----------
  // cb({type:'INSERT'|'UPDATE'|'DELETE', new, old})
  subscribe(table, filter, cb) {
    const ch = sb.channel(`db-${table}-${uid()}`);
    const relay = (p) => cb({ type: p.eventType, new: p.new, old: p.old });
    const f = filter ? `${filter[0]}=eq.${filter[1]}` : undefined;
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: f }, relay);
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: f }, relay);
    // Sự kiện DELETE không lọc được theo cột → nhận hết, phía giao diện tự bỏ qua id không liên quan
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, relay);
    ch.subscribe();
    return () => sb.removeChannel(ch);
  },

  // Kênh phát nhanh (không lưu DB): dùng cho kéo thả whiteboard, con trỏ, "đang gõ"
  room(name, onMessage) {
    const ch = sb.channel(`room-${name}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'msg' }, ({ payload }) => onMessage(payload));
    ch.subscribe();
    return {
      send: (payload) => ch.send({ type: 'broadcast', event: 'msg', payload }),
      close: () => sb.removeChannel(ch),
    };
  },

  // Ai đang online, đang ở đâu
  presence(me, onSync) {
    const ch = sb.channel('presence-team', { config: { presence: { key: me.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      onSync(Object.values(st).map(arr => arr[arr.length - 1]));
    });
    ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') await ch.track(me); });
    return { update: (state) => ch.track({ ...me, ...state }), leave: () => sb.removeChannel(ch) };
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
