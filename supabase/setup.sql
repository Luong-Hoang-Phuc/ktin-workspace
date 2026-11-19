
-- =====================================================================
-- KTIN WORKSPACE – Thiết lập cơ sở dữ liệu Supabase (chạy 1 lần)
-- Supabase Dashboard → SQL Editor → New query → dán toàn bộ → Run
-- =====================================================================
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, display_name text, color text default '#b5462f', created_at timestamptz default now());
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, email, display_name) values (new.id, new.email, split_part(new.email, '@', 1)) on conflict (id) do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Sản phẩm (Hộp, Sách)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), kind text, name text not null, subtitle text, qty text, due text,
  image_path text, position int default 0, created_at timestamptz default now());

-- Thư mục: mỗi (sản phẩm, mục làm việc) một thư mục; thêm 2 thư mục lưu trữ chung
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(), parent_id uuid references public.folders(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade, section text,
  name text not null, icon text default '', position int default 0, created_by uuid references public.profiles(id), created_at timestamptz default now());

-- Danh mục máy dùng chung + cây phương án nhà máy theo sản phẩm
create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(), name text not null, cells jsonb not null default '{}'::jsonb,
  position int default 0, updated_by uuid references public.profiles(id), updated_at timestamptz default now(), created_at timestamptz default now());
create table if not exists public.factory_nodes (
  id uuid primary key default gen_random_uuid(), product_id uuid references public.products(id) on delete cascade,
  parent_id uuid references public.factory_nodes(id) on delete cascade, kind text not null, name text not null,
  machine_id uuid references public.machines(id) on delete cascade, position int default 0,
  updated_by uuid references public.profiles(id), updated_at timestamptz default now(), created_at timestamptz default now());

-- Cài đặt chung (link Canva…)
create table if not exists public.settings (id text primary key, value text, updated_by uuid references public.profiles(id), updated_at timestamptz default now(), created_at timestamptz default now());

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(), folder_id uuid references public.folders(id) on delete cascade,
  name text not null, storage_path text not null default '', size bigint, mime text, version int default 1,
  parent_file_id uuid references public.files(id) on delete cascade, description text, external_url text,
  locked_by uuid references public.profiles(id), locked_at timestamptz, uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(), folder_id uuid references public.folders(id) on delete cascade,
  title text not null default 'Ghi chú mới', content text default '', updated_by uuid references public.profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(), folder_id uuid references public.folders(id) on delete cascade,
  name text not null default 'Bảng trắng', created_by uuid references public.profiles(id), created_at timestamptz default now());
create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(), board_id uuid references public.boards(id) on delete cascade,
  kind text not null, data jsonb not null, z int default 0, updated_by uuid references public.profiles(id), updated_at timestamptz default now(), created_at timestamptz default now());
create table if not exists public.data_tables (
  id uuid primary key default gen_random_uuid(), folder_id uuid references public.folders(id) on delete cascade,
  name text not null, columns jsonb not null default '[]'::jsonb, created_by uuid references public.profiles(id), created_at timestamptz default now());
create table if not exists public.data_rows (
  id uuid primary key default gen_random_uuid(), table_id uuid references public.data_tables(id) on delete cascade,
  cells jsonb not null default '{}'::jsonb, position double precision default 0, updated_by uuid references public.profiles(id),
  updated_at timestamptz default now(), created_at timestamptz default now());
create table if not exists public.activity (
  id bigint generated always as identity primary key, user_id uuid references public.profiles(id),
  product_id uuid references public.products(id) on delete set null, action text, target text, created_at timestamptz default now());

-- Bảo mật: chỉ người đã đăng nhập (thành viên được mời) mới đọc/ghi
do $$ declare t text; begin
  foreach t in array array['profiles','products','folders','machines','factory_nodes','settings','files','notes','boards','board_items','data_tables','data_rows','activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team_all" on public.%I', t);
    execute format('create policy "team_all" on public.%I for all to authenticated using (true) with check (true)', t);
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when duplicate_object then null; end;
  end loop; end $$;
alter table public.notes replica identity full;
alter table public.board_items replica identity full;
alter table public.data_rows replica identity full;
alter table public.machines replica identity full;
alter table public.factory_nodes replica identity full;

-- Kho file
insert into storage.buckets (id, name, public, file_size_limit) values ('docs', 'docs', false, 52428800) on conflict (id) do nothing;
drop policy if exists "team_docs_select" on storage.objects; drop policy if exists "team_docs_insert" on storage.objects;
drop policy if exists "team_docs_update" on storage.objects; drop policy if exists "team_docs_delete" on storage.objects;
create policy "team_docs_select" on storage.objects for select to authenticated using (bucket_id = 'docs');
create policy "team_docs_insert" on storage.objects for insert to authenticated with check (bucket_id = 'docs');
create policy "team_docs_update" on storage.objects for update to authenticated using (bucket_id = 'docs');
create policy "team_docs_delete" on storage.objects for delete to authenticated using (bucket_id = 'docs');

-- =====================================================================
-- DỮ LIỆU BAN ĐẦU (chỉ nạp khi bảng sản phẩm còn trống)
-- =====================================================================
do $seed$
declare p uuid; f uuid; st uuid; t uuid; m uuid;
begin
if exists (select 1 from public.products) then return; end if;
insert into public.settings (id, value) values ('canva_url', '') on conflict do nothing;
insert into public.folders (product_id, section, name, icon, position) values (null, 'lecturer', 'Tài liệu giảng viên', '📚', 0), (null, 'team', 'Tài liệu nhóm', '🗂️', 1);
insert into public.machines (name, cells, position) values ('Máy tính', '{"congdoan":"Chế bản","khomax":"","khomin":"","somau":"","ns":1,"dv":"bài/h","canhbai":0.5,"ngungcn":20,"tcsx":10,"kt":8,"kw":0.5,"luong":8000000,"giamay":15000000,"namkh":1,"nguon":"CSDL"}'::jsonb, 0);
insert into public.machines (name, cells, position) values ('Máy ghi – hiện', '{"congdoan":"Chế bản","khomax":"","khomin":"","somau":"","ns":30,"dv":"kẽm/h","canhbai":0.25,"ngungcn":10,"tcsx":10,"kt":8,"kw":10,"luong":8000000,"giamay":1500000000,"namkh":3,"nguon":"CSDL"}'::jsonb, 1);
insert into public.machines (name, cells, position) values ('CD 102-4', '{"congdoan":"In","khomax":"72×102","khomin":"34×40","somau":4,"ns":8000,"dv":"tua/h","canhbai":1,"ngungcn":15,"tcsx":10,"kt":8,"kw":45,"luong":23000000,"giamay":10000000000,"namkh":6,"nguon":"CSDL"}'::jsonb, 2);
insert into public.machines (name, cells, position) values ('DAIYA', '{"congdoan":"In","khomax":"65×86","khomin":"21×28","somau":5,"ns":7000,"dv":"tua/h","canhbai":1,"ngungcn":15,"tcsx":10,"kt":8,"kw":40,"luong":20000000,"giamay":4000000000,"namkh":6,"nguon":"CSDL"}'::jsonb, 3);
insert into public.machines (name, cells, position) values ('L640', '{"congdoan":"In","khomax":"72×102","khomin":"34×40","somau":6,"ns":7000,"dv":"tua/h","canhbai":1,"ngungcn":15,"tcsx":10,"kt":8,"kw":50,"luong":20000000,"giamay":5000000000,"namkh":6,"nguon":"CSDL"}'::jsonb, 4);
insert into public.machines (name, cells, position) values ('SM102', '{"congdoan":"In","khomax":"72×102","khomin":"34×40","somau":4,"ns":9000,"dv":"tua/h","canhbai":1,"ngungcn":15,"tcsx":10,"kt":8,"kw":45,"luong":21000000,"giamay":12000000000,"namkh":6,"nguon":"CSDL"}'::jsonb, 5);
insert into public.machines (name, cells, position) values ('TP1', '{"congdoan":"Tráng phủ","khomax":"72×102","khomin":"34×40","somau":"","ns":5000,"dv":"tua/h","canhbai":0.5,"ngungcn":10,"tcsx":10,"kt":8,"kw":15,"luong":10000000,"giamay":400000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 6);
insert into public.machines (name, cells, position) values ('TP2', '{"congdoan":"Tráng phủ","khomax":"72×102","khomin":"34×40","somau":"","ns":4000,"dv":"tua/h","canhbai":0.5,"ngungcn":10,"tcsx":10,"kt":8,"kw":15,"luong":10000000,"giamay":350000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 7);
insert into public.machines (name, cells, position) values ('CẮT 1', '{"congdoan":"Cắt","khomax":"rộng 115","khomin":"","somau":"","ns":60,"dv":"xấp/h","canhbai":0.2,"ngungcn":30,"tcsx":20,"kt":8,"kw":10,"luong":7000000,"giamay":300000000,"namkh":3,"nguon":"CSDL"}'::jsonb, 8);
insert into public.machines (name, cells, position) values ('CẮT 2', '{"congdoan":"Cắt","khomax":"rộng 115","khomin":"","somau":"","ns":60,"dv":"xấp/h","canhbai":0.2,"ngungcn":30,"tcsx":20,"kt":8,"kw":10,"luong":7000000,"giamay":250000000,"namkh":3,"nguon":"CSDL"}'::jsonb, 9);
insert into public.machines (name, cells, position) values ('DM1', '{"congdoan":"Dán màng","khomax":"72×102","khomin":"","somau":"","ns":2400,"dv":"m/h","canhbai":0.25,"ngungcn":15,"tcsx":20,"kt":8,"kw":10,"luong":8000000,"giamay":300000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 10);
insert into public.machines (name, cells, position) values ('DM2', '{"congdoan":"Dán màng","khomax":"72×102","khomin":"","somau":"","ns":1800,"dv":"m/h","canhbai":0.25,"ngungcn":15,"tcsx":20,"kt":8,"kw":10,"luong":8000000,"giamay":250000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 11);
insert into public.machines (name, cells, position) values ('TC2', '{"congdoan":"Bế","khomax":"60×84","khomin":"21×28","somau":"","ns":600,"dv":"tua/h","canhbai":1,"ngungcn":15,"tcsx":15,"kt":8,"kw":8,"luong":5000000,"giamay":120000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 12);
insert into public.machines (name, cells, position) values ('TĐ1', '{"congdoan":"Bế","khomax":"75×105","khomin":"34×40","somau":"","ns":4000,"dv":"tua/h","canhbai":1.5,"ngungcn":15,"tcsx":15,"kt":8,"kw":15,"luong":10000000,"giamay":800000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 13);
insert into public.machines (name, cells, position) values ('DH1', '{"congdoan":"Dán hộp","khomax":"","khomin":"","somau":"","ns":3000,"dv":"m/h","canhbai":0.5,"ngungcn":15,"tcsx":15,"kt":8,"kw":10,"luong":10000000,"giamay":400000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 14);
insert into public.machines (name, cells, position) values ('DH2', '{"congdoan":"Dán hộp","khomax":"","khomin":"","somau":"","ns":3000,"dv":"m/h","canhbai":0.5,"ngungcn":15,"tcsx":15,"kt":8,"kw":10,"luong":10000000,"giamay":400000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 15);
insert into public.machines (name, cells, position) values ('en1', '{"congdoan":"Ép nhũ","khomax":"","khomin":"","somau":"","ns":600,"dv":"tua/h","canhbai":0.5,"ngungcn":15,"tcsx":15,"kt":8,"kw":8,"luong":5000000,"giamay":120000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 16);
insert into public.machines (name, cells, position) values ('en2', '{"congdoan":"Ép nhũ","khomax":"","khomin":"","somau":"","ns":600,"dv":"tua/h","canhbai":0.5,"ngungcn":15,"tcsx":15,"kt":8,"kw":8,"luong":5000000,"giamay":120000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 17);
insert into public.machines (name, cells, position) values ('calen 1', '{"congdoan":"Cán calendering","khomax":"","khomin":"","somau":"","ns":2500,"dv":"tua/h","canhbai":0.5,"ngungcn":15,"tcsx":15,"kt":8,"kw":15,"luong":10000000,"giamay":200000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 18);
insert into public.machines (name, cells, position) values ('Kéo lụa máy', '{"congdoan":"Kéo lụa","khomax":"","khomin":"","somau":"","ns":1200,"dv":"SP/h","canhbai":0,"ngungcn":0,"tcsx":0,"kt":0,"kw":5,"luong":4000000,"giamay":0,"namkh":1,"nguon":"CSDL"}'::jsonb, 19);
insert into public.machines (name, cells, position) values ('Kéo lụa thủ công', '{"congdoan":"Kéo lụa","khomax":"","khomin":"","somau":"","ns":400,"dv":"SP/h","canhbai":0,"ngungcn":0,"tcsx":0,"kt":0,"kw":"","luong":4000000,"giamay":0,"namkh":1,"nguon":"CSDL"}'::jsonb, 20);
insert into public.machines (name, cells, position) values ('Dán cửa sổ thủ công', '{"congdoan":"Dán cửa sổ","khomax":"","khomin":"","somau":"","ns":300,"dv":"SP/h","canhbai":0,"ngungcn":0,"tcsx":0,"kt":0,"kw":"","luong":4000000,"giamay":0,"namkh":1,"nguon":"CSDL"}'::jsonb, 21);
insert into public.machines (name, cells, position) values ('Xé rìa thủ công', '{"congdoan":"Xé rìa","khomax":"","khomin":"","somau":"","ns":3000,"dv":"SP/h","canhbai":0,"ngungcn":0,"tcsx":0,"kt":0,"kw":"","luong":4000000,"giamay":0,"namkh":1,"nguon":"CSDL"}'::jsonb, 22);
insert into public.machines (name, cells, position) values ('BỒI 1', '{"congdoan":"Bồi sóng","khomax":"","khomin":"","somau":"","ns":2000,"dv":"tua/h","canhbai":0.25,"ngungcn":20,"tcsx":15,"kt":8,"kw":10,"luong":6000000,"giamay":200000000,"namkh":5,"nguon":"CSDL"}'::jsonb, 23);
insert into public.machines (name, cells, position) values ('G1', '{"congdoan":"Gấp","khomax":"","khomin":"","somau":"","ns":6000,"dv":"tờ/h","canhbai":0.5,"ngungcn":15,"tcsx":10,"kt":8,"kw":8,"luong":8000000,"giamay":600000000,"namkh":5,"nguon":"Giả định"}'::jsonb, 24);
insert into public.machines (name, cells, position) values ('BC1', '{"congdoan":"Bắt cuốn","khomax":"","khomin":"","somau":"","ns":3000,"dv":"cuốn/h","canhbai":0.5,"ngungcn":15,"tcsx":10,"kt":8,"kw":10,"luong":9000000,"giamay":1200000000,"namkh":5,"nguon":"Giả định"}'::jsonb, 25);
insert into public.machines (name, cells, position) values ('KC1', '{"congdoan":"Khâu chỉ","khomax":"","khomin":"","somau":"","ns":5000,"dv":"tay/h","canhbai":0.5,"ngungcn":15,"tcsx":10,"kt":8,"kw":6,"luong":9000000,"giamay":1500000000,"namkh":6,"nguon":"Giả định"}'::jsonb, 26);
insert into public.machines (name, cells, position) values ('VB1', '{"congdoan":"Vào bìa","khomax":"","khomin":"","somau":"","ns":1500,"dv":"cuốn/h","canhbai":1,"ngungcn":20,"tcsx":10,"kt":8,"kw":25,"luong":12000000,"giamay":2000000000,"namkh":6,"nguon":"Giả định"}'::jsonb, 27);
insert into public.machines (name, cells, position) values ('X3', '{"congdoan":"Xén 3 mặt","khomax":"","khomin":"","somau":"","ns":1000,"dv":"cuốn/h","canhbai":0.25,"ngungcn":15,"tcsx":10,"kt":8,"kw":8,"luong":8000000,"giamay":700000000,"namkh":5,"nguon":"Giả định"}'::jsonb, 28);

-- Hộp kem dưỡng
insert into public.products (kind, name, subtitle, qty, due, position) values ('hop', 'Hộp kem dưỡng', 'Reverse tuck end · 50 × 50 × 150 mm · Ivory 350 · In 5/0', '50.000 hộp', 'Giao 15 ngày', 0) returning id into p;
insert into public.folders (product_id, section, name, position) values (p, 'overview', 'Tổng quan', 0) returning id into f;
insert into public.data_tables (folder_id, name, columns) values (f, 'Tiến độ đồ án', '[{"key":"buoc","label":"Bước","type":"text","width":60},{"key":"noidung","label":"Nội dung","type":"text","width":280},{"key":"ghichu","label":"Ghi chú","type":"text","width":260},{"key":"phutrach","label":"Phụ trách","type":"person","width":140},{"key":"han","label":"Hạn","type":"date","width":120},{"key":"trangthai","label":"Trạng thái","type":"select","options":["Chưa làm","Đang làm","Chờ duyệt","Xong"],"width":120}]'::jsonb) returning id into t;
insert into public.data_rows (table_id, position, cells) values (t, 0, '{"buoc":"1","noidung":"Xác định phương án nhà máy & CSDL","ghichu":"Quy trình, công nghệ – thiết bị, CSDL máy, vật tư, đơn giá","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 1, '{"buoc":"2","noidung":"Xác định thông số kỹ thuật sản phẩm","ghichu":"Hộp và sách: cấu trúc, kích thước, vật liệu, màu in, GCBM","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 2, '{"buoc":"3","noidung":"Lập phương án sản xuất","ghichu":"Khổ giấy, layout, cách in, khuôn GCBM, khuôn bế, chọn máy","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 3, '{"buoc":"4","noidung":"Tính khối lượng công việc","ghichu":"Theo đơn vị năng suất từng máy, có bù hao","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 4, '{"buoc":"5","noidung":"Dự trù vật tư","ghichu":"Giấy, kẽm, mực, màng, verni, nhũ, keo, chỉ…","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 5, '{"buoc":"6","noidung":"Tính thời gian sản xuất","ghichu":"T máy chạy, canh bài, ngừng CN/KT/TCSX","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 6, '{"buoc":"7","noidung":"Tính giá thành theo khoản mục","ghichu":"NVL, lương, BH, khấu hao, SXC, QLDN, bán hàng","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 7, '{"buoc":"8","noidung":"Lập kế hoạch sản xuất","ghichu":"Lịch trình, Gantt, theo dõi tiến độ","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 8, '{"buoc":"9","noidung":"Hoàn thiện báo cáo Word & file Excel","ghichu":"Ghép chương, rà soát số liệu, định dạng","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.folders (product_id, section, name, position) values (p, 'factory', 'Phương án nhà máy', 1) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'specs', 'Thông số sản phẩm', 2) returning id into f;
insert into public.data_tables (folder_id, name, columns) values (f, 'Thông số đơn hàng – Hộp', '[{"key":"hangmuc","label":"Hạng mục","type":"text"},{"key":"thongso","label":"Thông số","type":"text"},{"key":"giatri","label":"Giá trị","type":"text"},{"key":"ghichu","label":"Ghi chú","type":"text"},{"key":"xacnhan","label":"Đã chốt","type":"check"}]'::jsonb) returning id into t;
insert into public.data_rows (table_id, position, cells) values (t, 0, '{"hangmuc":"Đơn hàng","thongso":"Số lượng","giatri":"50.000 hộp","ghichu":"","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 1, '{"hangmuc":"Đơn hàng","thongso":"Thời hạn giao","giatri":"15 ngày","ghichu":"","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 2, '{"hangmuc":"Cấu trúc","thongso":"Kiểu hộp","giatri":"Nắp gài 2 đầu ngược chiều (reverse tuck end)","ghichu":"","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 3, '{"hangmuc":"Cấu trúc","thongso":"Kiểu dán","giatri":"Dán hông","ghichu":"","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 4, '{"hangmuc":"Cấu trúc","thongso":"Kích thước D×R×C","giatri":"50 × 50 × 150 mm","ghichu":"","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 5, '{"hangmuc":"Cấu trúc","thongso":"Trải phẳng","giatri":"≈ 215 × 280 mm","ghichu":"Kiểm tra trên phần mềm","xacnhan":false}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 6, '{"hangmuc":"Vật liệu","thongso":"Giấy","giatri":"Ivory 350 g/m²","ghichu":"Mã định mức 2","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 7, '{"hangmuc":"Đồ hoạ","thongso":"Màu in","giatri":"5/0 (CMYK + 1 pha)","ghichu":"Phủ CMYK 40%, pha 30%","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 8, '{"hangmuc":"GCBM","thongso":"Dán màng","giatri":"Màng mờ toàn phần","ghichu":"","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 9, '{"hangmuc":"GCBM","thongso":"Tráng phủ","giatri":"UV bóng từng phần ≈ 20%","ghichu":"","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 10, '{"hangmuc":"GCBM","thongso":"Ép nhũ","giatri":"Nhũ vàng, logo 30×15 mm × 2 vị trí","ghichu":"","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 11, '{"hangmuc":"Phương án","thongso":"Khổ tờ in","giatri":"","ghichu":"So sánh nesting","xacnhan":false}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 12, '{"hangmuc":"Phương án","thongso":"Số hộp/tờ","giatri":"","ghichu":"","xacnhan":false}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 13, '{"hangmuc":"Phương án","thongso":"Máy in","giatri":"L640","ghichu":"","xacnhan":false}'::jsonb);
insert into public.folders (product_id, section, name, position) values (p, 'plan', 'Phương án sản xuất', 3) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'workload', 'Khối lượng công việc', 4) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'materials', 'Dự trù vật tư', 5) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'time', 'Thời gian sản xuất', 6) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'cost', 'Giá thành', 7) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'schedule', 'Kế hoạch sản xuất', 8) returning id into f;
insert into public.factory_nodes (product_id, parent_id, kind, name, position) values (p, null, 'stage', 'Chế bản', 0) returning id into st;
select id into m from public.machines where name = 'Máy tính' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'Máy tính', m, 0);
select id into m from public.machines where name = 'Máy ghi – hiện' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'Máy ghi – hiện', m, 1);
insert into public.factory_nodes (product_id, parent_id, kind, name, position) values (p, null, 'stage', 'In', 1) returning id into st;
select id into m from public.machines where name = 'L640' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'L640', m, 0);
insert into public.factory_nodes (product_id, parent_id, kind, name, position) values (p, null, 'stage', 'Gia công bề mặt', 2) returning id into st;
select id into m from public.machines where name = 'DM1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'DM1', m, 0);
select id into m from public.machines where name = 'TP1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'TP1', m, 1);
select id into m from public.machines where name = 'en1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'en1', m, 2);
insert into public.factory_nodes (product_id, parent_id, kind, name, position) values (p, null, 'stage', 'Thành phẩm', 3) returning id into st;
select id into m from public.machines where name = 'TĐ1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'TĐ1', m, 0);
select id into m from public.machines where name = 'Xé rìa thủ công' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'Xé rìa thủ công', m, 1);
select id into m from public.machines where name = 'DH1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'DH1', m, 2);

-- Sách khâu chỉ
insert into public.products (kind, name, subtitle, qty, due, position) values ('sach', 'Sách khâu chỉ', '14,5 × 20,5 cm · 240 trang · Ruột Fort 80 · Bìa Bristol 250', '3.000 cuốn', 'Giao 20 ngày', 1) returning id into p;
insert into public.folders (product_id, section, name, position) values (p, 'overview', 'Tổng quan', 0) returning id into f;
insert into public.data_tables (folder_id, name, columns) values (f, 'Tiến độ đồ án', '[{"key":"buoc","label":"Bước","type":"text","width":60},{"key":"noidung","label":"Nội dung","type":"text","width":280},{"key":"ghichu","label":"Ghi chú","type":"text","width":260},{"key":"phutrach","label":"Phụ trách","type":"person","width":140},{"key":"han","label":"Hạn","type":"date","width":120},{"key":"trangthai","label":"Trạng thái","type":"select","options":["Chưa làm","Đang làm","Chờ duyệt","Xong"],"width":120}]'::jsonb) returning id into t;
insert into public.data_rows (table_id, position, cells) values (t, 0, '{"buoc":"1","noidung":"Xác định phương án nhà máy & CSDL","ghichu":"Quy trình, công nghệ – thiết bị, CSDL máy, vật tư, đơn giá","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 1, '{"buoc":"2","noidung":"Xác định thông số kỹ thuật sản phẩm","ghichu":"Hộp và sách: cấu trúc, kích thước, vật liệu, màu in, GCBM","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 2, '{"buoc":"3","noidung":"Lập phương án sản xuất","ghichu":"Khổ giấy, layout, cách in, khuôn GCBM, khuôn bế, chọn máy","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 3, '{"buoc":"4","noidung":"Tính khối lượng công việc","ghichu":"Theo đơn vị năng suất từng máy, có bù hao","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 4, '{"buoc":"5","noidung":"Dự trù vật tư","ghichu":"Giấy, kẽm, mực, màng, verni, nhũ, keo, chỉ…","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 5, '{"buoc":"6","noidung":"Tính thời gian sản xuất","ghichu":"T máy chạy, canh bài, ngừng CN/KT/TCSX","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 6, '{"buoc":"7","noidung":"Tính giá thành theo khoản mục","ghichu":"NVL, lương, BH, khấu hao, SXC, QLDN, bán hàng","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 7, '{"buoc":"8","noidung":"Lập kế hoạch sản xuất","ghichu":"Lịch trình, Gantt, theo dõi tiến độ","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 8, '{"buoc":"9","noidung":"Hoàn thiện báo cáo Word & file Excel","ghichu":"Ghép chương, rà soát số liệu, định dạng","trangthai":"Chưa làm","phutrach":""}'::jsonb);
insert into public.folders (product_id, section, name, position) values (p, 'factory', 'Phương án nhà máy', 1) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'specs', 'Thông số sản phẩm', 2) returning id into f;
insert into public.data_tables (folder_id, name, columns) values (f, 'Thông số đơn hàng – Sách', '[{"key":"hangmuc","label":"Hạng mục","type":"text"},{"key":"thongso","label":"Thông số","type":"text"},{"key":"ruot","label":"Ruột","type":"text"},{"key":"bia","label":"Bìa","type":"text"},{"key":"xacnhan","label":"Đã chốt","type":"check"}]'::jsonb) returning id into t;
insert into public.data_rows (table_id, position, cells) values (t, 0, '{"hangmuc":"Đơn hàng","thongso":"Số lượng / hạn","ruot":"3.000 cuốn – 20 ngày","bia":"","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 1, '{"hangmuc":"Cấu trúc","thongso":"Kiểu đóng","ruot":"Khâu chỉ, gáy vuông","bia":"Bìa mềm, cấn 4 đường","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 2, '{"hangmuc":"Cấu trúc","thongso":"Khổ thành phẩm","ruot":"14,5 × 20,5 cm","bia":"14,5 × 20,5 cm","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 3, '{"hangmuc":"Cấu trúc","thongso":"Số trang / gáy","ruot":"240 trang (15 tay × 16)","bia":"Gáy ≈ 12 mm; trải 30,2 × 20,5","xacnhan":false}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 4, '{"hangmuc":"Vật liệu","thongso":"Giấy","ruot":"Fort 80 g/m²","bia":"Bristol 250 g/m²","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 5, '{"hangmuc":"Đồ hoạ","thongso":"Màu in","ruot":"1/1 (đen), phủ 15%","bia":"4/0, phủ 50%","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 6, '{"hangmuc":"GCBM","thongso":"Gia công","ruot":"Không","bia":"Màng bóng + ép nhũ 80×20 mm","xacnhan":true}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 7, '{"hangmuc":"Phương án","thongso":"Khổ tờ in","ruot":"","bia":"","xacnhan":false}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 8, '{"hangmuc":"Phương án","thongso":"Số trang/tờ – số bìa/tờ","ruot":"","bia":"","xacnhan":false}'::jsonb);
insert into public.data_rows (table_id, position, cells) values (t, 9, '{"hangmuc":"Phương án","thongso":"Cách in","ruot":"A-B + tự trở","bia":"","xacnhan":false}'::jsonb);
insert into public.folders (product_id, section, name, position) values (p, 'plan', 'Phương án sản xuất', 3) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'workload', 'Khối lượng công việc', 4) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'materials', 'Dự trù vật tư', 5) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'time', 'Thời gian sản xuất', 6) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'cost', 'Giá thành', 7) returning id into f;
insert into public.folders (product_id, section, name, position) values (p, 'schedule', 'Kế hoạch sản xuất', 8) returning id into f;
insert into public.factory_nodes (product_id, parent_id, kind, name, position) values (p, null, 'stage', 'Chế bản', 0) returning id into st;
select id into m from public.machines where name = 'Máy tính' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'Máy tính', m, 0);
select id into m from public.machines where name = 'Máy ghi – hiện' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'Máy ghi – hiện', m, 1);
insert into public.factory_nodes (product_id, parent_id, kind, name, position) values (p, null, 'stage', 'In', 1) returning id into st;
select id into m from public.machines where name = 'CD 102-4' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'CD 102-4', m, 0);
select id into m from public.machines where name = 'SM102' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'SM102', m, 1);
insert into public.factory_nodes (product_id, parent_id, kind, name, position) values (p, null, 'stage', 'Gia công bìa', 2) returning id into st;
select id into m from public.machines where name = 'DM1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'DM1', m, 0);
select id into m from public.machines where name = 'en1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'en1', m, 1);
insert into public.factory_nodes (product_id, parent_id, kind, name, position) values (p, null, 'stage', 'Thành phẩm ruột', 3) returning id into st;
select id into m from public.machines where name = 'CẮT 1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'CẮT 1', m, 0);
select id into m from public.machines where name = 'G1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'G1', m, 1);
select id into m from public.machines where name = 'BC1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'BC1', m, 2);
select id into m from public.machines where name = 'KC1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'KC1', m, 3);
insert into public.factory_nodes (product_id, parent_id, kind, name, position) values (p, null, 'stage', 'Hoàn thiện', 4) returning id into st;
select id into m from public.machines where name = 'VB1' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'VB1', m, 0);
select id into m from public.machines where name = 'X3' limit 1;
insert into public.factory_nodes (product_id, parent_id, kind, name, machine_id, position) values (p, st, 'machine', 'X3', m, 1);
end $seed$;

-- Lưu ý: 7 file tài liệu giảng viên (7 file) tải lên trực tiếp trên web: Tài liệu → Tài liệu giảng viên.
