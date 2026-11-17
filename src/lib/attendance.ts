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
  { id: 1, name: 'Budi Santoso', division: 'Produksi', position: 'Operator Mesin', phone: '0812-3456-7890', active: true },
  { id: 2, name: 'Siti Rahmawati', division: 'Produksi', position: 'Operator Packing', phone: '0813-2345-6789', active: true },
  { id: 3, name: 'Agus Wijaya', division: 'Produksi', position: 'Supervisor Produksi', phone: '0814-3456-7890', active: true },
  { id: 4, name: 'Dewi Lestari', division: 'Gudang', position: 'Staff Gudang', phone: '0815-4567-8901', active: true },
  { id: 5, name: 'Rudi Hartono', division: 'Gudang', position: 'Kepala Gudang', phone: '0816-5678-9012', active: true },
  { id: 6, name: 'Maya Putri', division: 'Admin', position: 'Staff Administrasi', phone: '0817-6789-0123', active: true },
  { id: 7, name: 'Andi Pratama', division: 'Admin', position: 'Staff Keuangan', phone: '0818-7890-1234', active: true },
  { id: 8, name: 'Rina Kusuma', division: 'Sales', position: 'Sales Representative', phone: '0819-8901-2345', active: true },
  { id: 9, name: 'Joko Susilo', division: 'Sales', position: 'Sales Manager', phone: '0821-9012-3456', active: true },
  { id: 10, name: 'Zaky Shadra', division: 'IT', position: 'IT Staff', phone: '0856-5933-6849', active: true },
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

// Pola absensi yang stabil (bukan acak tiap render): tiap karyawan
// punya pola yang sama di hari yang sama, dihitung dari id + tanggal.
function patternFor(employeeId: number, dayOffset: number): AttendanceRecord {
  const seed = (employeeId * 7 + dayOffset * 3) % 10;
  const date = jakartaDate(dayOffset);
  if (seed === 0) {
    return { employeeId, date, checkIn: null, checkOut: null, status: 'Izin' };
  }
  if (seed === 1) {
    return { employeeId, date, checkIn: null, checkOut: null, status: 'Cuti' };
  }
  const late = seed === 2 || seed === 3;
  const inHour = late ? 8 : 7;
  const inMin = late ? 20 + ((employeeId + dayOffset) % 25) : 30 + ((employeeId * 3 + dayOffset) % 25);
  const checkIn = `${String(inHour).padStart(2, '0')}:${String(inMin).padStart(2, '0')}`;
  const checkOut = `17:${String(5 + ((employeeId + dayOffset) % 20)).padStart(2, '0')}`;
  return {
    employeeId,
    date,
    checkIn,
    checkOut,
    status: late ? 'Telat' : 'Hadir',
  };
}

// Absensi 7 hari terakhir (6 hari lalu sampai hari ini).
// Hari ini: 3 orang belum absen, yang sudah absen belum check-out.
export function getAttendance(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  for (let day = -6; day <= 0; day++) {
    for (const emp of EMPLOYEES) {
      if (day === 0 && (emp.id === 4 || emp.id === 8 || emp.id === 9)) continue;
      const rec = patternFor(emp.id, day);
      if (day === 0 && rec.checkOut) rec.checkOut = null;
      records.push(rec);
    }
  }
  return records;
}

export interface DaySummary {
  date: string;
  hadir: number;
  telat: number;
  izin: number;
}

export function getWeekSummary(records: AttendanceRecord[]): DaySummary[] {
  const days: DaySummary[] = [];
  for (let day = -6; day <= 0; day++) {
    const date = jakartaDate(day);
    const dayRecords = records.filter((r) => r.date === date);
    days.push({
      date,
      hadir: dayRecords.filter((r) => r.status === 'Hadir').length,
      telat: dayRecords.filter((r) => r.status === 'Telat').length,
      izin: dayRecords.filter((r) => r.status === 'Izin' || r.status === 'Cuti').length,
    });
  }
  return days;
}
