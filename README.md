# KTIN Workspace

Công cụ web phục vụ **đồ án (tiểu luận) Kinh tế & Tổ chức sản xuất in** – nhóm 3 người, 2 sản phẩm: **Hộp** và **Sách**.

- Giao diện: HTML + CSS + JavaScript thuần (không cần build), chạy trên **GitHub Pages**
- Dữ liệu, file, đăng nhập, realtime: **Supabase** (gói miễn phí)

## Luồng sử dụng

**Đăng nhập → Chọn sản phẩm → Trang xem → 🗄 Cơ sở dữ liệu**

| Phần | Nội dung |
|---|---|
| **Trang xem** (8 mục + Tổng quan) | Mỗi mục có 3 tab: **Hiển thị** (lấy số từ Cơ sở dữ liệu, chỉ xem) · **Tệp đính kèm** · **Ghi chú**. Tổng quan: giá bán/SP, giá thành/SP, thời gian, lịch, tiến độ đồ án |
| **🗄 Cơ sở dữ liệu** | Nơi nhập liệu cho 8 mục, dạng bảng tính như Excel: thêm/bớt dòng, cột; công thức `=C3*D3`, `=SUM(G1:G9)`, hàm trỏ sang bảng khác `='VẬT TƯ'!F8`; VLOOKUP, HLOOKUP, INDEX/MATCH, XLOOKUP, SUMIF(S), COUNTIF(S), SUMPRODUCT, IF/IFERROR, hàm chữ, hàm ngày; ô nhập màu trắng, ô tự tính màu xám; chèn/xoá dòng tự dịch tham chiếu |
| **⬆ Nhập Excel / ⬇ Tải Excel** | Đưa file .xlsx lên: mỗi sheet thành một bảng, **giữ nguyên hàm**. Sheet trùng tên bảng cũ → ghi đè. Tải về: cả mục thành file .xlsx có hàm và số mới nhất (mở bằng Excel tự tính lại) |
| **1. Phương án nhà máy** | **Chung cho cả công ty** (Hộp và Sách dùng chung): cây Khâu → Công đoạn (Chung/Hộp/Sách) → Máy; bảng thiết bị (xoay máy theo hàng/cột, thêm thông số); CSDL doanh nghiệp trích file của giảng viên: tham số chung, giá giấy, bù hao giấy in, bù hao GCBM – thành phẩm, vật tư & định mức, đơn giá lương, đơn giá chi phí |
| **2. Thông số sản phẩm** | Ảnh sản phẩm + bảng thông số |
| **3. Phương án sản xuất** | Dạng cây: ① Hiệu ứng (tích → tự chọn công đoạn gia công sau in) ② Công nghệ in (theo từng thành phần) ③ Quy trình: quy trình chung công ty, tích công đoạn sản phẩm đi qua + chọn máy ④ Bình trang & khuôn |
| **4–6** | Khối lượng công việc, dự trù vật tư (KL SP × ĐM tiêu hao × (1 + bù hao)), thời gian (T máy chạy + canh bài + ngừng CN, KT, TCSX) – công thức theo bài giảng |
| **7. Giá thành** | Khoản mục: NVL chính/phụ, năng lượng, lương + BH, khấu hao, SXC, QLDN, bán hàng + lợi nhuận mong muốn → giá bán / SP |
| **8. Kế hoạch** | Công đoạn, máy, vật tư, ngày, checkpoint kiểm tra → trang xem hiện lộ trình, Gantt, checkpoint |
| **Góc dưới bên trái** | ✦ Canva · 📁 Tài liệu · 🗄 CSDL · 💬 Tin nhắn nhóm; thanh tài khoản; đồng đội online / offline và đang ở mục nào |

> Hàm trỏ được sang các bảng **trong cùng một mục**. Liên kết số liệu giữa các mục khác nhau (VD: tổng vật tư mục 5 → giá thành mục 7) sẽ làm ở bước sau.

## Cài đặt (trưởng nhóm làm 1 lần)

### 1. Supabase
1. Tạo project tại [supabase.com](https://supabase.com) (region Singapore).
2. **SQL Editor → New query** → dán toàn bộ `supabase/setup.sql` → **Run**.
3. **Authentication → Sign In / Providers**: tắt *Allow new users to sign up*.
4. **Authentication → URL Configuration**:
   - *Site URL*: `https://ktin-workspace.phucluong110.workers.dev/`
   - *Redirect URLs*: thêm cùng địa chỉ trên (và `http://localhost:8000/` nếu chạy thử trên máy).
5. **Authentication → Users → Invite user**: mời email của 3 thành viên.
6. **Project Settings → API**: chép *Project URL* và *anon public key* vào `js/config.js`.

> `anon key` được phép nằm công khai trong mã web; bảo mật dựa trên chính sách RLS (chỉ người đã đăng nhập mới đọc/ghi). **Không bao giờ** đưa `service_role key` vào repo.

### 2. GitHub Pages
**Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, thư mục `/ (root)` → Save. Sau 1–2 phút web chạy tại `https://ktin-workspace.phucluong110.workers.dev/`.

### 3. Mời thành viên vào repo (để cùng sửa code)
**Settings → Collaborators → Add people** → nhập tài khoản GitHub của 2 bạn.

## Đăng nhập
- Lần đầu: bấm **Gửi link đăng nhập qua email** → mở email → bấm link.
- Sau đó vào **Hồ sơ** (góc phải) để đặt tên hiển thị, màu và **mật khẩu** (lần sau đăng nhập bằng mật khẩu).

## Chạy thử trên máy
```bash
python3 -m http.server 8000
# mở http://localhost:8000
```
Nếu `js/config.js` để trống `API_URL`, web chạy **chế độ demo**: dữ liệu chỉ lưu trên trình duyệt, mở 2 tab để thử realtime.

## Lưu ý
- Gói miễn phí Supabase: 500 MB database, 1 GB file. Project bị **tạm dừng nếu 7 ngày không ai dùng**, vào dashboard bấm *Restore* là chạy lại, không mất dữ liệu.
- File Word: web không sửa .docx trực tiếp. Dùng **✏️ Sửa** (khoá + tải về) → sửa bằng Word → **⤴ Up bản mới**. Muốn cùng gõ một lúc: để file trên OneDrive/Teams và gắn link vào web.

## Cấu trúc
```
index.html              trang chính
css/style.css           giao diện (phong cách giấy kraft)
js/config.js            khoá Supabase (để trống = chế độ demo)
js/db.js                chọn Supabase hoặc demo
js/backend-*.js         lớp dữ liệu (CRUD, realtime, storage, presence)
js/formula.js           bộ tính công thức kiểu Excel (nhiều sheet, dò tìm, điều kiện…)
js/xlsx.js              đọc / ghi file .xlsx (JSZip trong js/vendor)
js/app.js               đăng nhập, khung, điều hướng (trang xem / cơ sở dữ liệu)
js/views/templates.js   cấu trúc mục, nhà máy, hiệu ứng, bảng mẫu + số liệu CSDL giảng viên
js/views/sheet.js       bảng tính (nhập liệu) + bảng chỉ xem
js/views/excel.js       nhập / xuất Excel cho một mục
js/views/chat.js        tin nhắn nhóm
js/views/factory.js     sơ đồ nhà máy chung + bảng thiết bị
js/views/plan.js        phương án sản xuất dạng cây
js/views/viewer.js      trang xem từng mục
js/views/comments.js    bình luận & giao việc trên ô (@tên)
js/views/cellcheck.js   kiểm tra số liệu (ô lỗi / đáng ngờ) · checkview.js: trang Kiểm tra trước khi nộp
js/views/palette.js     Ctrl + K tìm mọi thứ · phím ? bảng phím tắt
js/views/report.js      xuất thuyết minh Word (.docx) / in PDF
js/views/trashview.js   trang Thùng rác · js/trash.js: xoá có Hoàn tác, giữ 30 ngày
js/net.js               làm việc khi mất mạng (giữ thay đổi trên máy, tự đồng bộ)
css/dark.css            chế độ tối – tự sinh từ style.css (tools/gen-dark.py)
js/views/*.js           tổng quan, tài liệu, ghi chú, thông số
supabase/setup.sql      tạo bảng, bảo mật, realtime, kho file, dữ liệu ban đầu
```

## Đăng web bằng Cloudflare Pages (repo riêng tư, code được nén)

- Cloudflare Workers: tệp `wrangler.jsonc` đã khai báo sẵn, deploy command `npx wrangler deploy` tự chạy `build.sh` rồi đăng `dist/`.
- Cloudflare Pages: Build command: `sh build.sh`
- Build output directory: `dist`
- `build.sh` nén và làm rối toàn bộ JS/CSS vào `dist/` bằng esbuild; mã gốc trong repo giữ nguyên để sửa.
- `robots.txt`, `_headers` và thẻ `meta robots` chặn bot tìm kiếm / bot AI tuân thủ quy tắc.
- Đổi địa chỉ web thì nhớ sửa Site URL + Redirect URLs trong Supabase → Authentication → URL Configuration.
