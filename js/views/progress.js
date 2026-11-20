// =====================================================================
// CSDL › TIẾN ĐỘ ĐỒ ÁN – thêm / bớt / sửa / sắp xếp các bước hiện ở trang Tổng quan
// =====================================================================
import db, { logActivity } from '../db.js';
import { store, on } from '../store.js';
import { h, fill, toastErr, confirmBox } from '../ui.js';
import { STATUS, STEPS, SECTIONS } from './templates.js';
import { ensureProgress, stepSection, stepDone } from './dashboard.js';
import { softDelete } from '../trash.js';

export function mountProgressEditor(el, { product, folder }) {
  let prog = null, rows = [];
  const offs = [];
  const box = h('div', { class: 'card card-pad prog-edit' });
  el.append(box);
  const now = () => new Date().toISOString();
  const save = (r, patch) => { r.cells = { ...r.cells, ...patch }; return db.update('data_rows', r.id, { cells: r.cells, updated_by: store.user.id, updated_at: now() }).catch(toastErr); };
  // đánh lại số bước 1, 2, 3… sau khi thêm / xoá / đổi chỗ (giữ nguyên mục liên kết của từng bước)
  async function renumber(keepPos = false) {
    rows.sort((a, b) => a.position - b.position);
    await Promise.all(rows.map((r, i) => {
      const muc = 'muc' in r.cells ? r.cells.muc : (stepSection(r.cells)?.key || '');
      const pos = keepPos ? r.position : i;   // xoá bước: giữ nguyên vị trí để “Hoàn tác” trả bước về đúng chỗ
      if (r.cells.buoc === String(i + 1) && 'muc' in r.cells && r.position === pos) return null;
      r.position = pos; r.cells = { ...r.cells, buoc: String(i + 1), muc };
      return db.update('data_rows', r.id, { cells: r.cells, position: pos, updated_by: store.user.id, updated_at: now() });
    })).catch(toastErr);
    render();
  }
  async function add(at) {
    try {
      const pos = at == null ? (rows.length ? Math.max(...rows.map(r => r.position)) + 1 : 0) : rows[at].position - 0.5;
      const r = await db.insert('data_rows', { table_id: prog.id, position: pos, cells: { buoc: '', noidung: 'Bước mới', ghichu: '', muc: '', trangthai: 'Chưa làm', phutrach: '' }, updated_by: store.user.id });
      if (!rows.some(x => x.id === r.id)) rows.push(r);
      await renumber();
      logActivity(store.user, 'thêm bước tiến độ', product.name);
      const i = rows.findIndex(x => x.id === r.id);
      box.querySelector(`[data-i="${i}"] input.pe-name`)?.select();
    } catch (e) { toastErr(e); }
  }
  async function del(r) {
    try {
      rows = rows.filter(x => x.id !== r.id); render();
      await softDelete('data_rows', r.id, { label: r.cells.noidung || 'Bước', what: 'bước tiến độ', onUndo: async () => {
        rows = (await db.select('data_rows', { eq: { table_id: prog.id } })).sort((a, b) => a.position - b.position); await renumber(true);
      } });
      await renumber(true);
    } catch (e) { toastErr(e); }
  }
  async function move(i, d) {
    const a = rows[i], b = rows[i + d]; if (!a || !b) return;
    [a.position, b.position] = [b.position, a.position];
    await renumber();
  }
  async function restore() {
    if (!await confirmBox('Khôi phục 8 bước mẫu?', 'Xoá toàn bộ các bước hiện tại (kể cả phụ trách, trạng thái) và tạo lại 8 bước mẫu của đồ án?')) return;
    try {
      const old = rows; rows = [];
      for (const r of old) await db.remove('data_rows', r.id);
      rows = await db.insertMany('data_rows', STEPS.map(([a, b], i) => ({ table_id: prog.id, position: i, cells: { buoc: String(i + 1), noidung: a, ghichu: b, muc: SECTIONS.find(s => s.n === i + 1)?.key || '', trangthai: 'Chưa làm', phutrach: '' }, updated_by: store.user.id })));
      render();
    } catch (e) { toastErr(e); }
  }

  function render() {
    if (!prog) return;
    const people = [...store.profiles.values()];
    const done = rows.filter(r => r.cells.trangthai === 'Xong').length;
    const inp = (r, k, cls, ph) => {
      const e = h('input', { class: `input ${cls}`, value: r.cells[k] || '', placeholder: ph });
      e.addEventListener('change', () => save(r, { [k]: e.value.trim() }));
      e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') e.blur(); });
      return e;
    };
    fill(box,
      h('div', { class: 'row', style: { marginBottom: '6px', flexWrap: 'wrap', gap: '8px' } },
        h('h3', { class: 'serif', style: { margin: 0 } }, 'Các bước của tiến độ đồ án'),
        h('span', { class: 'badge' }, `${done}/${rows.length} bước xong`),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn btn-sm', onclick: restore, title: 'Tạo lại 8 bước mẫu ban đầu' }, '↺ Khôi phục 8 bước mẫu'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => add() }, '＋ Thêm bước')),
      h('p', { class: 'small muted', style: { margin: '0 0 12px' } }, 'Sửa ở đây sẽ cập nhật ngay ô "Tiến độ đồ án" ở trang Tổng quan của sản phẩm này. Số bước tự đánh lại khi thêm, xoá hoặc đổi chỗ.'),
      h('div', { class: 'grid-scroll' }, h('table', { class: 'grid pe-table' },
        h('thead', {}, h('tr', {}, ['#', 'Tên bước', 'Mô tả ngắn', 'Thuộc mục (bấm để mở)', 'Phụ trách', 'Hạn', 'Trạng thái', ''].map(t => h('th', {}, h('div', { class: 'th' }, t))))),
        h('tbody', {}, rows.map((r, i) => {
          const c = r.cells || {};
          const cur = 'muc' in c ? c.muc : (stepSection(c)?.key || '');
          return h('tr', { 'data-i': i },
            h('td', { class: 'idx' }, i + 1),
            h('td', {}, inp(r, 'noidung', 'pe-name', 'Tên bước')),
            h('td', {}, inp(r, 'ghichu', 'pe-desc', 'Mô tả')),
            h('td', {}, h('select', { class: 'select sel-sm', onchange: (e) => save(r, { muc: e.target.value }) }, h('option', { value: '' }, '— Không liên kết —'), SECTIONS.filter(s => s.n).map(s => h('option', { value: s.key, selected: cur === s.key }, `${s.n}. ${s.label}`)))),
            h('td', {}, h('select', { class: 'select sel-sm', onchange: (e) => save(r, { phutrach: e.target.value }) }, h('option', { value: '' }, '— Phụ trách —'), people.map(pp => h('option', { value: pp.id, selected: c.phutrach === pp.id }, pp.display_name || pp.email)))),
            h('td', {}, h('input', { class: 'input sel-sm', type: 'date', value: c.han || '', onchange: (e) => save(r, { han: e.target.value }) })),
            h('td', {}, h('select', { class: 'select sel-sm', onchange: (e) => { const was = r.cells.trangthai, v = e.target.value; save(r, { trangthai: v }); if (v === 'Xong' && was !== 'Xong') stepDone(r.cells.noidung, rows); } }, STATUS.map(st => h('option', { selected: c.trangthai === st }, st)))),
            h('td', { class: 'pe-acts' },
              h('button', { class: 'icon-btn', title: 'Chèn bước phía trên', onclick: () => add(i) }, '＋'),
              h('button', { class: 'icon-btn', title: 'Lên', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
              h('button', { class: 'icon-btn', title: 'Xuống', disabled: i === rows.length - 1, onclick: () => move(i, 1) }, '↓'),
              h('button', { class: 'icon-btn row-del', title: 'Xoá bước', onclick: () => del(r) }, '✕')));
        })))),
      rows.length ? null : h('p', { class: 'muted small' }, 'Chưa có bước nào. Bấm “＋ Thêm bước” hoặc “↺ Khôi phục 8 bước mẫu”.'));
  }

  (async () => {
    try {
      prog = await ensureProgress(folder);
      rows = (await db.select('data_rows', { eq: { table_id: prog.id } })).sort((a, b) => a.position - b.position);
      render();
    } catch (e) { toastErr(e); }
  })();
  const busy = () => box.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName);
  offs.push(db.subscribe('data_rows', null, (e) => {
    if (!prog) return;
    if (e.type === 'DELETE') { if (rows.some(r => r.id === e.old.id)) { rows = rows.filter(r => r.id !== e.old.id); if (!busy()) render(); } return; }
    if (e.new.table_id !== prog.id) return;
    const i = rows.findIndex(r => r.id === e.new.id); if (i >= 0) rows[i] = e.new; else rows.push(e.new);
    rows.sort((a, b) => a.position - b.position); if (!busy()) render();
  }));
  offs.push(on('profiles', () => { if (!busy()) render(); }));
  return () => offs.forEach(f => f());
}
