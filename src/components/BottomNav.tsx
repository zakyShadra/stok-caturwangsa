// Navigasi bawah mobile: 4 item (Beranda, Absensi, Stok, Riwayat).
// Satu pill yang BERJALAN ke item aktif (code-xr pola 1), bukan tiap
// item menyala sendiri. Posisi diukur dari DOM, digerakkan dengan
// transform, 0.45s cubic-bezier(.22,1,.36,1).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'Beranda', icon: HomeIcon },
  { to: '/absensi', label: 'Absensi', icon: ClipboardIcon },
  { to: '/stok', label: 'Stok', icon: BoxIcon },
  { to: '/riwayat', label: 'Riwayat', icon: ClockIcon },
];

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={active ? '#0F6F72' : '#5A6B76'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function ClipboardIcon({ active }: { active: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={active ? '#0F6F72' : '#5A6B76'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4a2 2 0 0 1 6 0" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  );
}

function BoxIcon({ active }: { active: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={active ? '#0F6F72' : '#5A6B76'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" />
      <path d="M3.3 7 12 12l8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function ClockIcon({ active }: { active: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={active ? '#0F6F72' : '#5A6B76'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export default function BottomNav() {
  const location = useLocation();
  // Ref di grid dalam (max-w-720, di tengah), BUKAN di nav luar
  // (lebar penuh): pill diposisikan relatif terhadap grid ini,
  // jadi pengukurannya harus terhadap grid yang sama.
  const gridRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  // -1 kalau halaman ini tidak ada di nav bawah (Karyawan, Laporan):
  // pill disembunyikan dan tidak ada item yang menyala, supaya nav
  // tidak menunjuk Beranda secara salah.
  const activeIndex = ITEMS.findIndex((item) => item.to === location.pathname);

  useLayoutEffect(() => {
    const measure = () => {
      const grid = gridRef.current;
      if (!grid || activeIndex < 0) {
        setPill((p) => ({ ...p, ready: false }));
        return;
      }
      const link = grid.querySelectorAll('a')[activeIndex] as HTMLElement | undefined;
      if (!link) return;
      const gridRect = grid.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      setPill({
        left: linkRect.left - gridRect.left,
        width: linkRect.width,
        ready: true,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    // ResizeObserver: ukur ulang kalau layout berubah (font masuk,
    // CSS telat, rotasi HP), bukan cuma saat resize viewport.
    const observer = new ResizeObserver(measure);
    if (gridRef.current) observer.observe(gridRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [activeIndex]);

  // Halaman scan tidak pakai nav bawah: layarnya penuh untuk kamera.
  const onScanPage = location.pathname.startsWith('/scan');
  useEffect(() => {
    document.body.classList.toggle('no-bottom-nav', onScanPage);
    return () => document.body.classList.remove('no-bottom-nav');
  }, [onScanPage]);

  if (onScanPage) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface/95 backdrop-blur-sm"
      aria-label="Navigasi utama"
    >
      <div ref={gridRef} className="relative mx-auto grid max-w-[720px] grid-cols-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-2 h-[calc(100%-16px)] rounded-button bg-primary-soft/70 transition-all duration-500"
          style={{
            transform: `translateX(${pill.left + 6}px)`,
            width: Math.max(0, pill.width - 12),
            opacity: pill.ready ? 1 : 0,
            transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
          }}
        />
        {ITEMS.map((item, i) => {
          const active = i === activeIndex;
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className="relative z-10 flex min-h-[72px] flex-col items-center justify-center gap-1 py-2"
              aria-current={active ? 'page' : undefined}
            >
              <Icon active={active} />
              <span className={`text-base font-bold ${active ? 'text-primary-deep' : 'text-ink-muted'}`}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
