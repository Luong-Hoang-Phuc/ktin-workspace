// Bản xem thử: mô phỏng 2 thành viên khác đang làm việc để thấy luồng realtime
import db, { logActivity } from './db.js';
import { BOT_A, BOT_B } from './demo-seed.js';
import { toast } from './ui.js';
import { store } from './store.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let running = false, round = 0;
export const isRunning = () => running;
export function stop() { running = false; }

const sim = () => db._sim;
const M = () => sim().meta();
const where = (bot, kind, section, sectionLabel) => sim().peer({ id: bot.id, name: bot.display_name, color: bot.color, productId: kind ? M().products[kind] : null, section, sectionLabel, docs: !kind && section === 'docs' });
const log = (bot, action, target, kind) => db.insert('activity', { user_id: bot.id, action, target, product_id: kind ? M().products[kind] : null }).catch(() => {});
const now = () => new Date().toISOString();

const STEPS = [
  // 1. Minh Anh sửa năng suất máy L640 trong sơ đồ nhà máy Hộp
  async () => {
    where(BOT_A, 'hop', 'factory', '1. Phương án nhà máy');
    const nodes = await db.select('factory_nodes', { eq: { product_id: M().products.hop } });
    const node = nodes.find(n => n.name === 'L640'); if (!node) return;
    sim().room(`factory-${M().products.hop}`, { t: 'sel', uid: BOT_A.id, name: BOT_A.display_name, color: BOT_A.color, nodeId: node.id, at: Date.now() });
    await sleep(2000);
    const m = await db.get('machines', node.machine_id); if (!m) return;
    const v = Number(m.cells.ns) === 7000 ? 7500 : 7000;
    await db.update('machines', m.id, { cells: { ...m.cells, ns: v }, updated_by: BOT_A.id, updated_at: now() });
    log(BOT_A, 'sửa năng suất của', `L640 → ${v.toLocaleString('vi-VN')} tua/h`, 'hop');
  },
  // 2. Quốc Bảo kéo ghi chú trên bảng trắng (Hộp › Phương án sản xuất)
  async () => {
    where(BOT_B, 'hop', 'plan', '3. Phương án sản xuất');
    const bid = M().boardId;
    for (let i = 0; i <= 20 && running; i++) { sim().room(`board-${bid}`, { t: 'cur', uid: BOT_B.id, name: BOT_B.display_name, color: BOT_B.color, x: 300 + i * 30, y: 200 + Math.sin(i / 3) * 60 }); await sleep(90); }
    const items = await db.select('board_items', { eq: { board_id: bid } });
    const it = items.find(x => x.kind === 'sticky' && /Kiểm tra/.test(x.data.text)); if (!it) return;
    const dy = it.data.y > 300 ? -40 : 40; const d0 = { ...it.data };
    for (let i = 1; i <= 10 && running; i++) { const data = { ...d0, y: d0.y + dy * i / 10 }; sim().room(`board-${bid}`, { t: 'move', id: it.id, data }); sim().room(`board-${bid}`, { t: 'cur', uid: BOT_B.id, name: BOT_B.display_name, color: BOT_B.color, x: data.x + 80, y: data.y + 60 }); await sleep(80); }
    await db.update('board_items', it.id, { data: { ...d0, y: d0.y + dy }, updated_by: BOT_B.id, updated_at: now() });
  },
  // 3. Minh Anh gõ câu trả lời vào ghi chú (Hộp › Phương án sản xuất)
  async () => {
    where(BOT_A, 'hop', 'plan', '3. Phương án sản xuất');
    const f = M().folders['hop:plan'];
    const n = (await db.select('notes', { eq: { folder_id: f } })).find(x => x.title === 'Câu hỏi cho giảng viên'); if (!n) return;
    const add = '\n   → Thầy trả lời: được giả định, ghi rõ nguồn trong mục 1.5.';
    let content = n.content;
    if (content.includes(add)) { await db.update('notes', n.id, { content: content.replace(add, ''), updated_by: BOT_A.id, updated_at: now() }); return; }
    const anchor = content.indexOf('\n2.');
    let typed = '';
    for (const ch of add) { if (!running) break; typed += ch; sim().room(`notes-${f}`, { t: 'live', id: n.id, title: n.title, content: content.slice(0, anchor) + typed + content.slice(anchor), name: BOT_A.display_name, uid: BOT_A.id }); await sleep(45); }
    await db.update('notes', n.id, { content: content.slice(0, anchor) + typed + content.slice(anchor), updated_by: BOT_A.id, updated_at: now() });
    log(BOT_A, 'cập nhật ghi chú', n.title, 'hop');
  },
  // 4. Quốc Bảo gửi file vào Tài liệu (Sách › Phương án sản xuất)
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
  // 5. Quốc Bảo cập nhật / khoá file Word chung
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
  toast('Bắt đầu mô phỏng: Minh Anh và Quốc Bảo đang làm việc. Mở Phương án nhà máy, Phương án sản xuất hoặc Tài liệu để xem thay đổi.', 'ok');
  where(BOT_A, 'hop', 'factory', '1. Phương án nhà máy'); where(BOT_B, 'sach', 'plan', '3. Phương án sản xuất');
  let i = 0;
  while (running) { try { await STEPS[i % STEPS.length](); } catch (e) { console.warn('sim', e); } i++; await sleep(3500); }
  onChange?.();
}
void store; void logActivity;
