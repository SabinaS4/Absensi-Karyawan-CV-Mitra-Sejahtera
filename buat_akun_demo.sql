-- =====================================================================
-- Buat akun login untuk SEMUA karyawan di tabel employees sekaligus.
-- Jalankan SETELAH schema.sql, di Supabase > SQL Editor > New query > Run.
-- Password semua akun: Demo12345!   (ubah di baris "pwd" jika mau)
-- Aman dijalankan ulang: email yang sudah punya akun akan dilewati.
-- =====================================================================
do $$
declare
  pwd text := 'Demo12345!';
  r   record;
  uid uuid;
begin
  for r in select email from public.employees where aktif loop
    if exists (select 1 from auth.users where lower(email) = lower(r.email)) then
      continue;
    end if;

    uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      lower(r.email), extensions.crypt(pwd, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid,
      jsonb_build_object('sub', uid::text, 'email', lower(r.email), 'email_verified', true),
      'email', uid::text, now(), now(), now()
    );
  end loop;
end $$;

-- Cek hasilnya: harus muncul 12 baris
select u.email, e.nama, e.role
from auth.users u
join public.employees e on lower(e.email) = lower(u.email)
order by e.nip;
