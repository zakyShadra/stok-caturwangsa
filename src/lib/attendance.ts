// Data dan logika absensi. Aturan yang dipakai:
// - Masuk setelah pukul 08:15 dihitung Telat.
// - Matriks peran (keputusan Zaky, 18 Nov 2026, menggantikan aturan lama):
//   Admin (Zaky): satu-satunya yang menambah/mengubah/menghapus karyawan.
//     Baca semua, absen sendiri, scan stok. TIDAK menyetujui absensi.
//   Bos (Pak Yunus): menyetujui/menolak absensi + pengajuan Izin/Cuti.
//     Melihat foto selfie absen + bukti kerja + laporan. TIDAK absen
//     sendiri, TIDAK mengelola karyawan.
//   Manager (Ibu Abe): hanya cek laporan tiap karyawan (read-only) +
//     melihat absensi/foto/bukti kerja. Absen sendiri, scan stok.
//     TIDAK mengelola karyawan, TIDAK menyetujui apa pun.
//   Staff: absen masuk/pulang + selfie + upload bukti kerja + lihat
//     riwayat sendiri + mengajukan Izin/Cuti. Scan stok. TIDAK bisa
//     ke halaman Karyawan/Laporan.
// - Persetujuan absensi: tiap catatan absen punya status persetujuan.
//   Check-in baru berstatus pending; Bos menyetujui/menolak. Rekap
//   dan laporan hanya menghitung yang approved; yang rejected tidak
//   masuk hitungan; yang pending ditampilkan terpisah.
// - Staf melampirkan bukti kerjaan hari ini saat absen (foto/dokumen).
// Data karyawan dan akun di bawah ini adalah data awal yang dipakai
// sampai backend jadi. Nanti data ini tinggal di database.
export type Role = 'Admin' | 'Bos' | 'Manager' | 'Staff';
export type AttendanceStatus = 'Hadir' | 'Telat' | 'Izin' | 'Cuti';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  email: string;
  password: string;
  role: Role;
  name: string;
}

export interface Employee {
  id: number;
  name: string;
  division: string;
  position: string;
  phone: string;
  active: boolean;
}

export interface AttendanceRecord {
  employeeId: number;
  date: string; // YYYY-MM-DD
  checkIn: string | null; // HH:MM
  checkOut: string | null; // HH:MM
  status: AttendanceStatus;
  approval: ApprovalStatus; // pending = menunggu Bos, approved = dihitung, rejected = tidak dihitung
}

// Bukti kerja yang dilampirkan staf saat absen. File disimpan di
// memori (belum ada backend): url adalah object URL untuk file yang
// di-upload, atau data URL thumbnail untuk file yang sudah ada.
// Nanti file di-upload ke Workers + R2.
export interface EvidenceFile {
  id: string;
  name: string;
  kind: 'image' | 'doc';
  sizeLabel: string;
  url: string | null;
}

export const USERS: User[] = [
  { email: 'admin@sabunpalem.co.id', password: 'admin123', role: 'Admin', name: 'Zaky Shadra' },
  { email: 'bos@sabunpalem.co.id', password: 'bos123', role: 'Bos', name: 'Pak Yunus' },
  { email: 'manager@sabunpalem.co.id', password: 'manager123', role: 'Manager', name: 'Ibu Abe' },
  { email: 'staff@sabunpalem.co.id', password: 'staff123', role: 'Staff', name: 'Budi Santoso' },
];

export const EMPLOYEES: Employee[] = [
  { id: 1, name: 'Budi Santoso', division: 'Gudang', position: 'Staff Gudang', phone: '0812-3456-7890', active: true },
  { id: 2, name: 'Maya Putri', division: 'Admin', position: 'Staff Administrasi', phone: '0817-6789-0123', active: true },
];

// Batas jam masuk: lewat dari ini dihitung Telat.
export const LATE_CUTOFF = '08:15';

// Lokasi kantor untuk verifikasi GPS saat absen.
// Koordinat dari Jl. Peta No. 71, Situsaeur, Bojongloa Kidul,
// Bandung 40234 (lokasi magang). Kalau absen dipakai di lokasi
// lain, misal HQ Tasikmalaya, ubah angka lat/lon di sini saja,
// tidak perlu ubah kode lain.
export const OFFICE_LOCATION = {
  lat: -6.93789,
  lon: 107.59914,
  name: 'Jl. Peta No. 71, Bandung',
};

// Jarak maksimum dari kantor supaya absen diterima (meter).
export const GEOFENCE_RADIUS_METERS = 200;

// Jarak dua titik di bumi dalam meter (rumus Haversine).
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Bukti verifikasi satu kali absen: lokasi GPS + foto selfie.
// Disimpan bersama catatan absen, dilihat Bos/Manager di halaman
// Absensi. Selfie disimpan sebagai data URL JPEG yang diperkecil
// (maks 640px), jadi fotonya tetap tampil setelah halaman
// di-refresh. Nanti selfie di-upload ke Workers + R2, koordinat
// dicatat di log.
export interface CheckVerification {
  lat: number;
  lon: number;
  distanceMeters: number; // jarak dari kantor saat absen
  selfieUrl: string | null; // data URL foto selfie (bukan object URL)
  selfieName: string;
  time: string; // HH:MM
}

// Tanggal dalam zona Asia/Jakarta, format YYYY-MM-DD.
export function jakartaDate(offsetDays = 0): string {
  const now = new Date();
  const jakarta = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  jakarta.setDate(jakarta.getDate() + offsetDays);
  const y = jakarta.getFullYear();
  const m = String(jakarta.getMonth() + 1).padStart(2, '0');
  const d = String(jakarta.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateID(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function shortDateID(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

// Jam sekarang (HH:MM) dalam zona Asia/Jakarta.
export function jakartaTime(): string {
  const jakarta = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return `${String(jakarta.getHours()).padStart(2, '0')}:${String(jakarta.getMinutes()).padStart(2, '0')}`;
}

// Absensi hari ini saja. Maya sudah absen (telat, masuk 08:26),
// dan absensinya sudah disetujui supaya rekap tidak kosong.
// Budi belum absen, jadi dia muncul di "Belum absen" sampai dia
// absen masuk sendiri. Entri baru ditambahkan saat karyawan absen
// lewat aplikasi (status pending, menunggu persetujuan Bos), atau
// saat staf mengajukan Izin/Cuti.
export function getAttendance(): AttendanceRecord[] {
  return [
    { employeeId: 2, date: jakartaDate(0), checkIn: '08:26', checkOut: null, status: 'Telat', approval: 'approved' },
  ];
}
