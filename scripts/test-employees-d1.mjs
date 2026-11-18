// Uji live employee store D1-backed (18 Nov 2026):
// - API: GET /api/karyawan seed 5 karyawan (Dyas punya
//   view-marketing, Putra tidak); validasi POST/PUT ditolak.
// - UI: Admin tambah karyawan di konteks 1, terlihat di konteks 2
//   (HP lain) dan tetap ada setelah refresh. Admin mencentang
//   "Bisa lihat Pemasaran" untuk Putra di konteks 1, Staff (Putra)
//   di konteks 3 melihat Pemasaran di nav + bisa membuka
//   /pemasaran (capability tersimpan di server, bukan memori sesi).
// - Cleanup di akhir: centang Putra dikembalikan, karyawan tes
//   dihapus. D1 ditinggalkan berisi 5 karyawan awal saja.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.TEST_BASE ?? 'https://caturwangsa.pages.dev';
const API = process.env.TEST_API ?? 'https://stok-sabun-palem.zakyshadra.workers.dev';
const OUT = process.env.TEST_OUT ?? '/tmp/empd1-shots';
const EXE = process.env.TEST_EXE ?? '/home/ice/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const ok = [];
function check(name, cond, detail = '') {
  if (cond) {
    ok.push(name);
    console.log(`LOLOS: ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    errors.push(name);
    console.log(`GAGAL: ${name}${detail ? ` (${detail})` : ''}`);
  }
}

async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function loginAs(page, role) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  await page.waitForTimeout(1000);
}

// ---------- Cek API: seed + validasi ----------
const seed = await api('/api/karyawan');
check('api: GET /api/karyawan 200', seed.status === 200, `status ${seed.status}`);
check('api: seed 5 karyawan', Array.isArray(seed.data) && seed.data.length === 5, `${seed.data?.length} karyawan`);
const dyas = (seed.data ?? []).find((e) => e.name === 'Dyas Nakata');
const putra = (seed.data ?? []).find((e) => e.name === 'Putra');
check('api: Dyas punya capability view-marketing', (dyas?.capabilities ?? []).includes('view-marketing'));
check('api: Putra belum punya capability view-marketing', !(putra?.capabilities ?? []).includes('view-marketing'));
const badPost = await api('/api/karyawan', { method: 'POST', body: JSON.stringify({ name: '' }) });
check('api: POST nama kosong ditolak 400', badPost.status === 400, `status ${badPost.status}`);
const badPut = await api('/api/karyawan/999', { method: 'PUT', body: JSON.stringify({ name: 'X' }) });
check('api: PUT id tidak ada ditolak 404', badPut.status === 404, `status ${badPut.status}`);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// ---------- KONTEKS 1: Admin tambah karyawan tes ----------
const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const admin1 = await ctx1.newPage();
admin1.on('pageerror', (e) => errors.push(`admin1 pageerror: ${e.message}`));
admin1.on('dialog', (d) => d.accept());
await loginAs(admin1, 'Admin');
await admin1.goto(`${BASE}/karyawan`, { waitUntil: 'networkidle' });
await admin1.waitForTimeout(1200);
check('ui1: Admin melihat 5 kartu karyawan', (await admin1.locator('article').count()) === 5, `${await admin1.locator('article').count()} kartu`);
await admin1.getByRole('button', { name: '+ Tambah Karyawan' }).click();
await admin1.waitForTimeout(400);
await admin1.locator('#emp-name').fill('Tes D1');
await admin1.locator('#emp-pos').fill('Staff');
await admin1.getByRole('button', { name: 'Simpan', exact: true }).click();
await admin1.waitForTimeout(1200);
check('ui1: catatan "Tes D1 sudah ditambahkan" tampil', (await admin1.getByText('Tes D1 sudah ditambahkan.').count()) === 1);
check('ui1: kartu "Tes D1" tampil', (await admin1.locator('article', { hasText: 'Tes D1' }).count()) === 1);
await admin1.screenshot({ path: path.join(OUT, 'empd1-admin.png') });
// Refresh: karyawan tes tetap ada (tidak lagi session-only).
await admin1.reload({ waitUntil: 'networkidle' });
await admin1.waitForTimeout(1200);
check('ui1: setelah refresh, "Tes D1" tetap ada', (await admin1.locator('article', { hasText: 'Tes D1' }).count()) === 1);

// ---------- KONTEKS 2: Admin lain (HP lain) melihat karyawan tes ----------
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const admin2 = await ctx2.newPage();
admin2.on('pageerror', (e) => errors.push(`admin2 pageerror: ${e.message}`));
await loginAs(admin2, 'Admin');
await admin2.goto(`${BASE}/karyawan`, { waitUntil: 'networkidle' });
await admin2.waitForTimeout(1200);
check('ui2: konteks lain melihat "Tes D1"', (await admin2.locator('article', { hasText: 'Tes D1' }).count()) === 1);

// ---------- KONTEKS 1: centang capability Putra ----------
// Kembali ke konteks 1 (sudah di /karyawan setelah reload).
const putraCard = admin1.locator('article', { hasText: 'Putra' }).first();
await putraCard.getByRole('button', { name: 'Ubah', exact: true }).click();
await admin1.waitForTimeout(500);
const putraCheckbox = admin1.getByRole('checkbox', { name: 'Bisa lihat Pemasaran' });
check('ui1: checkbox Putra awalnya tidak tercentang', !(await putraCheckbox.isChecked()));
await putraCheckbox.check();
await admin1.getByRole('button', { name: 'Simpan', exact: true }).click();
await admin1.waitForTimeout(1200);
check('ui1: kartu Putra menampilkan "Bisa lihat Pemasaran"', (await admin1.locator('article', { hasText: 'Putra' }).getByText('Bisa lihat Pemasaran').count()) >= 1);

// ---------- KONTEKS 3: Staff (Putra) melihat Pemasaran ----------
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const staff = await ctx3.newPage();
staff.on('pageerror', (e) => errors.push(`staff pageerror: ${e.message}`));
await loginAs(staff, 'Staff');
const navLinks = await staff.locator('nav[aria-label="Navigasi utama"] a').count();
check('ui3: BottomNav Staff 6 item (Pemasaran muncul)', navLinks === 6, `${navLinks} item`);
await staff.goto(`${BASE}/pemasaran`, { waitUntil: 'networkidle' });
await staff.waitForTimeout(1200);
check('ui3: Staff (Putra) bisa membuka /pemasaran', staff.url() === `${BASE}/pemasaran`);
await staff.screenshot({ path: path.join(OUT, 'empd1-staff-nav.png') });

// ---------- Cleanup: kembalikan centang, hapus karyawan tes ----------
await admin1.goto(`${BASE}/karyawan`, { waitUntil: 'networkidle' });
await admin1.waitForTimeout(1000);
const putraCard2 = admin1.locator('article', { hasText: 'Putra' }).first();
await putraCard2.getByRole('button', { name: 'Ubah', exact: true }).click();
await admin1.waitForTimeout(500);
await admin1.getByRole('checkbox', { name: 'Bisa lihat Pemasaran' }).uncheck();
await admin1.getByRole('button', { name: 'Simpan', exact: true }).click();
await admin1.waitForTimeout(1200);
check('cleanup: centang Putra dikembalikan (kartu tanpa label Pemasaran)', (await admin1.locator('article', { hasText: 'Putra' }).getByText('Bisa lihat Pemasaran').count()) === 0);
const tesCard = admin1.locator('article', { hasText: 'Tes D1' }).first();
await tesCard.getByRole('button', { name: 'Hapus', exact: true }).click();
await admin1.waitForTimeout(1200);
check('cleanup: "Tes D1" terhapus', (await admin1.locator('article', { hasText: 'Tes D1' }).count()) === 0);
check('cleanup: catatan "Tes D1 sudah dihapus" tampil', (await admin1.getByText('Tes D1 sudah dihapus.').count()) === 1);
// Konteks 2 (HP lain) melihat hasil cleanup setelah refresh.
await admin2.reload({ waitUntil: 'networkidle' });
await admin2.waitForTimeout(1200);
check('cleanup: konteks lain tidak lagi melihat "Tes D1"', (await admin2.locator('article', { hasText: 'Tes D1' }).count()) === 0);
check('cleanup: konteks lain melihat 5 kartu karyawan', (await admin2.locator('article').count()) === 5);

// ---------- Cek API akhir: D1 kembali ke 5 karyawan awal ----------
const final = await api('/api/karyawan');
check('api-akhir: 5 karyawan', Array.isArray(final.data) && final.data.length === 5, `${final.data?.length} karyawan`);
const finalDyas = (final.data ?? []).find((e) => e.name === 'Dyas Nakata');
const finalPutra = (final.data ?? []).find((e) => e.name === 'Putra');
check('api-akhir: Dyas tetap punya view-marketing', (finalDyas?.capabilities ?? []).includes('view-marketing'));
check('api-akhir: Putra tidak punya view-marketing', !(finalPutra?.capabilities ?? []).includes('view-marketing'));

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
