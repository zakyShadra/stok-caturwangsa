// Menu Pemasaran: grafik penjualan offline dari spreadsheet Analisis
// Penjualan Offline 2026. Data dibaca LIVE dari Sheet setiap halaman
// dibuka (Worker meng-cache maksimal 60 detik), jadi perubahan yang
// dibuat analis langsung terlihat di sini tanpa import ulang.
//
// Dua grafik (Bklit UI, sama dengan dashboard koperasi MBG):
// 1. Penjualan vs Kas Masuk per bulan (grouped bar). Kas Masuk bisa
//    lebih kecil dari Penjualan kalau ada pelanggan yang belum bayar.
//    Sheet ini TIDAK punya data pengeluaran, jadi grafik pengeluaran
//    tidak ditampilkan (tidak mengarang angka).
// 2. Produk terlaris, 10 besar berdasarkan nilai rupiah (horizontal
//    bar). Nilai dihitung dari kolom Nilai Penjualan per item, bukan
//    dari jumlah unit (satuannya beda-beda).
// Data ini hanya penjualan OFFLINE (tidak ada Shopee / Tokopedia).
import { useCallback, useEffect, useState } from 'react';
import { BigButton, PageHeader } from '../components/ui';
import { MonthlySalesChart, TopProductsChart } from '../components/MarketingCharts';
import { fetchMarketing, fmtRp } from '../lib/marketing';
import type { MarketingData } from '../lib/marketing';

function formatWib(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export default function Marketing() {
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchMarketing());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data pemasaran.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const partialMonths = (data?.monthly ?? []).filter((m) => m.partial);
  const selisih = (data?.totalPenjualan ?? 0) - (data?.totalKasMasuk ?? 0);

  return (
    <div>
      <PageHeader
        title="Pemasaran"
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="btn-press min-h-[40px] shrink-0 rounded-button border border-hairline bg-surface px-3 text-sm font-bold text-primary-deep disabled:opacity-50"
          >
            {loading ? 'Memuat...' : 'Muat ulang'}
          </button>
        }
      />

      {loading && !data ? (
        <p className="rounded-card border border-hairline bg-surface p-6 text-center text-lg text-ink-muted">
          Memuat data penjualan...
        </p>
      ) : null}

      {error ? (
        <div className="rounded-card border border-hairline bg-surface p-6 text-center shadow-card">
          <p className="text-lg font-bold text-error">{error}</p>
          <p className="mt-2 text-base text-ink-muted">
            Periksa koneksi internet, lalu coba lagi.
          </p>
          <div className="mt-4">
            <BigButton onClick={() => void load()}>Coba lagi</BigButton>
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="space-y-6">
          {/* Ringkasan total: menumpuk di HP (angka Rp31.457.200 tidak
              muat kalau 3 kolom di layar 390px), 3 kolom di desktop. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="entrance rounded-card border border-hairline bg-surface p-4 text-center shadow-card">
              <p className="text-sm font-bold text-ink-muted">Total Penjualan</p>
              <p className="mt-1 text-lg font-bold text-primary-deep">{fmtRp(data.totalPenjualan)}</p>
            </div>
            <div className="entrance rounded-card border border-hairline bg-surface p-4 text-center shadow-card">
              <p className="text-sm font-bold text-ink-muted">Total Kas Masuk</p>
              <p className="mt-1 text-lg font-bold text-primary-deep">{fmtRp(data.totalKasMasuk)}</p>
            </div>
            <div className="entrance rounded-card border border-hairline bg-surface p-4 text-center shadow-card">
              <p className="text-sm font-bold text-ink-muted">Belum Masuk</p>
              <p className="mt-1 text-lg font-bold text-warning-ink">{fmtRp(selisih)}</p>
            </div>
          </div>

          {/* Grafik 1: bulanan */}
          <section className="entrance rounded-card border border-hairline bg-surface p-5 shadow-card">
            <h2 className="text-xl font-bold text-ink">Penjualan vs Kas Masuk per bulan</h2>
            {data.monthly.length === 0 ? (
              <p className="py-8 text-center text-lg text-ink-muted">
                Belum ada data transaksi di Sheet.
              </p>
            ) : (
              <>
                <div className="mt-4">
                  <MonthlySalesChart data={data.monthly} />
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-base">
                    <thead>
                      <tr className="border-b border-hairline text-ink-muted">
                        <th className="py-2 pr-3 font-bold">Bulan</th>
                        <th className="py-2 pr-3 text-right font-bold">Penjualan</th>
                        <th className="py-2 pr-3 text-right font-bold">Kas Masuk</th>
                        <th className="py-2 text-right font-bold">Transaksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthly.map((m) => (
                        <tr key={m.key} className="border-b border-hairline last:border-0">
                          <td className="py-2 pr-3 font-bold">
                            {m.label}
                            {m.partial ? ' *' : ''}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{fmtRp(m.penjualan)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{fmtRp(m.kasMasuk)}</td>
                          <td className="py-2 text-right tabular-nums">{m.transaksi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Grafik 2: top 10 produk */}
          <section className="entrance rounded-card border border-hairline bg-surface p-5 shadow-card">
            <h2 className="text-xl font-bold text-ink">Produk terlaris (10 besar)</h2>
            <p className="mt-1 text-base text-ink-muted">
              Berdasarkan nilai penjualan rupiah, dari seluruh bulan yang ada di Sheet.
            </p>
            {data.topProducts.length === 0 ? (
              <p className="py-8 text-center text-lg text-ink-muted">
                Belum ada data item di Sheet.
              </p>
            ) : (
              <>
                <div className="mt-4">
                  <TopProductsChart data={data.topProducts} />
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-base">
                    <thead>
                      <tr className="border-b border-hairline text-ink-muted">
                        <th className="py-2 pr-3 font-bold">#</th>
                        <th className="py-2 pr-3 font-bold">Produk</th>
                        <th className="py-2 pr-3 text-right font-bold">Nilai</th>
                        <th className="py-2 text-right font-bold">Terjual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((p, i) => (
                        <tr key={p.name} className="border-b border-hairline last:border-0">
                          <td className="py-2 pr-3 font-bold">{i + 1}</td>
                          <td className="py-2 pr-3 font-bold">{p.name}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{fmtRp(p.revenue)}</td>
                          <td className="py-2 text-right tabular-nums">
                            {p.qty.toLocaleString('id-ID')} {p.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Satu baris kecil: catatan bulan parsial + sumber data +
              waktu baca terakhir. Sebelumnya dua baris terpisah
              (footnote di bawah grafik + footer), menumpuk di HP. */}
          <p className="text-center text-sm text-ink-muted">
            {partialMonths.length > 0 ? (
              <>
                * {partialMonths.map((m) => `${m.label} (data tanggal 1-${m.daysCovered} saja)`).join(', ')}:
                bulan belum penuh.{' '}
              </>
            ) : null}
            Data live dari spreadsheet Analisis (hanya penjualan offline).
            Terakhir dibaca: {formatWib(data.updatedAt)} WIB.
          </p>
        </div>
      ) : null}
    </div>
  );
}
