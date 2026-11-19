// =====================================================================
// 1. PHƯƠNG ÁN NHÀ MÁY – chung cho cả công ty (Hộp và Sách dùng chung)
// Cây: Nhà máy → Khâu → Công đoạn (Chung / Hộp / Sách) → Máy. Bấm máy → điền thông số bên phải.
// =====================================================================
import db, { logActivity } from '../db.js';
import { store, on, jsonSetting, productOf } from '../store.js';
import { h, fill, toast, toastErr, prompt, confirmBox, modal, popMenu, avatar } from '../ui.js';
import { MACHINE_COLUMNS, PHASES, LINES, EFFECTS } from './templates.js';
import { parseNum, fmtValue } from '../formula.js';

const show = (c, v) => fmtValue(c.type === 'number' ? (parseNum(v) ?? v) : v, c);
export const machineCols = () => jsonSetting('machine_columns', MACHINE_COLUMNS);
const brief = (m) => {
  if (!m) return 'Chưa liên kết dữ liệu máy';
  const c = m.cells || {};
  return [c.somau ? `${c.somau} màu` : null, c.ns ? `${show({ type: 'number' }, c.ns)} ${c.dv || ''}`.trim() : null].filter(Boolean).join(' · ') || '—';
};
const keyOf = (label, cols) => { let k = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'ts'; let i = 2; const b = k; while (cols.some(c => c.key === k)) k = b + i++; return k; };

// Dữ liệu dùng chung: cây nhà máy + máy + phương án SX (để biết máy nào sản phẩm nào dùng)
export function factoryData(onChange) {
  const st = { nodes: [], machines: [], plans: [] };
  const offs = [];
  (async () => {
    try { [st.nodes, st.machines, st.plans] = await Promise.all([db.select('factory_nodes'), db.select('machines', { order: ['position', true] }), db.select('product_plans')]); onChange(); }
    catch (e) { toastErr(e); }
  })();
  const apply = (key, e) => {
    const list = st[key];
    if (e.type === 'DELETE') { if (!list.some(x => x.id === e.old.id)) return false; st[key] = list.filter(x => x.id !== e.old.id); return true; }
    const i = list.findIndex(x => x.id === e.new.id); if (i >= 0) list[i] = e.new; else list.push(e.new); return true;
  };
  offs.push(db.subscribe('factory_nodes', null, (e) => apply('nodes', e) && onChange(e)));
  offs.push(db.subscribe('machines', null, (e) => apply('machines', e) && onChange(e)));
  offs.push(db.subscribe('product_plans', null, (e) => apply('plans', e) && onChange(e)));
  offs.push(on('settings', () => onChange()));
  st.stages = () => st.nodes.filter(n => n.kind === 'stage').sort((a, b) => a.position - b.position);
  st.kids = (sid) => st.nodes.filter(n => n.kind === 'machine' && n.parent_id === sid).sort((a, b) => a.position - b.position);
  st.machine = (id) => st.machines.find(m => m.id === id) || null;
  st.phases = () => { const ps = [...PHASES]; st.stages().forEach(s => { if (s.phase && !ps.includes(s.phase)) ps.push(s.phase); }); return ps; };
  // sản phẩm nào đang dùng máy / công đoạn (theo phương án sản xuất)
  st.usedBy = (machineId) => st.plans.filter(p => Object.values(p.steps || {}).some(x => x.on && (x.machines || []).includes(machineId)) || (p.print || []).some(x => x.machine_id === machineId)).map(p => productOf(p.product_id)).filter(Boolean);
  st.stageUsedBy = (stageId) => st.plans.filter(p => p.steps?.[stageId]?.on).map(p => productOf(p.product_id)).filter(Boolean);
  st.close = () => offs.forEach(f => f());
  return st;
}

// =====================================================================
// SƠ ĐỒ NHÀ MÁY
// readOnly: Trang xem (chỉ xem, tô đậm công đoạn / máy sản phẩm đang dùng)
// =====================================================================
export function mountFactoryTree(el, { product, sub, go, readOnly = false }) {
  let sel = sub || null;
  let line = 'all';
  const wrap = h('div', { class: `factory ${readOnly ? 'ro' : ''}` });
  const treeBox = h('div', { class: 'f-tree2' });
  const panel = h('aside', { class: 'f-panel' });
  const bar = h('div', { class: 'toolbar' });
  wrap.append(h('div', { class: 'f-left' }, bar, treeBox), panel);
  el.append(wrap);
  const room = db.room('factory-company', (m) => { if (m.t === 'sel') { others.set(m.uid, m); renderTree(); } });
  const others = new Map();
  const st = factoryData(() => { renderBar(); renderTree(); if (!panel.contains(document.activeElement)) renderPanel(); });
  const mineIds = () => new Set(st.plans.find(p => p.product_id === product.id) ? Object.entries(st.plans.find(p => p.product_id === product.id).steps || {}).filter(([, x]) => x.on).map(([k]) => k) : []);
  const myMachines = () => { const p = st.plans.find(x => x.product_id === product.id); const s = new Set(); Object.values(p?.steps || {}).forEach(x => x.on && (x.machines || []).forEach(m => s.add(m))); return s; };

  function renderBar() {
    const chip = (k, label) => h('button', { class: `chip ${line === k ? 'on' : ''}`, onclick: () => { line = k; renderBar(); renderTree(); } }, label);
    fill(bar,
      h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, h('span', { class: 'small muted', style: { fontWeight: 700 } }, 'Hiện:'),
        chip('all', 'Toàn bộ công ty'), chip('hop', 'Quy trình Hộp'), chip('sach', 'Quy trình Sách'), readOnly ? chip('mine', `${product.name} đi qua`) : null),
      h('div', { class: 'grow' }),
      readOnly ? h('span', { class: 'small muted' }, 'Ô đậm = công đoạn / máy ', h('b', {}, product.name), ' dùng (theo mục 3)') : h('button', { class: 'btn btn-sm', onclick: () => addStage() }, '＋ Công đoạn'));
  }
  const visible = (s) => line === 'all' ? true : line === 'mine' ? mineIds().has(s.id) : (s.line === 'chung' || s.line === line);

  function renderTree() {
    const mine = mineIds(), myM = myMachines();
    const phases = st.phases().map(ph => [ph, st.stages().filter(s => (s.phase || PHASES[0]) === ph && visible(s))]).filter(([, ss]) => ss.length || (!readOnly && line === 'all'));
    let n = 0;
    fill(treeBox,
      h('div', { class: 'f-root2' }, h('span', { class: 'serif' }, 'Nhà máy in · Công ty giả định'), h('small', {}, 'Phương án nhà máy chung cho Hộp và Sách')),
      phases.length ? phases.map(([ph, ss]) => h('section', { class: 'f-phase' },
        h('div', { class: 'f-phead' }, h('b', { class: 'serif' }, ph), h('span', { class: 'small muted' }, `${ss.length} công đoạn`),
          !readOnly ? h('button', { class: 'icon-btn', title: 'Thêm công đoạn vào khâu này', onclick: () => addStage(ph) }, '＋') : null),
        h('div', { class: 'f-row' }, ss.map(s => {
          const i = ++n;
          const used = st.stageUsedBy(s.id);
          return h('div', { class: `f-st ${readOnly && mine.has(s.id) ? 'mine' : ''} ${readOnly && !mine.has(s.id) ? 'dim' : ''}` },
            h('div', { class: 'f-sn' }, h('span', { class: 'f-si' }, i), h('b', { class: 'grow' }, s.name),
              !readOnly ? h('button', { class: 'icon-btn', title: 'Tuỳ chọn công đoạn', onclick: (e) => stageMenu(s, e.currentTarget) }, '⋯') : null),
            h('div', { class: 'f-tags' }, h('span', { class: `ln ln-${s.line || 'chung'}` }, LINES[s.line || 'chung']),
              s.tag && EFFECTS.some(e => e.tag === s.tag) ? h('span', { class: 'ln fx', title: 'Tự chọn khi tích hiệu ứng ở mục 3' }, 'theo hiệu ứng') : null,
              used.map(p => h('span', { class: 'ln use', title: `${p.name} đi qua công đoạn này` }, '● ' + p.name))),
            h('div', { class: 'f-kids' },
              st.kids(s.id).map(nd => {
                const m = st.machine(nd.machine_id);
                const who = [...others.values()].filter(o => o.nodeId === nd.id && Date.now() - o.at < 60000);
                return h('button', { class: `f-mc ${sel === nd.id ? 'sel' : ''} ${nd.machine_id ? '' : 'nolink'} ${readOnly && myM.has(nd.machine_id) ? 'mine' : ''}`, onclick: () => select(nd.id) },
                  h('b', {}, nd.name), h('span', {}, brief(m)),
                  who.length ? h('span', { class: 'f-who' }, who.map(o => avatar({ display_name: o.name, color: o.color }, 16))) : null);
              }),
              !st.kids(s.id).length ? h('div', { class: 'f-none' }, 'Chưa có máy trong CSDL') : null,
              !readOnly ? h('button', { class: 'f-mc add', onclick: () => addMachine(s) }, '＋ Thêm máy') : null));
        })))) : h('div', { class: 'empty', style: { marginTop: '18px' } }, line === 'mine' ? `Chưa chọn công đoạn nào cho ${product.name}. Vào Cơ sở dữ liệu › 3. Phương án sản xuất để tích quy trình.` : 'Chưa có công đoạn.'));
  }

  function select(id) {
    sel = id; go?.(id); renderTree(); renderPanel();
    room.send({ t: 'sel', uid: store.user.id, name: store.me?.display_name, color: store.me?.color, nodeId: id, at: Date.now() });
  }

  function renderPanel() {
    const node = st.nodes.find(n => n.id === sel);
    const cols = machineCols();
    if (!node) {
      fill(panel, h('div', { class: 'f-ph serif' }, 'Dữ liệu máy'),
        h('p', { class: 'small muted' }, readOnly ? 'Bấm một máy để xem thông số.' : 'Bấm một máy để điền thông số. Máy dùng chung cho cả 2 sản phẩm – sửa ở đây là cập nhật mọi nơi dùng máy đó.'),
        h('div', { class: 'f-sum' }, h('div', {}, h('b', {}, st.stages().length), h('span', {}, 'công đoạn')), h('div', {}, h('b', {}, st.nodes.filter(n => n.kind === 'machine').length), h('span', {}, 'máy trên sơ đồ')), h('div', {}, h('b', {}, cols.length), h('span', {}, 'thông số / máy'))));
      return;
    }
    const m = st.machine(node.machine_id);
    const stage = st.nodes.find(n => n.id === node.parent_id);
    const head = h('div', { class: 'f-ph' }, h('span', { class: 'muted small' }, `${stage?.phase || ''} › ${stage?.name || ''}`), h('div', { class: 'row' }, h('b', { class: 'serif grow', style: { fontSize: '18px' } }, node.name),
      !readOnly ? h('button', { class: 'icon-btn', title: 'Tuỳ chọn', onclick: (e) => popMenu(e.currentTarget, [
        { icon: '⬆️', label: 'Lên trên', run: () => moveNode(node, -1) }, { icon: '⬇️', label: 'Xuống dưới', run: () => moveNode(node, 1) },
        { icon: '🔁', label: 'Liên kết máy khác trong danh mục', run: () => relink(node) },
        '-', { icon: '✕', label: 'Gỡ khỏi công đoạn', danger: true, run: async () => { if (await confirmBox('Gỡ máy?', `Gỡ “${node.name}” khỏi công đoạn ${stage?.name}? Dữ liệu máy trong bảng thiết bị vẫn giữ.`)) { await db.remove('factory_nodes', node.id).catch(toastErr); sel = null; go?.(null); renderPanel(); } } }]) }, '⋯') : null));
    if (!m) { fill(panel, head, h('p', { class: 'small muted' }, 'Máy này chưa liên kết với dữ liệu máy.'), !readOnly ? h('button', { class: 'btn btn-sm btn-block', onclick: () => relink(node) }, 'Liên kết / tạo dữ liệu máy') : null); return; }
    const used = st.usedBy(m.id);
    const save = async (c, raw) => {
      let v = raw; if (c.type === 'number') v = parseNum(raw) ?? (String(raw).trim() ? raw : '');
      if (String(v) === String(m.cells?.[c.key] ?? '')) return;
      const cells = { ...(m.cells || {}), [c.key]: v }; m.cells = cells;
      try { await db.update('machines', m.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() }); logActivity(store.user, `sửa ${c.label.toLowerCase()} của`, `${m.name} → ${show(c, v)}`); } catch (e) { toastErr(e); }
    };
    fill(panel, head,
      h('div', { class: 'small', style: { margin: '-4px 0 10px' } }, 'Đang dùng: ', used.length ? used.map(p => h('span', { class: 'ln use' }, p.name)) : h('span', { class: 'muted' }, 'chưa sản phẩm nào chọn')),
      h('div', { class: 'f-fields' }, cols.map(c => {
        const v = m.cells?.[c.key];
        if (readOnly) return h('div', { class: 'field ro' }, h('span', {}, c.label), h('div', { class: `ro-v ${c.type === 'number' ? 'num' : ''}` }, show(c, v) || '—'));
        let input;
        if (c.type === 'select') input = h('select', { class: 'input', onchange: (e) => save(c, e.target.value) }, h('option', { value: '' }, ''), (c.options || []).map(o => h('option', { selected: v === o }, o)));
        else {
          input = h('input', { class: `input ${c.type === 'number' ? 'num' : ''}`, value: show(c, v) });
          input.addEventListener('focus', () => { input.value = v ?? ''; });
          input.addEventListener('blur', () => { save(c, input.value); input.value = show(c, m.cells?.[c.key]); });
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        }
        return h('label', { class: 'field' }, h('span', {}, c.label), input);
      })),
      !readOnly ? h('button', { class: 'btn btn-sm btn-block', onclick: () => addParam() }, '＋ Thêm thông số cho tất cả máy') : null,
      h('p', { class: 'small muted' }, `Cập nhật ${m.updated_at ? new Date(m.updated_at).toLocaleString('vi-VN') : ''}`));
  }

  // ---------- thao tác ----------
  async function addStage(phase) {
    const name = h('input', { class: 'input', placeholder: 'VD: Cán gân' });
    const ph = h('select', { class: 'select' }, st.phases().map(p => h('option', { selected: p === phase }, p)), h('option', { value: '__new' }, '＋ Khâu mới…'));
    const ln = h('select', { class: 'select' }, Object.entries(LINES).map(([k, v]) => h('option', { value: k }, v)));
    const r = await modal('Thêm công đoạn', h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Tên công đoạn'), name), h('label', { class: 'field' }, h('span', {}, 'Thuộc khâu'), ph), h('label', { class: 'field' }, h('span', {}, 'Dùng cho dòng sản phẩm'), ln)), [{ label: 'Huỷ', value: null }, { label: 'Thêm', value: 'ok', primary: true }]);
    if (r !== 'ok' || !name.value.trim()) return;
    let phaseName = ph.value;
    if (phaseName === '__new') { phaseName = await prompt('Khâu mới', 'Tên khâu', '', 'VD: Hoàn thiện'); if (!phaseName) return; }
    try { await db.insert('factory_nodes', { product_id: null, parent_id: null, kind: 'stage', name: name.value.trim(), phase: phaseName, line: ln.value, tag: '', position: st.stages().length, updated_by: store.user.id }); logActivity(store.user, 'thêm công đoạn', name.value.trim()); } catch (e) { toastErr(e); }
  }
  function stageMenu(s, anchor) {
    const same = st.stages();
    const i = same.findIndex(x => x.id === s.id);
    popMenu(anchor, [
      { icon: '✏️', label: 'Đổi tên', run: async () => { const n = await prompt('Đổi tên công đoạn', 'Tên', s.name); if (n) db.update('factory_nodes', s.id, { name: n }).catch(toastErr); } },
      { icon: '🏷️', label: `Dòng sản phẩm: ${LINES[s.line || 'chung']} → đổi`, run: async () => {
        const sel2 = h('select', { class: 'select' }, Object.entries(LINES).map(([k, v]) => h('option', { value: k, selected: (s.line || 'chung') === k }, v)));
        if (await modal('Công đoạn dùng cho', sel2, [{ label: 'Huỷ', value: null }, { label: 'Lưu', value: 'ok', primary: true }]) === 'ok') db.update('factory_nodes', s.id, { line: sel2.value }).catch(toastErr);
      } },
      { icon: '📦', label: 'Chuyển sang khâu khác', run: async () => {
        const sel2 = h('select', { class: 'select' }, st.phases().map(p => h('option', { selected: p === s.phase }, p)));
        if (await modal('Chuyển khâu', sel2, [{ label: 'Huỷ', value: null }, { label: 'Lưu', value: 'ok', primary: true }]) === 'ok') db.update('factory_nodes', s.id, { phase: sel2.value }).catch(toastErr);
      } },
      { icon: '⬅️', label: 'Lên trước', run: () => swap(same, i, i - 1) },
      { icon: '➡️', label: 'Ra sau', run: () => swap(same, i, i + 1) },
      '-',
      { icon: '🗑️', label: 'Xoá công đoạn', danger: true, run: async () => { if (await confirmBox('Xoá công đoạn?', `Xoá “${s.name}” và các máy bên dưới khỏi sơ đồ? (Dữ liệu máy trong bảng thiết bị vẫn giữ.)`)) { for (const k of st.kids(s.id)) await db.remove('factory_nodes', k.id).catch(() => {}); await db.remove('factory_nodes', s.id).catch(toastErr); } } },
    ]);
  }
  async function swap(list, i, j) {
    if (j < 0 || j >= list.length) return;
    const a = [...list]; [a[i], a[j]] = [a[j], a[i]];
    await Promise.all(a.map((x, k) => x.position !== k ? db.update('factory_nodes', x.id, { position: k }) : null)).catch(toastErr);
  }
  async function moveNode(node, dir) { const list = st.kids(node.parent_id); const i = list.findIndex(x => x.id === node.id); await swap(list, i, i + dir); }
  async function pickMachine(title, exclude = []) {
    const opts = st.machines.filter(m => !exclude.includes(m.id));
    const s = h('select', { class: 'input' }, h('option', { value: '' }, '— Chọn từ bảng thiết bị —'), opts.map(m => h('option', { value: m.id }, m.name)));
    const name = h('input', { class: 'input', placeholder: 'VD: Máy dập nổi DN1' });
    const r = await modal(title, h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Chọn máy có sẵn'), s), h('div', { class: 'small muted', style: { margin: '-4px 0 10px' } }, 'hoặc'), h('label', { class: 'field' }, h('span', {}, 'Tạo máy mới (thêm vào bảng thiết bị)'), name)), [{ label: 'Huỷ', value: null }, { label: 'Thêm', value: 'ok', primary: true }]);
    if (r !== 'ok') return null;
    if (s.value) return st.machine(s.value);
    if (name.value.trim()) { const m = await db.insert('machines', { name: name.value.trim(), cells: { nguon: 'Giả định' }, position: st.machines.length, updated_by: store.user.id }); if (!st.machines.some(x => x.id === m.id)) st.machines.push(m); return m; }
    return null;
  }
  async function addMachine(s) {
    try {
      const m = await pickMachine(`Thêm máy vào “${s.name}”`, st.kids(s.id).map(k => k.machine_id));
      if (!m) return;
      const n = await db.insert('factory_nodes', { product_id: null, parent_id: s.id, kind: 'machine', name: m.name, machine_id: m.id, position: st.kids(s.id).length, updated_by: store.user.id });
      logActivity(store.user, `thêm máy vào ${s.name}:`, m.name);
      if (!st.nodes.some(x => x.id === n.id)) st.nodes.push(n);
      select(n.id);
    } catch (e) { toastErr(e); }
  }
  async function relink(node) { try { const m = await pickMachine('Liên kết dữ liệu máy'); if (m) await db.update('factory_nodes', node.id, { machine_id: m.id, name: m.name }); } catch (e) { toastErr(e); } }

  renderBar();
  return () => { st.close(); room.close(); };
}

// Thêm một thông số (cột) cho tất cả máy
export async function addParam() {
  const cols = machineCols();
  const label = h('input', { class: 'input', placeholder: 'VD: Độ dày giấy max (mm)' });
  const type = h('select', { class: 'select' }, h('option', { value: 'number' }, 'Số'), h('option', { value: 'text' }, 'Văn bản'));
  const r = await modal('Thêm thông số máy', h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Tên thông số'), label), h('label', { class: 'field' }, h('span', {}, 'Kiểu'), type), h('p', { class: 'small muted' }, 'Thông số mới xuất hiện cho mọi máy trong bảng thiết bị.')), [{ label: 'Huỷ', value: null }, { label: 'Thêm', value: 'ok', primary: true }]);
  if (r !== 'ok' || !label.value.trim()) return;
  await saveMachineCols([...cols, { key: keyOf(label.value, cols), label: label.value.trim(), type: type.value }]);
  logActivity(store.user, 'thêm thông số máy', label.value.trim());
}
async function saveMachineCols(cols) {
  const value = JSON.stringify(cols);
  try {
    if (await db.get('settings', 'machine_columns')) await db.update('settings', 'machine_columns', { value, updated_by: store.user.id, updated_at: new Date().toISOString() });
    else await db.insert('settings', { id: 'machine_columns', value, updated_by: store.user.id });
    store.settings.set('machine_columns', value);
  } catch (e) { toastErr(e); }
}

// =====================================================================
// BẢNG THIẾT BỊ – xoay được: máy theo hàng (mỗi dòng một máy) hoặc máy theo cột
// =====================================================================
export function mountMachineTable(el, { readOnly = false } = {}) {
  let byCol = false, filter = '';
  const wrap = h('div', { class: readOnly ? '' : 'dt-wrap' });
  const tools = h('div', { class: 'toolbar' });
  const box = h('div');
  wrap.append(tools, box); el.append(wrap);
  const st = factoryData(() => { if (!box.contains(document.activeElement)) render(); });
  const stageOf = (mId) => { const n = st.nodes.find(x => x.kind === 'machine' && x.machine_id === mId); return n ? st.nodes.find(s => s.id === n.parent_id)?.name || '' : ''; };

  function render() {
    const cols = machineCols();
    const list = st.machines.filter(m => !filter || (m.name + ' ' + stageOf(m.id)).toLowerCase().includes(filter)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    fill(tools,
      h('input', { class: 'input', style: { width: '220px' }, placeholder: 'Lọc theo tên máy / công đoạn…', value: filter, oninput: (e) => { filter = e.target.value.toLowerCase(); render(); e.target.focus(); e.target.setSelectionRange(e.target.value.length, e.target.value.length); } }),
      h('div', { class: 'seg' }, h('button', { class: !byCol ? 'on' : '', onclick: () => { byCol = false; render(); } }, '☰ Máy theo hàng'), h('button', { class: byCol ? 'on' : '', onclick: () => { byCol = true; render(); } }, '▥ Máy theo cột')),
      h('span', { class: 'small muted' }, `${st.machines.length} máy · ${cols.length} thông số`),
      h('div', { class: 'grow' }),
      !readOnly ? h('button', { class: 'btn btn-sm', onclick: addRow }, '＋ Máy') : null,
      !readOnly ? h('button', { class: 'btn btn-sm', onclick: addParam }, '＋ Thông số') : null);
    const usedTag = (m) => { const u = st.usedBy(m.id); return u.length ? h('span', { class: 'small', style: { color: 'var(--rd)', marginLeft: '4px' }, title: 'Đang dùng: ' + u.map(p => p.name).join(', ') }, '●') : null; };
    const stageCol = { key: '_stage', label: 'Công đoạn', type: 'text' };
    if (!byCol) {
      const cs = [{ key: '_name', label: 'Máy', type: 'text' }, stageCol, ...cols];
      const headCell = (c, i) => h('th', { style: { minWidth: (i === 0 ? 150 : c.type === 'number' ? 100 : 120) + 'px' } },
        h('div', { class: 'th' }, h('span', {}, c.label), i > 1 && !readOnly && !MACHINE_COLUMNS.some(x => x.key === c.key) ? h('button', { class: 'icon-btn', title: 'Xoá thông số', onclick: () => delParam(c) }, '✕') : null));
      const delCell = (m) => readOnly ? null : h('td', { style: { textAlign: 'center' } }, h('button', { class: 'icon-btn row-del', title: 'Xoá máy', onclick: () => del(m) }, '✕'));
      const thead = h('thead', {}, h('tr', {}, cs.map(headCell), readOnly ? null : h('th')));
      const tbody = h('tbody', {}, list.map(m => h('tr', {}, cs.map(c => cell(m, c, c.key === '_name' ? usedTag(m) : null)), delCell(m))));
      fill(box, h('div', { class: 'grid-scroll' }, h('table', { class: 'grid' }, thead, tbody)));
    } else {
      const fields = [stageCol, ...cols];
      const thead = h('thead', {}, h('tr', {}, h('th', { style: { minWidth: '200px' } }, h('div', { class: 'th' }, 'Thông số ↓ · Máy →')), list.map(m => h('th', { style: { minWidth: '120px' } }, h('div', { class: 'th' }, cellName(m), usedTag(m))))));
      const tbody = h('tbody', {}, fields.map(c => h('tr', {}, h('td', { class: 'rowhead' }, h('div', { class: 'cell' }, c.label)), list.map(m => cell(m, c)))));
      fill(box, h('div', { class: 'grid-scroll' }, h('table', { class: 'grid' }, thead, tbody)));
    }
  }
  function cellName(m) {
    if (readOnly) return h('b', {}, m.name);
    const d = h('div', { class: 'cell', contenteditable: 'plaintext-only', spellcheck: false, style: { fontWeight: 700, padding: 0 } }, m.name);
    d.addEventListener('blur', () => save(m, { key: '_name' }, d.textContent.trim()));
    d.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); d.blur(); } });
    return d;
  }
  function cell(m, c, extra) {
    if (c.key === '_stage') return h('td', { class: 'muted' }, h('div', { class: 'cell small' }, stageOf(m.id) || '—'));
    const v = c.key === '_name' ? m.name : m.cells?.[c.key];
    const td = h('td', { class: c.type === 'number' ? 'num' : '' });
    if (readOnly) { td.append(h('div', { class: 'cell' }, c.key === '_name' ? h('b', {}, v) : show(c, v), extra)); return td; }
    if (c.type === 'select') { td.append(h('select', { class: 'cell', onchange: (e) => save(m, c, e.target.value) }, h('option', { value: '' }, ''), (c.options || []).map(o => h('option', { selected: v === o }, o)))); return td; }
    const div = h('div', { class: 'cell', contenteditable: 'plaintext-only', spellcheck: false }, c.key === '_name' ? v : show(c, v));
    div.addEventListener('focus', () => { div.textContent = v ?? ''; });
    div.addEventListener('blur', () => save(m, c, div.textContent.trim()));
    div.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); div.blur(); } if (e.key === 'Escape') { div.textContent = v ?? ''; div.blur(); } });
    if (c.key === '_name') div.style.fontWeight = '600';
    td.append(div); if (extra) td.append(extra); return td;
  }
  async function save(m, c, raw) {
    try {
      if (c.key === '_name') { if (raw && raw !== m.name) { await db.update('machines', m.id, { name: raw }); for (const n of st.nodes.filter(n => n.machine_id === m.id)) await db.update('factory_nodes', n.id, { name: raw }); } else render(); return; }
      let v = raw; if (c.type === 'number') v = parseNum(raw) ?? raw;
      if (String(v ?? '') === String(m.cells?.[c.key] ?? '')) { render(); return; }
      const cells = { ...(m.cells || {}), [c.key]: v }; m.cells = cells;
      await db.update('machines', m.id, { cells, updated_by: store.user.id, updated_at: new Date().toISOString() });
    } catch (e) { toastErr(e); }
    if (!box.contains(document.activeElement)) render();
  }
  async function addRow() {
    const name = await prompt('Máy mới', 'Tên máy', '', 'VD: Máy dập nổi DN1');
    if (!name) return;
    try { const m = await db.insert('machines', { name, cells: { nguon: 'Giả định' }, position: st.machines.length, updated_by: store.user.id }); if (!st.machines.some(x => x.id === m.id)) st.machines.push(m); render(); logActivity(store.user, 'thêm máy vào bảng thiết bị', name); toast('Đã thêm máy. Gắn máy vào công đoạn ở tab “Sơ đồ nhà máy”.', 'ok'); } catch (e) { toastErr(e); }
  }
  async function delParam(c) { if (await confirmBox('Xoá thông số?', `Xoá thông số “${c.label}” khỏi bảng thiết bị?`)) await saveMachineCols(machineCols().filter(x => x.key !== c.key)); }
  async function del(m) {
    const used = st.nodes.filter(n => n.machine_id === m.id).length;
    if (!await confirmBox('Xoá máy?', used ? `“${m.name}” đang nằm trên sơ đồ nhà máy. Xoá sẽ gỡ máy khỏi sơ đồ.` : `Xoá “${m.name}”?`)) return;
    try { await db.remove('machines', m.id); toast('Đã xoá', 'ok'); } catch (e) { toastErr(e); }
  }
  return () => st.close();
}
