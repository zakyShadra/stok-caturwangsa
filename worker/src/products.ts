// Katalog produk. Salinan dari data aplikasi (src/lib/products.ts),
// sumbernya tab RESUME sheet perusahaan. Worker memakai katalog ini
// untuk validasi server-side: produk harus ada, barcode harus cocok.
// Stok TIDAK disimpan di sini; stok selalu dibaca dari tab Stok Terkini.
export interface CatalogProduct {
  id: string;
  barcode: string | null;
  name: string;
  unit: string;
  minStock: number;
}

export const CATALOG: CatalogProduct[] = [
  { id: 'bs-powder-60k', barcode: null, name: 'BS Powder 60k', unit: 'bal', minStock: 12 },
  { id: 'bomber-matic', barcode: null, name: 'Bomber Matic', unit: 'bal', minStock: 10 },
  { id: 'clean-up-dus', barcode: '8993300201074', name: 'Clean Up Dus', unit: 'dus', minStock: 12 },
  { id: 'clean-up-jerigen', barcode: '8993300201081', name: 'Clean Up Jerigen', unit: 'jerigen', minStock: 5 },
  { id: 'cream-jeruk-jn20', barcode: '8993300103804', name: 'Cream Jeruk JN 20', unit: 'dus', minStock: 6 },
  { id: 'cream-palem-putih', barcode: '8993300101206', name: 'Cream Palem Putih PP500', unit: 'dus', minStock: 5 },
  { id: 'dwl-bomber', barcode: '8993300200503', name: 'DWL BOMBER', unit: 'jerigen', minStock: 40 },
  { id: 'dwl-palem-jerigen', barcode: '8993300200411', name: 'DWL Palem Jerigen', unit: 'jerigen', minStock: 45 },
  { id: 'dwl-palem-botol', barcode: '8993300201029', name: 'DWL Palem botol/dus', unit: 'dus', minStock: 5 },
  { id: 'fk110', barcode: '8993300200558', name: 'FK110', unit: 'pcs', minStock: 10 },
  { id: 'fk50', barcode: '8993300200336', name: 'FK50', unit: 'bal', minStock: 20 },
  { id: 'fk1000', barcode: '8993300200374', name: 'Fk1000', unit: 'dus', minStock: 8 },
  { id: 'fk400', barcode: '8993300200367', name: 'Fk400', unit: 'bal', minStock: 25 },
  { id: 'hand-sanitizer-5l', barcode: '8993300102005', name: 'Hand Sanitizer 5 liter', unit: 'jerigen', minStock: 5 },
  { id: 'hand-soap-jerigen', barcode: '8993300200466', name: 'Hand Soap Jerigen', unit: 'jerigen', minStock: 10 },
  { id: 'hand-soap-botol', barcode: '8993300201012', name: 'Hand Soap botol/dus', unit: 'dus', minStock: 10 },
  { id: 'jelly-130gr', barcode: '8993300110574', name: 'Jelly 130gr', unit: 'bal', minStock: 70 },
  { id: 'jelly-cream-140gr', barcode: null, name: 'Jelly Cream 140gr', unit: 'bal', minStock: 5 },
  { id: 'jelly-pink-toples', barcode: null, name: 'Jelly Pink Toples', unit: 'toples', minStock: 20 },
  { id: 'karbol-jerigen', barcode: '8993300284800', name: 'Karbol Jerigen', unit: 'jerigen', minStock: 10 },
  { id: 'karbol-botol', barcode: '8993300201043', name: 'Karbol botol/dus', unit: 'dus', minStock: 12 },
  { id: 'pembersih-lantai-jerigen', barcode: '8993300200497', name: 'Pembersih Lantai Jerigen', unit: 'jerigen', minStock: 25 },
  { id: 'pembersih-lantai-botol', barcode: '6995320200800', name: 'Pembersih Lantai botol/dus', unit: 'dus', minStock: 5 },
  { id: 'softener-jerigen', barcode: '8993300200480', name: 'Softener Jerigen', unit: 'jerigen', minStock: 5 },
];

export function findById(id: string): CatalogProduct | undefined {
  return CATALOG.find((p) => p.id === id);
}

export function findByName(name: string): CatalogProduct | undefined {
  return CATALOG.find((p) => p.name === name);
}

// Lokasi: id yang dipakai aplikasi <-> label yang tertulis di Sheet.
// Label harus sama persis dengan kriteria rumus SUMIFS di Stok Terkini.
export type LocationId = 'klinik' | 'gudang-kantor' | 'kantor';

export const LOCATION_LABELS: Record<LocationId, string> = {
  klinik: 'Gudang Klinik',
  'gudang-kantor': 'Gudang Kantor',
  kantor: 'Kantor',
};

export const LOCATION_IDS: Record<string, LocationId> = {
  'Gudang Klinik': 'klinik',
  'Gudang Kantor': 'gudang-kantor',
  Kantor: 'kantor',
};

export function isLocationId(value: unknown): value is LocationId {
  return value === 'klinik' || value === 'gudang-kantor' || value === 'kantor';
}
