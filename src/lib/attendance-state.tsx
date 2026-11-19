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
// akun tanpa employeeId (Bos dan Manager, yang tidak absen); praktis
// tidak terpakai karena mereka tidak melihat tombol absen.
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
  EvidenceReview,
} from './attendance';

interface AttendanceStateValue {
  records: AttendanceRecord[];
  requestLeave: (employeeId: number, date: string, type: 'Izin' | 'Cuti') => Promise<boolean>;
  setApproval: (employeeId: number, date: string, approval: ApprovalStatus) => Promise<boolean>;
  myCheckIn: string | null;
  myCheckOut: string | null;
  myStatus: 'Hadir' | null;
  // Izin/Cuti saya hari ini (yang belum ditolak), atau null.
  myLeave: 'Izin' | 'Cuti' | null;
  // Mengembalikan null kalau berhasil, atau pesan error asli (dari
  // server atau dari jaringan) kalau gagal, supaya UI bisa
  // menampilkan sebab sebenarnya, bukan teks generik.
  checkIn: (v: CheckVerification, employeeId: number | null) => Promise<string | null>;
  checkOut: (v: CheckVerification, employeeId: number | null) => Promise<string | null>;
  evidenceByEmployee: Record<number, EvidenceFile[]>;
  verificationByRecord: Record<string, EmployeeVerification>;
  // Marker cek bukti kerja oleh Manager (kunci `${employeeId}:${date}`).
  reviewsByRecord: Record<string, EvidenceReview>;
  // Manager menandai bukti kerja sudah dicek (marker, bukan approval).
  reviewEvidence: (employeeId: number, date: string) => Promise<boolean>;
  addEvidence: (employeeId: number, files: File[]) => Promise<boolean>;
  removeEvidence: (employeeId: number, fileId: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  ensureMonth: (monthKey: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AttendanceStateContext = createContext<AttendanceStateValue | null>(null);

// --- Status absen akun tanpa employeeId (Bos/Manager) hari ini. ---
// Jalur cadangan di perangkat; praktis tidak terpakai karena mereka
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
  const userName = user?.name ?? 'Manager';
  // Karyawan yang terikat ke akun yang login (null = Bos/Manager,
  // tidak absen).
  const myEmployeeId = user?.employeeId ?? null;

  const [saved, setSaved] = useState<SavedCheckIn>(() => loadCheckIn(checkInKeyFor(userEmail)));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [evidenceByEmployee, setEvidenceByEmployee] = useState<Record<number, EvidenceFile[]>>({});
  const [verificationByRecord, setVerificationByRecord] = useState<Record<string, EmployeeVerification>>({});
  const [reviewsByRecord, setReviewsByRecord] = useState<Record<string, EvidenceReview>>({});
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
    setReviewsByRecord((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.split(':')[1]?.startsWith(monthKey)) {
          delete next[key];
        }
      }
      return { ...next, ...bundle.reviewsByRecord };
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

  // Muat semua catatan pending (semua tanggal) dan gabungkan ke
  // state. Antrean + banner pending memakai data ini, jadi pending
  // bulan lalu tidak hilang dari pandangan. Tidak pernah throw:
  // antrean yang gagal dimuat tidak boleh merusak pemuatan utama.
  const refreshPending = useCallback(async () => {
    try {
      const bundle = await attendanceApi.listPending();
      setRecords((prev) => {
        const others = prev.filter((r) => r.approval !== 'pending');
        return [...others, ...bundle.records];
      });
      setVerificationByRecord((prev) => ({ ...prev, ...bundle.verificationByRecord }));
      setEvidenceByEmployee((prev) => {
        const next = { ...prev };
        for (const [id, list] of Object.entries(bundle.evidenceByEmployee)) {
          const existing = next[Number(id)] ?? [];
          const ids = new Set(existing.map((f) => f.id));
          next[Number(id)] = [...existing, ...list.filter((f) => !ids.has(f.id))];
        }
        return next;
      });
      setReviewsByRecord((prev) => ({ ...prev, ...bundle.reviewsByRecord }));
    } catch (e) {
      console.error('Gagal memuat antrean pending:', e instanceof Error ? e.message : e);
    }
  }, []);

  // Muat bulan berjalan saat aplikasi dibuka.
  useEffect(() => {
    let cancelled = false;
    refreshMonth(jakartaDate(0).slice(0, 7))
      .then(() => {
        if (!cancelled) return refreshPending();
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Gagal memuat absensi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshMonth, refreshPending]);

  const refresh = useCallback(async () => {
    try {
      await refreshMonth(jakartaDate(0).slice(0, 7));
      await refreshPending();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat absensi');
    }
  }, [refreshMonth, refreshPending]);

  // Status absen saya hari ini. Akun yang terikat karyawan (Staff,
  // Admin) membaca dari catatan server (catatan yang ditolak Bos
  // tidak dihitung, jadi tombol absen aktif lagi untuk absen ulang).
  // Akun tanpa employeeId (Bos/Manager) membaca dari penyimpanan
  // perangkat.
  const today = jakartaDate(0);
  const myRecord = myEmployeeId !== null
    ? records.find((r) => r.employeeId === myEmployeeId && r.date === today && r.approval !== 'rejected')
    : undefined;
  const myCheckIn = myEmployeeId !== null ? (myRecord?.checkIn ?? null) : saved.checkIn;
  const myCheckOut = myEmployeeId !== null ? (myRecord?.checkOut ?? null) : saved.checkOut;
  const myStatus: 'Hadir' | null = myCheckIn ? 'Hadir' : null;
  const myLeave: 'Izin' | 'Cuti' | null =
    myRecord && myRecord.status !== 'Hadir' ? myRecord.status : null;

  const requestLeave = useCallback(
    async (employeeId: number, date: string, type: 'Izin' | 'Cuti'): Promise<boolean> => {
      try {
        await attendanceApi.requestLeave(employeeId, date, type);
        await refreshMonth(date.slice(0, 7));
        await refreshPending();
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal mengirim pengajuan');
        return false;
      }
    },
    [refreshMonth, refreshPending],
  );

  const setApproval = useCallback(
    async (employeeId: number, date: string, approval: ApprovalStatus): Promise<boolean> => {
      try {
        await attendanceApi.setApproval(employeeId, date, approval);
        await refreshMonth(date.slice(0, 7));
        await refreshPending();
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal mengubah persetujuan');
        return false;
      }
    },
    [refreshMonth, refreshPending],
  );

  // Absen masuk. Akun yang terikat karyawan: catat ke server
  // (dengan selfie), lalu baca ulang bulan ini. Tanpa employeeId
  // (Bos/Manager): hanya simpan di perangkat.
  const checkIn = useCallback(
    async (v: CheckVerification, employeeId: number | null): Promise<string | null> => {
      const time = v.time || jakartaTime();
      const todayKey = jakartaDate(0);
      if (employeeId === null) {
        const next: SavedCheckIn = { date: todayKey, checkIn: time, checkOut: null };
        setSaved(next);
        saveCheckIn(checkInKeyFor(userEmail), next);
        return null;
      }
      try {
        await attendanceApi.checkIn({ employeeId, date: todayKey, verification: { ...v, time } });
        await refreshMonth(todayKey.slice(0, 7));
        await refreshPending();
        setError(null);
        return null;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Gagal menyimpan absen masuk';
        setError(message);
        return message;
      }
    },
    [refreshMonth, refreshPending, userEmail],
  );

  const checkOut = useCallback(
    async (v: CheckVerification, employeeId: number | null): Promise<string | null> => {
      const time = v.time || jakartaTime();
      const todayKey = jakartaDate(0);
      if (employeeId === null) {
        const key = checkInKeyFor(userEmail);
        setSaved((prev) => {
          const next: SavedCheckIn = { ...prev, checkOut: time };
          saveCheckIn(key, next);
          return next;
        });
        return null;
      }
      try {
        await attendanceApi.checkOut({ employeeId, date: todayKey, verification: { ...v, time } });
        await refreshMonth(todayKey.slice(0, 7));
        await refreshPending();
        setError(null);
        return null;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Gagal menyimpan absen pulang';
        setError(message);
        return message;
      }
    },
    [refreshMonth, refreshPending, userEmail],
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

  // Manager menandai bukti kerja sudah dicek (marker, bukan approval).
  // Nama penanda diambil dari akun yang login.
  const reviewEvidence = useCallback(
    async (employeeId: number, date: string): Promise<boolean> => {
      try {
        await attendanceApi.reviewEvidence(employeeId, date, userName);
        await refreshMonth(date.slice(0, 7));
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menandai bukti sudah dicek');
        return false;
      }
    },
    [refreshMonth, userName],
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
      myLeave,
      checkIn,
      checkOut,
      evidenceByEmployee,
      verificationByRecord,
      reviewsByRecord,
      reviewEvidence,
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
      myLeave,
      checkIn,
      checkOut,
      evidenceByEmployee,
      verificationByRecord,
      reviewsByRecord,
      reviewEvidence,
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
