// Lapisan data. Ada dua sumber data:
//   - Kalau VITE_API_URL diisi (URL Cloudflare Workers), semua data
//     dibaca dari dan ditulis ke Google Sheet lewat Worker.
//   - Kalau tidak diisi, data disimpan di memori selama sesi berjalan
//     (dipakai saat pengembangan lokal tanpa backend).
// Komponen lain tidak perlu tahu sumbernya; bentuk fungsinya sama.
//
// Endpoint Workers:
//   POST /api/scan       -> catat satu pergerakan (append ke Sheet Log)
//   POST /api/scan/undo  -> batalkan transaksi (baris koreksi di Log)
//   GET  /api/stock      -> daftar produk + stok terkini (baca Sheet Stok)
//   GET  /api/log        -> riwayat transaksi (baca Sheet Log)
import { buildInitialTransactions, PRODUCTS } from './products';
import type { LocationId, MoveType, Product, Transaction } from './types';

export interface ScanInput {
  barcode: string | null; // null kalau pilih manual (produk tanpa barcode)
  productId: string;
  type: MoveType;
  qty: number;
  location: LocationId;
  note: string;
  staff: string;
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

// ---- Sumber data jarak jauh (Cloudflare Workers + Google Sheet) ----

async function remoteFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | T | null;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Server mengembalikan ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

const remoteApi = {
  async getStock(): Promise<Product[]> {
    return remoteFetch<Product[]>('/api/stock');
  },

  async getLog(): Promise<Transaction[]> {
    return remoteFetch<Transaction[]>('/api/log');
  },

  async recordScan(input: ScanInput): Promise<{ product: Product; tx: Transaction }> {
    return remoteFetch<{ product: Product; tx: Transaction }>('/api/scan', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async undoLast(txId: string): Promise<void> {
    await remoteFetch<{ ok: boolean }>('/api/scan/undo', {
      method: 'POST',
      body: JSON.stringify({ txId }),
    });
  },
};

// ---- Sumber data lokal (memori, tanpa backend) ----

// Salinan data produk yang bisa diubah selama sesi berjalan.
let productsState: Product[] = PRODUCTS.map((p) => ({
  ...p,
  stock: { ...p.stock },
}));
let logState: Transaction[] = buildInitialTransactions();
let txCounter = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const localApi = {
  // GET /api/stock
  async getStock(): Promise<Product[]> {
    await delay(120);
    return productsState.map((p) => ({ ...p, stock: { ...p.stock } }));
  },

  // GET /api/log
  async getLog(): Promise<Transaction[]> {
    await delay(120);
    return [...logState];
  },

  // POST /api/scan
  async recordScan(input: ScanInput): Promise<{ product: Product; tx: Transaction }> {
    await delay(200);
    const idx = productsState.findIndex((p) => p.id === input.productId);
    if (idx === -1) throw new Error('Produk tidak ditemukan');
    const product = { ...productsState[idx], stock: { ...productsState[idx].stock } };
    const delta = input.type === 'masuk' ? input.qty : -input.qty;
    product.stock[input.location] = Math.max(0, product.stock[input.location] + delta);
    productsState[idx] = product;

    txCounter += 1;
    const total = product.stock.klinik + product.stock['gudang-kantor'] + product.stock.kantor;
    const tx: Transaction = {
      id: `TX-${txCounter}`,
      timestamp: new Date().toISOString(),
      productId: input.productId,
      type: input.type,
      qty: input.qty,
      location: input.location,
      note: input.note,
      staff: input.staff,
      stockAfter: total,
    };
    logState = [tx, ...logState];
    return { product, tx };
  },

  // Undo transaksi terakhir (untuk tombol Batalkan di layar sukses).
  // Versi jarak jauh append baris koreksi ke Sheet Log, bukan hapus
  // baris lama (audit trail tetap utuh). Versi lokal menghapus dari
  // memori karena tidak ada sheet yang perlu dijaga.
  async undoLast(txId: string): Promise<void> {
    await delay(150);
    const tx = logState.find((t) => t.id === txId);
    if (!tx) return;
    const idx = productsState.findIndex((p) => p.id === tx.productId);
    if (idx === -1) return;
    const product = { ...productsState[idx], stock: { ...productsState[idx].stock } };
    const reverse = tx.type === 'masuk' ? -tx.qty : tx.qty;
    product.stock[tx.location] = Math.max(0, product.stock[tx.location] + reverse);
    productsState[idx] = product;
    logState = logState.filter((t) => t.id !== txId);
  },
};

// Pilih sumber data berdasarkan konfigurasi build.
export const api = API_URL ? remoteApi : localApi;
