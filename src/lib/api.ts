// Lapisan data. Saat ini data disimpan di memori (belum ada backend),
// tapi bentuk fungsinya meniru endpoint Cloudflare Workers yang akan datang,
// supaya nanti tinggal ganti isi fungsi ini dengan fetch, tanpa ubah
// komponen lain.
//
// Endpoint Workers yang direncanakan:
//   POST /api/scan  -> catat satu pergerakan (append ke Sheet Log)
//   GET  /api/stock -> daftar produk + stok terkini (baca Sheet Stok)
//   GET  /api/log   -> riwayat transaksi (baca Sheet Log)
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

// Salinan data produk yang bisa diubah selama sesi berjalan.
// Di versi produksi, data ini tinggal di Google Sheet.
let productsState: Product[] = PRODUCTS.map((p) => ({
  ...p,
  stock: { ...p.stock },
}));
let logState: Transaction[] = buildInitialTransactions();
let txCounter = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const api = {
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
  // Di versi produksi, ini append baris koreksi ke Sheet Log,
  // bukan hapus baris lama (audit trail tetap utuh).
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
