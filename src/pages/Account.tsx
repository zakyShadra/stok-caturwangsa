// Halaman Akun: nama, peran, dan email pengguna yang sedang masuk,
// plus satu tombol Keluar besar. Satu layar satu tugas: halaman ini
// hanya untuk keluar dari aplikasi. Diakses dari item Akun di nav
// bawah HP; di desktop tombol Keluar juga ada di footer sidebar.
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { BigButton, PageHeader } from '../components/ui';

function IconLogout() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default function Account() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div>
      <PageHeader title="Akun" subtitle="Informasi akun yang sedang masuk." />

      <div className="entrance rounded-card border border-hairline bg-surface p-6 shadow-card">
        <p className="text-sm font-bold uppercase tracking-wider text-ink-muted">Nama</p>
        <p className="mt-1 text-2xl font-bold text-ink">{user?.name}</p>
        <p className="mt-5 text-sm font-bold uppercase tracking-wider text-ink-muted">Peran</p>
        <p className="mt-1 text-lg font-semibold text-ink">{user?.role}</p>
        <p className="mt-5 text-sm font-bold uppercase tracking-wider text-ink-muted">Email</p>
        <p className="mt-1 text-base text-ink">{user?.email}</p>
      </div>

      <div className="entrance mt-6" style={{ animationDelay: '100ms' }}>
        <BigButton tone="primary" full onClick={handleLogout}>
          <IconLogout />
          Keluar
        </BigButton>
        <p className="mt-3 text-center text-sm text-ink-muted">
          Masuk lagi kapan saja dengan akunmu.
        </p>
      </div>
    </div>
  );
}
