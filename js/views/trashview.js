// =====================================================================
// 🗑 THÙNG RÁC – mục đã xoá trong 30 ngày, khôi phục hoặc xoá vĩnh viễn
// =====================================================================
import db from '../db.js';
import { nameOf, productOf } from '../store.js';
import { h, fill, toastErr, confirmBox, fmtTime } from '../ui.js';
import { restoreSnap, purge, purgeOld, KEEP_DAYS, KIND_LABEL } from '../trash.js';

const ICON = { data_tables: '▦', data_rows: '☰', files: '📄', notes: '📝', boards: '✏️', factory_nodes: '🏭', machines: '⚙', folders: '📁', cell_comments: '💬', messages: '💬' };

export function mountTrash(el) {
  let items = [], missing = false;
  const box = h('div', { class: 'page' });
  el.append(box);
  const daysLeft = (t) => Math.max(0, KEEP_DAYS - Math.floor((Date.now() - new Date(t.deleted_at).getTime()) / 864e5));
  const rowsIn = (t) => { const c = (s) => 1 + (s.kids || []).reduce((a, k) => a + c(k), 0); return c(t.data || { kids: [] }) - 1; };
  function render() {
    if (missing) {
      fill(box, h('div', { class: 'card card-pad' }, h('h3', { class: 'serif' }, 'Thùng rác chưa được bật'),
        h('p', { class: 'small' }, 'Cần chạy đoạn SQL “Thùng rác” trên Supabase một lần. Trong lúc chờ, khi xoá vẫn có nút “Hoàn tác” trong vài giây.')));
      return;
    }
    fill(box,
      h('div', { class: 'row', style: { marginBottom: '12px', flexWrap: 'wrap', gap: '8px' } },
        h('p', { class: 'small muted', style: { margin: 0 } }, `Các mục đã xoá được giữ ${KEEP_DAYS} ngày rồi tự xoá hẳn. Khôi phục sẽ đưa mục về đúng chỗ cũ (kể cả dữ liệu bên trong).`),
        h('div', { class: 'grow' }),
        items.length ? h('button', { class: 'btn btn-sm btn-danger', onclick: emptyAll }, '🗑 Dọn sạch thùng rác') : null),
      items.length ? h('div', { class: 'card trash-list' }, items.map(t => h('div', { class: 'trash-item' },
        h('span', { class: 'ti-ic', 'aria-hidden': 'true' }, ICON[t.table_name] || '•'),
        h('div', { class: 'grow' },
          h('b', {}, t.label || KIND_LABEL[t.table_name] || 'Mục đã xoá'),
          h('div', { class: 'small muted' }, [KIND_LABEL[t.table_name] || t.table_name, productOf(t.product_id)?.name, rowsIn(t) ? `kèm ${rowsIn(t)} mục con` : null, `${nameOf(t.deleted_by)} xoá ${fmtTime(t.deleted_at)}`, `còn ${daysLeft(t)} ngày`].filter(Boolean).join(' · '))),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => restore(t) }, '↺ Khôi phục'),
        h('button', { class: 'btn btn-sm', onclick: () => forever(t) }, 'Xoá vĩnh viễn'))))
        : h('div', { class: 'empty' }, h('div', { class: 'big' }, '🗑'), h('p', {}, 'Thùng rác trống.')));
  }
  async function restore(t) {
    try { await restoreSnap(t.data, t.id); items = items.filter(x => x.id !== t.id); render(); } catch {}
  }
  async function forever(t) {
    if (!await confirmBox('Xoá vĩnh viễn?', `“${t.label || KIND_LABEL[t.table_name]}” sẽ bị xoá hẳn, không khôi phục được nữa.`, true, 'Xoá vĩnh viễn')) return;
    try { await purge(t); items = items.filter(x => x.id !== t.id); render(); } catch (e) { toastErr(e); }
  }
  async function emptyAll() {
    if (!await confirmBox('Dọn sạch thùng rác?', `Xoá hẳn ${items.length} mục, không khôi phục được nữa.`, true, `Xoá hẳn ${items.length} mục`)) return;
    try { for (const t of items) await purge(t); items = []; render(); } catch (e) { toastErr(e); }
  }
  (async () => {
    try { await purgeOld(); items = await db.select('trash', { order: ['deleted_at', false] }); }
    catch { missing = true; }
    render();
  })();
  const off = db.subscribe('trash', null, (e) => {
    if (e.type === 'DELETE') items = items.filter(x => x.id !== e.old.id);
    else if (!items.some(x => x.id === e.new.id)) items.unshift(e.new);
    if (!missing) render();
  });
  return () => off();
}
