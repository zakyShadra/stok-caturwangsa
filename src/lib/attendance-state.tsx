// State absensi hari ini yang dipakai bersama Beranda dan halaman
// Absensi: jam absen masuk/pulang saya, dan bukti kerja yang
// dilampirkan tiap karyawan. Semua masih di memori (belum ada backend).
// Nanti bukti kerja di-upload ke Workers + R2.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LATE_CUTOFF, jakartaTime } from './attendance';
import type { EvidenceFile } from './attendance';

interface AttendanceStateValue {
  myCheckIn: string | null;
  myCheckOut: string | null;
  myStatus: 'Hadir' | 'Telat' | null;
  checkIn: () => void;
  checkOut: () => void;
  evidenceByEmployee: Record<number, EvidenceFile[]>;
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
      { id: 'ev-1', name: 'foto-packing-pagi.jpg', kind: 'image', sizeLabel: '1,2 MB', url: makeThumb('foto packing pagi') },
    ],
    5: [
      { id: 'ev-2', name: 'foto-stok-gudang.jpg', kind: 'image', sizeLabel: '980 KB', url: makeThumb('foto stok gudang') },
      { id: 'ev-3', name: 'catatan-barang-masuk.pdf', kind: 'doc', sizeLabel: '210 KB', url: null },
    ],
    6: [
      { id: 'ev-4', name: 'foto-admin.jpg', kind: 'image', sizeLabel: '1,5 MB', url: makeThumb('foto admin') },
    ],
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

let evidenceCounter = 100;

// Status absen hari ini disimpan di localStorage, supaya tidak hilang
// kalau halaman di-refresh. Hanya berlaku untuk tanggal hari ini.
const CHECKIN_KEY = 'sabunpalem-absen-hari-ini';

interface SavedCheckIn {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'Hadir' | 'Telat' | null;
}

function loadCheckIn(): SavedCheckIn {
  const empty: SavedCheckIn = { date: '', checkIn: null, checkOut: null, status: null };
  try {
    const raw = localStorage.getItem(CHECKIN_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as SavedCheckIn;
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (parsed.date !== todayStr) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function saveCheckIn(saved: SavedCheckIn) {
  try {
    localStorage.setItem(CHECKIN_KEY, JSON.stringify(saved));
  } catch {
    // localStorage penuh / tidak tersedia: abaikan, state memori tetap jalan.
  }
}

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<SavedCheckIn>(loadCheckIn);
  const [evidenceByEmployee, setEvidenceByEmployee] = useState<Record<number, EvidenceFile[]>>(seedEvidence);

  const myCheckIn = saved.checkIn;
  const myCheckOut = saved.checkOut;
  const myStatus = saved.status;

  const checkIn = useCallback(() => {
    const time = jakartaTime();
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const next: SavedCheckIn = {
      date: todayStr,
      checkIn: time,
      checkOut: null,
      status: time > LATE_CUTOFF ? 'Telat' : 'Hadir',
    };
    setSaved(next);
    saveCheckIn(next);
  }, []);

  const checkOut = useCallback(() => {
    setSaved((prev) => {
      const next: SavedCheckIn = { ...prev, checkOut: jakartaTime() };
      saveCheckIn(next);
      return next;
    });
  }, []);

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
    () => ({ myCheckIn, myCheckOut, myStatus, checkIn, checkOut, evidenceByEmployee, addEvidence, removeEvidence }),
    [myCheckIn, myCheckOut, myStatus, checkIn, checkOut, evidenceByEmployee, addEvidence, removeEvidence],
  );

  return <AttendanceStateContext.Provider value={value}>{children}</AttendanceStateContext.Provider>;
}

export function useAttendanceState(): AttendanceStateValue {
  const ctx = useContext(AttendanceStateContext);
  if (!ctx) throw new Error('useAttendanceState harus dipakai di dalam AttendanceProvider');
  return ctx;
}
