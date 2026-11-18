// Halaman masuk. Akun diisi lewat tombol di bawah (ketuk untuk mengisi),
// jadi staf tidak perlu mengetik email dan password sendiri.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { USERS } from '../lib/attendance';
import { BigButton } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = login(email.trim(), password);
    if (err) {
      setError(err);
    } else {
      navigate('/');
    }
  };

  const fillAccount = (accountEmail: string, accountPassword: string) => {
    setEmail(accountEmail);
    setPassword(accountPassword);
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="entrance w-full max-w-md rounded-card border border-hairline bg-surface p-8 shadow-lift">
        <div className="mb-8 text-center">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo Sabun Palem" className="success-pop mx-auto h-16 w-auto" />
          <p className="mt-4 text-2xl font-bold text-primary-deep">Sabun Palem</p>
          <p className="mt-1 text-base text-ink-muted">PT Catur Wangsa Indah</p>
          <p className="mt-4 text-lg font-bold text-ink">Masuk ke Aplikasi</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-base font-bold text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@sabunpalem.co.id"
              className="min-h-[56px] w-full rounded-button border border-hairline bg-surface px-4 text-lg text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-base font-bold text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              className="min-h-[56px] w-full rounded-button border border-hairline bg-surface px-4 text-lg text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              required
            />
          </div>

          {error ? (
            <p className="rounded-button bg-error/10 px-4 py-3 text-base font-bold text-error">{error}</p>
          ) : null}

          <BigButton type="submit" tone="primary" full>
            Masuk
          </BigButton>
        </form>

        <div className="mt-8">
          <p className="mb-3 text-center text-base text-ink-muted">
            Akun yang tersedia (ketuk untuk mengisi):
          </p>
          <div className="space-y-2">
            {USERS.map((u) => (
              <button
                key={u.email}
                type="button"
                onClick={() => fillAccount(u.email, u.password)}
                className="btn-press flex min-h-[56px] w-full flex-col items-start justify-center gap-0.5 rounded-button border border-hairline bg-surface-soft px-4 text-left transition-colors hover:bg-primary-soft/40"
              >
                <span className="text-lg font-bold leading-tight text-primary-deep">{u.role}</span>
                <span className="text-sm leading-tight text-ink-muted">{u.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
