// Logika bulanan: hitung stok akhir tiap produk per tanggal, dan buat
// tab bulanan di Sheet. Zona waktu perusahaan adalah WIB; semua tanggal
// memakai Asia/Jakarta.
//
// Tab bulanan: kolom pertama Produk, lalu satu kolom per tanggal,
// lalu kolom Total di ujung. Tiap sel tanggal memakai rumus SUMIFS
// dari tab Log Transaksi (kolom Tanggal), jadi angkanya selalu
// mengikuti log terbaru tanpa perlu ditulis ulang.
import { CATALOG } from './products';
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
  daily: DayStock[];
}

export interface MonthlyData {
  month: string; // YYYY-MM
  days: number;
  products: MonthlyProduct[];
}

// Stok akhir tiap produk per tanggal dalam satu bulan, dihitung dari
// log. Tanggal yang belum lewat mengembalikan null (bukan 0) supaya
// aplikasi menampilkannya kosong, bukan seolah stoknya habis.
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

  const products: MonthlyProduct[] = CATALOG.map((p) => {
    const mine = rows.filter((r) => r.name === p.name);
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
    return { id: p.id, name: p.name, unit: p.unit, daily };
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
function dayFormula(year: number, month: number, day: number, row: number): string {
  const date = `DATE(${year};${month};${day})`;
  const masuk =
    `SUMIFS('Log Transaksi'!$F:$F;'Log Transaksi'!$C:$C;$A${row};` +
    `'Log Transaksi'!$I:$I;"<="&${date};'Log Transaksi'!$E:$E;"Masuk")`;
  const keluar =
    `SUMIFS('Log Transaksi'!$F:$F;'Log Transaksi'!$C:$C;$A${row};` +
    `'Log Transaksi'!$I:$I;"<="&${date};'Log Transaksi'!$E:$E;"Keluar")`;
  return `=IF(${date}>TODAY();"";${masuk}-${keluar})`;
}

// Rumus Total: stok terkini produk itu (semua pergerakan tanpa batas
// tanggal), sama dengan kolom Total di tab Stok Terkini.
function totalFormula(row: number): string {
  return (
    `=SUMIFS('Log Transaksi'!$F:$F;'Log Transaksi'!$C:$C;$A${row};` +
    `'Log Transaksi'!$E:$E;"Masuk")` +
    `-SUMIFS('Log Transaksi'!$F:$F;'Log Transaksi'!$C:$C;$A${row};` +
    `'Log Transaksi'!$E:$E;"Keluar")`
  );
}

// Buat tab bulanan untuk bulan yang diminta. Kalau tab sudah ada,
// tidak dibuat lagi (created: false). Format mengikuti template lama:
// header tebal + isi hijau, border di semua sel, baris header dan
// kolom Produk dibekukan.
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
  const lastRow = CATALOG.length + 1;

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
  const values: (string | number)[][] = [header];
  CATALOG.forEach((p, i) => {
    const row = i + 2;
    const cells: (string | number)[] = [p.name];
    for (let d = 1; d <= days; d++) {
      cells.push(dayFormula(year, month, d, row));
    }
    cells.push(totalFormula(row));
    values.push(cells);
  });
  await updateValues(
    env,
    `'${title}'!A1:${lastColLetter}${lastRow}`,
    values,
    'USER_ENTERED',
  );

  const green = { red: 0.8509804, green: 0.91764706, blue: 0.827451 };
  const border = { style: 'SOLID' };
  const borders = { top: border, bottom: border, left: border, right: border };
  await batchUpdateSheets(env, [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: lastCol },
        cell: { userEnteredFormat: { backgroundColor: green, horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 11 } } },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: lastRow, startColumnIndex: 0, endColumnIndex: lastCol },
        cell: { userEnteredFormat: { borders } },
        fields: 'userEnteredFormat(borders)',
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 1, endColumnIndex: lastCol },
        cell: { userEnteredFormat: { backgroundColor: green, horizontalAlignment: 'RIGHT' } },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment)',
      },
    },
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
  ]);

  return { created: true, title };
}
