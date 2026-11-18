// Klien Google Sheets API untuk Worker. Autentikasi memakai service
// account: JWT ditandatangani RS256 dengan private key, ditukar jadi
// access token OAuth 2.0. Tidak ada library JWT eksternal; semua
// memakai WebCrypto bawaan Workers.
//
// Secret yang dibutuhkan (diatur lewat wrangler secret put, tidak
// pernah ditulis ke file ini):
//   SHEETS_CLIENT_EMAIL - email service account
//   SHEETS_PRIVATE_KEY  - private key PEM dari file JSON key
export interface SheetsEnv {
  SHEET_ID: string;
  SHEETS_CLIENT_EMAIL: string;
  SHEETS_PRIVATE_KEY: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// Cache token di memori isolate supaya tidak minta token baru di setiap
// request. Token berlaku 1 jam; diperbarui saat tersisa kurang dari 1 menit.
let cachedToken: string | null = null;
let cachedExpiry = 0;

function base64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64DecodeToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Private key dari JSON key bisa mengandung newline asli atau "\n"
// harfiah, tergantung cara secret disimpan. Normalisasi keduanya.
function pemToPkcs8(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, '\n');
  const body = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  return base64DecodeToBytes(body);
}

async function getAccessToken(env: SheetsEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedExpiry > now + 60) return cachedToken;

  const keyData = pemToPkcs8(env.SHEETS_PRIVATE_KEY);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const header = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
  );
  const payload = base64urlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        iss: env.SHEETS_CLIENT_EMAIL,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64urlEncode(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:
      'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer' +
      `&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!res.ok) {
    throw new Error(`Gagal minta access token Google (${res.status})`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  cachedExpiry = now + data.expires_in;
  return cachedToken;
}

async function sheetsFetch(
  env: SheetsEnv,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const token = await getAccessToken(env);
  const res = await fetch(`${SHEETS_BASE}/${env.SHEET_ID}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Baca nilai dari satu range A1 (misal "'Stok Terkini'!A2:I25").
// Mengembalikan array baris; sel kosong di akhir baris bisa tidak ada.
export async function readRange(env: SheetsEnv, range: string): Promise<string[][]> {
  const data = (await sheetsFetch(
    env,
    `/values/${encodeURIComponent(range)}`,
  )) as { values?: string[][] };
  return data.values ?? [];
}

// Tambah baris di akhir tab. valueInputOption RAW: nilai disimpan
// persis seperti dikirim (timestamp ISO tetap teks, tidak diubah Sheets).
// Mengembalikan range baris yang ditulis, misal "'Log Transaksi'!A73:H73".
export async function appendRows(
  env: SheetsEnv,
  range: string,
  values: (string | number)[][],
): Promise<string> {
  const data = (await sheetsFetch(
    env,
    `/values/${encodeURIComponent(range)}:append` +
      '?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    {
      method: 'POST',
      body: JSON.stringify({ values }),
    },
  )) as { updates?: { updatedRange?: string } };
  return data.updates?.updatedRange ?? '';
}

// Ambil nomor baris dari updatedRange hasil append ("...!A73:H73" -> 73).
export function rowNumberFromRange(updatedRange: string): number | null {
  const match = /!A(\d+):/.exec(updatedRange);
  return match ? Number(match[1]) : null;
}
