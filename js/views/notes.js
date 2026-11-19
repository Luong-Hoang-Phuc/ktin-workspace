import db, { logActivity } from '../db.js';
import { store, nameOf } from '../store.js';
import { h, fmtTime, toastErr, confirmBox, debounce, throttle, miniMarkdown, popMenu, fill } from '../ui.js';

const TEMPLATES = {
  'Ghi chú trống': '',
  'Biên bản họp nhóm': `# Biên bản họp nhóm – ${new Date().toLocaleDateString('vi-VN')}

**Thành viên tham dự:**
**Nội dung chính:**
-

## Việc cần làm
- [ ] … – phụ trách: … – hạn: …
- [ ] …

## Vấn đề cần hỏi giảng viên
- `,
  'Thông số đơn hàng – Hộp': `# Đơn hàng 1 – Hộp kem dưỡng

- **Số lượng:** 50.000 hộp – giao trong 15 ngày
- **Kiểu dáng:** hộp gấp nắp gài 2 đầu ngược chiều (reverse tuck end), dán hông, không bồi sóng
- **Kích thước:** 50 × 50 × 150 mm (trải phẳng ≈ 215 × 280 mm – kiểm tra lại)
- **Vật liệu:** Ivory 350 g/m² (mã định mức 2)
- **Màu in:** 5/0 – CMYK + 1 màu pha
- **GCBM:** dán màng mờ toàn phần; UV bóng từng phần ≈ 20%; ép nhũ vàng logo 30 × 15 mm × 2 vị trí
- **Máy dự kiến:** L640 → DM1 → TP1 → en1 → TĐ1 → xé rìa → DH1`,
  'Thông số đơn hàng – Sách': `# Đơn hàng 2 – Sách khâu chỉ bìa mềm

- **Số lượng:** 3.000 cuốn – giao trong 20 ngày
- **Khổ thành phẩm:** 14,5 × 20,5 cm; 240 trang (15 tay × 16 trang); gáy ≈ 12 mm
- **Ruột:** Fort 80 g/m², in 1/1 (đen), khâu chỉ
- **Bìa:** Bristol 250 g/m², in 4/0, dán màng bóng, ép nhũ tên sách 80 × 20 mm; bìa trải 30,2 × 20,5 cm
- **Máy dự kiến:** CD102-4 (ruột), SM102 (bìa), CẮT 1, G1, BC1, KC1, DM1, en1, VB1, X3`,
  'Câu hỏi cho giảng viên': `# Câu hỏi cho giảng viên

1.
2.

> Ghi lại câu trả lời ngay bên dưới từng câu hỏi.`,
};

export function mountNotes(el, { folder, sub, go }) {
  let notes = [], cur = null, mode = localStorage.getItem('ktin-note-mode') || 'split';
  let dirty = false, lastLocalType = 0;
  const list = h('div', { class: 'note-list' });
  const edit = h('div', { class: 'note-edit' });
  el.append(h('div', { class: 'notes' }, list, edit));
  const room = db.room(`notes-${folder.id}`, onRoom);
  const typingBy = new Map();

  function renderList() {
    fill(list, 
      h('div', { class: 'head' }, h('button', { class: 'btn btn-primary btn-sm grow', style: { justifyContent: 'center' }, onclick: (e) => popMenu(e.currentTarget, Object.keys(TEMPLATES).map(k => ({ icon: k === 'Ghi chú trống' ? '＋' : '📄', label: k, run: () => create(k) }))) }, '＋ Ghi chú mới ▾')),
      notes.length ? notes.map(n => h('div', { class: `note-item ${cur?.id === n.id ? 'on' : ''}`, onclick: () => select(n.id) },
        h('b', {}, n.title || 'Không tiêu đề'),
        h('small', {}, `${nameOf(n.updated_by)} · ${fmtTime(n.updated_at)}`),
        typingBy.get(n.id) ? h('div', { class: 'typing' }, `✍️ ${typingBy.get(n.id)} đang gõ…`) : null))
        : h('div', { class: 'small muted', style: { padding: '16px' } }, 'Chưa có ghi chú.'));
  }

  let titleEl, textEl, prevEl, statusEl, typingEl, areaEl;
  function renderEditor() {
    if (!cur) { fill(edit, h('div', { class: 'page' }, h('div', { class: 'empty' }, h('div', { class: 'big' }, '🗒️'), h('p', {}, 'Chọn hoặc tạo một ghi chú. Mọi người trong nhóm sẽ thấy nội dung cập nhật ngay khi bạn gõ.'), h('p', { class: 'small' }, 'Hỗ trợ định dạng: # Tiêu đề, **đậm**, *nghiêng*, - danh sách, - [ ] việc cần làm, link.')))); return; }
    titleEl = h('input', { class: 'note-title', value: cur.title, placeholder: 'Tiêu đề', oninput: onType });
    textEl = h('textarea', { class: 'note-text', placeholder: 'Bắt đầu ghi chú…', oninput: onType, onkeydown: tabKey });
    textEl.value = cur.content || '';
    prevEl = h('div', { class: 'note-preview' });
    statusEl = h('span', { class: 'saved' }, `Lưu lúc ${fmtTime(cur.updated_at)} bởi ${nameOf(cur.updated_by)}`);
    typingEl = h('span', { class: 'typing' });
    areaEl = h('div', { class: 'note-area' }, textEl, prevEl);
    const modeBtn = (m, label) => h('button', { class: `btn btn-sm ${mode === m ? 'btn-primary' : ''}`, onclick: () => { mode = m; localStorage.setItem('ktin-note-mode', m); renderEditor(); } }, label);
    fill(edit, 
      h('div', { class: 'note-bar' }, titleEl, typingEl, statusEl,
        modeBtn('edit', 'Soạn'), modeBtn('split', 'Chia đôi'), modeBtn('view', 'Xem'),
        h('button', { class: 'icon-btn', title: 'Tuỳ chọn', onclick: (e) => popMenu(e.currentTarget, [
          { icon: '⬇️', label: 'Tải về .md', run: () => { const a = h('a', { href: URL.createObjectURL(new Blob([textEl.value], { type: 'text/markdown' })), download: (titleEl.value || 'ghi-chu') + '.md' }); a.click(); } },
          { icon: '📋', label: 'Sao chép nội dung', run: () => navigator.clipboard?.writeText(textEl.value) },
          '-',
          { icon: '🗑️', label: 'Xoá ghi chú', danger: true, run: remove },
        ]) }, '⋯')),
      areaEl);
    applyMode(); preview();
  }
  function applyMode() {
    if (!areaEl) return;
    textEl.style.display = mode === 'view' ? 'none' : '';
    prevEl.style.display = mode === 'edit' ? 'none' : '';
    areaEl.classList.toggle('one', mode !== 'split');
  }
  const preview = () => { if (prevEl) prevEl.innerHTML = miniMarkdown(textEl.value) || '<p class="muted">Xem trước…</p>'; };
  function tabKey(e) { if (e.key === 'Tab') { e.preventDefault(); const s = textEl.selectionStart; textEl.setRangeText('  ', s, textEl.selectionEnd, 'end'); onType(); } }

  const save = debounce(async () => {
    if (!cur) return;
    const id = cur.id, title = titleEl.value.trim() || 'Không tiêu đề', content = textEl.value;
    try {
      statusEl.textContent = 'Đang lưu…';
      const r = await db.update('notes', id, { title, content, updated_by: store.user.id, updated_at: new Date().toISOString() });
      if (cur?.id === id) { dirty = false; statusEl.textContent = 'Đã lưu ✓'; if (r) Object.assign(cur, r); }
    } catch (e) { statusEl.textContent = 'Lỗi lưu!'; toastErr(e); }
  }, 700);
  const live = throttle(() => cur && room.send({ t: 'live', id: cur.id, title: titleEl.value, content: textEl.value, name: store.me?.display_name, uid: store.user.id }), 250);
  function onType() { dirty = true; lastLocalType = Date.now(); preview(); save(); live(); const n = notes.find(x => x.id === cur.id); if (n) { n.title = titleEl.value; } }

  function onRoom(msg) {
    if (msg.t !== 'live' || msg.uid === store.user.id) return;
    typingBy.set(msg.id, msg.name); clearTimeout(onRoom['_' + msg.id]);
    onRoom['_' + msg.id] = setTimeout(() => { typingBy.delete(msg.id); renderList(); if (cur?.id === msg.id && typingEl) typingEl.textContent = ''; }, 2500);
    if (cur?.id === msg.id) {
      typingEl.textContent = `✍️ ${msg.name} đang gõ…`;
      if (Date.now() - lastLocalType > 1500) applyRemote(msg.title, msg.content);
    } else renderList();
  }
  function applyRemote(title, content) {
    if (!textEl) return;
    if (document.activeElement !== titleEl && titleEl.value !== title) titleEl.value = title;
    if (textEl.value !== content) {
      const s = textEl.selectionStart, e = textEl.selectionEnd, focused = document.activeElement === textEl;
      textEl.value = content;
      if (focused) textEl.setSelectionRange(Math.min(s, content.length), Math.min(e, content.length));
      preview();
    }
  }

  async function select(id) {
    if (dirty) await save.flush();
    cur = notes.find(n => n.id === id) || null;
    go(cur ? cur.id : null);
    renderList(); renderEditor();
  }
  async function create(tpl) {
    try {
      const n = await db.insert('notes', { folder_id: folder.id, title: tpl === 'Ghi chú trống' ? 'Ghi chú mới' : tpl, content: TEMPLATES[tpl], updated_by: store.user.id });
      logActivity(store.user, 'tạo ghi chú', n.title);
      if (!notes.some(x => x.id === n.id)) notes.unshift(n);
      select(n.id);
      setTimeout(() => titleEl?.select(), 50);
    } catch (e) { toastErr(e); }
  }
  async function remove() {
    if (!cur || !await confirmBox('Xoá ghi chú?', `Xoá “${cur.title}”? Không thể hoàn tác.`)) return;
    try { await db.remove('notes', cur.id); logActivity(store.user, 'xoá ghi chú', cur.title); notes = notes.filter(n => n.id !== cur.id); cur = null; go(null); renderList(); renderEditor(); } catch (e) { toastErr(e); }
  }

  (async () => {
    try {
      notes = await db.select('notes', { eq: { folder_id: folder.id }, order: ['updated_at', false] });
      cur = notes.find(n => n.id === sub) || null;
      renderList(); renderEditor();
    } catch (e) { toastErr(e); }
  })();

  const off = db.subscribe('notes', ['folder_id', folder.id], (e) => {
    if (e.type === 'DELETE') {
      if (!notes.some(n => n.id === e.old.id)) return;
      notes = notes.filter(n => n.id !== e.old.id);
      if (cur?.id === e.old.id) { cur = null; renderEditor(); }
      renderList(); return;
    }
    const i = notes.findIndex(n => n.id === e.new.id);
    if (i >= 0) notes[i] = { ...notes[i], ...e.new }; else notes.unshift(e.new);
    notes.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    if (cur?.id === e.new.id) {
      cur = notes.find(n => n.id === e.new.id);
      if (e.new.updated_by !== store.user.id && !dirty && Date.now() - lastLocalType > 1500) { applyRemote(e.new.title, e.new.content); statusEl.textContent = `Lưu lúc ${fmtTime(e.new.updated_at)} bởi ${nameOf(e.new.updated_by)}`; }
    }
    renderList();
  });
  return () => { off(); room.close(); if (dirty) save.flush(); };
}
