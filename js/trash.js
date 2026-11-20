// =====================================================================
// XOÁ CÓ HOÀN TÁC + THÙNG RÁC (giữ 30 ngày)
// - Trước khi xoá: chụp lại dòng bị xoá và mọi dữ liệu con (dòng của bảng, phiên bản tệp…)
// - Lưu bản chụp vào bảng "trash" → khôi phục được trong 30 ngày
// - Nếu chưa chạy SQL tạo bảng trash: vẫn hoàn tác được ngay trong lúc thông báo còn hiện
// =====================================================================
import db, { logActivity } from './db.js';
import { store } from './store.js';
import { toast, toastErr } from './ui.js';

export const KEEP_DAYS = 30;
// dữ liệu con cần chụp kèm khi xoá (theo khoá ngoại "on delete cascade" trên máy chủ)
const CHILDREN = {
  folders: [['folders', 'parent_id'], ['files', 'folder_id'], ['notes', 'folder_id'], ['boards', 'folder_id'], ['data_tables', 'folder_id']],
  boards: [['board_items', 'board_id']],
  data_tables: [['data_rows', 'table_id']],
  data_rows: [['cell_comments', 'row_id']],
  messages: [['message_reactions', 'message_id']],
  files: [['files', 'parent_file_id']],
  factory_nodes: [['factory_nodes', 'parent_id']],
  machines: [['factory_nodes', 'machine_id']],
};
export const KIND_LABEL = { data_tables: 'Bảng dữ liệu', data_rows: 'Dòng / bước', files: 'Tệp', notes: 'Ghi chú', boards: 'Bảng trắng', factory_nodes: 'Sơ đồ nhà máy', machines: 'Máy', folders: 'Thư mục', cell_comments: 'Bình luận', messages: 'Tin nhắn' };

async function snapshot(table, row, depth = 0) {
  const kids = [];
  if (depth < 6) for (const [t, col] of CHILDREN[table] || []) {
    let rs = [];
    try { rs = await db.select(t, { eq: { [col]: row.id } }); } catch { continue; }   // bảng con chưa có (VD chưa chạy SQL bình luận)
    for (const r of rs) kids.push(await snapshot(t, r, depth + 1));
  }
  return { table, row, kids };
}
const flat = (s, out = []) => { out.push(s); s.kids.forEach(k => flat(k, out)); return out; };
const storagePaths = (snap) => flat(snap).filter(s => s.table === 'files' && s.row.storage_path).map(s => s.row.storage_path);

// Xoá 1 dòng của bảng `table` (kèm dữ liệu con) → vào thùng rác. Trả về { snap, trashId }.
// opts: label (tên hiển thị), what (VD “dòng”, “tệp”), silent (không hiện thông báo), onUndo (gọi sau khi hoàn tác)
export async function softDelete(table, id, { label = '', what = 'mục', silent = false, onUndo } = {}) {
  const row = await db.get(table, id);
  if (!row) return null;
  const snap = await snapshot(table, row);
  let trashId = null;
  try { trashId = (await db.insert('trash', { table_name: table, label: label || null, data: snap, product_id: store.productId || null, deleted_by: store.user?.id || null }))?.id || null; }
  catch (e) { console.warn('Chưa có thùng rác (chưa chạy SQL) – chỉ hoàn tác được ngay lúc này', e); }
  await db.remove(table, id);
  logActivity(store.user, `xoá ${what}`, label);
  // chưa có thùng rác: tệp trên kho lưu trữ chỉ xoá hẳn khi hết thời gian hoàn tác
  let undone = false;
  if (!trashId) { const paths = storagePaths(snap); if (paths.length) setTimeout(() => { if (!undone) paths.forEach(p => db.removeFile(p).catch(() => {})); }, 12000); }
  const undo = async () => { undone = true; await restoreSnap(snap, trashId); await onUndo?.(); };
  if (!silent) toast(`Đã xoá ${what}${label ? ` “${label}”` : ''}`, 'info', { action: { label: 'Hoàn tác', run: undo } });
  return { snap, trashId, undo };
}

// Khôi phục bản chụp: dòng gốc trước, rồi tới dữ liệu con (theo từng tầng)
export async function restoreSnap(snap, trashId, { quiet = false } = {}) {
  try {
    if (await db.get(snap.table, snap.row.id).catch(() => null)) { if (trashId) await db.remove('trash', trashId).catch(() => {}); if (!quiet) toast('Mục này đã có sẵn – không cần khôi phục', 'info'); return; }
    let level = [snap];
    while (level.length) {
      const byTable = new Map();
      level.forEach(s => { if (!byTable.has(s.table)) byTable.set(s.table, []); byTable.get(s.table).push(s.row); });
      for (const [t, rows] of byTable) {
        if (rows.length === 1) await db.insert(t, rows[0]); else await db.insertMany(t, rows);
      }
      level = level.flatMap(s => s.kids);
    }
    if (trashId) await db.remove('trash', trashId).catch(() => {});
    logActivity(store.user, 'khôi phục', snap.row.name || snap.row.title || snap.row.cells?.noidung || KIND_LABEL[snap.table] || '');
    if (!quiet) toast('Đã khôi phục', 'ok');
  } catch (e) {
    if (/foreign key|violates/i.test(e?.message || '')) toast('Không khôi phục được vì mục chứa nó đã bị xoá – hãy khôi phục mục cha trước (trong 🗑 Thùng rác).', 'error');
    else toastErr(e);
    throw e;
  }
}

// Xoá vĩnh viễn 1 mục trong thùng rác (kèm tệp thật trên kho lưu trữ)
export async function purge(t) {
  for (const p of storagePaths(t.data || { kids: [] })) await db.removeFile(p).catch(() => {});
  await db.remove('trash', t.id);
}
// Dọn các mục quá 30 ngày (chạy nhẹ khi mở web / mở thùng rác)
export async function purgeOld() {
  try {
    const old = (await db.select('trash')).filter(t => Date.now() - new Date(t.deleted_at).getTime() > KEEP_DAYS * 864e5);
    for (const t of old) await purge(t);
    return old.length;
  } catch { return 0; }
}
