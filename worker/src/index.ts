// Backend stok Sabun Palem. Web app memanggil endpoint ini; Worker
// membaca dan menulis Google Sheet. Prinsip utama: Worker HANYA
// MENYISIPKAN baris baru di bawah header tab Log Transaksi (baris 2),
// tidak pernah menimpa nilai stok dan tidak pernah menghapus baris.
// Baris terbaru selalu paling atas. Stok terkini dihitung rumus
// SUMIFS di Sheet dari log, jadi dua scan bersamaan tidak bisa saling
// menimpa (tidak ada race condition) dan semua perubahan tercatat
// (audit trail).
//
// Endpoint:
//   GET  /api/stock       -> daftar produk + stok terkini
//   GET  /api/log         -> riwayat transaksi, terbaru di atas
//   POST /api/scan        -> catat satu pergerakan (sisip di baris 2 Log)
//   POST /api/scan/undo   -> batalkan satu transaksi (baris koreksi)
//   GET  /api/monthly     -> stok akhir tiap produk per tanggal (?month=YYYY-MM)
//   POST /api/monthly/create -> buat tab bulanan di Sheet ({month: YYYY-MM})
//   GET  /api/marketing   -> agregat penjualan offline dari sheet
//          Analisis Penjualan Offline 2026 (live, cache maks 60 detik)
//
// Cron tiap tanggal 1 jam 00:00 WIB membuat tab bulanan baru di Sheet
// (lihat wrangler.toml [triggers]).
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { attendanceRoutes } from './attendance';
import type { AttendanceEnv } from './attendance';
import { getMarketing } from './marketing';
import { insertRowAtTop, readRange } from './sheets';
import type { SheetsEnv } from './sheets';
import {
  computeMonthly,
  createMonthlyTab,
  wibToday,
  wibYearMonth,
} from './monthly';
import type { MonthlyLogRow } from './monthly';
import {
  LOCATION_IDS,
  LOCATION_LABELS,
  findById,
  findByName,
  isLocationId,
} from './products';

interface Env extends SheetsEnv, AttendanceEnv {
  ALLOWED_ORIGINS: string;
}

const STOCK_RANGE = "'Stok Terkini'!A2:I25";
const LOG_READ_RANGE = "'Log Transaksi'!A2:I";

const app = new Hono<{ Bindings: Env }>();

// CORS: hanya origin aplikasi yang diizinkan (Pages + localhost dev).
app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0]),
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })(c, next);
});

function jsonError(c: { json: (body: object, status: number) => Response }, status: number, message: string) {
  return c.json({ error: message }, status);
}

app.get('/', (c) => c.json({ ok: true, service: 'stok-sabun-palem' }));

// Absensi: catatan + selfie + bukti kerja di D1 (lihat
// src/attendance.ts). CORS yang sama dengan endpoint stok berlaku.
app.route('/api/absen', attendanceRoutes);

// GET /api/stock: baca Stok Terkini, gabung dengan katalog (id produk
// berasal dari katalog, angka stok dari rumus Sheet).
app.get('/api/stock', async (c) => {
  try {
    const rows = await readRange(c.env, STOCK_RANGE);
    const products = rows
      .map((r) => {
        const catalog = findByName(r[0] ?? '');
        if (!catalog) return null;
        return {
          id: catalog.id,
          barcode: catalog.barcode,
          name: catalog.name,
          unit: catalog.unit,
          minStock: catalog.minStock,
          stock: {
            klinik: Number(r[4] ?? 0),
            'gudang-kantor': Number(r[5] ?? 0),
            kantor: Number(r[6] ?? 0),
          },
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    return c.json(products);
  } catch (e) {
    console.error('GET /api/stock gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal membaca stok dari spreadsheet');
  }
});

interface LogRow {
  timestamp: string;
  barcode: string;
  name: string;
  location: string;
  type: string;
  qty: number;
  note: string;
  staff: string;
  tanggal: string; // YYYY-MM-DD (WIB), dari kolom I
}

// Tanggal WIB dari timestamp ISO. Dipakai sebagai cadangan kalau kolom
// Tanggal kosong (baris lama sebelum kolom itu ada).
function tanggalFromTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function parseLogRows(rows: string[][]): LogRow[] {
  return rows
    .map((r) => {
      const timestamp = r[0] ?? '';
      const tanggalRaw = r[8] ?? '';
      return {
        timestamp,
        barcode: r[1] ?? '',
        name: r[2] ?? '',
        location: r[3] ?? '',
        type: r[4] ?? '',
        qty: Number(r[5] ?? 0),
        note: r[6] ?? '',
        staff: r[7] ?? '',
        tanggal: /^\d{4}-\d{2}-\d{2}$/.test(tanggalRaw)
          ? tanggalRaw
          : tanggalFromTimestamp(timestamp),
      };
    })
    .filter((r) => r.name !== '' && (r.type === 'Masuk' || r.type === 'Keluar'));
}

function toMonthlyRows(rows: LogRow[]): MonthlyLogRow[] {
  return rows
    .filter((r) => r.tanggal !== '')
    .map((r) => ({ name: r.name, type: r.type, qty: r.qty, tanggal: r.tanggal, location: r.location }));
}

// ID transaksi berbasis ISI baris, bukan nomor baris: nomor baris
// bergeser setiap ada sisipan baru di atas, jadi tidak bisa dipakai
// sebagai identitas. Format:
//   TX-<timestamp ISO>|<barcode>|<Masuk|Keluar>|<qty>
// Kombinasi ini unik dalam praktik: dua scan produk, jenis, dan jumlah
// yang sama tidak terjadi dalam milidetik yang sama.
function txIdFor(r: Pick<LogRow, 'timestamp' | 'barcode' | 'type' | 'qty'>): string {
  return `TX-${r.timestamp}|${r.barcode}|${r.type}|${r.qty}`;
}

function parseTxId(txId: string): Pick<LogRow, 'timestamp' | 'barcode' | 'type' | 'qty'> | null {
  if (!txId.startsWith('TX-')) return null;
  const parts = txId.slice(3).split('|');
  if (parts.length !== 4) return null;
  const [timestamp, barcode, type, qtyRaw] = parts;
  if (Number.isNaN(Date.parse(timestamp))) return null;
  if (type !== 'Masuk' && type !== 'Keluar') return null;
  const qty = Number(qtyRaw);
  if (!Number.isInteger(qty) || qty <= 0) return null;
  return { timestamp, barcode, type, qty };
}

// GET /api/log: riwayat terbaru di atas. Sheet menyimpan log dengan
// baris terbaru di atas, tapi kolom Sisa harus dihitung berjalan dari
// baris TERLAMA: array dibalik dulu sebelum menghitung, lalu dibalik
// lagi untuk tampilan. Karena Log berisi baris Stok Awal, total
// berjalan per produk adalah stok setelah tiap transaksi.
app.get('/api/log', async (c) => {
  try {
    const rows = await readRange(c.env, LOG_READ_RANGE);
    const parsed = parseLogRows(rows);
    const oldestFirst = [...parsed].reverse();
    const running = new Map<string, number>();
    const withStockAfter = oldestFirst.map((r) => {
      const current = running.get(r.name) ?? 0;
      const next = current + (r.type === 'Masuk' ? r.qty : -r.qty);
      running.set(r.name, next);
      return { ...r, stockAfter: next };
    });
    const transactions = withStockAfter
      .reverse()
      .slice(0, 200)
      .map((r) => {
        const catalog = findByName(r.name);
        return {
          id: txIdFor(r),
          timestamp: r.timestamp,
          productId: catalog?.id ?? r.name,
          type: r.type === 'Masuk' ? 'masuk' : 'keluar',
          qty: r.qty,
          location: LOCATION_IDS[r.location] ?? 'klinik',
          note: r.note,
          staff: r.staff,
          stockAfter: r.stockAfter,
        };
      });
    return c.json(transactions);
  } catch (e) {
    console.error('GET /api/log gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal membaca riwayat dari spreadsheet');
  }
});

interface ScanBody {
  barcode?: string | null;
  productId?: unknown;
  type?: unknown;
  qty?: unknown;
  location?: unknown;
  note?: unknown;
  staff?: unknown;
}

// POST /api/scan: validasi server-side, lalu sisipkan satu baris di
// bawah header Log (baris 2). Validasi tidak pernah dipercayakan ke
// aplikasi saja.
app.post('/api/scan', async (c) => {
  let body: ScanBody;
  try {
    body = (await c.req.json()) as ScanBody;
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }

  if (typeof body.productId !== 'string') {
    return jsonError(c, 400, 'productId wajib diisi');
  }
  const product = findById(body.productId);
  if (!product) {
    return jsonError(c, 400, 'Produk tidak ditemukan');
  }
  if (body.type !== 'masuk' && body.type !== 'keluar') {
    return jsonError(c, 400, 'type harus masuk atau keluar');
  }
  if (
    typeof body.qty !== 'number' ||
    !Number.isInteger(body.qty) ||
    body.qty <= 0 ||
    body.qty > 10000
  ) {
    return jsonError(c, 400, 'qty harus bilangan bulat 1 sampai 10000');
  }
  if (!isLocationId(body.location)) {
    return jsonError(c, 400, 'location tidak dikenal');
  }
  if (typeof body.note !== 'string' || body.note.trim() === '' || body.note.length > 200) {
    return jsonError(c, 400, 'note wajib diisi, maksimal 200 karakter');
  }
  if (typeof body.staff !== 'string' || body.staff.trim() === '' || body.staff.length > 100) {
    return jsonError(c, 400, 'staff wajib diisi, maksimal 100 karakter');
  }
  // Barcode yang dikirim harus cocok dengan katalog produk.
  if (body.barcode !== null && body.barcode !== undefined) {
    if (typeof body.barcode !== 'string' || body.barcode !== product.barcode) {
      return jsonError(c, 400, 'barcode tidak cocok dengan produk');
    }
  }
  // Barang keluar tidak boleh membuat stok lokasi jadi minus.
  if (body.type === 'keluar') {
    try {
      const stockRows = await readRange(c.env, STOCK_RANGE);
      const row = stockRows.find((r) => r[0] === product.name);
      const colIndex = body.location === 'klinik' ? 4 : body.location === 'gudang-kantor' ? 5 : 6;
      const available = Number(row?.[colIndex] ?? 0);
      if (body.qty > available) {
        return jsonError(c, 400, `Stok ${LOCATION_LABELS[body.location]} hanya ${available} ${product.unit}`);
      }
    } catch (e) {
      console.error('Cek stok sebelum scan gagal:', e instanceof Error ? e.message : e);
      return jsonError(c, 502, 'Gagal memeriksa stok dari spreadsheet');
    }
  }

  try {
    const timestamp = new Date().toISOString();
    const sheetType = body.type === 'masuk' ? 'Masuk' : 'Keluar';
    await insertRowAtTop(c.env, [[
      timestamp,
      product.barcode ?? '',
      product.name,
      LOCATION_LABELS[body.location],
      sheetType,
      body.qty,
      body.note.trim(),
      body.staff.trim(),
    ]], wibToday());

    // Baca ulang stok produk ini supaya aplikasi menampilkan angka baru.
    const stockRows = await readRange(c.env, STOCK_RANGE);
    const row = stockRows.find((r) => r[0] === product.name);
    const stock = {
      klinik: Number(row?.[4] ?? 0),
      'gudang-kantor': Number(row?.[5] ?? 0),
      kantor: Number(row?.[6] ?? 0),
    };
    const total = stock.klinik + stock['gudang-kantor'] + stock.kantor;
    return c.json({
      product: {
        id: product.id,
        barcode: product.barcode,
        name: product.name,
        unit: product.unit,
        minStock: product.minStock,
        stock,
      },
      tx: {
        id: txIdFor({ timestamp, barcode: product.barcode ?? '', type: sheetType, qty: body.qty }),
        timestamp,
        productId: product.id,
        type: body.type,
        qty: body.qty,
        location: body.location,
        note: body.note.trim(),
        staff: body.staff.trim(),
        stockAfter: total,
      },
    });
  } catch (e) {
    console.error('POST /api/scan gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal mencatat ke spreadsheet');
  }
});

// POST /api/scan/undo: batalkan transaksi dengan menyisipkan baris
// koreksi di baris 2 (jenis berlawanan, jumlah sama). Baris asli TIDAK
// dihapus, audit trail tetap utuh. Baris Stok Awal dan baris koreksi
// tidak bisa dibatalkan. Baris target dicari dari ISI baris (timestamp
// + barcode + jenis + jumlah), bukan nomor baris, karena nomor baris
// bergeser setiap ada sisipan baru di atas.
app.post('/api/scan/undo', async (c) => {
  let body: { txId?: unknown; staff?: unknown };
  try {
    body = (await c.req.json()) as { txId?: unknown; staff?: unknown };
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  if (typeof body.txId !== 'string') {
    return jsonError(c, 400, 'txId tidak benar');
  }
  const key = parseTxId(body.txId);
  if (!key) {
    return jsonError(c, 400, 'txId tidak benar');
  }
  try {
    const rows = await readRange(c.env, LOG_READ_RANGE);
    const parsed = parseLogRows(rows);
    const original = parsed.find(
      (r) =>
        r.timestamp === key.timestamp &&
        r.barcode === key.barcode &&
        r.type === key.type &&
        r.qty === key.qty,
    );
    if (!original) {
      return jsonError(c, 404, 'Transaksi tidak ditemukan');
    }
    if (original.note === 'Stok Awal') {
      return jsonError(c, 400, 'Stok awal tidak bisa dibatalkan');
    }
    if (original.note.startsWith('Koreksi:')) {
      return jsonError(c, 400, 'Baris koreksi tidak bisa dibatalkan');
    }
    const staff =
      typeof body.staff === 'string' && body.staff.trim() !== ''
        ? body.staff.trim()
        : original.staff;
    await insertRowAtTop(c.env, [[
      new Date().toISOString(),
      original.barcode,
      original.name,
      original.location,
      original.type === 'Masuk' ? 'Keluar' : 'Masuk',
      original.qty,
      `Koreksi: batal ${original.note}`,
      staff,
    ]], wibToday());
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/scan/undo gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal mencatat koreksi ke spreadsheet');
  }
});

// GET /api/monthly?month=YYYY-MM: stok akhir tiap produk per tanggal
// dalam satu bulan + selisih harian. Tanpa parameter month, dipakai
// bulan berjalan (WIB).
app.get('/api/monthly', async (c) => {
  const raw = c.req.query('month') ?? '';
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
  const { year, month } = match
    ? { year: Number(match[1]), month: Number(match[2]) }
    : wibYearMonth();
  if (raw !== '' && !match) {
    return jsonError(c, 400, 'month harus format YYYY-MM');
  }
  try {
    const rows = await readRange(c.env, LOG_READ_RANGE);
    const parsed = parseLogRows(rows);
    return c.json(computeMonthly(toMonthlyRows(parsed), year, month, wibToday()));
  } catch (e) {
    console.error('GET /api/monthly gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal membaca riwayat dari spreadsheet');
  }
});

// POST /api/monthly/create: buat tab bulanan di Sheet untuk bulan yang
// diminta ({month: "YYYY-MM"}, kosong berarti bulan berjalan). Kalau
// tab sudah ada, tidak dibuat lagi. Dipakai untuk membuat tab bulan
// berjalan secara manual dan sebagai pemulihan kalau cron terlewat.
app.post('/api/monthly/create', async (c) => {
  let body: { month?: unknown } = {};
  try {
    body = (await c.req.json()) as { month?: unknown };
  } catch {
    // Body kosong: pakai bulan berjalan.
  }
  const raw = typeof body.month === 'string' ? body.month : '';
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
  const { year, month } = match
    ? { year: Number(match[1]), month: Number(match[2]) }
    : wibYearMonth();
  if (raw !== '' && !match) {
    return jsonError(c, 400, 'month harus format YYYY-MM');
  }
  try {
    const result = await createMonthlyTab(c.env, year, month);
    return c.json(result);
  } catch (e) {
    console.error('POST /api/monthly/create gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal membuat tab bulanan di spreadsheet');
  }
});

// GET /api/marketing: agregat penjualan offline siap grafik (per
// bulan + top 10 produk). Dibaca live dari sheet Analisis setiap
// request, cache di Worker maksimal 60 detik.
app.get('/api/marketing', async (c) => {
  try {
    return c.json(await getMarketing(c.env));
  } catch (e) {
    console.error('GET /api/marketing gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal membaca data pemasaran dari spreadsheet');
  }
});

export default {
  fetch: app.fetch,
  // Cron tiap tanggal 1 jam 00:00 WIB: buat tab untuk bulan yang baru
  // dimulai. Kalau tab sudah ada (misal dibuat manual), tidak dibuat lagi.
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const { year, month } = wibYearMonth();
    await createMonthlyTab(env, year, month);
  },
};
