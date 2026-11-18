// QA UI live di laptop: Beranda menampilkan total stok ASLI dari
// Worker (bukan localApi), DWL sesuai Sheet, tampilan scan lokasi,
// footer, dan smoke test selfie + persetujuan Bos.
// Angka yang diharapkan diambil dari API live saat jalan (bukan
// hardcode), supaya tetap benar kalau stok berubah.
// Jalankan di laptop dengan dev server + VITE_API_URL aktif di 5173.
// Screenshot ke E2E_OUT (default /tmp/shots-live).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173/stok-caturwangsa';
const API = 'https://stok-sabun-palem.zakyshadra.workers.dev';
const OUT = process.env.E2E_OUT || '/tmp/shots-live';
const EXE = process.env.PLAYWRIGHT_EXE || '/home/ice/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const SELFIE = '/home/ice/Projects/stok-caturwangsa/public/logo.png';
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

// Angka live dari Worker.
const stockRes = await fetch(`${API}/api/stock`);
const liveProducts = await stockRes.json();
const liveTotal = liveProducts.reduce(
  (s, p) => s + p.stock.klinik + p.stock['gudang-kantor'] + p.stock.kantor, 0,
);
const liveTotalFmt = liveTotal.toLocaleString('id-ID');
const dwl = liveProducts.find((p) => p.id === 'dwl-palem-jerigen');
const dwlTotal = dwl.stock.klinik + dwl.stock['gudang-kantor'] + dwl.stock.kantor;
const bomber = liveProducts.find((p) => p.id === 'bomber-matic');
const bomberTotal = bomber.stock.klinik + bomber.stock['gudang-kantor'] + bomber.stock.kantor;
console.log(`LIVE: total ${liveTotalFmt} (${liveProducts.length} produk), DWL ${dwlTotal}, Bomber Matic klinik=${bomber.stock.klinik} gdg=${bomber.stock['gudang-kantor']} kantor=${bomber.stock.kantor} total=${bomberTotal}`);

async function loginAs(page, role) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 10000 });
  await page.waitForTimeout(1200);
}

async function logout(page) {
  await page.goto(BASE + '/akun', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Keluar' }).last().click();
  await page.waitForURL(BASE + '/login', { timeout: 10000 });
}

async function shot(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('saved', name);
}

async function doCheckFlow(page, buttonName, successLabel) {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.setInputFiles('input[type="file"]', SELFIE);
  await page.getByRole('button', { name: 'Ini Foto Saya' }).click({ timeout: 10000 });
  await page.getByRole('button', { name: successLabel }).waitFor({ timeout: 8000 });
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// ---------- MOBILE 390x844: total live + selfie + persetujuan ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: OFFICE, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));

  await loginAs(page, 'Admin');
  const homeText = await page.evaluate(() => document.body.textContent);
  check('live mobile: Beranda menampilkan total live', homeText.includes(`Total ${liveTotalFmt} barang di gudang`), liveTotalFmt);
  check('live mobile: Beranda menampilkan jumlah produk live', homeText.includes(`${liveProducts.length} jenis produk`), `${liveProducts.length}`);
  check('live mobile: Beranda TIDAK menampilkan "Total 0 barang"', !homeText.includes('Total 0 barang'));
  check('live mobile: footer tampil', homeText.includes('PT Catur Wangsa Indah. All rights reserved.'));
  await shot(page, 'live-beranda-total-mobile.png');

  // Stok: DWL sesuai Sheet live.
  await page.goto(BASE + '/stok', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.fill('input[type="search"]', 'DWL Palem Jerigen');
  await page.waitForTimeout(600);
  const dwlText = await page.evaluate(() => document.body.textContent);
  check('live mobile: /stok DWL sesuai Sheet', dwlText.includes(String(dwlTotal)), `DWL ${dwlTotal}`);
  await shot(page, 'live-stok-dwl-mobile.png');

  // Scan live: Bomber Matic tampil stok lokasi (bukan total).
  await page.goto(BASE + '/scan/keluar', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Cari Manual' }).click();
  await page.waitForTimeout(500);
  await page.locator('button', { hasText: 'Bomber Matic' }).first().click();
  await page.waitForTimeout(600);
  const scanText = await page.evaluate(() => document.body.textContent);
  check('live mobile: scan menampilkan stok lokasi Klinik', scanText.includes('Stok di Gudang Klinik:'));
  check('live mobile: scan menampilkan total sebagai info sekunder', scanText.includes(`Total semua gudang: ${bomberTotal} bal`));
  await shot(page, 'live-scan-bomber-mobile.png');

  // Smoke selfie + persetujuan: Putra absen, Bos setujui.
  await logout(page);
  await loginAs(page, 'Staff');
  await doCheckFlow(page, 'Absen Masuk', 'Absen berhasil');
  await logout(page);
  await loginAs(page, 'Bos');
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const selfieOk = await page.evaluate(() => {
    const img = document.querySelector('img[alt="Selfie absen masuk Putra"]');
    return img !== null && img.complete && img.naturalWidth > 0;
  });
  check('live mobile: selfie Putra tampil di antrean Bos', selfieOk);
  await page.getByRole('button', { name: 'Setujui', exact: true }).first().click();
  await page.waitForTimeout(600);
  check('live mobile: setelah disetujui badge Disetujui tampil', (await page.getByText('Disetujui', { exact: true }).count()) >= 1);
  await shot(page, 'live-approval-bos-mobile.png');
  await ctx.close();
}

// ---------- DESKTOP 1280x800: total live ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`desktop pageerror: ${e.message}`));
  await loginAs(page, 'Manager');
  const homeText = await page.evaluate(() => document.body.textContent);
  check('live desktop: Beranda menampilkan total live', homeText.includes(`Total ${liveTotalFmt} barang di gudang`), liveTotalFmt);
  check('live desktop: sidebar Manager tanpa Karyawan',
    (await page.evaluate(() => [...document.querySelectorAll('aside nav a')].map((a) => a.textContent.trim()))).includes('Karyawan') === false);
  await shot(page, 'live-beranda-total-desktop.png');
  await ctx.close();
}

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
