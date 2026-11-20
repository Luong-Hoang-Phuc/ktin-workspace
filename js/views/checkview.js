// =====================================================================
// ✅ KIỂM TRA SỐ LIỆU TRƯỚC KHI NỘP – quét mọi bảng của sản phẩm, liệt kê ô lỗi / cần xem lại
// =====================================================================
import db from '../db.js';
import { folderFor } from '../store.js';
import { h, fill, toastErr } from '../ui.js';
import { WORK_SECTIONS } from './templates.js';
import { bookOf, sortRows } from './book.js';
import { colLetter } from '../formula.js';
import { cellIssue } from './cellcheck.js';
import { cellHref, openCell } from './comments.js';

export async function scanProduct(pid) {
  const out = [];
  for (const sec of WORK_SECTIONS) {
    const f = folderFor(pid, sec.key); if (!f) continue;
    const tables = await db.select('data_tables', { eq: { folder_id: f.id }, order: ['created_at', true] });
    const data = await Promise.all(tables.map(async t => ({ table: t, rows: sortRows(await db.select('data_rows', { eq: { table_id: t.id } })) })));
    const B = bookOf(data);
    for (const { table, rows } of data) {
      const S = B.sheet(table.id);
      rows.forEach((r, ri) => (table.columns || []).forEach((c, ci) => {
        const iss = cellIssue(c, r.cells?.[c.key] ?? '', S.get(ri, c.key));
        if (iss) out.push({ sec, table, row: r, col: c, addr: colLetter(ci) + (ri + 1), ...iss });
      }));
    }
  }
  return out;
}

export function mountCheck(el, { product }) {
  const box = h('div', { class: 'page' });
  el.append(box);
  let only = 'all';
  async function run() {
    fill(box, h('div', { class: 'card card-pad' }, h('p', { class: 'muted' }, '⏳ Đang kiểm tra mọi bảng của sản phẩm…')));
    let list;
    try { list = await scanProduct(product.id); } catch (e) { toastErr(e); return; }
    const errs = list.filter(x => x.level === 'err').length, warns = list.length - errs;
    const draw = () => {
      const shown = list.filter(x => only === 'all' || x.level === only);
      const bySec = new Map();
      shown.forEach(x => { const k = `${x.sec.n}. ${x.sec.label}`; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k).push(x); });
      fill(box,
        h('div', { class: `card card-pad check-sum ${errs ? 'bad' : warns ? 'meh' : 'good'}` },
          h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '10px' } },
            h('b', { class: 'serif', style: { fontSize: '18px' } }, errs ? `⚠ ${errs} ô lỗi cần sửa` : warns ? '△ Không có lỗi – còn vài ô cần xem lại' : '✅ Số liệu sạch – sẵn sàng nộp'),
            h('div', { class: 'grow' }),
            h('div', { class: 'seg' }, [['all', `Tất cả (${list.length})`], ['err', `Lỗi (${errs})`], ['warn', `Cần xem lại (${warns})`]].map(([k, l]) => h('button', { class: only === k ? 'on' : '', onclick: () => { only = k; draw(); } }, l))),
            h('button', { class: 'btn btn-sm', onclick: run }, '↻ Kiểm tra lại')),
          h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, 'Đỏ = lỗi (công thức hỏng, cột số có chữ) · Vàng = đáng ngờ (số âm). Bấm “Mở ô” để tới đúng chỗ sửa.')),
        [...bySec].map(([k, items]) => h('div', { class: 'card card-pad', style: { marginTop: '12px' } }, h('h3', { class: 'serif', style: { marginTop: 0 } }, k),
          h('div', { class: 'check-list' }, items.map(x => h('div', { class: `check-i ${x.level}` },
            h('span', { class: 'ci-lv' }, x.level === 'err' ? '⚠' : '△'),
            h('div', { class: 'grow' }, h('b', {}, `${x.table.name} · ô ${x.addr}`), h('small', {}, ` (${x.col.label}) – ${x.msg}`)),
            h('button', { class: 'btn btn-sm', onclick: () => openCell({ tableId: x.table.id, rowId: x.row.id, key: x.col.key }, cellHref(x.table)) }, 'Mở ô →')))))));
    };
    draw();
  }
  run();
  return () => {};
}
