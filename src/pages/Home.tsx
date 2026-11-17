// Beranda: 3 tombol raksasa, satu tugas per tombol.
// Di bawahnya ringkasan kecil: total produk, menipis, habis.
import { Link } from 'react-router-dom';
import { useStock } from '../lib/store';
import { stockStatus, totalStock } from '../lib/types';

function ArrowInIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
      <path d="M5 21h14" />
    </svg>
  );
}

function ArrowOutIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
      <path d="M5 3h14" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

export default function Home() {
  const { products, loading } = useStock();
  const menipis = products.filter((p) => stockStatus(p) === 'menipis').length;
  const habis = products.filter((p) => stockStatus(p) === 'habis').length;
  const totalUnits = products.reduce((sum, p) => sum + totalStock(p), 0);

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <img src="./logo.png" alt="Logo Sabun Palem" className="h-16 w-16 rounded-card border border-hairline bg-surface object-contain p-1 shadow-card" />
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-ink">Stok Barang</h1>
          <p className="text-base text-ink-muted">PT Catur Wangsa Indah</p>
        </div>
      </div>

      <div className="space-y-4">
        <Link
          to="/scan/masuk"
          className="entrance btn-press flex min-h-[96px] items-center gap-4 rounded-card bg-success p-5 text-white shadow-card"
          style={{ animationDelay: '0ms' }}
        >
          <ArrowInIcon />
          <span>
            <span className="block text-2xl font-bold">Barang Masuk</span>
            <span className="block text-base font-medium text-white/85">Scan barang yang masuk gudang</span>
          </span>
        </Link>

        <Link
          to="/scan/keluar"
          className="entrance btn-press flex min-h-[96px] items-center gap-4 rounded-card bg-warning p-5 text-white shadow-card"
          style={{ animationDelay: '50ms' }}
        >
          <ArrowOutIcon />
          <span>
            <span className="block text-2xl font-bold">Barang Keluar</span>
            <span className="block text-base font-medium text-white/85">Scan barang yang keluar gudang</span>
          </span>
        </Link>

        <Link
          to="/stok"
          className="entrance btn-press flex min-h-[96px] items-center gap-4 rounded-card bg-info p-5 text-white shadow-card"
          style={{ animationDelay: '100ms' }}
        >
          <ListIcon />
          <span>
            <span className="block text-2xl font-bold">Lihat Stok</span>
            <span className="block text-base font-medium text-white/85">Cek jumlah stok semua barang</span>
          </span>
        </Link>
      </div>

      <div
        className="entrance mt-6 grid grid-cols-3 gap-3"
        style={{ animationDelay: '150ms' }}
      >
        <div className="rounded-card border border-hairline bg-surface p-4 text-center shadow-card">
          <div className="text-3xl font-bold tabular-nums text-ink">{loading ? '-' : products.length}</div>
          <div className="mt-1 text-sm font-semibold text-ink-muted">Jenis produk</div>
        </div>
        <div className="rounded-card border border-hairline bg-surface p-4 text-center shadow-card">
          <div className="text-3xl font-bold tabular-nums text-warning">{loading ? '-' : menipis}</div>
          <div className="mt-1 text-sm font-semibold text-ink-muted">Stok menipis</div>
        </div>
        <div className="rounded-card border border-hairline bg-surface p-4 text-center shadow-card">
          <div className="text-3xl font-bold tabular-nums text-error">{loading ? '-' : habis}</div>
          <div className="mt-1 text-sm font-semibold text-ink-muted">Stok habis</div>
        </div>
      </div>

      <p className="mt-6 text-center text-base text-ink-muted">
        Total {loading ? '...' : totalUnits.toLocaleString('id-ID')} barang di gudang.
        Semua barang keluar lewat gerbang gudang, jadi satu scan di sini
        mencatat semua penjualan, online maupun offline.
      </p>
    </div>
  );
}
