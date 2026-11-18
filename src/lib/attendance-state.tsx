// State absensi yang dipakai bersama Beranda, halaman Absensi, dan
// Laporan: catatan absen, jam absen masuk/pulang saya, bukti kerja,
// dan bukti verifikasi (lokasi GPS + selfie) tiap karyawan.
//
// Sumber data: Worker + D1 lewat attendance-api (kalau VITE_API_URL
// diisi), atau localStorage perangkat (mode dev tanpa backend).
// Server adalah sumber kebenaran: setelah tiap perubahan (absen,
// persetujuan, pengajuan, bukti), bulan yang berubah dibaca ulang
// dari server, jadi semua HP melihat data yang sama. Bos melihat
// selfie karyawan dari HP-nya sendiri; Manager melihat laporan dari
// HP-nya. localStorage hanya dipakai sebagai jalur cadangan untuk
// akun tanpa employeeId (Bos, yang tidak absen); praktis tidak
// terpakai karena Bos tidak melihat tombol absen.
//
// Jam kerja fleksibel: tidak ada konsep Telat dan tidak ada jam
// masuk tetap. Status absen hanya Hadir, Izin, atau Cuti.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './auth';
import { attendanceApi } from './attendance-api';
import {
  jakartaDate,
  jakartaTime,
} from './attendance';
import type {
  ApprovalStatus,
  AttendanceRecord,
  CheckVerification,
  EmployeeVerification,
  EvidenceFile,
} from './attendance';

interface AttendanceStateValue {
  records: AttendanceRecord[];
  requestLeave: (employeeId: number, date: string, type: 'Izin' | 'Cuti') => Promise<boolean>;
  setApproval: (employeeId: number, date: string, approval: ApprovalStatus) => Promise<boolean>;
  myCheckIn: string | null;
  myCheckOut: string | null;
  myStatus: 'Hadir' | null;
  checkIn: (v: CheckVerification, employeeId: number | null) => Promise<boolean>;
  checkOut: (v: CheckVerification, employeeId: number | null) => Promise<boolean>;
  evidenceByEmployee: Record<number, EvidenceFile[]>;
  verificationByRecord: Record<string, EmployeeVerification>;
  addEvidence: (employeeId: number, files: File[]) => Promise<boolean>;
  removeEvidence: (employeeId: number, fileId: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  ensureMonth: (monthKey: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AttendanceStateContext = createContext<AttendanceStateValue | null>(null);

// --- Status absen akun tanpa employeeId (Bos) hari ini. ---
// Jalur cadangan di perangkat; praktis tidak terpakai karena Bos
// tidak melihat tombol absen. Kunci per akun, supaya ganti akun di
// perangkat yang sama tidak saling menukar status absen. Hanya
// berlaku untuk tanggal hari ini.
const CHECKIN_KEY_PREFIX = 'sabunpalem-absen-hari-ini';

function checkInKeyFor(email: string | null | undefined): string | null {
  return email ? `${CHECKIN_KEY_PREFIX}-${email}` : null;
}

interface SavedCheckIn {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
}

function loadCheckIn(key: string | null): SavedCheckIn {
  const empty: SavedCheckIn = { date: '', checkIn: null, checkOut: null };
  if (!key) return empty;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as SavedCheckIn;
    if (parsed.date !== jakartaDate(0)) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function saveCheckIn(key: string | null, saved: SavedCheckIn) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    // localStorage penuh / tidak tersedia: abaikan, state memori tetap jalan.
  }
}

function monthRange(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(days).padStart(2, '0')}` };
}

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userEmail = user?.email ?? null;
  // Karyawan yang terikat ke akun yang login (null = Bos, tidak absen).
  const myEmployeeId = user?.employeeId ?? null;

  const [saved, setSaved] = useState<SavedCheckIn>(() => loadCheckIn(checkInKeyFor(userEmail)));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [evidenceByEmployee, setEvidenceByEmployee] = useState<Record<number, EvidenceFile[]>>({});
  const [verificationByRecord, setVerificationByRecord] = useState<Record<string, EmployeeVerification>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedMonths = useRef<Set<string>>(new Set());

  // Hapus kunci lama (satu kunci untuk semua akun) sekali saja.
  useEffect(() => {
    try {
      localStorage.removeItem(CHECKIN_KEY_PREFIX);
    } catch {
      // abaikan
    }
  }, []);

  // Ganti akun = muat ulang status absen milik akun itu. Tanpa ini,
  // status absen akun sebelumnya ikut terbawa ke akun baru.
  useEffect(() => {
    setSaved(loadCheckIn(checkInKeyFor(userEmail)));
  }, [userEmail]);

  const clearError = useCallback(() => setError(null), []);

  // Baca satu bulan dari sumber data, gabungkan ke state (catatan
  // bulan itu diganti seluruhnya dengan data server terbaru).
  const refreshMonth = useCallback(async (monthKey: string) => {
    const { from, to } = monthRange(monthKey);
    const bundle = await attendanceApi.list(from, to);
    setRecords((prev) => {
      const others = prev.filter((r) => !r.date.startsWith(monthKey));
      return [...others, ...bundle.records];
    });
    setVerificationByRecord((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.split(':')[1]?.startsWith(monthKey)) {
          delete next[key];
        }
      }
      return { ...next, ...bundle.verificationByRecord };
    });
    setEvidenceByEmployee((prev) => {
      const next: Record<number, EvidenceFile[]> = {};
      for (const [id, list] of Object.entries(prev)) {
        const kept = list.filter((f) => !f.date?.startsWith(monthKey));
        if (kept.length > 0) next[Number(id)] = kept;
      }
      for (const [id, list] of Object.entries(bundle.evidenceByEmployee)) {
        next[Number(id)] = [...(next[Number(id)] ?? []), ...list];
      }
      return next;
    });
    loadedMonths.current.add(monthKey);
  }, []);

  // Muat satu bulan kalau belum dimuat (dipakai halaman Absensi dan
  // Laporan saat pengguna pindah ke bulan lain).
  const ensureMonth = useCallback(
    async (monthKey: string) => {
      if (loadedMonths.current.has(monthKey)) return;
      try {
        await refreshMonth(monthKey);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat absensi');
      }
    },
    [refreshMonth],
  );

  // Muat bulan berjalan saat aplikasi dibuka.
  useEffect(() => {
    let cancelled = false;
    refreshMonth(jakartaDate(0).slice(0, 7))
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Gagal memuat absensi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshMonth]);

  const refresh = useCallback(async () => {
    try {
      await refreshMonth(jakartaDate(0).slice(0, 7));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat absensi');
    }
  }, [refreshMonth]);

  // Status absen saya hari ini. Akun yang terikat karyawan (Staff,
  // Admin, Manager) membaca dari catatan server (catatan yang
  // ditolak Bos tidak dihitung, jadi tombol absen aktif lagi untuk
  // absen ulang). Akun tanpa employeeId (Bos) membaca dari
  // penyimpanan perangkat.
  const today = jakartaDate(0);
  const myRecord = myEmployeeId !== null
    ? records.find((r) => r.employeeId === myEmployeeId && r.date === today && r.approval !== 'rejected')
    : undefined;
  const myCheckIn = myEmployeeId !== null ? (myRecord?.checkIn ?? null) : saved.checkIn;
  const myCheckOut = myEmployeeId !== null ? (myRecord?.checkOut ?? null) : saved.checkOut;
  const myStatus: 'Hadir' | null = myCheckIn ? 'Hadir' : null;

  const requestLeave = useCallback(
    async (employeeId: number, date: string, type: 'Izin' | 'Cuti'): Promise<boolean> => {
      try {
        await attendanceApi.requestLeave(employeeId, date, type);
        await refreshMonth(date.slice(0, 7));
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal mengirim pengajuan');
        return false;
      }
    },
    [refreshMonth],
  );

  const setApproval = useCallback(
    async (employeeId: number, date: string, approval: ApprovalStatus): Promise<boolean> => {
      try {
        await attendanceApi.setApproval(employeeId, date, approval);
        await refreshMonth(date.slice(0, 7));
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal mengubah persetujuan');
        return false;
      }
    },
    [refreshMonth],
  );

  // Absen masuk. Akun yang terikat karyawan: catat ke server
  // (dengan selfie), lalu baca ulang bulan ini. Tanpa employeeId
  // (Bos): hanya simpan di perangkat.
  const checkIn = useCallback(
    async (v: CheckVerification, employeeId: number | null): Promise<boolean> => {
      const time = v.time || jakartaTime();
      const todayKey = jakartaDate(0);
      if (employeeId === null) {
        const next: SavedCheckIn = { date: todayKey, checkIn: time, checkOut: null };
        setSaved(next);
        saveCheckIn(checkInKeyFor(userEmail), next);
        return true;
      }
      try {
        await attendanceApi.checkIn({ employeeId, date: todayKey, verification: { ...v, time } });
        await refreshMonth(todayKey.slice(0, 7));
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menyimpan absen masuk');
        return false;
      }
    },
    [refreshMonth, userEmail],
  );

  const checkOut = useCallback(
    async (v: CheckVerification, employeeId: number | null): Promise<boolean> => {
      const time = v.time || jakartaTime();
      const todayKey = jakartaDate(0);
      if (employeeId === null) {
        const key = checkInKeyFor(userEmail);
        setSaved((prev) => {
          const next: SavedCheckIn = { ...prev, checkOut: time };
          saveCheckIn(key, next);
          return next;
        });
        return true;
      }
      try {
        await attendanceApi.checkOut({ employeeId, date: todayKey, verification: { ...v, time } });
        await refreshMonth(todayKey.slice(0, 7));
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menyimpan absen pulang');
        return false;
      }
    },
    [refreshMonth, userEmail],
  );

  const addEvidence = useCallback(
    async (employeeId: number, files: File[]): Promise<boolean> => {
      const todayKey = jakartaDate(0);
      try {
        await attendanceApi.addEvidence(employeeId, todayKey, files);
        await refreshMonth(todayKey.slice(0, 7));
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal melampirkan bukti kerja');
        return false;
      }
    },
    [refreshMonth],
  );

  const removeEvidence = useCallback(
    async (employeeId: number, fileId: string): Promise<boolean> => {
      void employeeId;
      const todayKey = jakartaDate(0);
      try {
        await attendanceApi.removeEvidence(employeeId, fileId);
        await refreshMonth(todayKey.slice(0, 7));
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menghapus bukti kerja');
        return false;
      }
    },
    [refreshMonth],
  );

  const value = useMemo(
    () => ({
      records,
      requestLeave,
      setApproval,
      myCheckIn,
      myCheckOut,
      myStatus,
      checkIn,
      checkOut,
      evidenceByEmployee,
      verificationByRecord,
      addEvidence,
      removeEvidence,
      loading,
      error,
      clearError,
      ensureMonth,
      refresh,
    }),
    [
      records,
      requestLeave,
      setApproval,
      myCheckIn,
      myCheckOut,
      myStatus,
      checkIn,
      checkOut,
      evidenceByEmployee,
      verificationByRecord,
      addEvidence,
      removeEvidence,
      loading,
      error,
      clearError,
      ensureMonth,
      refresh,
    ],
  );

  return <AttendanceStateContext.Provider value={value}>{children}</AttendanceStateContext.Provider>;
}

export function useAttendanceState(): AttendanceStateValue {
  const ctx = useContext(AttendanceStateContext);
  if (!ctx) throw new Error('useAttendanceState harus dipakai di dalam AttendanceProvider');
  return ctx;
}
