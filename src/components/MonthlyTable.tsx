// Tampilan bulanan: stok akhir tiap produk per tanggal. Baris = produk,
// kolom = tanggal, sel = stok akhir hari itu + selisih dibanding hari
// sebelumnya.
//
// Geser di HP: kolom tanggal dikelompokkan per 3 kolom (satu panel
// 192px, muat dalam area geser HP) dan panel-panel itu adalah titik
// snap, jadi sekali geser pindah 3 tanggal. Di layar lebar panelnya
// 4 kolom (256px). Kolom nama produk berada di luar area geser,
// sehingga selalu kelihatan saat menggeser tanggal.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { MonthlyData } from '../lib/types';

const TZ = 'Asia/Jakarta';
const DATE_COL_PX = 64;

function currentMonthKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthTitle(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="block text-xs text-ink-subtle">-</span>;
  if (value > 0) return <span className="block text-xs font-bold text-success">+{value}</span>;
  if (value < 0) return <span className="block text-xs font-bold text-warning">{value}</span>;
  return <span className="block text-xs font-bold text-ink-subtle">0</span>;
}

export default function MonthlyTable() {
  const [month, setMonth] = useState(currentMonthKey);
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Panel snap harus muat dalam area geser supaya sekali geser pindah
  // satu panel penuh: 3 kolom di HP (192px), 4 kolom di layar lebar.
  const [colsPerPanel, setColsPerPanel] = useState(4);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setColsPerPanel(mq.matches ? 3 : 4);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getMonthly(month)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError('Gagal memuat data bulanan.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  const isCurrentMonth = month === currentMonthKey();

  // Kelompokkan tanggal per panel untuk titik snap.
  const panels = useMemo(() => {
    if (!data) return [];
    const groups: number[][] = [];
    for (let d = 1; d <= data.days; d += colsPerPanel) {
      const group: number[] = [];
      for (let i = 0; i < colsPerPanel && d + i <= data.days; i++) {
        group.push(d + i);
      }
      groups.push(group);
    }
    return groups;
  }, [data, colsPerPanel]);

  return (
    <div>
      {/* Navigasi bulan. */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonthKey(m, -1))}
          aria-label="Bulan sebelumnya"
          className="btn-press flex min-h-[48px] min-w-[48px] items-center justify-center rounded-button border border-hairline bg-surface text-2xl font-bold text-ink"
        >
          ‹
        </button>
        <h2 className="text-xl font-bold text-ink">{monthTitle(month)}</h2>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonthKey(m, 1))}
          disabled={isCurrentMonth}
          aria-label="Bulan berikutnya"
          className="btn-press flex min-h-[48px] min-w-[48px] items-center justify-center rounded-button border border-hairline bg-surface text-2xl font-bold text-ink disabled:opacity-40"
        >
          ›
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-lg text-ink-muted">Memuat data bulanan...</p>
      ) : error || !data ? (
        <p className="py-10 text-center text-lg text-ink-muted">
          {error ?? 'Data bulanan tidak tersedia.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
          <div className="flex">
            {/* Kolom nama produk: di luar area geser, selalu kelihatan. */}
            <div className="w-[132px] shrink-0 border-r border-hairline">
              <div className="flex h-10 items-center border-b border-hairline bg-surface-soft px-3 text-sm font-bold text-ink">
                Produk
              </div>
              {data.products.map((p) => (
                <div
                  key={p.id}
                  className="flex h-12 items-center border-b border-hairline px-3 last:border-b-0"
                >
                  <span className="text-sm font-bold leading-tight text-ink line-clamp-2">
                    {p.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Area tanggal: geser horizontal, snap tiap 4 kolom. */}
            <div
              className="min-w-0 flex-1 overflow-x-auto snap-x snap-mandatory"
              data-testid="monthly-scroller"
            >
              <div className="flex w-max">
                {panels.map((days) => (
                  <div
                    key={days[0]}
                    className="shrink-0 snap-start border-r border-hairline last:border-r-0"
                    style={{ width: days.length * DATE_COL_PX }}
                  >
                    <div className="flex h-10 border-b border-hairline bg-surface-soft">
                      {days.map((d) => (
                        <div
                          key={d}
                          className="flex items-center justify-center text-sm font-bold text-ink"
                          style={{ width: DATE_COL_PX }}
                        >
                          {d}
                        </div>
                      ))}
                    </div>
                    {data.products.map((p) => (
                      <div key={p.id} className="flex h-12 border-b border-hairline last:border-b-0">
                        {days.map((d) => {
                          const cell = p.daily[d - 1];
                          return (
                            <div
                              key={d}
                              className="flex flex-col items-center justify-center"
                              style={{ width: DATE_COL_PX }}
                            >
                              {cell.stock === null ? (
                                <span className="text-base text-ink-subtle">-</span>
                              ) : (
                                <>
                                  <span className="text-base font-bold leading-none tabular-nums text-ink">
                                    {cell.stock}
                                  </span>
                                  <Delta value={cell.delta} />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-base text-ink-muted">
        Angka = stok akhir hari itu. Angka kecil di bawahnya = selisih dibanding hari sebelumnya
        (hijau naik, oranye turun).
      </p>
    </div>
  );
}
