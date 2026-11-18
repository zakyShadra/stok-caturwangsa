// Uji live fix nav tembus + trim teks Pemasaran (18 Nov 2026):
// - BottomNav: pill highlight ngikutin LEBAR TEKS label (bukan sel
//   link), font label 12px. Label "Pemasaran" harus muat penuh di
//   dalam pill di lebar 360px DAN 390px.
// - Halaman Pemasaran: subtitle halaman dihapus, baris "Selisih
//   keduanya..." dihapus, tombol "Muat ulang" kecil di samping judul
//   (bukan satu baris sendiri), footnote November + baris "Data live"
//   digabung jadi satu baris kecil. Angka + tabel tetap ada.
// Jalankan dua kali: sebelum deploy (label TEST_LABEL=before, cek
// diharapkan GAGAL sebagai bukti bug) dan sesudah deploy
// (TEST_LABEL=after, semua cek harus LOLOS).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.TEST_BASE ?? 'https://caturwangsa.pages.dev';
const OUT = process.env.TEST_OUT ?? '/tmp/navfix-shots';
const LABEL = process.env.TEST_LABEL ?? 'after';
const EXE = process.env.TEST_EXE ?? '/home/ice/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

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

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// ---------- Pill vs label di 360px dan 390px ----------
for (const width of [360, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${width}px pageerror: ${e.message}`));
  await loginAs(page, 'Admin');
  await page.goto(`${BASE}/pemasaran`, { waitUntil: 'networkidle' });
  // Tunggu animasi pill (0.5s) + grafik selesai muat.
  await page.waitForTimeout(1500);
  const pill = page.locator('nav[aria-label="Navigasi utama"] div[aria-hidden="true"]');
  const label = page.locator('nav[aria-label="Navigasi utama"] a[href="/pemasaran"] span');
  const pillBox = await pill.boundingBox();
  const labelBox = await label.boundingBox();
  const fontSize = await label.evaluate((el) => getComputedStyle(el).fontSize);
  check(`pill-${width}: label Pemasaran terukur`, Boolean(pillBox) && Boolean(labelBox));
  if (pillBox && labelBox) {
    const insideLeft = labelBox.x >= pillBox.x - 1;
    const insideRight = labelBox.x + labelBox.width <= pillBox.x + pillBox.width + 1;
    check(
      `pill-${width}: label Pemasaran muat penuh di dalam pill`,
      insideLeft && insideRight,
      `label ${Math.round(labelBox.x)}-${Math.round(labelBox.x + labelBox.width)}, pill ${Math.round(pillBox.x)}-${Math.round(pillBox.x + pillBox.width)}`,
    );
    // Screenshot close-up nav bawah saja.
    await page.screenshot({
      path: path.join(OUT, `nav-${LABEL}-${width}.png`),
      clip: { x: 0, y: 844 - 90, width, height: 90 },
    });
  }
  check(`pill-${width}: font label 12px`, fontSize === '12px', fontSize);
  await ctx.close();
}

// ---------- Trim teks halaman Pemasaran (390px) ----------
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`marketing pageerror: ${e.message}`));
await loginAs(page, 'Admin');
await page.goto(`${BASE}/pemasaran`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const bodyText = await page.evaluate(() => document.body.textContent ?? '');
check('trim: subtitle halaman dihapus', !bodyText.includes('Penjualan offline dari spreadsheet Analisis'));
check('trim: baris "Selisih keduanya" dihapus', !bodyText.includes('Selisih keduanya adalah penjualan'));
check('trim: angka Total Penjualan tetap ada', bodyText.includes('Total Penjualan'));
check('trim: tabel bulanan tetap ada', bodyText.includes('Kas Masuk') && bodyText.includes('Transaksi'));
check('trim: tabel produk terlaris tetap ada', bodyText.includes('Produk terlaris') && bodyText.includes('Terjual'));
// Tombol "Muat ulang" sebaris dengan judul (bukan satu baris sendiri).
const titleBox = await page.locator('h1', { hasText: 'Pemasaran' }).first().boundingBox();
const reloadBtn = page.getByRole('button', { name: 'Muat ulang' });
const reloadBox = await reloadBtn.boundingBox();
check('trim: tombol "Muat ulang" ada', Boolean(reloadBox));
if (titleBox && reloadBox) {
  check(
    'trim: tombol "Muat ulang" sebaris dengan judul',
    reloadBox.y < titleBox.y + titleBox.height && reloadBox.y + reloadBox.height > titleBox.y,
    `judul y ${Math.round(titleBox.y)}-${Math.round(titleBox.y + titleBox.height)}, tombol y ${Math.round(reloadBox.y)}-${Math.round(reloadBox.y + reloadBox.height)}`,
  );
  check('trim: tombol "Muat ulang" kecil (tinggi <= 44px)', reloadBox.height <= 44, `${Math.round(reloadBox.height)}px`);
}
// Footnote gabung: info bulan parsial + "Terakhir dibaca" dalam satu
// paragraf kecil di bawah.
const footer = page.locator('p', { hasText: 'Terakhir dibaca' });
check('trim: baris "Terakhir dibaca" ada', (await footer.count()) === 1);
if ((await footer.count()) === 1) {
  const footerText = (await footer.first().textContent()) ?? '';
  check('trim: footnote gabung memuat info bulan parsial', footerText.includes('data tanggal 1-'), footerText.slice(0, 80));
  const footerSize = await footer.first().evaluate((el) => getComputedStyle(el).fontSize);
  check('trim: footnote gabung berukuran kecil (<= 14px)', parseFloat(footerSize) <= 14, footerSize);
}
await page.screenshot({ path: path.join(OUT, `marketing-${LABEL}-390.png`), fullPage: true });
await ctx.close();

await browser.close();

console.log(`\n=== HASIL [${LABEL}]: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
