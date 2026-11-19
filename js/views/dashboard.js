import db, { logActivity } from '../db.js';
import { store, on, nameOf, profileOf, productOf, sectionFolder } from '../store.js';
import { h, fmtTime, avatar, toastErr, fill } from '../ui.js';
import { PROGRESS_NAME, STATUS, STEPS, PROGRESS_COLUMNS, SECTIONS } from './templates.js';
import { productThumb } from './picker.js';
import { watchSheets, readFigures } from './viewer.js';
import { fmtNumber } from '../formula.js';

// Tổng quan của một sản phẩm
export function mountOverview(el, { product, folder }) {
  const offs = [];
  const page = h('div', { class: 'page' });
  el.append(page);
  const heroBox = h('div');
  const figBox = h('div', { class: 'kpis' });
  const progBox = h('div', { class: 'card card-pad' });
  const teamBox = h('div', { class: 'card card-pad' });
  const feedBox = h('div', { class: 'card card-pad' });
  page.append(heroBox, figBox,
    db.demo ? h('div', { class: 'demo-note', style: { marginTop: '14px' } }, h('b', {}, 'Bản xem thử. '), 'Các mục 1–8 bên trái là trang xem (hiển thị · tệp đính kèm · ghi chú). Nhập số liệu như Excel ở ', h('b', {}, '🗄 Cơ sở dữ liệu'), ' trên thanh trên cùng. Bấm “▶ Mô phỏng nhóm” để xem bạn cùng nhóm sửa dữ liệu theo thời gian thực. Đổi sản phẩm: nút ☰.') : null,
    h('div', { class: 'dash-grid' }, progBox, h('div', { style: { display: 'grid', gap: '16px', alignContent: 'start' } }, teamBox, feedBox)));

  function renderHero() {
    const p = productOf(product.id) || product;
    fill(heroBox, h('div', { class: 'hero' },
      h('div', { class: 'hero-thumb' }, productThumb(p, true)),
      h('div', { class: 'grow' },
        h('div', { class: 'stamp small-stamp' }, p.kind === 'sach' ? 'ĐƠN HÀNG 2' : 'ĐƠN HÀNG 1'),
        h('h1', { class: 'serif' }, p.name), h('p', {}, p.subtitle),
        h('div', { class: 'meta' }, p.qty ? h('span', {}, p.qty) : null, p.due ? h('span', {}, p.due) : null)),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'btn btn-sm btn-primary', href: `#/db/${p.id}/factory` }, '🗄 Mở Cơ sở dữ liệu'),
        h('a', { class: 'btn btn-sm', href: `#/db/${p.id}/specs` }, p.image_path ? '✎ Sửa thông số & ảnh' : '⬆ Tải ảnh sản phẩm'),
        h('a', { class: 'btn btn-sm', href: `#/p/${p.id}/plan` }, '③ Xem phương án sản xuất'))));
  }

  // ---------- tiến độ (để trống cho nhóm tự cập nhật) ----------
  let prog = null, rows = [];
  async function loadProgress() {
    const all = await db.select('data_tables', { eq: { folder_id: folder.id } });
    prog = all.find(t => t.name === PROGRESS_NAME) || null;
    if (!prog) {
      prog = await db.insert('data_tables', { name: PROGRESS_NAME, folder_id: folder.id, columns: PROGRESS_COLUMNS, created_by: store.user.id });
      await db.insertMany('data_rows', STEPS.map(([a, b], i) => ({ table_id: prog.id, position: i, cells: { buoc: String(i + 1), noidung: a, ghichu: b, trangthai: 'Chưa làm', phutrach: '' }, updated_by: store.user.id })));
    }
    rows = await db.select('data_rows', { eq: { table_id: prog.id }, order: ['position', true] });
    renderProgress();
  }
  function renderProgress() {
    const done = rows.filter(r => r.cells.trangthai === 'Xong').length;
    const pct = rows.length ? Math.round(done / rows.length * 100) : 0;
    const people = [...store.profiles.values()];
    fill(progBox,
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h3', { class: 'serif', style: { margin: 0 } }, 'Tiến độ đồ án'), h('div', { class: 'grow' }), h('span', { class: 'badge' }, `${done}/${rows.length} bước · ${pct}%`)),
      h('div', { class: 'bar big', style: { marginBottom: '12px' } }, h('i', { style: { width: pct + '%' } })),
      rows.every(r => !r.cells.phutrach && r.cells.trangthai === 'Chưa làm') ? h('p', { class: 'small muted', style: { margin: '0 0 10px' } }, 'Chưa có tiến độ. Chọn người phụ trách và trạng thái cho từng bước khi nhóm bắt đầu làm.') : null,
      h('div', { class: 'steps' }, rows.map(r => {
        const c = r.cells || {};
        const sec = SECTIONS.find(s => s.n === Number(c.buoc));
        const cls = c.trangthai === 'Xong' ? 'done' : (c.trangthai === 'Đang làm' || c.trangthai === 'Chờ duyệt') ? 'doing' : '';
        const set = (k, v) => db.update('data_rows', r.id, { cells: { ...r.cells, [k]: v }, updated_by: store.user.id, updated_at: new Date().toISOString() })
          .then(() => k === 'trangthai' && logActivity(store.user, `đổi trạng thái → ${v}`, `${product.name} · ${c.noidung}`)).catch(toastErr);
        return h('div', { class: `step ${cls}` },
          h('div', { class: 'n' }, c.trangthai === 'Xong' ? '✓' : c.buoc),
          h('div', {}, sec ? h('a', { class: 'step-t', href: `#/p/${product.id}/${sec.key}` }, c.noidung) : h('div', { class: 'step-t' }, c.noidung), h('div', { class: 'small muted' }, c.ghichu || '')),
          h('select', { class: 'select sel-sm', onchange: (e) => set('phutrach', e.target.value) },
            h('option', { value: '' }, '— Phụ trách —'), people.map(pp => h('option', { value: pp.id, selected: c.phutrach === pp.id }, pp.display_name || pp.email))),
          h('select', { class: 'select sel-sm', onchange: (e) => set('trangthai', e.target.value) }, STATUS.map(s => h('option', { selected: c.trangthai === s }, s))));
      })));
  }

  function renderTeam() {
    const list = [...store.profiles.values()];
    fill(teamBox, h('h3', { class: 'serif' }, 'Thành viên nhóm'),
      h('div', { style: { display: 'grid', gap: '10px' } }, list.map(p => {
        const o = store.online.find(x => x.id === p.id);
        const where = o ? (productOf(o.productId) ? `${productOf(o.productId).name}${o.sectionLabel ? ' › ' + o.sectionLabel : ''}` : o.docs ? 'Tài liệu' : 'Chọn sản phẩm') : '';
        return h('div', { class: 'row' }, avatar(p, 32),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, p.display_name || p.email, p.id === store.user.id ? ' (bạn)' : ''), h('div', { class: 'small muted' }, o ? '● ' + where : p.email)),
          o ? h('span', { class: 'badge badge-ok' }, 'Online') : h('span', { class: 'badge badge-gray' }, 'Offline'));
      })));
  }

  let feed = [];
  async function loadFeed() { feed = (await db.select('activity', { order: ['created_at', false] })).filter(a => !a.product_id || a.product_id === product.id).slice(0, 30); renderFeed(); }
  function renderFeed() {
    fill(feedBox, h('h3', { class: 'serif' }, 'Hoạt động gần đây'),
      feed.length ? h('div', { class: 'feed' }, feed.map(a => h('div', { class: 'feed-item' }, avatar(profileOf(a.user_id), 24),
        h('div', {}, h('b', {}, nameOf(a.user_id)), ' ', a.action, ' ', a.target ? h('i', {}, '“' + a.target + '”') : '', h('div', { class: 't' }, fmtTime(a.created_at))))))
        : h('p', { class: 'muted small' }, 'Chưa có hoạt động nào.'));
  }

  // ---------- số liệu chính (lấy từ Cơ sở dữ liệu) ----------
  const figs = {};
  const renderFigs = () => {
    const f = Object.assign({}, ...Object.values(figs));
    const money = (x) => x?.value != null ? fmtNumber(x.value, 'vnd') : '—';
    const S = f.schedule; const ok = S && isFinite(S.start) && isFinite(S.end);
    fill(figBox,
      h('a', { class: 'kpi hl', href: `#/p/${product.id}/cost` }, h('span', {}, 'Giá bán / 1 SP'), h('b', { class: 'serif' }, money(f.GBSP)), h('small', {}, f.LN?.tyle != null ? `Lợi nhuận ${f.LN.tyle} %` : 'mục 7')),
      h('a', { class: 'kpi', href: `#/p/${product.id}/cost` }, h('span', {}, 'Giá thành / 1 SP'), h('b', { class: 'serif' }, money(f.GTSP)), h('small', {}, 'mục 7')),
      h('a', { class: 'kpi', href: `#/p/${product.id}/time` }, h('span', {}, 'Σ Thời gian làm việc'), h('b', { class: 'serif' }, f.tlv != null ? fmtNumber(f.tlv, 'dec2') + ' h' : '—'), h('small', {}, 'mục 6')),
      h('a', { class: 'kpi', href: `#/p/${product.id}/schedule` }, h('span', {}, 'Lịch sản xuất'), h('b', { class: 'serif' }, ok ? `${S.end - S.start + 1} ngày` : '—'), h('small', {}, ok ? `${fmtNumber(S.start, 'date')} → ${fmtNumber(S.end, 'date')}` : 'mục 8')));
  };
  for (const k of ['cost', 'time', 'schedule']) { const fo = sectionFolder(product.id, k); if (fo) offs.push(watchSheets(fo.id, (sh) => { figs[k] = readFigures(sh); renderFigs(); })); }
  renderFigs();

  renderHero(); renderTeam();
  loadProgress().catch(toastErr); loadFeed().catch(toastErr);
  offs.push(on('online', renderTeam), on('profiles', () => { renderTeam(); renderFeed(); renderProgress(); }), on('products', renderHero));
  offs.push(db.subscribe('activity', null, (e) => { if (e.type === 'INSERT' && (!e.new.product_id || e.new.product_id === product.id)) { feed.unshift(e.new); feed = feed.slice(0, 30); renderFeed(); } }));
  offs.push(db.subscribe('data_rows', null, (e) => {
    if (!prog) return;
    if (e.type === 'DELETE') { if (rows.some(r => r.id === e.old.id)) { rows = rows.filter(r => r.id !== e.old.id); renderProgress(); } return; }
    if (e.new.table_id !== prog.id) return;
    const i = rows.findIndex(r => r.id === e.new.id); if (i >= 0) rows[i] = e.new; else rows.push(e.new);
    rows.sort((a, b) => a.position - b.position); renderProgress();
  }));
  return () => offs.forEach(f => f());
}
