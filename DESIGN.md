# DESIGN.md - Stok Sabun Palem (auto-caturwangsa)

Aplikasi stok barang PT Catur Wangsa Indah (Sabun Palem).
Menggantikan kartu kertas "KARTU PERSEDIAAN BARANG" dan stock opname
manual. Alur: scan barcode di gerbang gudang, sistem catat Masuk/Keluar,
stok dihitung otomatis dari log transaksi.

Pengguna utama: staf gudang usia 60-70 tahun, melek teknologi rendah,
pakai HP di gudang. Pengguna kedua: Ibu Abe (manager, lulusan Telkom),
melek teknologi, menilai dari kerapian dan kesan modern.
UI harus sangat mudah untuk yang pertama, dan tetap terlihat modern
untuk yang kedua. Bukan dua UI, satu UI yang simpel di permukaan.

## Sources

- Colors: situs resmi perusahaan www.caturwangsaindah.co.id (warna
  terverifikasi, menang atas kartu inspirasi manapun). Sama dengan
  dashboard absensi caturwangsa.
- Layout: Stripe (dashboard bersih, angka tabular, kartu permukaan
  near-white, pertanyaan sebagai judul). Mobile-first: staf gudang
  pegang HP, bukan laptop.
- Shape: Linear (skala radius 8/12/16, hairline border, tanpa shadow
  berat).
- Type: Quicksand (font situs resmi perusahaan).
- Motion: code-xr (indikator pill yang berjalan antar nav, entrance
  stagger), software-speed-motion (<300ms, ease-out, transform +
  opacity saja).

## Colors

| Token | Nilai | Pakai |
|---|---|---|
| primary | #00B9BE | Tombol utama, link aktif, aksen |
| primary-deep | #0F6F72 | Header gelap, hover tombol utama |
| primary-soft | #B2EBEC | Latar badge aktif, highlight ringan |
| canvas | #E8FAF7 | Latar halaman (mint muda) |
| surface | #FFFFFF | Kartu, panel, tabel |
| surface-soft | #F6FDFC | Baris tabel selang-seling, input |
| hairline | #D6EDEA | Border kartu, pemisah tabel |
| ink | #2F3B45 | Teks utama |
| ink-muted | #5A6B76 | Teks sekunder, label |
| ink-subtle | #8A9BA5 | Placeholder, meta |
| on-primary | #FFFFFF | Teks di atas tombol utama |
| success | #1E9E6A | Badge Aman, tombol Barang Masuk |
| success-ink | #14663F | Teks di atas tint hijau |
| warning | #D97706 | Badge Menipis, tombol Barang Keluar |
| warning-ink | #92400E | Teks di atas tint oranye |
| info | #0E7FA8 | Badge info, tombol Lihat Stok |
| info-ink | #0A5E7D | Teks di atas tint biru |
| error | #DC2626 | Badge Habis, hapus, error |

Catatan: hijau untuk Masuk, oranye untuk Keluar. Bukan hijau-merah,
karena Keluar bukan error, dan oranye lebih ramah dibaca sebagai
"barang pergi" daripada merah yang terasa seperti alarm. Merah hanya
untuk Habis dan error.

## Typography

- Display + body: Quicksand (Google Fonts), 400/500/600/700.
- Angka (stok, jumlah, rekap): Quicksand 600 dengan
  `font-variant-numeric: tabular-nums` (angka sejajar, dari Stripe).
- Skala ini LEBIH BESAR dari dashboard absensi, karena pengguna
  utama berusia 60-70 tahun:
  - Judul halaman: 28px, 700, ink.
  - Judul kartu: 20px, 600, ink.
  - Nama produk (hasil scan): 24px, 700, ink.
  - Angka stok besar: 40px, 700, tabular-nums.
  - Body: 16px, 400, ink, line-height 1.6.
  - Label kecil: 14px, 500, ink-muted.
  - Tombol utama: 18px, 700.
  - Tombol sekunder: 16px, 600.
- Tidak ada teks di bawah 14px di mana pun. Placeholder dan meta
  minimal 14px.

## Shape

- Radius kartu: 16px (lebih besar dari absensi, karena kartu di sini
  adalah tombol besar yang ditekan jempol).
- Radius tombol utama: 12px.
- Radius tombol sekunder: 8px.
- Radius input: 12px.
- Radius badge: 9999px (pill).
- Material: Normal (bukan Glass, bukan Brutalist). Kartu putih solid,
  border hairline 1px, shadow lembut (0 1px 3px rgba(15,111,114,0.08)).
- Tombol utama: latar warna aksi (hijau/oranye/biru), teks putih,
  hover ke turunan gelapnya. Tinggi minimal 56px.
- Tombol sekunder: latar surface, border hairline, teks ink.
  Tinggi minimal 48px.
- Stepper jumlah: tombol + dan - berukuran 64x64px, angka tengah
  32px tabular.

## Layout

- Mobile-first, konten max-width 720px di tengah (bukan 1200px:
  ini aplikasi kerja satu tangan, bukan dashboard kantor).
- Navigasi bawah (bottom nav) di mobile, 3 item: Beranda, Stok,
  Riwayat. Item aktif ditandai satu pill yang berjalan (code-xr
  pola 1), bukan tiap item menyala sendiri.
- Di desktop, nav bawah tetap dipakai (konsisten dengan mobile),
  konten max-width 720px tetap di tengah.
- Padding konten: 20px mobile, 32px desktop.
- Gap antar kartu: 16px. Gap antar section: 32px.
- Home: 3 tombol raksasa vertikal (Masuk hijau, Keluar oranye,
  Lihat Stok biru), masing-masing tinggi 96px, ikon + label teks
  besar. Di bawahnya satu baris ringkas: total produk, produk
  menipis, produk habis.
- Scan: kamera memenuhi layar dengan kotak viewfinder di tengah
  (kotak 280x160px, sudut tebal, garis scan). Di bawah kamera:
  tombol "Cari Manual" dan tombol senter. Setelah scan: kartu
  produk (nama besar, stok saat ini, stepper jumlah, pilih lokasi,
  tombol Simpan raksasa).
- Stok: search bar besar di atas, daftar produk sebagai kartu
  (nama, stok besar + satuan, badge status, stok per lokasi kecil).
  Ketuk kartu untuk detail.
- Riwayat: daftar transaksi, kolom mirip kartu kertas (Tanggal,
  Keterangan, Masuk, Keluar, Sisa). Di mobile jadi kartu per baris,
  bukan tabel sempit.
- Sukses: layar penuh, centang hijau besar (scale-in 200ms),
  nama produk, jumlah, stok baru, tombol "Scan Lagi" dan "Selesai".

## Behavior

- Karakter: Smooth. Transisi 200ms ease-out (software-speed-motion).
- Indikator nav: pill berjalan 0.45s cubic-bezier(.22,1,.36,1)
  (code-xr pola 1).
- Entrance: kartu masuk berurutan, fade + naik 12px, 400ms,
  stagger 50ms, hero duluan (code-xr pola 11). Total maksimal 600ms.
- Kartu yang bisa diklik naik 5px saat hover (code-xr pola 13).
- Tombol: scale 0.98 saat ditekan.
- Badge status: fade + scale-in 150ms saat status berubah.
- Sukses scan: bunyi beep (Web Audio, 880Hz, 80ms) + getar
  50ms di HP (navigator.vibrate), supaya staf tahu scan berhasil
  tanpa harus lihat layar.
- Tanpa animasi loop tanpa akhir. Tanpa parallax. Ini alat kerja
  gudang, bukan landing page.

## Pages

1. **Beranda** - logo + nama perusahaan, 3 tombol raksasa
   (Barang Masuk, Barang Keluar, Lihat Stok), ringkasan kecil
   (total produk, menipis, habis).
2. **Scan Masuk / Scan Keluar** - kamera + viewfinder, tombol
   Cari Manual, tombol senter. Setelah scan: kartu produk, stepper
   jumlah, pilih lokasi (Gudang Klinik / Gudang Kantor / Kantor),
   tombol Simpan. Setelah simpan: layar sukses.
3. **Cari Manual** - search bar + dropdown produk (untuk 4 produk
   tanpa barcode dan saat kamera gagal). Pilih produk, lanjut ke
   kartu produk yang sama seperti hasil scan.
4. **Stok** - search bar, daftar 24 produk, badge Aman/Menipis/
   Habis, ketuk untuk detail (stok per lokasi, pergerakan terakhir).
5. **Riwayat** - log transaksi, filter Masuk/Keluar/Semua, kolom
   mirip kartu kertas: Tanggal, Keterangan, Masuk, Keluar, Sisa.

## Do's and Don'ts

- Do: satu layar satu tugas, tombol minimal 56px untuk aksi utama,
  label teks di SEMUA tombol (jangan ikon saja), Bahasa Indonesia
  sederhana tanpa jargon ("Barang Keluar", bukan "Outbound").
- Do: konfirmasi sukses yang jelas dan besar, tombol Batalkan yang
  mudah ditemukan.
- Do: badge status selalu berwarna dengan dot + label (skill 15).
- Don't: jangan tambah warna di luar palet ini.
- Don't: jangan pakai glassmorphism atau brutalist.
- Don't: jangan pakai emoji sebagai dekorasi di UI.
- Don't: jangan animasi loop tanpa akhir.
- Don't: jangan teks di bawah 14px.
