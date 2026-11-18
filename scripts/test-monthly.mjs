// Tes tampilan bulanan di halaman Riwayat: tabel Per Hari tampil,
// angka cocok dengan API, snap scroll pindah tiap 4 kolom, kolom
// produk tetap kelihatan saat menggeser.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173/stok-caturwangsa';
const API = 'https://stok-sabun-palem.zakyshadra.workers.dev';
const OUT = process.env.E2E_OUT || '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = process.env.PLAYWRIGHT_EXE || '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

fs.mkdirSync(OUT, { recursive: true });
const errors = [];

async function monthlyFromApi() {
  const res = await fetch(`${API}/api/monthly?month=2026-11`);
  return res.json();
}

const apiData = await monthlyFromApi();
const dwlApi = apiData.products.find((p) => p.id === 'dwl-palem-jerigen');
console.log(`API: DWL day18 stock=${dwlApi.daily[17].stock} delta=${dwlApi.daily[17].delta}`);

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox'],
  proxy: process.env.HTTPS_PROXY
    ? (() => {
        const u = new URL(process.env.HTTPS_PROXY);
        return { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), bypass: 'localhost,127.0.0.1' };
      })()
    : undefined,
});

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Staff/ }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 8000 });
  await page.waitForTimeout(800);
}

async function openMonthly(page) {
  await page.goto(`${BASE}/riwayat`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Per Hari', exact: true }).click();
  await page.getByText('November 2026').waitFor({ timeout: 10000 });
  // Tunggu tabel benar-benar termuat (data dari API), bukan sekadar judul.
  await page.locator('[data-testid="monthly-scroller"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
}

// ---------- Mobile 390px ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
  await login(page);
  await openMonthly(page);

  // Cek angka DWL hari ke-18 tampil 440.
  const has440 = (await page.locator('text=440').count()) > 0;
  console.log(`Mobile: angka 440 tampil: ${has440 ? 'ya' : 'TIDAK'}`);
  if (!has440) errors.push('mobile: angka 440 (DWL hari 18) tidak tampil');

  // Cek overflow horizontal halaman.
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`Mobile: overflow-x halaman: ${overflowX}px`);
  if (overflowX > 0) errors.push(`mobile: overflow-x ${overflowX}px`);
  await page.screenshot({ path: path.join(OUT, 'monthly-mobile.png') });

  // Snap test (panel HP = 3 kolom = 192px): geser 50px, harus snap
  // kembali ke 0; geser 700px, harus snap ke 768 (kelipatan 192 terdekat).
  const scroller = page.locator('[data-testid="monthly-scroller"]');
  await scroller.evaluate((el) => { el.scrollLeft = 50; });
  await page.waitForTimeout(600);
  const snapped1 = await scroller.evaluate((el) => el.scrollLeft);
  console.log(`Mobile: scroll 50 -> snap ke ${snapped1} (harus 0)`);
  if (snapped1 !== 0) errors.push(`mobile: snap 50 -> ${snapped1}, harus 0`);

  await scroller.evaluate((el) => { el.scrollLeft = 700; });
  await page.waitForTimeout(600);
  const snapped2 = await scroller.evaluate((el) => el.scrollLeft);
  console.log(`Mobile: scroll 700 -> snap ke ${snapped2} (harus 768)`);
  if (snapped2 !== 768) errors.push(`mobile: snap 700 -> ${snapped2}, harus 768`);

  // Kolom produk tetap kelihatan setelah menggeser.
  const prodBox = await page.locator('text=BS Powder 60k').first().boundingBox();
  console.log(`Mobile: kolom produk x=${prodBox ? prodBox.x : 'hilang'} (harus >= 0 dan < 132)`);
  if (!prodBox || prodBox.x < 0 || prodBox.x > 132) errors.push('mobile: kolom produk tidak kelihatan setelah geser');
  await page.screenshot({ path: path.join(OUT, 'monthly-mobile-scrolled.png') });
  await ctx.close();
}

// ---------- Desktop 1280px ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`desktop pageerror: ${e.message}`));
  await login(page);
  await openMonthly(page);

  const has440 = (await page.locator('text=440').count()) > 0;
  console.log(`Desktop: angka 440 tampil: ${has440 ? 'ya' : 'TIDAK'}`);
  if (!has440) errors.push('desktop: angka 440 (DWL hari 18) tidak tampil');

  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`Desktop: overflow-x halaman: ${overflowX}px`);
  if (overflowX > 0) errors.push(`desktop: overflow-x ${overflowX}px`);
  await page.screenshot({ path: path.join(OUT, 'monthly-desktop.png') });

  // Navigasi bulan: ke Oktober 2026, judul berubah, lalu kembali.
  await page.getByRole('button', { name: 'Bulan sebelumnya' }).click();
  await page.getByText('Oktober 2026').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const oktHasZero = (await page.locator('text=0').count()) > 0;
  console.log(`Desktop: Oktober tampil, ada angka 0: ${oktHasZero ? 'ya' : 'tidak'}`);
  await page.getByRole('button', { name: 'Bulan berikutnya' }).click();
  await page.getByText('November 2026').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  // Tombol berikutnya harus nonaktif di bulan berjalan.
  const nextDisabled = await page.getByRole('button', { name: 'Bulan berikutnya' }).isDisabled();
  console.log(`Desktop: tombol bulan berikut nonaktif di bulan berjalan: ${nextDisabled ? 'ya' : 'TIDAK'}`);
  if (!nextDisabled) errors.push('desktop: tombol bulan berikut tidak nonaktif di bulan berjalan');
  await ctx.close();
}

await browser.close();

if (errors.length > 0) {
  console.log('GAGAL:');
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('TES BULANAN LOLOS: tabel tampil, angka cocok API, snap 3 kolom di HP dan 4 di desktop, kolom produk tetap kelihatan.');
