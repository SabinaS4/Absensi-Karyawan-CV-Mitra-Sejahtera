# Absensi Karyawan · CV Mitra Sejahtera

Website absensi berbasis web: HTML + JavaScript murni (tanpa build), database Supabase, deploy Netlify.

```
absensi-mitra-sejahtera/   ← satu folder, semua file di sini
├── index.html             ← kerangka halaman
├── style.css              ← tampilan (CSS)
├── app.js                 ← logika aplikasi (JavaScript)
├── config.js              ← isi URL & anon key Supabase di sini
├── schema.sql             ← tabel, keamanan (RLS), fungsi absen, data fiktif
├── tambah_fitur_foto.sql  ← fitur foto selfie saat absen (jalankan setelah schema.sql)
├── tambah_foto_profil.sql ← fitur foto profil karyawan (jalankan setelah tambah_fitur_foto.sql)
├── buat_akun_demo.sql     ← membuat 12 akun login sekaligus (password Demo12345!)
├── netlify.toml           ← pengaturan Netlify
└── README.md
```

## Fitur

**Karyawan**: absen masuk/pulang dengan foto selfie (jam diambil dari server, WIB; foto diberi cap waktu), riwayat absensi, ajukan izin/sakit/cuti.
**Admin HRD**: dashboard kehadiran hari ini, riwayat semua karyawan beserta foto absen, setujui/tolak pengajuan (absensi terisi otomatis), rekap bulanan + unduh CSV, kelola data karyawan (termasuk foto profil). Setiap karyawan juga bisa mengganti foto profilnya sendiri dengan klik fotonya di menu samping.
Batas masuk 08:15 WIB, lewat dari itu tercatat terlambat. Ubah di fungsi `check_in()` pada `schema.sql`.

## 1. Siapkan Supabase

1. Buat project baru di supabase.com/dashboard (region Singapore).
2. Buka **SQL Editor → New query**, tempel seluruh isi `schema.sql`, klik **Run**.
   Ini membuat 3 tabel, aturan keamanan, dan data fiktif (12 karyawan, absensi 30 hari terakhir, 3 pengajuan izin).
2b. Aktifkan fitur foto selfie: New query → tempel isi `tambah_fitur_foto.sql` → Run.
2c. Aktifkan foto profil: New query → tempel isi `tambah_foto_profil.sql` → Run.
3. Buat akun login semua karyawan sekaligus: SQL Editor → New query → tempel isi `buat_akun_demo.sql` → Run.
   Semua akun memakai password `Demo12345!`. Login admin: `admin@mitrasejahtera.co.id`, login karyawan contoh: `siti@mitrasejahtera.co.id`.
4. Buka **Project Settings → API**, salin **Project URL** dan **anon / publishable key** ke `config.js`.

> Akun login dikaitkan ke data karyawan lewat **email yang sama**. Email yang tidak ada di tabel `employees` tidak bisa memakai aplikasi.

## 2. Coba di komputer (opsional)

```bash
npx serve .
```

## 3. Deploy ke Netlify

**Cara cepat (drag & drop)**: buka app.netlify.com/drop, lalu seret seluruh folder ini (pastikan `config.js` sudah terisi).

**Cara GitHub (otomatis tiap update)**: upload seluruh folder ini ke repo GitHub → di Netlify pilih **Add new site → Import an existing project** → pilih repo. `netlify.toml` sudah mengatur folder publish, jadi build command dikosongkan. File `schema.sql`, `tambah_fitur_foto.sql`, `tambah_foto_profil.sql`, `buat_akun_demo.sql`, `README.md`, dan `netlify.toml` otomatis disembunyikan dari publik (404).

## Catatan keamanan

- Anon key memang publik; data dilindungi **Row Level Security**: karyawan hanya melihat datanya sendiri, admin melihat semua.
- Jangan pernah memasukkan `service_role` key ke `config.js`.
- Absen masuk/pulang dijalankan lewat fungsi database (`check_in`, `check_out`) sehingga karyawan tidak bisa mengubah jam dari browser.
- Untuk pemakaian sungguhan, ganti semua kata sandi demo dan hapus data fiktif.

## Pengembangan lanjutan

Hari libur nasional, geolokasi, notifikasi email, dan perhitungan lembur belum ada, tetapi struktur tabelnya siap ditambah.
