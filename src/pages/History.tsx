// Riwayat transaksi. Kolomnya meniru kartu kertas asli:
// Tanggal, Keterangan, Masuk, Keluar, Sisa.
import { useMemo, useState } from 'react';
import { EmptyState, PageHeader } from '../components/ui';
import { useStock } from '../lib/store';
import { locationLabel } from '../lib/types';
import type { MoveType } from '../lib/types';

type Filter = 'semua' | MoveType;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'semua', label: 'Semua' },
  { id: 'masuk', label: 'Masuk saja' },
  { id: 'keluar', label: 'Keluar saja' },
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
  const { products, log, loading } = useStock();
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

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter jenis pergerakan">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`btn-press min-h-[48px] rounded-full border px-5 text-base font-bold transition-colors ${
              filter === f.id
                ? 'border-primary bg-primary text-white'
                : 'border-hairline bg-surface text-ink hover:bg-surface-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-lg text-ink-muted">Memuat riwayat...</p>
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
                  <p className="text-base text-ink-muted">
                    {t.note} - {locationLabel(t.location)} - {t.staff}
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
                    {t.type === 'masuk' ? t.qty : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink-muted">Keluar</div>
                  <div className="text-xl font-bold tabular-nums text-warning">
                    {t.type === 'keluar' ? t.qty : '-'}
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
    </div>
  );
}
