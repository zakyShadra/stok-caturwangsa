// Audit layout: screenshot semua halaman x semua role x dua ukuran layar.
// Mobile 390x844 dan desktop 1280x800. Screenshot disimpan dengan prefix
// audit- di ~/workspace/your_files/stok-caturwangsa-ui/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5199/stok-caturwangsa';
const OUT = '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

fs.mkdirSync(OUT, { recursive: true });
const errors = [];

async function checkOverflow(page, label) {
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${label}: overflow-x = ${ox}px`);
  if (ox > 0) errors.push(`${label}: overflow-x ${ox}px`);
}

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, name), fullPage });
  console.log('saved', name);
}

async function loginAs(page, role) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 8000 });
  await page.waitForTimeout(800);
}

async function gotoPage(page, route) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// Halaman per role. Staff tidak punya Karyawan dan Laporan.
const PAGES = [
  { route: '/', name: 'home', roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
  { route: '/absensi', name: 'absensi', roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
  { route: '/karyawan', name: 'karyawan', roles: ['Admin', 'Bos', 'Manager'] },
  { route: '/laporan', name: 'laporan', roles: ['Admin', 'Bos', 'Manager'] },
  { route: '/scan/masuk', name: 'scan-masuk', roles: ['Admin', 'Manager', 'Staff'] },
  { route: '/scan/keluar', name: 'scan-keluar', roles: ['Admin', 'Manager', 'Staff'] },
  { route: '/stok', name: 'stok', roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
  { route: '/riwayat', name: 'riwayat', roles: ['Admin', 'Bos', 'Manager', 'Staff'] },
];

const VIEWPORTS = [
  { label: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
  { label: 'desktop', width: 1280, height: 800, isMobile: false, hasTouch: false },
];

for (const vp of VIEWPORTS) {
  for (const p of PAGES) {
    for (const role of p.roles) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${vp.label} ${role} ${p.name} pageerror: ${e.message}`));
      const label = `${vp.label}-${role.toLowerCase()}-${p.name}`;
      await loginAs(page, role);
      await gotoPage(page, p.route);
      await checkOverflow(page, label);
      await shot(page, `audit-${label}.png`);
      await ctx.close();
    }
  }
}

// Login page (tanpa login), dua ukuran.
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.label} login`);
  await shot(page, `audit-${vp.label}-login.png`);
  await ctx.close();
}

// State tambahan (mobile): halaman stok dengan kartu produk nama panjang
// dibuka, halaman scan dengan fase manual dan fase ditemukan.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`extra pageerror: ${e.message}`));
  await loginAs(page, 'Staff');

  // Stok: buka kartu produk nama panjang.
  await gotoPage(page, '/stok');
  await page.getByRole('button', { name: /Pembersih Lantai botol/ }).first().click();
  await page.waitForTimeout(600);
  await checkOverflow(page, 'mobile stok-detail-panjang');
  await shot(page, 'audit-mobile-staff-stok-detail.png');

  // Scan masuk: fase manual (daftar produk).
  await gotoPage(page, '/scan/masuk');
  await page.getByRole('button', { name: 'Cari Manual' }).click();
  await page.waitForTimeout(600);
  await checkOverflow(page, 'mobile scan-manual');
  await shot(page, 'audit-mobile-staff-scan-manual.png');

  // Scan masuk: fase ditemukan (pilih produk nama panjang).
  await page.getByRole('button', { name: /Pembersih Lantai botol/ }).first().click();
  await page.waitForTimeout(600);
  await checkOverflow(page, 'mobile scan-found');
  await shot(page, 'audit-mobile-staff-scan-found.png', true);
  await ctx.close();
}

// State tambahan (desktop): form tandai izin/cuti + form tambah karyawan.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`extra desktop pageerror: ${e.message}`));
  await loginAs(page, 'Manager');
  await gotoPage(page, '/absensi');
  await page.getByRole('button', { name: 'Tandai Izin / Cuti' }).click();
  await page.waitForTimeout(600);
  await checkOverflow(page, 'desktop absensi-mark-form');
  await shot(page, 'audit-desktop-manager-absensi-markform.png', true);

  await gotoPage(page, '/karyawan');
  await page.getByRole('button', { name: '+ Tambah Karyawan' }).click();
  await page.waitForTimeout(600);
  await checkOverflow(page, 'desktop karyawan-add-form');
  await shot(page, 'audit-desktop-manager-karyawan-form.png', true);
  await ctx.close();
}

await browser.close();

console.log('\n=== HASIL ===');
if (errors.length === 0) {
  console.log('SEMUA CEK LOLOS (tidak ada overflow-x, tidak ada pageerror)');
} else {
  console.log(`${errors.length} MASALAH:`);
  errors.forEach((e) => console.log(' -', e));
}
