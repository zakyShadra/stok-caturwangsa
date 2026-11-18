// Uji error state stok: build dengan VITE_API_URL ke Worker live,
// tapi dijalankan di VM tanpa internet eksternal, jadi semua request
// API gagal. Aplikasi harus menampilkan pesan error + tombol coba
// lagi, BUKAN angka 0 yang menyesatkan.
// Jalankan dengan preview server di port 5199 (build VITE_API_URL).
// Screenshot prefix error- di ~/workspace/your_files/stok-caturwangsa-ui/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5199/stok-caturwangsa';
const OUT = '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

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
  await page.waitForTimeout(1200);
}

async function shot(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('saved', name);
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await loginAs(page, 'Admin');
const homeText = await page.evaluate(() => document.body.textContent);
check('error: Beranda menampilkan pesan error stok', homeText.includes('Stok tidak bisa dimuat'));
check('error: Beranda TIDAK menampilkan "Total 0 barang"', !homeText.includes('Total 0 barang'));
check('error: Beranda menampilkan tombol "Coba lagi"', (await page.getByRole('button', { name: 'Coba lagi' }).count()) >= 1);
check('error: Beranda menampilkan "Total stok belum bisa ditampilkan"', homeText.includes('Total stok belum bisa ditampilkan'));
await shot(page, 'error-beranda-stok-gagal.png');

await page.goto(BASE + '/stok', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const stockText = await page.evaluate(() => document.body.textContent);
check('error: /stok menampilkan pesan error', stockText.includes('Stok tidak bisa dimuat'));
check('error: /stok menampilkan tombol "Coba lagi"', (await page.getByRole('button', { name: 'Coba lagi' }).count()) >= 1);
check('error: /stok TIDAK menampilkan "Tidak ada produk"', !stockText.includes('Tidak ada produk'));
await shot(page, 'error-stok-gagal.png');

await page.goto(BASE + '/riwayat', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const histText = await page.evaluate(() => document.body.textContent);
check('error: /riwayat menampilkan pesan error riwayat', histText.includes('Riwayat tidak bisa dimuat'));
check('error: /riwayat TIDAK menampilkan "Belum ada riwayat"', !histText.includes('Belum ada riwayat'));
await shot(page, 'error-riwayat-gagal.png');

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
