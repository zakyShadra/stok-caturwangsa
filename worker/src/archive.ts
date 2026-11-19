// Arsip foto absen ke Google Drive. Cron harian memanggil
// archiveOldPhotos: foto (selfie + bukti) lebih tua dari 2 bulan
// diunggah ke Drive, lalu dihapus dari D1 HANYA setelah upload
// terverifikasi (Drive mengembalikan file ID + ukuran cocok) dan
// manifest tertulis di tabel photo_archive. Kalau langkah apa pun
// gagal, foto tetap di D1 dan dicoba lagi besok.
//
// Struktur folder di Drive (keputusan Zaky):
//   {YYYY-MM}/{Nama Karyawan}/{YYYY-MM-DD}_{masuk|pulang|bukti}.jpg
// Bukti bisa lebih dari satu per hari: _bukti_1, _bukti_2, ....
// ID folder di-cache di tabel drive_folders (kunci = root folder ID
// + path, supaya cache tidak terpakai setelah migrasi ke folder
// baru). Reset manual: DELETE FROM drive_folders;
import { findOrCreateFolder, uploadFileToDrive } from './drive';
import type { DriveEnv } from './drive';

export interface ArchiveEnv extends DriveEnv {
  sabun_palem_absen: D1Database;
  ARCHIVE_DRIVE_FOLDER_ID: string;
}

// Foto lebih tua dari ini yang diarsipkan (2 bulan, keputusan Zaky).
export const RETENTION_MONTHS = 2;
// Maksimal foto per jalan cron, supaya satu jalan tidak terlalu lama.
const MAX_PER_RUN = 100;

// Tanggal cutoff: hari ini dikurangi 2 bulan. Foto dengan tanggal
// LEBIH LAMA dari cutoff yang diarsipkan.
export function archiveCutoff(todayWib: string): string {
  const [y, m, d] = todayWib.split('-').map(Number);
  let year = y;
  let month = m - RETENTION_MONTHS;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Nama folder karyawan: nama dari tabel employees. '/' tidak boleh
// ada (dipakai sebagai pemisah path); nama kosong (karyawan sudah
// dihapus) diganti "Karyawan {id}".
function folderNameFor(name: string | null, employeeId: number): string {
  const clean = (name ?? '').replace(/[/\\]/g, '-').trim();
  return clean !== '' ? clean : `Karyawan ${employeeId}`;
}

// Ekstensi dari MIME. Selfie selalu JPEG; bukti dokumen memakai
// ekstensi aslinya supaya tetap bisa dibuka dari Drive.
function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    case 'text/plain':
      return 'txt';
    case 'application/msword':
      return 'doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'application/vnd.ms-excel':
      return 'xls';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx';
    default:
      return mime.startsWith('image/') ? 'jpg' : 'bin';
  }
}

interface PhotoCandidate {
  photoKey: string;
  employeeId: number;
  employeeName: string | null;
  date: string;
  kind: 'masuk' | 'pulang' | 'bukti';
}

// Cari ID folder di cache D1; kalau tidak ada, cari/buat di Drive
// lalu simpan ke cache. Kunci cache mencakup root folder ID,
// supaya setelah migrasi ke folder baru cache lama tidak terpakai.
async function ensureFolder(
  env: ArchiveEnv,
  db: D1Database,
  parentId: string,
  cachePath: string,
  name: string,
): Promise<string> {
  const key = `${env.ARCHIVE_DRIVE_FOLDER_ID}/${cachePath}`;
  const cached = await db
    .prepare('SELECT folder_id FROM drive_folders WHERE path = ?')
    .bind(key)
    .first<{ folder_id: string }>();
  if (cached) return cached.folder_id;
  const id = await findOrCreateFolder(env, parentId, name);
  await db
    .prepare('INSERT OR REPLACE INTO drive_folders (path, folder_id) VALUES (?, ?)')
    .bind(key, id)
    .run();
  return id;
}

// Statement pengosongan kunci foto setelah diarsipkan. Selfie:
// selfie_key jadi NULL; bukti: photo_key jadi string kosong (kolom
// NOT NULL). UI membaca keduanya sebagai "sudah diarsipkan".
function clearKeyStmt(db: D1Database, c: PhotoCandidate) {
  return c.kind === 'bukti'
    ? db.prepare("UPDATE evidence SET photo_key = '' WHERE photo_key = ?").bind(c.photoKey)
    : db.prepare('UPDATE verification SET selfie_key = NULL WHERE selfie_key = ?').bind(c.photoKey);
}

// Hapus foto dari D1 (blob + kunci). Hanya dipanggil setelah
// manifest tertulis, atau saat blob/manifest sudah tidak konsisten.
async function deleteFromD1(db: D1Database, c: PhotoCandidate): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM photos WHERE key = ?').bind(c.photoKey),
    clearKeyStmt(db, c),
  ]);
}

// Arsipkan satu foto: upload -> verifikasi ukuran -> manifest +
// hapus (satu batch). Urutan ini keras: foto tidak pernah dihapus
// sebelum upload terverifikasi dan manifest tertulis.
async function archiveOnePhoto(
  env: ArchiveEnv,
  db: D1Database,
  c: PhotoCandidate,
): Promise<boolean> {
  // Sudah ada di manifest (jalan sebelumnya gagal di langkah hapus):
  // lewati upload, langsung hapus dari D1.
  const manifest = await db
    .prepare('SELECT drive_file_id FROM photo_archive WHERE photo_key = ?')
    .bind(c.photoKey)
    .first<{ drive_file_id: string }>();
  if (manifest) {
    await deleteFromD1(db, c);
    return true;
  }
  const blob = await db
    .prepare('SELECT data, mime FROM photos WHERE key = ?')
    .bind(c.photoKey)
    .first<{ data: string; mime: string }>();
  if (!blob) {
    // Blob sudah tidak ada (seharusnya tidak terjadi): bersihkan
    // kunci yang menggantung supaya UI tidak menampilkan gambar rusak.
    await deleteFromD1(db, c);
    return true;
  }
  const month = c.date.slice(0, 7);
  const empFolder = folderNameFor(c.employeeName, c.employeeId);
  let filename: string;
  if (c.kind === 'bukti') {
    // Bukti bisa lebih dari satu per hari: nomor urut dihitung dari
    // manifest hari itu.
    const count = await db
      .prepare('SELECT COUNT(*) AS n FROM photo_archive WHERE photo_key LIKE ?')
      .bind(`bukti-${c.employeeId}-${c.date}-%`)
      .first<{ n: number }>();
    filename = `${c.date}_bukti_${(count?.n ?? 0) + 1}.${extensionFor(blob.mime)}`;
  } else {
    filename = `${c.date}_${c.kind}.${extensionFor(blob.mime)}`;
  }
  const drivePath = `${month}/${empFolder}/${filename}`;
  const monthFolderId = await ensureFolder(env, db, env.ARCHIVE_DRIVE_FOLDER_ID, month, month);
  const empFolderId = await ensureFolder(env, db, monthFolderId, `${month}/${empFolder}`, empFolder);
  const bytes = base64ToBytes(blob.data);
  const uploaded = await uploadFileToDrive(env, empFolderId, filename, blob.mime, bytes);
  if (uploaded.size !== bytes.length) {
    throw new Error(`Ukuran upload tidak cocok (Drive ${uploaded.size}, D1 ${bytes.length})`);
  }
  await db.batch([
    db
      .prepare(
        'INSERT INTO photo_archive (photo_key, drive_file_id, drive_path, archived_at) VALUES (?, ?, ?, ?)',
      )
      .bind(c.photoKey, uploaded.id, drivePath, new Date().toISOString()),
    db.prepare('DELETE FROM photos WHERE key = ?').bind(c.photoKey),
    clearKeyStmt(db, c),
  ]);
  return true;
}

// Arsipkan foto lebih tua dari 2 bulan ke Drive, maksimal 100 per
// jalan. Satu foto yang gagal tidak menghentikan yang lain.
export async function archiveOldPhotos(
  env: ArchiveEnv,
  todayWib: string,
): Promise<{ archived: number; failed: number }> {
  const db = env.sabun_palem_absen;
  const cutoff = archiveCutoff(todayWib);
  const selfies = await db
    .prepare(
      `SELECT v.selfie_key AS photo_key, a.employee_id, a.date, v.kind, e.name AS employee_name
       FROM verification v JOIN attendance a ON a.id = v.attendance_id
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE v.selfie_key IS NOT NULL AND a.date < ? ORDER BY a.date ASC LIMIT ?`,
    )
    .bind(cutoff, MAX_PER_RUN)
    .all<{
      photo_key: string;
      employee_id: number;
      date: string;
      kind: string;
      employee_name: string | null;
    }>();
  const selfieList = selfies.results ?? [];
  const remaining = MAX_PER_RUN - selfieList.length;
  let evidenceList: {
    photo_key: string;
    employee_id: number;
    date: string;
    employee_name: string | null;
  }[] = [];
  if (remaining > 0) {
    const evidence = await db
      .prepare(
        `SELECT ev.photo_key, ev.employee_id, ev.date, e.name AS employee_name
         FROM evidence ev LEFT JOIN employees e ON e.id = ev.employee_id
         WHERE ev.photo_key != '' AND ev.date < ? ORDER BY ev.date ASC LIMIT ?`,
      )
      .bind(cutoff, remaining)
      .all<{
        photo_key: string;
        employee_id: number;
        date: string;
        employee_name: string | null;
      }>();
    evidenceList = evidence.results ?? [];
  }
  const candidates: PhotoCandidate[] = [
    ...selfieList.map((s) => ({
      photoKey: s.photo_key,
      employeeId: s.employee_id,
      employeeName: s.employee_name,
      date: s.date,
      kind: s.kind as 'masuk' | 'pulang',
    })),
    ...evidenceList.map((s) => ({
      photoKey: s.photo_key,
      employeeId: s.employee_id,
      employeeName: s.employee_name,
      date: s.date,
      kind: 'bukti' as const,
    })),
  ];
  let archived = 0;
  let failed = 0;
  for (const c of candidates) {
    try {
      if (await archiveOnePhoto(env, db, c)) archived += 1;
    } catch (e) {
      failed += 1;
      console.error(`Gagal mengarsipkan foto ${c.photoKey}:`, e instanceof Error ? e.message : e);
    }
  }
  return { archived, failed };
}
