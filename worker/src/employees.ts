// Endpoint karyawan Sabun Palem. Daftar karyawan tinggal di D1
// (database sabun-palem-absen, tabel employees), satu sumber
// kebenaran untuk halaman Karyawan + guard akses (capability
// 'view-marketing'). Sebelumnya daftar ini hanya hidup di memori
// sesi aplikasi: perubahan hilang saat refresh dan tidak terlihat
// di HP lain.
//
// Endpoint (dipasang di bawah /api/karyawan):
//   GET    /api/karyawan     -> daftar karyawan (seed otomatis dari
//                              5 karyawan awal kalau tabel kosong)
//   POST   /api/karyawan     -> tambah karyawan (id dari server)
//   PUT    /api/karyawan/:id -> ubah karyawan (sebagian boleh)
//   DELETE /api/karyawan/:id -> hapus karyawan
//
// Catatan hapus: catatan absen karyawan yang dihapus TIDAK ikut
// terhapus (tidak ada foreign key); nama karyawan di rekap lama
// tampil sebagai '-' (lihat employeeName di aplikasi). Menghapus
// karyawan yang masih punya catatan absen sebaiknya dihindari;
// pakai tombol Nonaktifkan di form (active=false) supaya riwayatnya
// tetap terbaca namanya.
import { Hono } from 'hono';
import type { AttendanceEnv } from './attendance';

// Data awal (seed), sama dengan EMPLOYEES di aplikasi: dipakai
// sekali saat tabel kosong, lalu D1 yang menjadi sumber kebenaran.
// Kalau seed ini berubah, ubah juga EMPLOYEES di aplikasi supaya
// cadangan lokalnya (saat API tidak bisa dihubungi) tetap sama.
const SEED: {
  id: number;
  name: string;
  division: string;
  position: string;
  phone: string;
  capabilities: string[];
}[] = [
  { id: 1, name: 'Putra', division: 'Umum', position: 'Staff', phone: '', capabilities: [] },
  { id: 2, name: 'Dyas Nakata', division: 'Umum', position: 'Staff', phone: '', capabilities: ['view-marketing'] },
  { id: 3, name: 'Pak Andy', division: 'Umum', position: 'Staff', phone: '', capabilities: [] },
  { id: 4, name: 'Maya Putri', division: 'Admin', position: 'Staff Administrasi', phone: '0817-6789-0123', capabilities: [] },
  { id: 5, name: 'Zaky Shadra', division: 'IT', position: 'Admin', phone: '', capabilities: [] },
];

interface EmployeeRow {
  id: number;
  name: string;
  division: string;
  position: string;
  phone: string;
  active: number;
  capabilities: string; // teks JSON (array string)
}

interface EmployeeJson {
  id: number;
  name: string;
  division: string;
  position: string;
  phone: string;
  active: boolean;
  capabilities: string[];
}

function jsonError(c: { json: (body: object, status: number) => Response }, status: number, message: string) {
  return c.json({ error: message }, status);
}

function parseCapabilities(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === 'string');
    return [];
  } catch {
    return [];
  }
}

function toJson(row: EmployeeRow): EmployeeJson {
  return {
    id: row.id,
    name: row.name,
    division: row.division,
    position: row.position,
    phone: row.phone,
    active: row.active === 1,
    capabilities: parseCapabilities(row.capabilities),
  };
}

// Validasi isi karyawan dari request. Mode 'create' mewajibkan
// nama; mode 'update' membolehkan sebagian (hanya field yang ada
// yang divalidasi). Kembalikan pesan error atau null kalau benar.
function validateEmployee(
  body: Record<string, unknown>,
  mode: 'create' | 'update',
): string | null {
  const strField = (key: string, max: number, required: boolean): string | null => {
    const v = body[key];
    if (v === undefined) return required ? `${key} wajib diisi` : null;
    if (typeof v !== 'string' || (required && v.trim() === '') || v.length > max) {
      return `${key} tidak benar (maksimal ${max} karakter)`;
    }
    return null;
  };
  const badName = strField('name', 100, mode === 'create');
  if (badName) return badName;
  for (const key of ['division', 'position', 'phone'] as const) {
    const bad = strField(key, 100, false);
    if (bad) return bad;
  }
  if (body.capabilities !== undefined) {
    if (
      !Array.isArray(body.capabilities) ||
      body.capabilities.some((c) => typeof c !== 'string' || c.length === 0 || c.length > 50)
    ) {
      return 'capabilities harus array string (maksimal 50 karakter tiap item)';
    }
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') {
    return 'active harus boolean';
  }
  return null;
}

export const employeesRoutes = new Hono<{ Bindings: AttendanceEnv }>();

// GET /api/karyawan: daftar semua karyawan, urut id. Kalau tabel
// masih kosong (pertama kali), isi dari SEED dulu supaya aplikasi
// langsung menampilkan 5 karyawan yang sama seperti sebelumnya.
employeesRoutes.get('/', async (c) => {
  const db = c.env.sabun_palem_absen;
  try {
    const count = await db
      .prepare('SELECT COUNT(*) AS n FROM employees')
      .first<{ n: number }>();
    if ((count?.n ?? 0) === 0) {
      const stmts = SEED.map((e) =>
        db
          .prepare(
            'INSERT INTO employees (id, name, division, position, phone, active, capabilities) VALUES (?, ?, ?, ?, ?, 1, ?)',
          )
          .bind(e.id, e.name, e.division, e.position, e.phone, JSON.stringify(e.capabilities)),
      );
      await db.batch(stmts);
    }
    const rows = await db
      .prepare('SELECT * FROM employees ORDER BY id ASC')
      .all<EmployeeRow>();
    return c.json((rows.results ?? []).map(toJson));
  } catch (e) {
    console.error('GET /api/karyawan gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal membaca daftar karyawan dari database');
  }
});

// POST /api/karyawan: tambah satu karyawan. ID dari server
// (max+1) supaya dua HP yang menambah bersamaan tidak bentrok.
employeesRoutes.post('/', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  const invalid = validateEmployee(body, 'create');
  if (invalid) return jsonError(c, 400, invalid);
  const db = c.env.sabun_palem_absen;
  try {
    const max = await db
      .prepare('SELECT MAX(id) AS m FROM employees')
      .first<{ m: number | null }>();
    const id = (max?.m ?? 0) + 1;
    const capabilities = Array.isArray(body.capabilities) ? body.capabilities : [];
    await db
      .prepare(
        'INSERT INTO employees (id, name, division, position, phone, active, capabilities) VALUES (?, ?, ?, ?, ?, 1, ?)',
      )
      .bind(
        id,
        (body.name as string).trim(),
        typeof body.division === 'string' ? body.division : '',
        typeof body.position === 'string' ? body.position : '',
        typeof body.phone === 'string' ? body.phone : '',
        JSON.stringify(capabilities),
      )
      .run();
    const row = await db
      .prepare('SELECT * FROM employees WHERE id = ?')
      .bind(id)
      .first<EmployeeRow>();
    if (!row) return jsonError(c, 502, 'Karyawan gagal disimpan');
    return c.json(toJson(row));
  } catch (e) {
    console.error('POST /api/karyawan gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal menambah karyawan');
  }
});

// PUT /api/karyawan/:id: ubah sebagian atau seluruh field karyawan.
employeesRoutes.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) {
    return jsonError(c, 400, 'id tidak benar');
  }
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return jsonError(c, 400, 'Isi request bukan JSON yang benar');
  }
  const invalid = validateEmployee(body, 'update');
  if (invalid) return jsonError(c, 400, invalid);
  const db = c.env.sabun_palem_absen;
  try {
    const existing = await db
      .prepare('SELECT * FROM employees WHERE id = ?')
      .bind(id)
      .first<EmployeeRow>();
    if (!existing) return jsonError(c, 404, 'Karyawan tidak ditemukan');
    const next = {
      name: typeof body.name === 'string' ? body.name.trim() : existing.name,
      division: typeof body.division === 'string' ? body.division : existing.division,
      position: typeof body.position === 'string' ? body.position : existing.position,
      phone: typeof body.phone === 'string' ? body.phone : existing.phone,
      active: typeof body.active === 'boolean' ? (body.active ? 1 : 0) : existing.active,
      capabilities: Array.isArray(body.capabilities)
        ? JSON.stringify(body.capabilities)
        : existing.capabilities,
    };
    await db
      .prepare(
        'UPDATE employees SET name = ?, division = ?, position = ?, phone = ?, active = ?, capabilities = ? WHERE id = ?',
      )
      .bind(next.name, next.division, next.position, next.phone, next.active, next.capabilities, id)
      .run();
    const row = await db
      .prepare('SELECT * FROM employees WHERE id = ?')
      .bind(id)
      .first<EmployeeRow>();
    if (!row) return jsonError(c, 502, 'Karyawan gagal diperbarui');
    return c.json(toJson(row));
  } catch (e) {
    console.error('PUT /api/karyawan gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal mengubah karyawan');
  }
});

// DELETE /api/karyawan/:id: hapus satu karyawan dari daftar.
// Catatan absennya tidak ikut terhapus (lihat catatan di atas).
employeesRoutes.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id < 1) {
    return jsonError(c, 400, 'id tidak benar');
  }
  const db = c.env.sabun_palem_absen;
  try {
    const res = await db.prepare('DELETE FROM employees WHERE id = ?').bind(id).run();
    if ((res.meta.changes ?? 0) === 0) {
      return jsonError(c, 404, 'Karyawan tidak ditemukan');
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/karyawan gagal:', e instanceof Error ? e.message : e);
    return jsonError(c, 502, 'Gagal menghapus karyawan');
  }
});
