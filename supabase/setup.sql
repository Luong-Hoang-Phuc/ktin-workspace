-- =====================================================================
-- KTIN WORKSPACE – Thiết lập cơ sở dữ liệu Supabase
-- Chạy 1 lần: Supabase Dashboard → SQL Editor → New query → dán toàn bộ → Run
-- =====================================================================

-- 1. HỒ SƠ THÀNH VIÊN ---------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  color text default '#2563eb',
  created_at timestamptz default now()
);

-- Tự tạo hồ sơ khi có tài khoản mới
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. THƯ MỤC --------------------------------------------------------------
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.folders(id) on delete cascade,
  name text not null,
  icon text default '📁',
  position int default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 3. TÀI LIỆU (file upload, có phiên bản và khóa khi đang sửa) -----------
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.folders(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size bigint,
  mime text,
  version int default 1,
  parent_file_id uuid references public.files(id) on delete cascade, -- null = bản gốc; có giá trị = phiên bản cũ của file đó
  description text,
  external_url text,             -- link Word Online / OneDrive / Google Docs (nếu có)
  locked_by uuid references public.profiles(id),
  locked_at timestamptz,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. GHI CHÚ ------------------------------------------------------------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.folders(id) on delete cascade,
  title text not null default 'Ghi chú mới',
  content text default '',
  updated_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. WHITEBOARD (mỗi phần tử là 1 dòng để nhiều người sửa cùng lúc) -----
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.folders(id) on delete cascade,
  name text not null default 'Bảng trắng',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create table if not exists public.board_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.boards(id) on delete cascade,
  kind text not null,            -- 'sticky' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'path'
  data jsonb not null,           -- toạ độ, kích thước, màu, nội dung…
  z int default 0,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

-- 6. BẢNG DỮ LIỆU (dữ liệu máy, thông số SP, việc cần làm…) --------------
create table if not exists public.data_tables (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.folders(id) on delete cascade,
  name text not null,
  columns jsonb not null default '[]'::jsonb,   -- [{key,label,type}]
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create table if not exists public.data_rows (
  id uuid primary key default gen_random_uuid(),
  table_id uuid references public.data_tables(id) on delete cascade,
  cells jsonb not null default '{}'::jsonb,
  position double precision default 0,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

-- 7. NHẬT KÝ HOẠT ĐỘNG --------------------------------------------------
create table if not exists public.activity (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id),
  action text,
  target text,
  created_at timestamptz default now()
);

-- 8. BẢO MẬT: chỉ người đã đăng nhập mới đọc/ghi ------------------------
-- (Tắt đăng ký công khai trong Authentication → Sign In / Providers và chỉ mời 3 email của nhóm)
do $$
declare t text;
begin
  foreach t in array array['profiles','folders','files','notes','boards','board_items','data_tables','data_rows','activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team_all" on public.%I', t);
    execute format('create policy "team_all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 9. REALTIME -----------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['folders','files','notes','boards','board_items','data_tables','data_rows','activity','profiles'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
alter table public.notes replica identity full;
alter table public.board_items replica identity full;
alter table public.data_rows replica identity full;

-- 10. KHO FILE (Storage) -----------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('docs', 'docs', false, 52428800)   -- giới hạn 50 MB/file
on conflict (id) do nothing;

drop policy if exists "team_docs_select" on storage.objects;
drop policy if exists "team_docs_insert" on storage.objects;
drop policy if exists "team_docs_update" on storage.objects;
drop policy if exists "team_docs_delete" on storage.objects;
create policy "team_docs_select" on storage.objects for select to authenticated using (bucket_id = 'docs');
create policy "team_docs_insert" on storage.objects for insert to authenticated with check (bucket_id = 'docs');
create policy "team_docs_update" on storage.objects for update to authenticated using (bucket_id = 'docs');
create policy "team_docs_delete" on storage.objects for delete to authenticated using (bucket_id = 'docs');

-- 11. THƯ MỤC MẪU CHO ĐỒ ÁN ----------------------------------------------
insert into public.folders (name, icon, position)
select * from (values
  ('00. Tài liệu giảng viên', '📚', 0),
  ('01. Phương án nhà máy & CSDL', '🏭', 1),
  ('02. Dữ liệu máy', '⚙️', 2),
  ('03. Thông số sản phẩm – Hộp', '📦', 3),
  ('04. Thông số sản phẩm – Sách', '📖', 4),
  ('05. Phương án sản xuất', '🗺️', 5),
  ('06. Vật tư & thời gian', '🧮', 6),
  ('07. Giá thành', '💰', 7),
  ('08. Kế hoạch sản xuất', '📅', 8),
  ('09. Báo cáo Word', '📝', 9)
) as v(name, icon, position)
where not exists (select 1 from public.folders);
