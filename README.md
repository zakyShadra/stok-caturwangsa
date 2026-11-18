# Sabun Palem (Absensi + Stok)

Satu aplikasi untuk PT Catur Wangsa Indah (Sabun Palem): absensi
karyawan dan stok barang gudang, dalam satu tempat.

- Absensi: absen masuk/pulang, tandai Izin/Cuti, bukti kerja
  harian (foto/dokumen), daftar karyawan, laporan rekap.
- Stok: scan barcode barang masuk/keluar gudang, daftar stok,
  riwayat transaksi. Menggantikan kartu kertas
  "KARTU PERSEDIAAN BARANG" dan stock opname manual.

Semua barang keluar lewat gudang, jadi satu scan di sini mencatat
semua penjualan, online maupun offline.

> Status: UI selesai. Backend (Cloudflare Workers + Google Sheets
> + R2 untuk bukti kerja) belum dibangun. Data saat ini disimpan
> di memori, hilang kalau halaman di-refresh, kecuali status absen
> hari ini yang disimpan di localStorage dan direset keesokan hari.

## Cara jalanin

```bash
npm install
npm run dev
```

Buka http://localhost:5173. Untuk scan barcode, buka lewat HP
(kamera HP jauh lebih bagus dari webcam laptop) atau izinkan kamera
di laptop.

Build produksi:

```bash
npm run build
npm run preview
```

Screenshot QA (butuh Playwright + preview jalan di port 5199):

```bash
node scripts/shots-merged.mjs
```

Hasilnya di `~/workspace/your_files/stok-caturwangsa-ui/`.

## Akun

Login saat ini masih di sisi UI (auth asli nanti pakai Cloudflare
Access dengan allowlist Gmail). Akun yang tersedia:

| Email | Kata sandi | Role |
|---|---|---|
| admin@sabunpalem.co.id | admin123 | Admin (Zaky) |
| bos@sabunpalem.co.id | bos123 | Bos (Pak Yunus) |
| manager@sabunpalem.co.id | manager123 | Manager (Ibu Abe) |
| staff@sabunpalem.co.id | staff123 | Staff (Budi Santoso) |

Role: Admin, Bos, dan Manager melihat semua halaman termasuk
Karyawan dan Laporan, serta daftar hadir dan bukti kerja semua
karyawan. Staff hanya melihat absensi dan stoknya sendiri.

## Halaman

| Rute | Isi | Role |
|---|---|---|
| `/login` | Masuk dengan email + kata sandi | Semua |
| `/` | Beranda gabungan (lihat bawah) | Semua |
| `/absensi` | Absen masuk/pulang, bukti kerja, daftar hadir, tandai Izin/Cuti | Semua |
| `/karyawan` | Daftar + tambah/ubah/hapus karyawan | Admin, Bos, Manager |
| `/laporan` | Rekap kehadiran per periode + unduh CSV | Admin, Bos, Manager |
| `/scan/masuk` | Scan barcode barang masuk | Semua |
| `/scan/keluar` | Scan barcode barang keluar | Semua |
| `/stok` | Daftar stok semua produk, ketuk untuk detail per lokasi | Semua |
| `/riwayat` | Log transaksi (Tanggal, Keterangan, Masuk, Keluar, Sisa) | Semua |

Beranda staf: kartu "Absen saya hari ini" (jam live, tombol Absen
Masuk/Pulang), 3 tombol raksasa (Barang Masuk, Barang Keluar,
Lihat Stok), rekap saya bulan ini, ringkasan stok.

Beranda Admin/Bos/Manager: panel "Perlu perhatian hari ini"
(belum absen, telat, bukti kerja yang belum dilampirkan),
statistik kehadiran, stok menipis. Bos tidak absen, dia hanya
memantau daftar hadir dan bukti kerja.

## Alur absensi

1. Staf ketuk Absen Masuk di Beranda. Masuk setelah pukul 08:15
   dihitung Telat.
2. Setelah absen masuk, staf melampirkan bukti kerja hari ini
   di halaman Absensi (foto atau dokumen, bisa lebih dari satu).
3. Bos dan Manager melihat daftar hadir + bukti kerja tiap
   karyawan di halaman Absensi. Foto bisa diketuk untuk diperbesar.
4. Manager/Admin menandai Izin/Cuti lewat form di halaman Absensi.
5. Staf ketuk Absen Pulang saat selesai kerja.
6. Laporan: pilih rentang tanggal, lihat rekap per karyawan
   (Telat/Hadir/Izin/Total, urut dari yang paling sering telat),
   unduh CSV untuk Excel.

## Alur scan

1. Buka Barang Masuk / Barang Keluar, kamera nyala otomatis.
2. Arahkan barcode ke dalam kotak. Bunyi beep = scan berhasil.
3. Kartu produk muncul: nama, stok saat ini, status (Aman/Menipis/Habis).
4. Atur jumlah pakai tombol + dan - (tidak perlu mengetik).
5. Pilih lokasi (Gudang Klinik / Gudang Kantor / Kantor).
6. Pilih keterangan (Jualan Magang, Konsinyasi, Stok Gudang, dll).
7. Ketuk Simpan. Layar sukses menampilkan stok baru.
8. Kalau salah input, ketuk "Batalkan, saya salah input" di layar sukses.

Tidak ada barcode? Ketuk "Cari Manual", cari nama produk, lanjut sama
seperti habis scan. 4 produk belum punya barcode: BS Powder 60k,
Bomber Matic, Jelly Cream 140gr, Jelly Pink Toples.

## Data

Produk dan stok awal diambil dari tab RESUME sheet "SO Detail"
perusahaan (24 produk, 20 sudah punya barcode EAN-13). Pembagian
stok per lokasi mengikuti pola tab Agustus 2026 (sebagian besar
di Gudang Klinik). Riwayat awal dibuat dari keterangan yang ada
di kartu kertas asli.

Data karyawan: 2 karyawan (Budi Santoso - Gudang, Maya Putri -
Admin). Karyawan lain ditambahkan lewat halaman Karyawan.
Logika absensi (alur masuk/pulang, batas telat 08:15, Izin/Cuti,
rekap bulanan) diambil dari dashboard absensi lama (repo
caturwangsa, sudah diarsip), tapi semua halaman absensi di sini
dibangun ulang dari nol mengikuti bahasa desain aplikasi stok.

## Struktur kode

```
src/
  lib/
    types.ts          Tipe data stok (Product, Transaction, LocationId)
    products.ts       Daftar 24 produk + riwayat awal
    api.ts            Lapisan data stok. Bentuk fungsinya meniru
                      endpoint Workers yang akan datang:
                      GET /api/stock, GET /api/log, POST /api/scan.
                      Nanti tinggal ganti isi fungsi ini dengan fetch.
    store.tsx         State global stok (React Context)
    beep.ts           Bunyi beep + getar saat scan berhasil
    attendance.ts     Tipe + data absensi (Role, User, Employee,
                      AttendanceRecord, EvidenceFile), batas telat
                      08:15, helper tanggal/waktu WIB
    auth.tsx          Auth (React Context), login/logout,
                      tersimpan di localStorage
    attendance-state.tsx  State absensi (React Context): absen
                      masuk/pulang (tersimpan di localStorage
                      per hari) + bukti kerja per karyawan
  components/
    ui.tsx            Tombol besar, badge status, stepper, pilih lokasi
    Layout.tsx        Sidebar desktop (grup UTAMA/ABSENSI/STOK,
                      pill berjalan) + wrapper konten
    BottomNav.tsx     Navigasi bawah HP, 4 item, pill berjalan
    BarcodeScanner.tsx Kamera + BarcodeDetector (native) / ZXing (fallback)
  pages/
    Login.tsx      Masuk
    Home.tsx       Beranda gabungan (staf / Admin-Bos-Manager)
    Attendance.tsx Absensi + bukti kerja + tandai Izin/Cuti
    Employees.tsx  Daftar + kelola karyawan
    Reports.tsx    Rekap kehadiran + unduh CSV
    Scan.tsx       Scan masuk/keluar + cari manual + sukses
    Stock.tsx      Daftar stok + detail per lokasi
    History.tsx    Riwayat transaksi
```

## Desain

Token warna, tipografi, dan perilaku ada di `DESIGN.md`.
Ringkasan:

- Warna dari situs resmi perusahaan: cyan #00B9BE, teal gelap #0F6F72,
  latar mint #E8FAF7, font Quicksand.
- Baby-boomer friendly: tombol utama minimal 56px, teks minimal 14px,
  semua tombol ada label teksnya, satu layar satu tugas.
- Hijau = Barang Masuk dan Hadir, oranye = Barang Keluar dan Telat,
  biru = Lihat Stok dan Izin/Cuti. Merah hanya untuk Habis dan error.
- Animasi: pill nav berjalan 0.45s, kartu masuk stagger 50ms,
  semua di bawah 300ms, transform + opacity saja.
- Catatan teknis: overlay fullscreen (misal lightbox foto bukti
  kerja) harus dirender lewat React Portal ke document.body,
  karena wrapper halaman punya animasi transform yang membuat
  position:fixed di dalamnya relatif ke halaman, bukan ke layar.

## Yang belum ada (nanti)

- Backend Workers + Google Sheets (append log, formula SUMIFS).
  Struktur `lib/api.ts` sudah disiapkan untuk itu.
- Upload bukti kerja ke Workers + R2 (saat ini file hanya
  di memori, hilang kalau halaman di-refresh).
- Auth asli: Cloudflare Access dengan allowlist Gmail (tanpa PIN).
- User/allowlist di D1, Zaky sebagai admin.
- Stock opname mode scan massal (scan semua barang, bandingkan
  dengan stok sistem).
- Print barcode internal untuk 4 produk yang belum punya barcode.
