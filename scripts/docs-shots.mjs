// Ambil screenshot segar untuk dokumentasi (docs/images/): login,
// beranda tiap role, stok, scan, absensi, karyawan, laporan,
// pemasaran. Hanya login + navigasi, TIDAK ada aksi yang mengubah
// data (tidak absen, tidak scan, tidak tambah karyawan), jadi D1
// dan Sheet tetap bersih. Jalankan setelah deploy terbaru.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.TEST_BASE ?? 'https://caturwangsa.pages.dev';
const OUT = process.env.TEST_OUT ?? '/tmp/docs-shots';
const EXE = process.env.TEST_EXE ?? '/home/ice/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

fs.mkdirSync(OUT, { recursive: true });

async function loginAs(page, role) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

// Login (mobile).
const ctxLogin = await browser.newContext(mobile);
const loginPage = await ctxLogin.newPage();
await loginPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await loginPage.waitForTimeout(800);
await loginPage.screenshot({ path: path.join(OUT, 'docs-login-mobile.png') });
await ctxLogin.close();

// Staff: beranda, stok, scan, absensi (mobile).
const ctxStaff = await browser.newContext(mobile);
const staff = await ctxStaff.newPage();
await loginAs(staff, 'Staff');
await staff.screenshot({ path: path.join(OUT, 'docs-home-staff-mobile.png') });
await staff.goto(`${BASE}/stok`, { waitUntil: 'networkidle' });
await staff.waitForTimeout(1200);
await staff.screenshot({ path: path.join(OUT, 'docs-stok-mobile.png') });
await staff.goto(`${BASE}/scan/masuk`, { waitUntil: 'networkidle' });
await staff.waitForTimeout(1500);
await staff.screenshot({ path: path.join(OUT, 'docs-scan-mobile.png') });
await staff.goto(`${BASE}/absensi`, { waitUntil: 'networkidle' });
await staff.waitForTimeout(1200);
await staff.screenshot({ path: path.join(OUT, 'docs-absensi-staff-mobile.png') });
await ctxStaff.close();

// Admin: karyawan, pemasaran (mobile).
const ctxAdmin = await browser.newContext(mobile);
const admin = await ctxAdmin.newPage();
await loginAs(admin, 'Admin');
await admin.goto(`${BASE}/karyawan`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(1200);
await admin.screenshot({ path: path.join(OUT, 'docs-karyawan-mobile.png') });
await admin.goto(`${BASE}/pemasaran`, { waitUntil: 'networkidle' });
await admin.waitForTimeout(1500);
await admin.screenshot({ path: path.join(OUT, 'docs-pemasaran-mobile.png') });
await ctxAdmin.close();

// Bos: beranda, laporan (mobile).
const ctxBos = await browser.newContext(mobile);
const bos = await ctxBos.newPage();
await loginAs(bos, 'Bos');
await bos.screenshot({ path: path.join(OUT, 'docs-home-bos-mobile.png') });
await bos.goto(`${BASE}/laporan`, { waitUntil: 'networkidle' });
await bos.waitForTimeout(1200);
await bos.screenshot({ path: path.join(OUT, 'docs-laporan-mobile.png') });
await ctxBos.close();

// Admin: beranda desktop (hero README).
const ctxDesk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const desk = await ctxDesk.newPage();
await loginAs(desk, 'Admin');
await desk.screenshot({ path: path.join(OUT, 'docs-home-admin-desktop.png') });
await ctxDesk.close();

await browser.close();
console.log(`Screenshot dokumentasi tersimpan di ${OUT}`);
