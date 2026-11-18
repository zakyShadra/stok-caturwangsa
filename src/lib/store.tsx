// State global stok: daftar produk + riwayat, dimuat sekali dari api,
// di-refresh setiap ada scan baru. Komponen tidak panggil api langsung,
// semua lewat hook ini supaya konsisten.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import type { ScanInput } from './api';
import type { Product, Transaction } from './types';

interface StockContextValue {
  products: Product[];
  log: Transaction[];
  loading: boolean;
  // Gagal muat stok dari server (misal internet HP putus sebentar).
  // Selama error, produk lama tetap tampil; halaman menampilkan pesan
  // error + tombol coba lagi, BUKAN angka 0 yang menyesatkan.
  error: string | null;
  // Sama, untuk riwayat transaksi (dipakai halaman Riwayat).
  logError: string | null;
  recordScan: (input: ScanInput) => Promise<{ product: Product; tx: Transaction }>;
  undoLast: (txId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const StockContext = createContext<StockContextValue | null>(null);

export function StockProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [log, setLog] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  // Stok dan riwayat dimuat terpisah (allSettled): kalau salah satu
  // gagal (misal riwayat gagal dibaca), yang berhasil tetap dipakai.
  // Dulu Promise.all dipakai: satu gagal, keduanya dibuang, produk
  // jadi kosong, dan Beranda menampilkan "Total 0 barang" yang salah.
  const refresh = useCallback(async () => {
    const [stockRes, logRes] = await Promise.allSettled([api.getStock(), api.getLog()]);
    if (stockRes.status === 'fulfilled') {
      setProducts(stockRes.value);
      setError(null);
    } else {
      setError('Stok tidak bisa dimuat. Periksa koneksi internet, lalu coba lagi.');
    }
    if (logRes.status === 'fulfilled') {
      setLog(logRes.value);
      setLogError(null);
    } else {
      setLogError('Riwayat tidak bisa dimuat. Periksa koneksi internet, lalu coba lagi.');
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const recordScan = useCallback(async (input: ScanInput) => {
    const result = await api.recordScan(input);
    await refresh();
    return result;
  }, [refresh]);

  const undoLast = useCallback(async (txId: string) => {
    await api.undoLast(txId);
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ products, log, loading, error, logError, recordScan, undoLast, refresh }),
    [products, log, loading, error, logError, recordScan, undoLast, refresh],
  );

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
}

export function useStock(): StockContextValue {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error('useStock harus dipakai di dalam StockProvider');
  return ctx;
}
