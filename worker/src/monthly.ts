// Logika bulanan: hitung stok akhir tiap produk per tanggal, dan buat
// tab bulanan di Sheet. Zona waktu perusahaan adalah WIB; semua tanggal
// memakai Asia/Jakarta.
//
// Tab bulanan berisi 4 blok bertumpuk, tiap blok 1 baris judul +
// 1 baris header + 24 baris produk: (1) TOTAL SEMUA GUDANG,
// (2) GUDANG KLINIK, (3) GUDANG KANTOR, (4) KANTOR. Tiap blok punya
// kolom Produk, lalu satu kolom per tanggal, lalu kolom Total.
// Tiap sel tanggal memakai rumus SUMIFS dari tab Log Transaksi
// (kolom Tanggal, dan kolom Lokasi untuk blok gudang), jadi angkanya
// selalu mengikuti log terbaru tanpa perlu ditulis ulang. Blok Total
// selalu sama dengan jumlah ketiga blok gudang karena semuanya
// dihitung dari log yang sama.
import { CATALOG } from './products';
import type { LocationId } from './products';
import { LOCATION_LABELS } from './products';
import {
  batchUpdateSheets,
  getSheetTitles,
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
// sama dengan jumlah ketiga gudang, sama seperti keempat blok di tab
// bulanan Sheet.
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

// ---- Buat tab bulanan di Sheet ----

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

// Rumus stok akhir hari tanggal d untuk produk di baris r. Tanggal
// yang belum lewat dibiarkan kosong. Locale sheet id_ID, pemisah `;`.
// location: label Lokasi di Log (misal 'Gudang Klinik'); null berarti
// semua lokasi digabung (blok Total).
function dayFormula(
  year: number,
  month: number,
  day: number,
  row: number,
  location: string | null,
): string {
  const date = `DATE(${year};${month};${day})`;
  const loc = location ? `;'Log Transaksi'!$D:$D;"${location}"` : '';
  const masuk =
    `SUMIFS('Log Transaksi'!$F:$F;'Log Transaksi'!$C:$C;$A${row};` +
    `'Log Transaksi'!$I:$I;"<="&${date};'Log Transaksi'!$E:$E;"Masuk"${loc})`;
  const keluar =
    `SUMIFS('Log Transaksi'!$F:$F;'Log Transaksi'!$C:$C;$A${row};` +
    `'Log Transaksi'!$I:$I;"<="&${date};'Log Transaksi'!$E:$E;"Keluar"${loc})`;
  return `=IF(${date}>TODAY();"";${masuk}-${keluar})`;
}

// Rumus Total: stok terkini produk itu (semua pergerakan tanpa batas
// tanggal), sama dengan kolom Total di tab Stok Terkini. location
// membatasi ke satu gudang; null berarti semua lokasi.
function totalFormula(row: number, location: string | null): string {
  const loc = location ? `;'Log Transaksi'!$D:$D;"${location}"` : '';
  return (
    `=SUMIFS('Log Transaksi'!$F:$F;'Log Transaksi'!$C:$C;$A${row};` +
    `'Log Transaksi'!$E:$E;"Masuk"${loc})` +
    `-SUMIFS('Log Transaksi'!$F:$F;'Log Transaksi'!$C:$C;$A${row};` +
    `'Log Transaksi'!$E:$E;"Keluar"${loc})`
  );
}

// Blok-blok tab bulanan. Warna satu keluarga hijau, blok Total paling
// gelap supaya terbaca sebagai ringkasan. Teks putih pada pita gelap,
// teks gelap pada pita terang.
interface MonthlyBlock {
  title: string;
  location: string | null;
  fill: { red: number; green: number; blue: number };
  textWhite: boolean;
}

const MONTHLY_BLOCKS: MonthlyBlock[] = [
  {
    title: 'TOTAL SEMUA GUDANG',
    location: null,
    fill: { red: 0.15294118, green: 0.30588235, blue: 0.0745098 },
    textWhite: true,
  },
  {
    title: 'GUDANG KLINIK',
    location: 'Gudang Klinik',
    fill: { red: 0.21960784, green: 0.4627451, blue: 0.11372549 },
    textWhite: true,
  },
  {
    title: 'GUDANG KANTOR',
    location: 'Gudang Kantor',
    fill: { red: 0.41568627, green: 0.65882353, blue: 0.30980392 },
    textWhite: true,
  },
  {
    title: 'KANTOR',
    location: 'Kantor',
    fill: { red: 0.57647059, green: 0.76862745, blue: 0.49019608 },
    textWhite: false,
  },
];

// Baris dalam satu blok: 1 judul + 1 header + 24 produk.
const ROWS_PER_BLOCK = CATALOG.length + 2;

// Buat tab bulanan untuk bulan yang diminta. Kalau tab sudah ada,
// tidak dibuat lagi (created: false). Format mengikuti tab Stok
// Terkini: header tebal + isi hijau, border di semua sel, baris
// header dan kolom Produk dibekukan. Sel data putih (bukan hijau)
// supaya angka mudah dibaca; warna hijau hanya di baris judul blok
// dan baris header.
export async function createMonthlyTab(
  env: SheetsEnv,
  year: number,
  month: number,
): Promise<{ created: boolean; title: string }> {
  const title = monthTitle(year, month);
  const titles = await getSheetTitles(env);
  if (titles.includes(title)) return { created: false, title };

  const days = daysInMonth(year, month);
  const lastCol = days + 2; // Produk + tanggal + Total
  const lastColLetter = colLetter(lastCol);
  const lastRow = MONTHLY_BLOCKS.length * ROWS_PER_BLOCK;

  const res = await batchUpdateSheets(env, [
    { addSheet: { properties: { title } } },
  ]);
  const sheetId = res.replies?.[0]?.addSheet?.properties?.sheetId;
  if (typeof sheetId !== 'number') {
    throw new Error('Gagal membuat tab bulanan di spreadsheet');
  }

  const header: (string | number)[] = [
    'Produk',
    ...Array.from({ length: days }, (_, i) => i + 1),
    'Total',
  ];
  const values: (string | number)[][] = [];
  MONTHLY_BLOCKS.forEach((block) => {
    values.push([block.title]);
    values.push(header);
    CATALOG.forEach((p) => {
      const row = values.length + 1;
      const cells: (string | number)[] = [p.name];
      for (let d = 1; d <= days; d++) {
        cells.push(dayFormula(year, month, d, row, block.location));
      }
      cells.push(totalFormula(row, block.location));
      values.push(cells);
    });
  });
  await updateValues(
    env,
    `'${title}'!A1:${lastColLetter}${lastRow}`,
    values,
    'USER_ENTERED',
  );

  const green = { red: 0.8509804, green: 0.91764706, blue: 0.827451 };
  const white = { red: 1, green: 1, blue: 1 };
  const border = { style: 'SOLID' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const requests: unknown[] = [
    // Border di semua sel tab.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: lastRow, startColumnIndex: 0, endColumnIndex: lastCol },
        cell: { userEnteredFormat: { borders } },
        fields: 'userEnteredFormat(borders)',
      },
    },
  ];
  MONTHLY_BLOCKS.forEach((block, b) => {
    const sectionRow = b * ROWS_PER_BLOCK;
    const headerRow = sectionRow + 1;
    const dataStart = sectionRow + 2;
    const dataEnd = (b + 1) * ROWS_PER_BLOCK;
    // Pita judul blok selebar tab.
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: sectionRow, endRowIndex: sectionRow + 1, startColumnIndex: 0, endColumnIndex: lastCol },
        cell: {
          userEnteredFormat: {
            backgroundColor: block.fill,
            textFormat: block.textWhite
              ? { bold: true, fontSize: 11, foregroundColor: white }
              : { bold: true, fontSize: 11 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    });
    // Baris header blok: hijau, tebal, tengah.
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: headerRow, endRowIndex: headerRow + 1, startColumnIndex: 0, endColumnIndex: lastCol },
        cell: { userEnteredFormat: { backgroundColor: green, horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 11 } } },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)',
      },
    });
    // Sel data: putih, angka rata kanan.
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 0, endColumnIndex: lastCol },
        cell: { userEnteredFormat: { backgroundColor: white } },
        fields: 'userEnteredFormat(backgroundColor)',
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: dataStart, endRowIndex: dataEnd, startColumnIndex: 1, endColumnIndex: lastCol },
        cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } },
        fields: 'userEnteredFormat(horizontalAlignment)',
      },
    });
  });
  requests.push(
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } },
        fields: 'gridProperties(frozenRowCount,frozenColumnCount)',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 230 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: days + 1 },
        properties: { pixelSize: 64 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: days + 1, endIndex: days + 2 },
        properties: { pixelSize: 90 },
        fields: 'pixelSize',
      },
    },
  );
  await batchUpdateSheets(env, requests);

  return { created: true, title };
}
