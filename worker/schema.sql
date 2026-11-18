-- Skema absensi Sabun Palem (D1 database sabun-palem-absen).
-- Terapkan: wrangler d1 execute sabun-palem-absen --remote --file=schema.sql
--
-- Foto disimpan di tabel photos (base64) untuk sementara: R2 belum
-- bisa dipakai karena mengaktifkannya butuh detail pembayaran di
-- dashboard Cloudflare (di luar wewenang agent). Foto sudah
-- diperkecil di sisi aplikasi (maks 640px, JPEG 0.82, sekitar
-- 30-100 KB per foto), jadi satu database D1 cukup untuk
-- bertahun-tahun pemakaian 7 karyawan. Saat R2 aktif nanti, yang
-- berubah hanya isi tabel photos (pindah ke bucket R2); endpoint
-- /api/absen/foto/:key dan format respons tidak berubah.
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
  selfie_key TEXT,
  selfie_name TEXT NOT NULL,
  time TEXT NOT NULL,
  UNIQUE (attendance_id, kind)
);

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
