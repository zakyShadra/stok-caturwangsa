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
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// Cache token di memori isolate supaya tidak minta token baru di setiap
// request, per scope (Sheets dan Drive memakai token berbeda). Token
// berlaku 1 jam; diperbarui saat tersisa kurang dari 1 menit.
const tokenCache = new Map<string, { token: string; expiry: number }>();

export type GoogleAuthEnv = Pick<SheetsEnv, 'SHEETS_CLIENT_EMAIL' | 'SHEETS_PRIVATE_KEY'>;

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

// Minta access token OAuth 2.0 untuk satu scope, dari service account.
// Dipakai Sheets (sheetsFetch di bawah) dan Drive (drive.ts).
export async function getAccessToken(env: GoogleAuthEnv, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);
  if (cached && cached.expiry > now + 60) return cached.token;

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
        scope,
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
  tokenCache.set(scope, { token: data.access_token, expiry: now + data.expires_in });
  return data.access_token;
}

async function sheetsFetch(
  env: SheetsEnv,
  path: string,
  init?: RequestInit,
  spreadsheetId?: string,
): Promise<unknown> {
  const token = await getAccessToken(env, SHEETS_SCOPE);
  const id = spreadsheetId ?? env.SHEET_ID;
  const res = await fetch(`${SHEETS_BASE}/${id}${path}`, {
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

// Seperti readRange, tapi dari spreadsheet lain (bukan SHEET_ID).
// Dipakai endpoint pemasaran untuk membaca sheet Analisis Penjualan
// Offline 2026, yang dikelola analis dan sering berubah.
export async function readRangeFrom(
  env: SheetsEnv,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const data = (await sheetsFetch(
    env,
    `/values/${encodeURIComponent(range)}`,
    undefined,
    spreadsheetId,
  )) as { values?: string[][] };
  return data.values ?? [];
}

// ID numerik tab Log Transaksi di spreadsheet (dari spreadsheets.get).
// Dibutuhkan insertDimension; stabil selama tab tidak dihapus dan
// dibuat ulang.
const LOG_SHEET_ID = 2034344698;

// Panggil spreadsheets.batchUpdate dengan daftar request mentah
// (insertDimension, addSheet, repeatCell, dan lain-lain).
export async function batchUpdateSheets(
  env: SheetsEnv,
  requests: unknown[],
): Promise<{ replies?: { addSheet?: { properties?: { sheetId?: number } } }[] }> {
  return (await sheetsFetch(env, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests }),
  })) as { replies?: { addSheet?: { properties?: { sheetId?: number } } }[] };
}

// Tulis nilai ke satu range A1. valueInputOption USER_ENTERED membuat
// Sheets mengurai isi seperti diketik di UI (rumus jadi rumus, tanggal
// jadi tanggal); RAW menyimpan persis seperti dikirim.
export async function updateValues(
  env: SheetsEnv,
  range: string,
  values: (string | number)[][],
  valueInputOption: 'RAW' | 'USER_ENTERED',
): Promise<void> {
  await sheetsFetch(
    env,
    `/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`,
    {
      method: 'PUT',
      body: JSON.stringify({ values }),
    },
  );
}

// Daftar judul semua tab di spreadsheet (untuk cek duplikat sebelum
// membuat tab bulanan baru).
export async function getSheetTitles(env: SheetsEnv): Promise<string[]> {
  const data = (await sheetsFetch(
    env,
    '?fields=sheets.properties.title',
  )) as { sheets?: { properties?: { title?: string } }[] };
  return (data.sheets ?? []).map((s) => s.properties?.title ?? '');
}

// ID numerik tab berdasarkan judul (untuk hapus tab di rebuild dan
// untuk format grup tanggal). Null kalau tab tidak ada.
export async function getSheetId(env: SheetsEnv, title: string): Promise<number | null> {
  const data = (await sheetsFetch(
    env,
    '?fields=sheets.properties(title,sheetId)',
  )) as { sheets?: { properties?: { title?: string; sheetId?: number } }[] };
  const found = (data.sheets ?? []).find((s) => s.properties?.title === title);
  return found?.properties?.sheetId ?? null;
}

// Sisipkan baris baru tepat di bawah header (baris 2), sehingga baris
// terbaru selalu paling atas. Kolom A-H ditulis dengan RAW (timestamp
// ISO tetap teks), kolom I (Tanggal) ditulis terpisah dengan
// USER_ENTERED supaya Sheets menyimpannya sebagai nilai tanggal asli
// (diperlukan rumus SUMIFS bulanan). tanggalWib format YYYY-MM-DD.
export async function insertRowAtTop(
  env: SheetsEnv,
  values: (string | number)[][],
  tanggalWib: string,
): Promise<void> {
  await batchUpdateSheets(env, [
    {
      insertDimension: {
        range: {
          sheetId: LOG_SHEET_ID,
          dimension: 'ROWS',
          startIndex: 1,
          endIndex: 2,
        },
        inheritFromBefore: false,
      },
    },
  ]);
  // Salin format baris 3 (baris data lama paling atas) ke baris 2 yang
  // baru, supaya baris scan terbaru ikut rapi (border). Kegagalan di
  // sini tidak boleh menggagalkan scan, jadi ditangkap diam-diam.
  try {
    await batchUpdateSheets(env, [
      {
        copyPaste: {
          source: {
            sheetId: LOG_SHEET_ID,
            startRowIndex: 2,
            endRowIndex: 3,
            startColumnIndex: 0,
            endColumnIndex: 9,
          },
          destination: {
            sheetId: LOG_SHEET_ID,
            startRowIndex: 1,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: 9,
          },
          pasteType: 'PASTE_FORMAT',
        },
      },
    ]);
  } catch (e) {
    console.error(
      'Gagal menyalin format baris log:',
      e instanceof Error ? e.message : e,
    );
  }
  await updateValues(env, "'Log Transaksi'!A2:H2", values, 'RAW');
  await updateValues(env, "'Log Transaksi'!I2", [[tanggalWib]], 'USER_ENTERED');
}
