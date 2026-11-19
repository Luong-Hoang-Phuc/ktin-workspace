// Dữ liệu ban đầu (dùng cho bản xem thử và để sinh supabase/setup.sql)
import { SECTIONS, COMPANY_SHEETS, PRODUCT_SHEETS, sheetRows, machineCatalog, MACHINE_COLUMNS, FACTORY_STAGES, PLAN_DEFAULTS, EFFECTS,
  PRODUCTS_DEFAULT, LECTURER_FILES, PROGRESS_NAME, PROGRESS_COLUMNS, STEPS, CHECKPOINTS } from './views/templates.js';
import { computeSheet, parseNum, serialToISO, dateToSerial } from './formula.js';

export const BOT_A = { id: 'u-minhanh', email: 'minhanh@nhom-ktin.vn', display_name: 'Minh Anh', color: '#4f6b3a' };
export const BOT_B = { id: 'u-quocbao', email: 'quocbao@nhom-ktin.vn', display_name: 'Quốc Bảo', color: '#3b5a7a' };

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const txt = (s) => 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(s)));

// demo = true: thêm 2 bạn giả lập, file mẫu, ghi chú, bảng trắng, hoạt động
export function buildSeed(uuid, { demo = true } = {}) {
  const t = { profiles: [], products: [], folders: [], machines: [], factory_nodes: [], product_plans: [], files: [], notes: [], boards: [], board_items: [], data_tables: [], data_rows: [], activity: [], settings: [] };
  const blobs = {};
  const meta = { products: {}, folders: {} };
  const A = demo ? BOT_A.id : null, B = demo ? BOT_B.id : null;
  if (demo) t.profiles.push({ ...BOT_A, created_at: ago(3000) }, { ...BOT_B, created_at: ago(3000) });
  t.settings.push({ id: 'canva_url', value: '', updated_by: null, updated_at: ago(3000) });
  t.settings.push({ id: 'machine_columns', value: JSON.stringify(MACHINE_COLUMNS), updated_by: null, updated_at: ago(3000) });

  // ---------- thư mục ----------
  const folder = (product_id, section, name, position, icon = '') => { const id = uuid(); t.folders.push({ id, parent_id: null, product_id, section, name, icon, position, created_at: ago(3000) }); return id; };
  meta.folders.factory = folder(null, 'factory', 'Phương án nhà máy (chung)', 0, '🏭');
  meta.folders.lecturer = folder(null, 'lecturer', 'Tài liệu giảng viên', 1, '📚');
  meta.folders.team = folder(null, 'team', 'Tài liệu nhóm', 2, '🗂️');
  meta.folders.board = folder(null, 'board', 'Bảng trắng nhóm', 3, '✏️');
  PRODUCTS_DEFAULT.forEach((p, i) => {
    const id = uuid(); meta.products[p.kind] = id;
    t.products.push({ id, ...p, image_path: null, position: i, created_at: ago(3000) });
    SECTIONS.filter(s => !s.company).forEach((s, j) => { meta.folders[`${p.kind}:${s.key}`] = folder(id, s.key, s.label, j); });
  });
  const F = meta.folders;

  // ---------- máy & cây nhà máy (chung công ty) ----------
  const mid = {};
  machineCatalog().forEach((m, i) => { const id = uuid(); mid[m.name] = id; t.machines.push({ id, name: m.name, cells: m.cells, position: i, updated_by: A, updated_at: ago(2000) }); });
  const sid = {};
  FACTORY_STAGES.forEach(([phase, name, line, tag, machines], si) => {
    const id = uuid(); sid[name] = id;
    t.factory_nodes.push({ id, product_id: null, parent_id: null, kind: 'stage', name, phase, line, tag, machine_id: null, position: si, updated_by: A, updated_at: ago(1800) });
    machines.forEach((m, mi) => t.factory_nodes.push({ id: uuid(), product_id: null, parent_id: id, kind: 'machine', name: m, phase: null, line: null, tag: null, machine_id: mid[m] || null, position: mi, updated_by: A, updated_at: ago(1800) }));
  });

  // ---------- phương án sản xuất ----------
  for (const p of PRODUCTS_DEFAULT) {
    const d = PLAN_DEFAULTS[p.kind];
    const steps = {};
    for (const [name, ms] of Object.entries(d.steps)) steps[sid[name]] = { on: true, machines: ms.map(m => mid[m]).filter(Boolean), note: '' };
    t.product_plans.push({ id: meta.products[p.kind], product_id: meta.products[p.kind], effects: d.effects.filter(e => EFFECTS.some(x => x.key === e)),
      print: d.print.map(({ machine, ...x }) => ({ ...x, machine_id: mid[machine] || null })), steps, updated_by: A, updated_at: ago(900) });
  }

  // ---------- bảng tính ----------
  const addSheet = (folderId, T, by, rowsOverride) => {
    const id = uuid();
    t.data_tables.push({ id, folder_id: folderId, name: T.name, columns: T.columns, created_by: by, created_at: ago(1000) });
    (rowsOverride || sheetRows(T)).forEach((cells, i) => t.data_rows.push({ id: uuid(), table_id: id, position: i, updated_by: by, updated_at: ago(1000), cells }));
    return id;
  };
  COMPANY_SHEETS.forEach(T => addSheet(F.factory, T, A));
  for (const p of PRODUCTS_DEFAULT) {
    const S = PRODUCT_SHEETS[p.kind];
    const ex = p.kind === 'hop' ? hopExample(S) : {};
    for (const [sec, list] of Object.entries(S)) list.forEach(T => {
      const id = addSheet(F[`${p.kind}:${sec}`], T, p.kind === 'hop' ? B : A, ex[T.name]);
      if (sec === 'time') meta[`${p.kind}:time`] = id;
    });
    // tiến độ đồ án: để trống
    const pid = uuid();
    t.data_tables.push({ id: pid, folder_id: F[`${p.kind}:overview`], name: PROGRESS_NAME, columns: PROGRESS_COLUMNS, created_by: null, created_at: ago(2000) });
    STEPS.forEach(([a, b], i) => t.data_rows.push({ id: uuid(), table_id: pid, position: i, updated_by: null, updated_at: ago(2000), cells: { buoc: String(i + 1), noidung: a, ghichu: b, trangthai: 'Chưa làm', phutrach: '' } }));
  }

  if (!demo) return { t, blobs, meta };

  // ---------- tài liệu (bản xem thử) ----------
  const file = (fid, name, by, min, extra = {}) => {
    const id = uuid(), path = `${fid}/${id}`;
    blobs[path] = txt(`Tệp mẫu của bản xem thử: ${name}`);
    t.files.push({ id, folder_id: fid, name, storage_path: path, size: 20000 + Math.round(Math.random() * 900000), mime: '', version: 1, parent_file_id: null, uploaded_by: by, created_at: ago(min), updated_at: ago(min), ...extra });
    return id;
  };
  LECTURER_FILES.forEach((n, i) => file(F.lecturer, n, null, 2900 - i));
  meta.wordId = file(F.team, 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', B, 45, { version: 2, locked_by: B, locked_at: ago(20), description: 'Khung báo cáo – đang điền chương 3' });
  const oldId = uuid(); blobs[`${F.team}/${oldId}`] = txt('v1');
  t.files.push({ id: oldId, folder_id: F.team, name: 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', storage_path: `${F.team}/${oldId}`, size: 61000, mime: '', version: 1, parent_file_id: meta.wordId, uploaded_by: A, created_at: ago(1500), updated_at: ago(1500) });
  t.files.push({ id: uuid(), folder_id: F.team, name: 'Báo cáo chung – bản gõ chung (Word Online)', storage_path: '', external_url: 'https://www.office.com/', version: 1, parent_file_id: null, uploaded_by: A, created_at: ago(200), updated_at: ago(200) });
  file(F['hop:specs'], 'Khai trien hop 50x50x150.pdf', B, 300, { description: 'Bản vẽ khai triển reverse tuck end' });
  file(F['hop:specs'], 'Anh hop tham khao.jpg', A, 280, { mime: 'image/jpeg' });
  file(F['hop:plan'], 'Layout to in 65x86 - 8 hop.pdf', B, 160, { description: 'Nesting 8 hộp / tờ' });
  file(F['sach:plan'], 'Bang hieu suat giay ruot sach.xlsx', A, 150);
  file(F.factory, 'So do quy trinh cong ty (nhap).pdf', B, 600);

  // ---------- ghi chú ----------
  const note = (fid, title, content, by, min) => t.notes.push({ id: uuid(), folder_id: fid, title, content, updated_by: by, created_at: ago(min), updated_at: ago(min) });
  note(F['hop:plan'], 'Câu hỏi cho giảng viên', `# Câu hỏi cho giảng viên

1. Máy thành phẩm sách chưa có trong CSDL – nhóm được tự giả định thông số không?
2. Khổ tờ in hộp: chọn theo nesting hay theo bảng hiệu suất như nhãn?

> Ghi câu trả lời ngay bên dưới.`, A, 120);
  note(F.factory, 'Ghi chú phương án nhà máy', `# Ghi chú

- Nhà máy dùng chung cho cả Hộp và Sách
- Chưa có máy **dập nổi** trong CSDL → nếu dùng phải bổ sung
- [ ] Hỏi lại khổ max của en1`, B, 500);
  note(F['hop:cost'], 'Giải thích giá thành', `# Giá thành hộp

- Số liệu NVL chính, điện, lương, khấu hao đang **chép tay** từ mục 5–6 (minh hoạ)
- Bước sau: liên kết tự động giữa các mục`, B, 90);

  // ---------- bảng trắng nhóm ----------
  const bid = uuid(); meta.boardId = bid;
  t.boards.push({ id: bid, folder_id: F.board, name: 'Phác thảo quy trình hộp', created_by: B, created_at: ago(500) });
  const steps = [['Chế bản\nCTP 5 bản', '#bfdbfe'], ['In L640\n5 màu', '#fde68a'], ['Dán màng mờ\nDM1', '#fde68a'], ['UV từng phần\nTP1', '#fde68a'], ['Ép nhũ\nen1', '#fde68a'], ['Bế TĐ1', '#bbf7d0'], ['Xé rìa', '#bbf7d0'], ['Dán hộp\nDH1', '#bbf7d0'], ['Kiểm tra\nĐóng gói', '#ddd6fe']];
  let z = 1;
  const pos = (i) => { const row = Math.floor(i / 5), c = i % 5, col = row % 2 ? 4 - c : c; return { row, x: 40 + col * 230, y: 60 + row * 230 }; };
  steps.forEach(([text, color], i) => {
    const p = pos(i);
    t.board_items.push({ id: uuid(), board_id: bid, kind: 'sticky', z: z++, data: { x: p.x, y: p.y, w: 170, h: 120, text, color }, updated_by: B, updated_at: ago(400) });
    if (i < steps.length - 1) {
      const q = pos(i + 1);
      const a = q.row !== p.row ? { x1: p.x + 85, y1: p.y + 125, x2: q.x + 85, y2: q.y - 8 } : q.x > p.x ? { x1: p.x + 175, y1: p.y + 60, x2: q.x - 8, y2: q.y + 60 } : { x1: p.x - 5, y1: p.y + 60, x2: q.x + 178, y2: q.y + 60 };
      t.board_items.push({ id: uuid(), board_id: bid, kind: 'arrow', z: z++, data: { ...a, color: '#1f2937' }, updated_by: B, updated_at: ago(400) });
    }
  });
  t.board_items.push({ id: uuid(), board_id: bid, kind: 'text', z: z++, data: { x: 40, y: 0, w: 700, h: 50, text: 'Phác thảo – Hộp kem dưỡng 50.000 hộp', color: '#2563eb', size: 22 }, updated_by: B, updated_at: ago(400) });

  [[A, 'đã tải lên', 'Tài liệu giảng viên (7 file)', 2000, null], [A, 'nhập CSDL doanh nghiệp', 'Thiết bị, vật tư, đơn giá, tham số chung', 1800, null],
   [B, 'lập phương án sản xuất', 'Hộp: màng mờ, UV từng phần, ép nhũ', 900, 'hop'], [B, 'tính thời gian sản xuất', 'Hộp – 9 công đoạn', 300, 'hop'],
   [B, 'đã cập nhật v2', 'Khung_Do_an_KTTCSX_In_Hop_Sach.docx', 45, null]]
    .forEach(([u, action, target, min, kind], i) => t.activity.push({ id: i + 1, user_id: u, action, target, product_id: kind ? meta.products[kind] : null, created_at: ago(min) }));

  return { t, blobs, meta };
}

// Ví dụ Hộp: chép kết quả của mục 5–6 sang lương, khấu hao, giá thành, kế hoạch (minh hoạ – chưa liên kết tự động)
function hopExample(S) {
  const out = {};
  const evalT = (T) => { const rows = sheetRows(T).map(cells => ({ cells })); return { rows, s: computeSheet(T.columns, rows) }; };
  const mat = evalT(S.materials[0]);
  const time = evalT(S.time[0]);
  const machines = Object.fromEntries(machineCatalog().map(m => [m.name, m.cells]));
  const round2 = (x) => Math.round(x * 100) / 100;
  const tl = time.rows.map((r, i) => ({ congdoan: r.cells.congdoan, may: r.cells.may, tlv: round2(parseNum(time.s.get(i, 'tlv')) || 0) }));
  out['Lương công nhân trực tiếp'] = tl.map(x => ({ congdoan: x.congdoan, may: x.may, luongthang: machines[x.may]?.luong || '', giokip: 2400, tlv: x.tlv }));
  out['Khấu hao máy móc thiết bị'] = tl.filter(x => parseNum(machines[x.may]?.giamay)).map(x => ({ may: x.may, giamay: machines[x.may].giamay, namkh: machines[x.may].namkh, giomay: 4800, tlv: x.tlv }));
  const sumOf = (rows, cols, key) => computeSheet(cols, rows.map(cells => ({ cells }))).total(key) || 0;
  const C = S.cost;
  const nvlc = Math.round(mat.s.total('thanhtien'));
  const dien = Math.round(time.s.total('dien') * 1500);
  const luong = Math.round(sumOf(out['Lương công nhân trực tiếp'], C[1].columns, 'cpluong'));
  const kh = Math.round(sumOf(out['Khấu hao máy móc thiết bị'], C[2].columns, 'cpkh'));
  const cost = sheetRows(C[0]);
  const set = (ma, v, note) => { const r = cost.find(x => x.ma === ma); r.giatri = v; if (note) r.cancu = note; };
  set('NVLC', nvlc, 'Tổng thành tiền mục 5 (chép tay – minh hoạ)');
  set('NL', dien, `Điện năng mục 6 × 1.500 đ/kWh (chép tay)`);
  set('LUONG', luong); set('KH', kh);
  out['Tổng hợp giá thành'] = cost;
  const VT = { 'Chế bản – làm file': '', 'Chế tạo khuôn in (CTP)': 'Bản kẽm × 5', 'In offset': 'Giấy Ivory 350, mực CMYK + pha', 'Dán màng': 'Màng mờ 1, keo dán màng', 'Tráng phủ UV': 'Verni UV loại 1, khuôn UV', 'Ép nhũ': 'Nhũ loại 1, khuôn nhũ × 16', 'Bế': 'Khuôn bế 8 con', 'Xé rìa': '', 'Dán hộp': 'Keo dán hộp' };
  let day = dateToSerial('2026-11-23');
  out['Kế hoạch sản xuất'] = [...tl, { congdoan: 'Kiểm tra – đóng gói', may: '', tlv: 8 }].map(x => {
    const n = Math.max(1, Math.ceil(x.tlv / 16)); const r = { congdoan: x.congdoan, may: x.may, vattu: VT[x.congdoan] || '', tlv: x.tlv, batdau: serialToISO(day), checkpoint: CHECKPOINTS[x.congdoan] || '', trangthai: 'Chưa bắt đầu' };
    day += n; return r;
  });
  return out;
}
