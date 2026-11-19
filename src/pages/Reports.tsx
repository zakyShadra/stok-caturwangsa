// Halaman Laporan (Admin/Bos/Manager). Rekap kehadiran per periode,
// diurutkan dari yang paling sedikit hadir, supaya yang perlu
// diperhatikan muncul duluan. Bisa diunduh sebagai CSV untuk dibuka
// di Excel. Hanya catatan yang sudah disetujui Bos yang dihitung;
// yang pending ditampilkan terpisah, yang ditolak tidak dihitung.
import { useEffect, useMemo, useState } from 'react';
import { formatDateID, jakartaDate } from '../lib/attendance';
import { useAttendanceState } from '../lib/attendance-state';
import { useEmployees } from '../lib/employees';
import { BigButton, PageHeader } from '../components/ui';

export default function Reports() {
  const [from, setFrom] = useState(jakartaDate(0));
  const [to, setTo] = useState(jakartaDate(0));
  const { records, ensureMonth } = useAttendanceState();
  const { employees } = useEmployees();

  // Rentang bisa melewati bulan berjalan: muat SEMUA bulan di antara
  // tanggal awal dan akhir, bukan cuma dua ujungnya, supaya bulan
  // tengah tidak hilang dari total dan CSV.
  useEffect(() => {
    const start = from.slice(0, 7);
    const end = to.slice(0, 7);
    if (start > end) return;
    let [y, m] = start.split('-').map(Number);
    const [y1, m1] = end.split('-').map(Number);
    while (y < y1 || (y === y1 && m <= m1)) {
      void ensureMonth(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }, [from, to, ensureMonth]);

  const filtered = useMemo(
    () => records.filter((r) => r.date >= from && r.date <= to),
    [records, from, to],
  );

  const rows = useMemo(
    () =>
      employees.map((e) => {
        const mine = filtered.filter((r) => r.employeeId === e.id);
        const approved = mine.filter((r) => r.approval === 'approved');
        return {
          employee: e,
          hadir: approved.filter((r) => r.status === 'Hadir').length,
          izin: approved.filter((r) => r.status === 'Izin' || r.status === 'Cuti').length,
          pending: mine.filter((r) => r.approval === 'pending').length,
          total: approved.length,
        };
      }).sort((a, b) => a.hadir - b.hadir || b.izin - a.izin),
    [filtered, employees],
  );

  const totals = rows.reduce(
    (acc, r) => ({
      hadir: acc.hadir + r.hadir,
      izin: acc.izin + r.izin,
      pending: acc.pending + r.pending,
      total: acc.total + r.total,
    }),
    { hadir: 0, izin: 0, pending: 0, total: 0 },
  );

  const downloadCSV = () => {
    const header = 'Nama,Divisi,Hadir,Izin/Cuti,Menunggu Persetujuan,Total Hari';
    const lines = rows.map(
      (r) => `${r.employee.name},${r.employee.division},${r.hadir},${r.izin},${r.pending},${r.total}`,
    );
    const csv = [header, ...lines, `TOTAL,,${totals.hadir},${totals.izin},${totals.pending},${totals.total}`].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-absensi-${from}-sampai-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls =
    'min-h-[56px] w-full rounded-button border border-hairline bg-surface px-4 text-lg text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';

  return (
    <div>
      <PageHeader title="Laporan" subtitle="Rekap kehadiran per periode" />

      {/* Pilih periode + unduh CSV. */}
      <div className="entrance mb-6 rounded-card border border-hairline bg-surface p-5 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="from" className="mb-2 block text-base font-bold text-ink">
              Dari tanggal
            </label>
            <input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="to" className="mb-2 block text-base font-bold text-ink">
              Sampai tanggal
            </label>
            <input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        {from > to ? (
          <p className="mt-4 rounded-button bg-warning/10 px-4 py-3 text-base font-bold text-warning-ink">
            Tanggal awal lebih besar dari tanggal akhir, laporan kosong.
            Perbaiki rentangnya dulu.
          </p>
        ) : null}
        <div className="mt-4">
          <BigButton tone="primary" full onClick={downloadCSV}>
            Unduh CSV (untuk Excel)
          </BigButton>
        </div>
      </div>

      {/* Kalimat ringkasan: inti laporan dalam satu kalimat. */}
      <div className="entrance mb-6 rounded-card border border-hairline bg-surface-soft p-5">
        <p className="text-lg font-bold text-ink">
          Rekap {formatDateID(from)} sampai {formatDateID(to)}
        </p>
        <p className="mt-1 text-base text-ink-muted">
          {totals.total} catatan absen yang sudah disetujui dalam periode ini: {totals.hadir} hadir
          dan {totals.izin} izin/cuti. Diurutkan dari yang paling sedikit hadir.
        </p>
        {totals.pending > 0 ? (
          <p className="mt-2 text-base text-ink-muted">
            Menunggu persetujuan Bos:{' '}
            <span className="font-bold text-warning-ink tabular-nums">{totals.pending}</span> catatan
            belum masuk hitungan.
          </p>
        ) : null}
      </div>

      {/* Kartu per karyawan, diurutkan dari yang paling sedikit hadir. */}
      <div className="space-y-3">
        {rows.map((r, i) => (
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
                <div className="text-sm font-semibold text-ink-muted">Izin / Cuti</div>
                <div className="text-2xl font-bold text-info tabular-nums">{r.izin}</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-ink-muted">Total</div>
                <div className="text-2xl font-bold text-ink tabular-nums">{r.total}</div>
              </div>
            </div>
            {r.pending > 0 ? (
              <p className="mt-3 text-base text-ink-muted">
                Menunggu persetujuan:{' '}
                <span className="font-bold text-warning-ink tabular-nums">{r.pending}</span> catatan.
              </p>
            ) : null}
          </article>
        ))}
      </div>

      {/* Total keseluruhan. */}
      <div className="entrance mt-6 rounded-card border border-hairline bg-primary-soft/40 p-5 shadow-card">
        <h3 className="text-lg font-bold text-ink">TOTAL</h3>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-sm font-semibold text-ink-muted">Hadir</div>
            <div className="text-2xl font-bold text-success tabular-nums">{totals.hadir}</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-muted">Izin / Cuti</div>
            <div className="text-2xl font-bold text-info tabular-nums">{totals.izin}</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-muted">Total</div>
            <div className="text-2xl font-bold text-ink tabular-nums">{totals.total}</div>
          </div>
        </div>
        {totals.pending > 0 ? (
          <p className="mt-3 text-base text-ink-muted">
            Menunggu persetujuan:{' '}
            <span className="font-bold text-warning-ink tabular-nums">{totals.pending}</span> catatan.
          </p>
        ) : null}
      </div>
    </div>
  );
}
