// Beranda gabungan: absensi + stok dalam satu layar.
// - Staf: pertanyaan utama "Saya sudah absen belum?" jadi hero,
//   di bawahnya 3 tombol raksasa stok (Barang Masuk, Barang Keluar,
//   Lihat Stok), lalu rekap bulan ini.
// - Admin/Bos/Manager: pertanyaan utama "Siapa yang belum absen?
//   Siapa yang telat?" jadi hero, lalu angka ringkasan dan stok
//   yang menipis. Bos tidak absen, dia hanya memantau.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useAttendanceState } from '../lib/attendance-state';
import { useStock } from '../lib/store';
import {
  EMPLOYEES,
  LATE_CUTOFF,
  formatDateID,
  jakartaDate,
} from '../lib/attendance';
import type { CheckVerification } from '../lib/attendance';
import { AttendanceBadge, BigButton } from '../components/ui';
import CheckInFlow from '../components/CheckInFlow';
import { stockStatus, totalStock } from '../lib/types';

function useJakartaClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const jakarta = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const hh = String(jakarta.getHours()).padStart(2, '0');
  const mm = String(jakarta.getMinutes()).padStart(2, '0');
  const ss = String(jakarta.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

// Tombol absen: setelah diklik, berubah jadi hijau dengan centang +
// label sukses, scale-in 200ms. Bukan sekadar teks berubah: warna,
// ikon, dan gerak pop-nya menandai aksi berhasil.
function CheckButton({
  label,
  successLabel,
  done,
  disabled,
  onClick,
  tone,
}: {
  label: string;
  successLabel: string;
  done: boolean;
  disabled: boolean;
  onClick: () => void;
  tone: 'primary' | 'secondary';
}) {
  if (done) {
    return (
      <button
        disabled
        className="success-pop flex min-h-[56px] flex-1 items-center justify-center gap-3 rounded-button bg-success px-6 text-lg font-bold text-white"
      >
        <CheckIcon />
        {successLabel}
      </button>
    );
  }
  return (
    <BigButton
      tone={tone === 'primary' ? 'primary' : 'secondary'}
      onClick={onClick}
      disabled={disabled}
      className="flex-1"
    >
      {label}
    </BigButton>
  );
}

function ArrowInIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
      <path d="M5 21h14" />
    </svg>
  );
}

function ArrowOutIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
      <path d="M5 3h14" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

export default function Home() {
  const { user } = useAuth();
  const isStaff = user?.role === 'Staff';
  const isBos = user?.role === 'Bos';
  const clock = useJakartaClock();
  const today = jakartaDate(0);

  // Status absen saya hari ini, dipakai bersama halaman Absensi
  // (supaya tombol upload bukti kerja tahu saya sudah absen).
  // records dipakai bersama: absen yang dicatat lewat aplikasi
  // langsung muncul di angka beranda dan daftar absensi.
  const { records, myCheckIn, myCheckOut, myStatus, checkIn, checkOut, evidenceByEmployee } = useAttendanceState();

  // Flow absen (cek lokasi GPS lalu foto selfie). null = tidak jalan.
  const [flow, setFlow] = useState<'masuk' | 'pulang' | null>(null);

  const { products, loading, error: stockError, refresh: refreshStock } = useStock();
  // Stok gagal dimuat dan belum ada data sama sekali: jangan tampilkan
  // angka 0 yang menyesatkan, tampilkan pesan error + tombol coba lagi.
  const stockUnavailable = !loading && stockError !== null && products.length === 0;
  const menipisList = products.filter((p) => stockStatus(p) === 'menipis');
  const habisCount = products.filter((p) => stockStatus(p) === 'habis').length;
  const totalUnits = products.reduce((sum, p) => sum + totalStock(p), 0);

  const todayRecords = records.filter((r) => r.date === today);

  const totalKaryawan = EMPLOYEES.length;
  const hadir = todayRecords.filter((r) => r.status === 'Hadir').length;
  const telatRecords = todayRecords.filter((r) => r.status === 'Telat');
  const telat = telatRecords.length;
  const izin = todayRecords.filter((r) => r.status === 'Izin' || r.status === 'Cuti').length;

  const checkedInIds = new Set(todayRecords.map((r) => r.employeeId));
  const belumAbsen = EMPLOYEES.filter((e) => !checkedInIds.has(e.id));

  const employeeName = (id: number) => EMPLOYEES.find((e) => e.id === id)?.name ?? '-';
  const employeeDivision = (id: number) => EMPLOYEES.find((e) => e.id === id)?.division ?? '-';

  // Rekap saya bulan ini (akun staf = Budi Santoso, id 1).
  const monthPrefix = today.slice(0, 7);
  const myMonth = records.filter((r) => r.employeeId === 1 && r.date.startsWith(monthPrefix));
  const myHadir = myMonth.filter((r) => r.status === 'Hadir').length;
  const myTelat = myMonth.filter((r) => r.status === 'Telat').length;
  const myIzin = myMonth.filter((r) => r.status === 'Izin' || r.status === 'Cuti').length;

  // Bukti kerja: berapa dari yang hadir hari ini yang sudah melampirkan.
  const presentIds = todayRecords
    .filter((r) => r.status === 'Hadir' || r.status === 'Telat')
    .map((r) => r.employeeId);
  const withEvidence = presentIds.filter((id) => (evidenceByEmployee[id] ?? []).length > 0).length;

  const handleCheckIn = () => setFlow('masuk');
  const handleCheckOut = () => setFlow('pulang');

  // Flow selesai: catat absen dengan verifikasi (GPS + selfie).
  // Akun staf = Budi Santoso (id 1), jadi catatannya masuk ke
  // daftar absensi. Admin/Manager tidak ada di daftar karyawan.
  const handleFlowComplete = (v: CheckVerification) => {
    const employeeId = isStaff ? 1 : null;
    if (flow === 'masuk') checkIn(v, employeeId);
    else if (flow === 'pulang') checkOut(v, employeeId);
    setFlow(null);
  };

  const checkInButtons = (
    <>
      {/* Tombol ditumpuk di HP (teks "Absen Masuk" bungkus kalau
          berdampingan di layar 390px), berdampingan di layar lebar. */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <CheckButton
          label="Absen Masuk"
          successLabel="Absen berhasil"
          done={!!myCheckIn}
          disabled={!!myCheckIn}
          onClick={handleCheckIn}
          tone="primary"
        />
        <CheckButton
          label="Absen Pulang"
          successLabel="Pulang tercatat"
          done={!!myCheckOut}
          disabled={!myCheckIn || !!myCheckOut}
          onClick={handleCheckOut}
          tone="secondary"
        />
      </div>
      <p className="mt-3 text-center text-base text-ink-subtle">
        Masuk lewat pukul {LATE_CUTOFF} dihitung Telat.
      </p>
    </>
  );

  // Baris status sengaja ditulis satu baris tanpa jeda antar ekspresi:
  // jeda baris di JSX sempat membuat spasi muncul sebelum koma
  // ("Telat , pulang pukul ..."). Satu baris = koma menempel ke badge.
  const myStatusLine = myCheckIn ? (
    <p className="mt-4 text-lg text-ink">
      Anda absen masuk pukul <span className="font-bold tabular-nums">{myCheckIn}</span>{myStatus ? <span className="ml-2"><AttendanceBadge status={myStatus} /></span> : null}{myCheckOut ? <span>, pulang pukul <span className="font-bold tabular-nums">{myCheckOut}</span></span> : null}
    </p>
  ) : null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo Sabun Palem" className="h-16 w-16 rounded-card border border-hairline bg-surface object-contain p-1 shadow-card" />
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-ink">
            Selamat datang, {user?.name}
          </h1>
          <p className="text-base text-ink-muted">{formatDateID(today)}</p>
        </div>
      </div>

      {isStaff ? (
        <div className="space-y-6">
          {/* HERO STAF: "Saya sudah absen belum?" */}
          <div className="entrance rounded-card border border-hairline bg-surface p-6 text-center shadow-lift">
            <h2 className="text-xl font-bold text-ink">Absen saya hari ini</h2>
            <p className="mt-3 text-5xl font-bold tracking-wide text-primary-deep tabular-nums">{clock}</p>
            <p className="mt-2 text-base text-ink-muted">Waktu Indonesia Barat (WIB)</p>
            {myStatusLine}
            {!myCheckIn ? (
              <p className="mt-4 text-lg font-bold text-warning-ink">
                Anda belum absen masuk.
              </p>
            ) : null}
            {checkInButtons}
            {myCheckIn ? (
              <p className="mt-4 text-base text-ink-muted">
                Jangan lupa lampirkan bukti kerja hari ini di{' '}
                <Link to="/absensi" className="font-bold text-primary-deep hover:text-primary">
                  halaman Absensi
                </Link>
                .
              </p>
            ) : null}
          </div>

          {/* 3 tombol raksasa stok. */}
          <div className="space-y-4">
            <Link
              to="/scan/masuk"
              className="entrance btn-press flex min-h-[96px] items-center gap-4 rounded-card bg-success p-5 text-white shadow-card"
              style={{ animationDelay: '50ms' }}
            >
              <ArrowInIcon />
              <span>
                <span className="block text-2xl font-bold">Barang Masuk</span>
                <span className="block text-base font-medium text-white/85">Scan barang yang masuk gudang</span>
              </span>
            </Link>

            <Link
              to="/scan/keluar"
              className="entrance btn-press flex min-h-[96px] items-center gap-4 rounded-card bg-warning p-5 text-white shadow-card"
              style={{ animationDelay: '100ms' }}
            >
              <ArrowOutIcon />
              <span>
                <span className="block text-2xl font-bold">Barang Keluar</span>
                <span className="block text-base font-medium text-white/85">Scan barang yang keluar gudang</span>
              </span>
            </Link>

            <Link
              to="/stok"
              className="entrance btn-press flex min-h-[96px] items-center gap-4 rounded-card bg-info p-5 text-white shadow-card"
              style={{ animationDelay: '150ms' }}
            >
              <ListIcon />
              <span>
                <span className="block text-2xl font-bold">Lihat Stok</span>
                <span className="block text-base font-medium text-white/85">Cek jumlah stok semua barang</span>
              </span>
            </Link>
          </div>

          {/* Rekap saya bulan ini. */}
          <div className="entrance rounded-card border border-hairline bg-surface p-5 shadow-card" style={{ animationDelay: '200ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-ink">Rekap saya bulan ini</h2>
              <Link to="/absensi" className="text-base font-bold text-primary-deep hover:text-primary">
                Lihat riwayat absensi saya
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <div className="text-2xl font-bold text-success tabular-nums">{myHadir}</div>
                <div className="mt-0.5 text-sm font-semibold text-ink-muted">Hadir</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-warning tabular-nums">{myTelat}</div>
                <div className="mt-0.5 text-sm font-semibold text-ink-muted">Telat</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-info tabular-nums">{myIzin}</div>
                <div className="mt-0.5 text-sm font-semibold text-ink-muted">Izin / Cuti</div>
              </div>
            </div>
          </div>

          {/* Ringkasan stok. */}
          <div className="entrance grid grid-cols-3 gap-3" style={{ animationDelay: '250ms' }}>
            <div className="rounded-card border border-hairline bg-surface p-4 text-center shadow-card">
              <div className="text-3xl font-bold text-ink tabular-nums">{loading || stockUnavailable ? '-' : products.length}</div>
              <div className="mt-1 text-sm font-semibold text-ink-muted">Produk</div>
            </div>
            <div className="rounded-card border border-hairline bg-surface p-4 text-center shadow-card">
              <div className="text-3xl font-bold text-warning tabular-nums">{loading || stockUnavailable ? '-' : menipisList.length}</div>
              <div className="mt-1 text-sm font-semibold text-ink-muted">Menipis</div>
            </div>
            <div className="rounded-card border border-hairline bg-surface p-4 text-center shadow-card">
              <div className="text-3xl font-bold text-error tabular-nums">{loading || stockUnavailable ? '-' : habisCount}</div>
              <div className="mt-1 text-sm font-semibold text-ink-muted">Habis</div>
            </div>
          </div>

          {stockUnavailable ? (
            <p className="text-center text-base font-bold text-error">{stockError}</p>
          ) : (
            <p className="text-center text-base text-ink-muted">
              Total {loading ? '...' : totalUnits.toLocaleString('id-ID')} barang di gudang.
              Semua barang keluar lewat gerbang gudang, jadi satu scan di sini
              mencatat semua penjualan, online maupun offline.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* HERO MANAGER: "Siapa yang belum absen? Siapa yang telat?" */}
          <div className="entrance rounded-card border border-hairline bg-surface p-6 shadow-lift">
            <h2 className="text-xl font-bold text-ink">Perlu perhatian hari ini</h2>
            <p className="mt-1 text-base text-ink-muted">
              Karyawan yang belum absen dan yang telat masuk hari ini.
            </p>
            <p className="mt-3 rounded-button bg-surface-soft px-4 py-3 text-base text-ink">
              Bukti kerja: <span className="font-bold text-primary-deep tabular-nums">{withEvidence} dari {presentIds.length}</span> yang
              hadir sudah melampirkan bukti.
            </p>
            <div className="mt-6 grid gap-8 sm:grid-cols-2">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">
                  Belum absen ({belumAbsen.length})
                </p>
                {belumAbsen.length === 0 ? (
                  <p className="mt-3 text-base text-ink-muted">Semua karyawan sudah absen.</p>
                ) : (
                  <ul className="mt-2">
                    {belumAbsen.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline py-2.5 last:border-0">
                        <span className="text-base font-bold text-ink">{e.name}</span>
                        <span className="text-base text-ink-muted">{e.division}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">
                  Telat hari ini ({telat})
                </p>
                {telatRecords.length === 0 ? (
                  <p className="mt-3 text-base text-ink-muted">Tidak ada yang telat hari ini.</p>
                ) : (
                  <ul className="mt-2">
                    {telatRecords.map((r) => (
                      <li key={r.employeeId} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline py-2.5 last:border-0">
                        <span className="text-base font-bold text-ink">{employeeName(r.employeeId)}</span>
                        <span className="text-base text-ink-muted">
                          masuk <span className="font-bold text-warning-ink tabular-nums">{r.checkIn ?? '-'}</span>
                          {' · '}{employeeDivision(r.employeeId)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Ringkasan hari ini: grid 2x2 di HP, satu baris di layar
              lebar, supaya awal tiap kolom rata (baris flex-wrap lama
              bungkus tidak rata). */}
          <div className="entrance rounded-card border border-hairline bg-surface p-5 shadow-card" style={{ animationDelay: '50ms' }}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-2xl font-bold text-ink tabular-nums">{totalKaryawan}</div>
                <div className="mt-0.5 text-sm font-semibold text-ink-muted">Total karyawan</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-success tabular-nums">{hadir}</div>
                <div className="mt-0.5 text-sm font-semibold text-ink-muted">Hadir</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-warning tabular-nums">{telat}</div>
                <div className="mt-0.5 text-sm font-semibold text-ink-muted">Telat</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-info tabular-nums">{izin}</div>
                <div className="mt-0.5 text-sm font-semibold text-ink-muted">Izin / Cuti</div>
              </div>
            </div>
          </div>

          {/* Absen saya: admin dan manager juga karyawan, tapi
              posisinya sekunder. Bos tidak absen, jadi kartu ini
              tidak tampil untuk Bos. */}
          {!isBos ? (
            <div className="entrance rounded-card border border-hairline bg-surface p-5 shadow-card" style={{ animationDelay: '100ms' }}>
              <h2 className="text-lg font-bold text-ink">Absen saya</h2>
              {/* Jam dan status di baris terpisah: satu baris gabungan
                  bungkus tidak rata di HP. */}
              <p className="mt-1 text-base text-ink-muted">
                <span className="font-bold text-primary-deep tabular-nums">{clock}</span> WIB
              </p>
              {/* Baris status satu baris tanpa jeda antar ekspresi, sama
                  seperti kartu staf: koma harus menempel ke badge. */}
              {myCheckIn ? (
                <p className="mt-1 text-base text-ink">
                  Masuk pukul{' '}<span className="font-bold text-ink tabular-nums">{myCheckIn}</span>{myStatus ? <span className="ml-2"><AttendanceBadge status={myStatus} /></span> : null}{myCheckOut ? <span>, pulang pukul <span className="font-bold text-ink tabular-nums">{myCheckOut}</span></span> : null}
                </p>
              ) : (
                <p className="mt-1 text-base font-bold text-warning-ink">
                  Anda belum absen masuk.
                </p>
              )}
              {checkInButtons}
            </div>
          ) : null}

          {/* Stok yang menipis. */}
          <div className="entrance rounded-card border border-hairline bg-surface p-5 shadow-card" style={{ animationDelay: '150ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-ink">Stok menipis ({menipisList.length})</h2>
              <Link to="/stok" className="text-base font-bold text-primary-deep hover:text-primary">
                Lihat semua stok
              </Link>
            </div>
            {loading ? (
              <p className="mt-3 text-base text-ink-muted">Memuat stok...</p>
            ) : stockUnavailable ? (
              <div className="mt-3">
                <p className="text-base font-bold text-error">{stockError}</p>
                <div className="mt-3">
                  <BigButton tone="secondary" onClick={() => void refreshStock()}>
                    Coba lagi
                  </BigButton>
                </div>
              </div>
            ) : menipisList.length === 0 ? (
              <p className="mt-3 text-base text-ink-muted">Tidak ada stok yang menipis.</p>
            ) : (
              <ul className="mt-2">
                {menipisList.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline py-2.5 last:border-0">
                    <span className="text-base font-bold text-ink">{p.name}</span>
                    <span className="text-base text-ink-muted">
                      sisa <span className="font-bold text-warning-ink tabular-nums">{totalStock(p)}</span> {p.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-base text-ink-muted">
              {stockUnavailable
                ? 'Total stok belum bisa ditampilkan.'
                : `Total ${loading ? '...' : totalUnits.toLocaleString('id-ID')} barang di gudang, ${loading ? '...' : products.length} jenis produk.`}
            </p>
          </div>

          {/* Jalan pintas ke Karyawan dan Laporan (untuk manager di HP,
              yang tidak melihat sidebar). */}
          <div className="entrance grid grid-cols-2 gap-3 md:hidden" style={{ animationDelay: '250ms' }}>
            <Link
              to="/karyawan"
              className="btn-press flex min-h-[72px] items-center justify-center rounded-card border border-hairline bg-surface text-lg font-bold text-ink shadow-card"
            >
              Karyawan
            </Link>
            <Link
              to="/laporan"
              className="btn-press flex min-h-[72px] items-center justify-center rounded-card border border-hairline bg-surface text-lg font-bold text-ink shadow-card"
            >
              Laporan
            </Link>
          </div>
        </div>
      )}

      {/* Flow absen: cek lokasi GPS, lalu foto selfie. */}
      {flow ? (
        <CheckInFlow type={flow} onComplete={handleFlowComplete} onCancel={() => setFlow(null)} />
      ) : null}
    </div>
  );
}
