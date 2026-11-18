// Layout aplikasi gabungan. Desktop (md ke atas): sidebar 240px di kiri,
// latar primary-deep, nav dibagi grup ABSENSI dan STOK. HP: sidebar
// disembunyikan, navigasi pindah ke BottomNav.
// Sidebar punya satu pill yang BERJALAN ke item aktif (code-xr pola 6):
// posisinya diukur dari DOM item aktif, digerakkan dengan transform.
import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import BottomNav from './BottomNav';

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4a2 2 0 0 1 6 0" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 5.6M17.5 14.5a6.5 6.5 0 0 1 4 5.5" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </svg>
  );
}

function IconArrowIn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconArrowOut() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
      <path d="M5 3h14" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" />
      <path d="M3.3 7 12 12l8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

// Nav dibagi 3 grup: UTAMA, ABSENSI, STOK. Grup dipisah label
// small-caps + padding, bukan garis divider. Karyawan hanya muncul
// untuk Admin (satu-satunya yang mengelola karyawan); Laporan untuk
// Admin/Bos/Manager; Staff tidak melihat keduanya.
const NAV_GROUPS = [
  {
    label: 'Utama',
    items: [
      { to: '/', label: 'Beranda', Icon: IconHome, roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
    ],
  },
  {
    label: 'Absensi',
    items: [
      { to: '/absensi', label: 'Absensi', Icon: IconClipboard, roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
      { to: '/karyawan', label: 'Karyawan', Icon: IconUsers, roles: ['Admin'] },
      { to: '/laporan', label: 'Laporan', Icon: IconChart, roles: ['Admin', 'Bos', 'Manager'] },
    ],
  },
  {
    label: 'Stok',
    items: [
      { to: '/scan/masuk', label: 'Barang Masuk', Icon: IconArrowIn, roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
      { to: '/scan/keluar', label: 'Barang Keluar', Icon: IconArrowOut, roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
      { to: '/stok', label: 'Lihat Stok', Icon: IconBox, roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
      { to: '/riwayat', label: 'Riwayat', Icon: IconClock, roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [pill, setPill] = useState({ top: 0, height: 0, visible: false });

  const activePath = location.pathname;

  // Pill diukur relatif ke nav. Karena nav bisa bergeser sendiri
  // (overflow-y-auto), pengukuran harus menambahkan nav.scrollTop:
  // posisi pill di dalam konten nav, bukan di jendela yang kelihatan.
  // Ukur ulang juga saat nav digeser, supaya pill tidak melenceng.
  useLayoutEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      const el = itemRefs.current.get(activePath);
      if (!nav || !el) {
        setPill((p) => ({ ...p, visible: false }));
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setPill({
        top: elRect.top - navRect.top + nav.scrollTop,
        height: elRect.height,
        visible: true,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    const nav = navRef.current;
    nav?.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      nav?.removeEventListener('scroll', measure);
    };
  }, [activePath, user?.role]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar: hanya di desktop (md ke atas). Menempel di viewport
          (sticky, tinggi penuh layar), bukan mengikuti tinggi halaman:
          footer (nama + tombol Keluar) selalu kelihatan tanpa scroll,
          di halaman panjang sekalipun. Nav bergeser sendiri kalau
          isinya lebih tinggi dari layar. */}
      <aside className="sticky top-0 z-10 hidden h-screen w-60 shrink-0 flex-col bg-primary-deep text-white md:flex">
        <div className="shrink-0 px-5 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo Sabun Palem" className="h-10 w-auto" />
            <div>
              <p className="text-lg font-bold leading-tight">Sabun Palem</p>
              <p className="text-[12px] text-white/70">PT Catur Wangsa Indah</p>
            </div>
          </div>
        </div>

        <nav ref={navRef} className="relative min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-2">
          <div
            className="sidebar-pill"
            style={{
              transform: `translateY(${pill.top}px)`,
              height: pill.height,
              opacity: pill.visible ? 1 : 0,
            }}
            aria-hidden="true"
          />
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => user && item.roles.includes(user.role));
            if (items.length === 0) return null;
            return (
              <div key={group.label} className="relative">
                <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {items.map(({ to, label, Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      ref={(el) => {
                        if (el) itemRefs.current.set(to, el);
                        else itemRefs.current.delete(to);
                      }}
                      className={({ isActive }) =>
                        `relative z-10 flex items-center gap-3 rounded-control px-3 py-2.5 text-[15px] font-semibold transition-colors duration-200 ease-out ${
                          isActive ? 'text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      <Icon />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer menempel di bawah viewport (shrink-0): nama pengguna
            dan tombol Keluar selalu kelihatan. Tombol Keluar latar putih
            solid + ikon, tinggi 48px, supaya jelas bisa ditekan. */}
        <div className="shrink-0 border-t border-white/15 px-5 py-4">
          <p className="text-[15px] font-semibold">{user?.name}</p>
          <p className="text-[13px] text-white/70">{user?.role}</p>
          <button
            onClick={handleLogout}
            className="btn-press mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-control bg-white text-[15px] font-bold text-primary-deep transition-colors hover:bg-primary-soft"
          >
            <IconLogout />
            Keluar
          </button>
        </div>
      </aside>

      {/* Konten: lebar max 720px, rata tengah. Di HP ada padding bawah
          untuk BottomNav. Pindah halaman: fade + naik 8px. */}
      <main className="relative z-10 w-full flex-1">
        <div className="mx-auto w-full max-w-[720px] px-5 pb-32 pt-6 sm:pt-8 md:pb-12">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Navigasi bawah: hanya di HP (md ke bawah). */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
