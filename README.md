# KTIN Workspace

Không gian làm việc chung cho **đồ án Kinh tế & Tổ chức sản xuất in**: thư mục theo chương, upload tài liệu có phiên bản, ghi chú realtime, bảng trắng, bảng dữ liệu đồ án và theo dõi tiến độ.

- Giao diện: HTML + CSS + JavaScript thuần (không cần build), chạy trên **GitHub Pages**
- Dữ liệu, file, đăng nhập, realtime: **Supabase** (gói miễn phí)

## Tính năng

| Phần | Mô tả |
|---|---|
| **Tổng quan** | Bảng tiến độ 8 bước đồ án (phụ trách, trạng thái), thành viên online, hoạt động gần đây |
| **Thư mục** | Tạo thư mục / thư mục con, đổi tên, đổi biểu tượng, sắp xếp. Thấy ai đang ở thư mục nào |
| **Tài liệu** | Kéo thả upload (≤ 50 MB/file). **Khoá khi đang sửa** để tránh ghi đè, **lịch sử phiên bản** và khôi phục, gắn **link Word Online/OneDrive/Teams** để cùng gõ, xem nhanh file Office |
| **Ghi chú** | Soạn Markdown, xem trước, mẫu sẵn (biên bản họp, thông số hộp/sách…). Người khác thấy nội dung ngay khi bạn gõ |
| **Bảng trắng** | Ghi chú dán, chữ, khung, elip, mũi tên, bút vẽ; thấy con trỏ và thao tác kéo thả của nhau; xuất SVG |
| **Bảng dữ liệu** | Bảng sửa trực tiếp như Excel (văn bản, số, lựa chọn, thành viên, ngày, hộp kiểm), tổng cột số, dán từ Excel, xuất/nhập CSV. Mẫu sẵn: **Dữ liệu máy (CSDL thiết bị)**, Thông số hộp, Thông số sách, Giá vật tư, Phân công |

## Cài đặt (trưởng nhóm làm 1 lần)

### 1. Supabase
1. Tạo project tại [supabase.com](https://supabase.com) (region Singapore).
2. **SQL Editor → New query** → dán toàn bộ `supabase/setup.sql` → **Run**.
3. **Authentication → Sign In / Providers**: tắt *Allow new users to sign up*.
4. **Authentication → URL Configuration**:
   - *Site URL*: `https://<tên-github>.github.io/ktin-workspace/`
   - *Redirect URLs*: thêm cùng địa chỉ trên (và `http://localhost:8000/` nếu chạy thử trên máy).
5. **Authentication → Users → Invite user**: mời email của 3 thành viên.
6. **Project Settings → API**: chép *Project URL* và *anon public key* vào `js/config.js`.

> `anon key` được phép nằm công khai trong mã web; bảo mật dựa trên chính sách RLS (chỉ người đã đăng nhập mới đọc/ghi). **Không bao giờ** đưa `service_role key` vào repo.

### 2. GitHub Pages
**Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, thư mục `/ (root)` → Save. Sau 1–2 phút web chạy tại `https://<tên-github>.github.io/ktin-workspace/`.

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
Nếu `js/config.js` để trống `SUPABASE_URL`, web chạy **chế độ demo**: dữ liệu chỉ lưu trên trình duyệt, mở 2 tab để thử realtime.

## Lưu ý
- Gói miễn phí Supabase: 500 MB database, 1 GB file. Project bị **tạm dừng nếu 7 ngày không ai dùng**, vào dashboard bấm *Restore* là chạy lại, không mất dữ liệu.
- File Word: web không sửa .docx trực tiếp. Dùng **✏️ Sửa** (khoá + tải về) → sửa bằng Word → **⤴ Up bản mới**. Muốn cùng gõ một lúc: để file trên OneDrive/Teams và gắn link vào web.

## Cấu trúc
```
index.html            trang chính
css/style.css         giao diện
js/config.js          khoá Supabase
js/db.js              chọn Supabase hoặc demo
js/backend-*.js       lớp dữ liệu (CRUD, realtime, storage, presence)
js/app.js             đăng nhập, khung, thư mục, điều hướng
js/views/*.js         Tổng quan, Tài liệu, Ghi chú, Bảng trắng, Bảng dữ liệu
supabase/setup.sql    tạo bảng, bảo mật, realtime, kho file, thư mục mẫu
```
