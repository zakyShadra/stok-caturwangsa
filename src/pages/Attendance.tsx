// Halaman Absensi.
// - Staf: kartu bukti kerja (upload setelah absen masuk), form
//   pengajuan Izin/Cuti, dan riwayat absennya sendiri.
// - Bos: antrean "Menunggu persetujuan" (absen + pengajuan Izin/Cuti)
//   dengan tombol Setujui/Tolak, plus kartu per karyawan.
// - Manager/Admin: melihat antrean dan statusnya saja, tanpa tombol
//   aksi (mereka tidak menyetujui apa pun).
// Rekap bulanan hanya menghitung catatan yang sudah disetujui Bos;
// yang pending ditampilkan terpisah, yang ditolak tidak dihitung.
// Foto selfie absen (jam + jarak dari kantor) bisa diketuk untuk
// diperbesar lewat lightbox.
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useAttendanceState } from '../lib/attendance-state';
import { verificationKey } from '../lib/attendance-api';
import {
  EMPLOYEES,
  formatDateID,
  jakartaDate,
} from '../lib/attendance';
import type { ApprovalStatus, CheckVerification, EvidenceFile } from '../lib/attendance';
import { AttendanceBadge, BigButton, EmptyState, PageHeader, SegmentedControl } from '../components/ui';

// Badge status persetujuan Bos: Menunggu persetujuan (oranye),
// Disetujui (hijau), Ditolak (merah). Izin/Cuti yang pending tampil
// sebagai badge "Izin" + badge "Menunggu persetujuan".
function ApprovalBadge({ approval }: { approval: ApprovalStatus }) {
  const cls =
    approval === 'approved'
      ? 'bg-success/10 text-success-ink'
      : approval === 'rejected'
        ? 'bg-error/10 text-error'
        : 'bg-warning/10 text-warning-ink';
  const dot =
    approval === 'approved' ? 'bg-success' : approval === 'rejected' ? 'bg-error' : 'bg-warning';
  const label =
    approval === 'approved' ? 'Disetujui' : approval === 'rejected' ? 'Ditolak' : 'Menunggu persetujuan';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary-deep">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

// Thumbnail selfie absen: ketuk untuk memperbesar. Kalau foto tidak
// ada atau gagal dimuat, tampilkan placeholder, bukan ikon rusak.
// Thumbnail dibuat shrink-0 supaya tidak pernah menumpuk teks.
function SelfieThumb({ url, label, onView }: { url: string | null | undefined; label: string; onView: () => void }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex h-14 w-20 shrink-0 flex-col items-center justify-center rounded-control bg-primary-soft/50 px-1 text-center">
        <PersonIcon />
        <span className="text-sm font-bold leading-tight text-primary-deep">Tidak ada foto</span>
      </div>
    );
  }
  return (
    <button type="button" onClick={onView} aria-label={`Perbesar ${label}`} className="shrink-0">
      <img src={url} alt={label} onError={() => setFailed(true)} className="h-14 w-20 rounded-control object-cover" />
    </button>
  );
}

// Satu file bukti: thumbnail kalau gambar (ketuk untuk memperbesar),
// ikon dokumen kalau bukan gambar (ketuk untuk membuka file).
// Foto yang gagal dimuat jadi ikon dokumen, bukan ikon rusak.
function EvidenceItem({
  file,
  onView,
  onRemove,
}: {
  file: EvidenceFile;
  onView: () => void;
  onRemove?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-button border border-hairline bg-surface p-2">
      {file.kind === 'image' && file.url && !failed ? (
        <button type="button" onClick={onView} aria-label={`Lihat ${file.name}`} className="shrink-0">
          <img
            src={file.url}
            alt={`Foto bukti kerja ${file.name}`}
            onError={() => setFailed(true)}
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

// Satu baris verifikasi absen: selfie + jam + jarak dari kantor.
// Dipakai di kartu karyawan dan di antrean persetujuan.
function VerificationRow({
  label,
  data,
  employeeName,
  onView,
}: {
  label: string;
  data: CheckVerification;
  employeeName: string;
  onView: (url: string, label: string) => void;
}) {
  const selfieLabel = `Selfie absen ${label.toLowerCase()} ${employeeName}`;
  return (
    <div className="flex items-center gap-3 rounded-button border border-hairline bg-surface p-2">
      <SelfieThumb
        url={data.selfieUrl}
        label={selfieLabel}
        onView={() => data.selfieUrl && onView(data.selfieUrl, selfieLabel)}
      />
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-ink">
          {label} {data.time} · {data.distanceMeters} m dari kantor
        </p>
        <p className="truncate text-sm text-ink-muted">{data.selfieName}</p>
      </div>
    </div>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  const isStaff = user?.role === 'Staff';
  const isBos = user?.role === 'Bos';
  const { records, requestLeave, setApproval, myCheckIn, evidenceByEmployee, verificationByRecord, addEvidence, removeEvidence, error: attendanceError, clearError, ensureMonth } = useAttendanceState();
  const [selectedDate, setSelectedDate] = useState(jakartaDate(0));
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null);
  const [note, setNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pindah bulan = muat bulan itu dari server (catatan + selfie +
  // bukti), supaya tanggal lama menampilkan data yang benar.
  useEffect(() => {
    void ensureMonth(selectedDate.slice(0, 7));
  }, [selectedDate, ensureMonth]);

  // Pengajuan Izin/Cuti (staf): tanggal + jenis. Pengajuan berstatus
  // pending sampai Bos menyetujui atau menolak.
  const [requestDate, setRequestDate] = useState(jakartaDate(0));
  const [requestType, setRequestType] = useState<'Izin' | 'Cuti'>('Izin');

  const dayRecords = useMemo(() => {
    const filtered = records.filter((r) => r.date === selectedDate);
    if (isStaff) {
      // Staf hanya lihat riwayat sendiri (akun staf = Budi Santoso, id 1).
      return filtered.filter((r) => r.employeeId === 1);
    }
    return filtered;
  }, [records, selectedDate, isStaff]);

  // Antrean persetujuan: semua catatan pending, semua tanggal.
  const pending = records.filter((r) => r.approval === 'pending');

  const employeeName = (id: number) => EMPLOYEES.find((e) => e.id === id)?.name ?? '-';
  const employeeDivision = (id: number) => EMPLOYEES.find((e) => e.id === id)?.division ?? '-';

  // Rekap bulan ini (per karyawan): hanya yang sudah disetujui yang
  // dihitung. Yang pending ditampilkan terpisah di bawah rekap.
  const monthPrefix = selectedDate.slice(0, 7);
  const monthApproved = records.filter((r) => r.date.startsWith(monthPrefix) && r.approval === 'approved');
  const monthPending = records.filter((r) => r.date.startsWith(monthPrefix) && r.approval === 'pending').length;
  const recap = useMemo(() => {
    const list = isStaff ? EMPLOYEES.filter((e) => e.id === 1) : EMPLOYEES;
    return list.map((e) => {
      const mine = monthApproved.filter((r) => r.employeeId === e.id);
      return {
        employee: e,
        hadir: mine.filter((r) => r.status === 'Hadir').length,
        telat: mine.filter((r) => r.status === 'Telat').length,
        izin: mine.filter((r) => r.status === 'Izin' || r.status === 'Cuti').length,
      };
    });
  }, [monthApproved, isStaff]);

  // Bukti kerja hari itu: berapa dari yang hadir (yang sudah
  // disetujui) yang sudah melampirkan bukti di tanggal itu.
  const presentToday = dayRecords.filter(
    (r) => (r.status === 'Hadir' || r.status === 'Telat') && r.approval === 'approved',
  );
  const withEvidenceToday = presentToday.filter(
    (r) => (evidenceByEmployee[r.employeeId] ?? []).some((f) => f.date === selectedDate),
  ).length;

  const myEvidence = (evidenceByEmployee[1] ?? []).filter((f) => f.date === jakartaDate(0));

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const existing = records.find((r) => r.employeeId === 1 && r.date === requestDate);
    if (existing) {
      setNote(`Tanggal ${formatDateID(requestDate)} sudah ada catatan absen, tidak bisa mengajukan lagi.`);
      return;
    }
    const ok = await requestLeave(1, requestDate, requestType);
    if (ok) {
      setNote(
        `Pengajuan ${requestType} untuk ${formatDateID(requestDate)} terkirim, menunggu persetujuan Bos.`,
      );
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const ok = await addEvidence(1, Array.from(files));
    if (ok) setNote(`${files.length} file bukti kerja ditambahkan.`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const viewFile = (file: EvidenceFile) => {
    if (!file.url) return;
    if (file.kind === 'image') {
      setLightbox({ url: file.url, label: `Foto bukti kerja ${file.name}` });
    } else {
      window.open(file.url, '_blank', 'noopener');
    }
  };

  const viewLightbox = (url: string, label: string) => setLightbox({ url, label });

  return (
    <div>
      <PageHeader
        title="Absensi"
        subtitle={isStaff ? 'Riwayat absensi Anda' : 'Daftar kehadiran karyawan per hari'}
      />

      {note ? (
        <p className="mb-6 rounded-button bg-primary-soft/60 px-4 py-3 text-base font-bold text-primary-deep">
          {note}
        </p>
      ) : null}

      {attendanceError ? (
        <p className="mb-6 rounded-button bg-error/10 px-4 py-3 text-base font-bold text-error">
          {attendanceError}{' '}
          <button type="button" onClick={clearError} className="underline">
            Tutup
          </button>
        </p>
      ) : null}

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

      {/* Form pengajuan Izin/Cuti (staf). */}
      {isStaff ? (
        <form
          onSubmit={handleRequest}
          className="entrance mb-6 space-y-4 rounded-card border border-hairline bg-surface p-5 shadow-card"
        >
          <h2 className="text-lg font-bold text-ink">Ajukan Izin / Cuti</h2>
          <p className="text-base text-ink-muted">
            Pengajuan menunggu persetujuan Bos. Sebelum disetujui, statusnya
            tampil sebagai Izin atau Cuti (menunggu).
          </p>
          <div>
            <label htmlFor="req-date" className="mb-2 block text-base font-bold text-ink">
              Tanggal
            </label>
            <input
              id="req-date"
              type="date"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
              className="min-h-[56px] w-full rounded-button border border-hairline bg-surface px-4 text-lg text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
          <div>
            <p className="mb-2 text-base font-bold text-ink">Jenis pengajuan</p>
            <SegmentedControl
              options={[
                { id: 'Izin', label: 'Izin' },
                { id: 'Cuti', label: 'Cuti' },
              ]}
              value={requestType}
              onChange={setRequestType}
              label="Jenis pengajuan"
            />
          </div>
          <BigButton type="submit" tone="primary" full>
            Kirim Pengajuan
          </BigButton>
        </form>
      ) : null}

      {/* Antrean persetujuan (Bos/Admin/Manager): semua catatan pending,
          semua tanggal. Tombol aksi hanya untuk Bos. */}
      {!isStaff && pending.length > 0 ? (
        <section className="entrance mb-6 rounded-card border border-warning/40 bg-surface p-5 shadow-card">
          <h2 className="text-lg font-bold text-ink">Menunggu persetujuan ({pending.length})</h2>
          <p className="mt-1 text-base text-ink-muted">
            {isBos
              ? 'Absen dan pengajuan Izin/Cuti di bawah ini menunggu keputusan Anda.'
              : 'Absen dan pengajuan Izin/Cuti di bawah ini menunggu persetujuan Bos.'}
          </p>
          <div className="mt-4 space-y-3">
            {pending.map((r) => {
              const v = verificationByRecord[verificationKey(r.employeeId, r.date)]?.masuk;
              const isLeave = r.status === 'Izin' || r.status === 'Cuti';
              return (
                <article
                  key={`${r.employeeId}-${r.date}`}
                  className="rounded-button border border-hairline bg-surface-soft p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-ink">{employeeName(r.employeeId)}</h3>
                      <p className="text-base text-ink-muted">{formatDateID(r.date)}</p>
                    </div>
                    <AttendanceBadge status={r.status} />
                  </div>
                  {isLeave ? (
                    <p className="mt-2 text-base text-ink">Pengajuan {r.status}.</p>
                  ) : (
                    <p className="mt-2 text-base text-ink">
                      Masuk {r.checkIn ?? '-'}
                      {r.checkOut ? `, pulang ${r.checkOut}` : ''}
                    </p>
                  )}
                  {!isLeave && v ? (
                    <div className="mt-3">
                      <VerificationRow
                        label="Masuk"
                        data={v}
                        employeeName={employeeName(r.employeeId)}
                        onView={viewLightbox}
                      />
                    </div>
                  ) : null}
                  {isBos ? (
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void setApproval(r.employeeId, r.date, 'approved')}
                        className="btn-press flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-success text-base font-bold text-white"
                      >
                        Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => void setApproval(r.employeeId, r.date, 'rejected')}
                        className="btn-press flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-error text-base font-bold text-white"
                      >
                        Tolak
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Pilih tanggal + hitungan bukti kerja. */}
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
          <p className="mt-3 rounded-button bg-surface-soft px-4 py-3 text-base text-ink">
            Bukti kerja: <span className="font-bold text-primary-deep tabular-nums">{withEvidenceToday} dari {presentToday.length}</span> yang
            hadir sudah melampirkan bukti.
          </p>
        ) : null}
      </div>

      {/* Daftar absen hari itu: kartu per karyawan, bukan tabel.
          Bos/Manager juga melihat bukti kerja tiap karyawan di kartunya. */}
      <h2 className="mb-4 text-xl font-bold text-ink">Absen {formatDateID(selectedDate)}</h2>
      {dayRecords.length === 0 ? (
        <EmptyState
          title="Belum ada data absen"
          body="Tidak ada absen di tanggal ini."
        />
      ) : (
        <div className="space-y-3">
          {dayRecords.map((r, i) => {
            const evidence = (evidenceByEmployee[r.employeeId] ?? []).filter((f) => f.date === selectedDate);
            const isLeave = r.status === 'Izin' || r.status === 'Cuti';
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
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <AttendanceBadge status={r.status} />
                    <ApprovalBadge approval={r.approval} />
                  </div>
                </div>
                {!isLeave ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-hairline pt-3 text-center">
                    <div>
                      <div className="text-sm font-semibold text-ink-muted">Masuk</div>
                      <div className="text-xl font-bold text-ink tabular-nums">
                        {r.checkIn ?? <span className="text-ink-subtle">-</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink-muted">Pulang</div>
                      <div className="text-xl font-bold text-ink tabular-nums">
                        {r.checkOut ?? <span className="text-ink-subtle">-</span>}
                      </div>
                    </div>
                  </div>
                ) : null}
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
                      const v = verificationByRecord[verificationKey(r.employeeId, r.date)];
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
                            <VerificationRow
                              key={label}
                              label={label}
                              data={data}
                              employeeName={employeeName(r.employeeId)}
                              onView={viewLightbox}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
                {isBos && r.approval === 'pending' ? (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void setApproval(r.employeeId, r.date, 'approved')}
                      className="btn-press flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-success text-base font-bold text-white"
                    >
                      Setujui
                    </button>
                    <button
                      type="button"
                      onClick={() => void setApproval(r.employeeId, r.date, 'rejected')}
                      className="btn-press flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-error text-base font-bold text-white"
                    >
                      Tolak
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {/* Rekap bulan ini: hanya yang sudah disetujui. */}
      <h2 className="mb-4 mt-8 text-xl font-bold text-ink">Rekap Bulan Ini</h2>
      {monthPending > 0 ? (
        <p className="mb-4 rounded-button bg-warning/10 px-4 py-3 text-base text-ink">
          Menunggu persetujuan Bos:{' '}
          <span className="font-bold text-warning-ink tabular-nums">{monthPending}</span> catatan bulan ini.
        </p>
      ) : null}
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

      {/* Lightbox: perbesar foto selfie absen atau bukti kerja. Labelnya
          mengikuti jenis foto (bukan selalu "Foto bukti kerja").
          Dirender lewat portal ke body, karena wrapper halaman punya
          transform (animasi page-enter) yang membuat position:fixed
          di dalamnya relatif ke halaman, bukan layar. */}
      {lightbox
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              onClick={() => setLightbox(null)}
              role="dialog"
              aria-label={`${lightbox.label} diperbesar`}
            >
              <img
                src={lightbox.url}
                alt={lightbox.label}
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
