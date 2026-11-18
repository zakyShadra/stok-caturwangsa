// Data dan logika absensi. Aturan yang dipakai:
// - Masuk setelah pukul 08:15 dihitung Telat.
// - Role: Admin (Zaky), Bos (Pak Yunus), Manager (Ibu Abe), Staff.
//   Bos dan Manager bisa melihat daftar hadir + bukti kerja.
//   Bos TIDAK absen, dia hanya memantau.
//   Staff hanya melihat absensi dan stoknya sendiri.
// - Staf melampirkan bukti kerjaan hari ini saat absen (foto/dokumen).
// Data karyawan dan akun di bawah ini adalah data awal yang dipakai
// sampai backend jadi. Nanti data ini tinggal di database.
export type Role = 'Admin' | 'Bos' | 'Manager' | 'Staff';
export type AttendanceStatus = 'Hadir' | 'Telat' | 'Izin' | 'Cuti';

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
// Budi belum absen, jadi dia muncul di "Belum absen" sampai dia
// absen masuk sendiri. Entri baru ditambahkan saat karyawan absen
// lewat aplikasi, atau saat Admin/Manager menandai Izin/Cuti.
export function getAttendance(): AttendanceRecord[] {
  return [
    { employeeId: 2, date: jakartaDate(0), checkIn: '08:26', checkOut: null, status: 'Telat' },
  ];
}
