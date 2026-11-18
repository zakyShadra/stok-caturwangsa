// Daftar karyawan yang dipakai bersama: halaman Karyawan (Admin
// menambah/mengubah/menghapus), Beranda, Absensi, Laporan, dan guard
// akses (misal canViewMarketing). Satu sumber: perubahan di halaman
// Karyawan langsung terlihat di guard dalam sesi yang sama, tanpa
// ubah kode.
//
// Sumber kebenaran adalah tabel employees di D1 (lewat
// employees-api.ts): perubahan tersimpan permanen, terlihat di HP
// lain, dan tidak hilang saat refresh. Data awal (EMPLOYEES di
// attendance.ts) dipakai sebagai isi pertama + cadangan kalau API
// tidak bisa dihubungi saat aplikasi dibuka: aplikasi tetap jalan
// dengan daftar awal, dan pesan error ditampilkan di halaman
// Karyawan. Tanpa VITE_API_URL (pengembangan lokal), daftar hidup
// di memori sesi seperti sebelumnya.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EMPLOYEES } from './attendance';
import type { Employee } from './attendance';
import { employeesApi } from './employees-api';

interface EmployeesValue {
  employees: Employee[];
  // True saat daftar pertama kali dimuat dari server.
  loading: boolean;
  // Pesan error muat/simpan terakhir, null kalau tidak ada.
  error: string | null;
  // Kembalikan true kalau tersimpan, false kalau gagal (pesan
  // kegagalan ada di error). Halaman Karyawan menampilkan catatan
  // sesuai hasilnya.
  addEmployee: (data: Omit<Employee, 'id' | 'active'>) => Promise<boolean>;
  updateEmployee: (id: number, data: Partial<Employee>) => Promise<boolean>;
  removeEmployee: (id: number) => Promise<boolean>;
}

const EmployeesContext = createContext<EmployeesValue | null>(null);

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>(EMPLOYEES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const list = await employeesApi.list();
        if (!mounted.current) return;
        setEmployees(list);
      } catch (e) {
        // Gagal muat: tetap pakai daftar awal, tampilkan pesan.
        if (!mounted.current) return;
        setError(e instanceof Error ? e.message : 'Gagal memuat daftar karyawan.');
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const addEmployee = useCallback(async (data: Omit<Employee, 'id' | 'active'>) => {
    try {
      const created = await employeesApi.create(data);
      setEmployees((prev) => [...prev, created]);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah karyawan.');
      return false;
    }
  }, []);

  const updateEmployee = useCallback(async (id: number, data: Partial<Employee>) => {
    try {
      const updated = await employeesApi.update(id, data);
      setEmployees((prev) => prev.map((x) => (x.id === id ? updated : x)));
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah karyawan.');
      return false;
    }
  }, []);

  const removeEmployee = useCallback(async (id: number) => {
    try {
      await employeesApi.remove(id);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus karyawan.');
      return false;
    }
  }, []);

  const value = useMemo(
    () => ({ employees, loading, error, addEmployee, updateEmployee, removeEmployee }),
    [employees, loading, error, addEmployee, updateEmployee, removeEmployee],
  );

  return <EmployeesContext.Provider value={value}>{children}</EmployeesContext.Provider>;
}

export function useEmployees(): EmployeesValue {
  const ctx = useContext(EmployeesContext);
  if (!ctx) throw new Error('useEmployees harus dipakai di dalam EmployeesProvider');
  return ctx;
}
