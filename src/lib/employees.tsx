// Daftar karyawan yang dipakai bersama: halaman Karyawan (Admin
// menambah/mengubah/menghapus), Beranda, Absensi, Laporan, dan guard
// akses (misal canViewMarketing). Satu sumber: perubahan di halaman
// Karyawan langsung terlihat di guard dalam sesi yang sama, tanpa
// ubah kode. Data awal dari EMPLOYEES di attendance.ts.
//
// Batasan yang sama seperti sebelumnya: daftar ini hanya hidup di
// memori sesi (belum ada backend karyawan), jadi perubahan hilang
// kalau halaman di-refresh dan tidak terlihat di HP lain. Backend
// karyawan (D1) adalah pekerjaan lanjutan kalau nanti dibutuhkan.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { EMPLOYEES } from './attendance';
import type { Employee } from './attendance';

interface EmployeesValue {
  employees: Employee[];
  addEmployee: (data: Omit<Employee, 'id' | 'active'>) => void;
  updateEmployee: (id: number, data: Partial<Employee>) => void;
  removeEmployee: (id: number) => void;
}

const EmployeesContext = createContext<EmployeesValue | null>(null);

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>(EMPLOYEES);

  const addEmployee = useCallback((data: Omit<Employee, 'id' | 'active'>) => {
    setEmployees((prev) => {
      const nextId = Math.max(...prev.map((x) => x.id), 0) + 1;
      return [...prev, { id: nextId, ...data, active: true }];
    });
  }, []);

  const updateEmployee = useCallback((id: number, data: Partial<Employee>) => {
    setEmployees((prev) => prev.map((x) => (x.id === id ? { ...x, ...data } : x)));
  }, []);

  const removeEmployee = useCallback((id: number) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const value = useMemo(
    () => ({ employees, addEmployee, updateEmployee, removeEmployee }),
    [employees, addEmployee, updateEmployee, removeEmployee],
  );

  return <EmployeesContext.Provider value={value}>{children}</EmployeesContext.Provider>;
}

export function useEmployees(): EmployeesValue {
  const ctx = useContext(EmployeesContext);
  if (!ctx) throw new Error('useEmployees harus dipakai di dalam EmployeesProvider');
  return ctx;
}
