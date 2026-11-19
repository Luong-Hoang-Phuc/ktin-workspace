// =====================================================================
// Cấu trúc & dữ liệu mẫu của đồ án (trích "2. CƠ SỞ DỮ LIỆU.xlsx" của giảng viên + giả định đã chốt)
// Công thức lưu theo khoá cột: {khoa}@ = cùng dòng, {khoa}3 = dòng 3 (xem js/formula.js)
// =====================================================================
const C = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const N = (key, label, extra = {}) => C(key, label, 'number', extra);
const F = (key, label, formula, extra = {}) => C(key, label, 'number', { formula, ...extra });

// ---------- Mục làm việc ----------
// Trang xem: 3 tab (Hiển thị · Tệp đính kèm · Ghi chú). Cơ sở dữ liệu: nơi nhập liệu kiểu Excel.
export const SECTIONS = [
  { key: 'overview', label: 'Tổng quan', icon: '◎' },
  { key: 'factory', label: 'Phương án nhà máy', n: 1, company: true },
  { key: 'specs', label: 'Thông số sản phẩm', n: 2 },
  { key: 'plan', label: 'Phương án sản xuất', n: 3 },
  { key: 'workload', label: 'Khối lượng công việc', n: 4 },
  { key: 'materials', label: 'Dự trù vật tư', n: 5 },
  { key: 'time', label: 'Thời gian sản xuất', n: 6 },
  { key: 'cost', label: 'Giá thành', n: 7 },
  { key: 'schedule', label: 'Kế hoạch sản xuất', n: 8 },
];
export const WORK_SECTIONS = SECTIONS.filter(s => s.n);
export const VIEW_TABS = [['view', 'Hiển thị'], ['files', 'Tệp đính kèm'], ['notes', 'Ghi chú']];
export const LINES = { chung: 'Chung', hop: 'Hộp', sach: 'Sách' };

// ---------- Thiết bị ----------
export const MACHINE_COLUMNS = [
  C('khomax', 'Khổ max (dọc × ngang, cm)'), C('khomin', 'Khổ min (cm)'), N('somau', 'Số màu'),
  N('ns', 'Năng suất'), C('dv', 'Đơn vị NS'), N('canhbai', 'T canh bài (h)'),
  N('ngungcn', '% ngừng CN / T máy chạy'), N('tcsx', '% ngừng TCSX / T làm việc'), N('kt', '% ngừng KT / T làm việc'),
  N('kw', 'Công suất điện (kW)'), N('luong', 'Lương 1 kíp / tháng', { fmt: 'vnd' }), N('giamay', 'Giá máy', { fmt: 'vnd' }), N('namkh', 'Số năm khấu hao'),
  C('nguon', 'Nguồn số liệu', 'select', { options: ['CSDL', 'Giả định'] }),
];
//               tên,                khomax,    khomin,  màu, NS,    đv,      canh, CN, TCSX, KT, kW, lương,    giá máy,       năm, nguồn
const MACHINE_ROWS = [
  ['Máy tính',           '',        '',      '', 1,     'bài/h',   0.5,  20, 10, 8, 0.5, 8000000,  15000000,      1, 'CSDL'],
  ['Máy ghi – hiện',     '',        '',      '', 30,    'kẽm/h',   0.25, 10, 10, 8, 10,  8000000,  1500000000,    3, 'CSDL'],
  ['CD 102-4',           '72 × 102', '34 × 40', 4, 8000, 'tua/h',  1,    15, 10, 8, 45,  23000000, 10000000000,   6, 'CSDL'],
  ['DAIYA',              '65 × 86',  '21 × 28', 5, 7000, 'tua/h',  1,    15, 10, 8, 40,  20000000, 4000000000,    6, 'CSDL'],
  ['L640',               '72 × 102', '34 × 40', 6, 7000, 'tua/h',  1,    15, 10, 8, 50,  20000000, 5000000000,    6, 'CSDL'],
  ['SM102',              '72 × 102', '34 × 40', 4, 9000, 'tua/h',  1,    15, 10, 8, 45,  21000000, 12000000000,   6, 'CSDL'],
  ['TP1',                '72 × 102', '34 × 40', '', 5000, 'tua/h', 0.5,  10, 10, 8, 15,  10000000, 400000000,     5, 'CSDL'],
  ['TP2',                '72 × 102', '34 × 40', '', 4000, 'tua/h', 0.5,  10, 10, 8, 15,  10000000, 350000000,     5, 'CSDL'],
  ['CẮT 1',              'rộng 115', '',      '', 60,    'xấp/h',   0.2,  30, 20, 8, 10,  7000000,  300000000,     3, 'CSDL'],
  ['CẮT 2',              'rộng 115', '',      '', 60,    'xấp/h',   0.2,  30, 20, 8, 10,  7000000,  250000000,     3, 'CSDL'],
  ['DM1',                '72 × 102', '',      '', 2400,  'm/h',     0.25, 15, 20, 8, 10,  8000000,  300000000,     5, 'CSDL'],
  ['DM2',                '72 × 102', '',      '', 1800,  'm/h',     0.25, 15, 20, 8, 10,  8000000,  250000000,     5, 'CSDL'],
  ['calen 1',            '',        '',      '', 2500,  'tua/h',   0.5,  15, 15, 8, 15,  10000000, 200000000,     5, 'CSDL'],
  ['Kéo lụa máy',        '',        '',      '', 1200,  'SP/h',    0,    0,  0,  0, 5,   4000000,  0,             1, 'CSDL'],
  ['Kéo lụa thủ công',   '',        '',      '', 400,   'SP/h',    0,    0,  0,  0, '',  4000000,  0,             1, 'CSDL'],
  ['en1',                '',        '',      '', 600,   'tua/h',   0.5,  15, 15, 8, 8,   5000000,  120000000,     5, 'CSDL'],
  ['en2',                '',        '',      '', 600,   'tua/h',   0.5,  15, 15, 8, 8,   5000000,  120000000,     5, 'CSDL'],
  ['BỒI 1',              '',        '',      '', 2000,  'tua/h',   0.25, 20, 15, 8, 10,  6000000,  200000000,     5, 'CSDL'],
  ['TC2',                '60 × 84',  '21 × 28', '', 600, 'tua/h',  1,    15, 15, 8, 8,   5000000,  120000000,     5, 'CSDL'],
  ['TĐ1',                '75 × 105', '34 × 40', '', 4000, 'tua/h', 1.5,  15, 15, 8, 15,  10000000, 800000000,     5, 'CSDL'],
  ['Xé rìa thủ công',    '',        '',      '', 3000,  'SP/h',    0,    0,  0,  0, '',  4000000,  0,             1, 'CSDL'],
  ['Dán cửa sổ thủ công', '',       '',      '', 300,   'SP/h',    0,    0,  0,  0, '',  4000000,  0,             1, 'CSDL'],
  ['DH1',                '',        '',      '', 3000,  'm/h',     0.5,  15, 15, 8, 10,  10000000, 400000000,     5, 'CSDL'],
  ['DH2',                '',        '',      '', 3000,  'm/h',     0.5,  15, 15, 8, 10,  10000000, 400000000,     5, 'CSDL'],
  ['G1',                 '',        '',      '', 6000,  'tờ/h',    0.5,  15, 10, 8, 8,   8000000,  600000000,     5, 'Giả định'],
  ['BC1',                '',        '',      '', 3000,  'cuốn/h',  0.5,  15, 10, 8, 10,  9000000,  1200000000,    5, 'Giả định'],
  ['KC1',                '',        '',      '', 5000,  'tay/h',   0.5,  15, 10, 8, 6,   9000000,  1500000000,    6, 'Giả định'],
  ['VB1',                '',        '',      '', 1500,  'cuốn/h',  1,    20, 10, 8, 25,  12000000, 2000000000,    6, 'Giả định'],
  ['X3',                 '',        '',      '', 1000,  'cuốn/h',  0.25, 15, 10, 8, 8,   8000000,  700000000,     5, 'Giả định'],
];
export function machineCatalog() {
  return MACHINE_ROWS.map(([name, ...vals]) => ({ name, cells: Object.fromEntries(MACHINE_COLUMNS.map((c, j) => [c.key, vals[j] ?? ''])) }));
}

// Quy trình chung của công ty: Khâu → Công đoạn (dùng cho dòng SP nào) → Máy
export const PHASES = ['Trước in', 'In', 'Gia công bề mặt', 'Định hình – thành phẩm', 'Kiểm tra – đóng gói'];
export const FACTORY_STAGES = [
  ['Trước in', 'Chế bản – làm file', 'chung', '', ['Máy tính']],
  ['Trước in', 'Chế tạo khuôn in (CTP)', 'chung', '', ['Máy ghi – hiện']],
  ['In', 'In offset tờ rời', 'chung', 'in', ['CD 102-4', 'DAIYA', 'L640', 'SM102']],
  ['Gia công bề mặt', 'Dán màng', 'chung', 'mang', ['DM1', 'DM2']],
  ['Gia công bề mặt', 'Tráng phủ (UV / gốc nước)', 'chung', 'phu', ['TP1', 'TP2']],
  ['Gia công bề mặt', 'Cán calendering', 'chung', 'calen', ['calen 1']],
  ['Gia công bề mặt', 'Kéo lụa', 'chung', 'lua', ['Kéo lụa máy', 'Kéo lụa thủ công']],
  ['Gia công bề mặt', 'Ép nhũ', 'chung', 'nhu', ['en1', 'en2']],
  ['Gia công bề mặt', 'Dập nổi / dập chìm', 'chung', 'dap', []],
  ['Định hình – thành phẩm', 'Cắt', 'chung', '', ['CẮT 1', 'CẮT 2']],
  ['Định hình – thành phẩm', 'Bồi sóng', 'hop', 'boi', ['BỒI 1']],
  ['Định hình – thành phẩm', 'Bế', 'chung', 'be', ['TC2', 'TĐ1']],
  ['Định hình – thành phẩm', 'Xé rìa', 'hop', '', ['Xé rìa thủ công']],
  ['Định hình – thành phẩm', 'Dán cửa sổ', 'hop', 'cuaso', ['Dán cửa sổ thủ công']],
  ['Định hình – thành phẩm', 'Dán hộp', 'hop', '', ['DH1', 'DH2']],
  ['Định hình – thành phẩm', 'Gấp', 'sach', '', ['G1']],
  ['Định hình – thành phẩm', 'Bắt cuốn', 'sach', '', ['BC1']],
  ['Định hình – thành phẩm', 'Khâu chỉ', 'sach', '', ['KC1']],
  ['Định hình – thành phẩm', 'Vào bìa', 'sach', '', ['VB1']],
  ['Định hình – thành phẩm', 'Xén 3 mặt', 'sach', '', ['X3']],
  ['Kiểm tra – đóng gói', 'Kiểm tra – đóng gói', 'chung', '', []],
];

// ---------- Phương án sản xuất ----------
export const EFFECTS = [
  { key: 'mang_bong', label: 'Dán màng bóng', tag: 'mang' },
  { key: 'mang_mo', label: 'Dán màng mờ', tag: 'mang' },
  { key: 'uv_toan', label: 'Tráng UV toàn phần', tag: 'phu' },
  { key: 'uv_tung', label: 'UV bóng từng phần', tag: 'phu' },
  { key: 'goc_nuoc', label: 'Tráng phủ gốc nước', tag: 'phu' },
  { key: 'calen', label: 'Cán calendering (cán gương)', tag: 'calen' },
  { key: 'lua', label: 'Kéo lụa hiệu ứng', tag: 'lua' },
  { key: 'nhu', label: 'Ép nhũ', tag: 'nhu' },
  { key: 'dap', label: 'Dập nổi / dập chìm', tag: 'dap' },
  { key: 'cuaso', label: 'Bế + dán cửa sổ', tag: 'cuaso', line: 'hop' },
  { key: 'boi', label: 'Bồi sóng', tag: 'boi', line: 'hop' },
];
export const PRINT_METHODS = ['Offset tờ rời', 'Offset cuộn', 'Flexo', 'Ống đồng', 'In lụa', 'Kỹ thuật số'];
export const PRINT_MODES = ['In 1 mặt', 'In A-B (2 bộ khuôn)', 'In tự trở nhíp', 'In tự trở đầu'];
export const PLAN_DEFAULTS = {
  hop: {
    effects: ['mang_mo', 'uv_tung', 'nhu'],
    print: [{ name: 'Hộp', paper: 'Ivory 350 g/m²', method: 'Offset tờ rời', front: 5, back: 0, colors: 'CMYK + 1 màu pha', mode: 'In 1 mặt', machine: 'L640' }],
    steps: { 'Chế bản – làm file': ['Máy tính'], 'Chế tạo khuôn in (CTP)': ['Máy ghi – hiện'], 'In offset tờ rời': ['L640'], 'Dán màng': ['DM1'], 'Tráng phủ (UV / gốc nước)': ['TP1'], 'Ép nhũ': ['en1'], 'Bế': ['TĐ1'], 'Xé rìa': ['Xé rìa thủ công'], 'Dán hộp': ['DH1'], 'Kiểm tra – đóng gói': [] },
  },
  sach: {
    effects: ['mang_bong', 'nhu'],
    print: [
      { name: 'Ruột', paper: 'Fort 80 g/m²', method: 'Offset tờ rời', front: 1, back: 1, colors: 'Đen', mode: 'In tự trở nhíp', machine: 'CD 102-4' },
      { name: 'Bìa', paper: 'Bristol 250 g/m²', method: 'Offset tờ rời', front: 4, back: 0, colors: 'CMYK', mode: 'In 1 mặt', machine: 'SM102' }],
    steps: { 'Chế bản – làm file': ['Máy tính'], 'Chế tạo khuôn in (CTP)': ['Máy ghi – hiện'], 'In offset tờ rời': ['CD 102-4', 'SM102'], 'Cắt': ['CẮT 1'], 'Dán màng': ['DM1'], 'Ép nhũ': ['en1'], 'Bế': ['TĐ1'], 'Gấp': ['G1'], 'Bắt cuốn': ['BC1'], 'Khâu chỉ': ['KC1'], 'Vào bìa': ['VB1'], 'Xén 3 mặt': ['X3'], 'Kiểm tra – đóng gói': [] },
  },
};

// =====================================================================
// BẢNG TÍNH (sheet). rows chỉ chứa giá trị cho các cột KHÔNG phải công thức cả cột, theo thứ tự cột.
// =====================================================================
const sheet = (name, columns, rows = []) => ({ name, columns, rows });
export function sheetRows(T) {
  const inputs = T.columns.filter(c => !c.formula);
  return T.rows.map(vals => Object.fromEntries(inputs.map((c, j) => [c.key, vals[j] ?? ''])));
}

// ---------- 1. CSDL doanh nghiệp (dùng chung cho Hộp và Sách) ----------
export const COMPANY_SHEETS = [
  sheet('Tham số chung', [C('ma', 'Mã', 'text', { width: 70 }), C('thamso', 'Tham số', 'text', { width: 300 }), N('giatri', 'Giá trị', { sum: false }), C('dv', 'Đơn vị'), C('ghichu', 'Ghi chú', 'text', { width: 240 })], [
    ['NGAY', 'Số ngày làm việc / năm', 300, 'ngày', 'Giả định của nhóm'],
    ['CA', 'Số ca / ngày', 2, 'ca', ''],
    ['GIO', 'Số giờ / ca', 8, 'h', ''],
    ['GIOMAY', 'Giờ máy làm việc / năm', '={giatri}1*{giatri}2*{giatri}3', 'h', 'Dùng tính khấu hao / giờ'],
    ['GIOKIP', 'Giờ làm việc / năm của 1 kíp thợ', '={giatri}1*{giatri}3', 'h', 'Dùng tính lương / giờ'],
    ['DIEN', 'Giá điện', 1500, 'đ/kWh', 'Theo ví dụ của giảng viên'],
    ['BH', 'BHXH + BHYT + BHTN + KPCĐ (doanh nghiệp trả)', 23.5, '% lương', '17,5 + 3 + 1 + 2'],
    ['NVLP', 'Nguyên vật liệu phụ', 3, '% NVL chính', 'Giả định'],
    ['SXC', 'Chi phí sản xuất chung khác', 20, '% lương CNTT', 'Giả định'],
    ['QLDN', 'Chi phí quản lý doanh nghiệp', 10, '% giá thành SX', 'Giả định'],
    ['BHG', 'Chi phí bán hàng', 3, '% giá thành SX', 'Giả định'],
    ['LN', 'Lợi nhuận mong muốn', 15, '% giá thành toàn bộ', 'Giả định'],
  ]),
  sheet('Giá giấy', [C('loai', 'Loại giấy', 'text', { width: 230 }), N('ma', 'Mã định mức'), N('gia', 'Giá (đ/tấn)', { fmt: 'vnd', sum: false }), C('ghichu', 'Ghi chú', 'text', { width: 260 })], [
    ['BRISTOL', 2, 25000000], ['COUCHE 1 MẶT LÁNG', 2, 26000000], ['COUCHE 2 MẶT LÁNG', 2, 23000000], ['CRAFT', 1, 20000000], ['DECAL', 2, 23000000],
    ['GIẤY BỀN ẨM', 2, 30000000], ['GIẤY CRYSTAL', 2, 27000000], ['IVORY', 2, 25000000, 'File gốc lặp 2 dòng IVORY – giữ 1'], ['METALIZED', 2, 35000000],
    ['CACTON DUPLEX', 1, 20000000], ['METALIZED ĐẾ BRISTOL', 2, 35000000], ['METALIZED ĐẾ CACTON DUPLEX', 2, 30000000], ['FORT', 1, 17000000],
  ]),
  sheet('Bù hao giấy in (màu 1)', [N('luot1', 'Mã 1 – số lượt in từ', { sum: false }), N('bh1', 'Mã 1 – bù hao (%)', { sum: false }), N('luot2', 'Mã 2 – số lượt in từ', { sum: false }), N('bh2', 'Mã 2 – bù hao (%)', { sum: false }), C('ghichu', 'Ghi chú', 'text', { width: 330 })], (() => {
    const a = [[0, 3.08], [2000, 2.21], [3000, 1.98], [4000, 1.83], [5000, 1.78], [6000, 1.71], [7000, 1.65], [8000, 1.63], [9000, 1.62], [10000, 1.6], [11000, 1.57], [12000, 1.55], [13000, 1.53], [14000, 1.5], [15000, 1.45], [16000, 1.4], [17000, 1.28], [18000, 1.18], [19000, 1.05], [20000, 1], [35000, 0.95], [40000, 0.9]];
    const b = [[0, 7], [1000, 5], [2000, 3.5], [3000, 2.6], [4000, 2.45], [5000, 2.35], [6000, 2.28], [7000, 2.2], [8000, 2.15], [9000, 2.1], [10000, 2], [11000, 1.9], [12000, 1.8], [13000, 1.7], [14000, 1.6], [15000, 1.5], [16000, 1.4], [17000, 1.3], [18000, 1.2], [19000, 1.1], [20000, 1.05], [30000, 1], [35000, 0.95], [40000, 0.9], [50000, 0.85]];
    const notes = ['Mã 1: Fort, Cacton duplex, Craft', 'Mã 2: Bristol, Ivory, Couche, Decal, Metalized…', 'Bù hao công đoạn in = ĐM màu 1 × (1 + (số màu − 1) × 30%)'];
    return b.map((r, i) => [a[i]?.[0] ?? '', a[i]?.[1] ?? '', r[0], r[1], notes[i] || '']);
  })()),
  sheet('Bù hao giấy GCBM – thành phẩm', [C('nhom', 'Nhóm', 'text', { width: 170 }), C('congdoan', 'Công đoạn', 'text', { width: 180 }), C('dieukien', 'Điều kiện', 'text', { width: 200 }), N('bh', 'Bù hao (%)', { sum: false })], [
    ['Gia công bề mặt', 'Dán màng', '', 0.5], ['Gia công bề mặt', 'Tráng phủ', '', 1.25], ['Gia công bề mặt', 'Cán calendering', '', 0.3], ['Gia công bề mặt', 'Kéo lụa bóng', '', 0.3],
    ['Gia công bề mặt', 'Kéo lụa hiệu ứng', '', 0.3], ['Gia công bề mặt', 'Ép nhũ', '', 0.5], ['Gia công bề mặt', 'Dập nổi', '', 0.5], ['Gia công bề mặt', 'Cán gân', '', 0.5],
    ['Đóng sách, nhãn', 'Cắt', '', 0.3], ['Đóng sách, nhãn', 'Gấp', '', 0.5], ['Đóng sách, nhãn', 'Khâu chỉ', '', 1.3], ['Đóng sách, nhãn', 'Đóng ghim lồng', '', 1],
    ['Đóng sách, nhãn', 'Cà gáy, vào bìa', '', 0.5], ['Đóng sách, nhãn', 'Xén 3 mặt', '', 0.3], ['Đóng sách, nhãn', 'Bế thụt', '', 0.5],
    ['Dán hộp', 'Dán hông hộp', 'Số hộp từ 0', 1], ['Dán hộp', 'Dán hông hộp', 'Số hộp từ 20.000', 0.5], ['Dán hộp', 'Dán hông hộp', 'Số hộp từ 50.000', 0.3],
    ['Dán hộp', 'Dán hông và đáy hộp', 'Số hộp từ 0', 2], ['Dán hộp', 'Dán hông và đáy hộp', 'Số hộp từ 20.000', 1.5], ['Dán hộp', 'Dán hông và đáy hộp', 'Số hộp từ 50.000', 1.3],
    ['Bế từng tờ', 'Bế', 'Số tờ bế từ 0', 1.75], ['Bế từng tờ', 'Bế', 'Số tờ bế từ 2.500', 1.25], ['Bế từng tờ', 'Bế', 'Số tờ bế từ 5.000', 0.75], ['Bế từng tờ', 'Bế', 'Số tờ bế từ 10.000', 0.5],
    ['Vật tư', 'Cán màng – bù hao màng', '', 0.8], ['Vật tư', 'Ép nhũ – bù hao nhũ', '', 5],
  ]),
  sheet('Vật tư & định mức', [C('nhom', 'Nhóm', 'text', { width: 110 }), C('vattu', 'Vật tư', 'text', { width: 220 }), C('dvt', 'ĐVT'), N('gia', 'Đơn giá', { fmt: 'vnd', sum: false }), N('dm', 'Định mức tiêu hao', { sum: false }), C('dvdm', 'Đơn vị định mức', 'text', { width: 220 }), C('nguon', 'Nguồn', 'select', { options: ['CSDL', 'Giả định', 'Báo giá NCC'] })], [
    ['Mực', 'CMYK loại 1', 'kg', 120000, 5, 'kg / triệu trang 13×19 / màu', 'CSDL'], ['Mực', 'CMYK loại 2', 'kg', 140000, 5, 'kg / triệu trang 13×19 / màu', 'CSDL'],
    ['Mực', 'CMYK loại 3', 'kg', 150000, 5, 'kg / triệu trang 13×19 / màu (Fort, Duplex, Craft: 6)', 'CSDL'],
    ['Mực', 'Pha 1', 'kg', 200000, 55, 'kg / triệu trang 13×19 phủ thật (Fort, Duplex, Craft: 60)', 'CSDL'],
    ['Verni', 'UV loại 1', 'kg', 200000, 5.15, 'kg / 1.000 m² tráng phủ', 'CSDL'], ['Verni', 'UV loại 2', 'kg', 250000, 5.15, 'kg / 1.000 m²', 'CSDL'],
    ['Verni', 'UV loại 3', 'kg', 300000, 5.15, 'kg / 1.000 m²', 'CSDL'], ['Verni', 'UV loại 4', 'kg', 350000, 5.15, 'kg / 1.000 m²', 'CSDL'],
    ['Verni', 'Gốc nước loại 1', 'kg', 200000, 5.15, 'kg / 1.000 m²', 'CSDL'], ['Verni', 'Gốc nước loại 2', 'kg', 250000, 5.15, 'kg / 1.000 m²', 'CSDL'],
    ['Verni', 'Hiệu ứng 1', 'kg', 300000, 5.15, 'kg / 1.000 m²', 'CSDL'], ['Verni', 'Hiệu ứng 2', 'kg', 350000, 5.15, 'kg / 1.000 m²', 'CSDL'],
    ['Màng', 'Màng bóng 1', 'm²', 800, 1, 'm² / m²', 'CSDL'], ['Màng', 'Màng bóng 2', 'm²', 900, 1, 'm² / m²', 'CSDL'], ['Màng', 'Màng bóng 3', 'm²', 1000, 1, 'm² / m²', 'CSDL'],
    ['Màng', 'Màng mờ 1', 'm²', 1000, 1, 'm² / m²', 'CSDL'], ['Màng', 'Màng mờ 2', 'm²', 1100, 1, 'm² / m²', 'CSDL'], ['Màng', 'Màng mờ 3', 'm²', 1200, 1, 'm² / m²', 'CSDL'],
    ['Màng', 'Màng hiệu ứng 1', 'm²', 1200, 1, 'm² / m²', 'CSDL'], ['Màng', 'Màng hiệu ứng 2', 'm²', 1400, 1, 'm² / m²', 'CSDL'],
    ['Nhũ', 'Nhũ loại 1', 'cm²', 3, '', '', 'CSDL'], ['Nhũ', 'Nhũ loại 2', 'cm²', 4, '', '', 'CSDL'], ['Nhũ', 'Nhũ loại 3', 'cm²', 5, '', '', 'CSDL'],
    ['Keo', 'Keo dán màng', 'kg', 50000, 8, 'kg / 1.000 m²', 'CSDL'], ['Keo', 'Keo dán hộp', 'kg', 35000, 3150, 'm đường dán / kg', 'CSDL'],
    ['Keo', 'Keo nhiệt vào bìa', 'kg', 60000, '', '', 'Giả định'], ['Chỉ', 'Chỉ khâu', 'kg', 150000, '', '', 'Giả định'],
    ['Khuôn', 'Khuôn in (bản kẽm)', 'bản', 60000, 1, 'bản / màu / mặt', 'CSDL'],
    ['Khuôn', 'Khuôn tráng phủ UV bóng', 'khuôn', 200000, '', '', 'CSDL'], ['Khuôn', 'Khuôn tráng phủ UV mờ', 'khuôn', 200000, '', '', 'CSDL'],
    ['Khuôn', 'Khuôn kéo lụa bóng', 'khuôn', 2000, '', '', 'CSDL'], ['Khuôn', 'Khuôn kéo lụa hiệu ứng', 'khuôn', 2000, '', '', 'CSDL'],
    ['Khuôn', 'Khuôn ép nhũ', 'khuôn', 300000, '', '', 'CSDL'], ['Khuôn', 'Khuôn dập nổi', 'khuôn', 300000, '', '', 'CSDL'],
    ['Khuôn', 'Khuôn bế thụt', 'khuôn', 1000000, '', '', 'CSDL'], ['Khuôn', 'Khuôn bế từng tờ', 'khuôn', 200000, '', '', 'CSDL'],
  ]),
  sheet('Đơn giá lương sản phẩm', [C('nhom', 'Nhóm', 'text', { width: 150 }), C('khoan', 'Khoản', 'text', { width: 230 }), C('dv', 'Đơn vị'), N('dongia', 'Đơn giá (đ)', { sum: false })], [
    ['Chế bản', 'Bản in', 'cm²', 15], ['Chế bản', 'Tráng phủ', 'cm²', 200], ['Chế bản', 'Ép nhũ', 'cm²', 6000], ['Chế bản', 'Dập nổi', 'cm²', 6000], ['Chế bản', 'Kéo lụa', 'cm²', 100],
    ['Chế bản', 'Khuôn bế thụt', 'khuôn', 45000000], ['Chế bản', 'Khuôn bế từng tờ', 'cm²', 60], ['Chế bản', 'Khuôn bế (m dao)', 'm dao', 90000],
    ['In', 'In CMYK', 'trang 13×19', 4], ['In', 'In màu pha', 'trang 13×19', 6],
    ['Gia công bề mặt', 'Dán màng bóng', 'cm²', 0.25], ['Gia công bề mặt', 'Dán màng mờ', 'cm²', 0.25], ['Gia công bề mặt', 'Dán màng nhung', 'cm²', 0.27], ['Gia công bề mặt', 'Dán màng hologram', 'cm²', 0.27],
    ['Gia công bề mặt', 'Tráng phủ UV bóng', 'cm²', 0.17], ['Gia công bề mặt', 'Tráng phủ UV mờ', 'cm²', 0.2], ['Gia công bề mặt', 'Gốc nước bóng', 'cm²', 0.17], ['Gia công bề mặt', 'Gốc nước mờ', 'cm²', 0.2],
    ['Gia công bề mặt', 'Tráng calendering', 'cm²', 0.17], ['Gia công bề mặt', 'Cán calendering', 'cm²', 0.13], ['Gia công bề mặt', 'Kéo lụa bóng', 'cm²', 1], ['Gia công bề mặt', 'Kéo lụa hiệu ứng', 'cm²', 1.5],
    ['Gia công bề mặt', 'Ép nhũ', 'cm²', 2], ['Gia công bề mặt', 'Dập nổi', 'cm²', 1.5], ['Gia công bề mặt', 'Cán gân', 'cm²', 2],
    ['Định hình', 'Cắt', 'dao', 0.3], ['Định hình', 'Bế thụt', 'lần thụt', 800], ['Định hình', 'Bế từng tờ', 'tờ', 500],
  ]),
  sheet('Đơn giá chi phí (giá thành giản đơn)', [C('nhom', 'Nhóm', 'text', { width: 150 }), C('khoan', 'Khoản', 'text', { width: 230 }), C('dv', 'Đơn vị'), N('dongia', 'Đơn giá (đ)', { sum: false })], [
    ['Chế bản', 'Bản in', 'cm²', 16], ['Chế bản', 'Tráng phủ', 'cm²', 200], ['Chế bản', 'Ép nhũ', 'cm²', 6000], ['Chế bản', 'Dập nổi', 'cm²', 6000], ['Chế bản', 'Kéo lụa', 'cm²', 100],
    ['Chế bản', 'Khuôn bế thụt', 'khuôn', 45000000], ['Chế bản', 'Khuôn bế từng tờ', 'cm²', 60], ['Chế bản', 'M dao', 'm dao', 90000],
    ['In', 'In CMYK', 'trang 13×19', 4], ['In', 'In màu pha', 'trang 13×19', 6],
    ['Gia công bề mặt', 'Dán màng bóng', 'cm²', 0.25], ['Gia công bề mặt', 'Dán màng mờ', 'cm²', 0.25], ['Gia công bề mặt', 'Tráng phủ UV bóng', 'cm²', 0.17], ['Gia công bề mặt', 'Tráng phủ UV mờ', 'cm²', 0.2],
    ['Gia công bề mặt', 'Cán gương', 'cm²', 0.13], ['Gia công bề mặt', 'Kéo lụa hiệu ứng bóng', 'cm²', 1], ['Gia công bề mặt', 'Ép nhũ', 'cm²', 2], ['Gia công bề mặt', 'Dập nổi', 'cm²', 1.5], ['Gia công bề mặt', 'Cán gân', 'cm²', 2],
    ['Định hình', 'Cắt', 'dao', 0.3], ['Định hình', 'Bế thụt', 'lần thụt', 800], ['Định hình', 'Bế demi', 'tờ', 500],
  ]),
];

// ---------- 2–8. Bảng theo sản phẩm ----------
const specCols = (kind) => kind === 'hop'
  ? [C('hangmuc', 'Hạng mục', 'text', { width: 120 }), C('thongso', 'Thông số', 'text', { width: 180 }), C('giatri', 'Giá trị', 'text', { width: 320 }), C('ghichu', 'Ghi chú', 'text', { width: 200 }), C('xacnhan', 'Đã chốt', 'check', { width: 80 })]
  : [C('hangmuc', 'Hạng mục', 'text', { width: 120 }), C('thongso', 'Thông số', 'text', { width: 180 }), C('ruot', 'Ruột', 'text', { width: 230 }), C('bia', 'Bìa', 'text', { width: 230 }), C('xacnhan', 'Đã chốt', 'check', { width: 80 })];
const planCols = [C('hangmuc', 'Hạng mục', 'text', { width: 120 }), C('thongso', 'Thông số', 'text', { width: 260 }), C('giatri', 'Giá trị', 'text', { width: 200 }), C('dv', 'Đơn vị'), C('ghichu', 'Ghi chú', 'text', { width: 280 })];
const bhCols = [C('congdoan', 'Công đoạn', 'text', { width: 140 }), C('may', 'Máy'), N('luotin', 'Số lượt in (tờ)'), N('ma', 'Mã giấy', { sum: false }), N('bhm1', 'Bù hao màu 1 (%)', { sum: false }), N('somau', 'Số màu', { sum: false }),
  F('bh', 'Bù hao công đoạn in (%)', '=IF({bhm1}@="","",IF({somau}@>1,{bhm1}@*(1+({somau}@-1)*0.3),{bhm1}@))', { sum: false }), C('ghichu', 'Ghi chú', 'text', { width: 260 })];
const wlCols = [C('congdoan', 'Công đoạn', 'text', { width: 150 }), C('may', 'Máy', 'text', { width: 110 }), C('dv', 'Đơn vị KL'), N('coso', 'Số lượng cơ sở', { sum: false }), N('luot', 'Số lượt / đơn vị', { sum: false }), N('bh', 'Bù hao (%)', { sum: false }),
  F('kl', 'Khối lượng công việc', '=IF({coso}@="","",ROUNDUP({coso}@*IF({luot}@="",1,{luot}@)*(1+{bh}@/100),0))', { fmt: 'int', sum: false }), C('ghichu', 'Ghi chú', 'text', { width: 260 })];
const mtCols = [C('congdoan', 'Công đoạn', 'text', { width: 110 }), C('vattu', 'Vật tư', 'text', { width: 170 }), C('dvt', 'ĐVT'), N('klsp', 'KL sản phẩm', { sum: false }), C('dvsp', 'Đơn vị KL SP', 'text', { width: 130 }), N('dm', 'Định mức tiêu hao', { sum: false }), N('bh', 'Bù hao (%)', { sum: false }),
  F('klvt', 'KL vật tư', '=IF({klsp}@="","",{klsp}@*{dm}@*(1+{bh}@/100))', { sum: false }), N('dongia', 'Đơn giá', { fmt: 'vnd', sum: false }),
  F('thanhtien', 'Thành tiền', '=IF({klvt}@="","",{klvt}@*{dongia}@)', { fmt: 'vnd' }), C('ghichu', 'Ghi chú', 'text', { width: 240 })];
const tmCols = [C('congdoan', 'Công đoạn', 'text', { width: 140 }), C('may', 'Máy', 'text', { width: 110 }), C('dv', 'Đơn vị'), N('kl', 'Khối lượng', { sum: false }), N('ns', 'Năng suất / h', { sum: false }),
  F('tmc', 'T máy chạy (h)', '=IF({ns}@>0,{kl}@/{ns}@,"")', { fmt: 'dec2' }), N('tcb', 'T canh bài (h)', { fmt: 'dec2' }), N('pcn', '% ngừng CN / T máy chạy', { sum: false }),
  F('tcn', 'T ngừng CN (h)', '=IF({tmc}@="","",{tmc}@*{pcn}@/100)', { fmt: 'dec2' }), N('pkt', '% ngừng KT / T làm việc', { sum: false }), N('ptc', '% ngừng TCSX / T làm việc', { sum: false }),
  F('tlv', 'T làm việc (h)', '=IF({tmc}@="","",({tmc}@+{tcb}@+{tcn}@)/(1-({pkt}@+{ptc}@)/100))', { fmt: 'dec2' }), N('kw', 'Công suất (kW)', { sum: false }),
  F('dien', 'Điện năng (kWh)', '=IF({tmc}@="","",{kw}@*({tmc}@+{tcn}@))', { fmt: 'dec2' })];
const costCols = [C('ma', 'Mã', 'text', { width: 70 }), C('khoanmuc', 'Khoản mục', 'text', { width: 260 }), C('cancu', 'Căn cứ tính', 'text', { width: 280 }), N('tyle', 'Tỷ lệ (%)', { sum: false }), N('giatri', 'Giá trị', { fmt: 'int', sum: false }), C('dv', 'Đơn vị', 'text', { width: 90 })];
const costRows = (sl) => [
  ['NVLC', 'Chi phí nguyên vật liệu chính', 'Tổng thành tiền mục 5 – Dự trù vật tư', '', '', 'đ'],
  ['NVLP', 'Chi phí nguyên vật liệu phụ', 'Tỷ lệ × NVL chính', 3, '=IF({giatri}1="","",{giatri}1*{tyle}2/100)', 'đ'],
  ['NL', 'Chi phí nhiên liệu – năng lượng', 'Điện năng (mục 6) × giá điện', '', '', 'đ'],
  ['LUONG', 'Lương công nhân trực tiếp', 'Bảng "Lương công nhân trực tiếp"', '', '', 'đ'],
  ['BH', 'BHXH, BHYT, BHTN, KPCĐ', 'Tỷ lệ × lương CNTT', 23.5, '=IF({giatri}4="","",{giatri}4*{tyle}5/100)', 'đ'],
  ['KH', 'Khấu hao máy móc thiết bị', 'Bảng "Khấu hao máy móc thiết bị"', '', '', 'đ'],
  ['SXC', 'Chi phí sản xuất chung khác', 'Tỷ lệ × lương CNTT', 20, '=IF({giatri}4="","",{giatri}4*{tyle}7/100)', 'đ'],
  ['GTSX', 'Giá thành sản xuất phân xưởng', 'Tổng dòng 1 → 7', '', '=SUM({giatri}1:{giatri}7)', 'đ'],
  ['QLDN', 'Chi phí quản lý doanh nghiệp', 'Tỷ lệ × giá thành SX', 10, '={giatri}8*{tyle}9/100', 'đ'],
  ['BHG', 'Chi phí bán hàng', 'Tỷ lệ × giá thành SX', 3, '={giatri}8*{tyle}10/100', 'đ'],
  ['GTTB', 'Giá thành toàn bộ', 'Dòng 8 + 9 + 10', '', '={giatri}8+{giatri}9+{giatri}10', 'đ'],
  ['LN', 'Lợi nhuận mong muốn', 'Tỷ lệ × giá thành toàn bộ', 15, '={giatri}11*{tyle}12/100', 'đ'],
  ['GB', 'Giá bán đơn hàng (chưa VAT)', 'Dòng 11 + 12', '', '={giatri}11+{giatri}12', 'đ'],
  ['SL', 'Số lượng sản phẩm', 'Thông số đơn hàng', '', sl, 'sản phẩm'],
  ['GTSP', 'Giá thành / 1 sản phẩm', 'Dòng 11 ÷ 14', '', '=IF({giatri}14>0,{giatri}11/{giatri}14,"")', 'đ / SP'],
  ['GBSP', 'Giá bán / 1 sản phẩm', 'Dòng 13 ÷ 14', '', '=IF({giatri}14>0,{giatri}13/{giatri}14,"")', 'đ / SP'],
];
const wageCols = [C('congdoan', 'Công đoạn', 'text', { width: 150 }), C('may', 'Máy', 'text', { width: 110 }), N('luongthang', 'Lương 1 kíp / tháng', { fmt: 'vnd', sum: false }), N('giokip', 'Giờ làm việc / năm (kíp)', { sum: false }),
  F('luonggio', 'Lương / giờ', '=IF({giokip}@>0,{luongthang}@*12/{giokip}@,"")', { fmt: 'vnd', sum: false }), N('tlv', 'T làm việc (h)', { fmt: 'dec2' }),
  F('cpluong', 'Chi phí lương', '=IF({tlv}@="","",{luonggio}@*{tlv}@)', { fmt: 'vnd' })];
const depCols = [C('may', 'Máy', 'text', { width: 120 }), N('giamay', 'Giá máy', { fmt: 'vnd', sum: false }), N('namkh', 'Số năm KH', { sum: false }), N('giomay', 'Giờ máy / năm', { sum: false }),
  F('khgio', 'Khấu hao / giờ', '=IF({namkh}@>0,{giamay}@/{namkh}@/{giomay}@,"")', { fmt: 'vnd', sum: false }), N('tlv', 'T làm việc (h)', { fmt: 'dec2' }),
  F('cpkh', 'Chi phí khấu hao', '=IF({tlv}@="","",{khgio}@*{tlv}@)', { fmt: 'vnd' })];
export const SCHEDULE_STATUS = ['Chưa bắt đầu', 'Đang làm', 'Đạt', 'Cần xử lý'];
const schCols = [C('congdoan', 'Công đoạn', 'text', { width: 150 }), C('may', 'Máy', 'text', { width: 110 }), C('vattu', 'Vật tư sử dụng', 'text', { width: 200 }), N('tlv', 'T làm việc (h)', { fmt: 'dec2' }),
  F('songay', 'Số ngày (2 ca × 8 h)', '=IF({tlv}@="","",MAX(1,ROUNDUP({tlv}@/16,0)))', { fmt: 'int' }), C('batdau', 'Bắt đầu', 'date', { width: 130 }),
  F('ketthuc', 'Kết thúc', '=IF(OR({batdau}@="",{songay}@=""),"",{batdau}@+{songay}@-1)', { fmt: 'date', sum: false }),
  C('checkpoint', 'Checkpoint kiểm tra', 'text', { width: 260 }), C('trangthai', 'Trạng thái', 'select', { options: SCHEDULE_STATUS, width: 120 })];

// Hộp: điền ví dụ để thấy công thức chạy (số minh hoạ – nhóm thay bằng số thật). Sách: khung trống.
const SHEETS_HOP = {
  specs: [sheet('Thông số đơn hàng – Hộp', specCols('hop'), [
    ['Đơn hàng', 'Số lượng', '50.000 hộp', '', true], ['Đơn hàng', 'Thời hạn giao', '15 ngày', '', true],
    ['Cấu trúc', 'Kiểu hộp', 'Nắp gài 2 đầu ngược chiều (reverse tuck end)', '', true], ['Cấu trúc', 'Kiểu dán', 'Dán hông', '', true],
    ['Cấu trúc', 'Kích thước D × R × C', '50 × 50 × 150 mm', '', true], ['Cấu trúc', 'Trải phẳng', '≈ 215 × 280 mm', 'Kiểm tra trên phần mềm', false],
    ['Vật liệu', 'Giấy', 'Ivory 350 g/m²', 'Mã định mức 2', true], ['Đồ hoạ', 'Màu in', '5/0 (CMYK + 1 pha)', 'Phủ CMYK 40%, pha 30%', true],
    ['GCBM', 'Dán màng', 'Màng mờ toàn phần', '', true], ['GCBM', 'Tráng phủ', 'UV bóng từng phần ≈ 20%', '', true],
    ['GCBM', 'Ép nhũ', 'Nhũ vàng, logo 30 × 15 mm × 2 vị trí', '', true]])],
  plan: [sheet('Bình trang & khuôn', planCols, [
    ['Khổ giấy', 'Khổ giấy mua (xả cuộn)', '65 × 86', 'cm', 'Ví dụ – nhóm kiểm tra lại'],
    ['Khổ giấy', 'Khổ tờ in', '65 × 86', 'cm', '≤ khổ max L640 (72 × 102) và TĐ1 (75 × 105)'],
    ['Layout', 'Kích thước trải 1 hộp', '215 × 280', 'mm', ''],
    ['Layout', 'Số hộp / tờ in', 8, 'con', 'Ví dụ – so sánh bằng nesting'],
    ['Layout', 'Nhíp – lề', 10, 'mm', 'Lấy giá trị lớn nhất của máy in và máy bế'],
    ['Layout', 'Khoảng cách 2 dao bế', 5, 'mm', '≥ 5 mm'],
    ['Đơn hàng', 'Số lượng', 50000, 'hộp', ''],
    ['Layout', 'Số tờ in thuần', '=ROUNDUP({giatri}7/{giatri}4,0)', 'tờ', 'Số lượng ÷ số hộp/tờ'],
    ['Layout', 'Hiệu suất sử dụng giấy', '=ROUND({giatri}4*21.5*28/(65*86)*100,1)', '%', 'Diện tích hộp trải ÷ diện tích tờ in'],
    ['Phương án in', 'Cách in', 'In 1 mặt, 5 màu, 1 lượt trên L640', '', ''],
    ['Khuôn GCBM', 'Khuôn UV từng phần', '1 bản – 8 vị trí', 'khuôn', 'Kích thước bản theo máy TP1'],
    ['Khuôn GCBM', 'Khuôn ép nhũ', '16 (8 hộp × 2 logo 30 × 15 mm)', 'khuôn', ''],
    ['Khuôn bế', 'Khuôn bế từng tờ', '1 khuôn 8 con', 'khuôn', 'Ngang = chi tiết bế + 2,5 cm mỗi bên']])],
  workload: [
    sheet('Khối lượng công việc', wlCols, [
      ['Chế bản – làm file', 'Máy tính', 'bài', 1, 1, 0, ''],
      ['Chế tạo khuôn in (CTP)', 'Máy ghi – hiện', 'bản kẽm', 5, 1, 0, '5 màu × 1 mặt'],
      ['In offset', 'L640', 'tờ (tua)', 6250, 1, 5.016, 'Bù hao lấy từ bảng "Bù hao giấy in"'],
      ['Dán màng', 'DM1', 'm dài', 6250, 0.65, 0.5, '0,65 m / tờ theo chiều chạy máy'],
      ['Tráng phủ UV', 'TP1', 'tua', 6250, 1, 1.25, ''],
      ['Ép nhũ', 'en1', 'tua', 6250, 1, 0.5, '16 logo / tờ, ép 1 lượt'],
      ['Bế', 'TĐ1', 'tua', 6250, 1, 0.75, 'Số tờ bế 5.000 – 10.000'],
      ['Xé rìa', 'Xé rìa thủ công', 'hộp', 50000, 1, 0, ''],
      ['Dán hộp', 'DH1', 'hộp', 50000, 1, 0.3, 'Dán hông, ≥ 50.000 hộp'],
      ['Kiểm tra – đóng gói', '', 'hộp', 50000, 1, 0, '']]),
    sheet('Bù hao giấy in', bhCols, [['In offset', 'L640', 6250, 2, 2.28, 5, 'Ivory mã 2, 6.000 – 7.000 lượt → 2,28 %']])],
  materials: [sheet('Dự trù vật tư', mtCols, [
    ['In', 'Giấy Ivory 350', 'tấn', 6564, 'tờ in (gồm bù hao in)', '=0.65*0.86*350/1000000', 0, 25000000, 'ĐM = diện tích tờ × định lượng'],
    ['Chế bản', 'Bản kẽm', 'bản', 5, 'bản', 1, 0, 60000, ''],
    ['In', 'Mực CMYK loại 3', 'kg', '=6564*0.65*0.86/(0.13*0.19)/1000000*4', 'triệu trang 13×19 × màu', 5, 0, 150000, '4 màu, quy ra trang 13×19'],
    ['In', 'Mực pha 1', 'kg', '=6564*0.65*0.86/(0.13*0.19)/1000000*0.3', 'triệu trang 13×19 phủ thật', 55, 0, 200000, 'Phủ 30%'],
    ['Dán màng', 'Màng mờ 1', 'm²', '=6250*0.65*0.86', 'm² tờ', 1, 0.8, 1000, ''],
    ['Dán màng', 'Keo dán màng', 'kg', '=6250*0.65*0.86/1000', '1.000 m²', 8, 0, 50000, ''],
    ['Tráng phủ', 'Verni UV loại 1', 'kg', '=6250*0.65*0.86*0.2/1000', '1.000 m² phủ', 5.15, 0, 200000, 'UV từng phần ≈ 20%'],
    ['Tráng phủ', 'Khuôn UV bóng', 'khuôn', 1, 'khuôn', 1, 0, 200000, ''],
    ['Ép nhũ', 'Nhũ loại 1', 'cm²', 50000, 'hộp', '=2*3*1.5', 5, 3, '2 logo × 3 × 1,5 cm'],
    ['Ép nhũ', 'Khuôn ép nhũ', 'khuôn', 16, 'khuôn', 1, 0, 300000, ''],
    ['Bế', 'Khuôn bế từng tờ', 'khuôn', 1, 'khuôn', 1, 0, 200000, ''],
    ['Dán hộp', 'Keo dán hộp', 'kg', '=50000*0.15', 'm đường dán', '=1/3150', 0.3, 35000, '0,15 m / hộp']])],
  time: [sheet('Thời gian sản xuất', tmCols, [
    ['Chế bản – làm file', 'Máy tính', 'bài', 1, 1, 0.5, 20, 8, 10, 0.5],
    ['Chế tạo khuôn in (CTP)', 'Máy ghi – hiện', 'kẽm', 5, 30, 0.25, 10, 8, 10, 10],
    ['In offset', 'L640', 'tua', 6564, 7000, 1, 15, 8, 10, 50],
    ['Dán màng', 'DM1', 'm', 4083, 2400, 0.25, 15, 8, 20, 10],
    ['Tráng phủ UV', 'TP1', 'tua', 6329, 5000, 0.5, 10, 8, 10, 15],
    ['Ép nhũ', 'en1', 'tua', 6282, 600, 0.5, 15, 8, 15, 8],
    ['Bế', 'TĐ1', 'tua', 6297, 4000, 1.5, 15, 8, 15, 15],
    ['Xé rìa', 'Xé rìa thủ công', 'hộp', 50000, 3000, 0, 0, 0, 0, 0],
    ['Dán hộp', 'DH1', 'hộp', 50150, 3000, 0.5, 15, 8, 15, 10]])],
  cost: [sheet('Tổng hợp giá thành', costCols, costRows(50000)), sheet('Lương công nhân trực tiếp', wageCols, []), sheet('Khấu hao máy móc thiết bị', depCols, [])],
  schedule: [sheet('Kế hoạch sản xuất', schCols, [])],
};
const SHEETS_SACH = {
  specs: [sheet('Thông số đơn hàng – Sách', specCols('sach'), [
    ['Đơn hàng', 'Số lượng / hạn', '3.000 cuốn – 20 ngày', '', true], ['Cấu trúc', 'Kiểu đóng', 'Khâu chỉ, gáy vuông', 'Bìa mềm, cấn 4 đường', true],
    ['Cấu trúc', 'Khổ thành phẩm', '14,5 × 20,5 cm', '14,5 × 20,5 cm', true], ['Cấu trúc', 'Số trang / gáy', '240 trang (15 tay × 16)', 'Gáy ≈ 12 mm; trải 30,2 × 20,5', false],
    ['Vật liệu', 'Giấy', 'Fort 80 g/m²', 'Bristol 250 g/m²', true], ['Đồ hoạ', 'Màu in', '1/1 (đen), phủ 15%', '4/0, phủ 50%', true],
    ['GCBM', 'Gia công', 'Không', 'Màng bóng + ép nhũ 80 × 20 mm', true]])],
  plan: [sheet('Bình trang & khuôn', planCols, [
    ['Ruột', 'Khổ thành phẩm', '14,5 × 20,5', 'cm', ''], ['Ruột', 'Khổ có chừa xén (đầu 2 – chân 3 – bụng 3 mm)', '14,8 × 21,0', 'cm', ''],
    ['Ruột', 'Số trang', 240, 'trang', ''], ['Ruột', 'Số trang / tay', 16, 'trang', 'Tay 16, 8, 4, 2 trang'],
    ['Ruột', 'Số tay sách', '=ROUNDUP({giatri}3/{giatri}4,0)', 'tay', ''], ['Ruột', 'Khổ tờ in ruột', '', 'cm', 'Chọn theo bảng hiệu suất giấy'],
    ['Ruột', 'Số trang / tờ in (2 mặt)', '', 'trang', ''], ['Ruột', 'Phương án in', 'A-B / tự trở', '', ''], ['Đơn hàng', 'Số lượng', 3000, 'cuốn', ''],
    ['Ruột', 'Số tờ in thuần ruột', '=IF({giatri}7="","",ROUNDUP({giatri}3*{giatri}9/{giatri}7,0))', 'tờ', ''],
    ['Bìa', 'Khổ bìa trải', '30,2 × 20,5', 'cm', 'Gáy ≈ 12 mm'], ['Bìa', 'Khổ tờ in bìa', '', 'cm', ''], ['Bìa', 'Số bìa / tờ in', '', 'bìa', ''],
    ['Bìa', 'Số tờ in thuần bìa', '=IF({giatri}13="","",ROUNDUP({giatri}9/{giatri}13,0))', 'tờ', ''], ['Khuôn GCBM', 'Khuôn ép nhũ tên sách 80 × 20 mm', '', 'khuôn', '']])],
  workload: [
    sheet('Khối lượng công việc', wlCols, ['Chế bản – làm file|Máy tính|bài', 'Chế tạo khuôn in (CTP)|Máy ghi – hiện|bản kẽm', 'In ruột|CD 102-4|tờ (tua)', 'In bìa|SM102|tờ (tua)', 'Cắt|CẮT 1|xấp', 'Dán màng bìa|DM1|m dài',
      'Ép nhũ bìa|en1|tua', 'Bế – cấn bìa|TĐ1|tua', 'Gấp|G1|tờ', 'Bắt cuốn|BC1|cuốn', 'Khâu chỉ|KC1|tay', 'Vào bìa|VB1|cuốn', 'Xén 3 mặt|X3|cuốn', 'Kiểm tra – đóng gói||cuốn'].map(s => s.split('|'))),
    sheet('Bù hao giấy in', bhCols, [['In ruột', 'CD 102-4', '', 1, '', 1, 'Fort mã 1'], ['In bìa', 'SM102', '', 2, '', 4, 'Bristol mã 2']])],
  materials: [sheet('Dự trù vật tư', mtCols, [['In', 'Giấy Fort 80', 'tấn'], ['In', 'Giấy Bristol 250', 'tấn'], ['Chế bản', 'Bản kẽm', 'bản'], ['In', 'Mực CMYK loại 3', 'kg'], ['Dán màng', 'Màng bóng 1', 'm²'],
    ['Dán màng', 'Keo dán màng', 'kg'], ['Ép nhũ', 'Nhũ loại 1', 'cm²'], ['Ép nhũ', 'Khuôn ép nhũ', 'khuôn'], ['Khâu chỉ', 'Chỉ khâu', 'kg'], ['Vào bìa', 'Keo nhiệt vào bìa', 'kg']])],
  time: [sheet('Thời gian sản xuất', tmCols, ['Chế bản – làm file|Máy tính', 'Chế tạo khuôn in (CTP)|Máy ghi – hiện', 'In ruột|CD 102-4', 'In bìa|SM102', 'Cắt|CẮT 1', 'Dán màng bìa|DM1', 'Ép nhũ bìa|en1',
    'Bế – cấn bìa|TĐ1', 'Gấp|G1', 'Bắt cuốn|BC1', 'Khâu chỉ|KC1', 'Vào bìa|VB1', 'Xén 3 mặt|X3'].map(s => s.split('|')))],
  cost: [sheet('Tổng hợp giá thành', costCols, costRows(3000)), sheet('Lương công nhân trực tiếp', wageCols, []), sheet('Khấu hao máy móc thiết bị', depCols, [])],
  schedule: [sheet('Kế hoạch sản xuất', schCols, ['Chế bản – làm file', 'Chế tạo khuôn in (CTP)', 'In ruột', 'In bìa', 'Cắt', 'Dán màng bìa', 'Ép nhũ bìa', 'Bế – cấn bìa', 'Gấp', 'Bắt cuốn', 'Khâu chỉ', 'Vào bìa', 'Xén 3 mặt', 'Kiểm tra – đóng gói'].map(s => [s]))],
};
export const PRODUCT_SHEETS = { hop: SHEETS_HOP, sach: SHEETS_SACH };
export const CHECKPOINTS = {
  'Chế bản – làm file': 'Duyệt file, bản in thử (proof) với khách', 'Chế tạo khuôn in (CTP)': 'Kiểm tra bản kẽm: đủ màu, điểm tram, tay kê',
  'In offset': 'Duyệt tờ in đầu: màu, chồng màu, mật độ', 'Dán màng': 'Độ bám màng, không nhăn, bọt khí', 'Tráng phủ UV': 'Vị trí UV khớp, độ khô',
  'Ép nhũ': 'Vị trí nhũ, độ sắc nét', 'Bế': 'Đường bế, đường cấn, không bung xơ', 'Xé rìa': 'Sạch rìa, không rách', 'Dán hộp': 'Dán chắc, hộp vuông, thử gấp',
  'Kiểm tra – đóng gói': 'Kiểm tra xác suất, đóng thùng, nhãn thùng',
};

// Mẫu bảng trống để thêm mới trong Cơ sở dữ liệu
export const BLANK_SHEET = { name: 'Bảng mới', columns: [C('a', 'Cột A'), C('b', 'Cột B'), N('c', 'Cột C')], rows: [] };
export const SECTION_TEMPLATES = {
  factory: COMPANY_SHEETS, specs: [SHEETS_HOP.specs[0], SHEETS_SACH.specs[0]], plan: [SHEETS_HOP.plan[0], SHEETS_SACH.plan[0]],
  workload: [sheet('Khối lượng công việc', wlCols), sheet('Bù hao giấy in', bhCols)], materials: [sheet('Dự trù vật tư', mtCols)], time: [sheet('Thời gian sản xuất', tmCols)],
  cost: [sheet('Tổng hợp giá thành', costCols, costRows('')), sheet('Lương công nhân trực tiếp', wageCols), sheet('Khấu hao máy móc thiết bị', depCols)], schedule: [sheet('Kế hoạch sản xuất', schCols)],
};

// ---------- Tiến độ đồ án (của nhóm, để trống) ----------
export const PROGRESS_NAME = 'Tiến độ đồ án';
export const STATUS = ['Chưa làm', 'Đang làm', 'Chờ duyệt', 'Xong'];
export const STEPS = [
  ['Xác định phương án nhà máy & CSDL', 'Quy trình, công nghệ – thiết bị, CSDL máy, vật tư, đơn giá'],
  ['Xác định thông số kỹ thuật sản phẩm', 'Cấu trúc, kích thước, vật liệu, màu in, GCBM'],
  ['Lập phương án sản xuất', 'Hiệu ứng, công nghệ in, quy trình, chọn máy, bình trang, khuôn'],
  ['Tính khối lượng công việc', 'Theo đơn vị năng suất từng máy, có bù hao'],
  ['Dự trù vật tư', 'Giấy, kẽm, mực, màng, verni, nhũ, keo, chỉ…'],
  ['Tính thời gian sản xuất', 'T máy chạy, canh bài, ngừng CN/KT/TCSX'],
  ['Tính giá thành theo khoản mục', 'NVL, lương, BH, khấu hao, SXC, QLDN, bán hàng, lợi nhuận'],
  ['Lập kế hoạch sản xuất', 'Lịch trình, checkpoint, theo dõi tiến độ'],
];
export const PROGRESS_COLUMNS = [
  { key: 'buoc', label: 'Bước', type: 'text' }, { key: 'noidung', label: 'Nội dung', type: 'text' }, { key: 'ghichu', label: 'Ghi chú', type: 'text' },
  { key: 'phutrach', label: 'Phụ trách', type: 'person' }, { key: 'han', label: 'Hạn', type: 'date' }, { key: 'trangthai', label: 'Trạng thái', type: 'select', options: STATUS },
];

export const PRODUCTS_DEFAULT = [
  { kind: 'hop', name: 'Hộp kem dưỡng', subtitle: 'Reverse tuck end · 50 × 50 × 150 mm · Ivory 350 · In 5/0', qty: '50.000 hộp', due: 'Giao 15 ngày' },
  { kind: 'sach', name: 'Sách khâu chỉ', subtitle: '14,5 × 20,5 cm · 240 trang · Ruột Fort 80 · Bìa Bristol 250', qty: '3.000 cuốn', due: 'Giao 20 ngày' },
];
export const LECTURER_FILES = [
  '1. Hướng dẫn đồ án KTTCSX in – Hướng dẫn chung.pptx', '2. Xác định phương án và mô hình nhà máy.pptx', '3. HD – Xác định thông số SP.pptx',
  '4. Lập phương án sản xuất cho sản phẩm.pptx', 'Dự trù vật tư và thời gian sản xuất.pptx', 'Tính giá khoản mục.pptx', '2. CƠ SỞ DỮ LIỆU.xlsx',
];
