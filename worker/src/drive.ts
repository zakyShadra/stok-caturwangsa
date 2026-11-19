// Klien Google Drive API untuk Worker. Dipakai cron arsip foto
// (archive.ts): foto absen lebih tua dari 2 bulan diunggah ke folder
// Drive, baru dihapus dari D1 setelah upload terverifikasi.
//
// Autentikasi memakai service account yang sama dengan Sheets
// (secrets SHEETS_CLIENT_EMAIL + SHEETS_PRIVATE_KEY), scope
// drive.file. Folder tujuan dari env ARCHIVE_DRIVE_FOLDER_ID
// (bukan hardcode, supaya migrasi ke akun perusahaan hanya mengubah
// nilai env). Folder itu harus di-share ke service account sebagai
// Editor, dan Drive API harus aktif di project GCP-nya.
import { getAccessToken } from './sheets';
import type { GoogleAuthEnv } from './sheets';

export type DriveEnv = GoogleAuthEnv;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function driveFetch(
  env: DriveEnv,
  path: string,
  init?: RequestInit,
): Promise<{ files?: { id: string; name: string }[]; id?: string }> {
  const token = await getAccessToken(env, DRIVE_SCOPE);
  const res = await fetch(`${DRIVE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<{ files?: { id: string; name: string }[]; id?: string }>;
}

// Cari folder bernama name di dalam parentId; buat kalau belum ada.
// Pencarian nama di Drive case-sensitive.
export async function findOrCreateFolder(
  env: DriveEnv,
  parentId: string,
  name: string,
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const q =
    `name = '${escaped}' and '${parentId}' in parents ` +
    `and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const found = await driveFetch(
    env,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
  );
  const existing = (found.files ?? [])[0];
  if (existing) return existing.id;
  const created = await driveFetch(env, '/files?fields=id', {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!created.id) throw new Error('Drive tidak mengembalikan folder ID');
  return created.id;
}

// Upload satu file (multipart). Mengembalikan id + ukuran dari
// Drive; pemanggil HARUS memverifikasi ukuran cocok sebelum
// menghapus dari D1.
export async function uploadFileToDrive(
  env: DriveEnv,
  parentId: string,
  name: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<{ id: string; size: number }> {
  const token = await getAccessToken(env, DRIVE_SCOPE);
  const boundary = `muse-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, mimeType, parents: [parentId] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  const res = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,size,mimeType`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string; size?: string };
  if (!data.id) throw new Error('Drive tidak mengembalikan file ID');
  return { id: data.id, size: Number(data.size ?? -1) };
}
