// Dữ liệu mẫu cho bản xem thử
import { TABLE_TEMPLATES, PROGRESS_NAME, PROGRESS_COLUMNS, STEPS } from './views/templates.js';

export const BOT_A = { id: 'u-minhanh', email: 'minhanh@nhom-ktin.vn', display_name: 'Minh Anh', color: '#db2777' };
export const BOT_B = { id: 'u-quocbao', email: 'quocbao@nhom-ktin.vn', display_name: 'Quốc Bảo', color: '#059669' };

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const txt = (s) => 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(s)));

export function buildSeed(uuid) {
  const t = { profiles: [], folders: [], files: [], notes: [], boards: [], board_items: [], data_tables: [], data_rows: [], activity: [] };
  const blobs = {};
  t.profiles.push({ ...BOT_A, created_at: ago(3000) }, { ...BOT_B, created_at: ago(3000) });

  const F = {};
  [['f00', '00. Tài liệu giảng viên', '📚'], ['f01', '01. Phương án nhà máy & CSDL', '🏭'], ['f02', '02. Dữ liệu máy', '⚙️'],
   ['f03', '03. Thông số sản phẩm – Hộp', '📦'], ['f04', '04. Thông số sản phẩm – Sách', '📖'], ['f05', '05. Phương án sản xuất', '🗺️'],
   ['f06', '06. Vật tư & thời gian', '🧮'], ['f07', '07. Giá thành', '💰'], ['f08', '08. Kế hoạch sản xuất', '📅'], ['f09', '09. Báo cáo Word', '📝']]
    .forEach(([k, name, icon], i) => { F[k] = uuid(); t.folders.push({ id: F[k], parent_id: null, name, icon, position: i, created_by: BOT_A.id, created_at: ago(2900) }); });
  const sub = uuid();
  t.folders.push({ id: sub, parent_id: F.f05, name: 'Layout tờ in & nesting', icon: '📐', position: 0, created_by: BOT_B.id, created_at: ago(600) });

  // ---------- tài liệu ----------
  const file = (folder, name, by, min, extra = {}) => {
    const id = uuid(), path = `${folder}/${id}`;
    blobs[path] = txt(`Tệp mẫu của bản xem thử: ${name}`);
    t.files.push({ id, folder_id: folder, name, storage_path: path, size: 20000 + Math.round(Math.random() * 900000), mime: '', version: 1, parent_file_id: null, uploaded_by: by, created_at: ago(min), updated_at: ago(min), ...extra });
    return id;
  };
  file(F.f00, '1. Hướng dẫn đồ án KTTCSX in – Hướng dẫn chung.pptx', BOT_A.id, 2800);
  file(F.f00, '2. Xác định phương án và mô hình nhà máy.pptx', BOT_A.id, 2800);
  file(F.f00, '3. HD – Xác định thông số SP.pptx', BOT_A.id, 2790);
  file(F.f00, '4. Lập phương án sản xuất cho sản phẩm.pptx', BOT_A.id, 2790);
  file(F.f00, 'Dự trù vật tư và thời gian sản xuất.pptx', BOT_A.id, 2780);
  file(F.f00, 'Tính giá khoản mục.pptx', BOT_A.id, 2780);
  file(F.f01, '2. CƠ SỞ DỮ LIỆU.xlsx', BOT_A.id, 2700, { description: 'CSDL gốc của giảng viên' });
  file(F.f03, 'Khai trien hop 50x50x150.pdf', BOT_B.id, 300, { description: 'Bản vẽ khai triển reverse tuck end' });
  const word = file(F.f09, 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', BOT_B.id, 45, { version: 2, locked_by: BOT_B.id, locked_at: ago(20), description: 'Khung báo cáo – đang điền chương 3' });
  const oldId = uuid(); blobs[`${F.f09}/${oldId}`] = txt('v1');
  t.files.push({ id: oldId, folder_id: F.f09, name: 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', storage_path: `${F.f09}/${oldId}`, size: 61000, mime: '', version: 1, parent_file_id: word, uploaded_by: BOT_A.id, created_at: ago(1500), updated_at: ago(1500) });
  t.files.push({ id: uuid(), folder_id: F.f09, name: 'Báo cáo chung – bản gõ chung (Word Online)', storage_path: '', external_url: 'https://www.office.com/', version: 1, parent_file_id: null, uploaded_by: BOT_A.id, created_at: ago(200), updated_at: ago(200) });

  // ---------- ghi chú ----------
  const note = (folder, title, content, by, min) => t.notes.push({ id: uuid(), folder_id: folder, title, content, updated_by: by, created_at: ago(min), updated_at: ago(min) });
  note(F.f01, 'Biên bản họp nhóm lần 1', `# Biên bản họp nhóm lần 1

**Thành viên:** Minh Anh, Quốc Bảo, bạn
**Nội dung:** chọn sản phẩm và chia việc

## Kết luận
- Chọn 2 sản phẩm: **hộp kem dưỡng** và **sách khâu chỉ**
- Dùng CSDL Excel của giảng viên, bổ sung 5 máy thành phẩm sách (giả định)

## Việc cần làm
- [x] Đọc 6 bài giảng – cả nhóm
- [x] Chốt thông số đơn hàng – Quốc Bảo
- [ ] Lập bảng hiệu suất giấy cho hộp – Quốc Bảo
- [ ] Bình trang ruột sách – Minh Anh`, BOT_A.id, 1400);
  note(F.f03, 'Thông số đơn hàng – Hộp', `# Đơn hàng 1 – Hộp kem dưỡng

- **Số lượng:** 50.000 hộp – giao trong 15 ngày
- **Kiểu dáng:** reverse tuck end, dán hông, không bồi sóng
- **Kích thước:** 50 × 50 × 150 mm (trải ≈ 215 × 280 mm)
- **Giấy:** Ivory 350 g/m²
- **Màu in:** 5/0 (CMYK + 1 pha)
- **GCBM:** màng mờ, UV bóng từng phần ~20%, ép nhũ logo 30×15 mm × 2`, BOT_B.id, 900);
  note(F.f04, 'Thông số đơn hàng – Sách', `# Đơn hàng 2 – Sách khâu chỉ

- **Số lượng:** 3.000 cuốn – 20 ngày
- **Khổ:** 14,5 × 20,5 cm · 240 trang (15 tay × 16)
- **Ruột:** Fort 80, in 1/1 · **Bìa:** Bristol 250, in 4/0, màng bóng + ép nhũ`, BOT_A.id, 880);
  note(F.f00, 'Câu hỏi cho giảng viên', `# Câu hỏi cho giảng viên

1. Máy thành phẩm sách chưa có trong CSDL – nhóm được tự giả định thông số không?
2. Khổ tờ in hộp: chọn theo nesting hay theo bảng hiệu suất như nhãn?

> Ghi câu trả lời ngay bên dưới.`, BOT_A.id, 120);

  // ---------- bảng trắng: quy trình hộp ----------
  const bid = uuid();
  t.boards.push({ id: bid, folder_id: F.f05, name: 'Quy trình sản xuất hộp', created_by: BOT_B.id, created_at: ago(500) });
  const steps = [['Chế bản\nCTP 5 bản', '#bfdbfe'], ['In L640\n5 màu', '#fde68a'], ['Dán màng mờ\nDM1', '#fde68a'], ['UV từng phần\nTP1', '#fde68a'], ['Ép nhũ\nen1', '#fde68a'], ['Bế TĐ1', '#bbf7d0'], ['Xé rìa', '#bbf7d0'], ['Dán hộp\nDH1', '#bbf7d0'], ['Kiểm tra\nĐóng gói', '#ddd6fe']];
  let z = 1;
  // xếp hình chữ S: hàng 1 trái → phải, hàng 2 phải → trái
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
  t.boards.push({ id: uuid(), folder_id: F.f05, name: 'Quy trình sách', created_by: BOT_A.id, created_at: ago(300) });

  // ---------- bảng dữ liệu ----------
  const table = (folder, name, tpl, by, edits = {}) => {
    const T = TABLE_TEMPLATES[tpl]; const id = uuid();
    t.data_tables.push({ id, folder_id: folder, name, columns: T.columns, created_by: by, created_at: ago(1000) });
    T.rows.forEach((vals, i) => t.data_rows.push({ id: uuid(), table_id: id, position: i, updated_by: by, updated_at: ago(1000), cells: { ...Object.fromEntries(T.columns.map((c, j) => [c.key, vals[j] ?? ''])), ...(edits[i] || {}) } }));
    return id;
  };
  table(F.f02, 'Dữ liệu máy (CSDL thiết bị)', 'Dữ liệu máy (CSDL thiết bị)', BOT_A.id);
  table(F.f03, 'Thông số đơn hàng – Hộp', 'Thông số đơn hàng – Hộp', BOT_B.id);
  table(F.f04, 'Thông số đơn hàng – Sách', 'Thông số đơn hàng – Sách', BOT_A.id);
  table(F.f06, 'Giá vật tư', 'Giá vật tư', BOT_A.id);
  table(F.f08, 'Phân công công việc', 'Phân công công việc', BOT_A.id, { 0: { phutrach: BOT_A.id, trangthai: 'Xong' }, 1: { phutrach: BOT_B.id, trangthai: 'Đang làm' }, 2: { phutrach: BOT_A.id, trangthai: 'Đang làm' } });

  const pid = uuid();
  t.data_tables.push({ id: pid, folder_id: null, name: PROGRESS_NAME, columns: PROGRESS_COLUMNS, created_by: BOT_A.id, created_at: ago(2000) });
  STEPS.forEach(([a, b], i) => t.data_rows.push({ id: uuid(), table_id: pid, position: i, updated_by: BOT_A.id, updated_at: ago(2000), cells: { buoc: String(i + 1), noidung: a, ghichu: b, trangthai: i === 0 ? 'Xong' : i === 1 || i === 2 ? 'Đang làm' : 'Chưa làm', phutrach: i === 0 ? BOT_A.id : i === 2 ? BOT_B.id : '' } }));

  // ---------- hoạt động ----------
  [[BOT_A.id, 'tạo bảng', PROGRESS_NAME, 2000], [BOT_A.id, 'đã tải lên', '2. CƠ SỞ DỮ LIỆU.xlsx → 01. Phương án nhà máy & CSDL', 1900], [BOT_A.id, 'tạo bảng dữ liệu', 'Dữ liệu máy (CSDL thiết bị)', 1000],
   [BOT_B.id, 'tạo bảng trắng', 'Quy trình sản xuất hộp', 500], [BOT_B.id, 'đã cập nhật v2', 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', 45], [BOT_B.id, 'bắt đầu sửa', 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', 20]]
    .forEach(([u, action, target, min], i) => t.activity.push({ id: i + 1, user_id: u, action, target, created_at: ago(min) }));

  return { t, blobs, folders: F, boardId: bid, wordId: word };
}
