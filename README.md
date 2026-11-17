# Stok Sabun Palem

Aplikasi stok barang PT Catur Wangsa Indah (Sabun Palem).
Menggantikan kartu kertas "KARTU PERSEDIAAN BARANG" dan stock opname manual.

Cara pakainya simpel: staf gudang scan barcode barang yang masuk atau
keluar gudang, sistem yang catat dan hitung stoknya. Semua barang keluar
lewat gudang, jadi satu scan di sini mencatat semua penjualan, online
maupun offline.

> Status: UI selesai. Backend (Cloudflare Workers + Google Sheets)
> belum dibangun. Data saat ini disimpan di memori, hilang kalau halaman
> di-refresh.

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
node scripts/shots.mjs
```

Hasilnya di `~/workspace/your_files/stok-caturwangsa-ui/`.

## Halaman

| Rute | Isi |
|---|---|
| `/` | Beranda: 3 tombol raksasa (Barang Masuk, Barang Keluar, Lihat Stok) + ringkasan |
| `/scan/masuk` | Scan barcode barang masuk |
| `/scan/keluar` | Scan barcode barang keluar |
| `/stok` | Daftar stok semua produk, ketuk untuk detail per lokasi |
| `/riwayat` | Log transaksi (Tanggal, Keterangan, Masuk, Keluar, Sisa) |

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

## Struktur kode

```
src/
  lib/
    types.ts      Tipe data (Product, Transaction, LocationId)
    products.ts   Daftar 24 produk + riwayat awal
    api.ts        Lapisan data. Bentuk fungsinya meniru
                  endpoint Workers yang akan datang:
                  GET /api/stock, GET /api/log, POST /api/scan.
                  Nanti tinggal ganti isi fungsi ini dengan fetch.
    store.tsx     State global (React Context)
    beep.ts       Bunyi beep + getar saat scan berhasil
  components/
    ui.tsx            Tombol besar, badge status, stepper, pilih lokasi
    BottomNav.tsx     Navigasi bawah, pill berjalan (code-xr pola 1)
    BarcodeScanner.tsx Kamera + BarcodeDetector (native) / ZXing (fallback)
  pages/
    Home.tsx    Beranda
    Scan.tsx    Scan masuk/keluar + cari manual + sukses
    Stock.tsx   Daftar stok + detail per lokasi
    History.tsx Riwayat transaksi
```

## Desain

Token warna, tipografi, dan perilaku ada di `DESIGN.md`.
Ringkasan:

- Warna dari situs resmi perusahaan: cyan #00B9BE, teal gelap #0F6F72,
  latar mint #E8FAF7, font Quicksand.
- Baby-boomer friendly: tombol utama minimal 56px, teks minimal 14px,
  semua tombol ada label teksnya, satu layar satu tugas.
- Hijau = Barang Masuk, oranye = Barang Keluar, biru = Lihat Stok.
  Merah hanya untuk Habis dan error.
- Animasi: pill nav berjalan 0.45s, kartu masuk stagger 50ms,
  semua di bawah 300ms, transform + opacity saja.

## Yang belum ada (nanti)

- Backend Workers + Google Sheets (append log, formula SUMIFS).
  Struktur `lib/api.ts` sudah disiapkan untuk itu.
- Login + nama staf asli (saat ini staf ditulis "Budi").
- Stock opname mode scan massal (scan semua barang, bandingkan
  dengan stok sistem).
- Print barcode internal untuk 4 produk yang belum punya barcode.
