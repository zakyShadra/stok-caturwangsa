// Grafik pemasaran dengan Bklit UI, komponen yang sama dengan
// dashboard koperasi MBG (BarChart, Bar, Grid, BarXAxis, BarYAxis,
// ChartTooltip). Pola pemakaian disalin dari MbgCharts.tsx di repo
// MBG: dua <Bar> dalam satu <BarChart> = grouped bar; orientation
// "horizontal" + <BarYAxis> = batang mendatar dengan label kategori
// di kiri. Warna mengikuti token aplikasi: Penjualan teal gelap,
// Kas Masuk oranye (pasangan yang sama dengan MBG: teal + oranye).
import { BarChart } from './charts/bar-chart';
import { Bar } from './charts/bar';
import { BarXAxis } from './charts/bar-x-axis';
import { BarYAxis } from './charts/bar-y-axis';
import { Grid } from './charts/grid';
import { ChartTooltip } from './charts/tooltip';
import { fmtRp, fmtRpShort, shortMonthLabel } from '../lib/marketing';
import type { MonthlySales, TopProduct } from '../lib/marketing';

const TEAL_DEEP = '#0F6F72';
const ORANGE = '#D97706';

export interface MonthlyPoint {
  label: string;
  short: string;
  penjualan: number;
  kasMasuk: number;
  [key: string]: unknown;
}

export function MonthlySalesChart({ data }: { data: MonthlySales[] }) {
  const points: MonthlyPoint[] = data.map((m) => ({
    label: m.label,
    short: shortMonthLabel(m.label),
    penjualan: m.penjualan,
    kasMasuk: m.kasMasuk,
  }));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-base font-bold">
        <span className="flex items-center gap-2">
          <i className="inline-block h-3 w-3 rounded-sm" style={{ background: TEAL_DEEP }} />
          Penjualan
        </span>
        <span className="flex items-center gap-2">
          <i className="inline-block h-3 w-3 rounded-sm" style={{ background: ORANGE }} />
          Kas Masuk
        </span>
      </div>
      <BarChart
        data={points}
        xDataKey="short"
        aspectRatio="3 / 2"
        margin={{ top: 16, right: 16, bottom: 32, left: 16 }}
      >
        <Grid />
        <Bar dataKey="penjualan" fill={TEAL_DEEP} />
        <Bar dataKey="kasMasuk" fill={ORANGE} />
        <BarXAxis showAllLabels />
        <ChartTooltip
          rows={(point) => [
            { color: TEAL_DEEP, label: 'Penjualan', value: fmtRp(Number(point.penjualan)) },
            { color: ORANGE, label: 'Kas Masuk', value: fmtRp(Number(point.kasMasuk)) },
          ]}
        />
      </BarChart>
    </div>
  );
}

export interface ProductPoint {
  name: string;
  revenue: number;
  qty: number;
  unit: string;
  [key: string]: unknown;
}

export function TopProductsChart({ data }: { data: TopProduct[] }) {
  const points: ProductPoint[] = data.map((p) => ({
    name: p.name,
    revenue: p.revenue,
    qty: p.qty,
    unit: p.unit,
  }));
  return (
    <BarChart
      data={points}
      xDataKey="name"
      orientation="horizontal"
      aspectRatio="1 / 1"
      margin={{ top: 16, right: 16, bottom: 32, left: 96 }}
    >
      <Grid />
      <Bar
        dataKey="revenue"
        fill={TEAL_DEEP}
        showValue
        valueLabelFormatter={(v) => fmtRpShort(v)}
      />
      <BarYAxis showAllLabels />
      <ChartTooltip
        rows={(point) => [
          { color: TEAL_DEEP, label: 'Nilai penjualan', value: fmtRp(Number(point.revenue)) },
          {
            color: TEAL_DEEP,
            label: 'Jumlah terjual',
            value: `${Number(point.qty).toLocaleString('id-ID')} ${String(point.unit)}`,
          },
        ]}
      />
    </BarChart>
  );
}
