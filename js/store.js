// Trạng thái dùng chung của ứng dụng
export const store = {
  user: null,          // tài khoản đăng nhập
  me: null,            // hồ sơ (profiles) của mình
  profiles: new Map(), // id → profile
  folders: [],         // toàn bộ thư mục
  online: [],          // danh sách presence
  presence: null,      // handle presence
  route: { view: 'dash' },
};

const handlers = {};
export function on(evt, fn) { (handlers[evt] ||= new Set()).add(fn); return () => handlers[evt].delete(fn); }
export function emit(evt, data) { handlers[evt]?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

export const profileOf = (id) => store.profiles.get(id) || null;
export const nameOf = (id) => { const p = profileOf(id); return p ? (p.display_name || p.email) : 'Ai đó'; };
export const folderOf = (id) => store.folders.find(f => f.id === id) || null;
export function folderPath(id) {
  const path = []; let f = folderOf(id); let guard = 0;
  while (f && guard++ < 20) { path.unshift(f); f = folderOf(f.parent_id); }
  return path;
}
export function setWhere(state) { store.presence?.update({ ...state, at: Date.now() }); }
