// Klien Google Drive API untuk Worker. Dipakai cron arsip foto
// (archive.ts): foto absen lebih tua dari 2 bulan diunggah ke folder
// Drive, baru dihapus dari D1 setelah upload terverifikasi.
//
// Autentikasi memakai OAuth akun PENGGUNA (refresh token), BUKAN
// service account. Alasan: service account tidak punya kuota storage
// Drive (0 byte), jadi upload file apa pun ditolak Google dengan 403
// "Service Accounts do not have storage quota" (ditemukan di tes live
// 19 Nov 2026; folder masih bisa dibuat karena folder tidak makan
// kuota). Dengan refresh token akun Zaky, file yang diunggah dimiliki
// Zaky dan memakai kuota Drive 15 GB miliknya.
//
// Secrets (wrangler secret put, TIDAK BOLEH masuk file):
//   DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN
// Cara mendapatkan: buat OAuth client (Web) di project GCP yang sama
// (redirect URI https://developers.google.com/oauthplayground),
// PUBLISH consent screen ke Production DULU (token yang dibuat saat
// Testing kedaluwarsa 7 hari), lalu jalankan flow di OAuth 2.0
// Playground dengan kredensial sendiri (access type Offline, scope
// drive.file saja) dan ambil refresh_token-nya. Sheets tetap memakai
// service account (menulis ke sheet milik Zaky tidak makan kuota SA).
//
// Migrasi ke akun perusahaan: buat OAuth client + refresh token baru
// di akun perusahaan, ganti ketiga secret + ARCHIVE_DRIVE_FOLDER_ID.
// TIDAK ada perubahan kode.
export interface DriveEnv {
  DRIVE_CLIENT_ID: string;
  DRIVE_CLIENT_SECRET: string;
  DRIVE_REFRESH_TOKEN: string;
}

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Cache access token di memori isolat: satu token dipakai untuk semua
// upload dalam satu jalan cron (berlaku 1 jam, dipakai dengan margin
// 1 menit). Isolat Worker bisa didaur ulang antar jalan, jadi cache
// ini hanya optimasi, bukan keharusan.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getDriveAccessToken(env: DriveEnv): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DRIVE_CLIENT_ID,
      client_secret: env.DRIVE_CLIENT_SECRET,
      refresh_token: env.DRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive token ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Drive tidak mengembalikan access token');
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function driveFetch(
  env: DriveEnv,
  path: string,
  init?: RequestInit,
): Promise<{ files?: { id: string; name: string }[]; id?: string }> {
  const token = await getDriveAccessToken(env);
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
  const token = await getDriveAccessToken(env);
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
