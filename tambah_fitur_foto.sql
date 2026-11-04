-- =====================================================================
-- Fitur foto selfie saat absen masuk & pulang.
-- Jalankan di project yang SAMA, SETELAH schema.sql:
-- Supabase > SQL Editor > New query > tempel > Run
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Kolom untuk menyimpan lokasi file foto
alter table public.attendance
  add column if not exists foto_masuk  text,
  add column if not exists foto_keluar text;

-- 2. Bucket penyimpanan (privat, hanya JPEG, maks 1 MB per foto)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('absensi-foto', 'absensi-foto', false, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

-- 3. Aturan akses foto: karyawan hanya boleh unggah & lihat foto di folder miliknya,
--    admin boleh melihat semua. Nama folder = id karyawan.
drop policy if exists foto_insert on storage.objects;
drop policy if exists foto_select on storage.objects;

create policy foto_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'absensi-foto'
              and (storage.foldername(name))[1] = public.my_employee_id()::text);

create policy foto_select on storage.objects for select to authenticated
  using (bucket_id = 'absensi-foto'
         and ((storage.foldername(name))[1] = public.my_employee_id()::text
              or public.is_admin()));

-- 4. Perbarui fungsi absen agar menerima path foto
drop function if exists public.check_in();
drop function if exists public.check_out();

create or replace function public.check_in(p_foto text default null)
returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  emp uuid := public.my_employee_id();
  wib timestamp := now() at time zone 'Asia/Jakarta';
  rec public.attendance;
begin
  if emp is null then raise exception 'Akun belum terdaftar sebagai karyawan aktif'; end if;
  if p_foto is not null and split_part(p_foto, '/', 1) <> emp::text then
    raise exception 'Lokasi foto tidak valid';
  end if;
  if exists (select 1 from attendance where employee_id = emp and tanggal = wib::date and jam_masuk is not null) then
    raise exception 'Kamu sudah absen masuk hari ini';
  end if;

  insert into attendance (employee_id, tanggal, jam_masuk, status, foto_masuk)
  values (emp, wib::date, now(),
          case when wib::time > time '08:15' then 'terlambat' else 'hadir' end, p_foto)
  on conflict (employee_id, tanggal) do update
    set jam_masuk = excluded.jam_masuk, status = excluded.status, foto_masuk = excluded.foto_masuk
  returning * into rec;
  return rec;
end $$;

create or replace function public.check_out(p_foto text default null)
returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  emp uuid := public.my_employee_id();
  wib date := (now() at time zone 'Asia/Jakarta')::date;
  rec public.attendance;
begin
  if emp is null then raise exception 'Akun belum terdaftar sebagai karyawan aktif'; end if;
  if p_foto is not null and split_part(p_foto, '/', 1) <> emp::text then
    raise exception 'Lokasi foto tidak valid';
  end if;
  update attendance set jam_keluar = now(), foto_keluar = p_foto
   where employee_id = emp and tanggal = wib and jam_masuk is not null and jam_keluar is null
   returning * into rec;
  if rec.id is null then raise exception 'Belum absen masuk, atau sudah absen pulang hari ini'; end if;
  return rec;
end $$;

grant execute on function public.check_in(text), public.check_out(text) to authenticated;
