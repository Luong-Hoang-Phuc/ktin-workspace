// Bản xem thử: mô phỏng 2 thành viên khác đang làm việc để thấy luồng realtime
import db from './db.js';
import { BOT_A, BOT_B } from './demo-seed.js';
import { toast } from './ui.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let running = false, round = 0;
export const isRunning = () => running;
export function stop() { running = false; }

const sim = () => db._sim;
const M = () => sim().meta();
const where = (bot, kind, section, sectionLabel, mode = 'view') => sim().peer({ id: bot.id, name: bot.display_name, color: bot.color, productId: kind ? M().products[kind] : null, section, sectionLabel, docs: section === 'docs', mode });
const log = (bot, action, target, kind) => db.insert('activity', { user_id: bot.id, action, target, product_id: kind ? M().products[kind] : null }).catch(() => {});
const now = () => new Date().toISOString();

const STEPS = [
  // 1. Minh Anh sửa năng suất L640 trong sơ đồ nhà máy (CSDL, chung công ty)
  async () => {
    where(BOT_A, 'hop', 'factory', '🗄 1. Phương án nhà máy', 'db');
    const node = (await db.select('factory_nodes')).find(n => n.name === 'L640'); if (!node) return;
    sim().room('factory-company', { t: 'sel', uid: BOT_A.id, name: BOT_A.display_name, color: BOT_A.color, nodeId: node.id, at: Date.now() });
    await sleep(2000);
    const m = await db.get('machines', node.machine_id); if (!m) return;
    const v = Number(m.cells.ns) === 7000 ? 7500 : 7000;
    await db.update('machines', m.id, { cells: { ...m.cells, ns: v }, updated_by: BOT_A.id, updated_at: now() });
    log(BOT_A, 'sửa năng suất của', `L640 → ${v.toLocaleString('vi-VN')} tua/h`, null);
  },
  // 2. Quốc Bảo sửa năng suất ép nhũ trong bảng Thời gian (Hộp) → công thức tự tính lại
  async () => {
    where(BOT_B, 'hop', 'time', '🗄 6. Thời gian sản xuất', 'db');
    const tid = M()['hop:time']; if (!tid) return;
    const rows = await db.select('data_rows', { eq: { table_id: tid } });
    const r = rows.find(x => x.cells.may === 'en1'); if (!r) return;
    const k = `${r.id}:ns`;
    sim().room(`table-${tid}`, { t: 'edit', k, name: BOT_B.display_name });
    await sleep(1800);
    const v = Number(r.cells.ns) === 600 ? 800 : 600;
    await db.update('data_rows', r.id, { cells: { ...r.cells, ns: v }, updated_by: BOT_B.id, updated_at: now() });
    sim().room(`table-${tid}`, { t: 'done', k });
    log(BOT_B, 'sửa năng suất ép nhũ', `en1 → ${v} tua/h (bảng Thời gian)`, 'hop');
  },
  // 3. Minh Anh gõ câu trả lời vào ghi chú (Hộp › Phương án sản xuất)
  async () => {
    where(BOT_A, 'hop', 'plan', '3. Phương án sản xuất');
    const f = M().folders['hop:plan'];
    const n = (await db.select('notes', { eq: { folder_id: f } })).find(x => x.title === 'Câu hỏi cho giảng viên'); if (!n) return;
    const add = '\n   → Thầy trả lời: được giả định, ghi rõ nguồn trong bảng thiết bị.';
    const content = n.content;
    if (content.includes(add)) { await db.update('notes', n.id, { content: content.replace(add, ''), updated_by: BOT_A.id, updated_at: now() }); return; }
    const anchor = content.indexOf('\n2.');
    let typed = '';
    for (const ch of add) { if (!running) break; typed += ch; sim().room(`notes-${f}`, { t: 'live', id: n.id, title: n.title, content: content.slice(0, anchor) + typed + content.slice(anchor), name: BOT_A.display_name, uid: BOT_A.id }); await sleep(45); }
    await db.update('notes', n.id, { content: content.slice(0, anchor) + typed + content.slice(anchor), updated_by: BOT_A.id, updated_at: now() });
    log(BOT_A, 'cập nhật ghi chú', n.title, 'hop');
  },
  // 4. Quốc Bảo bật / tắt hiệu ứng “Kéo lụa” cho Hộp → công đoạn Kéo lụa tự được tích
  async () => {
    where(BOT_B, 'hop', 'plan', '🗄 3. Phương án sản xuất', 'db');
    const pid = M().products.hop;
    const plan = await db.get('product_plans', pid); if (!plan) return;
    const stage = (await db.select('factory_nodes')).find(n => n.kind === 'stage' && n.tag === 'lua'); if (!stage) return;
    const kid = (await db.select('factory_nodes', { eq: { parent_id: stage.id } }))[0];
    const on = !(plan.effects || []).includes('lua');
    const effects = on ? [...plan.effects, 'lua'] : plan.effects.filter(e => e !== 'lua');
    const steps = { ...plan.steps, [stage.id]: { on, machines: on && kid ? [kid.machine_id] : [], note: '' } };
    await db.update('product_plans', pid, { effects, steps, updated_by: BOT_B.id, updated_at: now() });
    log(BOT_B, `${on ? 'chọn' : 'bỏ'} hiệu ứng Kéo lụa –`, 'Hộp kem dưỡng', 'hop');
  },
  // 5. Quốc Bảo gửi file vào Sách › Phương án sản xuất
  async () => {
    where(BOT_B, 'sach', 'plan', '3. Phương án sản xuất');
    const fid = M().folders['sach:plan'];
    const files = (await db.select('files', { eq: { folder_id: fid } })).filter(f => f.name.startsWith('Binh_trang')).sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (files.length >= 2) await db.remove('files', files[0].id);
    const name = `Binh_trang_ruot_PA${++round}.pdf`, path = `${fid}/sim-${Date.now()}`;
    await db.upload(path, new Blob(['Tệp mẫu'], { type: 'application/pdf' }));
    await db.insert('files', { folder_id: fid, name, storage_path: path, size: 182000 + round * 3100, mime: 'application/pdf', version: 1, uploaded_by: BOT_B.id, description: `32 trang/tờ 65×86 – phương án ${round}`, created_at: now(), updated_at: now() });
    log(BOT_B, 'đã tải lên', `${name} → Sách › 3. Phương án sản xuất`, 'sach');
  },
  // 6. Minh Anh nhắn tin cho nhóm
  async () => {
    where(BOT_A, null, 'chat', 'Tin nhắn');
    const lines = ['Mình vừa sửa năng suất L640, mọi người kiểm tra lại bảng Thời gian nhé', 'Giá thành hộp đang ra khoảng 1.200 đ/hộp, nghe hợp lý không?', 'Tối nay họp online 20h nha 👋'];
    sim().room('chat-team', { t: 'typing', uid: BOT_A.id, name: BOT_A.display_name });
    await sleep(1800);
    await db.insert('messages', { user_id: BOT_A.id, body: lines[round % lines.length] });
  },
  // 7. Quốc Bảo khoá / cập nhật file Word chung
  async () => {
    where(BOT_B, null, 'docs');
    const w = await db.get('files', M().wordId); if (!w) return;
    if (w.locked_by === BOT_B.id) {
      await db.insert('files', { folder_id: w.folder_id, name: w.name, storage_path: w.storage_path, size: w.size, mime: w.mime, version: w.version, parent_file_id: w.id, uploaded_by: w.uploaded_by, created_at: w.updated_at, updated_at: w.updated_at });
      const path = `${w.folder_id}/sim-${Date.now()}`; await db.upload(path, new Blob(['Tệp mẫu']));
      await db.update('files', w.id, { storage_path: path, version: w.version + 1, size: w.size + 4200, uploaded_by: BOT_B.id, updated_at: now(), locked_by: null, locked_at: null, description: `Đã xong chương 3 (v${w.version + 1})` });
      log(BOT_B, `đã cập nhật v${w.version + 1}`, w.name, null);
    } else if (!w.locked_by) {
      await db.update('files', w.id, { locked_by: BOT_B.id, locked_at: now(), description: 'Đang điền chương 4' });
      log(BOT_B, 'bắt đầu sửa', w.name, null);
    }
  },
];

export async function start(onChange) {
  if (running) return; running = true; onChange?.();
  toast('Bắt đầu mô phỏng: Minh Anh và Quốc Bảo đang làm việc. Mở Cơ sở dữ liệu › 1, 3, 6 hoặc trang xem tương ứng để thấy thay đổi.', 'ok');
  where(BOT_A, 'hop', 'factory', '🗄 1. Phương án nhà máy', 'db'); where(BOT_B, 'hop', 'time', '🗄 6. Thời gian sản xuất', 'db');
  let i = 0;
  while (running) { try { await STEPS[i % STEPS.length](); } catch (e) { console.warn('sim', e); } i++; await sleep(3500); }
  onChange?.();
}
