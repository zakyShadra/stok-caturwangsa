// Halaman Karyawan (Admin/Bos/Manager). Daftar karyawan dalam bentuk
// kartu; tambah/ubah/hapus hanya Admin. Bos/Manager melihat saja
// (matriks peran, audit 18 Nov 2026). Form tambah/ubah punya checkbox
// "Bisa lihat Pemasaran" yang mengatur capability 'view-marketing'
// (analis baru tinggal centang, tanpa ubah kode). Daftar karyawan
// disimpan di EmployeesProvider supaya perubahan langsung terlihat
// di guard akses dalam sesi yang sama.
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useEmployees } from '../lib/employees';
import type { Employee } from '../lib/attendance';
import { BigButton, PageHeader } from '../components/ui';

// 'Umum' = divisi netral untuk karyawan yang divisinya belum
// dikonfirmasi (placeholder, bukan divisi beneran). Harus ada di
// daftar ini supaya form Ubah menampilkan nilai yang benar untuk
// karyawan placeholder; select tanpa opsi yang cocok tampil kosong.
const DIVISIONS = ['Produksi', 'Gudang', 'Admin', 'Sales', 'IT', 'Umum'];

const emptyForm = { name: '', division: 'Produksi', position: '', phone: '', marketing: false };

export default function Employees() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const { employees, addEmployee, updateEmployee, removeEmployee, error } = useEmployees();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [note, setNote] = useState('');
  // Mencegah simpan ganda kalau tombol ditekan dua kali cepat:
  // tiap simpan menulis ke server, jadi duplikat berarti dua karyawan.
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setNote('');
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({
      name: emp.name,
      division: emp.division,
      position: emp.position,
      phone: emp.phone,
      marketing: (emp.capabilities ?? []).includes('view-marketing'),
    });
    setShowForm(true);
    setNote('');
  };

  const handleDelete = async (id: number, name: string) => {
    if (
      !window.confirm(
        `Hapus ${name} dari daftar karyawan? Riwayat absennya akan kehilangan nama (tampil sebagai "-") dan tidak bisa dikembalikan. Kalau karyawan ini sudah tidak bekerja, lebih baik Nonaktifkan saja.`,
      )
    )
      return;
    const ok = await removeEmployee(id);
    if (ok) setNote(`${name} sudah dihapus.`);
  };

  const handleToggleActive = async (emp: Employee) => {
    const ok = await updateEmployee(emp.id, { active: !emp.active });
    if (ok) setNote(`${emp.name} sudah ${emp.active ? 'dinonaktifkan' : 'diaktifkan kembali'}.`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    // Capability 'view-marketing' dari checkbox; capability lain yang
    // sudah ada dipertahankan (jangan menimpa array-nya mentah-mentah).
    const kept = (
      editingId === null
        ? []
        : (employees.find((x) => x.id === editingId)?.capabilities ?? [])
    ).filter((c) => c !== 'view-marketing');
    const capabilities = form.marketing ? [...kept, 'view-marketing'] : kept;
    const data = {
      name: form.name,
      division: form.division,
      position: form.position,
      phone: form.phone,
      capabilities,
    };
    const ok =
      editingId === null
        ? await addEmployee(data)
        : await updateEmployee(editingId, data);
    setSaving(false);
    if (!ok) return; // pesan kegagalan tampil dari error provider
    setNote(
      editingId === null
        ? `${form.name} sudah ditambahkan.`
        : `${form.name} sudah diperbarui.`,
    );
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
          isAdmin ? (
            <BigButton tone="primary" onClick={openAdd} className="w-full sm:w-auto">
              + Tambah Karyawan
            </BigButton>
          ) : undefined
        }
      />

      {!isAdmin ? (
        <p className="mb-6 rounded-button bg-surface-soft px-4 py-3 text-base text-ink-muted">
          Mode lihat saja: hanya Admin yang bisa menambah, mengubah, atau menghapus karyawan.
        </p>
      ) : null}

      {note ? (
        <p className="mb-6 rounded-button bg-primary-soft/60 px-4 py-3 text-base font-bold text-primary-deep">
          {note}
        </p>
      ) : null}

      {error ? (
        <p className="mb-6 rounded-button bg-error/10 px-4 py-3 text-base font-bold text-error">
          {error}
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
          <div>
            <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-button border border-hairline bg-surface px-4">
              <input
                type="checkbox"
                checked={form.marketing}
                onChange={(e) => setForm({ ...form, marketing: e.target.checked })}
                className="h-5 w-5 accent-[#0F6F72]"
              />
              <span className="text-base font-bold text-ink">Bisa lihat Pemasaran</span>
            </label>
            <p className="mt-2 text-base text-ink-muted">
              Analis baru cukup dicentang di sini, tidak perlu ubah kode.
            </p>
          </div>
          <div className="flex gap-3">
            <BigButton type="submit" tone="primary" className="flex-1" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan'}
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
                  {e.phone ? `${e.division} · ${e.phone}` : e.division}
                </p>
                {(e.capabilities ?? []).includes('view-marketing') ? (
                  <p className="text-base font-bold text-primary-deep">Bisa lihat Pemasaran</p>
                ) : null}
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
            {isAdmin ? (
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
                  onClick={() => handleToggleActive(e)}
                  className="btn-press flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-info/10 text-base font-bold text-info-ink"
                >
                  {e.active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(e.id, e.name)}
                  className="btn-press flex min-h-[48px] flex-1 items-center justify-center rounded-button bg-error/10 text-base font-bold text-error"
                >
                  Hapus
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
