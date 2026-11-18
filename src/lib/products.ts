// Data produk ASLI dari tab info_produk sheet "SO Detail" perusahaan
// (clone dev: "SO Detail - COPY DEV (Stok Sabun Palem)").
// Kuantitas = hasil stock opname terakhir. Pembagian per lokasi mengikuti
// pola tab Agustus 2026: sebagian besar di Gudang Klinik, sebagian kecil
// di Gudang Kantor, sedikit di Kantor.
import type { LocationId, Product, Transaction } from './types';

interface RawProduct {
  id: string;
  barcode: string | null;
  name: string;
  unit: string;
  total: number;
  minStock: number;
}

const RAW: RawProduct[] = [
  { id: 'bs-powder-60k', barcode: null, name: 'BS Powder 60k', unit: 'bal', total: 115, minStock: 12 },
  { id: 'bomber-matic', barcode: null, name: 'Bomber Matic', unit: 'bal', total: 4, minStock: 10 },
  { id: 'clean-up-dus', barcode: '8993300201074', name: 'Clean Up Dus', unit: 'dus', total: 118, minStock: 12 },
  { id: 'clean-up-jerigen', barcode: '8993300201081', name: 'Clean Up Jerigen', unit: 'jerigen', total: 24, minStock: 5 },
  { id: 'cream-jeruk-jn20', barcode: '8993300103804', name: 'Cream Jeruk JN 20', unit: 'dus', total: 52, minStock: 6 },
  { id: 'cream-palem-putih', barcode: '8993300101206', name: 'Cream Palem Putih PP500', unit: 'dus', total: 38, minStock: 5 },
  { id: 'dwl-bomber', barcode: '8993300200503', name: 'DWL BOMBER', unit: 'jerigen', total: 400, minStock: 40 },
  { id: 'dwl-palem-jerigen', barcode: '8993300200411', name: 'DWL Palem Jerigen', unit: 'jerigen', total: 435, minStock: 45 },
  { id: 'dwl-palem-botol', barcode: '8993300201029', name: 'DWL Palem botol/dus', unit: 'dus', total: 41, minStock: 5 },
  { id: 'fk110', barcode: '8993300200558', name: 'FK110', unit: 'pcs', total: 9, minStock: 10 },
  { id: 'fk50', barcode: '8993300200336', name: 'FK50', unit: 'bal', total: 200, minStock: 20 },
  { id: 'fk1000', barcode: '8993300200374', name: 'Fk1000', unit: 'dus', total: 79, minStock: 8 },
  { id: 'fk400', barcode: '8993300200367', name: 'Fk400', unit: 'bal', total: 228, minStock: 25 },
  { id: 'hand-sanitizer-5l', barcode: '8993300102005', name: 'Hand Sanitizer 5 liter', unit: 'jerigen', total: 20, minStock: 5 },
  { id: 'hand-soap-jerigen', barcode: '8993300200466', name: 'Hand Soap Jerigen', unit: 'jerigen', total: 92, minStock: 10 },
  { id: 'hand-soap-botol', barcode: '8993300201012', name: 'Hand Soap botol/dus', unit: 'dus', total: 96, minStock: 10 },
  { id: 'jelly-130gr', barcode: '8993300110574', name: 'Jelly 130gr', unit: 'bal', total: 669, minStock: 70 },
  { id: 'jelly-cream-140gr', barcode: null, name: 'Jelly Cream 140gr', unit: 'bal', total: 40, minStock: 5 },
  { id: 'jelly-pink-toples', barcode: null, name: 'Jelly Pink Toples', unit: 'toples', total: 184, minStock: 20 },
  { id: 'karbol-jerigen', barcode: '8993300284800', name: 'Karbol Jerigen', unit: 'jerigen', total: 89, minStock: 10 },
  { id: 'karbol-botol', barcode: '8993300201043', name: 'Karbol botol/dus', unit: 'dus', total: 10, minStock: 12 },
  { id: 'pembersih-lantai-jerigen', barcode: '8993300200497', name: 'Pembersih Lantai Jerigen', unit: 'jerigen', total: 219, minStock: 25 },
  { id: 'pembersih-lantai-botol', barcode: '6995320200800', name: 'Pembersih Lantai botol/dus', unit: 'dus', total: 35, minStock: 5 },
  { id: 'softener-jerigen', barcode: '8993300200480', name: 'Softener Jerigen', unit: 'jerigen', total: 30, minStock: 5 },
];

// Bagi total ke 3 lokasi dengan pola 82% / 13% / sisa, supaya jumlahnya
// selalu pas sama total opname (kantor dapat sisa pembulatan).
function splitStock(total: number): Record<LocationId, number> {
  const klinik = Math.round(total * 0.82);
  const gudangKantor = Math.round(total * 0.13);
  const kantor = total - klinik - gudangKantor;
  return { klinik, 'gudang-kantor': gudangKantor, kantor };
}

export const PRODUCTS: Product[] = RAW.map((r) => ({
  id: r.id,
  barcode: r.barcode,
  name: r.name,
  unit: r.unit,
  minStock: r.minStock,
  stock: splitStock(r.total),
}));

export function findProductByBarcode(barcode: string): Product | undefined {
  const clean = barcode.trim();
  return PRODUCTS.find((p) => p.barcode === clean);
}

// Riwayat awal. Keterangan diambil dari kartu kertas asli:
// Jualan Magang, Konsinyasi, Jualan Offline, Stok Gudang, Stok Toko, Sample.
interface RawTx {
  timestamp: string;
  productId: string;
  type: 'masuk' | 'keluar';
  qty: number;
  location: LocationId;
  note: string;
  staff: string;
}

const RAW_TX: RawTx[] = [
  { timestamp: '2026-11-17T09:12:00+07:00', productId: 'jelly-130gr', type: 'keluar', qty: 30, location: 'klinik', note: 'Jualan Magang', staff: 'Budi' },
  { timestamp: '2026-11-17T08:40:00+07:00', productId: 'dwl-palem-jerigen', type: 'keluar', qty: 12, location: 'klinik', note: 'Jualan Offline', staff: 'Budi' },
  { timestamp: '2026-11-16T15:20:00+07:00', productId: 'fk400', type: 'masuk', qty: 50, location: 'klinik', note: 'Stok Gudang', staff: 'Sari' },
  { timestamp: '2026-11-16T11:05:00+07:00', productId: 'clean-up-dus', type: 'keluar', qty: 8, location: 'gudang-kantor', note: 'Konsinyasi', staff: 'Budi' },
  { timestamp: '2026-11-16T09:30:00+07:00', productId: 'jelly-130gr', type: 'keluar', qty: 22, location: 'klinik', note: 'Jualan Magang', staff: 'Budi' },
  { timestamp: '2026-11-15T14:45:00+07:00', productId: 'dwl-bomber', type: 'keluar', qty: 25, location: 'klinik', note: 'Jualan Offline', staff: 'Sari' },
  { timestamp: '2026-11-15T10:15:00+07:00', productId: 'pembersih-lantai-jerigen', type: 'keluar', qty: 10, location: 'klinik', note: 'Konsinyasi', staff: 'Budi' },
  { timestamp: '2026-11-14T16:00:00+07:00', productId: 'hand-soap-jerigen', type: 'masuk', qty: 40, location: 'klinik', note: 'Stok Gudang', staff: 'Sari' },
  { timestamp: '2026-11-14T13:30:00+07:00', productId: 'jelly-pink-toples', type: 'keluar', qty: 15, location: 'kantor', note: 'Sample', staff: 'Budi' },
  { timestamp: '2026-11-14T09:00:00+07:00', productId: 'fk50', type: 'keluar', qty: 20, location: 'gudang-kantor', note: 'Jualan Magang', staff: 'Budi' },
  { timestamp: '2026-11-13T15:10:00+07:00', productId: 'karbol-jerigen', type: 'keluar', qty: 6, location: 'klinik', note: 'Jualan Offline', staff: 'Sari' },
  { timestamp: '2026-11-13T10:40:00+07:00', productId: 'jelly-130gr', type: 'masuk', qty: 100, location: 'klinik', note: 'Stok Toko', staff: 'Sari' },
];

// Hitung kolom Sisa per produk dengan jalan mundur dari stok saat ini,
// supaya angka riwayat konsisten dengan stok yang ditampilkan.
export function buildInitialTransactions(): Transaction[] {
  const byProduct = new Map<string, number>();
  for (const p of PRODUCTS) {
    byProduct.set(p.id, p.stock.klinik + p.stock['gudang-kantor'] + p.stock.kantor);
  }
  const sorted = [...RAW_TX].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return sorted.map((t, i) => {
    const current = byProduct.get(t.productId) ?? 0;
    const stockAfter = current;
    // Mundur satu langkah: sebelum transaksi ini, stoknya adalah
    // stockAfter dikurangi efek transaksi ini (masuk +, keluar -).
    const effect = t.type === 'masuk' ? t.qty : -t.qty;
    byProduct.set(t.productId, current - effect);
    return {
      id: `TX-${String(i + 1).padStart(3, '0')}`,
      timestamp: t.timestamp,
      productId: t.productId,
      type: t.type,
      qty: t.qty,
      location: t.location,
      note: t.note,
      staff: t.staff,
      stockAfter,
    };
  });
}
