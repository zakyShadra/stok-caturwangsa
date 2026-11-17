// Daftar stok: search di atas, kartu per produk.
// Ketuk kartu untuk detail (stok per lokasi + pergerakan terakhir).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader, StatusBadge } from '../components/ui';
import { useStock } from '../lib/store';
import { LOCATIONS, locationLabel, stockStatus, totalStock } from '../lib/types';
import type { Product, StockStatus } from '../lib/types';

type Filter = 'semua' | StockStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'semua', label: 'Semua' },
  { id: 'aman', label: 'Aman' },
  { id: 'menipis', label: 'Menipis' },
  { id: 'habis', label: 'Habis' },
];

export default function Stock() {
  const { products, loading } = useStock();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('semua');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (filter !== 'semua' && stockStatus(p) !== filter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(q);
    });
  }, [products, query, filter]);

  return (
    <div>
      <PageHeader
        title="Lihat Stok"
        subtitle="Stok terkini semua barang di 3 gudang. Ketuk produk untuk melihat detail."
      />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari nama produk atau barcode..."
        className="mb-4 min-h-[56px] w-full rounded-button border border-hairline bg-surface px-4 text-lg text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
      />

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter status stok">
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
        <p className="py-10 text-center text-lg text-ink-muted">Memuat stok...</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Tidak ada produk"
          body="Coba kata kunci lain atau ubah filternya."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((p, i) => (
            <ProductCard
              key={p.id}
              product={p}
              index={i}
              open={openId === p.id}
              onToggle={() => setOpenId(openId === p.id ? null : p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductCard({ product, index, open, onToggle }: { product: Product; index: number; open: boolean; onToggle: () => void }) {
  const { log } = useStock();
  const recent = useMemo(
    () => log.filter((t) => t.productId === product.id).slice(0, 3),
    [log, product.id],
  );
  const status = stockStatus(product);

  return (
    <div
      className="entrance overflow-hidden rounded-card border border-hairline bg-surface shadow-card"
      style={{ animationDelay: `${Math.min(index, 10) * 50}ms` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold text-ink">{product.name}</span>
          <span className="mt-0.5 block text-base text-ink-muted">
            {product.barcode ?? 'Belum ada barcode'}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-2xl font-bold leading-none tabular-nums text-ink">
            {totalStock(product)}
          </span>
          <span className="mt-0.5 block text-base font-semibold text-ink-muted">{product.unit}</span>
        </span>
        <StatusBadge status={status} />
      </button>

      {open ? (
        <div className="border-t border-hairline bg-surface-soft p-4">
          <p className="text-base font-bold text-ink">Stok per lokasi</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {LOCATIONS.map((loc) => (
              <div key={loc.id} className="rounded-button border border-hairline bg-surface p-3 text-center">
                <div className="text-xl font-bold tabular-nums text-ink">{product.stock[loc.id]}</div>
                <div className="mt-0.5 text-sm font-semibold text-ink-muted">{loc.short}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-base text-ink-muted">
            Batas minimum: {product.minStock} {product.unit}. Di bawah itu status jadi Menipis.
          </p>

          {recent.length > 0 ? (
            <>
              <p className="mt-4 text-base font-bold text-ink">Pergerakan terakhir</p>
              <ul className="mt-2 space-y-1">
                {recent.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3 text-base text-ink-muted">
                    <span>
                      {new Date(t.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })}
                      {' - '}{t.note} ({locationLabel(t.location)})
                    </span>
                    <span className={`font-bold tabular-nums ${t.type === 'masuk' ? 'text-success' : 'text-warning'}`}>
                      {t.type === 'masuk' ? '+' : '-'}{t.qty}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              to="/scan/masuk"
              className="btn-press flex min-h-[48px] items-center justify-center rounded-button bg-success text-base font-bold text-white"
            >
              Barang Masuk
            </Link>
            <Link
              to="/scan/keluar"
              className="btn-press flex min-h-[48px] items-center justify-center rounded-button bg-warning text-base font-bold text-white"
            >
              Barang Keluar
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
