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
  recordScan: (input: ScanInput) => Promise<{ product: Product; tx: Transaction }>;
  undoLast: (txId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const StockContext = createContext<StockContextValue | null>(null);

export function StockProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [log, setLog] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [stock, history] = await Promise.all([api.getStock(), api.getLog()]);
    setProducts(stock);
    setLog(history);
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
    () => ({ products, log, loading, recordScan, undoLast, refresh }),
    [products, log, loading, recordScan, undoLast, refresh],
  );

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
}

export function useStock(): StockContextValue {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error('useStock harus dipakai di dalam StockProvider');
  return ctx;
}
