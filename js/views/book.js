// "Sổ" = tất cả bảng trong một mục (như các sheet trong một file Excel) + theo dõi thay đổi realtime
import db from '../db.js';
import { toastErr, throttle } from '../ui.js';
import { computeBook } from '../formula.js';

export const sortRows = (rows) => [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const offsetOf = (t) => (t?.meta?.mode === 'raw' ? 0 : 1); // số dòng tiêu đề khi ra Excel

export function watchSheets(folderId, onData) {
  let data = [], loading = null, again = false, dead = false;
  // tải đầy đủ: chỉ khi mở trang hoặc khi thêm / xoá / đổi bảng (hiếm)
  const load = async () => {
    if (loading) { again = true; return; }
    loading = (async () => {
      try {
        const tables = await db.select('data_tables', { eq: { folder_id: folderId }, order: ['created_at', true] });
        data = await Promise.all(tables.map(async t => ({ table: t, rows: sortRows(await db.select('data_rows', { eq: { table_id: t.id } })) })));
        if (!dead) onData(data);
      } catch (e) { toastErr(e); }
    })();
    await loading; loading = null;
    if (again) { again = false; load(); }
  };
  const loadSoon = throttle(load, 400);
  // sửa 1 ô / 1 dòng: chỉ thay đúng dòng đó trong bộ nhớ rồi tính lại (không tải lại cả mục từ máy chủ)
  const emit = throttle(() => { if (!dead) onData(data); }, 120);
  function onRow(e) {
    if (loading) { again = true; return; }
    if (e.type === 'DELETE') {
      const id = e.old?.id; if (!id) return;
      const k = data.findIndex(d => d.rows.some(r => r.id === id)); if (k < 0) return;
      data = data.map((d, i) => i === k ? { ...d, rows: d.rows.filter(r => r.id !== id) } : d);
      return emit();
    }
    const row = e.new; if (!row) return;
    const k = data.findIndex(d => d.table.id === row.table_id); if (k < 0) return;
    const rows = data[k].rows.filter(r => r.id !== row.id); rows.push(row);
    data = data.map((d, i) => i === k ? { ...d, rows: sortRows(rows) } : d);
    emit();
  }
  load();
  const offs = [
    db.subscribe('data_tables', ['folder_id', folderId], () => loadSoon()),
    db.subscribe('data_rows', null, onRow),
  ];
  return () => { dead = true; offs.forEach(f => f()); };
}

// Tính toàn bộ sổ; override = { table, rows } để thay bảng đang sửa bằng bản trong bộ nhớ
export function bookOf(data, override) {
  const list = data.filter(d => d.table.id !== override?.table.id).map(d => ({ id: d.table.id, name: d.table.name, columns: d.table.columns, rows: d.rows, meta: d.table.meta }));
  if (override) list.push({ id: override.table.id, name: override.table.name, columns: override.table.columns, rows: override.rows, meta: override.table.meta });
  return computeBook(list);
}
