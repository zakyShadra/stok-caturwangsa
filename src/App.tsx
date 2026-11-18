// Aplikasi gabungan Sabun Palem: absensi + stok dalam satu app.
// - /login terbuka untuk semua. Semua halaman lain butuh login.
// - Karyawan dan Laporan hanya untuk Admin/Bos/Manager (Staff dialihkan
//   ke Beranda). Bos dan Manager bisa melihat daftar hadir + bukti kerja.
// - Stok (scan, daftar stok, riwayat) bisa diakses semua role.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { JSX } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { AttendanceProvider } from './lib/attendance-state';
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

export default function App() {
  return (
    <AuthProvider>
      {/* basename dari BASE_URL: di GitHub Pages situs hidup di
          /stok-caturwangsa/, tanpa basename semua rute gagal cocok
          dan jatuh ke "*" -> "/". */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {/* Provider di luar Routes supaya state absensi dan stok tidak
            hilang saat pindah halaman, termasuk keluar lalu masuk lagi
            sebagai akun lain (tanpa reload). */}
        <AttendanceProvider>
          <StockProvider>
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
              <Route path="akun" element={<Account />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
            </div>
          </StockProvider>
        </AttendanceProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
