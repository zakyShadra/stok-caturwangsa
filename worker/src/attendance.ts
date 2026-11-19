// Endpoint absensi Sabun Palem. Data absensi tinggal di D1 (database
// sabun-palem-absen), foto selfie dan bukti kerja tinggal di tabel
// photos di D1 yang sama (base64; foto lebih tua dari 2 bulan
// diarsipkan ke Google Drive, lihat schema.sql dan archive.ts).
// Worker adalah satu-satunya sumber kebenaran:
// aplikasi di HP mana pun membaca data yang sama, jadi Bos bisa
// melihat selfie karyawan dari HP-nya sendiri dan Manager bisa melihat
// laporan dari HP-nya.
//
// Endpoint (dipasang di bawah /api/absen):
//   GET    /api/absen?from=YYYY-MM-DD&to=YYYY-MM-DD
//          -> catatan absen + verifikasi (selfie) + bukti kerja
//             + reviews (marker cek bukti kerja oleh Manager)
//   GET    /api/absen/pending -> semua catatan pending, semua tanggal
//   POST   /api/absen/check-in   {employeeId, date, time, lat, lon,
//          distanceMeters, accuracy, selfieName, selfieData}
//   POST   /api/absen/check-out  (bentuk sama seperti check-in)
//   POST   /api/absen/approval   {employeeId, date, approval}
//   POST   /api/absen/leave      {employeeId, date, type: Izin|Cuti}
//   POST   /api/absen/evidence   {employeeId, date, name, kind,
//          sizeLabel, data, mime}
//   DELETE /api/absen/evidence/:id
//   POST   /api/absen/evidence-review -> Manager menandai bukti
//          kerja sudah dicek {employeeId, date, reviewedBy}
//   GET    /api/absen/foto/:key  -> isi foto (Content-Type sesuai mime)
//
// Aturan yang ditegakkan di sini (bukan hanya di aplikasi):
// - Satu karyawan satu catatan per tanggal. Absen masuk yang sudah
//   ada tidak bisa diulang, kecuali catatan itu ditolak Bos (maka
//   absen masuk baru menggantikan yang ditolak, status kembali
//   pending). Izin/Cuti tidak bisa diajukan kalau tanggal itu sudah
//   ada catatan, dan sebaliknya.
// - Absen pulang butuh catatan absen masuk yang belum ditolak, dan
//   jam pulang harus setelah jam masuk hari itu.
// - Tanggal check-in, check-out, dan bukti kerja harus hari ini
//   (WIB); tanggal lain ditolak. Bukti kerja juga butuh catatan
//   absen di tanggal itu (tidak ada bukti yatim). Izin/Cuti boleh
//   diajukan untuk tanggal masa depan, atau susulan maksimal 3 hari
//   ke belakang.
// - Geofence ditegakkan server-side: jarak dihitung ulang dari
//   lat/lon ke kantor, jarak dari aplikasi TIDAK dipercaya. Di luar
//   radius 200 m dengan akurasi GPS bagus, check-in/out ditolak.
//   Kalau akurasinya jelek (lebih dari 500 m, misal laptop tanpa
//   GPS yang posisinya dari IP/WiFi), check-in diterima sebagai
//   pending dengan flag, Bos yang memutuskan.
// - Foto dibatasi 700 KB base64 (sekitar 512 KB data asli). Selfie
//   sudah diperkecil di aplikasi (maks 640px, JPEG 0.82), jadi
//   batas ini tidak akan tercapai dalam pemakaian normal.
// - Rangkaian tulis check-in, check-out, dan evidence memakai satu
//   db.batch: gagal semua atau berhasil semua (tidak ada foto yatim
//   atau catatan tanpa verifikasi).
// - MIME bukti kerja dibatasi (gambar + PDF + dokumen Office + teks
//   biasa); file non-gambar disajikan sebagai attachment supaya
//   tidak dirender di origin Worker.
import { Hono } from 'hono';

export interface AttendanceEnv {
  sabun_palem_absen: D1Database;
}

const MAX_PHOTO_BASE64 = 700_000;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Lokasi kantor + radius geofence. SALINAN dari
// src/lib/attendance.ts (worker tidak bisa import dari aplikasi):
// kalau koordinat kantor berubah, ubah di kedua tempat.
const OFFICE_LOCATION = { lat: -6.93789, lon: 107.59914 };
const GEOFENCE_RADIUS_METERS = 200;
// Akurasi GPS di atas ini dianggap tidak bisa diandalkan (laptop
// tanpa GPS, posisi dari IP/WiFi). Check-in dengan akurasi seburuk
// ini tidak ditolak, tapi dicatat dengan flag supaya Bos tahu.
const POOR_ACCURACY_METERS = 500;

// Jarak dua titik di bumi dalam meter (rumus Haversine). Salinan
// dari src/lib/attendance.ts, alasan yang sama seperti di atas.
function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Hitung jarak server-side dari lat/lon ke kantor. Jarak dari
// aplikasi TIDAK dipercaya (API terbuka, siapa pun bisa mengirim
// angka kecil). Akurasi null (aplikasi lama tidak mengirim) dianggap
// presisi, jadi penegakan tetap ketat. Kembalikan jarak meter, atau
// pesan error kalau check-in/out harus ditolak.
function checkGeofence(
  lat: number,
  lon: number,
  accuracy: number | null,
): { distanceMeters: number } | { error: string } {
  const distance = Math.round(
    haversineDistanceMeters(lat, lon, OFFICE_LOCATION.lat, OFFICE_LOCATION.lon),
  );
  const precise = accuracy === null || accuracy <= POOR_ACCURACY_METERS;
  if (distance > GEOFENCE_RADIUS_METERS && precise) {
    return { error: `Anda di luar area pabrik. Jarak Anda dari kantor ${distance} meter.` };
  }
  return { distanceMeters: distance };
}

function jsonError(c: { json: (body: object, status: number) => Response }, status: number, message: string) {
  return c.json({ error: message }, status);
}

function nowIso(): string {
  return new Date().toISOString();
}

// Tanggal hari ini dalam zona Asia/Jakarta, format YYYY-MM-DD.
function todayJakarta(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Waktu sekarang dalam zona Asia/Jakarta, format "YYYY-MM-DD HH:MM".
// Dipakai untuk reviewed_at supaya jam yang tampil di aplikasi
// adalah jam WIB, bukan UTC.
function nowJakarta(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function randomSuffix(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Pisahkan data URL "data:<mime>;base64,<isi>" jadi mime + base64.
// Kembalikan null kalau formatnya bukan data URL yang benar.
function parseDataUrl(dataUrl: unknown): { mime: string; base64: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const match = /^data:([a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

interface AttendanceRow {
  id: number;
  employee_id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  approval: string;
}

interface VerificationRow {
  attendance_id: number;
  kind: string;
  lat: number;
  lon: number;
  distance_m: number;
  accuracy_m: number | null;
  selfie_key: string | null;
  selfie_name: string;
  time: string;
}

interface EvidenceRow {
  id: number;
  employee_id: number;
  date: string;
  name: string;
  kind: string;
  size_label: string;
  photo_key: string;
}

interface EvidenceReviewRow {
  employee_id: number;
  date: string;
  reviewed_by: string;
  reviewed_at: string;
}

function photoUrl(c: { req: { url: string } }, key: string): string {
  return `${new URL(c.req.url).origin}/api/absen/foto/${key}`;
}

function toRecordJson(
  c: { req: { url: string } },
  row: AttendanceRow,
  verifications: VerificationRow[],
  evidence: EvidenceRow[],
) {
  const byKind = (kind: string) => verifications.find((v) => v.kind === kind);
  const verJson = (v: VerificationRow | undefined) =>
    v
      ? {
          lat: v.lat,
          lon: v.lon,
          distanceMeters: v.distance_m,
          accuracyMeters: v.accuracy_m,
          selfieUrl: v.selfie_key ? photoUrl(c, v.selfie_key) : null,
          selfieName: v.selfie_name,
          time: v.time,
        }
      : null;
  return {
    employeeId: row.employee_id,
    date: row.date,
    checkIn: row.check_in,
    checkOut: row.check_out,
    status: row.status,
    approval: row.approval,
    verification: {
      masuk: verJson(byKind('masuk')),
      pulang: verJson(byKind('pulang')),
    },
    evidence: evidence.map((e) => ({
      id: String(e.id),
      name: e.name,
      kind: e.kind,
      sizeLabel: e.size_label,
      // photo_key kosong = foto sudah diarsipkan ke Drive, UI
      // menampilkan teks arsip, bukan gambar rusak.
      url: e.photo_key ? photoUrl(c, e.photo_key) : null,
    })),
  };
}

export const attendanceRoutes = new Hono<{ Bindings: AttendanceEnv }>();

// Muat verifikasi + bukti + review untuk daftar catatan, lalu bentuk
// respons yang sama seperti GET /api/absen. Dipakai GET / dan GET
// /pending supaya bentuknya tidak bisa berbeda.
async function loadBundle(
  c: { req: { url: string } },
  db: D1Database,
  rows: AttendanceRow[],
  start: string,
  end: string,
) {
  const ids = rows.map((r) => r.id);
  let verifications: VerificationRow[] = [];
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const v = await db
      .prepare(`SELECT * FROM verification WHERE attendance_id IN (${placeholders})`)
      .bind(...ids)
      .all<VerificationRow>();
    verifications = v.results ?? [];
  }
  const e = await db
    .prepare('SELECT * FROM evidence WHERE date >= ? AND date <= ? ORDER BY id ASC')
    .bind(start, end)
    .all<EvidenceRow>();
  const evidence = e.results ?? [];
  const rv = await db
    .prepare('SELECT * FROM evidence_reviews WHERE date >= ? AND date <= ?')
    .bind(start, end)
    .all<EvidenceReviewRow>();
  const reviews = rv.results ?? [];
  return {
    records: rows.map((r) =>
      toRecordJson(
        c,
        r,
        verifications.filter((v) => v.attendance_id === r.id),
        evidence.filter((x) => x.employee_id === r.employee_id && x.date === r.date),
      ),
    ),
    reviews: reviews.map((r) => ({
      employeeId: r.employee_id,
      date: r.date,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
    })),
  };
}

// GET /api/absen?from&to: catatan dalam rentang tanggal, masing-masing
// lengkap dengan verifikasi dan bukti kerja. Tanpa parameter, dipakai
// bulan berjalan.
attendanceRoutes.get('/', async (c) => {
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  if ((from !== '' && !DATE_PATTERN.test(from)) || (to !== '' && !DATE_PATTERN.test(to))) {
    return jsonError(c, 400, 'from dan to harus format YYYY-MM-DD');
  }
  const db = c.env.sabun_palem_absen;
  try {
    const today = todayJakarta();
    const start = from !== '' ? from : `${today.slice(0, 7)}-01`;
    const end = to !== '' ? to : today;
    const rows = await db
      .prepare('SELECT * FROM attendance WHERE date >= ? AND date <= ? ORDER BY date ASC, employee_id ASC')
      .bind(start, end)
      .all<AttendanceRow>();
    return c.json(await loadBundle(c, db, rows.results ?? [], start, end));
  } catch (e) {
    console.error('GET /api/absen gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal membaca absensi dari database');
  }
});

// GET /api/absen/pending: semua catatan pending, semua tanggal,
// tanpa batas rentang. Dipakai antrean persetujuan + banner pending
// di Beranda, supaya pending bulan lalu tidak hilang dari pandangan.
attendanceRoutes.get('/pending', async (c) => {
  const db = c.env.sabun_palem_absen;
  try {
    const rows = await db
      .prepare("SELECT * FROM attendance WHERE approval = 'pending' ORDER BY date ASC, employee_id ASC")
      .all<AttendanceRow>();
    const list = rows.results ?? [];
    if (list.length === 0) return c.json({ records: [], reviews: [] });
    const dates = list.map((r) => r.date);
    const start = dates.reduce((a, b) => (a < b ? a : b));
    const end = dates.reduce((a, b) => (a > b ? a : b));
    return c.json(await loadBundle(c, db, list, start, end));
  } catch (e) {
    console.error('GET /api/absen/pending gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal membaca antrean pending dari database');
  }
});

interface CheckBody {
  employeeId?: unknown;
  date?: unknown;
  time?: unknown;
  lat?: unknown;
  lon?: unknown;
  distanceMeters?: unknown;
  accuracy?: unknown;
  selfieName?: unknown;
  selfieData?: unknown;
}

function validateCheck(body: CheckBody): string | null {
  if (typeof body.employeeId !== 'number' || !Number.isInteger(body.employeeId) || body.employeeId < 1 || body.employeeId > 1000) {
    return 'employeeId tidak benar';
  }
  if (typeof body.date !== 'string' || !DATE_PATTERN.test(body.date)) return 'date harus format YYYY-MM-DD';
  if (typeof body.time !== 'string' || !TIME_PATTERN.test(body.time)) return 'time harus format HH:MM';
  if (typeof body.lat !== 'number' || body.lat < -90 || body.lat > 90) return 'lat tidak benar';
  if (typeof body.lon !== 'number' || body.lon < -180 || body.lon > 180) return 'lon tidak benar';
  if (typeof body.distanceMeters !== 'number' || body.distanceMeters < 0 || body.distanceMeters > 100000) {
    return 'distanceMeters tidak benar';
  }
  // accuracy opsional (aplikasi lama tidak mengirim); kalau ada harus
  // angka yang masuk akal. Dipakai untuk flag lokasi tidak akurat.
  if (
    body.accuracy !== undefined &&
    body.accuracy !== null &&
    (typeof body.accuracy !== 'number' || body.accuracy < 0 || body.accuracy > 1000000)
  ) {
    return 'accuracy tidak benar';
  }
  if (typeof body.selfieName !== 'string' || body.selfieName.trim() === '' || body.selfieName.length > 200) {
    return 'selfieName tidak benar';
  }
  const photo = parseDataUrl(body.selfieData);
  if (!photo) return 'selfieData harus data URL gambar yang benar';
  if (!photo.mime.startsWith('image/')) return 'selfie harus berupa gambar';
  if (photo.base64.length > MAX_PHOTO_BASE64) return 'Foto selfie terlalu besar (maksimal sekitar 500 KB)';
  return null;
}

// Statement insert foto, dipakai di dalam db.batch supaya foto +
// catatan + verifikasi berhasil semua atau gagal semua.
function photoInsertStmt(db: D1Database, key: string, mime: string, base64: string) {
  const size = Math.floor((base64.length * 3) / 4);
  return db
    .prepare('INSERT INTO photos (key, data, mime, size) VALUES (?, ?, ?, ?)')
    .bind(key, base64, mime, size);
}

// Kunci foto lama satu catatan absen (untuk dihapus saat absen masuk
// diulang setelah ditolak). SELECT-nya di luar batch karena batch
// tidak bisa membaca hasil statement sebelumnya.
async function oldPhotoKeysForAttendance(db: D1Database, attendanceId: number): Promise<string[]> {
  const rows = await db
    .prepare('SELECT selfie_key FROM verification WHERE attendance_id = ? AND selfie_key IS NOT NULL')
    .bind(attendanceId)
    .all<{ selfie_key: string }>();
  return (rows.results ?? []).map((r) => r.selfie_key);
}

// MIME bukti kerja yang diizinkan selain gambar: sama seperti accept
// di input file aplikasi (PDF + dokumen Office + teks biasa).
const EVIDENCE_MIME_ALLOWLIST = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// POST /api/absen/check-in: catat absen masuk + selfie. Kalau catatan
// hari itu sudah ada dan belum ditolak, tolak (sudah absen). Kalau
// catatan itu ditolak Bos, absen masuk baru menggantikannya.
attendanceRoutes.post('/check-in', async (c) => {
  let body: CheckBody;
  try {
    body = (await c.req.json()) as CheckBody;
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  const invalid = validateCheck(body);
  if (invalid) return jsonError(c, 400, invalid);
  const photo = parseDataUrl(body.selfieData);
  if (!photo) return jsonError(c, 400, 'selfieData tidak benar');
  const accuracy = typeof body.accuracy === 'number' ? body.accuracy : null;
  const geo = checkGeofence(body.lat as number, body.lon as number, accuracy);
  if ('error' in geo) return jsonError(c, 400, geo.error);
  const db = c.env.sabun_palem_absen;
  const employeeId = body.employeeId as number;
  const date = body.date as string;
  const time = body.time as string;
  if (date !== todayJakarta()) {
    return jsonError(c, 400, 'Tanggal absen harus hari ini');
  }
  try {
    const existing = await db
      .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
      .bind(employeeId, date)
      .first<AttendanceRow>();
    if (existing && existing.status !== 'Hadir') {
      return jsonError(c, 400, 'Tanggal ini sudah ada pengajuan Izin/Cuti');
    }
    if (existing && existing.check_in !== null && existing.approval !== 'rejected') {
      return jsonError(c, 400, 'Sudah absen masuk hari ini');
    }
    const key = `selfie-${employeeId}-${date}-masuk-${randomSuffix()}`;
    const now = nowIso();
    const accuracyValue = accuracy === null ? null : Math.round(accuracy);
    const selfieName = (body.selfieName as string).trim();
    if (existing) {
      // Absen masuk diulang setelah ditolak: hapus foto + verifikasi
      // lama, lalu tulis yang baru, semua dalam satu batch.
      const oldKeys = await oldPhotoKeysForAttendance(db, existing.id);
      await db.batch([
        ...oldKeys.map((k) => db.prepare('DELETE FROM photos WHERE key = ?').bind(k)),
        db.prepare('DELETE FROM verification WHERE attendance_id = ?').bind(existing.id),
        db
          .prepare(
            "UPDATE attendance SET check_in = ?, check_out = NULL, status = 'Hadir', approval = 'pending', updated_at = ? WHERE id = ?",
          )
          .bind(time, now, existing.id),
        photoInsertStmt(db, key, photo.mime, photo.base64),
        db
          .prepare(
            'INSERT INTO verification (attendance_id, kind, lat, lon, distance_m, accuracy_m, selfie_key, selfie_name, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(existing.id, 'masuk', body.lat as number, body.lon as number, geo.distanceMeters, accuracyValue, key, selfieName, time),
      ]);
    } else {
      await db.batch([
        photoInsertStmt(db, key, photo.mime, photo.base64),
        db
          .prepare(
            "INSERT INTO attendance (employee_id, date, check_in, check_out, status, approval, created_at, updated_at) VALUES (?, ?, ?, NULL, 'Hadir', 'pending', ?, ?)",
          )
          .bind(employeeId, date, time, now, now),
        // ID catatan baru diambil lewat subquery: batch tidak bisa
        // membaca last_row_id statement sebelumnya.
        db
          .prepare(
            'INSERT INTO verification (attendance_id, kind, lat, lon, distance_m, accuracy_m, selfie_key, selfie_name, time) VALUES ((SELECT id FROM attendance WHERE employee_id = ? AND date = ?), ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(employeeId, date, 'masuk', body.lat as number, body.lon as number, geo.distanceMeters, accuracyValue, key, selfieName, time),
      ]);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/absen/check-in gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal mencatat absen masuk');
  }
});

// POST /api/absen/check-out: catat absen pulang + selfie. Butuh
// catatan absen masuk yang belum ditolak dan belum ada jam pulang.
attendanceRoutes.post('/check-out', async (c) => {
  let body: CheckBody;
  try {
    body = (await c.req.json()) as CheckBody;
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  const invalid = validateCheck(body);
  if (invalid) return jsonError(c, 400, invalid);
  const photo = parseDataUrl(body.selfieData);
  if (!photo) return jsonError(c, 400, 'selfieData tidak benar');
  const accuracy = typeof body.accuracy === 'number' ? body.accuracy : null;
  const geo = checkGeofence(body.lat as number, body.lon as number, accuracy);
  if ('error' in geo) return jsonError(c, 400, geo.error);
  const db = c.env.sabun_palem_absen;
  const employeeId = body.employeeId as number;
  const date = body.date as string;
  const time = body.time as string;
  if (date !== todayJakarta()) {
    return jsonError(c, 400, 'Tanggal absen harus hari ini');
  }
  try {
    const existing = await db
      .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
      .bind(employeeId, date)
      .first<AttendanceRow>();
    if (!existing || existing.check_in === null) {
      return jsonError(c, 400, 'Belum absen masuk hari ini');
    }
    if (existing.approval === 'rejected') {
      return jsonError(c, 400, 'Absen hari ini ditolak Bos, silakan absen masuk ulang');
    }
    if (existing.check_out !== null) {
      return jsonError(c, 400, 'Sudah absen pulang hari ini');
    }
    // Jam HH:MM nol di depan, jadi perbandingan string sama dengan
    // perbandingan waktu.
    if (time <= existing.check_in) {
      return jsonError(c, 400, 'Jam pulang harus setelah jam masuk');
    }
    const key = `selfie-${employeeId}-${date}-pulang-${randomSuffix()}`;
    await db.batch([
      photoInsertStmt(db, key, photo.mime, photo.base64),
      db
        .prepare('UPDATE attendance SET check_out = ?, updated_at = ? WHERE id = ?')
        .bind(time, nowIso(), existing.id),
      db
        .prepare(
          'INSERT INTO verification (attendance_id, kind, lat, lon, distance_m, accuracy_m, selfie_key, selfie_name, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          existing.id,
          'pulang',
          body.lat as number,
          body.lon as number,
          geo.distanceMeters,
          accuracy === null ? null : Math.round(accuracy),
          key,
          (body.selfieName as string).trim(),
          time,
        ),
    ]);
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/absen/check-out gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal mencatat absen pulang');
  }
});

// POST /api/absen/approval: Bos menyetujui atau menolak satu catatan.
attendanceRoutes.post('/approval', async (c) => {
  let body: { employeeId?: unknown; date?: unknown; approval?: unknown };
  try {
    body = (await c.req.json()) as { employeeId?: unknown; date?: unknown; approval?: unknown };
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  if (
    typeof body.employeeId !== 'number' ||
    !Number.isInteger(body.employeeId) ||
    typeof body.date !== 'string' ||
    !DATE_PATTERN.test(body.date) ||
    (body.approval !== 'approved' && body.approval !== 'rejected')
  ) {
    return jsonError(c, 400, 'employeeId, date, atau approval tidak benar');
  }
  const db = c.env.sabun_palem_absen;
  try {
    const res = await db
      .prepare('UPDATE attendance SET approval = ?, updated_at = ? WHERE employee_id = ? AND date = ?')
      .bind(body.approval, nowIso(), body.employeeId, body.date)
      .run();
    if ((res.meta.changes ?? 0) === 0) {
      return jsonError(c, 404, 'Catatan absen tidak ditemukan');
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/absen/approval gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal mengubah persetujuan');
  }
});

// POST /api/absen/leave: staf mengajukan Izin/Cuti untuk satu tanggal.
// Tanggal itu belum boleh punya catatan apa pun.
attendanceRoutes.post('/leave', async (c) => {
  let body: { employeeId?: unknown; date?: unknown; type?: unknown };
  try {
    body = (await c.req.json()) as { employeeId?: unknown; date?: unknown; type?: unknown };
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  if (
    typeof body.employeeId !== 'number' ||
    !Number.isInteger(body.employeeId) ||
    typeof body.date !== 'string' ||
    !DATE_PATTERN.test(body.date) ||
    (body.type !== 'Izin' && body.type !== 'Cuti')
  ) {
    return jsonError(c, 400, 'employeeId, date, atau type tidak benar');
  }
  // Pengajuan susulan (sakit kemarin, baru diajukan hari ini) boleh
  // maksimal 3 hari ke belakang; tanggal masa depan tetap boleh.
  const daysBack = Math.round(
    (Date.parse(todayJakarta()) - Date.parse(body.date)) / 86400000,
  );
  if (daysBack > 3) {
    return jsonError(c, 400, 'Pengajuan susulan maksimal 3 hari ke belakang');
  }
  const db = c.env.sabun_palem_absen;
  try {
    const existing = await db
      .prepare('SELECT id FROM attendance WHERE employee_id = ? AND date = ?')
      .bind(body.employeeId, body.date)
      .first<{ id: number }>();
    if (existing) {
      return jsonError(c, 400, 'Tanggal ini sudah ada catatan absen');
    }
    await db
      .prepare(
        "INSERT INTO attendance (employee_id, date, check_in, check_out, status, approval, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, 'pending', ?, ?)",
      )
      .bind(body.employeeId, body.date, body.type, nowIso(), nowIso())
      .run();
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/absen/leave gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal mencatat pengajuan');
  }
});

// POST /api/absen/evidence: staf melampirkan bukti kerja (foto atau
// dokumen). Foto sudah diperkecil di aplikasi; dokumen dibatasi
// ukuran yang sama.
attendanceRoutes.post('/evidence', async (c) => {
  let body: {
    employeeId?: unknown;
    date?: unknown;
    name?: unknown;
    kind?: unknown;
    sizeLabel?: unknown;
    data?: unknown;
  };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  if (
    typeof body.employeeId !== 'number' ||
    !Number.isInteger(body.employeeId) ||
    typeof body.date !== 'string' ||
    !DATE_PATTERN.test(body.date) ||
    typeof body.name !== 'string' ||
    body.name.trim() === '' ||
    body.name.length > 200 ||
    (body.kind !== 'image' && body.kind !== 'doc') ||
    typeof body.sizeLabel !== 'string' ||
    body.sizeLabel.length > 50
  ) {
    return jsonError(c, 400, 'Isi pengajuan bukti tidak benar');
  }
  const photo = parseDataUrl(body.data);
  if (!photo) return jsonError(c, 400, 'data harus data URL yang benar');
  if (photo.base64.length > MAX_PHOTO_BASE64) {
    return jsonError(c, 400, 'File terlalu besar (maksimal sekitar 500 KB)');
  }
  if (!photo.mime.startsWith('image/') && !EVIDENCE_MIME_ALLOWLIST.has(photo.mime)) {
    return jsonError(c, 400, 'Jenis file bukti tidak diizinkan');
  }
  if (body.date !== todayJakarta()) {
    return jsonError(c, 400, 'Bukti kerja hanya bisa dilampirkan untuk hari ini');
  }
  const db = c.env.sabun_palem_absen;
  try {
    // Bukti tanpa catatan absen tidak pernah tampil di UI (bukti
    // yatim), jadi tolak dari awal.
    const attendance = await db
      .prepare('SELECT id FROM attendance WHERE employee_id = ? AND date = ?')
      .bind(body.employeeId, body.date)
      .first<{ id: number }>();
    if (!attendance) {
      return jsonError(c, 400, 'Tidak ada catatan absen untuk tanggal ini');
    }
    const key = `bukti-${body.employeeId}-${body.date}-${randomSuffix()}`;
    const results = await db.batch([
      photoInsertStmt(db, key, photo.mime, photo.base64),
      db
        .prepare(
          'INSERT INTO evidence (employee_id, date, name, kind, size_label, photo_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(body.employeeId, body.date, body.name.trim(), body.kind, body.sizeLabel, key, nowIso()),
    ]);
    return c.json({
      id: String(results[1].meta.last_row_id),
      name: body.name.trim(),
      kind: body.kind,
      sizeLabel: body.sizeLabel,
      url: photoUrl(c, key),
    });
  } catch (e) {
    console.error('POST /api/absen/evidence gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal menyimpan bukti kerja');
  }
});

// DELETE /api/absen/evidence/:id: hapus satu bukti kerja + fotonya.
attendanceRoutes.delete('/evidence/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) {
    return jsonError(c, 400, 'id tidak benar');
  }
  const db = c.env.sabun_palem_absen;
  try {
    const row = await db
      .prepare('SELECT employee_id, date, photo_key FROM evidence WHERE id = ?')
      .bind(id)
      .first<{ employee_id: number; date: string; photo_key: string }>();
    if (!row) return jsonError(c, 404, 'Bukti tidak ditemukan');
    // Bukti yang sudah ditandai Manager tidak bisa dihapus: jejak
    // pemeriksaannya harus tetap ada.
    const review = await db
      .prepare('SELECT employee_id FROM evidence_reviews WHERE employee_id = ? AND date = ?')
      .bind(row.employee_id, row.date)
      .first<{ employee_id: number }>();
    if (review) {
      return jsonError(c, 400, 'Bukti sudah dicek Manager, tidak bisa dihapus');
    }
    await db.prepare('DELETE FROM evidence WHERE id = ?').bind(id).run();
    await db.prepare('DELETE FROM photos WHERE key = ?').bind(row.photo_key).run();
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/absen/evidence gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal menghapus bukti kerja');
  }
});

// POST /api/absen/evidence-review: Manager menandai bukti kerja
// satu karyawan di satu tanggal sudah dicek. Marker, BUKAN
// approval: tidak mengubah status absen. INSERT OR REPLACE supaya
// menandai ulang tanggal yang sama tidak error (menimpa marker lama).
attendanceRoutes.post('/evidence-review', async (c) => {
  let body: { employeeId?: unknown; date?: unknown; reviewedBy?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  if (
    typeof body.employeeId !== 'number' ||
    !Number.isInteger(body.employeeId) ||
    typeof body.date !== 'string' ||
    !DATE_PATTERN.test(body.date) ||
    typeof body.reviewedBy !== 'string' ||
    body.reviewedBy.trim() === '' ||
    body.reviewedBy.length > 200
  ) {
    return jsonError(c, 400, 'employeeId, date, atau reviewedBy tidak benar');
  }
  const db = c.env.sabun_palem_absen;
  try {
    await db
      .prepare(
        'INSERT OR REPLACE INTO evidence_reviews (employee_id, date, reviewed_by, reviewed_at) VALUES (?, ?, ?, ?)',
      )
      .bind(body.employeeId, body.date, body.reviewedBy.trim(), nowJakarta())
      .run();
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/absen/evidence-review gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal menyimpan penanda cek');
  }
});

// GET /api/absen/foto/:key: isi satu foto (selfie atau bukti).
// Dipakai langsung sebagai src tag img di aplikasi.
attendanceRoutes.get('/foto/:key', async (c) => {
  const key = c.req.param('key');
  if (!KEY_PATTERN.test(key)) {
    return jsonError(c, 400, 'key tidak benar');
  }
  const db = c.env.sabun_palem_absen;
  try {
    const row = await db
      .prepare('SELECT data, mime FROM photos WHERE key = ?')
      .bind(key)
      .first<{ data: string; mime: string }>();
    if (!row) return jsonError(c, 404, 'Foto tidak ditemukan');
    const binary = Uint8Array.from(atob(row.data), (ch) => ch.charCodeAt(0));
    // File non-gambar disajikan sebagai attachment, supaya tidak
    // dirender di origin Worker.
    const headers: Record<string, string> = {
      'Content-Type': row.mime,
      'Cache-Control': 'public, max-age=86400',
    };
    if (!row.mime.startsWith('image/')) {
      headers['Content-Disposition'] = 'attachment';
    }
    return new Response(binary, { headers });
  } catch (e) {
    console.error('GET /api/absen/foto gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal membaca foto');
  }
});

