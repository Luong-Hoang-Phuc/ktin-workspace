import db, { logActivity } from '../db.js';
import { store, on, productOf } from '../store.js';
import { h, fill, toast, toastErr, confirmBox } from '../ui.js';
import { productThumb } from './picker.js';

// Thu nhỏ ảnh trước khi tải lên (nhẹ, nhanh, đủ nét để hiển thị)
async function shrink(file, max = 1000) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.85));
  } catch { return file; }
}

export function mountSpecs(el, { product, folder }) {
  const page = h('div', { class: 'page specs' });
  el.append(page);
  const imgBox = h('div', { class: 'card spec-img' });
  const infoBox = h('div', { class: 'card card-pad' });
  page.append(h('div', { class: 'spec-grid' }, imgBox, infoBox));
  const input = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) upload(f); } });
  page.append(input);

  const cur = () => productOf(product.id) || product;

  function renderImg() {
    const p = cur();
    const drop = h('div', { class: 'spec-drop' }, productThumb(p, true),
      p.image_path ? null : h('div', { class: 'spec-hint' }, h('b', {}, 'Chưa có ảnh sản phẩm'), h('span', {}, 'Kéo thả ảnh vào đây hoặc bấm “Tải ảnh lên”. Ảnh sẽ hiện ở trang chọn sản phẩm và trang Tổng quan.')));
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => { const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith('image/')); if (f) upload(f); });
    fill(imgBox, drop, h('div', { class: 'row', style: { padding: '12px 14px', borderTop: '1.5px dashed var(--line)' } },
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => input.click() }, p.image_path ? '↻ Đổi ảnh' : '⬆ Tải ảnh lên'),
      p.image_path ? h('button', { class: 'btn btn-sm', onclick: removeImg }, 'Gỡ ảnh') : null,
      h('div', { class: 'grow' }), h('span', { class: 'small muted' }, 'JPG/PNG · tự thu nhỏ')));
  }

  function renderInfo() {
    const p = cur();
    const field = (key, label, ph) => {
      const inp = h('input', { class: 'input', value: p[key] || '', placeholder: ph });
      inp.addEventListener('change', () => db.update('products', p.id, { [key]: inp.value.trim() }).then(() => logActivity(store.user, `sửa ${label.toLowerCase()}`, `${p.name}`)).catch(toastErr));
      return h('label', { class: 'field' }, h('span', {}, label), inp);
    };
    fill(infoBox, h('h3', { class: 'serif' }, 'Thông tin chung'),
      field('name', 'Tên sản phẩm', 'VD: Hộp kem dưỡng'),
      field('subtitle', 'Mô tả ngắn', 'Kiểu dáng · kích thước · giấy · màu in'),
      h('div', { class: 'row', style: { gap: '12px', alignItems: 'flex-start' } }, h('div', { class: 'grow' }, field('qty', 'Số lượng', '50.000 hộp')), h('div', { class: 'grow' }, field('due', 'Thời hạn', 'Giao 15 ngày'))),
      h('p', { class: 'small muted' }, 'Bảng thông số chi tiết (cấu trúc, vật liệu, màu in, gia công bề mặt) là các tab bảng bên cạnh. Bản vẽ khai triển, ảnh tham khảo: tải lên ở ', h('a', { href: `#/p/${p.id}/specs/files` }, 'Trang xem › Tệp đính kèm'), '.'));
  }

  async function upload(file) {
    try {
      toast('Đang tải ảnh lên…');
      const small = await shrink(file);
      const path = `products/${product.id}/${Date.now()}.jpg`;
      await db.upload(path, small);
      await db.update('products', product.id, { image_path: path });
      const now = new Date().toISOString();
      await db.insert('files', { folder_id: folder.id, name: `Anh san pham - ${cur().name}.jpg`, storage_path: path, size: small.size, mime: 'image/jpeg', version: 1, uploaded_by: store.user.id, created_at: now, updated_at: now, description: 'Ảnh đại diện sản phẩm' }).catch(() => {});
      logActivity(store.user, 'cập nhật ảnh sản phẩm', cur().name);
      toast('Đã cập nhật ảnh sản phẩm', 'ok');
    } catch (e) { toastErr(e); }
  }
  async function removeImg() {
    if (!await confirmBox('Gỡ ảnh sản phẩm?', 'Trang chọn sản phẩm sẽ hiện lại biểu tượng mặc định.')) return;
    await db.update('products', product.id, { image_path: null }).catch(toastErr);
  }

  renderImg(); renderInfo();
  const off = on('products', () => { renderImg(); if (!infoBox.contains(document.activeElement)) renderInfo(); });
  return () => off();
}
