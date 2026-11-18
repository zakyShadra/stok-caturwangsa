// Backend stok Sabun Palem. Web app memanggil endpoint ini; Worker
// membaca dan menulis Google Sheet. Prinsip utama: Worker HANYA
// MENAMBAH baris ke tab Log Transaksi, tidak pernah menimpa nilai stok.
// Stok terkini dihitung rumus SUMIFS di Sheet dari log, jadi dua scan
// bersamaan tidak bisa saling menimpa (tidak ada race condition) dan
// semua perubahan tercatat (audit trail).
//
// Endpoint:
//   GET  /api/stock       -> daftar produk + stok terkini
//   GET  /api/log         -> riwayat transaksi, terbaru di atas
//   POST /api/scan        -> catat satu pergerakan (append ke Log)
//   POST /api/scan/undo   -> batalkan satu transaksi (baris koreksi)
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { appendRows, readRange, rowNumberFromRange } from './sheets';
import type { SheetsEnv } from './sheets';
import {
  LOCATION_IDS,
  LOCATION_LABELS,
  findById,
  findByName,
  isLocationId,
} from './products';

interface Env extends SheetsEnv {
  ALLOWED_ORIGINS: string;
}

const STOCK_RANGE = "'Stok Terkini'!A2:I25";
const LOG_RANGE = "'Log Transaksi'!A:H";
const LOG_READ_RANGE = "'Log Transaksi'!A2:H";

const app = new Hono<{ Bindings: Env }>();

// CORS: hanya origin aplikasi yang diizinkan (Pages + localhost dev).
app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0]),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })(c, next);
});

function jsonError(c: { json: (body: object, status: number) => Response }, status: number, message: string) {
  return c.json({ error: message }, status);
}

app.get('/', (c) => c.json({ ok: true, service: 'stok-sabun-palem' }));

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
  row: number;
  timestamp: string;
  barcode: string;
  name: string;
  location: string;
  type: string;
  qty: number;
  note: string;
  staff: string;
}

function parseLogRows(rows: string[][]): LogRow[] {
  return rows
    .map((r, i) => ({
      row: i + 2,
      timestamp: r[0] ?? '',
      barcode: r[1] ?? '',
      name: r[2] ?? '',
      location: r[3] ?? '',
      type: r[4] ?? '',
      qty: Number(r[5] ?? 0),
      note: r[6] ?? '',
      staff: r[7] ?? '',
    }))
    .filter((r) => r.name !== '' && (r.type === 'Masuk' || r.type === 'Keluar'));
}

// GET /api/log: riwayat terbaru di atas. Kolom Sisa dihitung dengan
// berjalan dari baris terlama: karena Log berisi baris Stok Awal,
// total berjalan per produk adalah stok setelah tiap transaksi.
app.get('/api/log', async (c) => {
  try {
    const rows = await readRange(c.env, LOG_READ_RANGE);
    const parsed = parseLogRows(rows);
    const running = new Map<string, number>();
    const withStockAfter = parsed.map((r) => {
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
          id: `TX-${r.row}`,
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

// POST /api/scan: validasi server-side, lalu append satu baris ke Log.
// Validasi tidak pernah dipercayakan ke aplikasi saja.
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
    const updatedRange = await appendRows(c.env, LOG_RANGE, [[
      timestamp,
      product.barcode ?? '',
      product.name,
      LOCATION_LABELS[body.location],
      body.type === 'masuk' ? 'Masuk' : 'Keluar',
      body.qty,
      body.note.trim(),
      body.staff.trim(),
    ]]);
    const rowNumber = rowNumberFromRange(updatedRange);

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
        id: rowNumber ? `TX-${rowNumber}` : `TX-${Date.now()}`,
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

// POST /api/scan/undo: batalkan transaksi dengan menambah baris koreksi
// (jenis berlawanan, jumlah sama). Baris asli TIDAK dihapus, audit
// trail tetap utuh. Baris Stok Awal dan baris koreksi tidak bisa dibatalkan.
app.post('/api/scan/undo', async (c) => {
  let body: { txId?: unknown; staff?: unknown };
  try {
    body = (await c.req.json()) as { txId?: unknown; staff?: unknown };
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  if (typeof body.txId !== 'string' || !/^TX-\d+$/.test(body.txId)) {
    return jsonError(c, 400, 'txId tidak benar');
  }
  const rowNumber = Number(body.txId.slice(3));
  try {
    const rows = await readRange(c.env, `'Log Transaksi'!A${rowNumber}:H${rowNumber}`);
    const r = rows[0];
    if (!r || !r[2] || (r[4] !== 'Masuk' && r[4] !== 'Keluar')) {
      return jsonError(c, 404, 'Transaksi tidak ditemukan');
    }
    const original: LogRow = {
      row: rowNumber,
      timestamp: r[0] ?? '',
      barcode: r[1] ?? '',
      name: r[2] ?? '',
      location: r[3] ?? '',
      type: r[4] ?? '',
      qty: Number(r[5] ?? 0),
      note: r[6] ?? '',
      staff: r[7] ?? '',
    };
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
    await appendRows(c.env, LOG_RANGE, [[
      new Date().toISOString(),
      original.barcode,
      original.name,
      original.location,
      original.type === 'Masuk' ? 'Keluar' : 'Masuk',
      original.qty,
      `Koreksi: batal ${original.note}`,
      staff,
    ]]);
    return c.json({ ok: true });
  } catch (e) {
    console.error('POST /api/scan/undo gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal mencatat koreksi ke spreadsheet');
  }
});

export default app;
