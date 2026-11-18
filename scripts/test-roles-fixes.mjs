// Uji live perbaikan peran (audit 18 Nov 2026) terhadap pages.dev:
// - Fix 1: Admin check-in masuk antrean Bos, disetujui, masuk Laporan.
//   Manager TIDAK punya kartu "Absen saya" dan TIDAK punya form Izin/Cuti.
// - Fix 2: Bos/Manager melihat /karyawan read-only ("Mode lihat saja"),
//   tanpa tombol Tambah/Ubah/Hapus. Staff dialihkan ke Beranda.
// - Fix 3: Staff melihat "Selfie absen" di kartu absennya sendiri.
// - Fix 4: Staff tanpa capability tidak melihat Pemasaran (nav + route
//   guard). Admin mencentang "Bisa lihat Pemasaran" untuk Putra, lalu
//   Staff (Putra) melihat Pemasaran dalam sesi yang sama.
// - Fix 5: Manager menandai bukti kerja Putra "sudah dicek", badge
//   terlihat Bos dari konteks lain (server-backed).
// Prasyarat: Worker terbaru sudah di-deploy (endpoint evidence-review +
// tabel evidence_reviews), D1 kosong sebelum tes. BASE/EXE/OUT/SELFIE
// bisa diubah lewat env. Setelah tes, hapus data tes dari D1
// (lihat cleanup di akhir: script TIDAK menghapus sendiri).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.TEST_BASE ?? 'https://caturwangsa.pages.dev';
const OUT = process.env.TEST_OUT ?? '/tmp/rolefix-shots';
const EXE = process.env.TEST_EXE ?? '/home/ice/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const SELFIE = process.env.TEST_SELFIE ?? '/home/ice/Projects/stok-caturwangsa/public/logo.png';
const OFFICE = { latitude: -6.93789, longitude: 107.59914 };

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

async function loginAs(page, role) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  await page.waitForTimeout(1000);
}

// Login TANPA page.goto: dipakai setelah pemberian capability lewat
// form, supaya state EmployeesProvider (in-memory, hilang saat reload)
// tidak ter-reset. Prasyarat: halaman sudah di /login (logout
// client-side mengarah ke sana tanpa reload).
async function loginAsClientSide(page, role) {
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  await page.waitForTimeout(1000);
}

async function doCheckIn(page) {
  await page.getByRole('button', { name: 'Absen Masuk', exact: true }).click();
  await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.setInputFiles('input[type="file"]', SELFIE);
  await page.getByRole('button', { name: 'Ini Foto Saya' }).click({ timeout: 10000 });
  await page.getByRole('button', { name: 'Absen berhasil' }).waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// ---------- KONTEKS 1: Admin check-in + form karyawan ----------
const ctxAdmin = await browser.newContext({ viewport: { width: 1280, height: 800 }, geolocation: OFFICE, permissions: ['geolocation'] });
const admin = await ctxAdmin.newPage();
admin.on('pageerror', (e) => errors.push(`admin pageerror: ${e.message}`));
await loginAs(admin, 'Admin');
check('fix1: Admin melihat kartu "Absen saya"', (await admin.getByText('Absen saya', { exact: true }).count()) === 1);
await admin.goto(`${BASE}/absensi`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(1000);
check('fix1: Admin melihat form "Ajukan Izin / Cuti"', (await admin.getByText('Ajukan Izin / Cuti', { exact: true }).count()) === 1);
await admin.goto(`${BASE}/karyawan`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(800);
check('fix2: Admin melihat tombol "+ Tambah Karyawan"', (await admin.getByRole('button', { name: '+ Tambah Karyawan' }).count()) === 1);
check('fix2: Admin melihat tombol Ubah di kartu karyawan', (await admin.getByRole('button', { name: 'Ubah', exact: true }).count()) >= 1);
check('fix4: kartu Dyas menampilkan "Bisa lihat Pemasaran"', (await admin.getByText('Bisa lihat Pemasaran').count()) >= 1);
// Buka form Ubah Dyas: checkbox tercen tang.
const dyasCard = admin.locator('article', { hasText: 'Dyas Nakata' }).first();
await dyasCard.getByRole('button', { name: 'Ubah', exact: true }).click();
await admin.waitForTimeout(500);
const dyasCheckbox = admin.getByRole('checkbox', { name: 'Bisa lihat Pemasaran' });
check('fix4: form Ubah punya checkbox "Bisa lihat Pemasaran"', (await dyasCheckbox.count()) === 1);
check('fix4: checkbox Dyas tercentang (capability dari data awal)', await dyasCheckbox.isChecked());
await admin.getByRole('button', { name: 'Batal' }).click();
await admin.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(800);
await doCheckIn(admin);
check('fix1: Admin check-in berhasil (tombol jadi "Absen berhasil")', true);
await admin.screenshot({ path: path.join(OUT, 'admin-checkin.png') });

// ---------- KONTEKS 2: Staff check-in + bukti + selfie sendiri ----------
const ctxStaff = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: OFFICE, permissions: ['geolocation'] });
const staff = await ctxStaff.newPage();
staff.on('pageerror', (e) => errors.push(`staff pageerror: ${e.message}`));
await loginAs(staff, 'Staff');
const navLinks = await staff.locator('nav[aria-label="Navigasi utama"] a').count();
check('fix4: BottomNav Staff 5 item (tanpa Pemasaran)', navLinks === 5, `${navLinks} item`);
check('fix4: Staff tidak melihat label Pemasaran di nav bawah', (await staff.locator('nav[aria-label="Navigasi utama"]', { hasText: 'Pemasaran' }).count()) === 0);
await staff.goto(`${BASE}/pemasaran`, { waitUntil: 'networkidle' });
await staff.waitForTimeout(800);
check('fix4: Staff buka /pemasaran dialihkan ke Beranda', staff.url() === `${BASE}/`);
await staff.goto(`${BASE}/karyawan`, { waitUntil: 'networkidle' });
await staff.waitForTimeout(800);
check('fix2: Staff buka /karyawan dialihkan ke Beranda', staff.url() === `${BASE}/`);
await staff.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await staff.waitForTimeout(800);
await doCheckIn(staff);
check('fix1: Staff check-in berhasil', true);
// Upload bukti kerja.
await staff.goto(`${BASE}/absensi`, { waitUntil: 'networkidle' });
await staff.waitForTimeout(1000);
await staff.setInputFiles('input[type="file"]', SELFIE);
await staff.waitForTimeout(2000);
check('fix5: Staff upload bukti kerja (nama file tampil)', (await staff.getByText('logo.png').count()) >= 1);
check('fix3: Staff melihat "Selfie absen" di kartunya sendiri', (await staff.getByText('Selfie absen', { exact: true }).count()) >= 1);
await staff.screenshot({ path: path.join(OUT, 'staff-selfie.png') });

// ---------- KONTEKS 3: Bos approve + karyawan view-only + laporan ----------
const ctxBos = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const bos = await ctxBos.newPage();
bos.on('pageerror', (e) => errors.push(`bos pageerror: ${e.message}`));
await loginAs(bos, 'Bos');
await bos.goto(`${BASE}/absensi`, { waitUntil: 'networkidle' });
await bos.waitForTimeout(1500);
check('fix1: Bos melihat antrean menunggu persetujuan (2)', (await bos.getByText('Menunggu persetujuan (2)').count()) >= 1);
check('fix1: antrean berisi Zaky Shadra', (await bos.getByText('Zaky Shadra').count()) >= 1);
await bos.screenshot({ path: path.join(OUT, 'bos-queue.png') });
const zakyArticle = bos.locator('article', { hasText: 'Zaky Shadra' }).first();
await zakyArticle.getByRole('button', { name: 'Setujui', exact: true }).click();
await bos.waitForTimeout(1200);
check('fix1: setelah disetujui, badge "Disetujui" tampil untuk Zaky', (await bos.locator('article', { hasText: 'Zaky Shadra' }).getByText('Disetujui', { exact: true }).count()) >= 1);
const putraArticle = bos.locator('article', { hasText: 'Putra' }).first();
await putraArticle.getByRole('button', { name: 'Setujui', exact: true }).click();
await bos.waitForTimeout(1200);
check('fix1: antrean menunggu persetujuan habis setelah keduanya disetujui', (await bos.getByText('Menunggu persetujuan (').count()) === 0);
await bos.goto(`${BASE}/karyawan`, { waitUntil: 'networkidle' });
await bos.waitForTimeout(800);
check('fix2: Bos melihat daftar karyawan (Zaky Shadra tampil)', (await bos.getByText('Zaky Shadra').count()) >= 1);
check('fix2: Bos melihat catatan "Mode lihat saja"', (await bos.getByText(/Mode lihat saja/).count()) >= 1);
check('fix2: Bos TIDAK melihat tombol "+ Tambah Karyawan"', (await bos.getByRole('button', { name: '+ Tambah Karyawan' }).count()) === 0);
check('fix2: Bos TIDAK melihat tombol Ubah/Hapus', (await bos.getByRole('button', { name: 'Ubah', exact: true }).count()) === 0 && (await bos.getByRole('button', { name: 'Hapus', exact: true }).count()) === 0);
await bos.screenshot({ path: path.join(OUT, 'bos-karyawan-viewonly.png') });
await bos.goto(`${BASE}/laporan`, { waitUntil: 'networkidle' });
await bos.waitForTimeout(1200);
const reportText = await bos.evaluate(() => document.body.textContent ?? '');
check('fix1: Laporan menampilkan Zaky Shadra', reportText.includes('Zaky Shadra'));
await bos.screenshot({ path: path.join(OUT, 'bos-laporan-zaky.png') });

// ---------- KONTEKS 4: Manager tanpa absen + tandai bukti ----------
const ctxMgr = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mgr = await ctxMgr.newPage();
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await loginAs(mgr, 'Manager');
check('koreksi1: Manager TIDAK melihat kartu "Absen saya"', (await mgr.getByText('Absen saya', { exact: true }).count()) === 0);
await mgr.goto(`${BASE}/absensi`, { waitUntil: 'networkidle' });
await mgr.waitForTimeout(1200);
check('koreksi1: Manager TIDAK melihat form "Ajukan Izin / Cuti"', (await mgr.getByText('Ajukan Izin / Cuti', { exact: true }).count()) === 0);
check('fix5: Manager melihat tombol "Tandai sudah dicek" di kartu Putra', (await mgr.getByRole('button', { name: 'Tandai sudah dicek' }).count()) >= 1);
check('fix5: Manager TIDAK melihat tombol Setujui', (await mgr.getByRole('button', { name: 'Setujui', exact: true }).count()) === 0);
await mgr.getByRole('button', { name: 'Tandai sudah dicek' }).first().click();
await mgr.waitForTimeout(1500);
check('fix5: setelah ditandai, badge "Sudah dicek Manager" tampil', (await mgr.getByText('Sudah dicek Manager').count()) >= 1);
await mgr.screenshot({ path: path.join(OUT, 'manager-review.png') });
// Bos (konteks lain) melihat badge yang sama: server-backed.
await bos.goto(`${BASE}/absensi`, { waitUntil: 'networkidle' });
await bos.waitForTimeout(1200);
check('fix5: Bos melihat badge "Sudah dicek Manager" dari konteks lain', (await bos.getByText('Sudah dicek Manager').count()) >= 1);
await bos.screenshot({ path: path.join(OUT, 'bos-sees-review.png') });

// ---------- KONTEKS 5 (pakai ulang ctxAdmin): checkbox menghidupkan akses ----------
// Admin memberi Putra capability lewat form, lalu login sebagai Staff
// di halaman yang sama (provider tidak di-remount): Pemasaran muncul.
// PENTING: dari sini sampai akhir TIDAK BOLEH ada page.goto (reload
// penuh me-reset state EmployeesProvider yang in-memory). Semua
// navigasi lewat klik (client-side routing).
await admin.goto(`${BASE}/karyawan`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(800);
const putraCard = admin.locator('article', { hasText: 'Putra' }).first();
await putraCard.getByRole('button', { name: 'Ubah', exact: true }).click();
await admin.waitForTimeout(500);
const putraCheckbox = admin.getByRole('checkbox', { name: 'Bisa lihat Pemasaran' });
check('fix4: checkbox Putra awalnya tidak tercentang', !(await putraCheckbox.isChecked()));
await putraCheckbox.check();
await admin.getByRole('button', { name: 'Simpan', exact: true }).click();
await admin.waitForTimeout(800);
check('fix4: setelah disimpan, kartu Putra menampilkan "Bisa lihat Pemasaran"', (await admin.locator('article', { hasText: 'Putra' }).getByText('Bisa lihat Pemasaran').count()) >= 1);
// Logout lewat tombol Keluar di sidebar (client-side, tanpa reload).
await admin.getByRole('button', { name: 'Keluar' }).first().click();
await admin.waitForURL(`${BASE}/login`, { timeout: 10000 });
await admin.waitForTimeout(500);
await loginAsClientSide(admin, 'Staff');
check('fix4: Staff (Putra) kini melihat Pemasaran di sidebar', (await admin.getByRole('link', { name: 'Pemasaran' }).count()) >= 1);
// Buka /pemasaran lewat klik link sidebar (client-side, tanpa reload).
await admin.getByRole('link', { name: 'Pemasaran' }).click();
await admin.waitForURL(`${BASE}/pemasaran`, { timeout: 10000 });
await admin.waitForTimeout(1500);
check('fix4: Staff (Putra) kini bisa membuka /pemasaran', admin.url() === `${BASE}/pemasaran`);
await admin.screenshot({ path: path.join(OUT, 'staff-marketing-granted.png') });

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
