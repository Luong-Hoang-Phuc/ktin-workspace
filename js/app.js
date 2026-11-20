import db, { logActivity } from './db.js';
import { APP_NAME, APP_SUBTITLE } from './config.js';
import { store, on, emit, USER_COLORS, productOf, sectionFolder, docsFolder, companyFolder, folderFor, setWhere, folderOf } from './store.js';
import { h, toast, toastErr, viError, prompt, confirmBox, modal, avatar, popMenu, fill } from './ui.js';
import { SECTIONS, WORK_SECTIONS, VIEW_TABS, SECTION_TEMPLATES } from './views/templates.js';
import { mountPicker, productThumb } from './views/picker.js';
import { mountOverview } from './views/dashboard.js';
import { mountProgressEditor } from './views/progress.js';
const PROGRESS_SEC = { key: 'progress', label: 'Tiến độ đồ án' };   // mục CSDL sửa các bước tiến độ
const CHECK_SEC = { key: 'check', label: 'Kiểm tra số liệu' };     // quét lỗi số liệu trước khi nộp

// ---------- chế độ tối (lưu trên trình duyệt) ----------
const THEME = 'ktin-theme';
function applyTheme(t) { document.documentElement.classList.toggle('dark', t === 'dark'); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#1d1712' : '#3b2a1a'); }
function toggleTheme() { const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark'; try { localStorage.setItem(THEME, t); } catch {} applyTheme(t); toast(t === 'dark' ? '🌙 Đã bật chế độ tối' : '☀️ Đã bật chế độ sáng'); }
try { applyTheme(localStorage.getItem(THEME)); } catch {}
installGlobalKeys();
import { mountFiles } from './views/files.js';
import { mountNotes } from './views/notes.js';
import { mountBoards } from './views/board.js';
import { mountChat, lastRead } from './views/chat.js';
import { mountSheets } from './views/sheet.js';
import { mountFactoryTree, mountMachineTable } from './views/factory.js';
import { mountSpecs } from './views/specs.js';
import { mountPlan } from './views/plan.js';
import { mountSectionView } from './views/viewer.js';
import { openCell } from './views/comments.js';
import { mountTrash } from './views/trashview.js';
import { mountCheck } from './views/checkview.js';
import { mountReport } from './views/report.js';
import { openPalette, openShortcuts, installGlobalKeys } from './views/palette.js';
import { purgeOld } from './trash.js';
import { initNet } from './net.js';

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
  if (u) { if (!store.user) await start(u); } else if (!store.user) renderLogin();
}

function upsertList(list, row) { const i = list.findIndex(x => x.id === row.id); if (i >= 0) list[i] = row; else list.push(row); }

async function start(user, fresh = false) {
  store.user = user;
  store.actions = { popMenu, openCanva, editCanva, go, openProfile, toggleTheme, toggleSide };
  initNet();
  let profiles = await db.select('profiles');
  if (!profiles.find(p => p.id === user.id)) {
    try { await db.insert('profiles', { id: user.id, email: user.email, display_name: user.email.split('@')[0] }); } catch {}
    profiles = await db.select('profiles');
  }
  profiles.forEach(p => store.profiles.set(p.id, p));
  store.me = store.profiles.get(user.id);
  // Mỗi tài khoản một màu riêng: nếu màu của mình trùng với người vào nhóm trước thì tự đổi sang màu còn trống
  try {
    const mine = store.me, others = profiles.filter(p => p.id !== user.id);
    const earlier = (p) => (p.created_at || '') < (mine.created_at || '') || ((p.created_at || '') === (mine.created_at || '') && p.id < mine.id);
    const clash = mine && (!mine.color || others.some(p => p.color === mine.color && earlier(p)));
    if (mine && clash) {
      const used = new Set(others.map(p => p.color));
      const color = USER_COLORS.find(c => !used.has(c)) || USER_COLORS[others.length % USER_COLORS.length];
      if (color !== mine.color) { const upd = await db.update('profiles', user.id, { color }); store.me = { ...mine, ...(upd || { color }) }; store.profiles.set(user.id, store.me); }
    }
  } catch (e) { console.warn(e); }
  [store.products, store.folders] = await Promise.all([db.select('products', { order: ['position', true] }), db.select('folders', { order: ['position', true] })]);
  (await db.select('settings')).forEach(s => store.settings.set(s.id, s.value));

  db.subscribe('products', null, (e) => {
    if (e.type === 'DELETE') store.products = store.products.filter(p => p.id !== e.old.id); else upsertList(store.products, e.new);
    store.products.sort((a, b) => a.position - b.position); renderTop(); renderSide(); emit('products');
  });
  db.subscribe('folders', null, (e) => { if (e.type === 'DELETE') store.folders = store.folders.filter(f => f.id !== e.old.id); else upsertList(store.folders, e.new); emit('folders'); });
  db.subscribe('settings', null, (e) => { if (e.type !== 'DELETE') { store.settings.set(e.new.id, e.new.value); renderTop(); emit('settings'); } });
  db.subscribe('profiles', null, (e) => { if (e.type !== 'DELETE') { store.profiles.set(e.new.id, e.new); if (e.new.id === user.id) store.me = e.new; renderTop(); emit('profiles'); } });

  // tin nhắn chưa đọc
  store.myMsgIds = new Set();
  try { const lr = lastRead(), all = await db.select('messages'); all.forEach(m => { if (m.user_id === user.id) store.myMsgIds.add(m.id); }); store.unread = all.filter(m => m.user_id !== user.id && m.created_at > lr).length; } catch { store.unread = 0; }
  db.subscribe('messages', null, (e) => {
    if (e.type === 'INSERT' && e.new.user_id === user.id) store.myMsgIds.add(e.new.id);
    if (e.type !== 'INSERT' || e.new.user_id === user.id || store.route.view === 'chat') return;
    store.unread = (store.unread || 0) + 1; renderSide();
    const who = store.profiles.get(e.new.user_id)?.display_name || 'Ai đó';
    const imgs = (e.new.attachments || []).filter(a => a.kind !== 'ref'), ref = (e.new.attachments || []).find(a => a.kind === 'ref');
    const txt = e.new.body || (imgs.length ? `🖼 đã gửi ${imgs.length > 1 ? imgs.length + ' ảnh' : 'một ảnh'}` : '');
    const toMe = e.new.reply_to && store.myMsgIds?.has(e.new.reply_to);
    // bình luận trên ô có @nhắc tên mình → thông báo nổi bật, bấm “Mở ô” để tới đúng chỗ
    if (ref && (ref.mentions || []).includes(user.id)) { toast(`🔔 ${who} nhắc bạn ở ${ref.label}: ${txt.length > 60 ? txt.slice(0, 60) + '…' : txt}`, 'info', { action: { label: 'Mở ô', run: () => openCell({ ...ref.focus, comment: true }, ref.href) }, ms: 12000 }); return; }
    toast(`${toMe ? '↩' : '💬'} ${who}${toMe ? ' trả lời bạn' : ''}: ${txt.length > 60 ? txt.slice(0, 60) + '…' : txt}`);
  });

  renderShell();
  setTimeout(() => purgeOld(), 5000);   // dọn mục quá 30 ngày trong thùng rác
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
  const btn = h('button', { class: 'btn btn-primary btn-block' }, db.demo ? 'Vào không gian làm việc' : 'Gửi liên kết đăng nhập qua email');
  const tabs = h('div', { class: 'tabs-mini' });
  const setMode = (m) => {
    mode = m; passField.style.display = m === 'pw' ? '' : 'none';
    btn.textContent = m === 'pw' ? 'Đăng nhập' : 'Gửi liên kết đăng nhập qua email';
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
      else { await db.signInOtp(e); msg.innerHTML = '✅ Đã gửi liên kết. Mở email và bấm vào liên kết để vào không gian làm việc.'; }
    } catch (err) {
      msg.textContent = viError(err.message);
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
        h('p', {}, 'Công cụ làm đồ án Kinh tế & tổ chức sản xuất in: trang xem cho từng mục của đồ án, Cơ sở dữ liệu nhập như Excel, tài liệu và liên kết Canva dùng chung cho cả nhóm.'),
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
let topEl, sideEl, mainEl, shellEl, drawerEl, mnavEl;
function renderShell() {
  topEl = h('header', { class: 'topbar' });
  sideEl = h('nav', { class: 'sidebar' });
  mainEl = h('main', { class: 'main', id: 'main-content', tabindex: '-1' });
  drawerEl = h('div', { class: 'drawer-wrap', onmousedown: (e) => { if (e.target === drawerEl) closeDrawer(); } });
  mnavEl = h('nav', { class: 'mobile-nav', 'aria-label': 'Điều hướng trên điện thoại' });
  shellEl = h('div', { class: 'shell' }, topEl, sideEl, mainEl);
  fill(app, shellEl, mnavEl, drawerEl);
  applySide();
}

// ---------- thu gọn thanh bên trái (còn dải icon) – nhớ trên trình duyệt ----------
const SIDE = 'ktin-side-mini';
const sideMini = () => mem.get(SIDE) === '1';
function applySide() { shellEl?.classList.toggle('side-mini', sideMini()); }
function toggleSide() {
  mem.set(SIDE, sideMini() ? null : '1'); applySide(); renderTop();
  setTimeout(() => dispatchEvent(new Event('resize')), 60);
}
function renderTop() {
  if (!topEl) return;
  const p = productOf(store.productId);
  const v = store.route.view;
  const canva = store.settings.get('canva_url');
  fill(topEl,
    h('button', { class: 'burger', title: 'Menu · chuyển sản phẩm', onclick: openDrawer }, h('span'), h('span'), h('span')),
    h('button', { class: 'icon-btn light side-toggle', title: sideMini() ? 'Mở rộng thanh bên (Ctrl + B)' : 'Thu gọn thanh bên để rộng chỗ làm việc (Ctrl + B)', 'aria-pressed': sideMini(), onclick: toggleSide }, sideMini() ? '⇥' : '⇤'),
    h('a', { class: 'brand', href: p && v !== 'pick' ? `#/p/${store.productId}/overview` : '#/pick' }, h('span', { class: 'mark' }, 'K'), h('b', { class: 'serif' }, 'KTIN')),
    p && v !== 'pick' ? h('div', { class: 'cur-product', title: 'Đổi sản phẩm: bấm ☰' }, productThumb(p), h('div', {}, h('small', {}, v === 'db' ? 'Đang nhập liệu' : 'Đang xem'), h('b', {}, p.name))) : null,
    h('div', { class: 'grow' }),
    h('button', { class: 'top-search', title: 'Tìm mọi thứ (Ctrl + K)', onclick: openPalette }, h('span', { 'aria-hidden': 'true' }, '🔍'), h('span', { class: 'ts-l' }, 'Tìm…'), h('kbd', {}, 'Ctrl K')),
    h('button', { class: 'icon-btn light top-theme', title: 'Chế độ sáng / tối (Ctrl + Shift + L)', onclick: toggleTheme }, '🌓'),
    db.demo ? h('span', { class: 'demo-pill', title: 'Dữ liệu chỉ lưu trên trình duyệt này' }, 'Bản xem thử') : null,
    db.demo ? h('button', { class: `btn btn-sm ${sim?.isRunning() ? 'btn-primary' : 'btn-ghost'}`, title: 'Giả lập 2 bạn cùng nhóm đang làm việc', onclick: toggleSim }, sim?.isRunning() ? '⏸ Dừng mô phỏng' : '▶ Mô phỏng nhóm') : null,
    h('div', { class: 'canva-group' },
      h('button', { class: 'btn btn-canva', title: canva ? 'Mở Canva – mẫu thuyết trình (chung 2 sản phẩm)' : 'Chưa gắn liên kết Canva', onclick: openCanva }, '✦ Canva'),
      h('button', { class: 'icon-btn light', title: 'Sửa liên kết Canva', onclick: editCanva }, '✎')));
}

function dbHref() {
  const r = store.route, pid = store.productId || store.products[0]?.id;
  const sec = (r.view === 'product' && r.section !== 'overview') ? r.section : 'factory';
  return `#/db/${pid}/${sec}`;
}
// thanh dưới cùng trên điện thoại: Tổng quan · Tiến độ · Tin nhắn · Tài liệu · Menu
function renderMobileNav() {
  if (!mnavEl) return;
  const r = store.route, pid = store.productId || store.products[0]?.id;
  const it = (icon, label, href, on, badge) => h('a', { href, class: on ? 'on' : '', 'aria-current': on ? 'page' : null }, h('span', { class: 'mi', 'aria-hidden': 'true' }, icon), label, badge ? h('span', { class: 'badge-n' }, badge > 99 ? '99+' : badge) : null);
  fill(mnavEl,
    it('◎', 'Tổng quan', pid ? `#/p/${pid}/overview` : '#/pick', r.view === 'product' && r.section === 'overview'),
    it('☑', 'Tiến độ', pid ? `#/db/${pid}/progress` : '#/pick', r.view === 'db' && r.section === 'progress'),
    it('💬', 'Tin nhắn', '#/chat', r.view === 'chat', store.unread),
    it('📁', 'Tài liệu', '#/docs/lecturer', r.view === 'docs'),
    h('button', { onclick: openDrawer, 'aria-label': 'Mở menu' }, h('span', { class: 'mi', 'aria-hidden': 'true' }, '☰'), 'Menu'));
}
function renderSide() {
  renderMobileNav();
  if (!sideEl) return;
  const r = store.route, pid = store.productId;
  shellEl.classList.remove('no-side');
  sideEl.classList.toggle('db-mode', r.view === 'db');
  const here = (key, mode) => store.online.filter(o => o.id !== store.user.id && (key === 'factory' || o.productId === pid) && o.section === key && (o.mode || 'view') === mode);
  const item = (s, mode) => {
    const on = r.view === (mode === 'db' ? 'db' : 'product') && r.section === s.key;
    return h('a', { class: `nav ${on ? 'on' : ''}`, title: (s.n ? s.n + '. ' : '') + s.label, href: mode === 'db' ? `#/db/${pid}/${s.key}` : `#/p/${pid}/${s.key}` },
      h('span', { class: 'ni' }, s.n ? String(s.n) : '◎'), h('span', { class: 'nl' }, s.label),
      here(s.key, mode).length ? h('span', { class: 'here' }, here(s.key, mode).slice(0, 3).map(o => avatar({ display_name: o.name, color: o.color }, 18))) : null);
  };
  let nav;
  if (r.view === 'pick' || !pid) nav = [h('div', { class: 'side-head' }, 'Chọn sản phẩm'), store.products.map(p => h('a', { class: 'nav', href: `#/p/${p.id}/overview` }, h('span', { class: 'ni' }, '▸'), h('span', { class: 'nl' }, p.name)))];
  else if (r.view === 'db') nav = [h('div', { class: 'db-head' }, h('b', {}, '🗄 Cơ sở dữ liệu')), item(PROGRESS_SEC, 'db'), WORK_SECTIONS.map(s => item(s, 'db')),
    h('a', { class: `nav ${r.section === CHECK_SEC.key ? 'on' : ''}`, href: `#/db/${pid}/check` }, h('span', { class: 'ni' }, '✓'), h('span', { class: 'nl' }, 'Kiểm tra số liệu')),
    h('a', { class: 'nav', href: `#/report/${pid}` }, h('span', { class: 'ni' }, '⎙'), h('span', { class: 'nl' }, 'Xuất báo cáo Word / PDF')),
    h('a', { class: 'nav back', href: `#/p/${pid}/${r.section || 'overview'}` }, h('span', { class: 'ni' }, '←'), h('span', { class: 'nl' }, 'Về trang xem'))];
  else nav = [h('div', { class: 'side-head' }, 'Trang xem'), SECTIONS.map(s => item(s, 'view'))];

  // ----- góc dưới: Canva · Tài liệu · CSDL · Tin nhắn → tài khoản → đồng đội -----
  const ico = (icon, label, opts) => h(opts.href ? 'a' : 'button', { class: `dock-ic ${opts.on ? 'on' : ''}`, href: opts.href, onclick: opts.run, title: label }, h('span', { class: 'di' }, icon), h('span', { class: 'dl' }, label), opts.badge ? h('span', { class: 'badge-n' }, opts.badge > 99 ? '99+' : opts.badge) : null);
  const me = store.me;
  const onlineIds = new Set(store.online.map(o => o.id));
  const where = (id) => { const o = store.online.find(x => x.id === id); if (!o) return 'Ngoại tuyến'; if (o.section === 'chat') return 'Đang ở Tin nhắn'; if (o.section === 'board') return 'Đang ở Bảng trắng'; const pp = productOf(o.productId); return pp ? `${pp.name}${o.sectionLabel ? ' › ' + o.sectionLabel : ''}` : o.docs ? 'Tài liệu' : 'Trực tuyến'; };
  const team = [...store.profiles.values()].filter(p => p.id !== store.user.id).sort((a, b) => (onlineIds.has(b.id) - onlineIds.has(a.id)) || (a.display_name || '').localeCompare(b.display_name || ''));
  fill(sideEl,
    h('div', { class: 'side-nav' }, nav),
    h('div', { class: 'side-dock' },
      h('div', { class: 'dock-icons' },
        ico('✦', 'Canva', { run: openCanva }),
        ico('📁', 'Tài liệu', { href: '#/docs/lecturer', on: r.view === 'docs' }),
        ico('🗄', 'CSDL', { href: dbHref(), on: r.view === 'db' }),
        ico('💬', 'Tin nhắn', { href: '#/chat', on: r.view === 'chat', badge: store.unread }),
        ico('✏️', 'Bảng trắng', { href: '#/board', on: r.view === 'board' })),
      h('div', { class: 'dock-me' },
        h('span', { class: 'av-wrap on' }, avatar(me, 32)),
        h('div', { class: 'grow', onclick: openProfile, style: { cursor: 'pointer', minWidth: 0 } }, h('b', {}, me?.display_name || store.user.email), h('small', {}, store.user.email)),
        h('button', { class: 'icon-btn', title: 'Tài khoản', onclick: (e) => popMenu(e.currentTarget, [
          { icon: '👤', label: 'Hồ sơ của bạn', run: openProfile }, { icon: '✎', label: 'Sửa liên kết Canva', run: editCanva },
          { icon: '🌓', label: 'Chế độ sáng / tối', run: toggleTheme }, { icon: '⌨', label: 'Bảng phím tắt (?)', run: openShortcuts }, { icon: '🗑', label: 'Thùng rác', run: () => go('#/trash') },
          db.demo ? { icon: '↺', label: 'Đặt lại dữ liệu mẫu', run: resetDemo } : null, '-', { icon: '⎋', label: 'Đăng xuất', danger: true, run: signOut }].filter(Boolean)) }, '⋯')),
      h('div', { class: 'dock-team' }, team.map(p => h('div', { class: `mate ${onlineIds.has(p.id) ? 'on' : ''}`, title: where(p.id) },
        h('span', { class: 'av-wrap' }, avatar(p, 26)), h('div', { class: 'grow' }, h('b', {}, p.display_name || p.email), h('small', {}, where(p.id))))))));
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
    store.productId ? h('div', { class: 'dr-mobile' },
      h('div', { class: 'dr-sec' }, 'Trang xem'),
      SECTIONS.map(sec => item(sec.n || '◎', sec.label, () => go(`#/p/${store.productId}/${sec.key}`), { on: store.route.view === 'product' && store.route.section === sec.key })),
      h('div', { class: 'dr-sec' }, 'Cơ sở dữ liệu (nhập liệu)'),
      [PROGRESS_SEC, ...WORK_SECTIONS, CHECK_SEC].map(sec => item(sec.n || '◎', sec.label, () => go(`#/db/${store.productId}/${sec.key}`), { on: store.route.view === 'db' && store.route.section === sec.key }))) : null,
    h('div', { class: 'dr-sec' }, 'Dùng chung'),
    item('🗄', 'Cơ sở dữ liệu', () => go(dbHref())),
    item('📁', 'Tài liệu', () => go('#/docs/lecturer')),
    item('💬', 'Tin nhắn', () => go('#/chat'), { right: store.unread ? h('span', { class: 'badge-n' }, store.unread) : null }),
    item('✏️', 'Bảng trắng nhóm', () => go('#/board')),
    item('🔍', 'Tìm mọi thứ', openPalette, { sub: 'Ctrl + K' }),
    store.productId ? item('✓', 'Kiểm tra số liệu trước khi nộp', () => go(`#/db/${store.productId}/check`)) : null,
    store.productId ? item('⎙', 'Xuất báo cáo Word / PDF', () => go(`#/report/${store.productId}`)) : null,
    item('🗑', 'Thùng rác', () => go('#/trash'), { sub: 'Khôi phục mục đã xoá trong 30 ngày' }),
    item('✦', 'Canva – mẫu thuyết trình', openCanva, { sub: canva ? canva.replace(/^https?:\/\//, '').slice(0, 40) : 'Chưa gắn liên kết' }),
    item('✎', 'Sửa liên kết Canva', editCanva),
    h('div', { class: 'dr-sec' }, 'Tài khoản'),
    item('👤', 'Hồ sơ của bạn', openProfile),
    item('🌓', 'Chế độ sáng / tối', toggleTheme),
    item('⌨', 'Bảng phím tắt', openShortcuts, { sub: 'phím ?' }),
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
    h('p', { class: 'small muted' }, 'Một liên kết Canva dùng chung cho cả Hộp và Sách (mẫu thuyết trình). Trong Canva: Chia sẻ → Sao chép liên kết (quyền “Có thể chỉnh sửa” để cả nhóm cùng sửa).'),
    h('label', { class: 'field' }, h('span', {}, 'Link Canva'), h('input', { class: 'input', id: 'canva-in', value: cur, placeholder: 'https://www.canva.com/design/…' })));
  const r = await modal('Liên kết Canva của nhóm', body, [{ label: 'Huỷ', value: null }, { label: 'Lưu', value: 'ok', primary: true }]);
  if (r !== 'ok') return;
  const v = body.querySelector('#canva-in').value.trim();
  if (v && !/^https?:\/\//.test(v)) { toast('Liên kết phải bắt đầu bằng https://', 'error'); return; }
  try {
    if (await db.get('settings', 'canva_url')) await db.update('settings', 'canva_url', { value: v, updated_by: store.user.id, updated_at: new Date().toISOString() });
    else await db.insert('settings', { id: 'canva_url', value: v, updated_by: store.user.id });
    store.settings.set('canva_url', v); renderTop(); logActivity(store.user, 'cập nhật liên kết', 'Canva – mẫu thuyết trình'); toast('Đã lưu liên kết Canva', 'ok');
  } catch (e) { toastErr(e); }
}

// ---------- hồ sơ ----------
async function openProfile() {
  const me = store.me || {};
  const name = h('input', { class: 'input', value: me.display_name || '' });
  let color = me.color || USER_COLORS[0];
  const takenBy = new Map([...store.profiles.values()].filter(p => p.id !== store.user.id && p.color).map(p => [p.color, p.display_name || p.email]));
  const colors = h('div', { class: 'colors' }, USER_COLORS.map(c => takenBy.has(c)
    ? h('span', { class: 'swatch taken', style: { background: c }, title: `${takenBy.get(c)} đang dùng màu này` })
    : h('span', { class: `swatch ${c === color ? 'on' : ''}`, style: { background: c }, title: 'Chọn màu này', onclick: (e) => { color = c; colors.querySelectorAll('.swatch').forEach(s => s.classList.remove('on')); e.target.classList.add('on'); } })));
  const pw = h('input', { class: 'input', type: 'password', placeholder: 'Để trống nếu không đổi', autocomplete: 'new-password' });
  const body = h('div', {},
    h('p', { class: 'muted small' }, store.user.email),
    h('label', { class: 'field' }, h('span', {}, 'Tên hiển thị'), name),
    h('div', { class: 'field' }, h('span', {}, 'Màu của bạn'), colors),
    db.demo ? null : h('label', { class: 'field' }, h('span', {}, 'Đặt mật khẩu (để đăng nhập không cần liên kết email)'), pw));
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

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  document.querySelectorAll('.menu').forEach(m => m.remove());
  closeDrawer?.();
  const fallbackPid = () => productOf(store.productId) ? store.productId : productOf(mem.get(LAST)) ? mem.get(LAST) : store.products[0]?.id;
  if ((parts[0] === 'p' || parts[0] === 'db') && productOf(parts[1])) {
    store.productId = parts[1]; mem.set(LAST, parts[1]);
    if (parts[0] === 'p') {
      const sec = SECTIONS.find(s => s.key === parts[2]) || SECTIONS[0];
      store.route = { view: 'product', section: sec.key, tab: VIEW_TABS.some(([k]) => k === parts[3]) ? parts[3] : 'view', sub: parts[4] || null };
      renderProduct(sec);
    } else {
      if (parts[2] === PROGRESS_SEC.key) { store.route = { view: 'db', section: PROGRESS_SEC.key, sub: null }; renderDbProgress(); }
      else if (parts[2] === CHECK_SEC.key) { store.route = { view: 'db', section: CHECK_SEC.key, sub: null }; renderSimple('db', '✓', 'Kiểm tra số liệu trước khi nộp', (body, p) => mountCheck(body, { product: p })); }
      else {
        const sec = WORK_SECTIONS.find(s => s.key === parts[2]) || WORK_SECTIONS[0];
        store.route = { view: 'db', section: sec.key, sub: parts[3] || null };
        renderDb(sec);
      }
    }
  } else if (parts[0] === 'report' && productOf(parts[1])) {
    store.productId = parts[1]; mem.set(LAST, parts[1]);
    store.route = { view: 'report', section: 'report' };
    renderSimple('report', '⎙', 'Xuất báo cáo thuyết minh', (body, p) => mountReport(body, { product: p }));
  } else if (parts[0] === 'trash') {
    store.productId = fallbackPid();
    store.route = { view: 'trash' };
    renderSimple('trash', '🗑', 'Thùng rác', (body) => mountTrash(body));
  } else if (parts[0] === 'docs') {
    store.productId = fallbackPid();
    store.route = { view: 'docs', branch: parts[1] === 'team' ? 'team' : 'lecturer' };
    renderDocs();
  } else if (parts[0] === 'board') {
    store.productId = fallbackPid();
    store.route = { view: 'board', sub: parts[1] || null };
    renderBoard();
  } else if (parts[0] === 'chat') {
    store.productId = fallbackPid();
    store.route = { view: 'chat' };
    renderChat();
  } else {
    store.route = { view: 'pick' };
    setWhere({ productId: null, section: null, sectionLabel: null, docs: false, mode: null });
    fill(mainEl);
    cleanup = mountPicker(mainEl, { choose: (p) => go(`#/p/${p.id}/overview`) });
  }
  renderTop(); renderSide();
  mainEl.scrollTop = 0;
}

async function ensureFolder(pid, sec) {
  let f = folderFor(pid, sec.key);
  if (!f) {
    f = await db.insert('folders', { product_id: sec.company ? null : pid, section: sec.key, name: sec.company ? 'Phương án nhà máy (chung)' : sec.label, parent_id: null, position: SECTIONS.indexOf(sec) });
    if (!folderOf(f.id)) store.folders.push(f);
  }
  return f;
}
const secLabel = (sec) => (sec.n ? sec.n + '. ' : '') + sec.label;

// ---------- TRANG XEM: Hiển thị · Tệp đính kèm · Ghi chú ----------
async function renderProduct(sec) {
  const { tab, sub } = store.route;
  const p = productOf(store.productId);
  setWhere({ productId: p.id, section: sec.key, sectionLabel: secLabel(sec), docs: false, mode: 'view' });
  const folder = await ensureFolder(p.id, sec).catch(toastErr);
  if (!folder || store.route.section !== sec.key || store.route.view !== 'product') return;
  if (sec.key === 'overview') { fill(mainEl); cleanup = mountOverview(mainEl, { product: p, folder }); return; }
  const body = h('div', { class: 'tab-body' });
  const head = h('div', { class: 'page-head' },
    h('div', { class: 'crumbs' }, h('a', { href: `#/p/${p.id}/overview` }, p.name), h('span', {}, '›'), sec.company ? [h('span', {}, 'Công ty (chung)'), h('span', {}, '›')] : null, h('span', {}, secLabel(sec))),
    h('div', { class: 'page-title' }, h('span', { class: 'sec-n' }, sec.n), h('h1', { class: 'serif' }, sec.label),
      h('div', { class: 'grow' }), h('a', { class: 'btn btn-sm btn-db', href: `#/db/${p.id}/${sec.key}` }, '🗄 Nhập liệu ở Cơ sở dữ liệu')),
    h('div', { class: 'tabs' }, VIEW_TABS.map(([t, label]) => h('a', { class: `tab ${t === tab ? 'on' : ''}`, href: `#/p/${p.id}/${sec.key}/${t}` }, label))));
  fill(mainEl, h('div', { class: 'page-full' }, head, body));
  const goSub = (s) => { history.replaceState(null, '', `#/p/${p.id}/${sec.key}/${tab}${s ? '/' + s : ''}`); store.route.sub = s; };
  if (tab === 'files') cleanup = mountFiles(body, { folder });
  else if (tab === 'notes') cleanup = mountNotes(body, { folder, sub, go: goSub });
  else cleanup = mountSectionView(body, { product: p, section: sec.key });
}

// ---------- CƠ SỞ DỮ LIỆU: nơi nhập liệu ----------
async function renderDb(sec) {
  const { sub } = store.route;
  const p = productOf(store.productId);
  setWhere({ productId: p.id, section: sec.key, sectionLabel: '🗄 ' + secLabel(sec), docs: false, mode: 'db' });
  const folder = await ensureFolder(p.id, sec).catch(toastErr);
  if (!folder || store.route.section !== sec.key || store.route.view !== 'db') return;
  const body = h('div', { class: 'tab-body' });
  const head = h('div', { class: 'page-head db' },
    h('div', { class: 'crumbs' }, h('span', {}, '🗄 Cơ sở dữ liệu'), h('span', {}, '›'), h('span', {}, sec.company ? 'Công ty (chung cho Hộp & Sách)' : p.name), h('span', {}, '›'), h('span', {}, secLabel(sec))),
    h('div', { class: 'page-title' }, h('span', { class: 'sec-n' }, sec.n), h('h1', { class: 'serif' }, sec.label), h('span', { class: 'stamp small-stamp' }, 'NHẬP LIỆU'),
      h('div', { class: 'grow' }), h('a', { class: 'btn btn-sm', href: `#/p/${p.id}/${sec.key}` }, '👁 Xem trang hiển thị')));
  fill(mainEl, h('div', { class: 'page-full' }, head, body));
  const goSub = (s) => { history.replaceState(null, '', `#/db/${p.id}/${sec.key}${s ? '/' + s : ''}`); store.route.sub = s; };
  const fixed = {
    factory: [{ key: 'tree', label: '🏭 Sơ đồ nhà máy', mount: (el) => mountFactoryTree(el, { product: p }) }, { key: 'machines', label: '⚙ Bảng thiết bị', mount: (el) => mountMachineTable(el) }],
    specs: [{ key: 'info', label: '🖼 Ảnh & thông tin chung', mount: (el) => mountSpecs(el, { product: p, folder }) }],
    plan: [{ key: 'tree', label: '🌳 Phương án (dạng cây)', mount: (el) => mountPlan(el, { product: p }) }],
  }[sec.key] || [];
  cleanup = mountSheets(body, { folder, sub, go: goSub, fixed, templates: SECTION_TEMPLATES[sec.key] || [], title: `${secLabel(sec)} – ${sec.company ? 'Cong ty' : p.name}` });
}

// ---------- CSDL › Tiến độ đồ án: thêm / bớt / sửa các bước hiện ở trang Tổng quan ----------
async function renderDbProgress() {
  const p = productOf(store.productId);
  setWhere({ productId: p.id, section: PROGRESS_SEC.key, sectionLabel: '🗄 Tiến độ đồ án', docs: false, mode: 'db' });
  const overview = SECTIONS.find(s => s.key === 'overview');
  const folder = await ensureFolder(p.id, overview).catch(toastErr);
  if (!folder || store.route.section !== PROGRESS_SEC.key || store.route.view !== 'db') return;
  const body = h('div', { class: 'tab-body' });
  const head = h('div', { class: 'page-head db' },
    h('div', { class: 'crumbs' }, h('span', {}, '🗄 Cơ sở dữ liệu'), h('span', {}, '›'), h('span', {}, p.name), h('span', {}, '›'), h('span', {}, 'Tiến độ đồ án')),
    h('div', { class: 'page-title' }, h('span', { class: 'sec-n' }, '◎'), h('h1', { class: 'serif' }, 'Tiến độ đồ án'), h('span', { class: 'stamp small-stamp' }, 'NHẬP LIỆU'),
      h('div', { class: 'grow' }), h('a', { class: 'btn btn-sm', href: `#/p/${p.id}/overview` }, '👁 Xem ở Tổng quan')));
  fill(mainEl, h('div', { class: 'page-full' }, head, body));
  cleanup = mountProgressEditor(body, { product: p, folder });
}

// trang đơn giản: tiêu đề + nội dung (Kiểm tra số liệu, Xuất báo cáo, Thùng rác)
function renderSimple(mode, icon, title, mount) {
  const p = productOf(store.productId);
  setWhere({ productId: p?.id || null, section: store.route.section || mode, sectionLabel: title, docs: false, mode: mode === 'db' ? 'db' : null });
  const body = h('div', { class: 'tab-body' });
  const head = h('div', { class: `page-head ${mode === 'db' ? 'db' : ''}` },
    h('div', { class: 'crumbs' }, mode === 'db' ? [h('span', {}, '🗄 Cơ sở dữ liệu'), h('span', {}, '›')] : null, p && mode !== 'trash' ? [h('span', {}, p.name), h('span', {}, '›')] : null, h('span', {}, title)),
    h('div', { class: 'page-title' }, h('span', { class: 'sec-n' }, icon), h('h1', { class: 'serif' }, title)));
  fill(mainEl, h('div', { class: 'page-full' }, head, body));
  cleanup = mount(body, p);
}

async function renderBoard() {
  setWhere({ productId: null, section: 'board', sectionLabel: 'Bảng trắng', docs: false, mode: null });
  const body = h('div', { class: 'tab-body wb-body' });
  fill(mainEl, h('div', { class: 'page-full wb-page' }, body));   // tiêu đề thu gọn vào dòng chọn bảng → vùng vẽ rộng hơn
  let folder = docsFolder('board');
  if (!folder) {
    try {
      folder = await db.insert('folders', { parent_id: null, product_id: null, section: 'board', name: 'Bảng trắng nhóm', icon: '✏️', position: 3 });
      if (!store.folders.some(f => f.id === folder.id)) store.folders.push(folder);
    } catch (e) { toastErr(e); return; }
  }
  if (store.route.view !== 'board') return;
  cleanup = mountBoards(body, { folder, sub: store.route.sub, go: (s) => { history.replaceState(null, '', `#/board${s ? '/' + s : ''}`); store.route.sub = s; } });
}

function renderChat() {
  setWhere({ productId: null, section: 'chat', sectionLabel: 'Tin nhắn', docs: false, mode: null });
  store.unread = 0;
  const body = h('div', { class: 'tab-body chat-body' });
  const head = h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, h('span', { class: 'sec-n' }, '💬'), h('h1', { class: 'serif' }, 'Tin nhắn nhóm')));
  fill(mainEl, h('div', { class: 'page-full' }, head, body));
  cleanup = mountChat(body, { onRead: () => { if (store.unread) { store.unread = 0; renderSide(); } } });
}

function renderDocs() {
  const { branch } = store.route;
  setWhere({ productId: null, section: null, sectionLabel: null, docs: true, mode: null });
  const lect = docsFolder('lecturer'), team = docsFolder('team');
  const body = h('div', { class: 'tab-body' });
  const head = h('div', { class: 'page-head' },
    h('div', { class: 'crumbs' }, h('span', {}, 'Lưu trữ dùng chung')),
    h('div', { class: 'page-title' }, h('span', { class: 'sec-n' }, '📁'), h('h1', { class: 'serif' }, 'Tài liệu')),
    h('div', { class: 'tabs' },
      h('a', { class: `tab ${branch === 'lecturer' ? 'on' : ''}`, href: '#/docs/lecturer' }, '📚 Tài liệu giảng viên'),
      h('a', { class: `tab ${branch === 'team' ? 'on' : ''}`, href: '#/docs/team' }, '🗂️ Tài liệu nhóm')));
  fill(mainEl, h('div', { class: 'page-full' }, head, body));
  if (!lect || !team) { fill(body, h('div', { class: 'page' }, h('div', { class: 'empty' }, 'Chưa tạo thư mục tài liệu. Liên hệ trưởng nhóm để khởi tạo lại.'))); return; }
  cleanup = branch === 'lecturer' ? mountFiles(body, { folder: lect, lecturer: true }) : mountFiles(body, { folder: team, aggregate: true });
}

on('products', () => { if (store.route.view === 'pick') route(); });

boot().catch((e) => { console.error(e); fill(app, h('div', { class: 'boot' }, 'Lỗi khởi động: ' + e.message)); });
