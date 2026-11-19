# Panduan Developer: Aplikasi Sabun Palem

Panduan ini untuk yang mengembangkan atau memelihara aplikasi.
Asumsi: sudah kenal terminal, git, dan JavaScript/TypeScript dasar.
Semua perintah di bawah dijalankan dari root repo, kecuali
dinyatakan lain.

## 1. Setup

```bash
git clone https://github.com/zakyShadra/stok-caturwangsa.git
cd stok-caturwangsa
npm install
npm run dev
```

Buka http://localhost:5173.

Catatan npm 12: install script diblokir secara default. Kalau build
gagal karena esbuild/workerd, jalankan:

```bash
npm install-scripts approve esbuild workerd
npm rebuild esbuild workerd
```

Backend Worker ada di folder `worker/` (package sendiri):

```bash
cd worker
npm install
npx tsc --noEmit   # cek tipe Worker
npx wrangler dev   # Worker lokal (butuh login wrangler)
```

## 2. Variabel lingkungan

Satu-satunya variabel yang dipakai aplikasi:

| Variabel | Isi | Kapan dipakai |
| --- | --- | --- |
| `VITE_API_URL` | URL Worker, misal `https://api.ices.my.id` | Build produksi (Pages + GitHub Pages) |

Tanpa `VITE_API_URL`, aplikasi memakai data lokal: stok dari
daftar statis di `src/lib/products.ts`, absensi dan karyawan di
memori sesi (hilang saat refresh). Ini sengaja, supaya `npm run
dev` langsung jalan tanpa backend.

Worker memakai dua secret (tidak pernah masuk repo):

- `SHEETS_CLIENT_EMAIL`: email service account Google
- `SHEETS_PRIVATE_KEY`: private key service account

Simpan keduanya dengan `scripts/setup-secrets.sh` (meminta lokasi
file JSON key), atau manual dengan `wrangler secret put`. ID sheet
(`SHEET_ID`) dan daftar origin CORS (`ALLOWED_ORIGINS`) bukan
rahasia, tersimpan sebagai var biasa di `worker/wrangler.toml`.

## 3. Build dan deploy

### Aplikasi web

```bash
npm run build          # build biasa (GitHub Pages, base /stok-caturwangsa/)
npm run preview        # pratinjau build lokal
```

Deploy ke Cloudflare Pages (manual, tidak ada integrasi Git):

```bash
VITE_API_URL=https://api.ices.my.id npm run build:pages
npx wrangler pages deploy dist --project-name caturwangsa
```

`build:pages` sama dengan `build` tapi base `/` dan menghapus
`dist/404.html`. File 404.html di root repo memang sengaja ada
untuk GitHub Pages, tapi di Cloudflare Pages ia mematikan fallback
SPA sehingga deep link (misal `/login`) jadi 404. Karena itu
`build:pages` menghapusnya dari build Pages saja.

GitHub Pages (https://zakyshadra.github.io/stok-caturwangsa/)
deploy otomatis setiap push ke main lewat workflow
`.github/workflows/deploy-pages.yml` (sudah berisi VITE_API_URL
yang benar). Domain caturwangsa.ices.my.id adalah CNAME ke
caturwangsa.pages.dev, dikelola di DNS Cloudflare (zona
ices.my.id).

### Worker + D1

Dari folder `worker/`:

```bash
npx wrangler deploy   # deploy Worker
```

Skema D1 diterapkan sekali per perubahan skema (file
`worker/schema.sql` berisi `CREATE TABLE IF NOT EXISTS`, aman
dijalankan ulang):

```bash
npx wrangler d1 execute sabun-palem-absen --remote --file=schema.sql
```

Urutan deploy yang benar saat mengubah API dan UI sekaligus:
skema D1 dulu, lalu Worker, lalu Pages. Kalau Pages duluan,
aplikasi baru bisa memanggil endpoint yang belum ada.

## 4. Struktur repo

```
.
├── src/                 Aplikasi React (Vite + React 19 + TS + Tailwind 3)
│   ├── lib/             Tipe, data, state (Context), lapisan API
│   ├── components/      Komponen bersama (ui, Layout, BottomNav,
│   │                    BarcodeScanner, CheckInFlow, charts/)
│   └── pages/           Satu file satu halaman (rute di App.tsx)
├── worker/              Backend Cloudflare Workers (Hono + D1 + Sheets)
│   ├── src/             index.ts (router), sheets.ts, attendance.ts,
│   │                    employees.ts
│   ├── schema.sql       Skema D1
│   └── wrangler.toml    Konfigurasi Worker + binding D1 + cron
├── scripts/             Script uji Playwright + setup-secrets.sh
├── docs/                Dokumentasi (folder ini)
├── public/              Aset statis (logo, manifest, service worker)
├── DESIGN.md            Token desain (warna, tipografi, perilaku)
└── index.html           Judul "Sabun Palem", favicon logo resmi
```

Pola lapisan data: tiap domain punya file `*-api.ts` dengan dua
implementasi yang bentuknya sama (remote via fetch ke Worker, dan
lokal di memori). Komponen hanya memakai interface-nya. Lihat
`src/lib/api.ts` (stok), `src/lib/attendance-api.ts` (absensi),
`src/lib/employees-api.ts` (karyawan).

## 5. Konvensi

- **Komentar kode Bahasa Indonesia**, menjelaskan ALASAN
  (arsitektur, jebakan, keputusan), bukan mengulang isi kode.
  Identifier kode dan pesan commit Bahasa Inggris.
- **Commit kecil per tugas** (satu tugas utuh, usahakan di bawah
  300 baris), pesan Conventional Commits Bahasa Inggris
  (`feat:`, `fix:`, `docs:`, `test:`, dan lain-lain, huruf kecil,
  imperatif, tanpa titik). File generated (misal lockfile) di
  commit terpisah. Jangan utak-atik history yang sudah di-push.
- **NOL em dash (U+2014)** di output apa pun: kode, komentar,
  dokumen, pesan commit. Ganti dengan koma, titik, atau tanda
  hubung biasa (-). Cek sebelum commit dengan pola byte UTF-8
  em dash (E2 80 94), tanpa mengetik karakternya langsung:
  `grep -rnP '\xE2\x80\x94' src worker/src docs README.md` harus
  kosong. (Folder node_modules dikecualikan: kode pihak ketiga di
  sana boleh mengandung em dash.)
- **Peran dan izin:** peran adalah tingkat izin (Admin/Bos/
  Manager/Staff). Divisi hanya atribut string di data karyawan,
  bukan tingkat izin. Kemampuan tambahan per orang memakai array
  `capabilities` di record karyawan (saat ini hanya
  `view-marketing`), bukan peran baru. Guard ada di
  `src/lib/attendance.ts` (`canViewMarketing`) dan rute di
  `src/App.tsx` (`RequireManagement`, `RequireMarketing`).
- **Jangan tambah endpoint tanpa validasi input.** Worker
  memvalidasi semua body POST/PUT (tipe, panjang, nilai) dan
  mengembalikan 400/404/502 yang jelas. Lihat
  `worker/src/employees.ts` sebagai contoh paling rapi.
- **Foto selfie dan bukti kerja** dikompres di sisi klien sebelum
  dikirim (maksimal 640px, JPEG 0.82), karena disimpan sebagai
  base64 di D1. Jangan kirim foto mentah.

## 6. Cara uji

Uji live memakai Playwright (headless Chromium) terhadap URL live.
Script ada di `scripts/`. Yang masih dipakai:

| Script | Yang diuji | Terakhir lolos |
| --- | --- | --- |
| `test-attendance-remote.mjs` | Absen cross-device + persetujuan Bos | 11/11 |
| `test-roles-fixes.mjs` | Matriks peran (semua role) | 34/34 |
| `test-marketing.mjs` | Halaman Pemasaran (mobile + desktop) | 21/21 |
| `pwa-check.mjs` | Manifest + service worker + instalasi | 13/13 |
| `test-nav-marketing.mjs` | Pill nav + trim teks Pemasaran | 17/17 |
| `test-employees-d1.mjs` | Employee store D1 cross-device | 23/23 |
| `test-monthly.mjs` | Tab bulanan vs Log | 1728 sel, 0 beda |
| `test-logout.mjs` | Tombol Keluar (desktop + mobile) | lolos |
| `docs-shots.mjs` | Ambil screenshot dokumentasi | - |

Jalankan dengan `node scripts/<nama>.mjs`. Variabel lingkungan
yang dipakai script: `TEST_BASE` (default
https://caturwangsa.pages.dev), `TEST_API` (default URL Worker),
`TEST_OUT` (folder screenshot), `TEST_EXE` (binary Chromium
headless).

Perhatian:

- Script uji live MENULIS data lalu membersihkannya sendiri
  (misal karyawan "Tes D1" ditambah lalu dihapus). Kalau script
  berhenti di tengah jalan karena error, cek D1/Sheet dan bersihkan
  sisa data tes secara manual.
- `test-bugs-roles.mjs` dan `test-audit.mjs` sudah kedaluwarsa
  (target localhost:5199 + angka seed lama). Jangan dijalankan
  terhadap live; tiga uji live di atas menggantikannya.
- Setelah mengubah kode, selalu `npm run build` sampai bersih
  SEBELUM push, dan `npx tsc --noEmit` di folder `worker/` kalau
  mengubah Worker.

## 7. Tugas yang sering dilakukan

**Menambah produk baru.** Tambah baris di tab info_produk sheet
(nama + barcode + satuan), lalu tambah entri yang sama di
`src/lib/products.ts` (dipakai sebagai cadangan lokal dan daftar
cari manual). Stok awal masuk lewat scan Barang Masuk atau baris
Log Transaksi.

**Menambah capability baru.** Tambah string-nya (misal
`view-laporan-stok`) di checkbox form karyawan
(`src/pages/Employees.tsx`), tambah satu fungsi guard di
`src/lib/attendance.ts` mengikuti pola `canViewMarketing`, lalu
pakai guard itu di rute (`src/App.tsx`) dan navigasi
(`src/components/Layout.tsx`, `src/components/BottomNav.tsx`).
Tidak perlu peran baru, tidak perlu migrasi database (capabilities
disimpan sebagai teks JSON).

**Mengubah lokasi kantor / radius geofence.** Ubah
`OFFICE_LOCATION` dan `GEOFENCE_RADIUS_METERS` di
`src/lib/attendance.ts` DAN salinannya di
`worker/src/attendance.ts` (server menghitung jarak sendiri dan
tidak percaya jarak dari aplikasi). Koordinat saat ini dari
geocoding dan bisa meleset dari pagar pabrik; ukur ulang dengan
GPS di lokasi kalau staff sering ditolak padahal sudah di pabrik.

**Mengubah daftar divisi.** Ubah array `DIVISIONS` di
`src/pages/Employees.tsx` (dipakai dropdown form karyawan).
Divisi hanya label, tidak mengubah izin apa pun.

**Menambah tab bulanan manual.** Normalnya cron harian (jam 01:00
WIB) membuat tab bulan baru tiap tanggal 1 secara otomatis. Kalau
perlu membuat manual, panggil `POST /api/monthly/create` dengan
body `{"month": "YYYY-MM"}`.

**Arsip foto absen.** Cron harian yang sama mengarsipkan foto
(selfie + bukti) lebih tua dari 2 bulan ke Google Drive (folder
"Arsip Foto Absensi Sabun Palem", ID dari env
`ARCHIVE_DRIVE_FOLDER_ID`), maksimal 100 foto per jalan. Urutan
per foto: upload ke Drive, verifikasi (file ID + ukuran cocok),
tulis manifest ke tabel `photo_archive`, baru hapus dari D1.
Kalau langkah apa pun gagal, foto tetap di D1 dan dicoba lagi
besok. ID folder di-cache di tabel `drive_folders`; kalau folder
di Drive dihapus manual dan arsip gagal terus, reset cache-nya:
`wrangler d1 execute sabun-palem-absen --remote --command "DELETE FROM drive_folders;"`.
Arsip pertama baru jalan saat ada foto lebih tua dari 2 bulan.

**Membangun ulang tab bulanan.** Untuk migrasi tab lama ke format
baru, panggil `POST /api/monthly/rebuild` dengan body
`{"month": "YYYY-MM"}` (hapus tab lama, buat skeleton baru,
backfill grup tanggal dari Log). Untuk menambah satu grup tanggal
tanpa scan, panggil `POST /api/monthly/ensure` dengan body
`{"date": "YYYY-MM-DD"}`.

**Memindahkan backend ke akun perusahaan.** Lihat
[docs/migrasi-akun.md](migrasi-akun.md). Jangan lupa D1: database
baru harus dibuat di akun perusahaan dan skema diterapkan ulang,
karena D1 tidak ikut pindah bersama kode Worker.

## 8. Batasan yang perlu diketahui

- **Enforcement peran masih UI-only.** Worker belum memeriksa
  siapa yang memanggil; siapa pun yang tahu URL Worker bisa
  membaca log dan menulis scan palsu. Perbaikannya adalah
  Cloudflare Access (menunggu persetujuan Pak Yunus). Sampai
  saat itu, URL Worker jangan disebarluaskan.
- **Sinkronisasi Sheet bukan realtime.** Stok di aplikasi dibaca
  dari Log lewat Worker; perubahan harga di Sheet tidak langsung
  tampil di aplikasi. Ubah harga lewat aplikasi, bukan di Sheet.
- **Tab bulanan menampilkan snapshot stok per tanggal.** Transaksi
  masuk dan keluar di hari yang sama saling meniadakan di tab
  itu; detailnya ada di tab Log Transaksi.
- **Foto disimpan di D1 sebagai base64.** R2 tidak dipakai karena
  butuh detail billing. D1 free tier dibatasi 500 MB per database,
  jadi foto lebih tua dari 2 bulan diarsipkan ke Google Drive lalu
  dihapus dari D1 (lihat bagian arsip foto di atas).
