import db, { logActivity } from '../db.js';
import { store, on, nameOf, profileOf, folderOf, productOf, docsFolder, companyFolder } from '../store.js';
import { SECTIONS } from './templates.js';
import { h, fmtSize, fmtTime, fileIcon, toast, toastErr, prompt, confirmBox, modal, avatar, popMenu, fill, downloadNote } from '../ui.js';

const safeKey = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
const rid = () => Math.random().toString(36).slice(2, 10);
const OFFICE = /\.(docx?|xlsx?|pptx?)$/i;

const TYPES = [['all', 'Tất cả'], ['img', 'Ảnh'], ['pdf', 'PDF'], ['word', 'Word'], ['excel', 'Excel'], ['ppt', 'PowerPoint'], ['link', 'Link'], ['other', 'Khác']];
function typeOf(f) {
  if (!f.storage_path && f.external_url) return 'link';
  const c = fileIcon(f.name, f.mime).cls;
  return { 'ft-img': 'img', 'ft-pdf': 'pdf', 'ft-word': 'word', 'ft-excel': 'excel', 'ft-ppt': 'ppt' }[c] || 'other';
}
export function placeOf(folderId) {
  const fo = folderOf(folderId); if (!fo) return '—';
  if (!fo.product_id) return fo.section === 'team' ? 'Chung' : fo.section === 'factory' ? 'Công ty › 1. Phương án nhà máy' : fo.name;
  const s = SECTIONS.find(x => x.key === fo.section);
  return `${productOf(fo.product_id)?.name || '?'} › ${s?.n ? s.n + '. ' : ''}${s?.label || fo.name}`;
}

export function mountFiles(el, { folder, aggregate = false, lecturer = false }) {
  const offs = [];
  let files = [];
  const flt = { who: 'all', type: 'all', place: 'all' };
  let target = folder.id;
  const filterBox = h('div', { class: 'filters' });
  const wrap = h('div', { class: 'page' });
  el.append(wrap);
  const subBox = h('div');
  const listBox = h('div');
  const fileInput = h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: (e) => { uploadMany([...e.target.files]); e.target.value = ''; } });
  const drop = h('div', { class: 'dropzone' }, '⬆️ Kéo thả file vào đây (Word, Excel, PDF, ảnh…) hoặc ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); fileInput.click(); } }, 'chọn file'), h('div', { class: 'small', style: { marginTop: '4px' } }, 'Tối đa 50 MB/file. Upload trùng tên sẽ hỏi có tạo phiên bản mới không.'));
  ['dragenter', 'dragover'].forEach(ev => wrap.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => wrap.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || !wrap.contains(e.relatedTarget)) drop.classList.remove('drag'); }));
  wrap.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) uploadMany([...e.dataTransfer.files]); });

  const targetSel = aggregate ? h('select', { class: 'select sel-sm', title: 'File tải lên sẽ lưu vào đâu', onchange: (e) => { target = e.target.value; } },
    h('option', { value: folder.id }, 'Lưu vào: Chung (cả nhóm)'),
    companyFolder() ? h('option', { value: companyFolder().id }, 'Công ty › 1. Phương án nhà máy (chung)') : null,
    store.products.map(p => h('optgroup', { label: p.name }, SECTIONS.filter(s => s.n && !s.company).map(s => { const fo = store.folders.find(x => x.product_id === p.id && x.section === s.key); return fo ? h('option', { value: fo.id }, `${p.name} › ${s.n}. ${s.label}`) : null; })))) : null;
  fill(wrap, subBox,
    lecturer ? h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Tài liệu gốc giảng viên cung cấp: 6 bài giảng hướng dẫn và file cơ sở dữ liệu. Chỉ xem và tải về, hạn chế sửa.') : null,
    aggregate ? h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Toàn bộ file nhóm đã gửi lên: tài liệu chung và tệp đính kèm trong từng mục của Hộp, Sách. Lọc theo người gửi, loại file hoặc nội dung.') : null,
    filterBox,
    h('div', { class: 'toolbar' },
      h('button', { class: 'btn btn-primary', onclick: () => fileInput.click() }, '⬆️ Tải file lên'),
      targetSel,
      h('button', { class: 'btn', onclick: addLink }, '🔗 Thêm link (Word Online, Drive…)'),
      h('div', { class: 'grow' }),
      h('span', { class: 'small muted' }, '🔒 = có người đang sửa file, hãy chờ họ upload bản mới')),
    drop, fileInput, listBox);

  function renderSubs() {
    const subs = store.folders.filter(f => f.parent_id === folder.id);
    void subs;
  }

  function renderFilters() {
    if (!aggregate) return;
    const all = files.filter(f => !f.parent_file_id);
    const chip = (group, val, label, extra) => h('button', { class: `chip ${flt[group] === val ? 'on' : ''}`, onclick: () => { flt[group] = val; renderFilters(); render(); } }, extra || null, label);
    const people = [...new Set(all.map(f => f.uploaded_by))].map(id => profileOf(id)).filter(Boolean);
    const places = [...new Set(all.map(f => f.folder_id))];
    fill(filterBox,
      h('div', { class: 'frow' }, h('span', { class: 'flabel' }, 'Người gửi'), chip('who', 'all', `Tất cả (${all.length})`), people.map(p => chip('who', p.id, `${p.display_name} (${all.filter(f => f.uploaded_by === p.id).length})`, avatar(p, 18)))),
      h('div', { class: 'frow' }, h('span', { class: 'flabel' }, 'Loại file'), TYPES.filter(([k]) => k === 'all' || all.some(f => typeOf(f) === k)).map(([k, l]) => chip('type', k, k === 'all' ? l : `${l} (${all.filter(f => typeOf(f) === k).length})`))),
      h('div', { class: 'frow' }, h('span', { class: 'flabel' }, 'Nội dung'), chip('place', 'all', 'Tất cả'), places.sort((a, b) => placeOf(a).localeCompare(placeOf(b), 'vi')).map(id => chip('place', id, placeOf(id)))));
  }
  function render() {
    renderFilters();
    const cur = files.filter(f => !f.parent_file_id)
      .filter(f => !aggregate || ((flt.who === 'all' || f.uploaded_by === flt.who) && (flt.type === 'all' || typeOf(f) === flt.type) && (flt.place === 'all' || f.folder_id === flt.place)))
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    if (!cur.length) { fill(listBox, h('div', { class: 'empty' }, h('div', { class: 'big' }, '📂'), h('p', {}, 'Thư mục chưa có tài liệu.'))); return; }
    fill(listBox, h('table', { class: 'ftable' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Tên'), aggregate ? h('th', {}, 'Nội dung') : null, h('th', {}, 'Phiên bản'), h('th', {}, lecturer ? 'Nguồn' : 'Cập nhật bởi'), h('th', {}, 'Thời gian'), h('th', {}, 'Dung lượng'), h('th', {}))),
      h('tbody', {}, cur.map(f => {
        const ic = f.external_url && !f.storage_path ? { icon: '🔗', cls: 'ft-other' } : fileIcon(f.name, f.mime);
        const lockedByOther = f.locked_by && f.locked_by !== store.user.id;
        const olds = files.filter(x => x.parent_file_id === f.id).length;
        return h('tr', {},
          h('td', {}, h('div', { class: 'fname' }, h('div', { class: `ft ${ic.cls}` }, ic.icon),
            h('div', {}, h('b', { onclick: () => open(f) }, f.name),
              f.description ? h('div', { class: 'small muted' }, f.description) : null,
              h('div', { class: 'row', style: { gap: '6px', marginTop: '2px' } },
                f.locked_by ? h('span', { class: 'lock' }, `🔒 ${f.locked_by === store.user.id ? 'Bạn' : nameOf(f.locked_by)} đang sửa · ${fmtTime(f.locked_at)}`) : null,
                f.external_url && f.storage_path ? h('a', { href: f.external_url, target: '_blank', rel: 'noopener', class: 'small' }, '🔗 Mở bản online') : null)))),
          aggregate ? h('td', { class: 'small' }, h('span', { class: 'place' }, placeOf(f.folder_id))) : null,
          h('td', {}, f.storage_path ? h('span', { class: 'badge badge-gray' }, 'v' + f.version) : h('span', { class: 'badge' }, 'Link'), olds ? h('span', { class: 'small muted' }, ` (${olds} bản cũ)`) : ''),
          h('td', {}, f.uploaded_by ? h('div', { class: 'row' }, avatar(profileOf(f.uploaded_by), 22), h('span', { class: 'small' }, nameOf(f.uploaded_by))) : h('span', { class: 'small muted' }, lecturer ? 'Giảng viên' : '—')),
          h('td', { class: 'small muted' }, fmtTime(f.updated_at || f.created_at)),
          h('td', { class: 'small muted' }, fmtSize(f.size)),
          h('td', {}, h('div', { class: 'actions' },
            f.storage_path ? h('button', { class: 'icon-btn', title: 'Tải xuống', onclick: () => download(f) }, '⬇️') : null,
            f.storage_path && !lecturer ? (f.locked_by === store.user.id
              ? h('button', { class: 'btn btn-sm', title: 'Upload bản đã sửa và mở khoá', onclick: () => pickNewVersion(f) }, '⤴ Up bản mới')
              : h('button', { class: 'btn btn-sm', disabled: lockedByOther, title: lockedByOther ? 'Đang có người sửa' : 'Báo cả nhóm bạn đang sửa file này rồi tải về', onclick: () => checkout(f) }, '✏️ Sửa')) : null,
            h('button', { class: 'icon-btn', title: 'Tuỳ chọn', onclick: (e) => menu(f, e.currentTarget) }, '⋯'))));
      }))));
  }

  async function load() {
    if (aggregate) { const lect = docsFolder('lecturer')?.id; files = (await db.select('files')).filter(f => f.folder_id !== lect); }
    else files = await db.select('files', { eq: { folder_id: folder.id } });
    // phiên bản cũ có folder_id giống bản hiện tại
    render();
  }

  // ---------- thao tác ----------
  async function uploadMany(list) {
    for (const file of list) {
      if (file.size > 50 * 1024 * 1024) { toast(`“${file.name}” vượt 50 MB`, 'error'); continue; }
      const same = files.find(f => !f.parent_file_id && f.name === file.name && f.storage_path && f.folder_id === target);
      if (same) {
        const r = await modal('File đã tồn tại', h('p', {}, `Thư mục đã có “${file.name}” (v${same.version}). Bạn muốn làm gì?`), [{ label: 'Huỷ', value: null }, { label: 'Tạo file riêng', value: 'new' }, { label: `Lưu thành v${same.version + 1}`, value: 'ver', primary: true }]);
        if (r === 'ver') { await newVersion(same, file); continue; }
        if (r !== 'new') continue;
      }
      try {
        toast(`Đang tải lên “${file.name}”…`);
        const path = `${target}/${rid()}-${safeKey(file.name)}`;
        await db.upload(path, file);
        const now = new Date().toISOString();
        await db.insert('files', { folder_id: target, name: file.name, storage_path: path, size: file.size, mime: file.type, version: 1, uploaded_by: store.user.id, created_at: now, updated_at: now });
        logActivity(store.user, 'đã tải lên', `${file.name} → ${placeOf(target)}`);
        toast(`Đã tải lên “${file.name}”`, 'ok');
      } catch (e) { toastErr(e); }
    }
  }

  async function newVersion(f, file) {
    if (f.locked_by && f.locked_by !== store.user.id) {
      if (!await confirmBox('File đang được người khác sửa', `${nameOf(f.locked_by)} đang sửa file này. Upload bây giờ có thể làm mất phần họ đang sửa. Vẫn tiếp tục?`)) return;
    }
    try {
      toast(`Đang tải lên phiên bản mới…`);
      const path = `${f.folder_id}/${rid()}-${safeKey(file.name)}`;
      await db.upload(path, file);
      // lưu bản hiện tại thành bản cũ
      await db.insert('files', { folder_id: f.folder_id, name: f.name, storage_path: f.storage_path, size: f.size, mime: f.mime, version: f.version, parent_file_id: f.id, uploaded_by: f.uploaded_by, created_at: f.updated_at || f.created_at, updated_at: f.updated_at || f.created_at, description: f.description });
      await db.update('files', f.id, { storage_path: path, size: file.size, mime: file.type, version: (f.version || 1) + 1, uploaded_by: store.user.id, updated_at: new Date().toISOString(), locked_by: null, locked_at: null });
      logActivity(store.user, `đã cập nhật v${(f.version || 1) + 1}`, f.name);
      toast('Đã lưu phiên bản mới', 'ok');
    } catch (e) { toastErr(e); }
  }
  function pickNewVersion(f) {
    const inp = h('input', { type: 'file', onchange: (e) => { const file = e.target.files[0]; if (file) newVersion(f, file); } });
    inp.click();
  }
  async function checkout(f) {
    try {
      const fresh = await db.get('files', f.id);
      if (fresh?.locked_by && fresh.locked_by !== store.user.id) { toast(`${nameOf(fresh.locked_by)} vừa bắt đầu sửa file này`, 'error'); return; }
      await db.update('files', f.id, { locked_by: store.user.id, locked_at: new Date().toISOString() });
      logActivity(store.user, 'bắt đầu sửa', f.name);
      await download(f);
      toast('Đã khoá file. Sửa xong bấm “Up bản mới” để lưu và mở khoá.', 'ok');
    } catch (e) { toastErr(e); }
  }
  async function unlock(f) {
    if (f.locked_by !== store.user.id && !await confirmBox('Mở khoá giúp?', `${nameOf(f.locked_by)} đang giữ khoá. Chỉ mở khoá khi chắc chắn họ đã sửa xong hoặc quên mở khoá.`, false)) return;
    await db.update('files', f.id, { locked_by: null, locked_at: null }).catch(toastErr);
  }
  async function download(f, path = f.storage_path) {
    try {
      const url = await db.fileUrl(path, f.name);
      const a = h('a', { href: url, download: f.name }); document.body.append(a); a.click(); a.remove(); downloadNote();
    } catch (e) { toastErr(e); }
  }
  async function open(f) {
    if (!f.storage_path && f.external_url) { const a = h('a', { href: f.external_url, target: '_blank', rel: 'noopener' }); document.body.append(a); a.click(); a.remove(); return; }
    if (db.demo) { toast('Bản xem thử dùng tệp mẫu nên không mở xem được. Bản chính sẽ xem nhanh PDF, ảnh và file Office.'); return; }
    try {
      if (/^image\/|pdf/.test(f.mime || '') || /\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(f.name)) {
        const url = await db.fileUrl(f.storage_path);
        if (url.startsWith('data:')) { const w = window.open(); w?.document.write(`<iframe src="${url}" style="border:0;width:100%;height:100%"></iframe>`); }
        else window.open(url, '_blank', 'noopener');
      } else if (OFFICE.test(f.name) && !db.demo) {
        const r = await modal(f.name, h('p', {}, 'Xem nhanh (chỉ đọc) bằng Office Online hay tải file về máy?'), [{ label: 'Tải về', value: 'dl' }, { label: 'Xem nhanh', value: 'view', primary: true }]);
        if (r === 'view') window.open('https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(await db.fileUrl(f.storage_path)), '_blank', 'noopener');
        if (r === 'dl') download(f);
      } else download(f);
    } catch (e) { toastErr(e); }
  }
  async function history(f) {
    const olds = files.filter(x => x.parent_file_id === f.id).sort((a, b) => b.version - a.version);
    const list = h('div', { class: 'versions' },
      h('div', { class: 'version' }, h('span', { class: 'badge' }, 'v' + f.version), h('div', { class: 'grow' }, h('b', {}, 'Bản hiện tại'), h('div', { class: 'small muted' }, `${nameOf(f.uploaded_by)} · ${fmtTime(f.updated_at)} · ${fmtSize(f.size)}`)), h('button', { class: 'btn btn-sm', onclick: () => download(f) }, '⬇️')),
      olds.map(o => h('div', { class: 'version' }, h('span', { class: 'badge badge-gray' }, 'v' + o.version), h('div', { class: 'grow' }, h('div', {}, nameOf(o.uploaded_by)), h('div', { class: 'small muted' }, `${fmtTime(o.updated_at || o.created_at)} · ${fmtSize(o.size)}`)),
        h('button', { class: 'btn btn-sm', onclick: () => download(f, o.storage_path) }, '⬇️'),
        h('button', { class: 'btn btn-sm', title: 'Khôi phục bản này thành bản mới nhất', onclick: async () => {
          document.querySelector('.modal-wrap')?.remove();
          try {
            await db.insert('files', { folder_id: f.folder_id, name: f.name, storage_path: f.storage_path, size: f.size, mime: f.mime, version: f.version, parent_file_id: f.id, uploaded_by: f.uploaded_by, created_at: f.updated_at, updated_at: f.updated_at });
            await db.update('files', f.id, { storage_path: o.storage_path, size: o.size, mime: o.mime, version: f.version + 1, uploaded_by: store.user.id, updated_at: new Date().toISOString() });
            logActivity(store.user, `khôi phục v${o.version} thành v${f.version + 1}`, f.name); toast('Đã khôi phục', 'ok');
          } catch (e) { toastErr(e); }
        } }, '↩︎ Khôi phục'))),
      olds.length ? null : h('p', { class: 'small muted' }, 'Chưa có phiên bản cũ.'));
    modal('Lịch sử phiên bản – ' + f.name, list);
  }
  async function addLink(f = null) {
    const url = await prompt(f ? 'Gắn link bản online' : 'Thêm link tài liệu', 'Dán link Word Online / OneDrive / Teams / Google Docs', f?.external_url || '', 'https://…');
    if (!url) return;
    if (!/^https?:\/\//.test(url)) { toast('Link phải bắt đầu bằng http(s)://', 'error'); return; }
    try {
      if (f) { await db.update('files', f.id, { external_url: url }); return; }
      const name = await prompt('Tên hiển thị', 'Tên tài liệu', 'Báo cáo đồ án (Word Online)');
      if (!name) return;
      const now = new Date().toISOString();
      await db.insert('files', { folder_id: target, name, storage_path: '', external_url: url, version: 1, uploaded_by: store.user.id, created_at: now, updated_at: now });
      logActivity(store.user, 'thêm link', name);
    } catch (e) { toastErr(e); }
  }
  function menu(f, anchor) {
    popMenu(anchor, [
      f.storage_path ? { icon: '🕘', label: 'Lịch sử phiên bản', run: () => history(f) } : null,
      f.storage_path ? { icon: '⤴', label: 'Upload phiên bản mới', run: () => pickNewVersion(f) } : null,
      f.locked_by ? { icon: '🔓', label: 'Mở khoá', run: () => unlock(f) } : null,
      f.storage_path ? { icon: '🔗', label: f.external_url ? 'Sửa link bản online' : 'Gắn link bản online', run: () => addLink(f) } : { icon: '🔗', label: 'Sửa link', run: () => addLink(f) },
      { icon: '✏️', label: 'Đổi tên', run: async () => { const n = await prompt('Đổi tên', 'Tên file', f.name); if (n) db.update('files', f.id, { name: n }).catch(toastErr); } },
      { icon: '💬', label: 'Mô tả ngắn', run: async () => { const d = await prompt('Mô tả', 'Mô tả (VD: bản đã sửa chương 3)', f.description || ''); if (d !== null) db.update('files', f.id, { description: d }).catch(toastErr); } },
      '-',
      { icon: '🗑️', label: 'Xoá (kèm mọi phiên bản)', danger: true, run: async () => {
        if (!await confirmBox('Xoá tài liệu?', `Xoá “${f.name}” và tất cả phiên bản cũ. Không thể hoàn tác.`)) return;
        try {
          for (const v of files.filter(x => x.parent_file_id === f.id)) await db.removeFile(v.storage_path).catch(() => {});
          if (f.storage_path) await db.removeFile(f.storage_path).catch(() => {});
          await db.remove('files', f.id);
          logActivity(store.user, 'đã xoá', f.name);
        } catch (e) { toastErr(e); }
      } },
    ].filter(Boolean));
  }

  renderSubs();
  load().catch(toastErr);
  offs.push(on('folders', renderSubs));
  const lectId = docsFolder('lecturer')?.id;
  offs.push(db.subscribe('files', aggregate ? null : ['folder_id', folder.id], (e) => {
    if (e.type === 'DELETE') { if (!files.some(f => f.id === e.old.id)) return; files = files.filter(f => f.id !== e.old.id); }
    else if (aggregate && e.new.folder_id === lectId) return;
    else { const i = files.findIndex(f => f.id === e.new.id); if (i >= 0) files[i] = e.new; else files.push(e.new); }
    render();
  }));
  const tick = setInterval(render, 60000); // cập nhật "x phút trước"
  return () => { offs.forEach(f => f()); clearInterval(tick); };
}
