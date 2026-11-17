// Tipe data stok. Satu produk bisa tersebar di 3 lokasi gudang.
export type LocationId = 'klinik' | 'gudang-kantor' | 'kantor';

export const LOCATIONS: { id: LocationId; label: string; short: string }[] = [
  { id: 'klinik', label: 'Gudang Klinik', short: 'Klinik' },
  { id: 'gudang-kantor', label: 'Gudang Kantor', short: 'Gdg Kantor' },
  { id: 'kantor', label: 'Kantor', short: 'Kantor' },
];

export function locationLabel(id: LocationId): string {
  return LOCATIONS.find((l) => l.id === id)?.label ?? id;
}

export interface Product {
  id: string;
  barcode: string | null; // null = 4 produk yang belum punya barcode
  name: string;
  unit: string; // bal, dus, jerigen, pcs, toples
  minStock: number; // batas bawah: di bawah ini status Menipis
  stock: Record<LocationId, number>;
}

export type MoveType = 'masuk' | 'keluar';

export interface Transaction {
  id: string;
  timestamp: string; // ISO
  productId: string;
  type: MoveType;
  qty: number;
  location: LocationId;
  note: string; // keterangan, mirip kolom KETERANGAN di kartu kertas
  staff: string;
  stockAfter: number; // total stok produk ini setelah transaksi
}

export type StockStatus = 'aman' | 'menipis' | 'habis';

export function totalStock(p: Product): number {
  return p.stock.klinik + p.stock['gudang-kantor'] + p.stock.kantor;
}

export function stockStatus(p: Product): StockStatus {
  const total = totalStock(p);
  if (total <= 0) return 'habis';
  if (total <= p.minStock) return 'menipis';
  return 'aman';
}
