import db, { logActivity } from './db.js';
import { APP_NAME, APP_SUBTITLE } from './config.js';
import { store, on, emit, productOf, sectionFolder, docsFolder, setWhere, folderOf } from './store.js';
import { h, toast, toastErr, prompt, confirmBox, modal, avatar, popMenu, fill } from './ui.js';
import { SECTIONS, TAB_LABELS } from './views/templates.js';
import { mountPicker, productThumb } from './views/picker.js';
import { mountOverview } from './views/dashboard.js';
import { mountFiles } from './views/files.js';
import { mountNotes } from './views/notes.js';
import { mountBoards } from './views/board.js';
import { mountTables } from './views/tables.js';
import { mountFactory, mountMachines } from './views/factory.js';
import { mountSpecs } from './views/specs.js';

const app = document.getElementById('app');
let cleanup = null;
const LAST = 'ktin-last-product';
const mem = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

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

function upsertList(list, row) { const i = list.findIndex(x => x.id === row.id); if (i >= 0) list[i] = row; else list.push(row); }

async function start(user, fresh = false) {
  store.user = user;
  store.actions = { popMenu, openCanva, editCanva, go };
  let profiles = await db.select('profiles');
  if (!profiles.find(p => p.id === user.id)) {
    try { await db.insert('profiles', { id: user.id, email: user.email, display_name: user.email.split('@')[0] }); } catch {}
    profiles = await db.select('profiles');
  }
  profiles.forEach(p => store.profiles.set(p.id, p));
  store.me = store.profiles.get(user.id);
  [store.products, store.folders] = await Promise.all([db.select('products', { order: ['position', true] }), db.select('folders', { order: ['position', true] })]);
  (await db.select('settings')).forEach(s => store.settings.set(s.id, s.value));

  db.subscribe('products', null, (e) => {
    if (e.type === 'DELETE') store.products = store.products.filter(p => p.id !== e.old.id); else upsertList(store.products, e.new);
    store.products.sort((a, b) => a.position - b.position); renderTop(); renderSide(); emit('products');
  });
  db.subscribe('folders', null, (e) => { if (e.type === 'DELETE') store.folders = store.folders.filter(f => f.id !== e.old.id); else upsertList(store.folders, e.new); emit('folders'); });
  db.subscribe('settings', null, (e) => { if (e.type !== 'DELETE') { store.settings.set(e.new.id, e.new.value); renderTop(); emit('settings'); } });
  db.subscribe('profiles', null, (e) => { if (e.type !== 'DELETE') { store.profiles.set(e.new.id, e.new); if (e.new.id === user.id) store.me = e.new; renderTop(); emit('profiles'); } });

  renderShell();
  store.presence = db.presence({ id: user.id, name: store.me?.display_name || user.email, color: store.me?.color || '#b5462f' },
    (list) => { store.online = list.filter(Boolean); renderTop(); renderSide(); emit('online'); });
  addEventListener('hashchange', route);
  // Mỗi lần đăng nhập: hiện trang chọn sản phẩm. Tải lại trang: vào thẳng sản phẩm đang làm.
  if (fresh || !location.hash || location.hash === '#') location.hash = (!fresh && productOf(mem.get(LAST))) ? `#/p/${mem.get(LAST)}/overview` : '#/pick';
  route();
}

// =====================================================================
// ĐĂNG NHẬP
// =====================================================================
function renderLogin() {
  let mode = 'otp';
  const email = h('input', { class: 'input', type: 'email', placeholder: 'ten@email.com', autocomplete: 'email', value: db.demo ? 'ban@nhom-ktin.vn' : '' });
  const pass = h('input', { class: 'input', type: 'password', placeholder: 'Mật khẩu', autocomplete: 'current-password' });
  const nick = h('input', { class: 'input', placeholder: 'VD: Hoàng Phúc', value: 'Hoàng Phúc' });
  const passField = h('label', { class: 'field', style: { display: 'none' } }, h('span', {}, 'Mật khẩu'), pass);
  const msg = h('div', { class: 'small muted', style: { minHeight: '20px', marginTop: '10px' } });
  const btn = h('button', { class: 'btn btn-primary btn-block' }, db.demo ? 'Vào không gian làm việc' : 'Gửi link đăng nhập qua email');
  const tabs = h('div', { class: 'tabs-mini' });
  const setMode = (m) => {
    mode = m; passField.style.display = m === 'pw' ? '' : 'none';
    btn.textContent = m === 'pw' ? 'Đăng nhập' : 'Gửi link đăng nhập qua email';
    [...tabs.children].forEach((b, i) => b.classList.toggle('on', (i === 0) === (m === 'otp')));
  };
  tabs.append(h('button', { class: 'on', onclick: () => setMode('otp') }, 'Link qua email'), h('button', { onclick: () => setMode('pw') }, 'Mật khẩu'));
  const submit = async () => {
    const e = email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(e)) { msg.textContent = 'Email chưa đúng định dạng.'; return; }
    btn.disabled = true; msg.textContent = 'Đang xử lý…';
    try {
      if (db.demo) { await db.signInPassword(e, nick.value.trim()); }
      else if (mode === 'pw') { await db.signInPassword(e, pass.value); }
      else { await db.signInOtp(e); msg.innerHTML = '✅ Đã gửi link. Mở email và bấm vào link để vào workspace.'; }
    } catch (err) {
      msg.textContent = /not allowed|Signups not allowed|not found/i.test(err.message) ? 'Email này chưa được mời vào nhóm. Nhờ trưởng nhóm mời trong Supabase.' : (err.message || 'Có lỗi xảy ra');
    } finally { btn.disabled = false; }
  };
  btn.onclick = submit;
  [email, pass, nick].forEach(i => i.addEventListener('keydown', (ev) => ev.key === 'Enter' && submit()));
  db.onAuth((u) => { if (u) { location.hash = '#/pick'; } });

  fill(app, h('div', { class: 'login' },
    h('div', { class: 'login-art' },
      h('div', {},
        h('div', { class: 'row', style: { gap: '10px', marginBottom: '48px' } }, h('div', { class: 'mark' }, 'K'), h('b', { class: 'serif', style: { fontSize: '18px' } }, APP_NAME)),
        h('div', { class: 'stamp' }, 'ĐỒ ÁN KT&TCSX IN'),
        h('h1', { class: 'serif' }, 'Không gian làm việc chung cho đồ án in'),
        h('p', {}, 'Mỗi sản phẩm một không gian riêng: phương án nhà máy, thông số, phương án sản xuất, vật tư, thời gian, giá thành, kế hoạch. Tài liệu và link Canva dùng chung cho cả nhóm.'),
        h('div', { class: 'login-products' }, h('div', {}, productThumb({ kind: 'hop' }, true), h('span', {}, 'Hộp')), h('div', {}, productThumb({ kind: 'sach' }, true), h('span', {}, 'Sách')))),
      h('div', { class: 'small', style: { opacity: .7 } }, 'Chỉ thành viên được mời mới đăng nhập được.')),
    h('div', { class: 'login-box' }, h('div', { class: 'login-card' },
      h('h2', { class: 'serif' }, 'Đăng nhập'),
      h('p', { class: 'muted', style: { margin: 0 } }, db.demo ? 'Bản xem thử – nhập tên rồi bấm vào.' : 'Dùng email đã được mời vào nhóm.'),
      db.demo ? h('div', { class: 'demo-note', style: { marginTop: '16px' } }, 'Đã có sẵn dữ liệu mẫu và 2 bạn cùng nhóm giả lập (Minh Anh, Quốc Bảo). Dữ liệu chỉ lưu trên trình duyệt của bạn.') : tabs,
      db.demo ? h('label', { class: 'field' }, h('span', {}, 'Tên hiển thị'), nick) : null,
      h('label', { class: 'field' }, h('span', {}, 'Email'), email),
      db.demo ? null : passField,
      btn, msg))));
}

// =====================================================================
// KHUNG GIAO DIỆN
// =====================================================================
let topEl, sideEl, mainEl, shellEl, drawerEl;
function renderShell() {
  topEl = h('header', { class: 'topbar' });
  sideEl = h('nav', { class: 'sidebar' });
  mainEl = h('main', { class: 'main' });
  drawerEl = h('div', { class: 'drawer-wrap', onmousedown: (e) => { if (e.target === drawerEl) closeDrawer(); } });
  shellEl = h('div', { class: 'shell' }, topEl, sideEl, mainEl);
  fill(app, shellEl, drawerEl);
}

function renderTop() {
  if (!topEl) return;
  const me = store.me, p = productOf(store.productId);
  const inProduct = store.route.view === 'product';
  const canva = store.settings.get('canva_url');
  fill(topEl,
    h('button', { class: 'burger', title: 'Menu · chuyển sản phẩm', onclick: openDrawer }, h('span'), h('span'), h('span')),
    h('a', { class: 'brand', href: inProduct || store.route.view === 'docs' ? `#/p/${store.productId}/overview` : '#/pick' }, h('span', { class: 'mark' }, 'K'), h('b', { class: 'serif' }, 'KTIN')),
    p && store.route.view !== 'pick' ? h('div', { class: 'cur-product', title: 'Đổi sản phẩm: bấm ☰' }, productThumb(p), h('div', {}, h('small', {}, 'Đang làm'), h('b', {}, p.name))) : null,
    h('div', { class: 'grow' }),
    db.demo ? h('span', { class: 'demo-pill', title: 'Dữ liệu chỉ lưu trên trình duyệt này' }, 'Bản xem thử') : null,
    db.demo ? h('button', { class: `btn btn-sm ${sim?.isRunning() ? 'btn-primary' : 'btn-ghost'}`, title: 'Giả lập 2 bạn cùng nhóm đang làm việc', onclick: toggleSim }, sim?.isRunning() ? '⏸ Dừng mô phỏng' : '▶ Mô phỏng nhóm') : null,
    h('div', { class: 'canva-group' },
      h('button', { class: 'btn btn-canva btn-sm', title: canva ? 'Mở Canva – template thuyết trình (chung 2 sản phẩm)' : 'Chưa gắn link Canva', onclick: openCanva }, '✦ Canva'),
      h('button', { class: 'icon-btn light', title: 'Sửa link Canva', onclick: editCanva }, '✎')),
    h('a', { class: `btn btn-sm btn-ghost ${store.route.view === 'docs' ? 'on' : ''}`, href: '#/docs/lecturer' }, '📁 Tài liệu'),
    h('div', { class: 'online' }, store.online.map(o => {
      const a = avatar({ display_name: o.name, color: o.color }, 30);
      const pp = productOf(o.productId);
      a.title = `${o.name}${o.id === store.user.id ? ' (bạn)' : ''} – ${pp ? pp.name + (o.sectionLabel ? ' › ' + o.sectionLabel : '') : o.docs ? 'Tài liệu' : 'Chọn sản phẩm'}`;
      return a;
    })),
    h('div', { class: 'user-chip', onclick: openProfile }, avatar(me, 28), h('span', {}, me?.display_name || store.user.email)),
  );
}

function renderSide() {
  if (!sideEl) return;
  const r = store.route, pid = store.productId;
  shellEl.classList.toggle('no-side', r.view === 'pick');
  if (r.view === 'pick' || !pid) { fill(sideEl); return; }
  const here = (key) => store.online.filter(o => o.id !== store.user.id && o.productId === pid && o.section === key);
  fill(sideEl,
    h('div', { class: 'side-head' }, 'Làm việc'),
    SECTIONS.map(s => [
      h('a', { class: `nav ${r.view === 'product' && r.section === s.key && !(s.key === 'factory' && r.tab === 'machines') ? 'on' : ''}`, href: `#/p/${pid}/${s.key}` },
        h('span', { class: 'ni' }, s.n ? String(s.n) : '◎'), h('span', { class: 'nl' }, s.label),
        here(s.key).length ? h('span', { class: 'here' }, here(s.key).slice(0, 3).map(o => avatar({ display_name: o.name, color: o.color }, 18))) : null),
      s.key === 'factory' ? h('a', { class: `nav sub ${r.view === 'product' && r.section === 'factory' && r.tab === 'machines' ? 'on' : ''}`, href: `#/p/${pid}/factory/machines` }, h('span', { class: 'ni' }, '└'), h('span', { class: 'nl' }, 'Dữ liệu máy')) : null,
    ]),
    h('div', { class: 'side-head' }, 'Lưu trữ'),
    h('a', { class: `nav ${r.view === 'docs' ? 'on' : ''}`, href: '#/docs/lecturer' }, h('span', { class: 'ni' }, '📁'), h('span', { class: 'nl' }, 'Tài liệu')),
  );
}

// ---------- menu ☰ ----------
function openDrawer() {
  const canva = store.settings.get('canva_url');
  const item = (icon, label, run, extra = {}) => h('button', { class: `dr-item ${extra.on ? 'on' : ''}`, onclick: () => { closeDrawer(); run(); } }, h('span', { class: 'dr-ic' }, icon), h('span', { class: 'grow' }, label, extra.sub ? h('small', {}, extra.sub) : null), extra.right || null);
  fill(drawerEl, h('aside', { class: 'drawer' },
    h('div', { class: 'dr-head' }, h('span', { class: 'mark' }, 'K'), h('div', {}, h('b', { class: 'serif' }, APP_NAME), h('small', {}, APP_SUBTITLE)), h('button', { class: 'icon-btn', onclick: closeDrawer }, '✕')),
    h('div', { class: 'dr-sec' }, 'Chuyển sản phẩm'),
    store.products.map(p => h('button', { class: `dr-prod ${p.id === store.productId ? 'on' : ''}`, onclick: () => { closeDrawer(); go(`#/p/${p.id}/overview`); } },
      productThumb(p), h('div', { class: 'grow' }, h('b', {}, p.name, p.id === store.productId ? h('span', { class: 'dr-cur' }, ' · đang làm') : null), h('small', {}, p.subtitle)))),
    item('▦', 'Xem trang chọn sản phẩm', () => go('#/pick')),
    h('div', { class: 'dr-sec' }, 'Dùng chung'),
    item('📁', 'Tài liệu', () => go('#/docs/lecturer'), { sub: 'Giảng viên · Nhóm' }),
    item('✦', 'Canva – template thuyết trình', openCanva, { sub: canva ? canva.replace(/^https?:\/\//, '').slice(0, 40) : 'Chưa gắn link' }),
    item('✎', 'Sửa link Canva', editCanva),
    h('div', { class: 'dr-sec' }, 'Tài khoản'),
    item('👤', 'Hồ sơ của bạn', openProfile),
    db.demo ? item('↺', 'Đặt lại dữ liệu mẫu', resetDemo) : null,
    item('⎋', 'Đăng xuất', signOut)));
  drawerEl.classList.add('open');
}
function closeDrawer() { drawerEl.classList.remove('open'); }

// ---------- Canva (dùng chung) ----------
function openCanva() {
  const url = store.settings.get('canva_url');
  if (!url) { editCanva(); return; }
  const a = h('a', { href: url, target: '_blank', rel: 'noopener' }); document.body.append(a); a.click(); a.remove();
}
async function editCanva() {
  const cur = store.settings.get('canva_url') || '';
  const body = h('div', {},
    h('p', { class: 'small muted' }, 'Một link Canva dùng chung cho cả Hộp và Sách (template thuyết trình). Trong Canva: Chia sẻ → Sao chép liên kết (quyền “Có thể chỉnh sửa” để cả nhóm cùng sửa).'),
    h('label', { class: 'field' }, h('span', {}, 'Link Canva'), h('input', { class: 'input', id: 'canva-in', value: cur, placeholder: 'https://www.canva.com/design/…' })));
  const r = await modal('Link Canva của nhóm', body, [{ label: 'Huỷ', value: null }, { label: 'Lưu', value: 'ok', primary: true }]);
  if (r !== 'ok') return;
  const v = body.querySelector('#canva-in').value.trim();
  if (v && !/^https?:\/\//.test(v)) { toast('Link phải bắt đầu bằng https://', 'error'); return; }
  try {
    if (await db.get('settings', 'canva_url')) await db.update('settings', 'canva_url', { value: v, updated_by: store.user.id, updated_at: new Date().toISOString() });
    else await db.insert('settings', { id: 'canva_url', value: v, updated_by: store.user.id });
    store.settings.set('canva_url', v); renderTop(); logActivity(store.user, 'cập nhật link', 'Canva – template thuyết trình'); toast('Đã lưu link Canva', 'ok');
  } catch (e) { toastErr(e); }
}

// ---------- hồ sơ ----------
async function openProfile() {
  const me = store.me || {};
  const name = h('input', { class: 'input', value: me.display_name || '' });
  const COLORS = ['#b5462f', '#4f6b3a', '#3b5a7a', '#8a5a2b', '#7a3b6b', '#2f6f73', '#a67c00', '#3b2a1a'];
  let color = me.color || COLORS[0];
  const colors = h('div', { class: 'colors' }, COLORS.map(c => h('span', { class: `swatch ${c === color ? 'on' : ''}`, style: { background: c }, onclick: (e) => { color = c; colors.querySelectorAll('.swatch').forEach(s => s.classList.remove('on')); e.target.classList.add('on'); } })));
  const pw = h('input', { class: 'input', type: 'password', placeholder: 'Để trống nếu không đổi', autocomplete: 'new-password' });
  const body = h('div', {},
    h('p', { class: 'muted small' }, store.user.email),
    h('label', { class: 'field' }, h('span', {}, 'Tên hiển thị'), name),
    h('div', { class: 'field' }, h('span', {}, 'Màu của bạn'), colors),
    db.demo ? null : h('label', { class: 'field' }, h('span', {}, 'Đặt mật khẩu (để đăng nhập không cần link email)'), pw));
  const r = await modal('Hồ sơ của bạn', body, [{ label: 'Huỷ', value: null }, { label: 'Lưu', value: 'save', primary: true }]);
  if (r === 'save') {
    try {
      await db.update('profiles', store.user.id, { display_name: name.value.trim() || me.display_name, color });
      if (pw.value) { await db.setPassword(pw.value); toast('Đã đặt mật khẩu', 'ok'); }
      store.presence?.update({ name: name.value.trim(), color });
      toast('Đã lưu hồ sơ', 'ok');
    } catch (e) { toastErr(e); }
  }
}
async function signOut() { store.presence?.leave(); sim?.stop(); await db.signOut(); location.hash = ''; location.reload(); }
async function resetDemo() { if (await confirmBox('Đặt lại bản xem thử?', 'Xoá mọi thay đổi bạn đã làm và nạp lại dữ liệu mẫu ban đầu.')) { db._sim.reset(); mem.set(LAST, null); location.hash = ''; location.reload(); } }

let sim = null;
async function toggleSim() {
  sim ||= await import('./demo-sim.js');
  if (sim.isRunning()) { sim.stop(); renderTop(); } else sim.start(renderTop);
}

// =====================================================================
// ĐIỀU HƯỚNG
// =====================================================================
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
const VIEWS = { tree: mountFactory, machines: mountMachines, specs: mountSpecs, tables: mountTables, notes: mountNotes, boards: mountBoards, files: mountFiles };

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  document.querySelectorAll('.menu').forEach(m => m.remove());
  closeDrawer?.();
  if (parts[0] === 'p' && productOf(parts[1])) {
    const sec = SECTIONS.find(s => s.key === parts[2]) || SECTIONS[0];
    store.productId = parts[1]; mem.set(LAST, parts[1]);
    store.route = { view: 'product', section: sec.key, tab: sec.tabs.includes(parts[3]) ? parts[3] : sec.tabs[0], sub: parts[4] || null };
    renderProduct(sec);
  } else if (parts[0] === 'docs') {
    if (!store.productId) store.productId = productOf(mem.get(LAST)) ? mem.get(LAST) : store.products[0]?.id;
    store.route = { view: 'docs', branch: parts[1] === 'team' ? 'team' : 'lecturer' };
    renderDocs();
  } else {
    store.route = { view: 'pick' };
    setWhere({ productId: null, section: null, sectionLabel: null, docs: false });
    fill(mainEl);
    cleanup = mountPicker(mainEl, { choose: (p) => go(`#/p/${p.id}/overview`) });
  }
  renderTop(); renderSide();
  mainEl.scrollTop = 0;
}

async function ensureFolder(pid, sec) {
  let f = sectionFolder(pid, sec.key);
  if (!f) { f = await db.insert('folders', { product_id: pid, section: sec.key, name: sec.label, parent_id: null, position: SECTIONS.indexOf(sec) }); if (!folderOf(f.id)) store.folders.push(f); }
  return f;
}

async function renderProduct(sec) {
  const { tab, sub } = store.route;
  const p = productOf(store.productId);
  setWhere({ productId: p.id, section: sec.key, sectionLabel: (sec.n ? sec.n + '. ' : '') + sec.label, docs: false });
  const folder = await ensureFolder(p.id, sec).catch(toastErr);
  if (!folder) return;
  if (sec.key === 'overview') {
    fill(mainEl);
    cleanup = mountOverview(mainEl, { product: p, folder });
    return;
  }
  const body = h('div', { class: 'tab-body' });
  const head = h('div', { class: 'page-head' },
    h('div', { class: 'crumbs' }, h('a', { href: `#/p/${p.id}/overview` }, p.name), h('span', {}, '›'), h('span', {}, `${sec.n}. ${sec.label}`)),
    h('div', { class: 'page-title' }, h('span', { class: 'sec-n' }, sec.n), h('h1', { class: 'serif' }, sec.label)),
    h('div', { class: 'tabs' }, sec.tabs.map(t => h('a', { class: `tab ${t === tab ? 'on' : ''}`, href: `#/p/${p.id}/${sec.key}/${t}` }, TAB_LABELS[t]))));
  fill(mainEl, h('div', { class: 'page-full' }, head, body));
  cleanup = VIEWS[tab](body, {
    folder, product: p, sub,
    go: (s) => { history.replaceState(null, '', `#/p/${p.id}/${sec.key}/${tab}${s ? '/' + s : ''}`); store.route.sub = s; },
  });
}

function renderDocs() {
  const { branch } = store.route;
  setWhere({ productId: null, section: null, sectionLabel: null, docs: true });
  const lect = docsFolder('lecturer'), team = docsFolder('team');
  const body = h('div', { class: 'tab-body' });
  const head = h('div', { class: 'page-head' },
    h('div', { class: 'crumbs' }, h('span', {}, 'Lưu trữ dùng chung')),
    h('div', { class: 'page-title' }, h('span', { class: 'sec-n' }, '📁'), h('h1', { class: 'serif' }, 'Tài liệu')),
    h('div', { class: 'tabs' },
      h('a', { class: `tab ${branch === 'lecturer' ? 'on' : ''}`, href: '#/docs/lecturer' }, '📚 Tài liệu giảng viên'),
      h('a', { class: `tab ${branch === 'team' ? 'on' : ''}`, href: '#/docs/team' }, '🗂️ Tài liệu nhóm')));
  fill(mainEl, h('div', { class: 'page-full' }, head, body));
  if (!lect || !team) { fill(body, h('div', { class: 'page' }, h('div', { class: 'empty' }, 'Chưa tạo thư mục tài liệu. Chạy lại supabase/setup.sql.'))); return; }
  cleanup = branch === 'lecturer' ? mountFiles(body, { folder: lect, lecturer: true }) : mountFiles(body, { folder: team, aggregate: true });
}

on('products', () => { if (store.route.view === 'pick') route(); });

boot().catch((e) => { console.error(e); fill(app, h('div', { class: 'boot' }, 'Lỗi khởi động: ' + e.message)); });
