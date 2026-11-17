// Login. Akun dicek ke daftar di attendance.ts, tanpa backend.
// Nanti diganti token dari Workers.
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { USERS } from './attendance';
import type { Role, User } from './attendance';

interface AuthState {
  user: User | null;
  login: (email: string, password: string) => string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = 'sabunpalem-user';

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email: string; role: Role; name: string };
    return USERS.find((u) => u.email === parsed.email) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadUser);

  const login = (email: string, password: string): string | null => {
    const found = USERS.find((u) => u.email === email && u.password === password);
    if (!found) return 'Email atau password salah. Coba lagi.';
    setUser(found);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ email: found.email, role: found.role, name: found.name }),
    );
    return null;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
