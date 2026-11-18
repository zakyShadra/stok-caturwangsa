// Halaman Laporan (Admin/Manager saja). Rekap kehadiran per periode,
// diurutkan dari yang paling sering telat, supaya yang perlu ditegur
// muncul duluan. Bisa diunduh sebagai CSV untuk dibuka di Excel.
import { useMemo, useState } from 'react';
import { EMPLOYEES, formatDateID, getAttendance, jakartaDate } from '../lib/attendance';
import { BigButton, PageHeader } from '../components/ui';

export default function Reports() {
  const [from, setFrom] = useState(jakartaDate(0));
  const [to, setTo] = useState(jakartaDate(0));
  const records = useMemo(() => getAttendance(), []);

  const filtered = useMemo(
    () => records.filter((r) => r.date >= from && r.date <= to),
    [records, from, to],
  );

  const rows = useMemo(
    () =>
      EMPLOYEES.map((e) => {
        const mine = filtered.filter((r) => r.employeeId === e.id);
        return {
          employee: e,
          hadir: mine.filter((r) => r.status === 'Hadir').length,
          telat: mine.filter((r) => r.status === 'Telat').length,
          izin: mine.filter((r) => r.status === 'Izin' || r.status === 'Cuti').length,
          total: mine.length,
        };
      }).sort((a, b) => b.telat - a.telat || b.izin - a.izin),
    [filtered],
  );

  const totals = rows.reduce(
    (acc, r) => ({
      hadir: acc.hadir + r.hadir,
      telat: acc.telat + r.telat,
      izin: acc.izin + r.izin,
      total: acc.total + r.total,
    }),
    { hadir: 0, telat: 0, izin: 0, total: 0 },
  );

  const downloadCSV = () => {
    const header = 'Nama,Divisi,Hadir,Telat,Izin/Cuti,Total Hari';
    const lines = rows.map(
      (r) => `${r.employee.name},${r.employee.division},${r.hadir},${r.telat},${r.izin},${r.total}`,
    );
    const csv = [header, ...lines, `TOTAL,,${totals.hadir},${totals.telat},${totals.izin},${totals.total}`].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-absensi-${from}-sampai-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const telatPeople = rows.filter((r) => r.telat > 0).length;
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
          {telatPeople > 0
            ? `${telatPeople} karyawan telat dalam periode ini, total ${totals.telat} kali telat dari ${totals.total} catatan absen. Diurutkan dari yang paling sering telat.`
            : `Tidak ada yang telat dalam periode ini (${totals.total} catatan absen).`}
        </p>
      </div>

      {/* Kartu per karyawan, diurutkan dari yang paling sering telat. */}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <article
            key={r.employee.id}
            className="entrance rounded-card border border-hairline bg-surface p-4 shadow-card"
            style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
          >
            <h3 className="text-lg font-bold text-ink">{r.employee.name}</h3>
            <p className="text-base text-ink-muted">{r.employee.division}</p>
            <div className="mt-3 grid grid-cols-4 gap-2 border-t border-hairline pt-3 text-center">
              <div>
                <div className="text-sm font-semibold text-ink-muted">Telat</div>
                <div className={`text-2xl font-bold tabular-nums ${r.telat > 0 ? 'text-warning' : 'text-ink'}`}>
                  {r.telat}
                </div>
              </div>
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
          </article>
        ))}
      </div>

      {/* Total keseluruhan. */}
      <div className="entrance mt-6 rounded-card border border-hairline bg-primary-soft/40 p-5 shadow-card">
        <h3 className="text-lg font-bold text-ink">TOTAL</h3>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-sm font-semibold text-ink-muted">Telat</div>
            <div className="text-2xl font-bold text-warning tabular-nums">{totals.telat}</div>
          </div>
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
      </div>
    </div>
  );
}
