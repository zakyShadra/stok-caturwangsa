// Halaman scan: Barang Masuk atau Barang Keluar.
// Alur: kamera scan -> kartu produk -> jumlah + lokasi + keterangan
// -> Simpan -> layar sukses. Satu layar, satu tugas.
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BigButton, EmptyState, LocationPicker, QtyStepper, StatusBadge } from '../components/ui';

// Scanner di-lazy-load: library ZXing (~500KB) hanya diunduh saat
// halaman scan dibuka, bukan di beranda.
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'));
import { findProductByBarcode } from '../lib/products';
import { useAuth } from '../lib/auth';
import { useStock } from '../lib/store';
import { locationLabel, stockStatus, totalStock } from '../lib/types';
import type { LocationId, MoveType, Product } from '../lib/types';

// Keterangan diambil dari kartu kertas asli.
const NOTES: Record<MoveType, string[]> = {
  masuk: ['Stok Gudang', 'Stok Toko', 'Retur', 'Lainnya'],
  keluar: ['Jualan Magang', 'Jualan Offline', 'Konsinyasi', 'Sample', 'Lainnya'],
};

type Phase =
  | { kind: 'scan' }
  | { kind: 'manual' }
  | { kind: 'found'; product: Product }
  | { kind: 'unknown'; barcode: string }
  | { kind: 'success'; product: Product; qty: number; newTotal: number; txId: string };

export default function Scan() {
  const { type } = useParams<{ type: string }>();
  const moveType: MoveType = type === 'keluar' ? 'keluar' : 'masuk';
  const navigate = useNavigate();
  const { user } = useAuth();
  const { products, recordScan, undoLast } = useStock();

  const [phase, setPhase] = useState<Phase>({ kind: 'scan' });
  const [qty, setQty] = useState(1);
  const [location, setLocation] = useState<LocationId>('klinik');
  const [note, setNote] = useState(NOTES[moveType][0]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const title = moveType === 'masuk' ? 'Barang Masuk' : 'Barang Keluar';
  const accent = moveType === 'masuk' ? 'success' as const : 'warning' as const;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').includes(q),
    );
  }, [products, query]);

  const handleDetected = (barcode: string) => {
    const product = findProductByBarcode(barcode);
    if (product) {
      setQty(1);
      setNote(NOTES[moveType][0]);
      setPhase({ kind: 'found', product });
    } else {
      setPhase({ kind: 'unknown', barcode });
    }
  };

  const pickProduct = (product: Product) => {
    setQty(1);
    setNote(NOTES[moveType][0]);
    setPhase({ kind: 'found', product });
  };

  const handleSave = async () => {
    if (phase.kind !== 'found') return;
    setSaving(true);
    setSaveError(null);
    try {
      const { product, tx } = await recordScan({
        barcode: phase.product.barcode,
        productId: phase.product.id,
        type: moveType,
        qty,
        location,
        note,
        // Petugas = akun yang sedang masuk (dulu selalu tertulis Budi,
        // meski yang scan akun lain, jadi riwayatnya salah nama).
        staff: user?.name ?? 'Staf',
      });
      setPhase({ kind: 'success', product, qty, newTotal: totalStock(product), txId: tx.id });
    } catch {
      setSaveError('Gagal menyimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async (txId: string) => {
    setUndoing(true);
    await undoLast(txId);
    setUndoing(false);
    setPhase({ kind: 'scan' });
  };

  const backToScan = () => setPhase({ kind: 'scan' });

  // Validasi stok keluar: jumlah tidak boleh melebihi stok di lokasi ini.
  const foundProduct = phase.kind === 'found' ? phase.product : null;
  const stockAtLocation = foundProduct ? foundProduct.stock[location] : 0;
  const notEnough = moveType === 'keluar' && foundProduct !== null && qty > stockAtLocation;
  const outOfStock = moveType === 'keluar' && foundProduct !== null && stockAtLocation === 0;

  // Pindah lokasi: angka stok yang tampil ikut berubah, dan jumlah
  // yang dipilih ikut turun (clamp) kalau melebihi stok lokasi baru,
  // supaya tidak langsung kena pesan error validasi.
  const handleLocationChange = (loc: LocationId) => {
    setLocation(loc);
    if (moveType === 'keluar' && foundProduct) {
      const atLoc = foundProduct.stock[loc];
      setQty((q) => Math.min(q, Math.max(1, atLoc)));
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <Link
          to="/"
          className="btn-press flex min-h-[48px] items-center rounded-button border border-hairline bg-surface px-4 text-base font-bold text-ink"
        >
          Kembali
        </Link>
        <h1 className="text-[28px] font-bold leading-tight text-ink">{title}</h1>
      </div>

      {phase.kind === 'scan' ? (
        <div className="entrance">
          <Suspense
            fallback={
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-card border border-hairline bg-ink">
                <p className="text-lg font-semibold text-white">Memuat pemindai...</p>
              </div>
            }
          >
            <BarcodeScanner
              onDetected={handleDetected}
              onManual={() => setPhase({ kind: 'manual' })}
              paused={false}
            />
          </Suspense>
          <p className="mt-4 text-center text-base text-ink-muted">
            {moveType === 'masuk'
              ? 'Scan barcode barang yang baru masuk ke gudang.'
              : 'Scan barcode barang yang keluar dari gudang.'}
          </p>
        </div>
      ) : null}

      {phase.kind === 'manual' ? (
        <div className="entrance">
          <p className="mb-4 text-lg text-ink">
            Cari produk di bawah ini. Dipakai untuk barang yang belum punya
            barcode atau saat kamera tidak bisa dipakai.
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik nama produk..."
            className="mb-4 min-h-[56px] w-full rounded-button border border-hairline bg-surface px-4 text-lg text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            autoFocus
          />
          <div className="space-y-2">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickProduct(p)}
                className="btn-press flex w-full items-center justify-between gap-3 rounded-card border border-hairline bg-surface p-4 text-left shadow-card"
              >
                <span>
                  <span className="block text-lg font-bold text-ink">{p.name}</span>
                  <span className="block text-base text-ink-muted">
                    Stok {totalStock(p)} {p.unit}
                  </span>
                  {p.barcode ? null : (
                    <span className="block text-sm text-ink-subtle">Belum ada barcode</span>
                  )}
                </span>
                <StatusBadge status={stockStatus(p)} />
              </button>
            ))}
            {filtered.length === 0 ? (
              <EmptyState
                title="Produk tidak ditemukan"
                body="Coba kata kunci lain, atau cek ejaan nama produknya."
              />
            ) : null}
          </div>
          <div className="mt-5">
            <BigButton tone="secondary" full onClick={backToScan}>
              Kembali ke Kamera
            </BigButton>
          </div>
        </div>
      ) : null}

      {phase.kind === 'unknown' ? (
        <div className="entrance">
          <EmptyState
            title="Barcode tidak dikenal"
            body={`Barcode ${phase.barcode} belum terdaftar di sistem. Coba scan lagi, atau cari produknya secara manual.`}
            action={
              <div className="flex flex-col gap-3">
                <BigButton tone="secondary" full onClick={() => setPhase({ kind: 'manual' })}>
                  Cari Manual
                </BigButton>
                <BigButton tone="primary" full onClick={backToScan}>
                  Scan Lagi
                </BigButton>
              </div>
            }
          />
        </div>
      ) : null}

      {phase.kind === 'found' && foundProduct ? (
        <div className="entrance space-y-5">
          <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold leading-tight text-ink">{foundProduct.name}</h2>
                <p className="mt-1 text-base text-ink-muted">
                  {foundProduct.barcode ? `Barcode ${foundProduct.barcode}` : 'Belum ada barcode'}
                </p>
              </div>
              <StatusBadge status={stockStatus(foundProduct)} />
            </div>
            {/* Angka yang ditonjolkan adalah stok DI LOKASI YANG
                DIPILIH, karena itulah yang membatasi transaksi. Total
                semua gudang hanya info kecil sekunder. Dulu total yang
                ditonjolkan, jadi user memilih 4 lalu ditolak karena
                stok di Gudang Klinik cuma 3, dan merasa aplikasinya
                tidak sinkron. */}
            <div className="mt-4 flex items-end gap-2 border-t border-hairline pt-4">
              <span className="text-base font-semibold text-ink-muted">Stok di {locationLabel(location)}:</span>
              <span className="text-[32px] font-bold leading-none tabular-nums text-ink">
                {stockAtLocation}
              </span>
              <span className="pb-0.5 text-lg font-semibold text-ink-muted">{foundProduct.unit}</span>
            </div>
            <p className="mt-2 text-base text-ink-muted">
              Total semua gudang: {totalStock(foundProduct)} {foundProduct.unit}
            </p>
            {outOfStock ? (
              <p className="mt-3 rounded-button bg-error/10 p-3 text-center text-base font-bold text-error">
                Stok habis di lokasi ini. Pilih lokasi lain.
              </p>
            ) : null}
          </div>

          <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
            <p className="mb-3 text-center text-lg font-bold text-ink">Berapa jumlahnya?</p>
            <QtyStepper
              value={qty}
              onChange={setQty}
              unit={foundProduct.unit}
              max={moveType === 'keluar' ? stockAtLocation : undefined}
            />
            {notEnough && !outOfStock ? (
              <p className="mt-4 rounded-button bg-error/10 p-3 text-center text-base font-bold text-error">
                Stok di {locationLabel(location)} hanya {stockAtLocation} {foundProduct.unit}.
                Kurangi jumlahnya atau pilih lokasi lain.
              </p>
            ) : null}
          </div>

          <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
            <p className="mb-3 text-lg font-bold text-ink">Lokasi gudang</p>
            <LocationPicker value={location} onChange={handleLocationChange} />
          </div>

          <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
            <p className="mb-3 text-lg font-bold text-ink">Keterangan</p>
            {/* Grid 2 kolom di HP (chip tidak bungkus tidak rata),
                baris natural di layar lebar. Kalau jumlahnya ganjil,
                chip terakhir membentang penuh di HP. */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {NOTES[moveType].map((n, i) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNote(n)}
                  className={`btn-press min-h-[48px] whitespace-nowrap rounded-full border px-3 text-[15px] font-bold transition-colors sm:px-5 sm:text-base ${
                    NOTES[moveType].length % 2 === 1 && i === NOTES[moveType].length - 1
                      ? 'max-sm:col-span-2'
                      : ''
                  } ${
                    note === n
                      ? 'border-primary bg-primary text-white'
                      : 'border-hairline bg-surface text-ink hover:bg-surface-soft'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {saveError ? (
            <p className="rounded-button bg-error/10 p-4 text-center text-base font-bold text-error">
              {saveError}
            </p>
          ) : null}

          <BigButton tone={accent} full onClick={handleSave} disabled={saving || notEnough}>
            {saving ? 'Menyimpan...' : `Simpan ${title}`}
          </BigButton>
          <BigButton tone="secondary" full onClick={backToScan}>
            Batal, Scan Ulang
          </BigButton>
        </div>
      ) : null}

      {phase.kind === 'success' ? (
        <div className="entrance rounded-card border border-hairline bg-surface p-6 text-center shadow-lift">
          <div className="success-pop mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-success">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="mt-5 text-2xl font-bold text-ink">Berhasil dicatat</h2>
          <p className="mt-3 text-xl font-bold text-ink">{phase.product.name}</p>
          <p className="mt-1 text-lg text-ink-muted">
            {moveType === 'masuk' ? 'Masuk' : 'Keluar'} {phase.qty} {phase.product.unit} dari {locationLabel(location)}
          </p>
          <div className="mx-auto mt-5 max-w-xs rounded-button bg-surface-soft p-4">
            <p className="text-base font-semibold text-ink-muted">Stok sekarang</p>
            <p className="text-[40px] font-bold leading-tight tabular-nums text-ink">
              {phase.newTotal} <span className="text-xl">{phase.product.unit}</span>
            </p>
          </div>
          <div className="mt-6 space-y-3">
            <BigButton tone={accent} full onClick={backToScan}>
              Scan Lagi
            </BigButton>
            <BigButton tone="secondary" full onClick={() => navigate('/')}>
              Selesai
            </BigButton>
            <button
              type="button"
              onClick={() => handleUndo(phase.txId)}
              disabled={undoing}
              className="w-full py-2 text-center text-base font-bold text-error underline underline-offset-2 disabled:opacity-50"
            >
              {undoing ? 'Membatalkan...' : 'Batalkan, saya salah input'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
