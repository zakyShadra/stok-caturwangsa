import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Service worker PWA: hanya di build produksi (di dev tidak
// didaftarkan, supaya tidak meng-cache kode yang sedang diubah).
// BASE_URL membuat path benar di semua host (github.io memakai
// /stok-caturwangsa/, Pages dan domain sendiri memakai /).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        // Gagal daftar (misal browser lama): aplikasi tetap jalan
        // sebagai web biasa, hanya tanpa kemampuan offline.
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
