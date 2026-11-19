// Mẫu bảng dữ liệu cho đồ án (số liệu trích từ file "2. CƠ SỞ DỮ LIỆU.xlsx" + giả định đã chốt)
const T = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });

export const TABLE_TEMPLATES = {
  'Bảng trống': { columns: [T('c1', 'Cột 1'), T('c2', 'Cột 2'), T('c3', 'Cột 3')], rows: [] },

  'Dữ liệu máy (CSDL thiết bị)': {
    columns: [T('congdoan', 'Công đoạn'), T('may', 'Máy'), T('khomax', 'Khổ max (dọc×ngang)'), T('khomin', 'Khổ min'), T('somau', 'Số màu', 'number'),
      T('ns', 'Năng suất', 'number'), T('dv', 'Đơn vị NS'), T('canhbai', 'T canh bài (h)', 'number'), T('ngungcn', '% ngừng CN', 'number'), T('tcsx', '% TCSX', 'number'), T('kt', '% KT', 'number'),
      T('kw', 'Công suất (kW)', 'number'), T('luong', 'Lương kíp/tháng', 'number'), T('giamay', 'Giá máy (đ)', 'number'), T('namkh', 'Năm KH', 'number'), T('nguon', 'Nguồn', 'select', { options: ['CSDL', 'Giả định'] })],
    rows: [
      ['Chế bản', 'Máy tính', '', '', '', 1, 'bài/h', 0.5, 20, 10, 8, 0.5, 8000000, 15000000, 1, 'CSDL'],
      ['Chế bản', 'Máy ghi – hiện', '', '', '', 30, 'kẽm/h', 0.25, 10, 10, 8, 10, 8000000, 1500000000, 3, 'CSDL'],
      ['In', 'CD 102-4', '72×102', '34×40', 4, 8000, 'tua/h', 1, 15, 10, 8, 45, 23000000, 10000000000, 6, 'CSDL'],
      ['In', 'DAIYA', '65×86', '21×28', 5, 7000, 'tua/h', 1, 15, 10, 8, 40, 20000000, 4000000000, 6, 'CSDL'],
      ['In', 'L640', '72×102', '34×40', 6, 7000, 'tua/h', 1, 15, 10, 8, 50, 20000000, 5000000000, 6, 'CSDL'],
      ['In', 'SM102', '72×102', '34×40', 4, 9000, 'tua/h', 1, 15, 10, 8, 45, 21000000, 12000000000, 6, 'CSDL'],
      ['Tráng phủ', 'TP1', '72×102', '34×40', '', 5000, 'tua/h', 0.5, 10, 10, 8, 15, 10000000, 400000000, 5, 'CSDL'],
      ['Tráng phủ', 'TP2', '72×102', '34×40', '', 4000, 'tua/h', 0.5, 10, 10, 8, 15, 10000000, 350000000, 5, 'CSDL'],
      ['Cắt', 'CẮT 1', 'rộng 115', '', '', 60, 'xấp/h', 0.2, 30, 20, 8, 10, 7000000, 300000000, 3, 'CSDL'],
      ['Cắt', 'CẮT 2', 'rộng 115', '', '', 60, 'xấp/h', 0.2, 30, 20, 8, 10, 7000000, 250000000, 3, 'CSDL'],
      ['Dán màng', 'DM1', '72×102', '', '', 2400, 'm/h', 0.25, 15, 20, 8, 10, 8000000, 300000000, 5, 'CSDL'],
      ['Dán màng', 'DM2', '72×102', '', '', 1800, 'm/h', 0.25, 15, 20, 8, 10, 8000000, 250000000, 5, 'CSDL'],
      ['Bế', 'TC2', '60×84', '21×28', '', 600, 'tua/h', 1, 15, 15, 8, 8, 5000000, 120000000, 5, 'CSDL'],
      ['Bế', 'TĐ1', '75×105', '34×40', '', 4000, 'tua/h', 1.5, 15, 15, 8, 15, 10000000, 800000000, 5, 'CSDL'],
      ['Dán hộp', 'DH1', '', '', '', 3000, 'm/h', 0.5, 15, 15, 8, 10, 10000000, 400000000, 5, 'CSDL'],
      ['Dán hộp', 'DH2', '', '', '', 3000, 'm/h', 0.5, 15, 15, 8, 10, 10000000, 400000000, 5, 'CSDL'],
      ['Ép nhũ', 'en1', '', '', '', 600, 'tua/h', 0.5, 15, 15, 8, 8, 5000000, 120000000, 5, 'CSDL'],
      ['Ép nhũ', 'en2', '', '', '', 600, 'tua/h', 0.5, 15, 15, 8, 8, 5000000, 120000000, 5, 'CSDL'],
      ['Cán calendering', 'calen 1', '', '', '', 2500, 'tua/h', 0.5, 15, 15, 8, 15, 10000000, 200000000, 5, 'CSDL'],
      ['Kéo lụa', 'Kéo lụa máy', '', '', '', 1200, 'SP/h', 0, 0, 0, 0, 5, 4000000, 0, 1, 'CSDL'],
      ['Kéo lụa', 'Kéo lụa thủ công', '', '', '', 400, 'SP/h', 0, 0, 0, 0, '', 4000000, 0, 1, 'CSDL'],
      ['Dán cửa sổ', 'Thủ công', '', '', '', 300, 'SP/h', 0, 0, 0, 0, '', 4000000, 0, 1, 'CSDL'],
      ['Xé rìa', 'Thủ công', '', '', '', 3000, 'SP/h', 0, 0, 0, 0, '', 4000000, 0, 1, 'CSDL'],
      ['Bồi sóng', 'BỒI 1', '', '', '', 2000, 'tua/h', 0.25, 20, 15, 8, 10, 6000000, 200000000, 5, 'CSDL'],
      ['Gấp', 'G1', '', '', '', 6000, 'tờ/h', 0.5, 15, 10, 8, 8, 8000000, 600000000, 5, 'Giả định'],
      ['Bắt cuốn', 'BC1', '', '', '', 3000, 'cuốn/h', 0.5, 15, 10, 8, 10, 9000000, 1200000000, 5, 'Giả định'],
      ['Khâu chỉ', 'KC1', '', '', '', 5000, 'tay/h', 0.5, 15, 10, 8, 6, 9000000, 1500000000, 6, 'Giả định'],
      ['Vào bìa', 'VB1', '', '', '', 1500, 'cuốn/h', 1, 20, 10, 8, 25, 12000000, 2000000000, 6, 'Giả định'],
      ['Xén 3 mặt', 'X3', '', '', '', 1000, 'cuốn/h', 0.25, 15, 10, 8, 8, 8000000, 700000000, 5, 'Giả định'],
    ],
  },

  'Thông số đơn hàng – Hộp': {
    columns: [T('hangmuc', 'Hạng mục'), T('thongso', 'Thông số'), T('giatri', 'Giá trị'), T('ghichu', 'Ghi chú'), T('xacnhan', 'Đã chốt', 'check')],
    rows: [
      ['Đơn hàng', 'Số lượng', '50.000 hộp', '', true], ['Đơn hàng', 'Thời hạn giao', '15 ngày', '', true],
      ['Cấu trúc', 'Kiểu hộp', 'Nắp gài 2 đầu ngược chiều (reverse tuck end)', '', true], ['Cấu trúc', 'Kiểu dán', 'Dán hông', '', true],
      ['Cấu trúc', 'Kích thước D×R×C', '50 × 50 × 150 mm', '', true], ['Cấu trúc', 'Trải phẳng', '≈ 215 × 280 mm', 'Kiểm tra trên phần mềm', false],
      ['Vật liệu', 'Giấy', 'Ivory 350 g/m²', 'Mã định mức 2', true], ['Đồ hoạ', 'Màu in', '5/0 (CMYK + 1 pha)', 'Phủ CMYK 40%, pha 30%', true],
      ['GCBM', 'Dán màng', 'Màng mờ toàn phần', '', true], ['GCBM', 'Tráng phủ', 'UV bóng từng phần ≈ 20%', '', true],
      ['GCBM', 'Ép nhũ', 'Nhũ vàng, logo 30×15 mm × 2 vị trí', '', true],
      ['Phương án', 'Khổ tờ in', '', 'So sánh nesting', false], ['Phương án', 'Số hộp/tờ', '', '', false], ['Phương án', 'Máy in', 'L640', '', false],
    ],
  },

  'Thông số đơn hàng – Sách': {
    columns: [T('hangmuc', 'Hạng mục'), T('thongso', 'Thông số'), T('ruot', 'Ruột'), T('bia', 'Bìa'), T('xacnhan', 'Đã chốt', 'check')],
    rows: [
      ['Đơn hàng', 'Số lượng / hạn', '3.000 cuốn – 20 ngày', '', true], ['Cấu trúc', 'Kiểu đóng', 'Khâu chỉ, gáy vuông', 'Bìa mềm, cấn 4 đường', true],
      ['Cấu trúc', 'Khổ thành phẩm', '14,5 × 20,5 cm', '14,5 × 20,5 cm', true], ['Cấu trúc', 'Số trang / gáy', '240 trang (15 tay × 16)', 'Gáy ≈ 12 mm; trải 30,2 × 20,5', false],
      ['Vật liệu', 'Giấy', 'Fort 80 g/m²', 'Bristol 250 g/m²', true], ['Đồ hoạ', 'Màu in', '1/1 (đen), phủ 15%', '4/0, phủ 50%', true],
      ['GCBM', 'Gia công', 'Không', 'Màng bóng + ép nhũ 80×20 mm', true],
      ['Phương án', 'Khổ tờ in', '', '', false], ['Phương án', 'Số trang/tờ – số bìa/tờ', '', '', false], ['Phương án', 'Cách in', 'A-B + tự trở', '', false],
    ],
  },

  'Giá vật tư': {
    columns: [T('congdoan', 'Công đoạn'), T('vattu', 'Vật tư'), T('dvt', 'ĐVT'), T('gia', 'Giá (đ)', 'number'), T('dinhmuc', 'Định mức tiêu hao'), T('buhao', 'Bù hao'), T('nguon', 'Nguồn', 'select', { options: ['CSDL', 'Giả định', 'Báo giá NCC'] })],
    rows: [
      ['In', 'Giấy Ivory 350', 'tấn', 25000000, '', 'Tra bảng (mã 2)', 'CSDL'], ['In', 'Giấy Fort 80', 'tấn', 17000000, '', 'Tra bảng (mã 1)', 'CSDL'],
      ['In', 'Giấy Bristol 250', 'tấn', 25000000, '', 'Tra bảng (mã 2)', 'CSDL'], ['Chế khuôn', 'Bản kẽm', 'bản', 60000, '1 bản/màu', '', 'CSDL'],
      ['In', 'Mực CMYK loại 3', 'kg', 150000, '5–6 kg/tr. trang 13x19/màu', '', 'CSDL'], ['In', 'Mực pha 1', 'kg', 200000, '55–60 kg/tr. trang (phủ thật)', '', 'CSDL'],
      ['Tráng phủ', 'Verni UV loại 1', 'kg', 200000, '5,15 kg/1.000 m²', '1,25% (giấy)', 'CSDL'], ['Dán màng', 'Màng mờ 1', 'm²', 1000, '1 m²/m²', '0,8%', 'CSDL'],
      ['Dán màng', 'Màng bóng 1', 'm²', 800, '1 m²/m²', '0,8%', 'CSDL'], ['Dán màng', 'Keo dán màng', 'kg', 50000, '8 kg/1.000 m²', '', 'CSDL'],
      ['Ép nhũ', 'Nhũ loại 1', 'cm²', 3, '', '5%', 'CSDL'], ['Ép nhũ', 'Khuôn ép nhũ', 'khuôn', 300000, '', '', 'CSDL'],
      ['Bế', 'Khuôn bế từng tờ', 'khuôn', 200000, '', 'Tra bảng', 'CSDL'], ['Dán hộp', 'Keo dán hộp', 'kg', 35000, '3.150 m/kg', 'Tra bảng', 'CSDL'],
      ['Khâu chỉ', 'Chỉ khâu', 'kg', 150000, '', '1,3%', 'Giả định'], ['Vào bìa', 'Keo nhiệt', 'kg', 60000, '', '0,5%', 'Giả định'],
      ['Năng lượng', 'Điện', 'kWh', 1500, '', '', 'Giả định'],
    ],
  },

  'Phân công công việc': {
    columns: [T('viec', 'Công việc'), T('chuong', 'Chương'), T('phutrach', 'Phụ trách', 'person'), T('han', 'Hạn', 'date'), T('trangthai', 'Trạng thái', 'select', { options: ['Chưa làm', 'Đang làm', 'Chờ duyệt', 'Xong'] }), T('link', 'Link / ghi chú')],
    rows: [
      ['Lập CSDL máy, vật tư, đơn giá', 'Ch.1', '', '', 'Chưa làm', ''], ['Thông số & phương án SX hộp', 'Ch.2–3', '', '', 'Chưa làm', ''],
      ['Thông số & phương án SX sách', 'Ch.2–3', '', '', 'Chưa làm', ''], ['Khối lượng, vật tư, thời gian – hộp', 'Ch.4–6', '', '', 'Chưa làm', ''],
      ['Khối lượng, vật tư, thời gian – sách', 'Ch.4–6', '', '', 'Chưa làm', ''], ['Giá thành theo khoản mục', 'Ch.7', '', '', 'Chưa làm', ''],
      ['Kế hoạch sản xuất + Gantt', 'Ch.8', '', '', 'Chưa làm', ''], ['Ghép báo cáo Word, rà soát', 'Toàn bộ', '', '', 'Chưa làm', ''],
    ],
  },
};

export const PROGRESS_NAME = 'Tiến độ đồ án';
export const STATUS = ['Chưa làm', 'Đang làm', 'Chờ duyệt', 'Xong'];
export const STEPS = [
  ['Xác định phương án nhà máy & CSDL', 'Quy trình, công nghệ – thiết bị, CSDL máy, vật tư, đơn giá'],
  ['Xác định thông số kỹ thuật sản phẩm', 'Hộp và sách: cấu trúc, kích thước, vật liệu, màu in, GCBM'],
  ['Lập phương án sản xuất', 'Khổ giấy, layout, cách in, khuôn GCBM, khuôn bế, chọn máy'],
  ['Tính khối lượng công việc', 'Theo đơn vị năng suất từng máy, có bù hao'],
  ['Dự trù vật tư', 'Giấy, kẽm, mực, màng, verni, nhũ, keo, chỉ…'],
  ['Tính thời gian sản xuất', 'T máy chạy, canh bài, ngừng CN/KT/TCSX'],
  ['Tính giá thành theo khoản mục', 'NVL, lương, BH, khấu hao, SXC, QLDN, bán hàng'],
  ['Lập kế hoạch sản xuất', 'Lịch trình, Gantt, theo dõi tiến độ'],
  ['Hoàn thiện báo cáo Word & file Excel', 'Ghép chương, rà soát số liệu, định dạng'],
];
export const PROGRESS_COLUMNS = [
  { key: 'buoc', label: 'Bước', type: 'text', width: 60 },
  { key: 'noidung', label: 'Nội dung', type: 'text', width: 280 },
  { key: 'ghichu', label: 'Ghi chú', type: 'text', width: 260 },
  { key: 'phutrach', label: 'Phụ trách', type: 'person', width: 140 },
  { key: 'han', label: 'Hạn', type: 'date', width: 120 },
  { key: 'trangthai', label: 'Trạng thái', type: 'select', options: STATUS, width: 120 },
];

