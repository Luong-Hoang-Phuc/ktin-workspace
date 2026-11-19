import { SUPABASE_URL } from './config.js';

const mod = SUPABASE_URL ? await import('./backend-supabase.js') : await import('./backend-demo.js');
const db = mod.default;
export default db;

// Ghi nhật ký hoạt động (không chặn giao diện nếu lỗi)
export function logActivity(user, action, target) {
  db.insert('activity', { user_id: user?.id ?? null, action, target }).catch(() => {});
}
