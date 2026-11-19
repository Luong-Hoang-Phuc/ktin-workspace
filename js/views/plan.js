// =====================================================================
// 3. PHƯƠNG ÁN SẢN XUẤT – dạng cây
// ① Hiệu ứng (→ tự chọn công đoạn gia công sau in) ② Công nghệ in ③ Quy trình (quy trình chung công ty, tích công đoạn SP đi qua + chọn máy) ④ Bình trang & khuôn
// =====================================================================
import db, { logActivity } from '../db.js';
import { store, sectionFolder } from '../store.js';
import { h, fill, toastErr, debounce, confirmBox } from '../ui.js';
import { EFFECTS, PRINT_METHODS, PRINT_MODES, PHASES, LINES } from './templates.js';
import { factoryData } from './factory.js';
import { mountSheet, renderStatic } from './sheet.js';

const EFFECT_TAGS = new Set(EFFECTS.map(e => e.tag));

export function mountPlan(el, { product, readOnly = false }) {
  let plan = null;
  const offs = [];
  const page = h('div', { class: 'page plan' });
  el.append(page);
  const st = factoryData(() => { if (!page.contains(document.activeElement) || readOnly) render(); });
  const boxes = { fx: h('div'), print: h('div'), flow: h('div'), layout: h('div') };
  let sheetCleanup = null, layoutTableId = null;

  const stagesFor = () => st.stages().filter(s => (s.line || 'chung') === 'chung' || s.line === product.kind);
  const stepOf = (sid) => plan?.steps?.[sid] || { on: false, machines: [] };

  const persist = debounce(async (patch) => {
    try { await db.update('product_plans', plan.id, { ...patch, updated_by: store.user.id, updated_at: new Date().toISOString() }); }
    catch (e) { toastErr(e); }
  }, 350);
  const pending = {};
  const change = (patch, msg) => { Object.assign(plan, patch); Object.assign(pending, patch); persist({ ...pending }); render(); if (msg) logActivity(store.user, msg, product.name); };

  function branch(n, title, body) {
    return h('section', { class: 'p-branch' }, h('div', { class: 'p-bh' }, h('span', { class: 'p-bn' }, n), h('b', { class: 'serif' }, title)), h('div', { class: 'p-bb' }, body));
  }

  function render() {
    if (!plan) return;
    fill(page,
      h('div', { class: 'p-root' }, h('span', { class: 'serif' }, product.name)),
      h('div', { class: 'p-tree' },
        branch('①', product.kind === 'sach' ? 'Hiệu ứng (bìa)' : 'Hiệu ứng', boxes.fx),
        branch('②', 'Công nghệ in', boxes.print),
        branch('③', 'Quy trình sản xuất', boxes.flow),
        branch('④', 'Bình trang & khuôn', boxes.layout)));
    renderFx(); renderPrint(); renderFlow(); renderLayout();
  }

  // ---------- ① hiệu ứng ----------
  function renderFx() {
    const list = EFFECTS.filter(e => !e.line || e.line === product.kind);
    const on = new Set(plan.effects || []);
    fill(boxes.fx,
      h('div', { class: 'fx-chips' }, list.map(e => readOnly
        ? (on.has(e.key) ? h('span', { class: 'chip on' }, '✓ ', e.label) : null)
        : h('button', { class: `chip ${on.has(e.key) ? 'on' : ''}`, onclick: () => toggleEffect(e.key) }, on.has(e.key) ? '✓ ' : '＋ ', e.label))),
      readOnly && !on.size ? h('span', { class: 'muted' }, '—') : null);
  }
  function toggleEffect(key) {
    const effects = new Set(plan.effects || []);
    effects.has(key) ? effects.delete(key) : effects.add(key);
    const tags = new Set([...effects].map(k => EFFECTS.find(e => e.key === k)?.tag));
    const steps = { ...(plan.steps || {}) };
    for (const s of stagesFor()) {
      if (!EFFECT_TAGS.has(s.tag)) continue;
      const want = tags.has(s.tag);
      const cur = steps[s.id] || { on: false, machines: [] };
      if (cur.on !== want) steps[s.id] = { ...cur, on: want, machines: want && !cur.machines?.length ? st.kids(s.id).slice(0, 1).map(k => k.machine_id).filter(Boolean) : cur.machines || [] };
    }
    const e = EFFECTS.find(x => x.key === key);
    change({ effects: [...effects], steps }, `${effects.has(key) ? 'chọn' : 'bỏ'} hiệu ứng ${e.label} –`);
  }

  // ---------- ② công nghệ in ----------
  function renderPrint() {
    const inStage = st.stages().find(s => s.tag === 'in');
    const printers = inStage ? st.kids(inStage.id).map(k => st.machine(k.machine_id)).filter(Boolean) : st.machines;
    const parts = plan.print || [];
    const upd = (i, patch) => {
      const print = parts.map((p, j) => j === i ? { ...p, ...patch } : p);
      const extra = {};
      if (patch.machine_id && inStage) { const s = stepOf(inStage.id); extra.steps = { ...plan.steps, [inStage.id]: { ...s, on: true, machines: [...new Set([...(s.machines || []), patch.machine_id])] } }; }
      change({ print, ...extra });
    };
    fill(boxes.print, h('div', { class: 'pr-cards' }, parts.map((p, i) => {
      const m = st.machine(p.machine_id);
      if (readOnly) return h('div', { class: 'pr-card' }, h('b', { class: 'serif' }, p.name),
        h('dl', {}, [['Giấy', p.paper], ['Phương pháp', p.method], ['Số màu', `${p.front ?? 0}/${p.back ?? 0}${p.colors ? ' – ' + p.colors : ''}`], ['Cách in', p.mode], ['Máy in', m ? `${m.name} (${m.cells?.somau || '?'} màu, ${m.cells?.khomax || '?'})` : '—']].map(([k, v]) => [h('dt', {}, k), h('dd', {}, v || '—')])));
      const inp = (k, ph, w) => { const x = h('input', { class: 'input', value: p[k] ?? '', placeholder: ph, style: w ? { width: w } : null }); x.addEventListener('change', () => upd(i, { [k]: k === 'front' || k === 'back' ? Number(x.value) || 0 : x.value })); return x; };
      const sel = (k, opts) => h('select', { class: 'select', onchange: (e) => upd(i, { [k]: e.target.value }) }, opts.map(o => h('option', { selected: p[k] === o }, o)));
      const warn = m && Number(m.cells?.somau) && (p.front || 0) > Number(m.cells.somau) ? h('div', { class: 'small', style: { color: 'var(--rd)' } }, `⚠ ${m.name} chỉ ${m.cells.somau} màu – in ${p.front} màu phải chạy 2 lượt`) : null;
      return h('div', { class: 'pr-card' },
        h('div', { class: 'row' }, inp('name', 'Thành phần'), h('button', { class: 'icon-btn', title: 'Xoá thành phần', onclick: async () => { if (await confirmBox('Xoá thành phần?', `Xoá “${p.name}”?`)) change({ print: parts.filter((_, j) => j !== i) }); } }, '✕')),
        h('label', { class: 'field' }, h('span', {}, 'Giấy'), inp('paper', 'VD: Ivory 350 g/m²')),
        h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', {}, 'Phương pháp in'), sel('method', PRINT_METHODS)), h('label', { class: 'field grow' }, h('span', {}, 'Cách in'), sel('mode', PRINT_MODES))),
        h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', {}, 'Mặt trước'), inp('front', '4', '70px')), h('label', { class: 'field' }, h('span', {}, 'Mặt sau'), inp('back', '0', '70px')), h('label', { class: 'field grow' }, h('span', {}, 'Màu'), inp('colors', 'CMYK + 1 pha'))),
        h('label', { class: 'field' }, h('span', {}, 'Máy in'), h('select', { class: 'select', onchange: (e) => upd(i, { machine_id: e.target.value || null }) }, h('option', { value: '' }, '— Chọn máy in —'),
          printers.map(x => h('option', { value: x.id, selected: x.id === p.machine_id }, `${x.name} · ${x.cells?.somau || '?'} màu · khổ max ${x.cells?.khomax || '?'}`)))),
        warn);
    }), readOnly ? null : h('button', { class: 'pr-card add', onclick: () => change({ print: [...parts, { name: product.kind === 'sach' ? 'Phụ bản' : 'Thành phần mới', paper: '', method: PRINT_METHODS[0], front: 4, back: 0, colors: '', mode: PRINT_MODES[0], machine_id: null }] }) }, '＋ Thêm thành phần in')));
  }

  // ---------- ③ quy trình ----------
  function renderFlow() {
    const ss = stagesFor();
    const onList = ss.filter(s => stepOf(s.id).on);
    const phases = [...PHASES, ...new Set(ss.map(s => s.phase).filter(p => !PHASES.includes(p)))];
    void onList;
    fill(boxes.flow,
      h('div', { class: 'flow' }, phases.map(ph => {
        const list = ss.filter(s => (s.phase || PHASES[0]) === ph);
        if (!list.length || (readOnly && !list.some(s => stepOf(s.id).on))) return null;
        return h('div', { class: 'fl-phase' }, h('div', { class: 'fl-ph' }, ph),
          h('div', { class: 'fl-row' }, list.filter(s => !readOnly || stepOf(s.id).on).map(s => {
            const step = stepOf(s.id);
            const kids = st.kids(s.id);
            return h('div', { class: `fl-st ${step.on ? 'on' : ''}` },
              h('label', { class: 'fl-h' }, readOnly ? null : h('input', { type: 'checkbox', checked: step.on, onchange: (e) => setStep(s, { on: e.target.checked, machines: e.target.checked && !step.machines?.length ? kids.slice(0, 1).map(k => k.machine_id).filter(Boolean) : step.machines || [] }) }),
                h('b', {}, s.name)),
              h('div', { class: 'fl-ms' }, kids.length ? kids.map(k => {
                const m = st.machine(k.machine_id); if (!m) return null;
                const picked = (step.machines || []).includes(m.id);
                if (readOnly) return picked ? h('span', { class: 'mchip on' }, m.name) : null;
                return h('button', { class: `mchip ${picked ? 'on' : ''}`, disabled: !step.on, title: `${m.cells?.ns || '?'} ${m.cells?.dv || ''}`, onclick: () => setStep(s, { machines: picked ? step.machines.filter(x => x !== m.id) : [...(step.machines || []), m.id] }) }, m.name);
              }) : null));
          })));
      })));
  }
  function setStep(s, patch) {
    const steps = { ...(plan.steps || {}), [s.id]: { ...stepOf(s.id), ...patch } };
    change({ steps }, patch.on === true ? `thêm công đoạn ${s.name} vào quy trình` : patch.on === false ? `bỏ công đoạn ${s.name} khỏi quy trình` : null);
  }

  // ---------- ④ bình trang ----------
  async function renderLayout() {
    const folder = sectionFolder(product.id, 'plan');
    if (!folder) { fill(boxes.layout, h('p', { class: 'small muted' }, 'Chưa có thư mục.')); return; }
    const tables = await db.select('data_tables', { eq: { folder_id: folder.id }, order: ['created_at', true] });
    const t = tables.find(x => /bình trang/i.test(x.name)) || tables[0];
    if (!t) { fill(boxes.layout, h('span', { class: 'muted' }, '—')); return; }
    if (readOnly) { const rows = await db.select('data_rows', { eq: { table_id: t.id } }); fill(boxes.layout, renderStatic(t, rows)); return; }
    if (layoutTableId === t.id && boxes.layout.firstChild) return; // giữ nguyên bảng đang sửa
    sheetCleanup?.(); layoutTableId = t.id; fill(boxes.layout);
    sheetCleanup = mountSheet(boxes.layout, { table: t, compact: true });
  }

  (async () => {
    try {
      plan = await db.get('product_plans', product.id);
      if (!plan && !readOnly) plan = await db.insert('product_plans', { id: product.id, product_id: product.id, effects: [], print: [], steps: {}, updated_by: store.user.id });
      plan ||= { id: product.id, effects: [], print: [], steps: {} };
      render();
    } catch (e) { toastErr(e); }
  })();
  offs.push(db.subscribe('product_plans', ['id', product.id], (e) => {
    if (e.type === 'DELETE' || !e.new) return;
    if (e.new.updated_by === store.user.id && Object.keys(pending).length) return;
    plan = e.new;
    if (readOnly || !page.contains(document.activeElement) || document.activeElement.type === 'checkbox') render();
  }));
  return () => { persist.flush?.(); offs.forEach(f => f()); st.close(); sheetCleanup?.(); };
}
