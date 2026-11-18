// State absensi yang dipakai bersama Beranda, halaman Absensi, dan
// Laporan: catatan absen, jam absen masuk/pulang saya, bukti kerja,
// dan bukti verifikasi (lokasi GPS + selfie) tiap karyawan.
// Penyimpanan sementara (belum ada backend):
// - Status absen saya hari ini: localStorage PER AKUN (kunci memakai
//   email), supaya ganti akun di perangkat yang sama tidak saling
//   menukar status absen. Hanya berlaku untuk tanggal hari ini.
// - Verifikasi selfie: localStorage, supaya tidak hilang kalau
//   halaman di-refresh.
// - Bukti kerja masih di memori saja: filenya belum bisa disimpan.
// Nanti data ini tinggal di Workers + D1, file di-upload ke R2.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './auth';
import {
  LATE_CUTOFF,
  OFFICE_LOCATION,
  getAttendance,
  haversineDistanceMeters,
  jakartaDate,
  jakartaTime,
} from './attendance';
import type { AttendanceRecord, CheckVerification, EvidenceFile } from './attendance';

export interface EmployeeVerification {
  masuk?: CheckVerification;
  pulang?: CheckVerification;
}

interface AttendanceStateValue {
  records: AttendanceRecord[];
  upsertRecord: (rec: AttendanceRecord) => void;
  myCheckIn: string | null;
  myCheckOut: string | null;
  myStatus: 'Hadir' | 'Telat' | null;
  checkIn: (v: CheckVerification, employeeId: number | null) => void;
  checkOut: (v: CheckVerification, employeeId: number | null) => void;
  evidenceByEmployee: Record<number, EvidenceFile[]>;
  verificationByEmployee: Record<number, EmployeeVerification>;
  addEvidence: (employeeId: number, files: File[]) => void;
  removeEvidence: (employeeId: number, fileId: string) => void;
}

const AttendanceStateContext = createContext<AttendanceStateValue | null>(null);

// Thumbnail untuk file gambar yang sudah ada: digambar di canvas
// (latar teal + nama file), jadi Bos/Manager bisa melihat wujudnya
// tanpa file asli. File yang di-upload staf pakai object URL asli.
function makeThumb(label: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#0F6F72';
  ctx.fillRect(0, 0, 320, 200);
  ctx.fillStyle = '#B2EBEC';
  ctx.fillRect(0, 150, 320, 50);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  const words = label.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 22) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((l, i) => {
    ctx.fillText(l, 160, 80 + i * 28);
  });
  ctx.fillStyle = '#0F6F72';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Sabun Palem', 160, 182);
  return canvas.toDataURL('image/png');
}

// Bukti kerja yang sudah dilampirkan karyawan lain hari ini.
function seedEvidence(): Record<number, EvidenceFile[]> {
  return {
    2: [
      { id: 'ev-1', name: 'foto-admin.jpg', kind: 'image', sizeLabel: '1,5 MB', url: makeThumb('foto admin') },
    ],
  };
}

// Verifikasi absen masuk yang sudah tercatat hari ini (Maya, 08:26).
// Koordinatnya di dalam area pabrik, beberapa meter dari kantor.
function seedVerification(): Record<number, EmployeeVerification> {
  const lat = -6.93795;
  const lon = 107.5992;
  return {
    2: {
      masuk: {
        lat,
        lon,
        distanceMeters: Math.round(haversineDistanceMeters(lat, lon, OFFICE_LOCATION.lat, OFFICE_LOCATION.lon)),
        selfieUrl: makeThumb('selfie Maya Putri'),
        selfieName: 'selfie-maya.jpg',
        time: '08:26',
      },
    },
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

let evidenceCounter = 100;

// --- Status absen saya hari ini: satu kunci per akun. ---
// Kunci lama (satu kunci untuk semua akun di perangkat) pernah bikin
// status absen Budi muncul di kartu "Absen saya" akun lain. Kunci
// lama dihapus sekali saat provider pertama dimuat.
const LEGACY_CHECKIN_KEY = 'sabunpalem-absen-hari-ini';

function checkInKeyFor(email: string | null | undefined): string | null {
  return email ? `${LEGACY_CHECKIN_KEY}-${email}` : null;
}

interface SavedCheckIn {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'Hadir' | 'Telat' | null;
}

function loadCheckIn(key: string | null): SavedCheckIn {
  const empty: SavedCheckIn = { date: '', checkIn: null, checkOut: null, status: null };
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

// --- Verifikasi absen (GPS + selfie): disimpan supaya fotonya tetap
// tampil setelah halaman di-refresh. Hanya untuk tanggal hari ini. ---
const VERIF_KEY = 'sabunpalem-verifikasi-hari-ini';

function loadVerification(): Record<number, EmployeeVerification> {
  const seed = seedVerification();
  try {
    const raw = localStorage.getItem(VERIF_KEY);
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as { date?: string; byEmployee?: Record<number, EmployeeVerification> };
    if (parsed.date !== jakartaDate(0)) return seed;
    return { ...seed, ...(parsed.byEmployee ?? {}) };
  } catch {
    return seed;
  }
}

function saveVerification(byEmployee: Record<number, EmployeeVerification>) {
  try {
    localStorage.setItem(VERIF_KEY, JSON.stringify({ date: jakartaDate(0), byEmployee }));
  } catch {
    // localStorage penuh: abaikan, foto di memori tetap tampil sesi ini.
  }
}

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userEmail = user?.email ?? null;

  const [saved, setSaved] = useState<SavedCheckIn>(() => loadCheckIn(checkInKeyFor(userEmail)));
  const [records, setRecords] = useState<AttendanceRecord[]>(() => getAttendance());
  const [evidenceByEmployee, setEvidenceByEmployee] = useState<Record<number, EvidenceFile[]>>(seedEvidence);
  const [verificationByEmployee, setVerificationByEmployee] =
    useState<Record<number, EmployeeVerification>>(loadVerification);

  // Hapus kunci lama (satu kunci untuk semua akun) sekali saja.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_CHECKIN_KEY);
    } catch {
      // abaikan
    }
  }, []);

  // Ganti akun = muat ulang status absen milik akun itu. Tanpa ini,
  // status absen akun sebelumnya ikut terbawa ke akun baru.
  useEffect(() => {
    setSaved(loadCheckIn(checkInKeyFor(userEmail)));
  }, [userEmail]);

  const myCheckIn = saved.checkIn;
  const myCheckOut = saved.checkOut;
  const myStatus = saved.status;

  const upsertRecord = useCallback((rec: AttendanceRecord) => {
    setRecords((prev) => {
      const exists = prev.some((r) => r.employeeId === rec.employeeId && r.date === rec.date);
      if (exists) {
        return prev.map((r) =>
          r.employeeId === rec.employeeId && r.date === rec.date ? { ...r, ...rec } : r,
        );
      }
      return [...prev, rec];
    });
  }, []);

  // Absen masuk: catat jam + status, simpan verifikasi (GPS + selfie),
  // dan tambahkan catatan ke daftar absensi (kalau employeeId ada).
  // Admin/Manager tidak ada di daftar karyawan, jadi employeeId-nya
  // null: jam absen mereka tetap tersimpan untuk akun mereka sendiri.
  const checkIn = useCallback(
    (v: CheckVerification, employeeId: number | null) => {
      const time = jakartaTime();
      const today = jakartaDate(0);
      const status = time > LATE_CUTOFF ? 'Telat' : 'Hadir';
      const next: SavedCheckIn = { date: today, checkIn: time, checkOut: null, status };
      setSaved(next);
      saveCheckIn(checkInKeyFor(userEmail), next);
      if (employeeId !== null) {
        upsertRecord({ employeeId, date: today, checkIn: time, checkOut: null, status });
        setVerificationByEmployee((prev) => {
          const nextV = {
            ...prev,
            [employeeId]: { ...(prev[employeeId] ?? {}), masuk: { ...v, time } },
          };
          saveVerification(nextV);
          return nextV;
        });
      }
    },
    [upsertRecord, userEmail],
  );

  const checkOut = useCallback(
    (v: CheckVerification, employeeId: number | null) => {
      const time = jakartaTime();
      const today = jakartaDate(0);
      const key = checkInKeyFor(userEmail);
      setSaved((prev) => {
        const next: SavedCheckIn = { ...prev, checkOut: time };
        saveCheckIn(key, next);
        return next;
      });
      if (employeeId !== null) {
        setRecords((prev) =>
          prev.map((r) =>
            r.employeeId === employeeId && r.date === today ? { ...r, checkOut: time } : r,
          ),
        );
        setVerificationByEmployee((prev) => {
          const nextV = {
            ...prev,
            [employeeId]: { ...(prev[employeeId] ?? {}), pulang: { ...v, time } },
          };
          saveVerification(nextV);
          return nextV;
        });
      }
    },
    [userEmail],
  );

  const addEvidence = useCallback((employeeId: number, files: File[]) => {
    const next: EvidenceFile[] = files.map((f) => {
      evidenceCounter += 1;
      const isImage = f.type.startsWith('image/');
      return {
        id: `ev-${evidenceCounter}`,
        name: f.name,
        kind: isImage ? 'image' : 'doc',
        sizeLabel: formatSize(f.size),
        url: URL.createObjectURL(f),
      };
    });
    setEvidenceByEmployee((prev) => ({
      ...prev,
      [employeeId]: [...(prev[employeeId] ?? []), ...next],
    }));
  }, []);

  const removeEvidence = useCallback((employeeId: number, fileId: string) => {
    setEvidenceByEmployee((prev) => {
      const list = prev[employeeId] ?? [];
      const target = list.find((f) => f.id === fileId);
      if (target?.url && target.url.startsWith('blob:')) {
        URL.revokeObjectURL(target.url);
      }
      return { ...prev, [employeeId]: list.filter((f) => f.id !== fileId) };
    });
  }, []);

  const value = useMemo(
    () => ({
      records,
      upsertRecord,
      myCheckIn,
      myCheckOut,
      myStatus,
      checkIn,
      checkOut,
      evidenceByEmployee,
      verificationByEmployee,
      addEvidence,
      removeEvidence,
    }),
    [
      records,
      upsertRecord,
      myCheckIn,
      myCheckOut,
      myStatus,
      checkIn,
      checkOut,
      evidenceByEmployee,
      verificationByEmployee,
      addEvidence,
      removeEvidence,
    ],
  );

  return <AttendanceStateContext.Provider value={value}>{children}</AttendanceStateContext.Provider>;
}

export function useAttendanceState(): AttendanceStateValue {
  const ctx = useContext(AttendanceStateContext);
  if (!ctx) throw new Error('useAttendanceState harus dipakai di dalam AttendanceProvider');
  return ctx;
}
