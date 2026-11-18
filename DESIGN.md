# DESIGN.md - Sabun Palem (Absensi + Stok)

Satu aplikasi PT Catur Wangsa Indah (Sabun Palem): absensi
karyawan dan stok barang gudang. Absensi dibangun ulang dari nol
di dalam aplikasi stok (dashboard absensi lama sudah diarsip),
dengan bahasa desain yang sama, supaya satu app terasa konsisten.

- Absensi: absen masuk/pulang (GPS + selfie), pengajuan Izin/Cuti
  oleh staf, persetujuan absensi oleh Bos (Setujui/Tolak), bukti kerja
  harian (foto/dokumen yang dilampirkan staf), daftar karyawan
  (Admin saja), laporan rekap (hanya yang sudah disetujui).
- Stok: scan barcode di gerbang gudang, sistem catat Masuk/Keluar,
  stok dihitung otomatis dari log transaksi. Menggantikan kartu
  kertas "KARTU PERSEDIAAN BARANG" dan stock opname manual.

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
  pegang HP, bukan laptop. Sidebar desktop dari dashboard absensi
  lama (240px, teal gelap, grup UTAMA/ABSENSI/STOK), pill berjalan
  code-xr.
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
untuk Habis dan error. Badge absensi memakai token yang sama:
Hadir hijau, Izin/Cuti biru. Tidak ada status Telat: jam kerja
fleksibel, tidak ada jam masuk tetap.

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
- Navigasi bawah (bottom nav) di mobile, 5 item: Beranda, Absensi,
  Stok, Riwayat, Akun. Item aktif ditandai satu pill yang berjalan
  (code-xr pola 1), bukan tiap item menyala sendiri. Item Akun
  membuka halaman Akun (nama + peran + tombol Keluar), karena di HP
  tidak ada sidebar tempat tombol Keluar tinggal.
- Di desktop, sidebar kiri 240px teal gelap, grup UTAMA (Beranda),
  ABSENSI (Absensi, Karyawan, Laporan), STOK (Barang Masuk,
  Barang Keluar, Lihat Stok, Riwayat). Satu pill berjalan menandai
  item aktif, posisinya diukur dari DOM. Karyawan hanya muncul untuk
  Admin; Laporan untuk Admin, Bos, dan Manager. Sidebar menempel di
  viewport (sticky, tinggi penuh layar): area nav bergeser sendiri
  kalau isinya lebih tinggi dari layar, dan footer (nama pengguna
  + tombol Keluar) selalu menempel di bawah viewport, tidak
  terkubur di bawah halaman panjang. Pill diukur ulang saat nav
  digeser, supaya tidak melenceng.
- Tombol Keluar: selalu kelihatan tanpa scroll, di semua ukuran
  layar. Tinggi minimal 44px, ikon + label teks "Keluar", latar
  yang kontras jelas (putih solid di footer sidebar gelap, tombol
  utama penuh di halaman Akun). Tanpa dialog konfirmasi: masuk
  lagi cuma satu ketuk lewat tombol akun cepat di Login.
- Footer: di bawah konten tiap halaman (kecuali halaman scan):
  garis hairline + "© {tahun} PT Catur Wangsa Indah. All rights
  reserved." rata tengah, teks 14px muted, tahun dinamis. Di HP,
  padding bawah konten menjaga footer tetap di atas BottomNav.
- Padding konten: 20px mobile, 32px desktop.
- Gap antar kartu: 16px. Gap antar section: 32px.
- Beranda staf: kartu "Absen saya hari ini" di atas (jam live
  besar, tombol Absen Masuk/Pulang), lalu 3 tombol raksasa
  vertikal (Masuk hijau, Keluar oranye, Lihat Stok biru),
  masing-masing tinggi 96px, ikon + label teks besar. Di bawahnya
  rekap saya bulan ini dan ringkasan stok.
- Beranda Admin/Bos/Manager: panel "Perlu perhatian hari ini"
  (belum absen, sudah absen + jam masuknya, bukti kerja yang belum
  dilampirkan, absen yang menunggu persetujuan Bos), baris statistik
  (Total karyawan, Hadir, Izin/Cuti, Belum absen), stok menipis.
  Bos tidak absen.
- Absensi: kartu bukti kerja di atas untuk staf (tombol
  "Lampirkan File" setelah absen masuk, thumbnail + nama file +
  tombol Hapus) dan form pengajuan Izin/Cuti. Untuk Admin/Bos/
  Manager: antrean "Menunggu persetujuan" (Bos: tombol Setujui/
  Tolak di tiap catatan; Manager/Admin: status saja), baris
  "Bukti kerja: X dari Y yang hadir sudah melampirkan", lalu kartu
  per karyawan (nama, divisi, badge status + badge persetujuan,
  jam Masuk/Pulang, bukti kerja tiap karyawan yang bisa diketuk
  untuk diperbesar lewat lightbox, selfie absen dengan jam dan
  jarak dari kantor).
- Karyawan (Admin saja): kartu per karyawan (nama, jabatan, divisi,
  no HP, badge Aktif, tombol Ubah/Hapus), form tambah/ubah di atas.
- Laporan: pemilih rentang tanggal, tombol Unduh CSV, kalimat
  ringkasan periode, kartu per karyawan (Hadir/Izin/Total, urut
  dari yang paling sedikit hadir). Hanya catatan yang sudah
  disetujui Bos yang dihitung; yang pending tampil terpisah.
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
- Lightbox foto bukti kerja: overlay gelap fullscreen, foto di
  tengah, tombol tutup X di kanan atas, ketuk di luar foto untuk
  menutup. Harus dirender lewat React Portal ke document.body,
  karena wrapper halaman (.page-enter) punya animasi transform
  yang membuat position:fixed di dalamnya relatif ke halaman.
- Tanpa animasi loop tanpa akhir. Tanpa parallax. Ini alat kerja
  gudang, bukan landing page.

## Pages

1. **Login** - logo + nama perusahaan, input email dan kata
   sandi besar, tombol akun cepat (ketuk untuk mengisi).
2. **Beranda** - staf: kartu absen hari ini + 3 tombol raksasa
   (Barang Masuk, Barang Keluar, Lihat Stok) + rekap bulan ini
   + ringkasan stok. Admin/Bos/Manager: panel perhatian +
   statistik + stok menipis. Bos tidak absen.
3. **Absensi** - staf: kartu bukti kerja (upload setelah absen
   masuk) + form pengajuan Izin/Cuti + pilih tanggal + kartu absen
   saya. Admin/Bos/Manager: antrean persetujuan + pilih tanggal +
   hitungan bukti kerja + kartu per karyawan dengan bukti kerjanya
   dan selfie absen (jam + jarak dari kantor, ketuk thumbnail untuk
   memperbesar). Rekap bulanan di bawah (hanya yang disetujui).
   **Flow absen (CheckInFlow):** overlay layar penuh, 2 langkah
   bertahap. Langkah 1 cek lokasi GPS (radius 200 m dari kantor
   Jl. Peta No. 71, Bandung; di luar radius ditolak tanpa jalan
   pintas, izin ditolak tampil pesan + tombol Coba Lagi). Langkah
   2 foto selfie kamera depan, preview dengan tombol "Ini Foto
   Saya" / "Foto Ulang". Berlaku untuk Absen Masuk dan Absen
   Pulang. Pesan error Bahasa Indonesia sederhana, tanpa istilah
   teknis. Selfie diperkecil dulu (maks 640px, JPEG 0.82) lalu
   di-upload ke server (database D1, tabel photos), supaya Bos bisa
   melihat foto absen dari HP-nya sendiri dan foto tetap tampil
   setelah halaman di-refresh. Catatan absen, selfie, dan bukti
   kerja semuanya tersimpan di server, bukan di HP masing-masing:
   backend adalah sumber kebenaran, localStorage hanya cache
   status hari ini untuk akun yang sedang masuk.
   **Persetujuan absensi:** tiap catatan absen berstatus pending,
   approved, atau rejected. Check-in baru dan pengajuan Izin/Cuti
   baru berstatus pending. Bos menyetujui/menolak dari antrean di
   halaman Absensi (atau dari kartu karyawan). Rekap dan laporan
   hanya menghitung yang approved; yang rejected tidak dihitung dan
   karyawannya kembali ke "Belum absen" (harus absen ulang).
4. **Karyawan** (Admin saja) - daftar karyawan, tambah/
   ubah/hapus. Peran lain dialihkan ke Beranda kalau membuka rute ini.
5. **Laporan** (Admin/Bos/Manager) - rentang tanggal, unduh CSV,
   rekap per karyawan. Hanya yang sudah disetujui yang dihitung.
6. **Scan Masuk / Scan Keluar** - kamera + viewfinder, tombol
   Cari Manual, tombol senter. Setelah scan: kartu produk, stepper
   jumlah, pilih lokasi (Gudang Klinik / Gudang Kantor / Kantor),
   tombol Simpan. Setelah simpan: layar sukses.
7. **Cari Manual** - search bar + dropdown produk (untuk 4 produk
   tanpa barcode dan saat kamera gagal). Pilih produk, lanjut ke
   kartu produk yang sama seperti hasil scan.
8. **Stok** - search bar, daftar 24 produk, badge Aman/Menipis/
   Habis, ketuk untuk detail (stok per lokasi, pergerakan terakhir).
9. **Riwayat** - log transaksi, filter Masuk/Keluar/Semua, kolom
   mirip kartu kertas: Tanggal, Keterangan, Masuk, Keluar, Sisa.
   Tampilan kedua "Per Hari": stok akhir tiap produk per tanggal
   dalam sebulan, dengan selisih harian.
10. **Akun** - nama, peran, dan email pengguna yang sedang masuk,
    plus satu tombol Keluar besar (lebar penuh, ikon + label).
    Satu layar satu tugas: halaman ini hanya untuk keluar.

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
- Do: filter pilihan eksklusif (Semua / Masuk / Keluar) pakai
  SegmentedControl (ui.tsx), satu baris, tidak pernah bungkus.
  Chip terpisah yang bungkus tidak rata dilarang untuk filter.
- Do: angka stok atau riwayat yang gagal dimuat tampil sebagai
  pesan error + tombol "Coba lagi", bukan angka 0. Stok dan riwayat
  dimuat terpisah (allSettled): satu gagal tidak membuang yang lain.
- Do: nilai kosong tampil konsisten dengan warna ink-subtle: jumlah
  kosong tampil "0", jam kosong tampil "-". Jangan biarkan tanda
  hubung " - " menggantung di ujung baris: meta multi-bagian dipecah
  ke baris terpisah (keterangan, lalu lokasi dan petugas).
- Do: nama produk tidak pernah dipotong dengan truncate. Kartu stok
  dua baris (nama sampai 2 baris + angka, lalu barcode + badge).
- Do: tabel bulanan di Riwayat (Per Hari) geser horizontal dengan
  scroll-snap: kolom tanggal dikelompokkan per panel, satu panel
  adalah satu titik snap (3 kolom di HP, 4 kolom di layar lebar).
  Panel HARUS muat dalam lebar area geser, kalau tidak snap
  berhenti di tengah panel. Kolom nama produk di luar area geser
  supaya selalu kelihatan. Tanggal yang belum lewat tampil "-",
  bukan 0, supaya tidak dikira stoknya habis.
