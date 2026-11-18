// Komponen UI bersama. Token dari DESIGN.md.
// Badge mengikuti skill 15: tint 12% + dot 6px + teks kontras 4.5:1,
// tapi ukurannya dibesarkan untuk pengguna usia 60-70 tahun.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LOCATIONS } from '../lib/types';
import type { LocationId, StockStatus } from '../lib/types';
import type { AttendanceStatus } from '../lib/attendance';

export function StatusBadge({ status }: { status: StockStatus }) {
  const map: Record<StockStatus, { label: string; dot: string; cls: string }> = {
    aman: { label: 'Aman', dot: 'bg-success', cls: 'bg-success/10 text-success-ink' },
    menipis: { label: 'Menipis', dot: 'bg-warning', cls: 'bg-warning/10 text-warning-ink' },
    habis: { label: 'Habis', dot: 'bg-error', cls: 'bg-error/10 text-error' },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${s.cls}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// Badge status absensi: pola yang sama dengan StatusBadge (dot + label),
// warnanya mengikuti arti statusnya: Hadir hijau, Telat oranye,
// Izin/Cuti biru.
export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const map: Record<AttendanceStatus, { dot: string; cls: string }> = {
    Hadir: { dot: 'bg-success', cls: 'bg-success/10 text-success-ink' },
    Telat: { dot: 'bg-warning', cls: 'bg-warning/10 text-warning-ink' },
    Izin: { dot: 'bg-info', cls: 'bg-info/10 text-info-ink' },
    Cuti: { dot: 'bg-info', cls: 'bg-info/10 text-info-ink' },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${s.cls}`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-base text-ink-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}

// Kontrol segmen: pilihan eksklusif (Semua / Masuk / Keluar) dalam satu
// baris, tidak pernah bungkus ke dua baris. Di HP lebar penuh (segmen
// bagi rata), di desktop menyusut mengikuti isi. Dipakai untuk filter
// Riwayat dan Stok, menggantikan chip terpisah yang bungkus tidak rata.
export function SegmentedControl<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      className="mb-5 flex w-full rounded-full border border-hairline bg-surface p-1 shadow-card sm:inline-flex sm:w-auto"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`btn-press min-h-[44px] flex-1 whitespace-nowrap rounded-full px-4 text-base font-bold transition-colors ${
            value === o.id ? 'bg-primary text-white' : 'text-ink hover:bg-surface-soft'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'primary' | 'success' | 'warning' | 'info' | 'secondary' | 'danger';
  full?: boolean;
}

export function BigButton({ tone = 'primary', full = false, className = '', ...props }: BigButtonProps) {
  const tones: Record<string, string> = {
    primary: 'bg-primary text-white hover:bg-primary-deep',
    success: 'bg-success text-white hover:bg-success-ink',
    warning: 'bg-warning text-white hover:bg-warning-ink',
    info: 'bg-info text-white hover:bg-info-ink',
    secondary: 'bg-surface text-ink border border-hairline hover:bg-surface-soft',
    danger: 'bg-error text-white hover:bg-red-700',
  };
  return (
    <button
      className={`btn-press flex min-h-[56px] items-center justify-center gap-3 rounded-button px-6 text-lg font-bold transition-colors disabled:opacity-50 ${tones[tone]} ${full ? 'w-full' : ''} ${className}`}
      {...props}
    />
  );
}

// Stepper jumlah: tombol + dan - besar, tanpa perlu mengetik angka.
// Stepper jumlah: tombol - dan + 64x64px, angka tengah 32px tabular.
// max (opsional) membatasi tombol +: dipakai di scan Keluar, supaya
// jumlah tidak bisa melebihi stok di lokasi yang dipilih.
export function QtyStepper({ value, onChange, unit, max }: { value: number; onChange: (v: number) => void; unit: string; max?: number }) {
  const atMax = max !== undefined && value >= max;
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        aria-label="Kurangi jumlah"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="btn-press flex h-16 w-16 items-center justify-center rounded-button border border-hairline bg-surface text-3xl font-bold text-ink shadow-card"
      >
        -
      </button>
      <div className="w-28 text-center">
        <div className="text-[40px] font-bold leading-none tabular-nums text-ink">{value}</div>
        <div className="mt-1 text-sm font-semibold text-ink-muted">{unit}</div>
      </div>
      <button
        type="button"
        aria-label="Tambah jumlah"
        onClick={() => onChange(value + 1)}
        disabled={atMax}
        className="btn-press flex h-16 w-16 items-center justify-center rounded-button bg-primary text-3xl font-bold text-white shadow-card disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

// Pilih lokasi: 3 tombol besar, satu aktif. Bukan dropdown kecil.
export function LocationPicker({ value, onChange }: { value: LocationId; onChange: (v: LocationId) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Pilih lokasi gudang">
      {LOCATIONS.map((loc) => {
        const active = loc.id === value;
        return (
          <button
            key={loc.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(loc.id)}
            className={`btn-press min-h-[56px] rounded-button border px-1 py-3 text-[15px] font-bold transition-colors ${
              active
                ? 'border-primary bg-primary text-white'
                : 'border-hairline bg-surface text-ink hover:bg-surface-soft'
            }`}
          >
            {loc.short}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-8 text-center shadow-card">
      <p className="text-lg font-bold text-ink">{title}</p>
      <p className="mt-2 text-base text-ink-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
