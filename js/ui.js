// Tiện ích giao diện dùng chung
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debounce(fn, ms) {
  let t = null, args = null;
  const d = (...a) => { args = a; clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  d.flush = () => { if (t) { clearTimeout(t); t = null; return fn(...args); } };
  return d;
}
export function throttle(fn, ms) { let last = 0, t; return (...a) => { const n = Date.now(); clearTimeout(t); if (n - last >= ms) { last = n; fn(...a); } else t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (n - last)); }; }

export function fmtSize(b) { if (b == null) return ''; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return `${b.toFixed(i ? 1 : 0)} ${u[i]}`; }
export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fileIcon(name = '', mime = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (['doc', 'docx'].includes(ext)) return { icon: 'W', cls: 'ft-word' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: 'X', cls: 'ft-excel' };
  if (['ppt', 'pptx'].includes(ext)) return { icon: 'P', cls: 'ft-ppt' };
  if (ext === 'pdf') return { icon: 'PDF', cls: 'ft-pdf' };
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return { icon: 'IMG', cls: 'ft-img' };
  if (['zip', 'rar', '7z'].includes(ext)) return { icon: 'ZIP', cls: 'ft-zip' };
  return { icon: ext.slice(0, 3).toUpperCase() || 'FILE', cls: 'ft-other' };
}

// Thông báo nhỏ góc màn hình
export function toast(msg, type = 'info') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
  const t = h('div', { class: `toast toast-${type}` }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3600);
}
// Dịch các thông báo lỗi thường gặp (Supabase, trình duyệt) sang tiếng Việt
const ERR_VI = [
  [/invalid login credentials/i, 'Sai email hoặc mật khẩu.'],
  [/email not confirmed/i, 'Email chưa được xác nhận. Mở email mời và bấm vào liên kết trước.'],
  [/signups? not allowed|user not found|not allowed for otp/i, 'Email này chưa được mời vào nhóm. Nhờ trưởng nhóm gửi lời mời.'],
  [/rate limit|too many requests|security purposes/i, 'Thao tác quá nhiều lần. Đợi vài phút rồi thử lại.'],
  [/password should be at least (\d+)/i, (m) => `Mật khẩu phải có ít nhất ${m[1]} ký tự.`],
  [/new password should be different/i, 'Mật khẩu mới phải khác mật khẩu cũ.'],
  [/jwt expired|invalid jwt|refresh token/i, 'Phiên đăng nhập đã hết hạn. Hãy tải lại trang và đăng nhập lại.'],
  [/failed to fetch|networkerror|load failed/i, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'],
  [/row-level security|violates row level|permission denied/i, 'Không có quyền thực hiện thao tác này.'],
  [/duplicate key/i, 'Dữ liệu bị trùng.'],
  [/payload too large|exceeded the maximum allowed size|object too large/i, 'Tệp quá lớn (tối đa 50 MB).'],
  [/the resource already exists/i, 'Tệp đã tồn tại.'],
];
export const viError = (msg) => { const s = String(msg || ''); for (const [re, vi] of ERR_VI) { const m = s.match(re); if (m) return typeof vi === 'function' ? vi(m) : vi; } return s || 'Có lỗi xảy ra'; };
export const toastErr = (e) => { console.error(e); toast(viError(e?.message || e), 'error'); };

// Hộp thoại
export function modal(title, body, actions = []) {
  return new Promise((resolve) => {
    const close = (v) => { wrap.remove(); resolve(v); };
    const wrap = h('div', { class: 'modal-wrap', onmousedown: (e) => { if (e.target === wrap) close(null); } },
      h('div', { class: 'modal' },
        h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', title: 'Đóng', onclick: () => close(null) }, '✕')),
        h('div', { class: 'modal-body' }, body),
        actions.length ? h('div', { class: 'modal-foot' }, actions.map(a => h('button', { class: `btn ${a.primary ? 'btn-primary' : ''} ${a.danger ? 'btn-danger' : ''}`, onclick: () => close(a.value ?? a.label) }, a.label))) : null,
      ));
    document.body.append(wrap);
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
    setTimeout(() => wrap.querySelector('input,textarea,select,button.btn-primary')?.focus(), 30);
  });
}
export async function prompt(title, label, value = '', placeholder = '') {
  const inp = h('input', { class: 'input', value, placeholder });
  const body = h('label', { class: 'field' }, h('span', {}, label), inp);
  let resolveEnter;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { resolveEnter = inp.value; inp.closest('.modal-wrap').querySelector('.btn-primary').click(); } });
  const r = await modal(title, body, [{ label: 'Huỷ', value: null }, { label: 'Đồng ý', value: 'ok', primary: true }]);
  return r === 'ok' ? (resolveEnter ?? inp.value).trim() : null;
}
export async function confirmBox(title, text, danger = true) {
  const r = await modal(title, h('p', {}, text), [{ label: 'Huỷ', value: null }, { label: 'Xác nhận', value: 'ok', primary: !danger, danger }]);
  return r === 'ok';
}

export function avatar(p, size = 28) {
  const name = p?.display_name || p?.email || '?';
  return h('span', { class: 'avatar', title: name, style: { width: size + 'px', height: size + 'px', background: p?.color || '#64748b', fontSize: Math.round(size * 0.42) + 'px' } }, name.trim().charAt(0).toUpperCase());
}

// Markdown tối giản cho ghi chú (an toàn: escape trước rồi mới định dạng)
export function miniMarkdown(src) {
  const lines = esc(src).split('\n');
  let out = '', inList = null, inCode = false;
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const closeList = () => { if (inList) { out += `</${inList}>`; inList = null; } };
  for (const raw of lines) {
    if (raw.startsWith('```')) { closeList(); out += inCode ? '</pre>' : '<pre>'; inCode = !inCode; continue; }
    if (inCode) { out += raw + '\n'; continue; }
    let m;
    if ((m = raw.match(/^(#{1,3})\s+(.*)/))) { closeList(); out += `<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`; }
    else if ((m = raw.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)/i))) { if (inList !== 'ul') { closeList(); out += '<ul class="checks">'; inList = 'ul'; } out += `<li>${m[1].toLowerCase() === 'x' ? '☑' : '☐'} ${inline(m[2])}</li>`; }
    else if ((m = raw.match(/^\s*[-*]\s+(.*)/))) { if (inList !== 'ul') { closeList(); out += '<ul>'; inList = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = raw.match(/^\s*\d+[.)]\s+(.*)/))) { if (inList !== 'ol') { closeList(); out += `<ol start="${parseInt(raw, 10) || 1}">`; inList = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if (raw.trim() === '') { closeList(); out += ''; }
    else if (raw.startsWith('&gt; ')) { closeList(); out += `<blockquote>${inline(raw.slice(5))}</blockquote>`; }
    else { closeList(); out += `<p>${inline(raw)}</p>`; }
  }
  closeList(); if (inCode) out += '</pre>';
  return out;
}

export function popMenu(anchor, items) {
  document.querySelectorAll('.menu').forEach(m => m.remove());
  const rect = anchor.getBoundingClientRect();
  const menu = h('div', { class: 'menu' }, items.map(it => it === '-' ? h('hr') : h('button', { class: it.danger ? 'danger' : '', onclick: () => { menu.remove(); it.run(); } }, it.icon || '', it.label)));
  document.body.append(menu);
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.min(rect.left, innerWidth - mw - 8) + 'px';
  menu.style.top = (rect.bottom + mh + 6 > innerHeight ? rect.top - mh - 4 : rect.bottom + 4) + 'px';
  setTimeout(() => addEventListener('mousedown', function off(e) { if (!menu.contains(e.target)) { menu.remove(); removeEventListener('mousedown', off); } }), 0);
}

// Thay toàn bộ nội dung phần tử (tự làm phẳng mảng, bỏ null/false)
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter(c => c != null && c !== false).map(c => c instanceof Node ? c : document.createTextNode(String(c))));
  return el;
}

// Trang xem thử chạy trong khung bảo vệ nên trình duyệt chặn tải file: báo cho người dùng
export function downloadNote() {
  let framed = false; try { framed = window.top !== window; } catch { framed = true; }
  if (framed) toast('Bản xem thử không tải tệp về được. Bản chính trên GitHub sẽ tải bình thường.');
}
