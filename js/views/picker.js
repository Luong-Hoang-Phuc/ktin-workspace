import db from '../db.js';
import { store, on, sectionFolder, docsFolder, productOf } from '../store.js';
import { h, fill, toastErr } from '../ui.js';
import { PROGRESS_NAME } from './templates.js';

const SVG = {
  hop: '<svg viewBox="0 0 120 120"><path d="M20 38 60 20 100 38 100 88 60 106 20 88Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M20 38 60 56 100 38M60 56V106" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
  sach: '<svg viewBox="0 0 120 120"><path d="M60 30C48 22 32 20 18 22V94C32 92 48 94 60 102 72 94 88 92 102 94V22C88 20 72 22 60 30Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M60 30V102" stroke="currentColor" stroke-width="4"/></svg>',
};
const urlCache = new Map();

// Ảnh sản phẩm (nếu đã tải lên ở Thông số sản phẩm) hoặc biểu tượng mặc định
export function productThumb(p, big = false) {
  const box = h('span', { class: `pthumb ${big ? 'big' : ''}`, html: SVG[p.kind] || SVG.hop });
  if (p.image_path) {
    const set = (u) => { box.innerHTML = ''; box.classList.add('has-img'); box.append(h('img', { src: u, alt: p.name })); };
    if (urlCache.has(p.image_path)) set(urlCache.get(p.image_path));
    else db.fileUrl(p.image_path).then(u => { urlCache.set(p.image_path, u); set(u); }).catch(() => {});
  }
  return box;
}

export function mountPicker(el, { choose }) {
  const page = h('div', { class: 'picker' });
  el.append(page);
  const offs = [];
  let progress = {}, counts = { lect: 0, team: 0 };

  async function load() {
    try {
      const tables = await db.select('data_tables');
      for (const p of store.products) {
        const t = tables.find(x => x.name === PROGRESS_NAME && x.folder_id === sectionFolder(p.id, 'overview')?.id);
        const rows = t ? await db.select('data_rows', { eq: { table_id: t.id } }) : [];
        progress[p.id] = { done: rows.filter(r => r.cells.trangthai === 'Xong').length, total: rows.length || 8 };
      }
      const files = await db.select('files', { isNull: ['parent_file_id'] });
      const lect = docsFolder('lecturer')?.id;
      counts = { lect: files.filter(f => f.folder_id === lect).length, team: files.filter(f => f.folder_id !== lect).length };
    } catch (e) { toastErr(e); }
    render();
  }

  function render() {
    const me = store.me;
    const onlineOthers = store.online.filter(o => o.id !== store.user.id);
    const canva = store.settings.get('canva_url');
    fill(page,
      h('div', { class: 'eyebrow serif' }, `Xin chào ${me?.display_name || ''} · Nhóm ${store.profiles.size} thành viên`),
      h('h1', { class: 'serif' }, 'Chọn sản phẩm để vào không gian làm việc'),
      h('div', { class: 'products' }, store.products.map(p => {
        const pr = progress[p.id] || { done: 0, total: 8 };
        return h('button', { class: 'prod', onclick: () => choose(p) },
          h('div', { class: 'thumb' }, productThumb(p, true)),
          h('div', { class: 'stamp' }, p.kind === 'sach' ? 'ĐƠN HÀNG 2' : 'ĐƠN HÀNG 1'),
          h('div', { class: 'pbody' },
            h('h2', { class: 'serif' }, p.name), h('p', {}, p.subtitle),
            h('div', { class: 'meta' }, p.qty ? h('span', {}, p.qty) : null, p.due ? h('span', {}, p.due) : null),
            h('div', { class: 'prog' }, h('div', { class: 'bar' }, h('i', { style: { width: (pr.done / pr.total * 100) + '%' } })), h('span', {}, `Tiến độ ${pr.done}/${pr.total}`)),
            h('div', { class: 'go' }, 'Vào làm việc →')));
      })),
      h('div', { class: 'shared' },
        h('a', { class: 'sh', href: '#/docs/lecturer' }, h('b', {}, '📁 Tài liệu'), h('span', {}, `Giảng viên · ${counts.lect} tệp  |  Nhóm · ${counts.team} tệp`)),
        h('button', { class: 'sh', onclick: () => store.actions.openCanva() }, h('b', {}, '✦ Canva chung'), h('span', {}, canva ? 'Mẫu thuyết trình cho cả 2 sản phẩm' : 'Chưa gắn liên kết – bấm để thêm')),
        h('div', { class: 'sh' }, h('b', {}, '● Đang trực tuyến'), h('span', {}, onlineOthers.length ? onlineOthers.map(o => `${o.name}${productOf(o.productId) ? ' (' + productOf(o.productId).name + ')' : ''}`).join(' · ') : 'Chỉ có bạn'))));
  }
  render(); load();
  offs.push(on('online', render), on('settings', render), on('products', render));
  return () => offs.forEach(f => f());
}
