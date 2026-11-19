// Logika bulanan: hitung stok akhir tiap produk per tanggal (untuk
// API aplikasi), dan buat tab bulanan di Sheet. Zona waktu
// perusahaan adalah WIB; semua tanggal memakai Asia/Jakarta.
//
// Tab bulanan mengikuti PERSIS format tab opname asli perusahaan
// (misal "Juli 2026"): baris 1 header tanggal per grup ("09 Juli
// 2026"), baris 2 kosong, baris 3 header lokasi (Gudang Klinik,
// Gudang Kantor, Kantor, Total Barang), baris 4 sub-header (No,
// Nama Item, lalu per grup: Unit, Satuan, Unit, Satuan, Unit,
// Satuan, Jml, Unit, Keterangan), baris 5-40 berisi 36 produk
// dengan nama persis tab September 2026. Nilai tiap grup adalah
// snapshot stok akhir hari itu per lokasi (SUMIFS kumulatif dari
// Log Transaksi), Total Barang = jumlah ketiga lokasi.
//
// Satu-satunya perbedaan dari format asli: grup tanggal TIDAK
// dicetak semua di awal. Tab baru dibuat sebagai skeleton (tanpa
// grup tanggal); grup ditambahkan otomatis saat ada pergerakan
// (scan) di tanggal itu, lewat ensureDateGroup. Daftar produk dan
// pemetaan nama tab ke nama Log ada di MONTHLY_ROWS di bawah.
import { CATALOG } from './products';
import type { LocationId } from './products';
import { LOCATION_LABELS } from './products';
import {
  batchUpdateSheets,
  getSheetId,
  getSheetTitles,
  readRange,
  updateValues,
} from './sheets';
import type { SheetsEnv } from './sheets';

// ---- Tanggal WIB ----

// Tanggal hari ini dalam WIB, format YYYY-MM-DD.
export function wibToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function wibYearMonth(): { year: number; month: number } {
  const [year, month] = wibToday().split('-').map(Number);
  return { year, month };
}

// Nama bulan Indonesia, misal "November 2026". Sama formatnya dengan
// tab opname lama ("September 2026").
export function monthTitle(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// ---- Hitung stok bulanan dari log ----

export interface MonthlyLogRow {
  name: string;
  type: string; // 'Masuk' | 'Keluar'
  qty: number;
  tanggal: string; // YYYY-MM-DD (WIB)
  location: string; // label Lokasi di Log, misal 'Gudang Klinik'
}

export interface DayStock {
  day: number;
  stock: number | null; // null untuk tanggal yang belum lewat
  delta: number | null;
}

export interface MonthlyProduct {
  id: string;
  name: string;
  unit: string;
  daily: DayStock[]; // total semua gudang
  dailyByLocation: Record<LocationId, DayStock[]>;
}

export interface MonthlyData {
  month: string; // YYYY-MM
  days: number;
  products: MonthlyProduct[];
}

// Stok akhir tiap produk per tanggal dalam satu bulan, dihitung dari
// log. Tanggal yang belum lewat mengembalikan null (bukan 0) supaya
// aplikasi menampilkannya kosong, bukan seolah stoknya habis.
// Dihitung sekali untuk total semua gudang (daily) dan sekali per
// gudang (dailyByLocation), dari log yang sama, jadi total selalu
// sama dengan jumlah ketiga gudang.
export function computeMonthly(
  rows: MonthlyLogRow[],
  year: number,
  month: number,
  todayWib: string,
): MonthlyData {
  const days = daysInMonth(year, month);
  const monthKey = `${year}-${pad2(month)}`;
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${pad2(days)}`;

  const dailyFor = (mine: MonthlyLogRow[]): DayStock[] => {
    // Stok sebelum bulan ini (semua pergerakan bertanggal lebih awal).
    let running = 0;
    for (const r of mine) {
      if (r.tanggal < monthStart) {
        running += r.type === 'Masuk' ? r.qty : -r.qty;
      }
    }
    // Perubahan bersih per tanggal dalam bulan ini.
    const netByDay = new Map<number, number>();
    for (const r of mine) {
      if (r.tanggal >= monthStart && r.tanggal <= monthEnd) {
        const day = Number(r.tanggal.slice(8, 10));
        netByDay.set(day, (netByDay.get(day) ?? 0) + (r.type === 'Masuk' ? r.qty : -r.qty));
      }
    }
    const daily: DayStock[] = [];
    for (let d = 1; d <= days; d++) {
      const dateKey = `${monthKey}-${pad2(d)}`;
      if (dateKey > todayWib) {
        daily.push({ day: d, stock: null, delta: null });
        continue;
      }
      const delta = netByDay.get(d) ?? 0;
      running += delta;
      daily.push({ day: d, stock: running, delta });
    }
    return daily;
  };

  const products: MonthlyProduct[] = CATALOG.map((p) => {
    const mine = rows.filter((r) => r.name === p.name);
    const byLocation = (id: LocationId) =>
      dailyFor(mine.filter((r) => r.location === LOCATION_LABELS[id]));
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      daily: dailyFor(mine),
      dailyByLocation: {
        klinik: byLocation('klinik'),
        'gudang-kantor': byLocation('gudang-kantor'),
        kantor: byLocation('kantor'),
      },
    };
  });

  return { month: monthKey, days, products };
}

// ---- Tab bulanan di Sheet ----

// Huruf kolom dari nomor kolom 1-based (1 -> A, 27 -> AA).
function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Judul tanggal grup, misal "18 November 2026". Format sama dengan
// tab asli perusahaan (hari zero-padded, bulan Indonesia).
export function dateTitle(dateWib: string): string {
  const [y, m, d] = dateWib.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

// Satu baris produk di tab bulanan. name persis tab September 2026;
// log adalah nama produk di Log Transaksi (info_produk) untuk rumus
// SUMIFS, atau null kalau produk itu tidak ada di Log (sel dibiarkan
// kosong). unit adalah singkatan satuan ala perusahaan (Jrg, Ball,
// Dus, Pcs, Toples) untuk kolom Satuan.
interface MonthlyRow {
  name: string;
  log: string | null;
  unit: string;
}

const MONTHLY_ROWS: MonthlyRow[] = [
  { name: 'Palem Dwl Jerigen', log: 'DWL Palem Jerigen', unit: 'Jrg' },
  { name: 'Palem Dwl Jerigen NP', log: null, unit: '' },
  { name: 'Bomber Jerigen', log: 'DWL BOMBER', unit: 'Jrg' },
  { name: 'Bomber 25L', log: null, unit: '' },
  { name: 'Handsoap Jerigen', log: 'Hand Soap Jerigen', unit: 'Jrg' },
  { name: 'Karbol Jerigen', log: 'Karbol Jerigen', unit: 'Jrg' },
  { name: 'Floor Cleaner Jerigen', log: 'Pembersih Lantai Jerigen', unit: 'Jrg' },
  { name: 'Sanitizer', log: 'Hand Sanitizer 5 liter', unit: 'Jrg' },
  { name: 'Fk 50', log: 'FK50', unit: 'Ball' },
  { name: 'Fk 50/Pcs', log: null, unit: '' },
  { name: 'Fk 400/Pcs', log: null, unit: '' },
  { name: 'FK 400/Ball', log: 'Fk400', unit: 'Ball' },
  { name: 'Fk 1000', log: 'Fk1000', unit: 'Dus' },
  { name: 'Palem dwl Botol', log: 'DWL Palem botol/dus', unit: 'Dus' },
  { name: 'Bomber Botol', log: null, unit: '' },
  { name: 'Handsoap Botol', log: 'Hand Soap botol/dus', unit: 'Dus' },
  { name: 'Karbol Botol', log: 'Karbol botol/dus', unit: 'Dus' },
  { name: 'FloorCleaner Botol', log: 'Pembersih Lantai botol/dus', unit: 'Dus' },
  { name: 'CleanUp Botol', log: null, unit: '' },
  { name: 'Softener Botol', log: null, unit: '' },
  { name: 'Cleanup Jerigen', log: 'Clean Up Jerigen', unit: 'Jrg' },
  { name: 'Softener Jerigen', log: 'Softener Jerigen', unit: 'Jrg' },
  { name: 'Jelly 130gr', log: 'Jelly 130gr', unit: 'Ball' },
  { name: 'Jelly 140gr', log: 'Jelly Cream 140gr', unit: 'Ball' },
  { name: 'Cream Jeruk', log: 'Cream Jeruk JN 20', unit: 'Dus' },
  { name: 'Palem Putih', log: 'Cream Palem Putih PP500', unit: 'Dus' },
  // Ambigu: "BS Powder 60k" di Log belum jelas merujuk ke baris ini
  // atau "Bs Powder Karung"; dibiarkan kosong sampai gudang memastikan.
  { name: 'Bs powder 1kg', log: null, unit: '' },
  { name: 'Bs Powder Karung', log: null, unit: '' },
  // Ambigu: kemungkinan "Jelly Pink Toples", belum pasti.
  { name: 'Jelly Toples', log: null, unit: '' },
  { name: 'Jelly Non Parfum', log: null, unit: '' },
  { name: 'Masker', log: null, unit: '' },
  { name: 'Hairnet', log: null, unit: '' },
  { name: 'Sarung Tangan', log: null, unit: '' },
  { name: 'Spons', log: null, unit: '' },
  { name: 'Jelly Jerigen (bibit)', log: null, unit: '' },
  { name: 'Powder A8P', log: null, unit: '' },
];

// Warna latar tiap grup tanggal, bergiliran supaya tiap tanggal
// gampang dibedakan (perusahaan juga memakai warna berbeda per
// tanggal opname). Urutan mengikuti tab Juli 2026.
const GROUP_COLORS = [
  { red: 0.85098039, green: 0.91764706, blue: 0.82745098 }, // hijau #d9ead3
  { red: 0.63529412, green: 0.76862745, blue: 0.78823529 }, // teal #a2c4c9
  { red: 0.8, green: 0.75294118, blue: 0.85098039 }, // ungu #ccc0d9
  { red: 1, green: 0.94901961, blue: 0.8 }, // kuning #fff2cc
  { red: 0.81176471, green: 0.88627451, blue: 0.95294118 }, // biru #cfe2f3
];

const GROUP_WIDTH = 9; // kolom per grup tanggal
const FIRST_DATA_ROW = 5;
const LAST_DATA_ROW = FIRST_DATA_ROW + MONTHLY_ROWS.length - 1; // 40

// Rumus snapshot stok akhir tanggal (y-m-d) untuk satu produk di satu
// lokasi: total Masuk dikurangi total Keluar di Log sampai tanggal
// itu. Locale sheet id_ID, pemisah `;`. Nama produk ditulis harfiah
// karena nama di tab bulanan berbeda dari nama di Log.
function stockFormula(logName: string, y: number, m: number, d: number, location: string): string {
  const date = `DATE(${y};${m};${d})`;
  const base =
    `SUMIFS('Log Transaksi'!$F:$F;'Log Transaksi'!$C:$C;"${logName}";` +
    `'Log Transaksi'!$I:$I;"<="&${date};'Log Transaksi'!$E:$E;`;
  return `=${base}"Masuk";'Log Transaksi'!$D:$D;"${location}")-${base}"Keluar";'Log Transaksi'!$D:$D;"${location}")`;
}

// Rumus kolom Satuan: "-" kalau stoknya 0 (konvensi tab asli),
// kalau tidak, singkatan satuan produk. unitCell misal "C5".
function satuanFormula(unitCell: string, unit: string): string {
  return `=IF(${unitCell}=0;"-";"${unit}")`;
}

// Buat tab bulanan untuk bulan yang diminta sebagai skeleton: header
// baris 4 (No, Nama Item) + 36 baris produk, tanpa grup tanggal.
// Kalau tab sudah ada, tidak dibuat lagi (created: false). Grup
// tanggal ditambahkan nanti oleh ensureDateGroup saat ada pergerakan.
export async function createMonthlyTab(
  env: SheetsEnv,
  year: number,
  month: number,
): Promise<{ created: boolean; title: string }> {
  const title = monthTitle(year, month);
  const titles = await getSheetTitles(env);
  if (titles.includes(title)) return { created: false, title };

  const res = await batchUpdateSheets(env, [
    { addSheet: { properties: { title } } },
  ]);
  const sheetId = res.replies?.[0]?.addSheet?.properties?.sheetId;
  if (typeof sheetId !== 'number') {
    throw new Error('Gagal membuat tab bulanan di spreadsheet');
  }

  const values: (string | number)[][] = [['No', 'Nama Item']];
  MONTHLY_ROWS.forEach((p, i) => {
    values.push([i + 1, p.name]);
  });
  await updateValues(
    env,
    `'${title}'!A4:B${LAST_DATA_ROW}`,
    values,
    'USER_ENTERED',
  );

  const border = { style: 'SOLID' };
  const borders = { top: border, bottom: border, left: border, right: border };
  await batchUpdateSheets(env, [
    // Baris header (No, Nama Item): tebal, tengah, border.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 2 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 11 }, borders } },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat,borders)',
      },
    },
    // Baris produk: border di semua sel, kolom No rata tengah.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: LAST_DATA_ROW, startColumnIndex: 0, endColumnIndex: 2 },
        cell: { userEnteredFormat: { borders } },
        fields: 'userEnteredFormat(borders)',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: LAST_DATA_ROW, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
        fields: 'userEnteredFormat(horizontalAlignment)',
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 4, frozenColumnCount: 2 } },
        fields: 'gridProperties(frozenRowCount,frozenColumnCount)',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 40 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 230 },
        fields: 'pixelSize',
      },
    },
  ]);

  return { created: true, title };
}

// Tambahkan grup kolom untuk satu tanggal (YYYY-MM-DD, WIB) ke tab
// bulanan, kalau grup itu belum ada. Idempotent: kalau tanggalnya
// sudah ada, tidak menulis apa pun (added: false). Kalau tab
// bulannya belum ada, dibuat dulu sebagai skeleton.
export async function ensureDateGroup(
  env: SheetsEnv,
  dateWib: string,
): Promise<{ added: boolean; title: string; date: string }> {
  const [year, month, day] = dateWib.split('-').map(Number);
  const title = monthTitle(year, month);
  const label = dateTitle(dateWib);

  let sheetId = await getSheetId(env, title);
  if (sheetId === null) {
    await createMonthlyTab(env, year, month);
    sheetId = await getSheetId(env, title);
  }
  if (sheetId === null) {
    throw new Error(`Tab bulanan ${title} tidak ditemukan setelah dibuat`);
  }

  // Baris 1 hanya berisi header tanggal grup; jumlah sel terisi =
  // jumlah grup yang sudah ada.
  const row1 = await readRange(env, `'${title}'!A1:ZZ1`);
  const headers = (row1[0] ?? []).filter((v) => v !== '');
  if (headers.includes(label)) return { added: false, title, date: label };

  const groupIndex = headers.length;
  const color = GROUP_COLORS[groupIndex % GROUP_COLORS.length];
  const startCol = 3 + groupIndex * GROUP_WIDTH; // 1-based
  const startCol0 = startCol - 1; // 0-based
  const endColLetter = colLetter(startCol + GROUP_WIDTH - 1);
  const locs = ['Gudang Klinik', 'Gudang Kantor', 'Kantor'];

  const values: (string | number)[][] = [];
  values.push([label, '', '', '', '', '', '', '', '']);
  values.push(['', '', '', '', '', '', '', '', '']);
  values.push(['Gudang Klinik', '', 'Gudang Kantor', '', 'Kantor', '', 'Total Barang', '', '']);
  values.push(['Unit', 'Satuan', 'Unit', 'Satuan', 'Unit', 'Satuan', 'Jml', 'Unit', 'Keterangan']);
  MONTHLY_ROWS.forEach((p, i) => {
    const row = FIRST_DATA_ROW + i;
    const logName = p.log;
    if (logName === null) {
      values.push(['', '', '', '', '', '', '', '', '']);
      return;
    }
    const unitCols = locs.map((_, k) => colLetter(startCol + k * 2));
    const totalCol = colLetter(startCol + 6);
    const cells: (string | number)[] = [];
    locs.forEach((loc, k) => {
      cells.push(stockFormula(logName, year, month, day, loc));
      cells.push(satuanFormula(`${unitCols[k]}${row}`, p.unit));
    });
    cells.push(`=${unitCols.map((c) => `${c}${row}`).join('+')}`);
    cells.push(satuanFormula(`${totalCol}${row}`, p.unit));
    cells.push('');
    values.push(cells);
  });
  await updateValues(
    env,
    `'${title}'!${colLetter(startCol)}1:${endColLetter}${LAST_DATA_ROW}`,
    values,
    'USER_ENTERED',
  );

  const border = { style: 'SOLID' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const requests: unknown[] = [
    // Gabung header tanggal (9 kolom x 2 baris) dan header lokasi.
    {
      mergeCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: startCol0, endColumnIndex: startCol0 + GROUP_WIDTH },
        mergeType: 'MERGE_ALL',
      },
    },
    ...[0, 2, 4, 6].map((off) => ({
      mergeCells: {
        range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: startCol0 + off, endColumnIndex: startCol0 + off + 2 },
        mergeType: 'MERGE_ALL',
      },
    })),
    // Header tanggal: tebal 16, tengah, warna grup.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: startCol0, endColumnIndex: startCol0 + GROUP_WIDTH },
        cell: { userEnteredFormat: { backgroundColor: color, horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 16 } } },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)',
      },
    },
    // Header lokasi: tebal 11, tengah, warna grup, border.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: startCol0, endColumnIndex: startCol0 + GROUP_WIDTH },
        cell: { userEnteredFormat: { backgroundColor: color, horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 11 }, borders } },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat,borders)',
      },
    },
    // Sub-header Unit/Satuan: warna grup, tengah, border.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: startCol0, endColumnIndex: startCol0 + 6 },
        cell: { userEnteredFormat: { backgroundColor: color, horizontalAlignment: 'CENTER', textFormat: { fontSize: 11 }, borders } },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat,borders)',
      },
    },
    // Sub-header Jml/Unit/Keterangan: tebal.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: startCol0 + 6, endColumnIndex: startCol0 + GROUP_WIDTH },
        cell: { userEnteredFormat: { backgroundColor: color, horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 11 }, borders } },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat,borders)',
      },
    },
    // Baris data: warna grup, tengah, border.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: LAST_DATA_ROW, startColumnIndex: startCol0, endColumnIndex: startCol0 + GROUP_WIDTH },
        cell: { userEnteredFormat: { backgroundColor: color, horizontalAlignment: 'CENTER', borders } },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,borders)',
      },
    },
    // Kolom Jml rata kanan.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: LAST_DATA_ROW, startColumnIndex: startCol0 + 6, endColumnIndex: startCol0 + 7 },
        cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
        fields: 'userEnteredFormat(horizontalAlignment)',
      },
    },
    // Lebar kolom: Unit/Satuan 60, Keterangan 100.
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: startCol0, endIndex: startCol0 + 8 },
        properties: { pixelSize: 60 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: startCol0 + 8, endIndex: startCol0 + 9 },
        properties: { pixelSize: 100 },
        fields: 'pixelSize',
      },
    },
  ];
  await batchUpdateSheets(env, requests);

  return { added: true, title, date: label };
}

// Bangun ulang tab bulanan dari nol: hapus tab lama kalau ada, buat
// skeleton baru, lalu tambah grup tanggal untuk setiap tanggal di
// bulan itu yang punya pergerakan di Log. Dipakai untuk migrasi tab
// lama ke format baru. Mengembalikan tanggal-tanggal yang dibuat
// grupnya (YYYY-MM-DD).
export async function rebuildMonthlyTab(
  env: SheetsEnv,
  year: number,
  month: number,
): Promise<{ title: string; groups: string[] }> {
  const title = monthTitle(year, month);
  const sheetId = await getSheetId(env, title);
  if (sheetId !== null) {
    await batchUpdateSheets(env, [{ deleteSheet: { sheetId } }]);
  }
  await createMonthlyTab(env, year, month);

  const monthKey = `${year}-${pad2(month)}`;
  const logDates = await readRange(env, "'Log Transaksi'!I2:I");
  const dates = [...new Set(logDates.flat())]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d.startsWith(monthKey))
    .sort();
  for (const d of dates) {
    await ensureDateGroup(env, d);
  }
  return { title, groups: dates };
}
