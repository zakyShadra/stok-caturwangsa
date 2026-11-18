// Aplikasi gabungan Sabun Palem: absensi + stok dalam satu app.
// - /login terbuka untuk semua. Semua halaman lain butuh login.
// - Karyawan untuk Admin/Bos/Manager (Staff dialihkan ke Beranda):
//   Admin satu-satunya yang menambah/mengubah/menghapus karyawan;
//   Bos/Manager hanya melihat (mode lihat saja).
// - Laporan untuk Admin/Bos/Manager (Staff dialihkan ke Beranda).
// - Stok (scan, daftar stok, riwayat) bisa diakses semua role.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { JSX } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { canViewMarketing } from './lib/attendance';
import { AttendanceProvider } from './lib/attendance-state';
import { EmployeesProvider, useEmployees } from './lib/employees';
import { StockProvider } from './lib/store';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import Attendance from './pages/Attendance';
import Employees from './pages/Employees';
import Reports from './pages/Reports';
import Scan from './pages/Scan';
import Stock from './pages/Stock';
import History from './pages/History';
import Account from './pages/Account';

// Pemasaran dimuat malas: grafik Bklit (motion + d3) berat, hanya
// diunduh saat menu Pemasaran dibuka, bukan di setiap halaman.
const Marketing = lazy(() => import('./pages/Marketing'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireManagement({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'Staff') return <Navigate to="/" replace />;
  return children;
}

// Pemasaran: manajemen + karyawan yang punya capability
// 'view-marketing' (lihat canViewMarketing di attendance.ts). Yang
// tidak berhak dialihkan ke Beranda. Keputusan menunggu daftar
// karyawan dari server selesai dimuat: daftar awal (seed statis)
// bisa sudah kedaluwarsa, misal capability yang baru dicentang
// Admin belum ada di seed, dan mengalihkan sebelum muat selesai
// akan salah mengusir karyawan yang sebenarnya berhak.
function RequireMarketing({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  const { employees, loading } = useEmployees();
  if (!user) return <Navigate to="/login" replace />;
  if (loading) {
    return (
      <p className="rounded-card border border-hairline bg-surface p-6 text-center text-lg text-ink-muted">
        Memuat...
      </p>
    );
  }
  if (!canViewMarketing(user, employees)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      {/* basename dari BASE_URL: di GitHub Pages situs hidup di
          /stok-caturwangsa/, tanpa basename semua rute gagal cocok
          dan jatuh ke "*" -> "/". */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {/* Provider di luar Routes supaya state absensi, stok, dan
            karyawan tidak hilang saat pindah halaman, termasuk keluar
            lalu masuk lagi sebagai akun lain (tanpa reload). */}
        <AttendanceProvider>
          <StockProvider>
            <EmployeesProvider>
              <div className="min-h-screen bg-canvas font-sans text-ink">
                <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
              <Route index element={<Home />} />
              <Route path="absensi" element={<Attendance />} />
              {/* Karyawan: Admin mengelola, Bos/Manager melihat saja
                  (tombol ubah disembunyikan di halamannya). Staff
                  dialihkan ke Beranda oleh RequireManagement. */}
              <Route
                path="karyawan"
                element={
                  <RequireManagement>
                    <Employees />
                  </RequireManagement>
                }
              />
              <Route
                path="laporan"
                element={
                  <RequireManagement>
                    <Reports />
                  </RequireManagement>
                }
              />
              <Route path="scan/:type" element={<Scan />} />
              <Route path="stok" element={<Stock />} />
              <Route path="riwayat" element={<History />} />
              {/* Pemasaran: manajemen + karyawan yang punya capability
                  'view-marketing' (Dyas, data analyst). */}
              <Route
                path="pemasaran"
                element={
                  <RequireMarketing>
                    <Suspense
                      fallback={
                        <p className="rounded-card border border-hairline bg-surface p-6 text-center text-lg text-ink-muted">
                          Memuat grafik...
                        </p>
                      }
                    >
                      <Marketing />
                    </Suspense>
                  </RequireMarketing>
                }
              />
              <Route path="akun" element={<Account />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
              </div>
            </EmployeesProvider>
          </StockProvider>
        </AttendanceProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
