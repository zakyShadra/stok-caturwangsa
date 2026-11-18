// Screenshot QA setelah wiring API: pastikan halaman Stok, Scan, dan
// Riwayat tidak berubah tampilannya (sumber data lokal masih dipakai
// karena VITE_API_URL belum diisi di build ini).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5199/stok-caturwangsa';
const OUT = '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

fs.mkdirSync(OUT, { recursive: true });

const errors = [];

async function checkOverflow(page, label) {
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${label}: overflow-x = ${ox}px`);
  if (ox > 0) errors.push(`${label}: overflow-x ${ox}px`);
}

async function loginAsStaff(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Staff/ }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 8000 });
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'],
});

for (const vp of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e.message}`));
  await loginAsStaff(page);

  await page.goto(`${BASE}/stok`);
  await page.waitForTimeout(1500);
  const cards = await page.locator('button[aria-expanded]').count();
  console.log(`${vp.name} stok: ${cards} kartu produk`);
  if (cards !== 24) errors.push(`${vp.name} stok: kartu produk ${cards}, harus 24`);
  await checkOverflow(page, `${vp.name}-stok`);
  await page.screenshot({ path: path.join(OUT, `apiwiring-${vp.name}-stok.png`) });

  await page.goto(`${BASE}/scan/keluar`);
  await page.waitForTimeout(1500);
  await checkOverflow(page, `${vp.name}-scan-keluar`);
  await page.screenshot({ path: path.join(OUT, `apiwiring-${vp.name}-scan-keluar.png`) });

  await page.goto(`${BASE}/riwayat`);
  await page.waitForTimeout(1500);
  await checkOverflow(page, `${vp.name}-riwayat`);
  await page.screenshot({ path: path.join(OUT, `apiwiring-${vp.name}-riwayat.png`) });

  await ctx.close();
}

await browser.close();
if (errors.length > 0) {
  console.log('GAGAL:');
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
