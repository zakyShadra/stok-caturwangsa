// Data pemasaran: diambil live dari Worker (/api/marketing), yang
// membaca spreadsheet Analisis Penjualan Offline 2026 setiap request
// (cache Worker maksimal 60 detik). Tidak ada data lokal: kalau
// backend belum tersambung, halaman menampilkan pesan error, bukan
// angka karangan.
import type { MarketingData, MonthlySales, TopProduct } from '../../worker/src/marketing';

export type { MarketingData, MonthlySales, TopProduct };

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

export async function fetchMarketing(): Promise<MarketingData> {
  if (!API_URL) {
    throw new Error('Backend belum tersambung, data pemasaran tidak bisa dimuat.');
  }
  const res = await fetch(`${API_URL}/api/marketing`);
  const data = (await res.json().catch(() => null)) as { error?: string } | MarketingData | null;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Server mengembalikan ${res.status}`;
    throw new Error(message);
  }
  return data as MarketingData;
}

// 6375000 -> "Rp6.375.000"
export function fmtRp(value: number): string {
  return `Rp${value.toLocaleString('id-ID')}`;
}

// 6375000 -> "Rp6,4 jt" (untuk label di dalam batang grafik).
export function fmtRpShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const jt = value / 1_000_000;
    const text = Number.isInteger(jt) ? String(jt) : jt.toFixed(1).replace('.', ',');
    return `Rp${text} jt`;
  }
  if (abs >= 1_000) {
    const rb = value / 1_000;
    const text = Number.isInteger(rb) ? String(rb) : rb.toFixed(1).replace('.', ',');
    return `Rp${text} rb`;
  }
  return fmtRp(value);
}

// Singkatan bulan Indonesia untuk label sumbu grafik.
const SHORT_MONTH: Record<string, string> = {
  Januari: 'Jan', Februari: 'Feb', Maret: 'Mar', April: 'Apr',
  Mei: 'Mei', Juni: 'Jun', Juli: 'Jul', Agustus: 'Agu',
  September: 'Sep', Oktober: 'Okt', November: 'Nov', Desember: 'Des',
};

// "Juni 2026" -> "Jun 26"
export function shortMonthLabel(label: string): string {
  const [month, year] = label.split(' ');
  const short = SHORT_MONTH[month] ?? month;
  const yy = year ? year.slice(2) : '';
  return yy ? `${short} ${yy}` : short;
}
