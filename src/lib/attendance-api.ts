// Lapisan data absensi, pola yang sama dengan api.ts (stok):
//   - Kalau VITE_API_URL diisi, semua data absensi dibaca dari dan
//     ditulis ke Worker + D1. Server adalah sumber kebenaran: Bos
//     melihat selfie karyawan dari HP-nya sendiri, Manager melihat
//     laporan dari HP-nya.
//   - Kalau tidak diisi, data disimpan di localStorage perangkat
//     (dipakai saat pengembangan lokal tanpa backend).
// Komponen lain tidak perlu tahu sumbernya; bentuk fungsinya sama.
//
// Endpoint Workers (lihat worker/src/attendance.ts):
//   GET    /api/absen?from&to     -> catatan + verifikasi + bukti + reviews
//   POST   /api/absen/check-in    -> absen masuk + selfie
//   POST   /api/absen/check-out   -> absen pulang + selfie
//   POST   /api/absen/approval    -> Bos Setujui/Tolak
//   POST   /api/absen/leave       -> pengajuan Izin/Cuti
//   POST   /api/absen/evidence    -> lampirkan bukti kerja
//   DELETE /api/absen/evidence/:id -> hapus bukti kerja
//   POST   /api/absen/evidence-review -> Manager menandai bukti sudah dicek
//   GET    /api/absen/foto/:key   -> isi foto (dipakai tag img)
//   GET    /api/absen/recap?month -> hitungan per karyawan
import { fileToDataUrl } from './photo';
import { jakartaDate } from './attendance';
import type {
  ApprovalStatus,
  AttendanceRecord,
  CheckVerification,
  EmployeeVerification,
  EvidenceFile,
  EvidenceReview,
} from './attendance';

export interface AttendanceBundle {
  records: AttendanceRecord[];
  // Verifikasi per catatan absen, kunci `${employeeId}:${date}`.
  // Tidak bisa dikunci per karyawan saja: satu karyawan punya
  // selfie berbeda di tanggal berbeda dalam satu bulan.
  verificationByRecord: Record<string, EmployeeVerification>;
  evidenceByEmployee: Record<number, EvidenceFile[]>;
  // Marker cek bukti kerja oleh Manager, kunci `${employeeId}:${date}`.
  reviewsByRecord: Record<string, EvidenceReview>;
}

// Kunci verifikasi untuk satu catatan absen.
export function verificationKey(employeeId: number, date: string): string {
  return `${employeeId}:${date}`;
}

export interface CheckInput {
  employeeId: number;
  date: string; // YYYY-MM-DD
  verification: CheckVerification;
}

export interface AttendanceApi {
  list(from: string, to: string): Promise<AttendanceBundle>;
  checkIn(input: CheckInput): Promise<void>;
  checkOut(input: CheckInput): Promise<void>;
  setApproval(employeeId: number, date: string, approval: ApprovalStatus): Promise<void>;
  requestLeave(employeeId: number, date: string, type: 'Izin' | 'Cuti'): Promise<void>;
  addEvidence(employeeId: number, date: string, files: File[]): Promise<EvidenceFile[]>;
  removeEvidence(employeeId: number, fileId: string): Promise<void>;
  reviewEvidence(employeeId: number, date: string, reviewedBy: string): Promise<void>;
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

// ---- Sumber data jarak jauh (Cloudflare Workers + D1) ----

async function remoteFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | T | null;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Server mengembalikan ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

interface RemoteRecord {
  employeeId: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceRecord['status'];
  approval: ApprovalStatus;
  verification: { masuk: CheckVerification | null; pulang: CheckVerification | null };
  evidence: EvidenceFile[];
}

interface RemoteReview {
  employeeId: number;
  date: string;
  reviewedBy: string;
  reviewedAt: string;
}

const remoteApi: AttendanceApi = {
  async list(from: string, to: string): Promise<AttendanceBundle> {
    const data = await remoteFetch<{ records: RemoteRecord[]; reviews?: RemoteReview[] }>(
      `/api/absen?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    const records: AttendanceRecord[] = [];
    const verificationByRecord: Record<string, EmployeeVerification> = {};
    const evidenceByEmployee: Record<number, EvidenceFile[]> = {};
    const reviewsByRecord: Record<string, EvidenceReview> = {};
    for (const r of data.records) {
      records.push({
        employeeId: r.employeeId,
        date: r.date,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        status: r.status,
        approval: r.approval,
      });
      verificationByRecord[verificationKey(r.employeeId, r.date)] = {
        ...(r.verification.masuk ? { masuk: r.verification.masuk } : {}),
        ...(r.verification.pulang ? { pulang: r.verification.pulang } : {}),
      };
      const dated = r.evidence.map((e) => ({ ...e, date: r.date }));
      evidenceByEmployee[r.employeeId] = [...(evidenceByEmployee[r.employeeId] ?? []), ...dated];
    }
    for (const r of data.reviews ?? []) {
      reviewsByRecord[verificationKey(r.employeeId, r.date)] = {
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt,
      };
    }
    return { records, verificationByRecord, evidenceByEmployee, reviewsByRecord };
  },

  async checkIn(input: CheckInput): Promise<void> {
    const v = input.verification;
    await remoteFetch<{ ok: boolean }>('/api/absen/check-in', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: input.employeeId,
        date: input.date,
        time: v.time,
        lat: v.lat,
        lon: v.lon,
        distanceMeters: v.distanceMeters,
        accuracy: v.accuracyMeters ?? null,
        selfieName: v.selfieName,
        selfieData: v.selfieUrl,
      }),
    });
  },

  async checkOut(input: CheckInput): Promise<void> {
    const v = input.verification;
    await remoteFetch<{ ok: boolean }>('/api/absen/check-out', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: input.employeeId,
        date: input.date,
        time: v.time,
        lat: v.lat,
        lon: v.lon,
        distanceMeters: v.distanceMeters,
        accuracy: v.accuracyMeters ?? null,
        selfieName: v.selfieName,
        selfieData: v.selfieUrl,
      }),
    });
  },

  async setApproval(employeeId: number, date: string, approval: ApprovalStatus): Promise<void> {
    await remoteFetch<{ ok: boolean }>('/api/absen/approval', {
      method: 'POST',
      body: JSON.stringify({ employeeId, date, approval }),
    });
  },

  async requestLeave(employeeId: number, date: string, type: 'Izin' | 'Cuti'): Promise<void> {
    await remoteFetch<{ ok: boolean }>('/api/absen/leave', {
      method: 'POST',
      body: JSON.stringify({ employeeId, date, type }),
    });
  },

  async addEvidence(employeeId: number, date: string, files: File[]): Promise<EvidenceFile[]> {
    const created: EvidenceFile[] = [];
    for (const f of files) {
      const dataUrl = await fileToDataUrl(f);
      if (!dataUrl) throw new Error(`File ${f.name} tidak bisa dibaca`);
      const isImage = f.type.startsWith('image/');
      const item = await remoteFetch<EvidenceFile>('/api/absen/evidence', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          date,
          name: f.name,
          kind: isImage ? 'image' : 'doc',
          sizeLabel: formatSize(f.size),
          data: dataUrl,
        }),
      });
      created.push({ ...item, date });
    }
    return created;
  },

  async removeEvidence(_employeeId: number, fileId: string): Promise<void> {
    await remoteFetch<{ ok: boolean }>(`/api/absen/evidence/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
  },

  async reviewEvidence(employeeId: number, date: string, reviewedBy: string): Promise<void> {
    await remoteFetch<{ ok: boolean }>('/api/absen/evidence-review', {
      method: 'POST',
      body: JSON.stringify({ employeeId, date, reviewedBy }),
    });
  },
};

// ---- Sumber data lokal (localStorage, tanpa backend) ----

const RECORDS_KEY = 'sabunpalem-absensi';
const VERIF_KEY = 'sabunpalem-verifikasi-hari-ini';
const EVIDENCE_KEY = 'sabunpalem-bukti-kerja';
const REVIEWS_KEY = 'sabunpalem-review-bukti';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function loadLocalRecords(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { records?: AttendanceRecord[] };
    const monthStart = `${jakartaDate(0).slice(0, 7)}-01`;
    return (parsed.records ?? []).filter((r) => r.date >= monthStart);
  } catch {
    return [];
  }
}

function saveLocalRecords(records: AttendanceRecord[]) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify({ records }));
  } catch {
    // abaikan, state memori tetap jalan
  }
}

function loadLocalVerification(): Record<number, EmployeeVerification> {
  try {
    const raw = localStorage.getItem(VERIF_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { date?: string; byEmployee?: Record<number, EmployeeVerification> };
    if (parsed.date !== jakartaDate(0)) return {};
    return parsed.byEmployee ?? {};
  } catch {
    return {};
  }
}

function saveLocalVerification(byEmployee: Record<number, EmployeeVerification>) {
  try {
    localStorage.setItem(VERIF_KEY, JSON.stringify({ date: jakartaDate(0), byEmployee }));
  } catch {
    // abaikan
  }
}

function loadLocalEvidence(): Record<number, EvidenceFile[]> {
  try {
    const raw = localStorage.getItem(EVIDENCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { date?: string; byEmployee?: Record<number, EvidenceFile[]> };
    if (parsed.date !== jakartaDate(0)) return {};
    return parsed.byEmployee ?? {};
  } catch {
    return {};
  }
}

function saveLocalEvidence(byEmployee: Record<number, EvidenceFile[]>) {
  try {
    localStorage.setItem(EVIDENCE_KEY, JSON.stringify({ date: jakartaDate(0), byEmployee }));
  } catch {
    // abaikan (localStorage penuh oleh foto: bukti tetap tampil sesi ini)
  }
}

// Marker cek bukti (kunci `${employeeId}:${date}`), tidak dibatasi
// tanggal hari ini: review tanggal lama tetap harus tampil.
function loadLocalReviews(): Record<string, EvidenceReview> {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { reviews?: Record<string, EvidenceReview> };
    return parsed.reviews ?? {};
  } catch {
    return {};
  }
}

function saveLocalReviews(reviews: Record<string, EvidenceReview>) {
  try {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify({ reviews }));
  } catch {
    // abaikan
  }
}

let evidenceCounter = 100;

const localApi: AttendanceApi = {
  async list(from: string, to: string): Promise<AttendanceBundle> {
    const records = loadLocalRecords().filter((r) => r.date >= from && r.date <= to);
    const today = jakartaDate(0);
    const ver = loadLocalVerification();
    const verificationByRecord: Record<string, EmployeeVerification> = {};
    for (const [employeeId, v] of Object.entries(ver)) {
      verificationByRecord[verificationKey(Number(employeeId), today)] = v;
    }
    const allReviews = loadLocalReviews();
    const reviewsByRecord: Record<string, EvidenceReview> = {};
    for (const [key, review] of Object.entries(allReviews)) {
      const date = key.split(':')[1] ?? '';
      if (date >= from && date <= to) reviewsByRecord[key] = review;
    }
    return {
      records,
      verificationByRecord,
      evidenceByEmployee: loadLocalEvidence(),
      reviewsByRecord,
    };
  },

  async checkIn(input: CheckInput): Promise<void> {
    const records = loadLocalRecords();
    const existing = records.find((r) => r.employeeId === input.employeeId && r.date === input.date);
    if (existing && existing.status !== 'Hadir') {
      throw new Error('Tanggal ini sudah ada pengajuan Izin/Cuti');
    }
    if (existing && existing.checkIn !== null && existing.approval !== 'rejected') {
      throw new Error('Sudah absen masuk hari ini');
    }
    const next: AttendanceRecord = {
      employeeId: input.employeeId,
      date: input.date,
      checkIn: input.verification.time,
      checkOut: null,
      status: 'Hadir',
      approval: 'pending',
    };
    const merged = existing
      ? records.map((r) => (r === existing ? next : r))
      : [...records, next];
    saveLocalRecords(merged);
    const ver = loadLocalVerification();
    const nextVer = {
      ...ver,
      [input.employeeId]: { ...(ver[input.employeeId] ?? {}), masuk: input.verification },
    };
    saveLocalVerification(nextVer);
  },

  async checkOut(input: CheckInput): Promise<void> {
    const records = loadLocalRecords();
    const existing = records.find((r) => r.employeeId === input.employeeId && r.date === input.date);
    if (!existing || existing.checkIn === null) {
      throw new Error('Belum absen masuk hari ini');
    }
    if (existing.approval === 'rejected') {
      throw new Error('Absen hari ini ditolak Bos, silakan absen masuk ulang');
    }
    if (existing.checkOut !== null) {
      throw new Error('Sudah absen pulang hari ini');
    }
    saveLocalRecords(
      records.map((r) => (r === existing ? { ...r, checkOut: input.verification.time } : r)),
    );
    const ver = loadLocalVerification();
    const nextVer = {
      ...ver,
      [input.employeeId]: { ...(ver[input.employeeId] ?? {}), pulang: input.verification },
    };
    saveLocalVerification(nextVer);
  },

  async setApproval(employeeId: number, date: string, approval: ApprovalStatus): Promise<void> {
    const records = loadLocalRecords();
    saveLocalRecords(
      records.map((r) => (r.employeeId === employeeId && r.date === date ? { ...r, approval } : r)),
    );
  },

  async requestLeave(employeeId: number, date: string, type: 'Izin' | 'Cuti'): Promise<void> {
    const records = loadLocalRecords();
    if (records.some((r) => r.employeeId === employeeId && r.date === date)) {
      throw new Error('Tanggal ini sudah ada catatan absen');
    }
    saveLocalRecords([
      ...records,
      { employeeId, date, checkIn: null, checkOut: null, status: type, approval: 'pending' },
    ]);
  },

  async addEvidence(employeeId: number, date: string, files: File[]): Promise<EvidenceFile[]> {
    const byEmployee = loadLocalEvidence();
    const created: EvidenceFile[] = [];
    for (const f of files) {
      const dataUrl = await fileToDataUrl(f);
      if (!dataUrl) throw new Error(`File ${f.name} tidak bisa dibaca`);
      evidenceCounter += 1;
      created.push({
        id: `ev-${evidenceCounter}`,
        name: f.name,
        kind: f.type.startsWith('image/') ? 'image' : 'doc',
        sizeLabel: formatSize(f.size),
        url: dataUrl,
        date,
      });
    }
    const next = {
      ...byEmployee,
      [employeeId]: [...(byEmployee[employeeId] ?? []), ...created],
    };
    saveLocalEvidence(next);
    return created;
  },

  async removeEvidence(employeeId: number, fileId: string): Promise<void> {
    const byEmployee = loadLocalEvidence();
    const next = {
      ...byEmployee,
      [employeeId]: (byEmployee[employeeId] ?? []).filter((f) => f.id !== fileId),
    };
    saveLocalEvidence(next);
  },

  async reviewEvidence(employeeId: number, date: string, reviewedBy: string): Promise<void> {
    const reviews = loadLocalReviews();
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    reviews[verificationKey(employeeId, date)] = { reviewedBy, reviewedAt: stamp };
    saveLocalReviews(reviews);
  },
};

// Pilih sumber data berdasarkan konfigurasi build.
export const attendanceApi = API_URL ? remoteApi : localApi;
export const attendanceApiIsRemote = Boolean(API_URL);
