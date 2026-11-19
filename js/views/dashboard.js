import db, { logActivity } from '../db.js';
import { store, on, nameOf, profileOf, folderOf } from '../store.js';
import { h, fmtTime, avatar, toastErr, fill } from '../ui.js';

export const PROGRESS_NAME = 'Tiến độ đồ án';
export const STATUS = ['Chưa làm', 'Đang làm', 'Chờ duyệt', 'Xong'];
const STEPS = [
  ['Xác định phương án nhà máy & CSDL', 'Quy trình, công nghệ – thiết bị, CSDL máy, vật tư, đơn giá'],
  ['Xác định thông số kỹ thuật sản phẩm', 'Hộp và sách: cấu trúc, kích thước, vật liệu, màu in, GCBM'],
  ['Lập phương án sản xuất', 'Khổ giấy, layout, cách in, khuôn GCBM, khuôn bế, chọn máy'],
  ['Tính khối lượng công việc', 'Theo đơn vị năng suất từng máy, có bù hao'],
  ['Dự trù vật tư', 'Giấy, kẽm, mực, màng, verni, nhũ, keo, chỉ…'],
  ['Tính thời gian sản xuất', 'T máy chạy, canh bài, ngừng CN/KT/TCSX'],
  ['Tính giá thành theo khoản mục', 'NVL, lương, BH, khấu hao, SXC, QLDN, bán hàng'],
  ['Lập kế hoạch sản xuất', 'Lịch trình, Gantt, theo dõi tiến độ'],
  ['Hoàn thiện báo cáo Word & file Excel', 'Ghép chương, rà soát số liệu, định dạng'],
];
export const PROGRESS_COLUMNS = [
  { key: 'buoc', label: 'Bước', type: 'text', width: 60 },
  { key: 'noidung', label: 'Nội dung', type: 'text', width: 280 },
  { key: 'ghichu', label: 'Ghi chú', type: 'text', width: 260 },
  { key: 'phutrach', label: 'Phụ trách', type: 'person', width: 140 },
  { key: 'han', label: 'Hạn', type: 'date', width: 120 },
  { key: 'trangthai', label: 'Trạng thái', type: 'select', options: STATUS, width: 120 },
];

export function mountDashboard(el) {
  const offs = [];
  const page = h('div', { class: 'page' });
  el.append(page);
  const me = store.me;
  const statsBox = h('div', { class: 'grid-cards', style: { marginTop: '16px' } });
  const progBox = h('div', { class: 'card card-pad' });
  const teamBox = h('div', { class: 'card card-pad' });
  const feedBox = h('div', { class: 'card card-pad' });

  page.append(
    h('div', { class: 'hero' },
      h('div', {}, h('h1', {}, `Xin chào, ${me?.display_name || ''} 👋`), h('p', {}, 'Đồ án Kinh tế & Tổ chức sản xuất in · Đơn hàng: Hộp kem dưỡng 50.000 hộp & Sách khâu chỉ 3.000 cuốn')),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: store.folders[0] ? `#/f/${store.folders[0].id}` : '#/' }, '📂 Mở thư mục'))),
    db.demo ? h('div', { class: 'demo-note', style: { marginTop: '14px' } }, h('b', {}, 'Đang ở chế độ demo. '), 'Dữ liệu chỉ lưu trên trình duyệt này. Điền SUPABASE_URL và SUPABASE_ANON_KEY trong js/config.js để cả nhóm dùng chung.') : null,
    statsBox,
    h('div', { class: 'dash-grid' }, progBox, h('div', { style: { display: 'grid', gap: '16px', alignContent: 'start' } }, teamBox, feedBox)));

  // ---------- thống kê ----------
  async function loadStats() {
    try {
      const [files, notes, boards, tables] = await Promise.all([db.select('files', { isNull: ['parent_file_id'] }), db.select('notes'), db.select('boards'), db.select('data_tables')]);
      const card = (n, label, icon) => h('div', { class: 'card stat' }, h('b', {}, icon, ' ', n), h('span', {}, label));
      fill(statsBox, card(store.folders.length, 'Thư mục', '📁'), card(files.length, 'Tài liệu', '📄'), card(notes.length, 'Ghi chú', '🗒️'), card(boards.length, 'Bảng trắng', '🖍️'), card(tables.filter(t => t.folder_id).length, 'Bảng dữ liệu', '📊'));
    } catch (e) { toastErr(e); }
  }

  // ---------- tiến độ ----------
  let prog = null, rows = [];
  async function loadProgress() {
    const all = await db.select('data_tables', { isNull: ['folder_id'] });
    prog = all.find(t => t.name === PROGRESS_NAME) || null;
    rows = prog ? await db.select('data_rows', { eq: { table_id: prog.id }, order: ['position', true] }) : [];
    renderProgress();
  }
  async function createProgress() {
    try {
      prog = await db.insert('data_tables', { name: PROGRESS_NAME, folder_id: null, columns: PROGRESS_COLUMNS, created_by: store.user.id });
      await db.insertMany('data_rows', STEPS.map(([a, b], i) => ({ table_id: prog.id, position: i, cells: { buoc: String(i + 1), noidung: a, ghichu: b, trangthai: 'Chưa làm' }, updated_by: store.user.id })));
      logActivity(store.user, 'tạo bảng', PROGRESS_NAME);
      await loadProgress();
    } catch (e) { toastErr(e); }
  }
  function renderProgress() {
    if (!prog) {
      fill(progBox, h('h3', {}, '📋 Tiến độ đồ án'), h('div', { class: 'empty' }, h('div', { class: 'big' }, '🗂️'), h('p', {}, 'Chưa có bảng theo dõi 8 bước đồ án.'), h('button', { class: 'btn btn-primary', onclick: createProgress }, 'Tạo bảng tiến độ')));
      return;
    }
    const done = rows.filter(r => r.cells.trangthai === 'Xong').length;
    const pct = rows.length ? Math.round(done / rows.length * 100) : 0;
    const people = [...store.profiles.values()];
    fill(progBox, 
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h3', { style: { margin: 0 } }, '📋 Tiến độ đồ án'), h('div', { class: 'grow' }), h('span', { class: 'badge' }, `${done}/${rows.length} bước · ${pct}%`)),
      h('div', { style: { height: '8px', background: '#eef1f6', borderRadius: '99px', overflow: 'hidden', marginBottom: '12px' } }, h('div', { style: { width: pct + '%', height: '100%', background: 'linear-gradient(90deg,#2563eb,#059669)' } })),
      h('div', { class: 'steps' }, rows.map(r => {
        const c = r.cells || {};
        const cls = c.trangthai === 'Xong' ? 'done' : (c.trangthai === 'Đang làm' || c.trangthai === 'Chờ duyệt') ? 'doing' : '';
        const set = (k, v) => db.update('data_rows', r.id, { cells: { ...r.cells, [k]: v }, updated_by: store.user.id, updated_at: new Date().toISOString() })
          .then(() => k === 'trangthai' && logActivity(store.user, `đổi trạng thái → ${v}`, c.noidung)).catch(toastErr);
        return h('div', { class: `step ${cls}` },
          h('div', { class: 'n' }, c.trangthai === 'Xong' ? '✓' : c.buoc),
          h('div', {}, h('div', { style: { fontWeight: 600 } }, c.noidung), h('div', { class: 'small muted' }, c.ghichu || ''), c.han ? h('div', { class: 'small muted' }, '⏰ Hạn: ' + new Date(c.han).toLocaleDateString('vi-VN')) : null),
          h('select', { class: 'select', style: { width: '130px', padding: '4px 6px' }, onchange: (e) => set('phutrach', e.target.value) },
            h('option', { value: '' }, '— Phụ trách —'), people.map(p => h('option', { value: p.id, selected: c.phutrach === p.id }, p.display_name || p.email))),
          h('select', { class: 'select', style: { width: '112px', padding: '4px 6px' }, onchange: (e) => set('trangthai', e.target.value) }, STATUS.map(s => h('option', { selected: c.trangthai === s }, s))));
      })));
  }

  // ---------- thành viên ----------
  function renderTeam() {
    const online = new Set(store.online.map(p => p.id));
    const list = [...store.profiles.values()];
    fill(teamBox, h('h3', {}, '👥 Thành viên nhóm'),
      h('div', { style: { display: 'grid', gap: '10px' } }, list.map(p => {
        const pr = store.online.find(o => o.id === p.id);
        const f = pr?.folderId ? folderOf(pr.folderId) : null;
        return h('div', { class: 'row' }, avatar(p, 32),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, p.display_name || p.email, p.id === store.user.id ? ' (bạn)' : ''), h('div', { class: 'small muted' }, p.email)),
          online.has(p.id) ? h('span', { class: 'badge badge-ok', title: f ? 'Đang ở ' + f.name : 'Đang ở Tổng quan' }, f ? '● ' + f.name.slice(0, 18) : '● Online') : h('span', { class: 'badge badge-gray' }, 'Offline'));
      }),
      list.length < 3 ? h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, 'Thành viên sẽ hiện ở đây sau lần đăng nhập đầu tiên.') : null));
  }

  // ---------- hoạt động ----------
  let feed = [];
  async function loadFeed() {
    feed = (await db.select('activity', { order: ['created_at', false] })).slice(0, 40);
    renderFeed();
  }
  function renderFeed() {
    fill(feedBox, h('h3', {}, '🕒 Hoạt động gần đây'),
      feed.length ? h('div', { class: 'feed' }, feed.map(a => h('div', { class: 'feed-item' }, avatar(profileOf(a.user_id), 24),
        h('div', {}, h('b', {}, nameOf(a.user_id)), ' ', a.action, ' ', a.target ? h('i', {}, '“' + a.target + '”') : '', h('div', { class: 't' }, fmtTime(a.created_at))))))
        : h('p', { class: 'muted small' }, 'Chưa có hoạt động nào.'));
  }

  loadStats(); loadProgress().catch(toastErr); loadFeed().catch(toastErr); renderTeam();
  offs.push(on('online', renderTeam), on('profiles', () => { renderTeam(); renderFeed(); renderProgress(); }), on('folders', loadStats));
  offs.push(db.subscribe('activity', null, (e) => { if (e.type === 'INSERT') { feed.unshift(e.new); feed = feed.slice(0, 40); renderFeed(); } }));
  offs.push(db.subscribe('data_rows', null, (e) => {
    if (!prog) return;
    if (e.type === 'DELETE') { if (rows.some(r => r.id === e.old.id)) { rows = rows.filter(r => r.id !== e.old.id); renderProgress(); } return; }
    if (e.new.table_id !== prog.id) return;
    const i = rows.findIndex(r => r.id === e.new.id); if (i >= 0) rows[i] = e.new; else rows.push(e.new);
    rows.sort((a, b) => a.position - b.position); renderProgress();
  }));
  offs.push(db.subscribe('data_tables', null, (e) => { if (!prog && e.type === 'INSERT' && e.new.name === PROGRESS_NAME) loadProgress(); }));
  return () => offs.forEach(f => f());
}
