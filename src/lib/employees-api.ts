// Lapisan data karyawan, pola yang sama dengan attendance-api.ts:
//   - Kalau VITE_API_URL diisi, daftar karyawan dibaca dari dan
//     ditulis ke Worker + D1 (tabel employees). Server adalah sumber
//     kebenaran: perubahan Admin di satu HP terlihat di HP lain dan
//     tidak hilang saat refresh.
//   - Kalau tidak diisi, daftar hidup di memori sesi (dipakai saat
//     pengembangan lokal tanpa backend), sama seperti sebelumnya.
// Komponen lain tidak perlu tahu sumbernya; bentuk fungsinya sama.
//
// Endpoint Workers (lihat worker/src/employees.ts):
//   GET    /api/karyawan      -> daftar karyawan (seed kalau kosong)
//   POST   /api/karyawan      -> tambah karyawan (id dari server)
//   PUT    /api/karyawan/:id  -> ubah karyawan
//   DELETE /api/karyawan/:id  -> hapus karyawan
import { EMPLOYEES } from './attendance';
import type { Employee } from './attendance';

export interface EmployeesApi {
  list(): Promise<Employee[]>;
  create(data: Omit<Employee, 'id' | 'active'>): Promise<Employee>;
  update(id: number, data: Partial<Employee>): Promise<Employee>;
  remove(id: number): Promise<void>;
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

const remoteApi: EmployeesApi = {
  async list(): Promise<Employee[]> {
    return remoteFetch<Employee[]>('/api/karyawan');
  },

  async create(data: Omit<Employee, 'id' | 'active'>): Promise<Employee> {
    return remoteFetch<Employee>('/api/karyawan', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: number, data: Partial<Employee>): Promise<Employee> {
    return remoteFetch<Employee>(`/api/karyawan/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async remove(id: number): Promise<void> {
    await remoteFetch<{ ok: boolean }>(`/api/karyawan/${id}`, { method: 'DELETE' });
  },
};

// ---- Sumber data lokal (memori sesi, tanpa backend) ----

// Salinan EMPLOYEES yang bisa diubah dalam sesi ini. Dipakai hanya
// kalau tidak ada VITE_API_URL (pengembangan lokal tanpa backend).
let localEmployees: Employee[] = EMPLOYEES.map((e) => ({
  ...e,
  capabilities: [...(e.capabilities ?? [])],
}));

const localApi: EmployeesApi = {
  async list(): Promise<Employee[]> {
    return localEmployees.map((e) => ({ ...e, capabilities: [...(e.capabilities ?? [])] }));
  },

  async create(data: Omit<Employee, 'id' | 'active'>): Promise<Employee> {
    const nextId = Math.max(...localEmployees.map((x) => x.id), 0) + 1;
    const created: Employee = { id: nextId, ...data, active: true };
    localEmployees = [...localEmployees, created];
    return created;
  },

  async update(id: number, data: Partial<Employee>): Promise<Employee> {
    const existing = localEmployees.find((x) => x.id === id);
    if (!existing) throw new Error('Karyawan tidak ditemukan');
    const updated: Employee = { ...existing, ...data };
    localEmployees = localEmployees.map((x) => (x.id === id ? updated : x));
    return updated;
  },

  async remove(id: number): Promise<void> {
    localEmployees = localEmployees.filter((e) => e.id !== id);
  },
};

// Pilih sumber data berdasarkan konfigurasi build.
export const employeesApi = API_URL ? remoteApi : localApi;
export const employeesApiIsRemote = Boolean(API_URL);
