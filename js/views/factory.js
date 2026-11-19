import db, { logActivity } from '../db.js';
import { store, productOf } from '../store.js';
import { h, fill, toast, toastErr, prompt, confirmBox, modal, popMenu, avatar, throttle } from '../ui.js';
import { MACHINE_FIELDS } from './templates.js';

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 });
const toNum = (v) => { if (v === '' || v == null) return null; if (typeof v === 'number') return v; const s = String(v).trim().replace(/\s/g, ''); const n = Number(/,\d{1,4}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/[.,](?=\d{3}(\D|$))/g, '')); return isNaN(n) ? null : n; };
const show = (f, v) => f.type === 'number' && toNum(v) != null ? nf.format(toNum(v)) : (v ?? '');
const brief = (m) => {
  if (!m) return 'Chưa liên kết dữ liệu máy';
  const c = m.cells || {};
  return [c.somau ? `${c.somau} màu` : null, c.ns ? `${show({ type: 'number' }, c.ns)} ${c.dv || ''}`.trim() : null].filter(Boolean).join(' · ') || c.congdoan || '—';
};

// Dùng chung: tải & theo dõi danh mục máy + cây nhà máy của sản phẩm
function factoryData(product, onChange) {
  const st = { nodes: [], machines: [] };
  const offs = [];
  (async () => {
    try {
      [st.nodes, st.machines] = await Promise.all([db.select('factory_nodes', { eq: { product_id: product.id } }), db.select('machines', { order: ['position', true] })]);
      onChange();
    } catch (e) { toastErr(e); }
  })();
  const apply = (list, e) => {
    if (e.type === 'DELETE') { const n = list.filter(x => x.id !== e.old.id); if (n.length === list.length) return list; return n; }
    const i = list.findIndex(x => x.id === e.new.id); if (i >= 0) list[i] = e.new; else list.push(e.new); return list;
  };
  offs.push(db.subscribe('factory_nodes', ['product_id', product.id], (e) => { st.nodes = apply(st.nodes, e); onChange(e); }));
  offs.push(db.subscribe('machines', null, (e) => { st.machines = apply(st.machines, e); onChange(e); }));
  st.close = () => offs.forEach(f => f());
  return st;
}
async function usedIn(machineId) {
  const nodes = await db.select('factory_nodes', { eq: { machine_id: machineId } });
  return nodes.map(n => `${productOf(n.product_id)?.name || '?'}`).filter((v, i, a) => a.indexOf(v) === i);
}

// =====================================================================
// SƠ ĐỒ NHÀ MÁY (cây: nhà máy → công đoạn → máy) + bảng dữ liệu máy bên phải
// =====================================================================
export function mountFactory(el, { product, sub, go }) {
  let sel = sub || null;
  const wrap = h('div', { class: 'factory' });
  const treeBox = h('div', { class: 'f-tree' });
  const panel = h('aside', { class: 'f-panel' });
  wrap.append(h('div', { class: 'f-left' },
    h('div', { class: 'toolbar' },
      h('p', { class: 'muted small', style: { margin: 0, flex: 1 } }, 'Quy trình sản xuất → từng công đoạn rẽ nhánh xuống thiết bị. Bấm một máy để xem và điền dữ liệu máy ở bên phải.'),
      h('button', { class: 'btn btn-sm', onclick: addStage }, '＋ Công đoạn')),
    treeBox), panel);
  el.append(wrap);
  const room = db.room(`factory-${product.id}`, (m) => { if (m.t === 'sel') { others.set(m.uid, m); renderTree(); } });
  const others = new Map();
  const st = factoryData(product, () => { renderTree(); renderPanel(); });

  const stages = () => st.nodes.filter(n => n.kind === 'stage').sort((a, b) => a.position - b.position);
  const kids = (sid) => st.nodes.filter(n => n.kind === 'machine' && n.parent_id === sid).sort((a, b) => a.position - b.position);
  const mOf = (node) => st.machines.find(m => m.id === node?.machine_id) || null;

  function renderTree() {
    const ss = stages();
    fill(treeBox,
      h('div', { class: 'f-root' }, h('span', { class: 'serif' }, `Nhà máy · ${product.name}`)),
      ss.length ? h('div', { class: 'f-stages' }, ss.map((s, si) => h('div', { class: 'f-stage' },
        h('div', { class: 'f-sn' }, h('span', { class: 'f-si' }, si + 1), h('b', { class: 'grow' }, s.name),
          h('button', { class: 'icon-btn', title: 'Tuỳ chọn công đoạn', onclick: (e) => stageMenu(s, si, e.currentTarget) }, '⋯')),
        h('div', { class: 'f-kids' },
          kids(s.id).map(n => {
            const who = [...others.values()].filter(o => o.nodeId === n.id && Date.now() - o.at < 60000);
            return h('button', { class: `f-mc ${sel === n.id ? 'sel' : ''} ${n.machine_id ? '' : 'nolink'}`, onclick: () => select(n.id) },
              h('b', {}, n.name), h('span', {}, brief(mOf(n))),
              who.length ? h('span', { class: 'f-who' }, who.map(o => avatar({ display_name: o.name, color: o.color }, 16))) : null);
          }),
          h('button', { class: 'f-mc add', onclick: () => addMachine(s) }, '＋ Thêm máy')))))
        : h('div', { class: 'empty', style: { marginTop: '24px' } }, 'Chưa có công đoạn. Bấm “＋ Công đoạn” để bắt đầu (VD: Chế bản, In, Gia công bề mặt, Thành phẩm).'));
  }

  function select(id) {
    sel = id; go(id); renderTree(); renderPanel();
    room.send({ t: 'sel', uid: store.user.id, name: store.me?.display_name, color: store.me?.color, nodeId: id, at: Date.now() });
  }

  function renderPanel() {
    const node = st.nodes.find(n => n.id === sel);
    if (!node) {
      const ss = stages();
      fill(panel, h('div', { class: 'f-ph serif' }, 'Dữ liệu máy'),
        h('p', { class: 'small muted' }, 'Chọn một máy trong sơ đồ để xem và điền thông số. Dữ liệu máy dùng chung cho cả 2 sản phẩm: sửa ở đây là cập nhật ở mọi nơi dùng máy đó.'),
        h('div', { class: 'f-sum' }, h('div', {}, h('b', {}, ss.length), h('span', {}, 'công đoạn')), h('div', {}, h('b', {}, st.nodes.filter(n => n.kind === 'machine').length), h('span', {}, 'máy')), h('div', {}, h('b', {}, st.machines.length), h('span', {}, 'máy trong danh mục'))),
        h('a', { class: 'btn btn-sm btn-block', href: `#/p/${product.id}/factory/machines` }, 'Mở bảng Dữ liệu máy'));
      return;
    }
    const m = mOf(node);
    const stage = st.nodes.find(n => n.id === node.parent_id);
    const head = h('div', { class: 'f-ph' }, h('span', { class: 'muted small' }, stage?.name || ''), h('div', { class: 'row' }, h('b', { class: 'serif grow', style: { fontSize: '18px' } }, node.name),
      h('button', { class: 'icon-btn', title: 'Tuỳ chọn', onclick: (e) => popMenu(e.currentTarget, [
        { icon: '⬆️', label: 'Lên trên', run: () => moveNode(node, -1) }, { icon: '⬇️', label: 'Xuống dưới', run: () => moveNode(node, 1) },
        { icon: '🔁', label: 'Liên kết máy khác trong danh mục', run: () => relink(node) },
        '-', { icon: '✕', label: 'Gỡ khỏi công đoạn', danger: true, run: async () => { if (await confirmBox('Gỡ máy?', `Gỡ “${node.name}” khỏi công đoạn ${stage?.name}? Dữ liệu máy trong danh mục vẫn giữ nguyên.`)) { await db.remove('factory_nodes', node.id).catch(toastErr); sel = null; go(null); renderPanel(); } } }]) }, '⋯')));
    if (!m) { fill(panel, head, h('p', { class: 'small muted' }, 'Máy này chưa liên kết với dữ liệu máy.'), h('button', { class: 'btn btn-sm btn-block', onclick: () => relink(node) }, 'Liên kết / tạo dữ liệu máy')); return; }
    const save = async (key, raw, f) => {
      let v = raw; if (f.type === 'number') v = toNum(raw) ?? (String(raw).trim() ? raw : '');
      if (String(v) === String(m.cells?.[key] ?? '')) return;
      const cells = { ...(m.cells || {}), [key]: v }; m.cells = cells;
      try { await db.update('machines', m.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() }); logActivity(store.user, `sửa ${f.label.toLowerCase()} của`, `${m.name} → ${show(f, v)}`); } catch (e) { toastErr(e); }
    };
    const usedBox = h('div', { class: 'small muted' });
    usedIn(m.id).then(list => { usedBox.textContent = 'Dùng trong: ' + (list.join(', ') || '—'); });
    fill(panel, head,
      h('div', { class: 'f-fields' }, MACHINE_FIELDS.map(f => {
        const v = m.cells?.[f.key];
        let input;
        if (f.type === 'select') input = h('select', { class: 'input', onchange: (e) => save(f.key, e.target.value, f) }, h('option', { value: '' }, ''), (f.options || []).map(o => h('option', { selected: v === o }, o)));
        else {
          input = h('input', { class: `input ${f.type === 'number' ? 'num' : ''}`, value: show(f, v) });
          input.addEventListener('focus', () => { input.value = v ?? ''; });
          input.addEventListener('blur', () => { save(f.key, input.value, f); input.value = show(f, m.cells?.[f.key]); });
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        }
        return h('label', { class: 'field' }, h('span', {}, f.label), input);
      })),
      usedBox,
      h('p', { class: 'small muted' }, `Cập nhật ${m.updated_at ? new Date(m.updated_at).toLocaleString('vi-VN') : ''}`));
  }

  // ---------- thao tác ----------
  async function addStage() {
    const name = await prompt('Thêm công đoạn', 'Tên công đoạn', '', 'VD: Gia công bề mặt');
    if (!name) return;
    try { await db.insert('factory_nodes', { product_id: product.id, parent_id: null, kind: 'stage', name, position: stages().length, updated_by: store.user.id }); logActivity(store.user, 'thêm công đoạn', name); } catch (e) { toastErr(e); }
  }
  function stageMenu(s, si, anchor) {
    const ss = stages();
    popMenu(anchor, [
      { icon: '✏️', label: 'Đổi tên', run: async () => { const n = await prompt('Đổi tên công đoạn', 'Tên', s.name); if (n) db.update('factory_nodes', s.id, { name: n }).catch(toastErr); } },
      { icon: '⬅️', label: 'Sang trái', run: () => swap(ss, si, si - 1) },
      { icon: '➡️', label: 'Sang phải', run: () => swap(ss, si, si + 1) },
      '-',
      { icon: '🗑️', label: 'Xoá công đoạn', danger: true, run: async () => { if (await confirmBox('Xoá công đoạn?', `Xoá “${s.name}” và các máy bên dưới khỏi sơ đồ? (Dữ liệu máy trong danh mục vẫn giữ.)`)) { for (const k of kids(s.id)) await db.remove('factory_nodes', k.id).catch(() => {}); await db.remove('factory_nodes', s.id).catch(toastErr); } } },
    ]);
  }
  async function swap(list, i, j) {
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((x, k) => x.position !== k ? db.update('factory_nodes', x.id, { position: k }) : null)).catch(toastErr);
  }
  async function moveNode(node, dir) { const list = kids(node.parent_id); const i = list.findIndex(x => x.id === node.id); await swap(list, i, i + dir); }
  async function pickMachine(title, exclude = []) {
    const opts = st.machines.filter(m => !exclude.includes(m.id));
    const sel = h('select', { class: 'input' }, h('option', { value: '' }, '— Chọn từ danh mục máy —'), opts.map(m => h('option', { value: m.id }, `${m.name} · ${m.cells?.congdoan || ''}`)));
    const name = h('input', { class: 'input', placeholder: 'VD: Máy cán gân CG1' });
    const r = await modal(title, h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Chọn máy có sẵn'), sel), h('div', { class: 'small muted', style: { margin: '-4px 0 10px' } }, 'hoặc'), h('label', { class: 'field' }, h('span', {}, 'Tạo máy mới (thêm vào danh mục)'), name)), [{ label: 'Huỷ', value: null }, { label: 'Thêm', value: 'ok', primary: true }]);
    if (r !== 'ok') return null;
    if (sel.value) return st.machines.find(m => m.id === sel.value);
    if (name.value.trim()) {
      const m = await db.insert('machines', { name: name.value.trim(), cells: { nguon: 'Giả định' }, position: st.machines.length, updated_by: store.user.id });
      if (!st.machines.some(x => x.id === m.id)) st.machines.push(m);
      return m;
    }
    return null;
  }
  async function addMachine(s) {
    try {
      const m = await pickMachine(`Thêm máy vào “${s.name}”`, kids(s.id).map(k => k.machine_id));
      if (!m) return;
      const n = await db.insert('factory_nodes', { product_id: product.id, parent_id: s.id, kind: 'machine', name: m.name, machine_id: m.id, position: kids(s.id).length, updated_by: store.user.id });
      logActivity(store.user, `thêm máy vào ${s.name}:`, m.name);
      if (!st.nodes.some(x => x.id === n.id)) st.nodes.push(n);
      select(n.id);
    } catch (e) { toastErr(e); }
  }
  async function relink(node) {
    try { const m = await pickMachine('Liên kết dữ liệu máy'); if (m) await db.update('factory_nodes', node.id, { machine_id: m.id, name: m.name }); } catch (e) { toastErr(e); }
  }

  return () => { st.close(); room.close(); };
}

// =====================================================================
// BẢNG DỮ LIỆU MÁY (danh mục dùng chung)
// =====================================================================
export function mountMachines(el, { product }) {
  let onlyThis = false;
  const wrap = h('div', { class: 'dt-wrap' });
  const tools = h('div', { class: 'toolbar' });
  const box = h('div');
  wrap.append(tools, box);
  el.append(wrap);
  const st = factoryData(product, () => { if (!box.contains(document.activeElement)) render(); });
  const usedHere = () => new Set(st.nodes.filter(n => n.kind === 'machine').map(n => n.machine_id));

  function render() {
    const here = usedHere();
    const list = st.machines.filter(m => !onlyThis || here.has(m.id)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    fill(tools,
      h('p', { class: 'muted small', style: { margin: 0, flex: 1 } }, `Danh mục ${st.machines.length} máy dùng chung cho cả nhóm (trích CSDL thiết bị + máy bổ sung). Máy có dấu ● đang dùng trong sơ đồ nhà máy ${product.name}.`),
      h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: onlyThis, onchange: (e) => { onlyThis = e.target.checked; render(); } }), `Chỉ máy của ${product.name}`),
      h('button', { class: 'btn btn-sm', onclick: addRow }, '＋ Máy mới'));
    const cols = [{ key: '_name', label: 'Máy', type: 'text', width: 150 }, ...MACHINE_FIELDS];
    fill(box, h('div', { class: 'grid-scroll' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', { class: 'idx' }, ''), cols.map(c => h('th', { style: { minWidth: (c.key === 'congdoan' ? 120 : c.type === 'number' ? 96 : 110) + 'px' } }, h('div', { class: 'th' }, h('span', {}, c.label)))), h('th'))),
      h('tbody', {}, list.map(m => h('tr', { 'data-row': m.id },
        h('td', { class: 'idx', title: here.has(m.id) ? 'Đang dùng trong sơ đồ' : '' }, here.has(m.id) ? h('span', { style: { color: 'var(--rd)' } }, '●') : ''),
        cols.map(c => cell(m, c)),
        h('td', { style: { textAlign: 'center' } }, h('button', { class: 'icon-btn row-del', title: 'Xoá máy', onclick: () => del(m) }, '✕'))))))));
  }
  function cell(m, c) {
    const v = c.key === '_name' ? m.name : m.cells?.[c.key];
    const td = h('td', { class: c.type === 'number' ? 'num' : '' });
    if (c.type === 'select') { td.append(h('select', { class: 'cell', onchange: (e) => save(m, c, e.target.value) }, h('option', { value: '' }, ''), (c.options || []).map(o => h('option', { selected: v === o }, o)))); return td; }
    const div = h('div', { class: 'cell', contenteditable: 'plaintext-only', spellcheck: false }, show(c, v));
    div.addEventListener('focus', () => { div.textContent = v ?? ''; });
    div.addEventListener('blur', () => { save(m, c, div.textContent.trim()); });
    div.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); div.blur(); } if (e.key === 'Escape') { div.textContent = v ?? ''; div.blur(); } });
    if (c.key === '_name') div.style.fontWeight = '600';
    td.append(div); return td;
  }
  async function save(m, c, raw) {
    try {
      if (c.key === '_name') { if (raw && raw !== m.name) { await db.update('machines', m.id, { name: raw }); for (const n of st.nodes.filter(n => n.machine_id === m.id)) await db.update('factory_nodes', n.id, { name: raw }); } return; }
      let v = raw; if (c.type === 'number') v = toNum(raw) ?? raw;
      if (String(v ?? '') === String(m.cells?.[c.key] ?? '')) { render(); return; }
      const cells = { ...(m.cells || {}), [c.key]: v }; m.cells = cells;
      await db.update('machines', m.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() });
    } catch (e) { toastErr(e); }
    if (!box.contains(document.activeElement)) render();
  }
  async function addRow() {
    const name = await prompt('Máy mới', 'Tên máy', '', 'VD: Máy cán gân CG1');
    if (!name) return;
    try { const m = await db.insert('machines', { name, cells: { nguon: 'Giả định' }, position: st.machines.length, updated_by: store.user.id }); if (!st.machines.some(x => x.id === m.id)) st.machines.push(m); render(); logActivity(store.user, 'thêm máy vào danh mục', name); } catch (e) { toastErr(e); }
  }
  async function del(m) {
    const used = await usedIn(m.id);
    if (!await confirmBox('Xoá máy khỏi danh mục?', used.length ? `“${m.name}” đang dùng trong sơ đồ: ${used.join(', ')}. Xoá sẽ gỡ máy khỏi các sơ đồ đó.` : `Xoá “${m.name}”?`)) return;
    try { await db.remove('machines', m.id); toast('Đã xoá', 'ok'); } catch (e) { toastErr(e); }
  }
  return () => st.close();
}
