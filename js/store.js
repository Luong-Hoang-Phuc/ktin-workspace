// Trạng thái dùng chung của ứng dụng
export const store = {
  user: null, me: null,
  profiles: new Map(),
  products: [],
  folders: [],
  settings: new Map(),
  online: [],
  presence: null,
  productId: null,      // sản phẩm đang làm việc
  route: { view: 'pick' },
  actions: {},
};

const handlers = {};
export function on(evt, fn) { (handlers[evt] ||= new Set()).add(fn); return () => handlers[evt].delete(fn); }
export function emit(evt, data) { handlers[evt]?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

export const profileOf = (id) => store.profiles.get(id) || null;
export const nameOf = (id) => { const p = profileOf(id); return p ? (p.display_name || p.email) : 'Ai đó'; };
export const folderOf = (id) => store.folders.find(f => f.id === id) || null;
export const productOf = (id) => store.products.find(p => p.id === id) || null;
export const sectionFolder = (pid, key) => store.folders.find(f => f.product_id === pid && f.section === key) || null;
export const docsFolder = (key) => store.folders.find(f => !f.product_id && f.section === key) || null;
// Mục 1 (phương án nhà máy) dùng chung cả công ty → thư mục không gắn sản phẩm
export const companyFolder = () => docsFolder('factory');
export const folderFor = (pid, key) => key === 'factory' ? companyFolder() : sectionFolder(pid, key);
export function folderPath(id) {
  const path = []; let f = folderOf(id); let guard = 0;
  while (f && guard++ < 20) { path.unshift(f); f = folderOf(f.parent_id); }
  return path;
}
export function setWhere(state) { store.presence?.update({ ...state, at: Date.now() }); }
export function jsonSetting(id, fallback) { try { const v = store.settings.get(id); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
