// Uji absensi server-backed lintas konteks terhadap Worker LIVE:
// - Konteks 1 (Staff Budi): check-in dengan GPS tiruan + file selfie.
// - Konteks 2 (Bos Pak Yunus): melihat catatan + selfie Budi (foto
//   dimuat dari endpoint /api/absen/foto, bukan localStorage),
//   lalu menyetujui.
// - Konteks 3 (Manager Ibu Abe): melihat catatan, TANPA tombol Setujui.
// Prasyarat: preview server aktif dengan VITE_API_URL ke Worker live,
// D1 schema sudah diterapkan. BASE/EXE/SELFIE bisa diubah lewat env.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.TEST_BASE ?? 'http://localhost:5199/stok-caturwangsa';
const OUT = process.env.TEST_OUT ?? '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = process.env.TEST_EXE ?? '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const SELFIE = process.env.TEST_SELFIE ?? '/home/hatch/workspace/stok-caturwangsa/public/logo.png';
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
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 8000 });
  await page.waitForTimeout(800);
}

async function imgOk(page, alt) {
  return page.evaluate((a) => {
    const img = document.querySelector(`img[alt="${a}"]`);
    return img !== null && img.complete && img.naturalWidth > 0;
  }, alt);
}

async function imgSrc(page, alt) {
  return page.evaluate((a) => document.querySelector(`img[alt="${a}"]`)?.getAttribute('src') ?? '', alt);
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// ---------- KONTEKS 1: Budi check-in ----------
const ctxBudi = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: OFFICE, permissions: ['geolocation'] });
const budi = await ctxBudi.newPage();
budi.on('pageerror', (e) => errors.push(`budi pageerror: ${e.message}`));
await loginAs(budi, 'Staff');
await budi.getByRole('button', { name: 'Absen Masuk', exact: true }).click();
await budi.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 15000 });
await budi.setInputFiles('input[type="file"]', SELFIE);
await budi.getByRole('button', { name: 'Ini Foto Saya' }).click({ timeout: 10000 });
await budi.getByRole('button', { name: 'Absen berhasil' }).waitFor({ timeout: 10000 });
check('remote: Budi check-in berhasil (tombol jadi "Absen berhasil")', true);
await budi.screenshot({ path: path.join(OUT, 'remote-budi-checkin.png') });

// ---------- KONTEKS 2: Bos melihat + menyetujui ----------
const ctxBos = await browser.newContext({ viewport: { width: 1280, height: 800 }, geolocation: OFFICE, permissions: ['geolocation'] });
const bos = await ctxBos.newPage();
bos.on('pageerror', (e) => errors.push(`bos pageerror: ${e.message}`));
await loginAs(bos, 'Bos');
await bos.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
await bos.waitForTimeout(1200);
check('remote: Bos melihat antrean menunggu persetujuan (1)', (await bos.getByText('Menunggu persetujuan (1)').count()) >= 1);
const selfieSrc = await imgSrc(bos, 'Selfie absen masuk Budi Santoso');
check('remote: selfie Budi dimuat dari endpoint server /api/absen/foto/', selfieSrc.includes('/api/absen/foto/'), selfieSrc);
check('remote: selfie Budi tampil utuh di HP Bos (tidak rusak)', await imgOk(bos, 'Selfie absen masuk Budi Santoso'));
check('remote: Bos melihat tombol Setujui', (await bos.getByRole('button', { name: 'Setujui', exact: true }).count()) >= 1);
await bos.screenshot({ path: path.join(OUT, 'remote-bos-sebelum-setuju.png') });
await bos.getByRole('button', { name: 'Setujui', exact: true }).first().click();
await bos.waitForTimeout(1000);
check('remote: setelah disetujui, badge "Disetujui" tampil', (await bos.getByText('Disetujui', { exact: true }).count()) >= 1);
check('remote: antrean menunggu persetujuan hilang setelah disetujui', (await bos.getByText('Menunggu persetujuan (').count()) === 0);
await bos.screenshot({ path: path.join(OUT, 'remote-bos-setelah-setuju.png') });

// ---------- KONTEKS 3: Manager read-only ----------
const ctxMgr = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mgr = await ctxMgr.newPage();
mgr.on('pageerror', (e) => errors.push(`manager pageerror: ${e.message}`));
await loginAs(mgr, 'Manager');
await mgr.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
await mgr.waitForTimeout(1200);
check('remote: Manager melihat selfie Budi (tampil utuh)', await imgOk(mgr, 'Selfie absen masuk Budi Santoso'));
check('remote: Manager tidak melihat tombol Setujui', (await mgr.getByRole('button', { name: 'Setujui', exact: true }).count()) === 0);
check('remote: Manager tidak melihat tombol Tolak', (await mgr.getByRole('button', { name: 'Tolak', exact: true }).count()) === 0);
await mgr.goto(BASE + '/laporan', { waitUntil: 'networkidle' });
await mgr.waitForTimeout(1000);
const reportText = await mgr.evaluate(() => document.body.textContent);
check('remote: Manager melihat laporan (Budi Hadir 1)', reportText.includes('Budi Santoso'), reportText.slice(0, 200));

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
