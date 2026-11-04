-- =====================================================================
-- Sistem Absensi Karyawan - CV Mitra Sejahtera
-- Jalankan seluruh file ini di Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- 1. TABEL ----------
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  nip           text unique not null,
  nama          text not null,
  email         text unique not null,
  jabatan       text not null,
  departemen    text not null,
  no_hp         text,
  role          text not null default 'karyawan' check (role in ('admin','karyawan')),
  aktif         boolean not null default true,
  tanggal_masuk date not null default current_date,
  created_at    timestamptz not null default now()
);

create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  tanggal     date not null,
  jam_masuk   timestamptz,
  jam_keluar  timestamptz,
  status      text not null default 'hadir'
              check (status in ('hadir','terlambat','izin','sakit','cuti','alfa')),
  keterangan  text,
  created_at  timestamptz not null default now(),
  unique (employee_id, tanggal)
);

create table if not exists public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  jenis           text not null check (jenis in ('izin','sakit','cuti')),
  tanggal_mulai   date not null,
  tanggal_selesai date not null,
  alasan          text not null,
  status          text not null default 'menunggu'
                  check (status in ('menunggu','disetujui','ditolak')),
  created_at      timestamptz not null default now(),
  check (tanggal_selesai >= tanggal_mulai)
);

create index if not exists idx_attendance_tanggal on public.attendance(tanggal);
create index if not exists idx_leave_employee on public.leave_requests(employee_id);

-- ---------- 2. FUNGSI BANTU ----------
-- Karyawan dikenali dari email akun login (Supabase Auth).
create or replace function public.my_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email','')) and aktif
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
      and aktif and role = 'admin'
  );
$$;

-- Absen masuk memakai jam server (WIB) agar tidak bisa dimanipulasi dari browser.
-- Batas masuk: 08:15 WIB, lewat dari itu dihitung terlambat.
create or replace function public.check_in()
returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  emp uuid := public.my_employee_id();
  wib timestamp := now() at time zone 'Asia/Jakarta';
  rec public.attendance;
begin
  if emp is null then raise exception 'Akun belum terdaftar sebagai karyawan aktif'; end if;
  if exists (select 1 from attendance where employee_id = emp and tanggal = wib::date and jam_masuk is not null) then
    raise exception 'Kamu sudah absen masuk hari ini';
  end if;

  insert into attendance (employee_id, tanggal, jam_masuk, status)
  values (emp, wib::date, now(),
          case when wib::time > time '08:15' then 'terlambat' else 'hadir' end)
  on conflict (employee_id, tanggal) do update
    set jam_masuk = excluded.jam_masuk, status = excluded.status
  returning * into rec;
  return rec;
end $$;

create or replace function public.check_out()
returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  emp uuid := public.my_employee_id();
  wib date := (now() at time zone 'Asia/Jakarta')::date;
  rec public.attendance;
begin
  if emp is null then raise exception 'Akun belum terdaftar sebagai karyawan aktif'; end if;
  update attendance set jam_keluar = now()
   where employee_id = emp and tanggal = wib and jam_masuk is not null and jam_keluar is null
   returning * into rec;
  if rec.id is null then raise exception 'Belum absen masuk, atau sudah absen pulang hari ini'; end if;
  return rec;
end $$;

-- Saat pengajuan disetujui, otomatis isi tabel absensi untuk hari kerja (Senin-Jumat).
create or replace function public.apply_leave()
returns trigger language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if new.status = 'disetujui' and (tg_op = 'INSERT' or old.status is distinct from 'disetujui') then
    for d in select generate_series(new.tanggal_mulai, new.tanggal_selesai, interval '1 day')::date loop
      if extract(isodow from d) < 6 then
        insert into attendance (employee_id, tanggal, status, keterangan)
        values (new.employee_id, d, new.jenis, new.alasan)
        on conflict (employee_id, tanggal) do update
          set status = excluded.status, keterangan = excluded.keterangan;
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_leave on public.leave_requests;
create trigger trg_apply_leave after insert or update on public.leave_requests
for each row execute function public.apply_leave();

-- ---------- 3. ROW LEVEL SECURITY ----------
alter table public.employees      enable row level security;
alter table public.attendance     enable row level security;
alter table public.leave_requests enable row level security;

drop policy if exists emp_select on public.employees;
drop policy if exists emp_admin_all on public.employees;
create policy emp_select on public.employees for select to authenticated
  using (id = public.my_employee_id() or public.is_admin());
create policy emp_admin_all on public.employees for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists att_select on public.attendance;
drop policy if exists att_admin_all on public.attendance;
create policy att_select on public.attendance for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_admin());
create policy att_admin_all on public.attendance for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists lv_select on public.leave_requests;
drop policy if exists lv_insert on public.leave_requests;
drop policy if exists lv_admin_all on public.leave_requests;
create policy lv_select on public.leave_requests for select to authenticated
  using (employee_id = public.my_employee_id() or public.is_admin());
create policy lv_insert on public.leave_requests for insert to authenticated
  with check (employee_id = public.my_employee_id() and status = 'menunggu');
create policy lv_admin_all on public.leave_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant execute on function public.check_in(), public.check_out(),
  public.my_employee_id(), public.is_admin() to authenticated;

-- ---------- 4. DATA FIKTIF ----------
insert into public.employees (nip, nama, email, jabatan, departemen, no_hp, role, tanggal_masuk) values
 ('MS-001','Budi Santoso','admin@mitrasejahtera.co.id','Manajer HRD','Sumber Daya Manusia','081234567801','admin','2018-03-01'),
 ('MS-002','Siti Nurhaliza','siti@mitrasejahtera.co.id','Staf Keuangan','Keuangan','081234567802','karyawan','2019-07-15'),
 ('MS-003','Andi Prasetyo','andi@mitrasejahtera.co.id','Supervisor Gudang','Operasional','081234567803','karyawan','2019-01-10'),
 ('MS-004','Dewi Lestari','dewi@mitrasejahtera.co.id','Staf Pemasaran','Pemasaran','081234567804','karyawan','2020-02-03'),
 ('MS-005','Rizky Ramadhan','rizky@mitrasejahtera.co.id','Staf IT','Teknologi Informasi','081234567805','karyawan','2020-08-17'),
 ('MS-006','Ayu Wulandari','ayu@mitrasejahtera.co.id','Admin Penjualan','Penjualan','081234567806','karyawan','2021-04-05'),
 ('MS-007','Hendra Wijaya','hendra@mitrasejahtera.co.id','Kepala Penjualan','Penjualan','081234567807','karyawan','2017-11-20'),
 ('MS-008','Rina Marlina','rina@mitrasejahtera.co.id','Staf Akuntansi','Keuangan','081234567808','karyawan','2021-09-13'),
 ('MS-009','Fajar Nugroho','fajar@mitrasejahtera.co.id','Staf Gudang','Operasional','081234567809','karyawan','2022-01-24'),
 ('MS-010','Maya Anggraini','maya@mitrasejahtera.co.id','Desainer Grafis','Pemasaran','081234567810','karyawan','2022-06-01'),
 ('MS-011','Doni Saputra','doni@mitrasejahtera.co.id','Driver Pengiriman','Operasional','081234567811','karyawan','2022-10-10'),
 ('MS-012','Lina Permata','lina@mitrasejahtera.co.id','Resepsionis','Umum','081234567812','karyawan','2023-02-20')
on conflict (email) do nothing;

-- Riwayat absensi 30 hari terakhir (hari kerja saja) dengan variasi acak
with r as (
  select e.id as employee_id, d::date as tanggal,
         random() as p, random() as t1, random() as t2
  from public.employees e
  cross join generate_series(current_date - 30, current_date - 1, interval '1 day') d
  where extract(isodow from d) < 6
)
insert into public.attendance (employee_id, tanggal, jam_masuk, jam_keluar, status, keterangan)
select employee_id, tanggal,
  case
    when p < 0.80 then (tanggal::timestamp + interval '7 hours 40 minutes' + t1 * interval '34 minutes') at time zone 'Asia/Jakarta'
    when p < 0.90 then (tanggal::timestamp + interval '8 hours 16 minutes' + t1 * interval '50 minutes') at time zone 'Asia/Jakarta'
  end,
  case
    when p < 0.90 then (tanggal::timestamp + interval '17 hours' + t2 * interval '45 minutes') at time zone 'Asia/Jakarta'
  end,
  case when p < 0.80 then 'hadir'
       when p < 0.90 then 'terlambat'
       when p < 0.94 then 'izin'
       when p < 0.97 then 'sakit'
       else 'alfa' end,
  case when p >= 0.90 and p < 0.94 then 'Keperluan keluarga'
       when p >= 0.94 and p < 0.97 then 'Sakit, istirahat di rumah'
       when p >= 0.97 then 'Tanpa keterangan' end
from r
on conflict (employee_id, tanggal) do nothing;

-- Contoh pengajuan izin / cuti yang menunggu persetujuan
insert into public.leave_requests (employee_id, jenis, tanggal_mulai, tanggal_selesai, alasan, status)
select id, 'cuti', current_date + 5, current_date + 7, 'Acara pernikahan keluarga di Yogyakarta', 'menunggu'
from public.employees where email = 'dewi@mitrasejahtera.co.id'
union all
select id, 'sakit', current_date + 1, current_date + 1, 'Kontrol ke dokter gigi', 'menunggu'
from public.employees where email = 'rizky@mitrasejahtera.co.id'
union all
select id, 'izin', current_date + 2, current_date + 2, 'Mengurus perpanjangan SIM', 'menunggu'
from public.employees where email = 'andi@mitrasejahtera.co.id';
