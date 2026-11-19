import db, { logActivity } from './db.js';
import { APP_NAME, APP_SUBTITLE } from './config.js';
import { store, on, emit, folderOf, folderPath, setWhere, nameOf } from './store.js';
import { h, toast, toastErr, prompt, confirmBox, modal, avatar, popMenu, fill } from './ui.js';
import { mountDashboard } from './views/dashboard.js';
import { mountFiles } from './views/files.js';
import { mountNotes } from './views/notes.js';
import { mountBoards } from './views/board.js';
import { mountTables } from './views/tables.js';

const app = document.getElementById('app');
let cleanup = null;
const unsubs = [];

// =====================================================================
// KHỞI ĐỘNG
// =====================================================================
async function boot() {
  db.onAuth((u) => {
    if (u && !store.user) start(u).catch(toastErr);
    if (!u && store.user) { store.user = null; location.hash = ''; location.reload(); }
  });
  const u = await db.getUser();
  if (u) await start(u); else renderLogin();
}

async function start(user) {
  store.user = user;
  store.actions = { newFolder, popMenu };
  // hồ sơ
  let profiles = await db.select('profiles');
  if (!profiles.find(p => p.id === user.id)) {
    try { await db.insert('profiles', { id: user.id, email: user.email, display_name: user.email.split('@')[0] }); } catch {}
    profiles = await db.select('profiles');
  }
  profiles.forEach(p => store.profiles.set(p.id, p));
  store.me = store.profiles.get(user.id);
  store.folders = await db.select('folders', { order: ['position', true] });

  unsubs.push(db.subscribe('folders', null, (e) => {
    if (e.type === 'DELETE') store.folders = store.folders.filter(f => f.id !== e.old.id);
    else {
      const i = store.folders.findIndex(f => f.id === e.new.id);
      if (i >= 0) store.folders[i] = e.new; else store.folders.push(e.new);
    }
    store.folders.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'vi'));
    renderSidebar();
    emit('folders');
    if (store.route.view === 'folder' && !folderOf(store.route.id)) { toast('Thư mục bạn đang xem vừa bị xoá', 'error'); location.hash = '#/'; }
  }));
  unsubs.push(db.subscribe('profiles', null, (e) => {
    if (e.type !== 'DELETE') { store.profiles.set(e.new.id, e.new); if (e.new.id === user.id) store.me = e.new; renderTop(); renderSidebar(); emit('profiles'); }
  }));

  renderShell();
  store.presence = db.presence(
    { id: user.id, name: store.me?.display_name || user.email, color: store.me?.color || '#2563eb' },
    (list) => { store.online = list.filter(Boolean); renderTop(); renderSidebar(); emit('online'); });
  addEventListener('hashchange', route);
  route();
}

// =====================================================================
// ĐĂNG NHẬP
// =====================================================================
function renderLogin() {
  let mode = 'otp';
  const email = h('input', { class: 'input', type: 'email', placeholder: 'ten@email.com', autocomplete: 'email' });
  const pass = h('input', { class: 'input', type: 'password', placeholder: 'Mật khẩu', autocomplete: 'current-password' });
  const passField = h('label', { class: 'field', style: { display: 'none' } }, h('span', {}, 'Mật khẩu'), pass);
  const msg = h('div', { class: 'small muted', style: { minHeight: '20px', marginTop: '10px' } });
  const btn = h('button', { class: 'btn btn-primary', style: { width: '100%', justifyContent: 'center', padding: '10px' } }, 'Gửi link đăng nhập qua email');
  const tabs = h('div', { class: 'tabs-mini' });
  const setMode = (m) => {
    mode = m;
    passField.style.display = m === 'pw' ? '' : 'none';
    btn.textContent = m === 'pw' ? 'Đăng nhập' : 'Gửi link đăng nhập qua email';
    [...tabs.children].forEach((b, i) => b.classList.toggle('on', (i === 0) === (m === 'otp')));
  };
  tabs.append(h('button', { class: 'on', onclick: () => setMode('otp') }, 'Link qua email'), h('button', { onclick: () => setMode('pw') }, 'Mật khẩu'));
  const submit = async () => {
    const e = email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(e)) { msg.textContent = 'Email chưa đúng định dạng.'; return; }
    btn.disabled = true; msg.textContent = 'Đang xử lý…';
    try {
      if (db.demo || mode === 'pw') { await db.signInPassword(e, pass.value); }
      else { await db.signInOtp(e); msg.innerHTML = '✅ Đã gửi link. Mở email và bấm vào link để vào workspace.'; }
    } catch (err) {
      msg.textContent = /not allowed|Signups not allowed|not found/i.test(err.message) ? 'Email này chưa được mời vào nhóm. Nhờ trưởng nhóm mời trong Supabase.' : (err.message || 'Có lỗi xảy ra');
    } finally { btn.disabled = false; }
  };
  btn.onclick = submit;
  [email, pass].forEach(i => i.addEventListener('keydown', (ev) => ev.key === 'Enter' && submit()));

  fill(app, h('div', { class: 'login' },
    h('div', { class: 'login-art' },
      h('div', {},
        h('div', { class: 'row', style: { gap: '10px', marginBottom: '40px' } }, h('div', { class: 'brand-logo', style: { background: '#fff', color: '#0f1b3d' } }, 'K'), h('b', {}, APP_NAME)),
        h('h1', {}, 'Không gian làm việc chung cho đồ án in'),
        h('p', {}, APP_SUBTITLE + ' – nơi cả nhóm cùng lưu tài liệu, ghi chú, vẽ sơ đồ và cập nhật dữ liệu theo thời gian thực.'),
        h('ul', {}, h('li', {}, 'Thư mục theo từng chương: dữ liệu máy, thông số sản phẩm, giá thành…'), h('li', {}, 'Upload Word, Excel, PDF có lịch sử phiên bản và khoá khi đang sửa'), h('li', {}, 'Ghi chú và bảng trắng cập nhật realtime'), h('li', {}, 'Bảng dữ liệu đồ án sửa trực tiếp')),
        h('div', { class: 'cmyk' }, ['#00aeef', '#ec008c', '#fff200', '#231f20'].map(c => h('span', { style: { background: c } })))),
      h('div', { class: 'small', style: { color: '#9fb3e8' } }, 'Chỉ thành viên được mời mới đăng nhập được.')),
    h('div', { class: 'login-box' }, h('div', { class: 'login-card' },
      h('h2', {}, 'Đăng nhập'),
      h('p', { class: 'muted', style: { margin: 0 } }, 'Dùng email đã được mời vào nhóm.'),
      db.demo ? h('div', { class: 'demo-note', style: { marginTop: '16px' } }, h('b', {}, 'Chế độ demo: '), 'chưa cấu hình Supabase nên dữ liệu chỉ lưu trên trình duyệt này. Nhập email bất kỳ để xem thử. Mở thêm tab khác với email khác để thử realtime.') : tabs,
      h('label', { class: 'field' }, h('span', {}, 'Email'), email),
      db.demo ? null : passField,
      btn, msg))));
  email.focus();
}

// =====================================================================
// KHUNG GIAO DIỆN
// =====================================================================
let topEl, sideEl, mainEl, shellEl;
function renderShell() {
  topEl = h('header', { class: 'topbar' });
  sideEl = h('nav', { class: 'sidebar' });
  mainEl = h('main', { class: 'main' });
  shellEl = h('div', { class: 'shell' }, topEl, sideEl, mainEl);
  fill(app, shellEl);
  renderTop(); renderSidebar();
}

function renderTop() {
  if (!topEl) return;
  const me = store.me;
  const others = store.online.filter(p => p.id !== store.user.id);
  fill(topEl, 
    h('button', { class: 'icon-btn only-mobile', onclick: () => shellEl.classList.toggle('side-open') }, '☰'),
    h('a', { class: 'brand', href: '#/' }, h('div', { class: 'brand-logo' }, 'K'), h('div', {}, APP_NAME, h('small', {}, APP_SUBTITLE))),
    h('div', { class: 'grow' }),
    db.demo ? h('span', { class: 'demo-pill', title: 'Chưa cấu hình Supabase – dữ liệu chỉ lưu trên trình duyệt này' }, 'Chế độ demo') : null,
    h('div', { class: 'row small muted' }, others.length ? `${others.length} người khác đang online` : 'Chỉ mình bạn đang online'),
    h('div', { class: 'online' }, store.online.map(p => {
      const f = p.folderId ? folderOf(p.folderId) : null;
      const a = avatar({ display_name: p.name, color: p.color }, 30);
      a.title = `${p.name}${p.id === store.user.id ? ' (bạn)' : ''} – ${f ? 'đang ở ' + f.name : 'đang ở Tổng quan'}`;
      return a;
    })),
    h('div', { class: 'user-chip', onclick: openProfile }, avatar(me, 28), h('span', {}, me?.display_name || store.user.email), h('span', { class: 'muted' }, '▾')),
  );
}

function renderSidebar() {
  if (!sideEl) return;
  const r = store.route;
  const kids = (pid) => store.folders.filter(f => (f.parent_id || null) === pid);
  const expanded = JSON.parse(sessionStorage.getItem('ktin-exp') || '{}');
  const activePath = r.view === 'folder' ? folderPath(r.id).map(f => f.id) : [];
  const tree = (pid, depth) => kids(pid).map(f => {
    const ch = kids(f.id);
    const open = expanded[f.id] ?? activePath.includes(f.id);
    const here = store.online.filter(p => p.folderId === f.id && p.id !== store.user.id);
    const item = h('div', { class: `tree-item ${r.view === 'folder' && r.id === f.id ? 'on' : ''}`, style: { paddingLeft: 8 + depth * 14 + 'px' }, onclick: () => { location.hash = `#/f/${f.id}`; shellEl.classList.remove('side-open'); } },
      h('span', { class: 'twisty', onclick: (e) => { e.stopPropagation(); expanded[f.id] = !open; sessionStorage.setItem('ktin-exp', JSON.stringify(expanded)); renderSidebar(); } }, ch.length ? (open ? '▾' : '▸') : ''),
      h('span', { class: 'ic' }, f.icon || '📁'),
      h('span', { class: 'nm', title: f.name }, f.name),
      here.length ? h('span', { class: 'here' }, here.slice(0, 3).map(p => avatar({ display_name: p.name, color: p.color }, 18))) : null,
      h('button', { class: 'icon-btn more', title: 'Tuỳ chọn', onclick: (e) => { e.stopPropagation(); folderMenu(f, e.currentTarget); } }, '⋯'));
    return [item, open ? tree(f.id, depth + 1) : null];
  });
  fill(sideEl, 
    h('a', { class: `side-link ${r.view === 'dash' ? 'on' : ''}`, href: '#/' }, h('span', {}, '🏠'), 'Tổng quan'),
    h('div', { class: 'side-head' }, h('span', {}, 'Thư mục dự án'), h('button', { class: 'icon-btn', title: 'Thư mục mới', onclick: () => newFolder(null) }, '＋')),
    tree(null, 0),
    store.folders.length ? null : h('div', { class: 'small', style: { padding: '8px 12px', color: '#8796c3' } }, 'Chưa có thư mục. Bấm ＋ để tạo.'),
  );
}

// ---------- thao tác thư mục ----------
export async function newFolder(parentId) {
  const name = await prompt(parentId ? 'Thư mục con mới' : 'Thư mục mới', 'Tên thư mục', '', 'VD: 02. Dữ liệu máy');
  if (!name) return;
  try {
    const siblings = store.folders.filter(f => (f.parent_id || null) === parentId);
    const f = await db.insert('folders', { name, parent_id: parentId, icon: '📁', position: siblings.length, created_by: store.user.id });
    logActivity(store.user, 'tạo thư mục', name);
    location.hash = `#/f/${f.id}`;
  } catch (e) { toastErr(e); }
}
const EMOJIS = ['📁', '📚', '🏭', '⚙️', '📦', '📖', '🗺️', '🧮', '💰', '📅', '📝', '📊', '🖨️', '🎨', '🧾', '📐', '✂️', '🧪', '🗂️', '📌', '⭐', '✅', '❗', '💡'];
async function pickIcon(cur) {
  let chosen = cur;
  const grid = h('div', { class: 'emoji-grid' }, EMOJIS.map(e => h('button', { class: e === cur ? 'on' : '', onclick: (ev) => { chosen = e; grid.querySelectorAll('button').forEach(b => b.classList.remove('on')); ev.currentTarget.classList.add('on'); } }, e)));
  const r = await modal('Chọn biểu tượng', grid, [{ label: 'Huỷ', value: null }, { label: 'Chọn', value: 'ok', primary: true }]);
  return r === 'ok' ? chosen : null;
}
function folderMenu(f, anchor) {
  popMenu(anchor, [
    { icon: '📁', label: 'Thêm thư mục con', run: () => newFolder(f.id) },
    { icon: '✏️', label: 'Đổi tên', run: async () => { const n = await prompt('Đổi tên thư mục', 'Tên mới', f.name); if (n) db.update('folders', f.id, { name: n }).catch(toastErr); } },
    { icon: '🎨', label: 'Đổi biểu tượng', run: async () => { const i = await pickIcon(f.icon); if (i) db.update('folders', f.id, { icon: i }).catch(toastErr); } },
    { icon: '⬆️', label: 'Lên trên', run: () => moveFolder(f, -1) },
    { icon: '⬇️', label: 'Xuống dưới', run: () => moveFolder(f, 1) },
    '-',
    { icon: '🗑️', label: 'Xoá thư mục', danger: true, run: async () => {
      if (await confirmBox('Xoá thư mục?', `Xoá “${f.name}” sẽ xoá luôn toàn bộ thư mục con, tài liệu, ghi chú, bảng trắng và bảng dữ liệu bên trong. Không thể hoàn tác.`)) {
        try { await deleteFolderFiles(f.id); await db.remove('folders', f.id); logActivity(store.user, 'xoá thư mục', f.name); } catch (e) { toastErr(e); }
      }
    } },
  ]);
}
async function deleteFolderFiles(folderId) {
  // xoá file trong kho lưu trữ trước (DB tự xoá dây chuyền)
  const ids = [folderId, ...store.folders.filter(x => folderPath(x.id).some(p => p.id === folderId)).map(x => x.id)];
  for (const id of new Set(ids)) {
    const files = await db.select('files', { eq: { folder_id: id } });
    for (const fl of files) await db.removeFile(fl.storage_path).catch(() => {});
  }
}
async function moveFolder(f, dir) {
  const sib = store.folders.filter(x => (x.parent_id || null) === (f.parent_id || null));
  const i = sib.findIndex(x => x.id === f.id), j = i + dir;
  if (j < 0 || j >= sib.length) return;
  [sib[i], sib[j]] = [sib[j], sib[i]];
  await Promise.all(sib.map((x, k) => x.position !== k ? db.update('folders', x.id, { position: k }) : null)).catch(toastErr);
}

// ---------- hồ sơ ----------
async function openProfile() {
  const me = store.me || {};
  const name = h('input', { class: 'input', value: me.display_name || '' });
  const COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#475569'];
  let color = me.color || COLORS[0];
  const colors = h('div', { class: 'colors' }, COLORS.map(c => h('span', { class: `swatch ${c === color ? 'on' : ''}`, style: { background: c }, onclick: (e) => { color = c; colors.querySelectorAll('.swatch').forEach(s => s.classList.remove('on')); e.target.classList.add('on'); } })));
  const pw = h('input', { class: 'input', type: 'password', placeholder: 'Để trống nếu không đổi', autocomplete: 'new-password' });
  const body = h('div', {},
    h('p', { class: 'muted small' }, store.user.email),
    h('label', { class: 'field' }, h('span', {}, 'Tên hiển thị'), name),
    h('div', { class: 'field' }, h('span', {}, 'Màu của bạn (hiện trên avatar, bảng trắng)'), colors),
    db.demo ? null : h('label', { class: 'field' }, h('span', {}, 'Đặt mật khẩu (để đăng nhập không cần link email)'), pw));
  const r = await modal('Hồ sơ của bạn', body, [{ label: 'Đăng xuất', value: 'out', danger: true }, { label: 'Lưu', value: 'save', primary: true }]);
  if (r === 'out') { store.presence?.leave(); await db.signOut(); location.hash = ''; location.reload(); }
  if (r === 'save') {
    try {
      await db.update('profiles', store.user.id, { display_name: name.value.trim() || me.display_name, color });
      if (pw.value) { await db.setPassword(pw.value); toast('Đã đặt mật khẩu', 'ok'); }
      store.presence?.update({ name: name.value.trim(), color });
      toast('Đã lưu hồ sơ', 'ok');
    } catch (e) { toastErr(e); }
  }
}

// =====================================================================
// ĐIỀU HƯỚNG
// =====================================================================
const TABS = [
  { key: 'files', label: 'Tài liệu', icon: '📄', mount: mountFiles },
  { key: 'notes', label: 'Ghi chú', icon: '🗒️', mount: mountNotes },
  { key: 'boards', label: 'Bảng trắng', icon: '🖍️', mount: mountBoards },
  { key: 'tables', label: 'Bảng dữ liệu', icon: '📊', mount: mountTables },
];

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  document.querySelectorAll('.menu').forEach(m => m.remove());
  if (parts[0] === 'f' && folderOf(parts[1])) {
    store.route = { view: 'folder', id: parts[1], tab: TABS.some(t => t.key === parts[2]) ? parts[2] : 'files', sub: parts[3] || null };
    renderFolder();
  } else {
    store.route = { view: 'dash' };
    setWhere({ folderId: null });
    fill(mainEl, );
    cleanup = mountDashboard(mainEl);
  }
  renderSidebar();
  mainEl.scrollTop = 0;
}

function renderFolder() {
  const { id, tab, sub } = store.route;
  const f = folderOf(id);
  setWhere({ folderId: id, tab });
  const body = h('div', { class: 'tab-body' });
  const path = folderPath(id);
  const head = h('div', { class: 'folder-head' },
    h('div', { class: 'crumbs' }, h('a', { href: '#/' }, 'Tổng quan'), path.map(p => [h('span', {}, '›'), h('a', { href: `#/f/${p.id}` }, p.name)])),
    h('div', { class: 'folder-title' }, h('span', { class: 'ic' }, f.icon || '📁'), h('h1', {}, f.name), h('div', { class: 'grow' }),
      h('button', { class: 'btn btn-sm', onclick: () => newFolder(f.id) }, '＋ Thư mục con'),
      h('button', { class: 'icon-btn', title: 'Tuỳ chọn thư mục', onclick: (e) => folderMenu(f, e.currentTarget) }, '⋯')),
    h('div', { class: 'tabs' }, TABS.map(t => h('button', { class: `tab ${t.key === tab ? 'on' : ''}`, onclick: () => { location.hash = `#/f/${id}/${t.key}`; } }, h('span', {}, t.icon), t.label))));
  fill(mainEl, h('div', { class: 'page-full' }, head, body));
  const T = TABS.find(t => t.key === tab);
  cleanup = T.mount(body, { folder: f, sub, go: (s) => { history.replaceState(null, '', `#/f/${id}/${tab}${s ? '/' + s : ''}`); store.route.sub = s; setWhere({ folderId: id, tab, sub: s }); } });
}

on('folders', () => {
  // cập nhật tên/biểu tượng trên đầu trang khi thư mục bị đổi
  if (store.route.view === 'folder') {
    const f = folderOf(store.route.id);
    const t = mainEl.querySelector('.folder-title h1'); if (f && t && t.textContent !== f.name) t.textContent = f.name;
    const ic = mainEl.querySelector('.folder-title .ic'); if (f && ic) ic.textContent = f.icon || '📁';
  }
});

boot().catch((e) => { console.error(e); fill(app, h('div', { class: 'boot' }, 'Lỗi khởi động: ' + e.message)); });
