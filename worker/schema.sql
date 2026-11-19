-- Skema absensi Sabun Palem (D1 database sabun-palem-absen).
-- Terapkan: wrangler d1 execute sabun-palem-absen --remote --file=schema.sql
--
-- Foto disimpan di tabel photos (base64): R2 belum bisa dipakai
-- karena mengaktifkannya butuh detail pembayaran di dashboard
-- Cloudflare (di luar wewenang agent). Foto sudah diperkecil di
-- sisi aplikasi (maks 640px, JPEG 0.82, sekitar 30-100 KB per
-- foto). D1 free tier dibatasi 500 MB per database, jadi foto TIDAK
-- disimpan selamanya: cron harian mengarsipkan foto lebih tua dari
-- 2 bulan ke Google Drive (folder "Arsip Foto Absensi Sabun
-- Palem"), lalu menghapusnya dari D1 setelah upload terverifikasi
-- dan manifest tertulis di tabel photo_archive (lihat
-- worker/src/archive.ts). Catatan absennya tetap ada; UI
-- menampilkan "Foto sudah diarsipkan ke Drive" untuk foto yang
-- sudah pindah.
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT NOT NULL CHECK (status IN ('Hadir', 'Izin', 'Cuti')),
  approval TEXT NOT NULL DEFAULT 'pending' CHECK (approval IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

CREATE TABLE IF NOT EXISTS photos (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendance_id INTEGER NOT NULL REFERENCES attendance(id),
  kind TEXT NOT NULL CHECK (kind IN ('masuk', 'pulang')),
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  distance_m INTEGER NOT NULL,
  accuracy_m INTEGER,
  selfie_key TEXT,
  selfie_name TEXT NOT NULL,
  time TEXT NOT NULL,
  UNIQUE (attendance_id, kind)
);
-- accuracy_m: akurasi GPS (meter) saat absen, dari coords.accuracy.
-- NULL = aplikasi lama tidak mengirim (dianggap presisi). Akurasi di
-- atas 500 m ditandai "Lokasi tidak akurat" di antrean Bos, karena
-- jaraknya tidak bisa dipercaya (kasus laptop tanpa GPS).
-- Migrasi database yang sudah ada:
--   ALTER TABLE verification ADD COLUMN accuracy_m INTEGER;

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'doc')),
  size_label TEXT NOT NULL,
  photo_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_emp_date ON evidence(employee_id, date);

-- Review bukti kerja oleh Manager: satu marker per karyawan per
-- hari. Marker, BUKAN approval: hanya mencatat Manager sudah
-- memeriksa bukti kerja hari itu. Bos/Admin melihat marker yang
-- sama dari HP mereka (server-backed).
CREATE TABLE IF NOT EXISTS evidence_reviews (
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_evidence_reviews_date ON evidence_reviews(date);

-- Daftar karyawan: sumber kebenaran untuk halaman Karyawan + guard
-- akses (capability 'view-marketing'). Sebelumnya daftar ini hanya
-- hidup di memori sesi aplikasi (perubahan hilang saat refresh,
-- tidak terlihat di HP lain). capabilities disimpan sebagai teks
-- JSON (array string) karena D1 tidak punya tipe array. ID bukan
-- AUTOINCREMENT: seed memakai ID tetap 1-5 dan tambah karyawan
-- memakai max(id)+1 dari server.
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  division TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  capabilities TEXT NOT NULL DEFAULT '[]'
);

-- Manifest arsip foto: satu baris per foto yang sudah diunggah ke
-- Drive. photo_key adalah kunci foto di tabel photos (dihapus dari
-- photos setelah manifest tertulis); drive_path adalah path lengkap
-- di Drive ({YYYY-MM}/{Nama Karyawan}/{file}).
CREATE TABLE IF NOT EXISTS photo_archive (
  photo_key TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL,
  drive_path TEXT NOT NULL,
  archived_at TEXT NOT NULL
);

-- Cache ID folder Drive untuk arsip. Kunci = root folder ID +
-- path relatif (misal "<root>/2026-11/Putra"), supaya setelah
-- migrasi ke folder baru cache lama tidak terpakai. Reset manual:
-- DELETE FROM drive_folders; (cache dibangun ulang dari Drive).
CREATE TABLE IF NOT EXISTS drive_folders (
  path TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL
);
