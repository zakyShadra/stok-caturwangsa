// Halaman Absensi. Isinya:
// - Pilih tanggal, lihat siapa yang hadir/telat/izin hari itu.
// - Manager/Admin/Bos bisa menandai Izin/Cuti untuk karyawan, dan
//   melihat bukti kerja yang dilampirkan tiap karyawan.
// - Staf hanya melihat riwayat absensi sendiri, dan melampirkan
//   bukti kerjaan hari ini (foto/dokumen) setelah absen masuk.
import { createPortal } from 'react-dom';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useAttendanceState } from '../lib/attendance-state';
import {
  EMPLOYEES,
  formatDateID,
  jakartaDate,
} from '../lib/attendance';
import type { CheckVerification, EvidenceFile } from '../lib/attendance';
import { AttendanceBadge, BigButton, EmptyState, PageHeader } from '../components/ui';

// Satu file bukti: thumbnail kalau gambar (ketuk untuk memperbesar),
// ikon dokumen kalau bukan gambar (ketuk untuk membuka file).
function EvidenceItem({
  file,
  onView,
  onRemove,
}: {
  file: EvidenceFile;
  onView: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-button border border-hairline bg-surface p-2">
      {file.kind === 'image' && file.url ? (
        <button type="button" onClick={onView} aria-label={`Lihat ${file.name}`}>
          <img
            src={file.url}
            alt={file.name}
            className="h-14 w-20 rounded-control object-cover"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={onView}
          aria-label={`Buka ${file.name}`}
          className="flex h-14 w-20 shrink-0 items-center justify-center rounded-control bg-primary-soft/50"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0F6F72" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9 13h6M9 17h6" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold text-ink">{file.name}</p>
        <p className="text-sm text-ink-muted">{file.sizeLabel}</p>
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Hapus ${file.name}`}
          className="btn-press flex min-h-[44px] min-w-[44px] items-center justify-center rounded-button bg-error/10 text-base font-bold text-error"
        >
          Hapus
        </button>
      ) : null}
    </div>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const isStaff = user?.role === 'Staff';
  const { records, upsertRecord, myCheckIn, evidenceByEmployee, verificationByEmployee, addEvidence, removeEvidence } = useAttendanceState();
  const [selectedDate, setSelectedDate] = useState(jakartaDate(0));
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form tandai izin/cuti (Admin/Bos/Manager): disembunyikan di balik
  // tombol, baru muncul saat ditekan.
  const [showMark, setShowMark] = useState(false);
  const [markEmployee, setMarkEmployee] = useState(EMPLOYEES[0].id);
  const [markStatus, setMarkStatus] = useState<'Izin' | 'Cuti'>('Izin');
  const [markNote, setMarkNote] = useState('');

  const dayRecords = useMemo(() => {
    const filtered = records.filter((r) => r.date === selectedDate);
    if (isStaff) {
      // Staf hanya lihat riwayat sendiri (akun staf = Budi Santoso, id 1).
      return filtered.filter((r) => r.employeeId === 1);
    }
    return filtered;
  }, [records, selectedDate, isStaff]);

  const employeeName = (id: number) => EMPLOYEES.find((e) => e.id === id)?.name ?? '-';
  const employeeDivision = (id: number) => EMPLOYEES.find((e) => e.id === id)?.division ?? '-';

  // Rekap bulan ini (per karyawan).
  const monthPrefix = selectedDate.slice(0, 7);
  const monthRecords = records.filter((r) => r.date.startsWith(monthPrefix));
  const recap = useMemo(() => {
    const list = isStaff ? EMPLOYEES.filter((e) => e.id === 1) : EMPLOYEES;
    return list.map((e) => {
      const mine = monthRecords.filter((r) => r.employeeId === e.id);
      return {
        employee: e,
        hadir: mine.filter((r) => r.status === 'Hadir').length,
        telat: mine.filter((r) => r.status === 'Telat').length,
        izin: mine.filter((r) => r.status === 'Izin' || r.status === 'Cuti').length,
      };
    });
  }, [monthRecords, isStaff]);

  // Bukti kerja hari ini: berapa dari yang hadir yang sudah melampirkan.
  const presentToday = dayRecords.filter((r) => r.status === 'Hadir' || r.status === 'Telat');
  const withEvidenceToday = presentToday.filter(
    (r) => (evidenceByEmployee[r.employeeId] ?? []).length > 0,
  ).length;

  const myEvidence = evidenceByEmployee[1] ?? [];

  const handleMark = () => {
    upsertRecord({
      employeeId: markEmployee,
      date: selectedDate,
      checkIn: null,
      checkOut: null,
      status: markStatus,
    });
    setMarkNote(`${employeeName(markEmployee)} ditandai ${markStatus} untuk ${formatDateID(selectedDate)}.`);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    addEvidence(1, Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const viewFile = (file: EvidenceFile) => {
    if (!file.url) return;
    if (file.kind === 'image') {
      setLightbox(file.url);
    } else {
      window.open(file.url, '_blank', 'noopener');
    }
  };

  return (
    <div>
      <PageHeader
        title="Absensi"
        subtitle={isStaff ? 'Riwayat absensi Anda' : 'Daftar kehadiran karyawan per hari'}
      />

      {/* Bukti kerja saya (staf): muncul setelah absen masuk. */}
      {isStaff ? (
        <div className="entrance mb-6 rounded-card border border-hairline bg-surface p-5 shadow-card">
          <h2 className="text-lg font-bold text-ink">Bukti kerja hari ini</h2>
          {!myCheckIn ? (
            <p className="mt-2 text-base text-ink-muted">
              Absen masuk dulu di{' '}
              <Link to="/" className="font-bold text-primary-deep hover:text-primary">
                Beranda
              </Link>
              , baru bisa melampirkan bukti kerja.
            </p>
          ) : (
            <>
              <p className="mt-2 text-base text-ink-muted">
                Lampirkan foto atau dokumen kerjaan hari ini. Bos dan Manager
                bisa melihatnya.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <div className="mt-4">
                <BigButton tone="primary" full onClick={() => fileInputRef.current?.click()}>
                  + Lampirkan File
                </BigButton>
              </div>
              {myEvidence.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {myEvidence.map((f) => (
                    <EvidenceItem
                      key={f.id}
                      file={f}
                      onView={() => viewFile(f)}
                      onRemove={() => removeEvidence(1, f.id)}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-base text-ink-muted">
                  Belum ada bukti yang dilampirkan hari ini.
                </p>
              )}
            </>
          )}
        </div>
      ) : null}

      {/* Pilih tanggal + tombol tandai izin/cuti. */}
      <div className="entrance mb-6 rounded-card border border-hairline bg-surface p-5 shadow-card">
        <label htmlFor="tanggal" className="mb-2 block text-base font-bold text-ink">
          Pilih tanggal
        </label>
        <input
          id="tanggal"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="min-h-[56px] w-full rounded-button border border-hairline bg-surface px-4 text-lg text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        <p className="mt-2 text-base text-ink-muted">{formatDateID(selectedDate)}</p>
        {!isStaff ? (
          <>
            <p className="mt-3 rounded-button bg-surface-soft px-4 py-3 text-base text-ink">
              Bukti kerja: <span className="font-bold text-primary-deep tabular-nums">{withEvidenceToday} dari {presentToday.length}</span> yang
              hadir sudah melampirkan bukti hari ini.
            </p>
            <div className="mt-4">
              <BigButton tone="secondary" full onClick={() => setShowMark((v) => !v)}>
                {showMark ? 'Tutup form izin / cuti' : 'Tandai Izin / Cuti'}
              </BigButton>
            </div>
          </>
        ) : null}
      </div>

      {/* Form tandai izin/cuti. */}
      {!isStaff && showMark ? (
        <div className="entrance mb-6 rounded-card border border-hairline bg-surface p-5 shadow-card">
          <h2 className="text-lg font-bold text-ink">Tandai Izin / Cuti</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="mark-emp" className="mb-2 block text-base font-bold text-ink">
                Karyawan
              </label>
              <select
                id="mark-emp"
                value={markEmployee}
                onChange={(e) => setMarkEmployee(Number(e.target.value))}
                className="min-h-[56px] w-full rounded-button border border-hairline bg-surface px-4 text-lg text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              >
                {EMPLOYEES.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} - {e.division}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-2 text-base font-bold text-ink">Status</p>
              <div className="flex gap-2">
                {(['Izin', 'Cuti'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setMarkStatus(s)}
                    className={`btn-press min-h-[56px] flex-1 rounded-button border text-lg font-bold transition-colors ${
                      markStatus === s
                        ? 'border-primary bg-primary text-white'
                        : 'border-hairline bg-surface text-ink hover:bg-surface-soft'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <BigButton tone="primary" full onClick={handleMark}>
              Simpan
            </BigButton>
          </div>
          {markNote ? (
            <p className="mt-4 text-base font-bold text-primary-deep">{markNote}</p>
          ) : null}
        </div>
      ) : null}

      {/* Daftar absen hari itu: kartu per karyawan, bukan tabel.
          Bos/Manager juga melihat bukti kerja tiap karyawan di kartunya. */}
      <h2 className="mb-4 text-xl font-bold text-ink">Absen {formatDateID(selectedDate)}</h2>
      {dayRecords.length === 0 ? (
        <EmptyState
          title="Belum ada data absen"
          body="Belum ada yang absen untuk tanggal ini."
        />
      ) : (
        <div className="space-y-3">
          {dayRecords.map((r, i) => {
            const evidence = evidenceByEmployee[r.employeeId] ?? [];
            return (
              <article
                key={r.employeeId}
                className="entrance rounded-card border border-hairline bg-surface p-4 shadow-card"
                style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold leading-snug text-ink">{employeeName(r.employeeId)}</h3>
                    <p className="text-base text-ink-muted">{employeeDivision(r.employeeId)}</p>
                  </div>
                  <AttendanceBadge status={r.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-hairline pt-3 text-center">
                  <div>
                    <div className="text-sm font-semibold text-ink-muted">Masuk</div>
                    <div className="text-xl font-bold text-ink tabular-nums">{r.checkIn ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-ink-muted">Pulang</div>
                    <div className="text-xl font-bold text-ink tabular-nums">{r.checkOut ?? '-'}</div>
                  </div>
                </div>
                {!isStaff ? (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <p className="text-base font-bold text-ink">
                      Bukti kerja ({evidence.length})
                    </p>
                    {evidence.length === 0 ? (
                      <p className="mt-1 text-base text-ink-muted">
                        Belum melampirkan bukti hari ini.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {evidence.map((f) => (
                          <EvidenceItem key={f.id} file={f} onView={() => viewFile(f)} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                {!isStaff ? (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <p className="text-base font-bold text-ink">Selfie absen</p>
                    {(() => {
                      const v = verificationByEmployee[r.employeeId];
                      const items: { label: string; data: CheckVerification }[] = [];
                      if (v?.masuk) items.push({ label: 'Masuk', data: v.masuk });
                      if (v?.pulang) items.push({ label: 'Pulang', data: v.pulang });
                      if (items.length === 0) {
                        return (
                          <p className="mt-1 text-base text-ink-muted">
                            Belum ada selfie absen.
                          </p>
                        );
                      }
                      return (
                        <div className="mt-2 space-y-2">
                          {items.map(({ label, data }) => (
                            <div key={label} className="flex items-center gap-3 rounded-button border border-hairline bg-surface p-2">
                              {data.selfieUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setLightbox(data.selfieUrl)}
                                  aria-label={`Lihat selfie ${label} ${employeeName(r.employeeId)}`}
                                >
                                  <img
                                    src={data.selfieUrl}
                                    alt={`Selfie ${label}`}
                                    className="h-14 w-20 rounded-control object-cover"
                                  />
                                </button>
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <p className="text-base font-bold text-ink">
                                  {label} {data.time} · {data.distanceMeters} m dari kantor
                                </p>
                                <p className="truncate text-sm text-ink-muted">{data.selfieName}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {/* Rekap bulan ini. */}
      <h2 className="mb-4 mt-8 text-xl font-bold text-ink">Rekap Bulan Ini</h2>
      <div className="space-y-3">
        {recap.map((r, i) => (
          <article
            key={r.employee.id}
            className="entrance rounded-card border border-hairline bg-surface p-4 shadow-card"
            style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
          >
            <h3 className="text-lg font-bold text-ink">{r.employee.name}</h3>
            <p className="text-base text-ink-muted">{r.employee.division}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
              <div>
                <div className="text-sm font-semibold text-ink-muted">Hadir</div>
                <div className="text-2xl font-bold text-success tabular-nums">{r.hadir}</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-ink-muted">Telat</div>
                <div className="text-2xl font-bold text-warning tabular-nums">{r.telat}</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-ink-muted">Izin / Cuti</div>
                <div className="text-2xl font-bold text-info tabular-nums">{r.izin}</div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Lightbox: perbesar foto bukti kerja. Dirender lewat portal ke body,
          karena wrapper halaman punya transform (animasi page-enter) yang
          membuat position:fixed di dalamnya relatif ke halaman, bukan layar. */}
      {lightbox
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              onClick={() => setLightbox(null)}
              role="dialog"
              aria-label="Foto bukti kerja diperbesar"
            >
              <img
                src={lightbox}
                alt="Foto bukti kerja"
                className="max-h-full max-w-full rounded-card object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="btn-press absolute right-4 top-4 flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-white text-xl font-bold text-ink"
                aria-label="Tutup"
              >
                X
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
