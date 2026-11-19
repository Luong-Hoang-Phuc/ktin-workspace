// =====================================================================
// TRANG XEM – hiển thị dữ liệu đã nhập ở Cơ sở dữ liệu (chỉ xem)
// =====================================================================
import db from '../db.js';
import { store, on, folderFor, productOf } from '../store.js';
import { h, fill, toastErr, throttle } from '../ui.js';
import { computeSheet, parseNum, fmtNumber, dateToSerial, serialToISO, FErr } from '../formula.js';
import { renderStatic } from './sheet.js';
import { mountFactoryTree, mountMachineTable } from './factory.js';
import { mountPlan } from './plan.js';
import { productThumb } from './picker.js';
import { SECTIONS, SCHEDULE_STATUS } from './templates.js';

const sortRows = (rows) => [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
const hasCols = (t, ...keys) => keys.every(k => (t.columns || []).some(c => c.key === k));
const money = (n) => n == null ? '—' : fmtNumber(n, 'vnd');

// Tải toàn bộ bảng của một thư mục + theo dõi thay đổi
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

// Số liệu chính của một sản phẩm (dùng ở trang xem và Tổng quan)
export function readFigures(sheets) {
  const out = {};
  for (const { table, rows } of sheets) {
    const s = computeSheet(table.columns, rows);
    if (hasCols(table, 'ma', 'giatri')) {
      rows.forEach((r, i) => { const v = s.get(i, 'giatri'); const n = v instanceof FErr ? null : parseNum(v); if (r.cells?.ma) out[r.cells.ma] = { label: r.cells.khoanmuc, value: v === '' ? null : n, tyle: parseNum(r.cells.tyle), unit: r.cells.dv }; });
    }
    if (hasCols(table, 'tmc', 'tlv')) { out.tmc = s.total('tmc'); out.tlv = s.total('tlv'); out.dien = s.total('dien'); }
    if (hasCols(table, 'thanhtien', 'klvt')) out.vattu = (out.vattu || 0) + (s.total('thanhtien') || 0);
    if (hasCols(table, 'batdau', 'ketthuc')) {
      const items = rows.map((r, i) => ({ r, start: parseNum(r.cells?.batdau), end: parseNum(s.get(i, 'ketthuc')), days: parseNum(s.get(i, 'songay')), tlv: parseNum(s.get(i, 'tlv')) }));
      out.schedule = { items, start: Math.min(...items.map(x => x.start).filter(x => x != null)), end: Math.max(...items.map(x => x.end).filter(x => x != null)) };
    }
  }
  return out;
}

export function mountSectionView(el, { product, section }) {
  const page = h('div', { class: 'page view' });
  el.append(page);
  const folder = folderFor(product.id, section);
  const offs = [];
  const sheetsBox = h('div', { class: 'v-sheets' });
  const empty = (msg) => h('div', { class: 'empty' }, h('p', {}, msg || 'Chưa có dữ liệu.'), h('a', { class: 'btn btn-sm', href: `#/db/${product.id}/${section}` }, '🗄 Nhập ở Cơ sở dữ liệu'));
  const sheetCards = (sheets, opts = {}) => sheets.length ? sheets.filter(x => !opts.skip?.(x)).map(({ table, rows }) => h('div', { class: 'card v-card' },
    h('div', { class: 'v-ch' }, h('h3', { class: 'serif' }, table.name), h('span', { class: 'small muted' }, `${rows.length} dòng`), h('div', { class: 'grow' }), h('a', { class: 'small', href: `#/db/${product.id}/${section}/${table.id}` }, '✎ Sửa')),
    rows.length ? renderStatic(table, rows, opts.static?.(table)) : h('p', { class: 'small muted' }, 'Bảng chưa có dòng nào.'))) : [empty()];

  if (section === 'factory') {
    const treeBox = h('div', { class: 'card v-tree' });
    const mBox = h('details', { class: 'card v-card v-det' }, h('summary', { class: 'serif' }, 'Bảng thiết bị (CSDL máy)'));
    page.append(h('p', { class: 'muted', style: { marginTop: 0 } }, 'Phương án nhà máy là ', h('b', {}, 'chung của công ty'), ` cho cả Hộp và Sách. Ô đậm là công đoạn / máy ${product.name} đi qua (chọn ở mục 3).`), treeBox, mBox, sheetsBox);
    offs.push(mountFactoryTree(treeBox, { product, readOnly: true }));
    offs.push(mountMachineTable(mBox, { readOnly: true }));
    offs.push(watchSheets(folder.id, (sheets) => fill(sheetsBox, h('h3', { class: 'serif v-h' }, 'Cơ sở dữ liệu doanh nghiệp'), sheets.map(({ table, rows }) => h('details', { class: 'card v-card v-det' }, h('summary', { class: 'serif' }, table.name, h('span', { class: 'small muted' }, ` · ${rows.length} dòng`)), renderStatic(table, rows))))));
  } else if (section === 'specs') {
    const head = h('div');
    const render = () => { const p = productOf(product.id) || product; fill(head, h('div', { class: 'v-spec' }, h('div', { class: 'v-img' }, productThumb(p, true)), h('div', {}, h('div', { class: 'stamp small-stamp' }, p.kind === 'sach' ? 'ĐƠN HÀNG 2' : 'ĐƠN HÀNG 1'), h('h2', { class: 'serif' }, p.name), h('p', { class: 'muted' }, p.subtitle), h('div', { class: 'meta' }, p.qty ? h('span', {}, p.qty) : null, p.due ? h('span', {}, p.due) : null)))); };
    render(); offs.push(on('products', render));
    page.append(head, sheetsBox);
    offs.push(watchSheets(folder.id, (sheets) => fill(sheetsBox, sheetCards(sheets))));
  } else if (section === 'plan') {
    offs.push(mountPlan(page, { product, readOnly: true }));
    page.append(sheetsBox);
    offs.push(watchSheets(folder.id, (sheets) => fill(sheetsBox, sheets.length > 1 ? [h('h3', { class: 'serif v-h' }, 'Bảng khác'), sheetCards(sheets, { skip: (x) => /bình trang/i.test(x.table.name) })] : null)));
  } else if (section === 'cost') {
    const kpi = h('div');
    page.append(kpi, sheetsBox);
    offs.push(watchSheets(folder.id, (sheets) => { fill(kpi, costSummary(readFigures(sheets), product)); fill(sheetsBox, sheetCards(sheets, { static: (t) => hasCols(t, 'ma') ? { hide: ['ma'] } : {} })); }));
  } else if (section === 'schedule') {
    const top = h('div');
    page.append(top, sheetsBox);
    offs.push(watchSheets(folder.id, (sheets) => { fill(top, schedule(readFigures(sheets), product)); fill(sheetsBox, sheetCards(sheets)); }));
  } else {
    const kpi = h('div');
    page.append(kpi, sheetsBox);
    offs.push(watchSheets(folder.id, (sheets) => {
      const f = readFigures(sheets);
      const tiles = section === 'materials' ? [['Tổng tiền vật tư', money(f.vattu)]]
        : section === 'time' ? [['Σ T máy chạy', f.tmc != null ? fmtNumber(f.tmc, 'dec2') + ' h' : '—'], ['Σ T làm việc', f.tlv != null ? fmtNumber(f.tlv, 'dec2') + ' h' : '—'], ['≈ Số ca (8 h)', f.tlv != null ? fmtNumber(Math.ceil(f.tlv / 8), 'int') : '—'], ['Σ Điện năng', f.dien != null ? fmtNumber(f.dien, 'dec2') + ' kWh' : '—']]
        : [];
      fill(kpi, tiles.length ? h('div', { class: 'kpis' }, tiles.map(([k, v]) => h('div', { class: 'kpi' }, h('span', {}, k), h('b', { class: 'serif' }, v)))) : null);
      fill(sheetsBox, sheetCards(sheets));
    }));
  }
  return () => offs.forEach(f => f?.());
}

// ---------- 7. Giá thành ----------
function costSummary(f, product) {
  if (!f.GTTB) return h('div', { class: 'empty' }, 'Chưa có bảng “Tổng hợp giá thành”.');
  const v = (k) => f[k]?.value ?? null;
  const parts = ['NVLC', 'NVLP', 'NL', 'LUONG', 'BH', 'KH', 'SXC', 'QLDN', 'BHG'].filter(k => f[k]);
  const total = parts.reduce((s, k) => s + (v(k) || 0), 0);
  return h('div', {},
    h('div', { class: 'kpis big' },
      h('div', { class: 'kpi hl' }, h('span', {}, 'Giá bán / 1 sản phẩm'), h('b', { class: 'serif' }, money(v('GBSP'))), h('small', {}, `Lợi nhuận mong muốn ${f.LN?.tyle ?? '?'} %`)),
      h('div', { class: 'kpi' }, h('span', {}, 'Giá thành / 1 sản phẩm'), h('b', { class: 'serif' }, money(v('GTSP')))),
      h('div', { class: 'kpi' }, h('span', {}, 'Giá thành toàn bộ'), h('b', { class: 'serif' }, money(v('GTTB'))), h('small', {}, `${fmtNumber(v('SL') || 0, 'int')} sản phẩm`)),
      h('div', { class: 'kpi' }, h('span', {}, 'Giá bán đơn hàng'), h('b', { class: 'serif' }, money(v('GB'))), h('small', {}, `Lợi nhuận ${money(v('LN'))}`))),
    total ? h('div', { class: 'card card-pad v-card' }, h('h3', { class: 'serif' }, 'Cơ cấu giá thành toàn bộ'),
      h('div', { class: 'bars' }, parts.map(k => { const x = v(k) || 0; const pct = total ? x / total * 100 : 0; return h('div', { class: 'bar-row' }, h('span', { class: 'bl' }, f[k].label), h('div', { class: 'bt' }, h('i', { style: { width: Math.max(pct, .5) + '%' } })), h('span', { class: 'bv' }, `${fmtNumber(pct, 'dec2')} %`), h('span', { class: 'bm' }, money(x))); }))) : null,
    !v('NVLC') ? h('p', { class: 'small muted' }, 'Các khoản NVL chính, năng lượng, lương, khấu hao đang trống – nhập ở Cơ sở dữ liệu.') : null);
}

// ---------- 8. Kế hoạch ----------
function schedule(f, product) {
  const S = f.schedule;
  if (!S || !S.items.length) return h('div', { class: 'empty' }, 'Chưa có bảng kế hoạch.');
  const dated = S.items.filter(x => x.start != null && x.end != null);
  const done = S.items.filter(x => x.r.cells?.trangthai === 'Đạt').length;
  const pct = Math.round(done / S.items.length * 100);
  const due = parseNum(String(product.due || '').match(/\d+/)?.[0]);
  const fmtD = (n) => fmtNumber(n, 'date').slice(0, 5);
  let gantt = null;
  if (dated.length) {
    const days = S.end - S.start + 1;
    const W = 34;
    const today = dateToSerial(new Date().toISOString().slice(0, 10));
    gantt = h('div', { class: 'card v-card' }, h('h3', { class: 'serif' }, 'Lịch trình sản xuất'),
      h('div', { class: 'gantt-scroll' }, h('div', { class: 'gantt', style: { gridTemplateColumns: `220px repeat(${days}, ${W}px)` } },
        h('div', { class: 'g-h g-name' }, 'Công đoạn · máy'),
        Array.from({ length: days }, (_, i) => h('div', { class: `g-h ${S.start + i === today ? 'today' : ''} ${[0, 6].includes(new Date((S.start + i) * 864e5).getUTCDay()) ? 'we' : ''}` }, fmtD(S.start + i))),
        S.items.map((x, ri) => {
          const st = x.r.cells?.trangthai || SCHEDULE_STATUS[0];
          return [h('div', { class: 'g-name', style: { gridRow: ri + 2 } }, h('b', {}, x.r.cells?.congdoan || '—'), h('small', {}, [x.r.cells?.may, x.tlv != null ? fmtNumber(x.tlv, 'dec2') + ' h' : null].filter(Boolean).map(t => ' · ' + t).join(''))),
            x.start != null && x.end != null ? h('div', { class: `g-bar st-${SCHEDULE_STATUS.indexOf(st)} ${x.end - x.start < 1 ? 'short' : ''}`, style: { gridRow: ri + 2, gridColumn: `${x.start - S.start + 2} / ${x.end - S.start + 3}` }, title: `${x.r.cells?.congdoan}: ${fmtNumber(x.start, 'date')} → ${fmtNumber(x.end, 'date')} · ${fmtNumber(x.tlv || 0, 'dec2')} h · ${st}` }, `${fmtNumber(x.tlv || 0, 'dec2')} h`) : null];
        }))),
      h('div', { class: 'legend small' }, SCHEDULE_STATUS.map((s, i) => h('span', {}, h('i', { class: `st-${i}` }), s))));
  }
  return h('div', {},
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('span', {}, 'Bắt đầu'), h('b', { class: 'serif' }, dated.length ? fmtNumber(S.start, 'date') : '—')),
      h('div', { class: 'kpi' }, h('span', {}, 'Hoàn thành dự kiến'), h('b', { class: 'serif' }, dated.length ? fmtNumber(S.end, 'date') : '—'), dated.length ? h('small', {}, `${S.end - S.start + 1} ngày${due ? ` · hạn ${due} ngày ${S.end - S.start + 1 <= due ? '✓ kịp' : '⚠ trễ'}` : ''}`) : null),
      h('div', { class: 'kpi' }, h('span', {}, 'Checkpoint đạt'), h('b', { class: 'serif' }, `${done}/${S.items.length}`), h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } })))),
    h('div', { class: 'card v-card' }, h('h3', { class: 'serif' }, 'Đơn hàng đi qua'),
      h('div', { class: 'route' }, S.items.map((x, i) => [i ? h('span', { class: 'arr' }, '→') : null, h('div', { class: `rt st-${SCHEDULE_STATUS.indexOf(x.r.cells?.trangthai || SCHEDULE_STATUS[0])}` }, h('b', {}, x.r.cells?.congdoan), x.r.cells?.may ? h('small', {}, x.r.cells.may) : null, x.r.cells?.vattu ? h('small', { class: 'vt' }, x.r.cells.vattu) : null)]))),
    gantt,
    h('div', { class: 'card v-card' }, h('h3', { class: 'serif' }, 'Checkpoint kiểm tra'),
      h('div', { class: 'cps' }, S.items.filter(x => x.r.cells?.checkpoint).map(x => { const st = x.r.cells?.trangthai || SCHEDULE_STATUS[0]; return h('div', { class: 'cp' }, h('span', { class: `dot st-${SCHEDULE_STATUS.indexOf(st)}` }), h('div', { class: 'grow' }, h('b', {}, x.r.cells.congdoan), h('div', { class: 'small muted' }, x.r.cells.checkpoint)), h('span', { class: `badge st-${SCHEDULE_STATUS.indexOf(st)}` }, st), x.end != null ? h('span', { class: 'small muted' }, fmtNumber(x.end, 'date')) : null); }))));
}
void serialToISO; void SECTIONS;
