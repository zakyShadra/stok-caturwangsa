// Data dan logika absensi. Aturan yang dipakai:
// - Masuk setelah pukul 08:15 dihitung Telat.
// - Role: Admin (Zaky), Bos (Pak Yunus), Manager (Ibu Abe), Staff.
//   Bos dan Manager bisa melihat daftar hadir + bukti kerja.
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

export const USERS: User[] = [
  { email: 'admin@sabunpalem.co.id', password: 'admin123', role: 'Admin', name: 'Zaky Shadra' },
  { email: 'bos@sabunpalem.co.id', password: 'bos123', role: 'Bos', name: 'Pak Yunus' },
  { email: 'manager@sabunpalem.co.id', password: 'manager123', role: 'Manager', name: 'Ibu Abe' },
  { email: 'staff@sabunpalem.co.id', password: 'staff123', role: 'Staff', name: 'Budi Santoso' },
];