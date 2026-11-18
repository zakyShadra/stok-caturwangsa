// Riwayat transaksi. Kolomnya meniru kartu kertas asli:
// Tanggal, Keterangan, Masuk, Keluar, Sisa.
// Tampilan kedua "Per Hari": stok akhir tiap produk per tanggal.
import { useMemo, useState } from 'react';
import { BigButton, EmptyState, PageHeader, SegmentedControl } from '../components/ui';
import MonthlyTable from '../components/MonthlyTable';
import { useStock } from '../lib/store';
import { locationLabel } from '../lib/types';
import type { MoveType } from '../lib/types';

type Filter = 'semua' | MoveType;
type View = 'transaksi' | 'perhari';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'semua', label: 'Semua' },
  { id: 'masuk', label: 'Masuk' },
  { id: 'keluar', label: 'Keluar' },
];

const VIEWS: { id: View; label: string }[] = [
  { id: 'transaksi', label: 'Transaksi' },
  { id: 'perhari', label: 'Per Hari' },
];

// Zona waktu perusahaan: WIB. Dipakai eksplisit supaya jam yang tampil
// benar meski pengaturan zona waktu HP staf berbeda.
const TZ = 'Asia/Jakarta';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

export default function History() {
  const { products, log, loading, logError, refresh } = useStock();
  const [view, setView] = useState<View>('transaksi');
  const [filter, setFilter] = useState<Filter>('semua');

  const nameOf = (productId: string) =>
    products.find((p) => p.id === productId)?.name ?? productId;
  const unitOf = (productId: string) =>
    products.find((p) => p.id === productId)?.unit ?? '';

  const filtered = useMemo(
    () => (filter === 'semua' ? log : log.filter((t) => t.type === filter)),
    [log, filter],
  );

  return (
    <div>
      <PageHeader
        title="Riwayat"
        subtitle="Semua barang yang masuk dan keluar, terbaru di atas."
      />

      <SegmentedControl
        options={VIEWS}
        value={view}
        onChange={setView}
        label="Tampilan riwayat"
      />

      {view === 'perhari' ? (
        <MonthlyTable />
      ) : (
        <>
          <SegmentedControl
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            label="Filter jenis pergerakan"
          />

          {loading ? (
            <p className="py-10 text-center text-lg text-ink-muted">Memuat riwayat...</p>
          ) : logError && log.length === 0 ? (
            <div className="rounded-card border border-hairline bg-surface p-6 text-center shadow-card">
              <p className="text-lg font-bold text-error">{logError}</p>
              <p className="mt-2 text-base text-ink-muted">
                Riwayat tidak ditampilkan sebagai kosong, karena datanya
                belum berhasil dimuat.
              </p>
              <div className="mt-4">
                <BigButton tone="primary" onClick={() => void refresh()}>
                  Coba lagi
                </BigButton>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Belum ada riwayat"
              body="Transaksi akan muncul di sini setelah ada barang yang di-scan masuk atau keluar."
            />
          ) : (
            <div className="space-y-3">
          {filtered.map((t, i) => (
            <article
              key={t.id}
              className="entrance rounded-card border border-hairline bg-surface p-4 shadow-card"
              style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-snug text-ink">{nameOf(t.productId)}</h2>
                  <p className="mt-0.5 text-base text-ink-muted">
                    {formatDate(t.timestamp)} pukul {formatTime(t.timestamp)}
                  </p>
                  {/* Meta dipecah dua baris (keterangan, lalu lokasi dan
                      petugas) supaya tidak ada tanda hubung yang menggantung
                      di ujung baris saat teks bungkus di HP. */}
                  <p className="text-base text-ink-muted">{t.note}</p>
                  <p className="text-base text-ink-muted">
                    {locationLabel(t.location)} · {t.staff}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1.5 text-base font-bold ${
                    t.type === 'masuk' ? 'bg-success/10 text-success-ink' : 'bg-warning/10 text-warning-ink'
                  }`}
                >
                  {t.type === 'masuk' ? 'Masuk' : 'Keluar'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
                <div>
                  <div className="text-sm font-semibold text-ink-muted">Masuk</div>
                  <div className="text-xl font-bold tabular-nums text-success">
                    {t.type === 'masuk' ? t.qty : <span className="text-ink-subtle">0</span>}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink-muted">Keluar</div>
                  <div className="text-xl font-bold tabular-nums text-warning">
                    {t.type === 'keluar' ? t.qty : <span className="text-ink-subtle">0</span>}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink-muted">Sisa</div>
                  <div className="text-xl font-bold tabular-nums text-ink">
                    {t.stockAfter} <span className="text-sm font-semibold">{unitOf(t.productId)}</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
