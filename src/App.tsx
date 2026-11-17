import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import { StockProvider } from './lib/store';
import Home from './pages/Home';
import Scan from './pages/Scan';
import Stock from './pages/Stock';
import History from './pages/History';

// Transisi halaman: fade + naik 8px, 200ms ease-out.
// Wrapper key={pathname} supaya animasi jalan tiap pindah halaman.
function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter">
      {children}
    </div>
  );
}

export default function App() {
  return (
    <StockProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-canvas font-sans text-ink">
          <main className="mx-auto w-full max-w-[720px] px-5 pb-32 pt-6 sm:pt-8">
            <PageTransition>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/scan/:type" element={<Scan />} />
                <Route path="/stok" element={<Stock />} />
                <Route path="/riwayat" element={<History />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </PageTransition>
          </main>
          <BottomNav />
        </div>
      </BrowserRouter>
    </StockProvider>
  );
}
