# Migrasi Backend ke Akun Perusahaan

Dokumen ini menjelaskan cara memindahkan backend (Cloudflare Worker)
dari akun pribadi Zaky ke akun perusahaan (email kantor), tanpa mengubah
kode aplikasi.

## Yang perlu dipahami dulu

Backend ini terdiri dari 5 bagian yang terikat ke akun:

| Bagian | Terikat ke akun | Saat migrasi |
| --- | --- | --- |
| Cloudflare Worker | Akun Cloudflare tempat deploy | Deploy ulang dari akun kantor |
| Database D1 | Akun Cloudflare tempat dibuat | Buat baru di akun kantor, terapkan skema (Langkah 3b) |
| Service account Google | Project Google Cloud tempat dibuat | Buat baru di project kantor |
| Spreadsheet | Pemilik sheet | Tetap sama, hanya dibagikan ke service account baru |
| Folder arsip foto Drive | Pemilik folder | Buat baru di Drive perusahaan, bagikan ke service account baru (Langkah 2b) |

Kode tidak berubah. Yang berubah hanya akun dan kredensial.

## Langkah 1: Siapkan Google Cloud di akun kantor

1. Buka console.cloud.google.com dengan email kantor.
2. Buat project baru (misal namanya `sabun-palem-stok`), atau pakai
   project perusahaan yang sudah ada.
3. Di project itu, aktifkan **Google Sheets API** dan **Google
   Drive API** (menu API dan Layanan, lalu Cari API). Drive API
   dipakai cron arsip foto; tanpa ini arsip gagal setiap jalan
   (foto tetap aman di D1, tidak ada yang terhapus).
4. Buat service account baru (menu IAM dan Admin, lalu Service Account).
   Beri nama yang jelas, misal `stok-sabun-palem`.
5. Di service account itu, buat key baru: tab Keys, lalu Add Key, lalu
   JSON. File key akan terunduh. **Simpan file ini baik-baik dan jangan
   pernah diunggah ke GitHub.**

## Langkah 2: Bagikan spreadsheet ke service account baru

1. Buka spreadsheet stok di Google Sheets.
2. Klik Share, masukkan email service account baru
   (bentuknya `nama@project.iam.gserviceaccount.com`).
3. Beri akses **Editor**, lalu kirim.
4. Kalau mau, hapus akses service account lama dari daftar Share.

## Langkah 2b: Siapkan folder arsip foto di Drive perusahaan

Foto absen lebih tua dari 2 bulan diarsipkan otomatis ke Google
Drive (lihat `worker/src/archive.ts`). Folder tujuannya dari env
`ARCHIVE_DRIVE_FOLDER_ID`, bukan hardcode, jadi migrasi hanya
mengubah nilai env-nya:

1. Di Google Drive perusahaan, buat folder baru, misal namanya
   "Arsip Foto Absensi Sabun Palem".
2. Klik Share di folder itu, masukkan email service account baru
   (dari Langkah 1), beri akses **Editor**, lalu kirim.
3. Salin ID folder baru dari URL-nya (bagian setelah
   `/folders/`), lalu isi ke `worker/wrangler.toml` sebagai nilai
   `ARCHIVE_DRIVE_FOLDER_ID`. Commit perubahan ini sebelum deploy
   (Langkah 3).
4. Kalau isi folder lama perlu pindah, pindahkan manual dari Drive
   (pilih semua isi folder lama, pindahkan ke folder baru). Isi
   folder lama tidak ikut pindah otomatis, dan manifest di D1
   (`photo_archive`) tetap menunjuk ke file ID lama yang masih
   berlaku selama file-nya tidak dihapus.

Catatan cache: ID folder arsip di-cache di tabel D1
`drive_folders` dengan kunci root folder ID + path. Setelah
`ARCHIVE_DRIVE_FOLDER_ID` berubah, cache lama tidak terpakai lagi
(kuncinya beda) dan cache baru dibangun otomatis dari Drive.
Kalau mau membersihkan cache lama secara manual:

```sh
wrangler d1 execute sabun-palem-absen --remote --command "DELETE FROM drive_folders;"
```

## Langkah 3: Deploy Worker dari akun kantor

Di laptop, di dalam folder `worker/`:

```sh
wrangler login
```

Login dengan email kantor di browser yang terbuka. Lalu simpan dua
secret (jalankan script ini, atau manual satu per satu):

```sh
../scripts/setup-secrets.sh
```

Script akan meminta lokasi file JSON key, lalu menyimpan email dan
private key sebagai Worker secrets. Kalau mau manual:

```sh
wrangler secret put SHEETS_CLIENT_EMAIL
wrangler secret put SHEETS_PRIVATE_KEY
```

Terakhir, deploy:

```sh
wrangler deploy
```

Catat URL Worker yang tampil setelah deploy selesai.

## Langkah 3b: Buat database D1 di akun kantor

Database absensi + karyawan (D1) tidak ikut pindah bersama kode
Worker. Buat baru di akun kantor, dari folder `worker/`:

```sh
npx wrangler d1 create sabun-palem-absen
npx wrangler d1 execute sabun-palem-absen --remote --file=schema.sql
```

Perintah pertama menampilkan database ID baru. Salin ID itu ke
`worker/wrangler.toml` (field `database_id` di blok
`[[d1_databases]]`), commit, lalu deploy ulang Worker
(`wrangler deploy`).

Perhatian: data absensi dan karyawan TIDAK ikut pindah otomatis.
Database baru mulai kosong; daftar karyawan akan terisi otomatis
dari 5 karyawan awal saat pertama kali dibuka (seed), tapi riwayat
absen lama tidak ikut. Kalau riwayat lama harus pindah, ekspor dulu
dari D1 lama (`wrangler d1 export`) dan impor ke yang baru sebelum
aplikasi dipakai.

## Langkah 4: Perbarui URL Worker di aplikasi

API memakai domain custom `https://api.ices.my.id` (bukan
`workers.dev`), didaftarkan lewat `routes` di `worker/wrangler.toml`.
Alasan: ISP XL memblokir `*.workers.dev` di level DNS sejak
19 Nov 2026, sehingga aplikasi tidak bisa mencapai API dari HP
staff. URL `workers.dev` tetap aktif sebagai alamat langsung
Worker, tapi aplikasi memakai domain custom ini.

Saat pindah akun, domain custom perlu didaftarkan ulang: daftarkan
`api.ices.my.id` ke Worker di akun perusahaan (zona ices.my.id
harus tetap bisa diakses), atau ganti ke domain perusahaan dan
ubah `routes` di `wrangler.toml` + `VITE_API_URL` di bawah.

Ada dua tempat deploy aplikasi, keduanya perlu URL baru:

1. **GitHub Pages** (otomatis): buka file
   `.github/workflows/deploy-pages.yml`, ubah nilai
   `VITE_API_URL` ke URL Worker yang baru, commit dan push.
   GitHub Pages akan build ulang otomatis.
2. **Cloudflare Pages** (manual): build ulang dan deploy dari
   laptop dengan URL baru:

```sh
VITE_API_URL=https://api.ices.my.id npm run build:pages
npx wrangler pages deploy dist --project-name caturwangsa
```

Domain caturwangsa.ices.my.id adalah CNAME ke caturwangsa.pages.dev,
jadi tidak perlu diubah selama nama project Pages-nya sama.

## Langkah 5: Tes

1. Buka aplikasi, login sebagai staf.
2. Scan satu barang keluar (jumlah kecil).
3. Buka spreadsheet, tab Log Transaksi: baris baru harus muncul.
4. Tab Stok Terkini: angka produk itu harus berkurang.

Kalau baris tidak muncul, cek dua hal ini dulu: service account baru
sudah dibagikan sebagai Editor di sheet, dan kedua secret sudah
disimpan di Worker yang benar (`wrangler secret list`).

## Catatan keamanan

- File JSON key adalah kata sandi. Jangan dikirim lewat chat, jangan
  diunggah ke GitHub, jangan disimpan di folder repo.
- Secret Worker tidak bisa dibaca kembali setelah disimpan; kalau
  hilang, buat key baru dan ulangi Langkah 3.
- Spreadsheet ID di `wrangler.toml` bukan rahasia (hanya pengenal
  sheet), jadi aman tersimpan di repo.
