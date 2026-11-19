// Dữ liệu mẫu cho bản xem thử
import { TABLE_TEMPLATES, PROGRESS_NAME, PROGRESS_COLUMNS, STEPS, SECTIONS, machineCatalog, FACTORY_DEFAULTS, PRODUCTS_DEFAULT, LECTURER_FILES } from './views/templates.js';

export const BOT_A = { id: 'u-minhanh', email: 'minhanh@nhom-ktin.vn', display_name: 'Minh Anh', color: '#4f6b3a' };
export const BOT_B = { id: 'u-quocbao', email: 'quocbao@nhom-ktin.vn', display_name: 'Quốc Bảo', color: '#3b5a7a' };

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const txt = (s) => 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(s)));

export function buildSeed(uuid) {
  const t = { profiles: [], products: [], folders: [], machines: [], factory_nodes: [], files: [], notes: [], boards: [], board_items: [], data_tables: [], data_rows: [], activity: [], settings: [] };
  const blobs = {};
  const meta = { products: {}, folders: {} };
  t.profiles.push({ ...BOT_A, created_at: ago(3000) }, { ...BOT_B, created_at: ago(3000) });
  t.settings.push({ id: 'canva_url', value: '', updated_by: null, updated_at: ago(3000) });

  // ---------- sản phẩm & thư mục theo mục ----------
  PRODUCTS_DEFAULT.forEach((p, i) => {
    const id = uuid(); meta.products[p.kind] = id;
    t.products.push({ id, ...p, image_path: null, position: i, created_at: ago(3000) });
    SECTIONS.forEach((s, j) => { const fid = uuid(); meta.folders[`${p.kind}:${s.key}`] = fid; t.folders.push({ id: fid, parent_id: null, product_id: id, section: s.key, name: s.label, icon: '', position: j, created_at: ago(3000) }); });
  });
  const lect = uuid(), team = uuid();
  meta.folders.lecturer = lect; meta.folders.team = team;
  t.folders.push({ id: lect, parent_id: null, product_id: null, section: 'lecturer', name: 'Tài liệu giảng viên', icon: '📚', position: 0, created_at: ago(3000) });
  t.folders.push({ id: team, parent_id: null, product_id: null, section: 'team', name: 'Tài liệu nhóm', icon: '🗂️', position: 1, created_at: ago(3000) });

  // ---------- danh mục máy & cây nhà máy ----------
  const mid = {};
  machineCatalog().forEach((m, i) => { const id = uuid(); mid[m.name] = id; t.machines.push({ id, name: m.name, cells: m.cells, position: i, updated_by: BOT_A.id, updated_at: ago(2000) }); });
  for (const [kind, stages] of Object.entries(FACTORY_DEFAULTS)) {
    stages.forEach(([sname, machines], si) => {
      const sid = uuid();
      t.factory_nodes.push({ id: sid, product_id: meta.products[kind], parent_id: null, kind: 'stage', name: sname, machine_id: null, position: si, updated_by: BOT_A.id, updated_at: ago(1800) });
      machines.forEach((m, mi) => t.factory_nodes.push({ id: uuid(), product_id: meta.products[kind], parent_id: sid, kind: 'machine', name: m, machine_id: mid[m] || null, position: mi, updated_by: BOT_A.id, updated_at: ago(1800) }));
    });
  }

  // ---------- tài liệu ----------
  const file = (folder, name, by, min, extra = {}) => {
    const id = uuid(), path = `${folder}/${id}`;
    blobs[path] = txt(`Tệp mẫu của bản xem thử: ${name}`);
    t.files.push({ id, folder_id: folder, name, storage_path: path, size: 20000 + Math.round(Math.random() * 900000), mime: '', version: 1, parent_file_id: null, uploaded_by: by, created_at: ago(min), updated_at: ago(min), ...extra });
    return id;
  };
  LECTURER_FILES.forEach((n, i) => file(lect, n, null, 2900 - i));
  const F = meta.folders;
  meta.wordId = file(team, 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', BOT_B.id, 45, { version: 2, locked_by: BOT_B.id, locked_at: ago(20), description: 'Khung báo cáo – đang điền chương 3' });
  const oldId = uuid(); blobs[`${team}/${oldId}`] = txt('v1');
  t.files.push({ id: oldId, folder_id: team, name: 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', storage_path: `${team}/${oldId}`, size: 61000, mime: '', version: 1, parent_file_id: meta.wordId, uploaded_by: BOT_A.id, created_at: ago(1500), updated_at: ago(1500) });
  t.files.push({ id: uuid(), folder_id: team, name: 'Báo cáo chung – bản gõ chung (Word Online)', storage_path: '', external_url: 'https://www.office.com/', version: 1, parent_file_id: null, uploaded_by: BOT_A.id, created_at: ago(200), updated_at: ago(200) });
  file(F['hop:specs'], 'Khai trien hop 50x50x150.pdf', BOT_B.id, 300, { description: 'Bản vẽ khai triển reverse tuck end' });
  file(F['hop:specs'], 'Anh hop tham khao.jpg', BOT_A.id, 280, { mime: 'image/jpeg' });
  file(F['sach:plan'], 'Bang hieu suat giay ruot sach.xlsx', BOT_A.id, 150);
  file(F['hop:factory'], 'So do nha may hop (nhap).pdf', BOT_B.id, 600);

  // ---------- ghi chú ----------
  const note = (folder, title, content, by, min) => t.notes.push({ id: uuid(), folder_id: folder, title, content, updated_by: by, created_at: ago(min), updated_at: ago(min) });
  note(F['hop:specs'], 'Thông số đơn hàng – Hộp', `# Đơn hàng 1 – Hộp kem dưỡng

- **Số lượng:** 50.000 hộp – giao trong 15 ngày
- **Kiểu dáng:** reverse tuck end, dán hông, không bồi sóng
- **Kích thước:** 50 × 50 × 150 mm (trải ≈ 215 × 280 mm)
- **Giấy:** Ivory 350 g/m²
- **Màu in:** 5/0 (CMYK + 1 pha)
- **GCBM:** màng mờ, UV bóng từng phần ~20%, ép nhũ logo 30×15 mm × 2`, BOT_B.id, 900);
  note(F['sach:specs'], 'Thông số đơn hàng – Sách', `# Đơn hàng 2 – Sách khâu chỉ

- **Số lượng:** 3.000 cuốn – 20 ngày
- **Khổ:** 14,5 × 20,5 cm · 240 trang (15 tay × 16)
- **Ruột:** Fort 80, in 1/1 · **Bìa:** Bristol 250, in 4/0, màng bóng + ép nhũ`, BOT_A.id, 880);
  note(F['hop:plan'], 'Câu hỏi cho giảng viên', `# Câu hỏi cho giảng viên

1. Máy thành phẩm sách chưa có trong CSDL – nhóm được tự giả định thông số không?
2. Khổ tờ in hộp: chọn theo nesting hay theo bảng hiệu suất như nhãn?

> Ghi câu trả lời ngay bên dưới.`, BOT_A.id, 120);
  note(F['hop:factory'], 'Ghi chú phương án nhà máy', `# Ghi chú

- In dùng **L640** (6 màu) để in 5 màu một lượt
- Ép nhũ trên máy bán tự động en1 → năng suất thấp, cần xem lại thời gian
- [ ] Hỏi lại khổ max của en1`, BOT_B.id, 500);

  // ---------- bảng trắng: quy trình hộp ----------
  const bid = uuid(); meta.boardId = bid;
  t.boards.push({ id: bid, folder_id: F['hop:plan'], name: 'Quy trình sản xuất hộp', created_by: BOT_B.id, created_at: ago(500) });
  const steps = [['Chế bản\nCTP 5 bản', '#bfdbfe'], ['In L640\n5 màu', '#fde68a'], ['Dán màng mờ\nDM1', '#fde68a'], ['UV từng phần\nTP1', '#fde68a'], ['Ép nhũ\nen1', '#fde68a'], ['Bế TĐ1', '#bbf7d0'], ['Xé rìa', '#bbf7d0'], ['Dán hộp\nDH1', '#bbf7d0'], ['Kiểm tra\nĐóng gói', '#ddd6fe']];
  let z = 1;
  const pos = (i) => { const row = Math.floor(i / 5), c = i % 5, col = row % 2 ? 4 - c : c; return { row, x: 40 + col * 230, y: 60 + row * 230 }; };
  steps.forEach(([text, color], i) => {
    const p = pos(i);
    t.board_items.push({ id: uuid(), board_id: bid, kind: 'sticky', z: z++, data: { x: p.x, y: p.y, w: 170, h: 120, text, color }, updated_by: BOT_B.id, updated_at: ago(400) });
    if (i < steps.length - 1) {
      const q = pos(i + 1);
      const a = q.row !== p.row ? { x1: p.x + 85, y1: p.y + 125, x2: q.x + 85, y2: q.y - 8 }
        : q.x > p.x ? { x1: p.x + 175, y1: p.y + 60, x2: q.x - 8, y2: q.y + 60 } : { x1: p.x - 5, y1: p.y + 60, x2: q.x + 178, y2: q.y + 60 };
      t.board_items.push({ id: uuid(), board_id: bid, kind: 'arrow', z: z++, data: { ...a, color: '#1f2937' }, updated_by: BOT_B.id, updated_at: ago(400) });
    }
  });
  t.board_items.push({ id: uuid(), board_id: bid, kind: 'text', z: z++, data: { x: 40, y: 0, w: 700, h: 50, text: 'Đơn hàng 1 – Hộp kem dưỡng 50.000 hộp', color: '#2563eb', size: 22 }, updated_by: BOT_B.id, updated_at: ago(400) });
  t.board_items.push({ id: uuid(), board_id: bid, kind: 'rect', z: 0, data: { x: 30, y: 280, w: 190, h: 130, text: 'Màu: xanh = chế bản\nvàng = in & GCBM\nxanh lá = thành phẩm', color: '#2563eb' }, updated_by: BOT_B.id, updated_at: ago(400) });

  // ---------- bảng dữ liệu ----------
  const table = (folder, name, tpl, by) => {
    const T = TABLE_TEMPLATES[tpl]; const id = uuid();
    t.data_tables.push({ id, folder_id: folder, name, columns: T.columns, created_by: by, created_at: ago(1000) });
    T.rows.forEach((vals, i) => t.data_rows.push({ id: uuid(), table_id: id, position: i, updated_by: by, updated_at: ago(1000), cells: Object.fromEntries(T.columns.map((c, j) => [c.key, vals[j] ?? ''])) }));
  };
  table(F['hop:specs'], 'Thông số đơn hàng – Hộp', 'Thông số đơn hàng – Hộp', BOT_B.id);
  table(F['sach:specs'], 'Thông số đơn hàng – Sách', 'Thông số đơn hàng – Sách', BOT_A.id);
  table(F['hop:materials'], 'Giá vật tư', 'Giá vật tư', BOT_A.id);
  table(F['sach:materials'], 'Giá vật tư', 'Giá vật tư', BOT_A.id);

  // tiến độ: để trống cho nhóm tự cập nhật
  for (const kind of ['hop', 'sach']) {
    const pid = uuid();
    t.data_tables.push({ id: pid, folder_id: F[`${kind}:overview`], name: PROGRESS_NAME, columns: PROGRESS_COLUMNS, created_by: null, created_at: ago(2000) });
    STEPS.forEach(([a, b], i) => t.data_rows.push({ id: uuid(), table_id: pid, position: i, updated_by: null, updated_at: ago(2000), cells: { buoc: String(i + 1), noidung: a, ghichu: b, trangthai: 'Chưa làm', phutrach: '' } }));
  }

  [[BOT_A.id, 'đã tải lên', 'Tài liệu giảng viên (7 file)', 2000], [BOT_A.id, 'nhập danh mục máy', 'Dữ liệu máy (29 máy)', 1800],
   [BOT_B.id, 'tạo bảng trắng', 'Quy trình sản xuất hộp', 500], [BOT_B.id, 'đã cập nhật v2', 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', 45], [BOT_B.id, 'bắt đầu sửa', 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', 20]]
    .forEach(([u, action, target, min], i) => t.activity.push({ id: i + 1, user_id: u, action, target, product_id: null, created_at: ago(min) }));

  return { t, blobs, meta };
}
