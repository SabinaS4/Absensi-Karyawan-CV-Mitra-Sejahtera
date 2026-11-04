-- =====================================================================
-- Fitur foto profil karyawan.
-- Jalankan di project yang SAMA, setelah schema.sql dan tambah_fitur_foto.sql:
-- Supabase > SQL Editor > New query > tempel > Run
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Kolom lokasi foto profil
alter table public.employees add column if not exists foto_profil text;

-- 2. Bucket privat khusus foto profil (JPEG, maks 1 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profil-foto', 'profil-foto', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

-- 3. Akses: admin boleh semua; karyawan hanya folder miliknya (folder = id karyawan)
drop policy if exists pf_insert on storage.objects;
drop policy if exists pf_select on storage.objects;
drop policy if exists pf_delete on storage.objects;

create policy pf_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'profil-foto'
              and (public.is_admin() or (storage.foldername(name))[1] = public.my_employee_id()::text));

create policy pf_select on storage.objects for select to authenticated
  using (bucket_id = 'profil-foto'
         and (public.is_admin() or (storage.foldername(name))[1] = public.my_employee_id()::text));

create policy pf_delete on storage.objects for delete to authenticated
  using (bucket_id = 'profil-foto'
         and (public.is_admin() or (storage.foldername(name))[1] = public.my_employee_id()::text));

-- 4. Karyawan mengganti foto profilnya sendiri lewat fungsi ini
--    (tidak diberi akses update langsung ke tabel agar kolom peran tidak bisa diubah)
create or replace function public.set_my_foto_profil(p_foto text)
returns void language plpgsql security definer set search_path = public as $$
declare emp uuid := public.my_employee_id();
begin
  if emp is null then raise exception 'Akun belum terdaftar sebagai karyawan aktif'; end if;
  if split_part(p_foto, '/', 1) <> emp::text then raise exception 'Lokasi foto tidak valid'; end if;
  update employees set foto_profil = p_foto where id = emp;
end $$;

grant execute on function public.set_my_foto_profil(text) to authenticated;
