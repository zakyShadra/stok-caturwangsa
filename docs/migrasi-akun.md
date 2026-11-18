# Migrasi Backend ke Akun Perusahaan

Dokumen ini menjelaskan cara memindahkan backend (Cloudflare Worker)
dari akun pribadi Zaky ke akun perusahaan (email kantor), tanpa mengubah
kode aplikasi.

## Yang perlu dipahami dulu

Backend ini terdiri dari 3 bagian yang terikat ke akun:

| Bagian | Terikat ke akun | Saat migrasi |
| --- | --- | --- |
| Cloudflare Worker | Akun Cloudflare tempat deploy | Deploy ulang dari akun kantor |
| Service account Google | Project Google Cloud tempat dibuat | Buat baru di project kantor |
| Spreadsheet | Pemilik sheet | Tetap sama, hanya dibagikan ke service account baru |

Kode tidak berubah. Yang berubah hanya akun dan kredensial.

## Langkah 1: Siapkan Google Cloud di akun kantor

1. Buka console.cloud.google.com dengan email kantor.
2. Buat project baru (misal namanya `sabun-palem-stok`), atau pakai
   project perusahaan yang sudah ada.
3. Di project itu, aktifkan **Google Sheets API**
   (menu API dan Layanan, lalu Cari API).
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

## Langkah 4: Perbarui URL Worker di aplikasi

URL Worker berubah saat pindah akun, karena bagian belakang
`workers.dev` mengikuti nama akun Cloudflare. Nama Worker-nya sama
(`stok-sabun-palem`), tapi subdomainnya beda.

1. Buka file `.github/workflows/deploy-pages.yml`.
2. Ubah nilai `VITE_API_URL` ke URL Worker yang baru.
3. Commit dan push. GitHub Pages akan build ulang otomatis.

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
