// QA UI terhadap data LIVE dari VM: browser VM tidak bisa keluar
// internet, jadi semua request /api/* diteruskan lewat node fetch
// ke Worker asli (proxy di route handler). Scan UI menulis ke Sheet
// asli, lalu di-undo lewat tombol di layar sukses.
// Angka yang diharapkan diambil dari API live saat jalan.
// Jalankan dengan preview server build VITE_API_URL di port 5199.
// Screenshot prefix live-data- di ~/workspace/your_files/stok-caturwangsa-ui/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5199/stok-caturwangsa';
const API = 'https://stok-sabun-palem.zakyshadra.workers.dev';
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

async function liveStock() {
  const res = await fetch(`${API}/api/stock`);
  return res.json();
}
async function liveLog() {
  const res = await fetch(`${API}/api/log`);
  return res.json();
}

const before = await liveStock();
const liveTotal = before.reduce((s, p) => s + p.stock.klinik + p.stock['gudang-kantor'] + p.stock.kantor, 0);
const liveTotalFmt = liveTotal.toLocaleString('id-ID');
const dwlBefore = before.find((p) => p.id === 'dwl-palem-jerigen');
const dwlTotal = dwlBefore.stock.klinik + dwlBefore.stock['gudang-kantor'] + dwlBefore.stock.kantor;
const bomber = before.find((p) => p.id === 'bomber-matic');
console.log(`LIVE: total ${liveTotalFmt} (${before.length} produk), DWL ${dwlTotal}, Bomber klinik=${bomber.stock.klinik} gdg=${bomber.stock['gudang-kantor']} kantor=${bomber.stock.kantor}`);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

// Teruskan semua /api/* lewat node fetch ke Worker asli.
// Pola ** (bukan *) supaya /api/scan/undo (dua segmen) ikut kena.
await page.route(`${API}/api/**`, async (route) => {
  const req = route.request();
  const url = req.url();
  try {
    const init = { method: req.method(), headers: { 'Content-Type': 'application/json' } };
    if (req.method() === 'POST') init.body = req.postData() ?? '{}';
    const res = await fetch(url, init);
    const body = await res.text();
    await route.fulfill({ status: res.status, contentType: 'application/json', body });
  } catch (e) {
    await route.abort('failed');
  }
});

async function loginAs(role) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 10000 });
  await page.waitForTimeout(1500);
}

async function shot(name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('saved', name);
}

await loginAs('Admin');
const homeText = await page.evaluate(() => document.body.textContent);
check('live-data: Beranda menampilkan total live', homeText.includes(`Total ${liveTotalFmt} barang di gudang`), liveTotalFmt);
check('live-data: Beranda menampilkan jumlah produk live', homeText.includes(`${before.length} jenis produk`));
check('live-data: Beranda TIDAK menampilkan "Total 0 barang"', !homeText.includes('Total 0 barang'));
check('live-data: footer tampil', homeText.includes('PT Catur Wangsa Indah. All rights reserved.'));
await shot('live-data-beranda-total-mobile.png');

// Stok: DWL sesuai Sheet live.
await page.goto(BASE + '/stok', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.fill('input[type="search"]', 'DWL Palem Jerigen');
await page.waitForTimeout(600);
const dwlText = await page.evaluate(() => document.body.textContent);
check('live-data: /stok DWL sesuai Sheet', dwlText.includes(String(dwlTotal)), `DWL ${dwlTotal}`);

// Scan keluar live: DWL 1 dari Klinik lewat UI, verifikasi API,
// lalu undo lewat tombol di layar sukses, verifikasi kembali.
await page.goto(BASE + '/scan/keluar', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Cari Manual' }).click();
await page.waitForTimeout(500);
await page.getByPlaceholder('Ketik nama produk...').fill('DWL Palem');
await page.waitForTimeout(500);
await page.getByRole('button', { name: /DWL Palem Jerigen/ }).first().click();
await page.waitForTimeout(800);
const scanText = await page.evaluate(() => document.body.textContent);
check('live-data: scan menampilkan stok lokasi Klinik (bukan total)',
  scanText.includes('Stok di Gudang Klinik:') && scanText.includes(`Total semua gudang: ${dwlTotal} jerigen`));
await page.getByRole('button', { name: 'Simpan Barang Keluar' }).click();
await page.getByText('Berhasil dicatat').waitFor({ timeout: 15000 });
await page.waitForTimeout(500);
await shot('live-data-scan-sukses.png');
const afterScan = await liveStock();
const dwlAfter = afterScan.find((p) => p.id === 'dwl-palem-jerigen');
const dwlAfterTotal = dwlAfter.stock.klinik + dwlAfter.stock['gudang-kantor'] + dwlAfter.stock.kantor;
check('live-data: scan UI mengurangi DWL di Sheet (440 -> 439)', dwlAfterTotal === dwlTotal - 1, `${dwlTotal} -> ${dwlAfterTotal}`);
check('live-data: scan mengurangi stok Klinik', dwlAfter.stock.klinik === dwlBefore.stock.klinik - 1, `${dwlBefore.stock.klinik} -> ${dwlAfter.stock.klinik}`);
const logAfter = await liveLog();
check('live-data: log terbaru adalah scan barusan',
  logAfter[0].productId === 'dwl-palem-jerigen' && logAfter[0].type === 'keluar' && logAfter[0].qty === 1,
  `${logAfter[0].productId} ${logAfter[0].type} ${logAfter[0].qty}`);

// Undo lewat tombol di layar sukses.
await page.getByRole('button', { name: 'Batalkan, saya salah input' }).click();
await page.waitForTimeout(1500);
const restored = await liveStock();
const dwlRestored = restored.find((p) => p.id === 'dwl-palem-jerigen');
const dwlRestoredTotal = dwlRestored.stock.klinik + dwlRestored.stock['gudang-kantor'] + dwlRestored.stock.kantor;
check('live-data: undo mengembalikan DWL ke 440', dwlRestoredTotal === dwlTotal, `${dwlRestoredTotal}`);

// Riwayat menampilkan transaksi scan + koreksi undo.
await page.goto(BASE + '/riwayat', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const histText = await page.evaluate(() => document.body.textContent);
check('live-data: Riwayat menampilkan DWL Palem Jerigen', histText.includes('DWL Palem Jerigen'));
await shot('live-data-riwayat-mobile.png');

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
