// Bản xem thử: mô phỏng 2 thành viên khác đang làm việc để thấy luồng realtime
import db, { logActivity } from './db.js';
import { BOT_A, BOT_B } from './demo-seed.js';
import { toast } from './ui.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let running = false, round = 0;
export const isRunning = () => running;
export function stop() { running = false; }

const sim = () => db._sim;
const F = () => sim().meta().folders || {};
const where = (bot, folderId) => sim().peer({ id: bot.id, name: bot.display_name, color: bot.color, folderId });
const log = (bot, action, target) => logActivity({ id: bot.id }, action, target);
const now = () => new Date().toISOString();

async function findTableRow(tableName, match) {
  const t = (await db.select('data_tables')).find(x => x.name === tableName); if (!t) return {};
  const rows = await db.select('data_rows', { eq: { table_id: t.id } });
  return { t, row: rows.find(match) };
}

const STEPS = [
  // 1. Minh Anh sửa năng suất máy trong bảng Dữ liệu máy
  async () => {
    const f = F().f02; where(BOT_A, f);
    const { row } = await findTableRow('Dữ liệu máy (CSDL thiết bị)', r => r.cells.may === 'CD 102-4');
    if (!row) return;
    const k = `${row.id}:ns`;
    sim().room(`table-${f}`, { t: 'edit', k, name: BOT_A.display_name });
    await sleep(1800);
    const v = Number(row.cells.ns) === 8000 ? 8200 : 8000;
    await db.update('data_rows', row.id, { cells: { ...row.cells, ns: v }, updated_by: BOT_A.id, updated_at: now() });
    sim().room(`table-${f}`, { t: 'done', k });
    log(BOT_A, `sửa năng suất CD 102-4 → ${v.toLocaleString('vi-VN')} tua/h trong`, 'Dữ liệu máy');
  },
  // 2. Quốc Bảo di chuột và kéo một ghi chú trên bảng trắng
  async () => {
    const f = F().f05, bid = sim().meta().boardId; where(BOT_B, f);
    for (let i = 0; i <= 20 && running; i++) { sim().room(`board-${bid}`, { t: 'cur', uid: BOT_B.id, name: BOT_B.display_name, color: BOT_B.color, x: 300 + i * 30, y: 200 + Math.sin(i / 3) * 60 }); await sleep(90); }
    const items = await db.select('board_items', { eq: { board_id: bid } });
    const it = items.find(x => x.kind === 'sticky' && /Kiểm tra/.test(x.data.text)); if (!it) return;
    const dy = it.data.y > 300 ? -40 : 40; const d0 = { ...it.data };
    for (let i = 1; i <= 10 && running; i++) { const data = { ...d0, y: d0.y + dy * i / 10 }; sim().room(`board-${bid}`, { t: 'move', id: it.id, data }); sim().room(`board-${bid}`, { t: 'cur', uid: BOT_B.id, name: BOT_B.display_name, color: BOT_B.color, x: data.x + 80, y: data.y + 60 }); await sleep(80); }
    await db.update('board_items', it.id, { data: { ...d0, y: d0.y + dy }, updated_by: BOT_B.id, updated_at: now() });
  },
  // 3. Minh Anh gõ câu trả lời vào ghi chú
  async () => {
    const f = F().f00; where(BOT_A, f);
    const n = (await db.select('notes', { eq: { folder_id: f } })).find(x => x.title === 'Câu hỏi cho giảng viên'); if (!n) return;
    const add = '\n   → Thầy trả lời: được giả định, ghi rõ nguồn trong mục 1.5.';
    let content = n.content;
    if (content.includes(add)) { content = content.replace(add, ''); await db.update('notes', n.id, { content, updated_by: BOT_A.id, updated_at: now() }); return; }
    const anchor = content.indexOf('\n2.');
    let typed = '';
    for (const ch of add) {
      if (!running) break;
      typed += ch;
      sim().room(`notes-${f}`, { t: 'live', id: n.id, title: n.title, content: content.slice(0, anchor) + typed + content.slice(anchor), name: BOT_A.display_name, uid: BOT_A.id });
      await sleep(45);
    }
    await db.update('notes', n.id, { content: content.slice(0, anchor) + typed + content.slice(anchor), updated_by: BOT_A.id, updated_at: now() });
    log(BOT_A, 'cập nhật ghi chú', n.title);
  },
  // 4. Quốc Bảo tải lên file layout
  async () => {
    const folder = (await db.select('folders')).find(x => x.name === 'Layout tờ in & nesting'); if (!folder) return;
    where(BOT_B, folder.id);
    const files = (await db.select('files', { eq: { folder_id: folder.id } })).sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (files.length >= 3) await db.remove('files', files[0].id);
    const name = `Nesting_PA${++round}_72x102.pdf`;
    const path = `${folder.id}/sim-${Date.now()}`;
    await db.upload(path, new Blob(['Tệp mẫu'], { type: 'application/pdf' }));
    await db.insert('files', { folder_id: folder.id, name, storage_path: path, size: 182000 + round * 3100, mime: 'application/pdf', version: 1, uploaded_by: BOT_B.id, description: `Hiệu suất giấy ${(78 + round % 9).toFixed(1)}%`, created_at: now(), updated_at: now() });
    log(BOT_B, 'đã tải lên', `${name} → ${folder.name}`);
  },
  // 5. Quốc Bảo cập nhật / khoá file Word
  async () => {
    const f = F().f09; where(BOT_B, f);
    const w = await db.get('files', sim().meta().wordId); if (!w) return;
    if (w.locked_by === BOT_B.id) {
      await db.insert('files', { folder_id: f, name: w.name, storage_path: w.storage_path, size: w.size, mime: w.mime, version: w.version, parent_file_id: w.id, uploaded_by: w.uploaded_by, created_at: w.updated_at, updated_at: w.updated_at });
      const path = `${f}/sim-${Date.now()}`; await db.upload(path, new Blob(['Tệp mẫu']));
      await db.update('files', w.id, { storage_path: path, version: w.version + 1, size: w.size + 4200, uploaded_by: BOT_B.id, updated_at: now(), locked_by: null, locked_at: null, description: `Đã xong chương 3 (v${w.version + 1})` });
      log(BOT_B, `đã cập nhật v${w.version + 1}`, w.name);
    } else if (!w.locked_by) {
      await db.update('files', w.id, { locked_by: BOT_B.id, locked_at: now(), description: 'Đang điền chương 4' });
      log(BOT_B, 'bắt đầu sửa', w.name);
    }
  },
  // 6. Đổi trạng thái tiến độ
  async () => {
    where(BOT_A, null);
    const { row } = await findTableRow('Tiến độ đồ án', r => r.cells.buoc === '3'); if (!row) return;
    const order = ['Đang làm', 'Chờ duyệt', 'Xong', 'Đang làm'];
    const next = order[(order.indexOf(row.cells.trangthai) + 1) % 3] || 'Đang làm';
    await db.update('data_rows', row.id, { cells: { ...row.cells, trangthai: next }, updated_by: BOT_B.id, updated_at: now() });
    log(BOT_B, `đổi trạng thái → ${next}`, row.cells.noidung);
  },
];

export async function start(onChange) {
  if (running) return; running = true; onChange?.();
  toast('Bắt đầu mô phỏng: Minh Anh và Quốc Bảo đang làm việc. Hãy mở các thư mục để xem thay đổi.', 'ok');
  where(BOT_A, F().f02); where(BOT_B, F().f05);
  let i = 0;
  while (running) {
    try { await STEPS[i % STEPS.length](); } catch (e) { console.warn('sim', e); }
    i++; await sleep(3500);
  }
  onChange?.();
}
