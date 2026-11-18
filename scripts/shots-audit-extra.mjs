// Screenshot full-page tambahan untuk audit: bagian bawah halaman yang
// belum terlihat di screenshot viewport (beranda staf, laporan).
import { chromium } from 'playwright-core';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5199/stok-caturwangsa';
const OUT = '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

async function loginAs(page, role) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 8000 });
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// Beranda staf full-page (mobile): rekap + ringkasan stok di bawah.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await loginAs(page, 'Staff');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'audit-mobile-staff-home-full.png'), fullPage: true });
  console.log('saved audit-mobile-staff-home-full.png');
  await ctx.close();
}

// Laporan full-page (mobile): grid 4 kolom + kartu TOTAL.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await loginAs(page, 'Manager');
  await page.goto(BASE + '/laporan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'audit-mobile-manager-laporan-full.png'), fullPage: true });
  console.log('saved audit-mobile-manager-laporan-full.png');
  await ctx.close();
}

// Beranda manager full-page (mobile): kartu absen saya + stok menipis.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await loginAs(page, 'Manager');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'audit-mobile-manager-home-full.png'), fullPage: true });
  console.log('saved audit-mobile-manager-home-full.png');
  await ctx.close();
}

// Riwayat full-page (mobile): semua kartu, cek meta yang bungkus.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await loginAs(page, 'Staff');
  await page.goto(BASE + '/riwayat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'audit-mobile-staff-riwayat-full.png'), fullPage: true });
  console.log('saved audit-mobile-staff-riwayat-full.png');
  await ctx.close();
}

await browser.close();
console.log('SELESAI');
