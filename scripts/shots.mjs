// Screenshot QA: semua halaman, desktop + mobile, plus alur interaksi
// (demo scan -> isi jumlah -> simpan -> layar sukses).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5199';
const OUT = '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

const errors = [];

async function checkOverflow(page, label) {
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${label}: overflow-x = ${ox}px`);
  if (ox > 0) errors.push(`${label}: overflow-x ${ox}px`);
}

async function checkPill(page, label) {
  const diff = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navigasi utama"]');
    if (!nav) return 'no nav (scan page)';
    const pill = nav.querySelector('div[aria-hidden="true"]');
    const active = nav.querySelector('a[aria-current="page"]');
    if (!pill || !active) return 'pill/active missing';
    const p = pill.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    // Pill punya inset 6px tiap sisi dari link aktif.
    const leftDiff = Math.abs((p.left - 6) - a.left);
    const widthDiff = Math.abs((p.width + 12) - a.width);
    return `left diff ${leftDiff.toFixed(1)}px, width diff ${widthDiff.toFixed(1)}px`;
  });
  console.log(`${label}: pill ${diff}`);
  if (typeof diff === 'string' && diff.includes('diff')) {
    const nums = diff.match(/[\d.]+/g).map(Number);
    if (nums[0] > 2 || nums[1] > 2) errors.push(`${label}: pill misaligned (${diff})`);
  }
}

async function shot(page, name) {
  await page.waitForTimeout(1300); // tunggu entrance selesai
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log('saved', name);
}

const browser = await chromium.launch({
  executablePath: EXE,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-sandbox',
  ],
});

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    permissions: ['camera'],
    isMobile: vp.name === 'mobile',
    hasTouch: vp.name === 'mobile',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${vp.name} console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e.message}`));

  // Beranda
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} home`);
  await checkPill(page, `${vp.name} home`);
  await shot(page, `${vp.name}-home.png`);

  // Scan (kamera palsu)
  await page.goto(BASE + '/scan/keluar', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // kamera + lazy chunk
  await checkOverflow(page, `${vp.name} scan`);
  await shot(page, `${vp.name}-scan.png`);

  // Demo scan -> kartu produk
  await page.getByRole('button', { name: 'Tidak ada barcode? Coba demo scan' }).click();
  await page.waitForTimeout(600);
  await checkOverflow(page, `${vp.name} scan-found`);
  await shot(page, `${vp.name}-scan-found.png`);

  // Tambah jumlah 2x -> 3, lalu simpan
  await page.getByRole('button', { name: 'Tambah jumlah' }).click();
  await page.getByRole('button', { name: 'Tambah jumlah' }).click();
  await page.getByRole('button', { name: 'Simpan Barang Keluar' }).click();
  await page.waitForTimeout(800);
  await checkOverflow(page, `${vp.name} scan-success`);
  await shot(page, `${vp.name}-scan-success.png`);

  // Cari Manual
  await page.goto(BASE + '/scan/masuk', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Cari Manual' }).click();
  await page.waitForTimeout(600);
  await page.getByPlaceholder('Ketik nama produk...').fill('jelly');
  await page.waitForTimeout(400);
  await checkOverflow(page, `${vp.name} scan-manual`);
  await shot(page, `${vp.name}-scan-manual.png`);

  // Stok
  await page.goto(BASE + '/stok', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} stok`);
  await checkPill(page, `${vp.name} stok`);
  await shot(page, `${vp.name}-stok.png`);

  // Detail produk pertama (klik kartu Jelly 130gr / produk pertama)
  await page.getByRole('button', { name: /Jelly 130gr/ }).first().click();
  await page.waitForTimeout(500);
  await shot(page, `${vp.name}-stok-detail.png`);

  // Riwayat
  await page.goto(BASE + '/riwayat', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} riwayat`);
  await checkPill(page, `${vp.name} riwayat`);
  await shot(page, `${vp.name}-riwayat.png`);

  await ctx.close();
}

await browser.close();

console.log('\n=== ERRORS ===');
if (errors.length === 0) console.log('none');
else errors.forEach((e) => console.log('-', e));
