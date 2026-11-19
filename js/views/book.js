// "Sổ" = tất cả bảng trong một mục (như các sheet trong một file Excel) + theo dõi thay đổi realtime
import db from '../db.js';
import { toastErr, throttle } from '../ui.js';
import { computeBook } from '../formula.js';

export const sortRows = (rows) => [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const offsetOf = (t) => (t?.meta?.mode === 'raw' ? 0 : 1); // số dòng tiêu đề khi ra Excel

export function watchSheets(folderId, onData) {
  let data = [];
  const load = throttle(async () => {
    try {
      const tables = await db.select('data_tables', { eq: { folder_id: folderId }, order: ['created_at', true] });
      data = await Promise.all(tables.map(async t => ({ table: t, rows: sortRows(await db.select('data_rows', { eq: { table_id: t.id } })) })));
      onData(data);
    } catch (e) { toastErr(e); }
  }, 400);
  load();
  const offs = [
    db.subscribe('data_tables', ['folder_id', folderId], () => load()),
    db.subscribe('data_rows', null, (e) => { const id = e.new?.table_id || e.old?.table_id; if (!id || data.some(d => d.table.id === id)) load(); }),
  ];
  return () => offs.forEach(f => f());
}

// Tính toàn bộ sổ; override = { table, rows } để thay bảng đang sửa bằng bản trong bộ nhớ
export function bookOf(data, override) {
  const list = data.filter(d => d.table.id !== override?.table.id).map(d => ({ id: d.table.id, name: d.table.name, columns: d.table.columns, rows: d.rows, meta: d.table.meta }));
  if (override) list.push({ id: override.table.id, name: override.table.name, columns: override.table.columns, rows: override.rows, meta: override.table.meta });
  return computeBook(list);
}
