// Verifikasi menu Pemasaran dengan data live:
// - Bandingkan angka yang tampil di halaman dengan respons API
//   /api/marketing (total = jumlah bulanan, 6 bulan, 10 produk).
// - Pastikan kedua grafik Bklit ter-render (SVG batang ada).
// - Screenshot mobile + desktop ke folder UI.
// Prasyarat: preview server aktif dengan VITE_API_URL ke Worker live.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.TEST_BASE ?? 'http://localhost:5199/stok-caturwangsa';
const OUT = process.env.TEST_OUT ?? '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = process.env.TEST_EXE ?? '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const API_URL = process.env.VITE_API_URL ?? 'https://stok-sabun-palem.zakyshadra.workers.dev';

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

// Angka dari API (sumber kebenaran untuk halaman ini).
const apiRes = await fetch(`${API_URL}/api/marketing`);
const api = await apiRes.json();
check('marketing: API /api/marketing merespons 200', apiRes.ok, `status ${apiRes.status}`);
const apiMonthly = api.monthly ?? [];
const apiTop = api.topProducts ?? [];
const sumPenjualan = apiMonthly.reduce((s, m) => s + m.penjualan, 0);
const sumKas = apiMonthly.reduce((s, m) => s + m.kasMasuk, 0);
check('marketing: API total penjualan = jumlah bulanan', api.totalPenjualan === sumPenjualan, `${api.totalPenjualan} vs ${sumPenjualan}`);
check('marketing: API total kas masuk = jumlah bulanan', api.totalKasMasuk === sumKas, `${api.totalKasMasuk} vs ${sumKas}`);
check('marketing: API mengembalikan 6 bulan', apiMonthly.length === 6, apiMonthly.map((m) => m.key).join(', '));
check('marketing: API mengembalikan 10 produk teratas', apiTop.length === 10, `${apiTop.length}`);
console.log('API monthly:', apiMonthly.map((m) => `${m.label}: ${m.penjualan}/${m.kasMasuk}`).join(' | '));
console.log('API top 3:', apiTop.slice(0, 3).map((p) => `${p.name} Rp${p.revenue}`).join(' | '));

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

async function loginAs(page, role) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 8000 });
  await page.waitForTimeout(800);
}

for (const vp of [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e.message}`));
  await loginAs(page, 'Staff');
  await page.goto(BASE + '/pemasaran', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const text = await page.evaluate(() => document.body.textContent);
  const fmt = (n) => `Rp${n.toLocaleString('id-ID')}`;
  check(`${vp.name}: total penjualan tampil sesuai API`, text.includes(fmt(api.totalPenjualan)), fmt(api.totalPenjualan));
  check(`${vp.name}: total kas masuk tampil sesuai API`, text.includes(fmt(api.totalKasMasuk)), fmt(api.totalKasMasuk));
  check(`${vp.name}: produk #1 tampil (${apiTop[0]?.name})`, text.includes(apiTop[0]?.name ?? ''));
  check(`${vp.name}: bulan Juni 2026 tampil di tabel`, text.includes('Juni 2026'));
  check(`${vp.name}: tidak ada kata Telat di halaman Pemasaran`, !text.includes('Telat'));

  // Grafik Bklit ter-render: SVG dengan batang (rect/path) ada.
  const svgCount = await page.locator('section svg').count();
  check(`${vp.name}: kedua grafik ter-render (SVG ada)`, svgCount >= 2, `${svgCount} svg`);
  const barCount = await page.evaluate(() => document.querySelectorAll('section svg rect, section svg path').length);
  check(`${vp.name}: batang grafik ada di SVG`, barCount > 10, `${barCount} bentuk`);

  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${vp.name}: overflow-x 0`, ox === 0, `${ox}px`);

  await page.screenshot({ path: path.join(OUT, `marketing-${vp.name}.png`), fullPage: true });
  console.log('saved', `marketing-${vp.name}.png`);
  await ctx.close();
}

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
