// Endpoint pemasaran: agregat penjualan offline dari spreadsheet
// "Analisis Penjualan Offline 2026" (dikelola analis, sering berubah).
// Grafik di aplikasi WAJIB membaca live dari Sheet setiap kali dibuka,
// jadi endpoint ini membaca Sheet di setiap request, dengan cache
// singkat maksimal 60 detik (di memori isolate) supaya buka-tutup menu
// berulang tidak membanjiri Sheets API. Cache TIDAK PERNAH lebih dari
// 60 detik, sesuai syarat Zaky.
//
// CATATAN DATA (dibaca langsung dari Sheet, 18 Nov 2026):
// - Sheet ini HANYA berisi penjualan OFFLINE (tidak ada Shopee /
//   Tokopedia). Grafik pertama adalah Penjualan vs Kas Masuk per
//   bulan, BUKAN pemasukan vs pengeluaran: Sheet ini tidak punya
//   kolom pengeluaran sama sekali, jadi grafik pengeluaran tidak
//   bisa dibangun tanpa mengarang angka.
// - Data Transaksi: Nilai Penjualan (kolom G) dan Kas Masuk (kolom J)
//   per transaksi; Kas Masuk bisa lebih kecil dari Nilai Penjualan
//   kalau pelanggan belum bayar lunas.
// - Data Item: Nilai Penjualan PER ITEM (kolom J) + Produk baku
//   (kolom F), jadi top 10 produk dihitung dari nilai rupiah,
//   bukan dari jumlah unit (satuannya beda-beda: Bal, Jerigen, Dus).
import { readRangeFrom } from './sheets';
import type { SheetsEnv } from './sheets';

// Spreadsheet Analisis Penjualan Offline 2026. Service account Worker
// sudah bisa membacanya (tes langsung 18 Nov 2026: HTTP 200).
const ANALISIS_SHEET_ID = '1dj-_r50KK4aZOCwKcj1qnq_zR8Md4zfuRiZxzTgtIfc';

// Cache singkat: 60 detik. Lebih dari itu melanggar syarat live.
const CACHE_TTL_MS = 60_000;

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Tanggal di Sheet format "02-Jun-2026", tapi singkatannya campuran:
// Inggris (Jun, Jul, Sep, Nov) dan Indonesia (Agu, Okt, Mei, Des),
// jadi parseSheetDate menerima keduanya.
const MONTH_EN: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// Kolom Bulan di Sheet pakai singkatan Indonesia.
const MONTH_ID: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, Mei: 5, Jun: 6,
  Jul: 7, Agu: 8, Sep: 9, Okt: 10, Nov: 11, Des: 12,
};

export interface MonthlySales {
  key: string; // YYYY-MM
  label: string; // "Juni 2026"
  penjualan: number;
  kasMasuk: number;
  transaksi: number;
  // Bulan parsial: data belum sampai akhir bulan (misal November baru
  // tanggal 1-10). Ditandai supaya tidak dibandingkan mentah dengan
  // bulan penuh.
  partial: boolean;
  daysCovered: number;
}

export interface TopProduct {
  name: string;
  revenue: number;
  qty: number;
  unit: string;
}

export interface MarketingData {
  monthly: MonthlySales[];
  topProducts: TopProduct[];
  totalPenjualan: number;
  totalKasMasuk: number;
  updatedAt: string; // ISO, waktu Worker membaca Sheet
}

// "Rp1.600.000" -> 1600000, "-Rp724.000" -> -724000, "" -> 0.
// Sel di Sheet bisa juga sudah berupa angka (format mata uang).
function parseRp(value: string | undefined): number {
  if (value === undefined) return 0;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '-') return 0;
  const negative = trimmed.startsWith('-');
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits === '') return 0;
  return (negative ? -1 : 1) * Number(digits);
}

// "02-Jun-2026" -> { year: 2026, month: 6, day: 2 }. Singkatan bulan
// bisa Inggris (Aug, Oct) atau Indonesia (Agu, Okt): keduanya
// dipakai analis di kolom Tanggal.
function parseSheetDate(value: string | undefined): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const month = MONTH_EN[m[2]] ?? MONTH_ID[m[2]];
  if (!month) return null;
  return { day: Number(m[1]), month, year: Number(m[3]) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

let cached: { at: number; data: MarketingData } | null = null;

export async function getMarketing(env: SheetsEnv): Promise<MarketingData> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.data;

  const [txRows, itemRows] = await Promise.all([
    readRangeFrom(env, ANALISIS_SHEET_ID, "'Data Transaksi'!A2:J"),
    readRangeFrom(env, ANALISIS_SHEET_ID, "'Data Item'!A2:J"),
  ]);

  // Tahun fallback untuk baris yang tanggalnya tidak bisa diurai:
  // tahun terbanyak di data, kalau tidak ada pakai tahun berjalan.
  const yearCounts = new Map<number, number>();
  for (const r of txRows) {
    const d = parseSheetDate(r[1]);
    if (d) yearCounts.set(d.year, (yearCounts.get(d.year) ?? 0) + 1);
  }
  let fallbackYear = new Date().getUTCFullYear();
  let fallbackCount = 0;
  for (const [year, count] of yearCounts) {
    if (count > fallbackCount) {
      fallbackYear = year;
      fallbackCount = count;
    }
  }

  const byMonth = new Map<string, MonthlySales & { maxDay: number }>();
  const monthKey = (year: number, month: number) =>
    `${year}-${String(month).padStart(2, '0')}`;
  const ensureMonth = (year: number, month: number) => {
    const key = monthKey(year, month);
    let entry = byMonth.get(key);
    if (!entry) {
      entry = {
        key,
        label: `${MONTH_NAMES_ID[month - 1]} ${year}`,
        penjualan: 0,
        kasMasuk: 0,
        transaksi: 0,
        partial: false,
        daysCovered: 0,
        maxDay: 0,
      };
      byMonth.set(key, entry);
    }
    return entry;
  };

  for (const r of txRows) {
    // Abaikan baris kosong / tanpa ID transaksi.
    if (!r[0]) continue;
    const d = parseSheetDate(r[1]);
    let year: number;
    let month: number;
    let day = 0;
    if (d) {
      ({ year, month, day } = d);
    } else {
      month = MONTH_ID[(r[2] ?? '').trim()] ?? 0;
      if (!month) continue;
      year = fallbackYear;
    }
    const entry = ensureMonth(year, month);
    entry.penjualan += parseRp(r[6]);
    entry.kasMasuk += parseRp(r[9]);
    entry.transaksi += 1;
    if (day > entry.maxDay) entry.maxDay = day;
  }

  const monthly = [...byMonth.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ maxDay, key, label, penjualan, kasMasuk, transaksi }) => {
      const [year, month] = key.split('-').map(Number);
      return {
        key,
        label,
        penjualan,
        kasMasuk,
        transaksi,
        partial: maxDay > 0 && maxDay < daysInMonth(year, month),
        daysCovered: maxDay,
      };
    });

  const byProduct = new Map<string, TopProduct & { units: Map<string, number> }>();
  for (const r of itemRows) {
    const name = (r[5] ?? '').trim();
    if (!name) continue;
    let entry = byProduct.get(name);
    if (!entry) {
      entry = { name, revenue: 0, qty: 0, unit: '', units: new Map() };
      byProduct.set(name, entry);
    }
    entry.revenue += parseRp(r[9]);
    entry.qty += Number(r[6] ?? 0) || 0;
    const unit = (r[7] ?? '').trim();
    if (unit) entry.units.set(unit, (entry.units.get(unit) ?? 0) + 1);
  }
  const topProducts = [...byProduct.values()]
    .map(({ units, ...p }) => {
      // Satuan yang paling sering muncul untuk produk ini.
      let unit = '';
      let best = 0;
      for (const [u, count] of units) {
        if (count > best) {
          unit = u;
          best = count;
        }
      }
      return { ...p, unit };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const data: MarketingData = {
    monthly,
    topProducts,
    totalPenjualan: monthly.reduce((s, m) => s + m.penjualan, 0),
    totalKasMasuk: monthly.reduce((s, m) => s + m.kasMasuk, 0),
    updatedAt: new Date().toISOString(),
  };
  cached = { at: now, data };
  return data;
}
