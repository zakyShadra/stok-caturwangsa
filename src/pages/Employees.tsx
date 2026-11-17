// Halaman Karyawan (Admin/Manager saja). Daftar karyawan dalam bentuk
// kartu, tambah/ubah lewat form, hapus lewat tombol di kartu.
import { useState } from 'react';
import { EMPLOYEES } from '../lib/attendance';
import type { Employee } from '../lib/attendance';
import { BigButton, PageHeader } from '../components/ui';

const DIVISIONS = ['Produksi', 'Gudang', 'Admin', 'Sales', 'IT'];

const emptyForm = { name: '', division: 'Produksi', position: '', phone: '' };

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>(EMPLOYEES);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [note, setNote] = useState('');

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setNote('');
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({ name: emp.name, division: emp.division, position: emp.position, phone: emp.phone });
    setShowForm(true);
    setNote('');
  };

  const handleDelete = (id: number, name: string) => {
    if (!window.confirm(`Hapus ${name} dari daftar karyawan?`)) return;
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setNote(`${name} sudah dihapus.`);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId === null) {
      const nextId = Math.max(...employees.map((x) => x.id), 0) + 1;
      setEmployees((prev) => [...prev, { id: nextId, ...form, active: true }]);
      setNote(`${form.name} sudah ditambahkan.`);
    } else {
      setEmployees((prev) => prev.map((x) => (x.id === editingId ? { ...x, ...form } : x)));
      setNote(`${form.name} sudah diperbarui.`);
    }
    setShowForm(false);
  };

  const inputCls =
    'min-h-[56px] w-full rounded-button border border-hairline bg-surface px-4 text-lg text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';
  const labelCls = 'mb-2 block text-base font-bold text-ink';

  return (
    <div>
      <PageHeader
        title="Karyawan"
        subtitle={`Total ${employees.length} karyawan`}
        action={
          <BigButton tone="primary" onClick={openAdd}>
            + Tambah Karyawan
          </BigButton>
        }
      />

      {note ? (
        <p className="mb-6 rounded-button bg-primary-soft/60 px-4 py-3 text-base font-bold text-primary-deep">
          {note}
        </p>
      ) : null}

      {showForm ? (
        <form
          onSubmit={handleSave}
          className="entrance mb-6 space-y-4 rounded-card border border-hairline bg-surface p-5 shadow-card"
        >
          <h2 className="text-lg font-bold text-ink">
            {editingId === null ? 'Tambah Karyawan' : 'Ubah Karyawan'}
          </h2>
          <div>
            <label htmlFor="emp-name" className={labelCls}>Nama lengkap</label>
            <input
              id="emp-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nama karyawan"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label htmlFor="emp-div" className={labelCls}>Divisi</label>
            <select
              id="emp-div"
              value={form.division}
              onChange={(e) => setForm({ ...form, division: e.target.value })}
              className={inputCls}
            >
              {DIVISIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="emp-pos" className={labelCls}>Jabatan</label>
            <input
              id="emp-pos"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
              placeholder="Jabatan"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="emp-phone" className={labelCls}>No. HP</label>
            <input
              id="emp-phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="08xx-xxxx-xxxx"
              className={inputCls}
            />
          </div>
          <div className="flex gap-3">
            <BigButton type="submit" tone="primary" className="flex-1">
              Simpan
            </BigButton>
            <BigButton type="button" tone="secondary" onClick={() => setShowForm(false)} className="flex-1">
              Batal
            </BigButton>
          </div>
        </form>
      ) : null}

      <div className="space-y-3">
        {employees.map((e, i) => (
          <article
            key={e.id}
            className="entrance rounded-card border border-hairline bg-surface p-4 shadow-card"
            style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-snug text-ink">{e.name}</h3>
                <p className="text-base text-ink-muted">{e.position}</p>
                <p className="text-base text-ink-muted">
                  {e.division} · {e.phone}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${
                  e.active ? 'bg-success/10 text-success-ink' : 'bg-info/10 text-info-ink'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${e.active ? 'bg-success' : 'bg-info'}`} />
                {e.active ? 'Aktif' : 'Tidak aktif'}
              </span>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => openEdit(e)}
                className="btn-press flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-primary-soft/60 text-base font-bold text-primary-deep"
              >
                Ubah
              </button>
              <button
                type="button"
                onClick={() => handleDelete(e.id, e.name)}
                className="btn-press flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-error/10 text-base font-bold text-error"
              >
                Hapus
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
