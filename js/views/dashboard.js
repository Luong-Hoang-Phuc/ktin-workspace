import db, { logActivity } from '../db.js';
import { store, on, nameOf, profileOf, productOf, sectionFolder } from '../store.js';
import { h, fmtTime, avatar, toastErr, fill, celebrate } from '../ui.js';
import { cellHref, openCell } from './comments.js';
import { PROGRESS_NAME, STATUS, STEPS, PROGRESS_COLUMNS, SECTIONS } from './templates.js';
import { productThumb } from './picker.js';
import { watchSheets, readFigures } from './viewer.js';
import { fmtNumber } from '../formula.js';

// Bảng "Tiến độ đồ án" của một sản phẩm (tạo 8 bước mẫu nếu chưa có) – dùng chung cho Tổng quan và CSDL
export async function ensureProgress(folder) {
  const all = await db.select('data_tables', { eq: { folder_id: folder.id } });
  let prog = all.find(t => t.name === PROGRESS_NAME) || null;
  if (!prog) {
    prog = await db.insert('data_tables', { name: PROGRESS_NAME, folder_id: folder.id, columns: PROGRESS_COLUMNS, created_by: store.user.id });
    await db.insertMany('data_rows', STEPS.map(([a, b], i) => ({ table_id: prog.id, position: i, cells: { buoc: String(i + 1), noidung: a, ghichu: b, trangthai: 'Chưa làm', phutrach: '' }, updated_by: store.user.id })));
  }
  return prog;
}
// Khoảnh khắc hoàn thành: gọi khi chính mình chuyển một bước sang “Xong”
export function stepDone(name, rowsAfter) {
  const all = rowsAfter.length && rowsAfter.every(r => r.cells?.trangthai === 'Xong');
  if (all) celebrate(`🎓 Hoàn thành cả ${rowsAfter.length} bước của đồ án! Chúc cả nhóm bảo vệ thật tốt.`, true);
  else celebrate(`🎉 Xong bước “${name}” – còn ${rowsAfter.filter(r => r.cells?.trangthai !== 'Xong').length} bước nữa`);
}
// hạn chót → chữ + mức độ (quá hạn / sắp tới / còn xa)
export function dueInfo(han, done) {
  if (!han) return null;
  const d = Math.round((new Date(han + 'T23:59:59') - Date.now()) / 864e5);
  if (done) return { text: `hạn ${han.split('-').reverse().join('/')}`, cls: '' };
  if (d < 0) return { text: `quá hạn ${-d} ngày`, cls: 'late' };
  if (d === 0) return { text: 'hạn hôm nay', cls: 'soon' };
  if (d <= 3) return { text: `còn ${d} ngày`, cls: 'soon' };
  return { text: `còn ${d} ngày (${han.split('-').reverse().join('/')})`, cls: '' };
}

// mục mà một bước liên kết tới: theo lựa chọn "Thuộc mục" (nếu đã đặt), không thì theo số bước như trước
export const stepSection = (c) => 'muc' in (c || {}) ? SECTIONS.find(s => s.key === c.muc) || null : SECTIONS.find(s => s.n === Number(c?.buoc)) || null;

// Tổng quan của một sản phẩm
export function mountOverview(el, { product, folder }) {
  const offs = [];
  const page = h('div', { class: 'page' });
  el.append(page);
  const heroBox = h('div');
  const figBox = h('div', { class: 'kpis' });
  const progBox = h('div', { class: 'card card-pad' });
  const myBox = h('div', { class: 'card card-pad my-tasks' });
  const teamBox = h('div', { class: 'card card-pad' });
  const feedBox = h('div', { class: 'card card-pad' });
  page.append(heroBox, figBox, myBox,
    h('div', { class: 'dash-grid' }, progBox, h('div', { style: { display: 'grid', gap: '16px', alignContent: 'start' } }, teamBox, feedBox)));

  function renderHero() {
    const p = productOf(product.id) || product;
    fill(heroBox, h('div', { class: 'hero' },
      h('div', { class: 'hero-thumb' }, productThumb(p, true)),
      h('div', { class: 'grow' },
        h('div', { class: 'stamp small-stamp' }, p.kind === 'sach' ? 'ĐƠN HÀNG 2' : 'ĐƠN HÀNG 1'),
        h('h1', { class: 'serif' }, p.name), h('p', {}, p.subtitle),
        h('div', { class: 'meta' }, p.qty ? h('span', {}, p.qty) : null, p.due ? h('span', {}, p.due) : null))));
  }

  // ---------- tiến độ (để trống cho nhóm tự cập nhật) ----------
  let prog = null, rows = [];
  async function loadProgress() {
    prog = await ensureProgress(folder);
    rows = await db.select('data_rows', { eq: { table_id: prog.id }, order: ['position', true] });
    renderProgress();
  }
  function renderProgress() {
    renderMine();
    const done = rows.filter(r => r.cells.trangthai === 'Xong').length;
    const pct = rows.length ? Math.round(done / rows.length * 100) : 0;
    const people = [...store.profiles.values()];
    fill(progBox,
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h3', { class: 'serif', style: { margin: 0 } }, 'Tiến độ đồ án'), h('div', { class: 'grow' }), h('a', { class: 'btn btn-sm', href: `#/db/${product.id}/progress`, title: 'Thêm / bớt / sửa các bước trong Cơ sở dữ liệu', style: { marginRight: '8px' } }, '✏️ Sửa các bước'), h('span', { class: 'badge' }, `${done}/${rows.length} bước · ${pct}%`)),
      h('div', { class: 'bar big', style: { marginBottom: '12px' }, role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Tiến độ đồ án' }, h('i', { style: { width: pct + '%' } })),
      rows.length && done === rows.length ? h('div', { class: 'done-banner' }, '🎓 Đã hoàn thành tất cả các bước – sẵn sàng nộp đồ án!') : null,
      h('div', { class: 'steps' }, rows.map((r, ri) => {
        const c = r.cells || {};
        const sec = stepSection(c);
        const cls = c.trangthai === 'Xong' ? 'done' : (c.trangthai === 'Đang làm' || c.trangthai === 'Chờ duyệt') ? 'doing' : '';
        const set = (k, v) => {
          const was = c.trangthai;
          return db.update('data_rows', r.id, { cells: { ...r.cells, [k]: v }, updated_by: store.user.id, updated_at: new Date().toISOString() })
            .then(() => {
              if (k !== 'trangthai') return;
              logActivity(store.user, `đổi trạng thái → ${v}`, `${product.name} · ${c.noidung}`);
              if (v === 'Xong' && was !== 'Xong') stepDone(c.noidung, rows.map(x => x.id === r.id ? { ...x, cells: { ...x.cells, trangthai: 'Xong' } } : x));
            }).catch(toastErr);
        };
        return h('div', { class: `step ${cls}` },
          h('div', { class: 'n' }, c.trangthai === 'Xong' ? '✓' : ri + 1),
          h('div', {}, sec ? h('a', { class: 'step-t', href: `#/p/${product.id}/${sec.key}` }, c.noidung) : h('div', { class: 'step-t' }, c.noidung), h('div', { class: 'small muted' }, c.ghichu || '')),
          h('select', { class: 'select sel-sm', onchange: (e) => set('phutrach', e.target.value) },
            h('option', { value: '' }, '— Phụ trách —'), people.map(pp => h('option', { value: pp.id, selected: c.phutrach === pp.id }, pp.display_name || pp.email))),
          h('select', { class: 'select sel-sm', onchange: (e) => set('trangthai', e.target.value) }, STATUS.map(s => h('option', { selected: c.trangthai === s }, s))));
      })));
  }

  // ---------- Việc của tôi: bước mình phụ trách + bình luận nhắc tên mình ----------
  let myCmts = [], cmtTables = new Map();
  async function loadMyComments() {
    try {
      const all = await db.select('cell_comments');
      myCmts = all.filter(c => !c.resolved && (c.mentions || []).includes(store.user.id));
      const ids = [...new Set(myCmts.map(c => c.table_id))].filter(id => !cmtTables.has(id));
      for (const id of ids) { const t = await db.get('data_tables', id).catch(() => null); if (t) cmtTables.set(id, t); }
    } catch { myCmts = []; }
    renderMine();
  }
  function renderMine() {
    const mine = rows.filter(r => r.cells?.phutrach === store.user.id);
    const open = mine.filter(r => r.cells?.trangthai !== 'Xong');
    const late = open.filter(r => dueInfo(r.cells?.han)?.cls === 'late').length;
    const sum = [open.length ? `${open.length} bước đang chờ bạn` : mine.length ? 'Bạn đã xong mọi bước được giao 👏' : null, late ? `${late} bước quá hạn` : null, myCmts.length ? `${myCmts.length} bình luận nhắc bạn` : null].filter(Boolean).join(' · ');
    fill(myBox,
      h('div', { class: 'row', style: { marginBottom: '8px' } }, h('h3', { class: 'serif', style: { margin: 0 } }, '👤 Việc của tôi'), h('span', { class: 'small muted', style: { marginLeft: '10px' } }, sum)),
      !mine.length && !myCmts.length ? h('p', { class: 'small muted', style: { margin: 0 } }, 'Bạn chưa được giao bước nào. Chọn tên mình ở cột “Phụ trách” trong ô Tiến độ đồ án bên dưới, hoặc được bạn khác @nhắc tên trong bình luận ô.') : null,
      h('div', { class: 'my-list' },
        [...open, ...mine.filter(r => r.cells?.trangthai === 'Xong')].map(r => {
          const c = r.cells, sec = stepSection(c), due = dueInfo(c.han, c.trangthai === 'Xong');
          return h('a', { class: `my-item ${c.trangthai === 'Xong' ? 'done' : ''}`, href: sec ? `#/p/${product.id}/${sec.key}` : `#/db/${product.id}/progress` },
            h('span', { class: 'mi-ic' }, c.trangthai === 'Xong' ? '✓' : '◻'),
            h('span', { class: 'grow' }, h('b', {}, c.noidung), h('small', {}, c.trangthai || 'Chưa làm')),
            due ? h('span', { class: `due ${due.cls}` }, due.text) : h('span', { class: 'due muted' }, 'chưa đặt hạn'));
        }),
        myCmts.map(cm => {
          const t = cmtTables.get(cm.table_id);
          return h('a', { class: 'my-item', href: t ? cellHref(t) : '#', onclick: (e) => { if (!t) return; e.preventDefault(); openCell({ tableId: t.id, rowId: cm.row_id, key: cm.col_key, comment: true }, cellHref(t)); } },
            h('span', { class: 'mi-ic' }, '💬'),
            h('span', { class: 'grow' }, h('b', {}, `${nameOf(cm.author)}: ${cm.body.length > 70 ? cm.body.slice(0, 70) + '…' : cm.body}`), h('small', {}, `${t?.name || 'Bảng'} · ${fmtTime(cm.created_at)}`)),
            h('span', { class: 'due' }, 'Mở ô →'));
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
          o ? h('span', { class: 'badge badge-ok' }, 'Trực tuyến') : h('span', { class: 'badge badge-gray' }, 'Ngoại tuyến'));
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
      h('a', { class: 'kpi hl', href: `#/p/${product.id}/cost` }, h('span', {}, 'Giá bán / 1 SP'), h('b', { class: 'serif' }, money(f.GBSP)), f.LN?.tyle != null ? h('small', {}, `Lợi nhuận ${f.LN.tyle} %`) : null),
      h('a', { class: 'kpi', href: `#/p/${product.id}/cost` }, h('span', {}, 'Giá thành / 1 SP'), h('b', { class: 'serif' }, money(f.GTSP))),
      h('a', { class: 'kpi', href: `#/p/${product.id}/time` }, h('span', {}, 'Σ Thời gian làm việc'), h('b', { class: 'serif' }, f.tlv != null ? fmtNumber(f.tlv, 'dec2') + ' h' : '—')),
      h('a', { class: 'kpi', href: `#/p/${product.id}/schedule` }, h('span', {}, 'Lịch sản xuất'), h('b', { class: 'serif' }, ok ? `${S.end - S.start + 1} ngày` : '—'), ok ? h('small', {}, `${fmtNumber(S.start, 'date')} → ${fmtNumber(S.end, 'date')}`) : null));
  };
  for (const k of ['cost', 'time', 'schedule']) { const fo = sectionFolder(product.id, k); if (fo) offs.push(watchSheets(fo.id, (sh) => { figs[k] = readFigures(sh); renderFigs(); })); }
  renderFigs();

  renderHero(); renderTeam();
  loadProgress().catch(toastErr); loadFeed().catch(toastErr); loadMyComments();
  offs.push(db.subscribe('cell_comments', null, () => loadMyComments()));
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
