// Tes end-to-end backend live: satu scan Barang Keluar lewat UI,
// lalu verifikasi lewat Worker API (angka stok berubah) dan
// Sheets connector (baris log baru). Transaksi tes dibatalkan
// lewat endpoint undo setelah verifikasi.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173/stok-caturwangsa';
const API = 'https://stok-sabun-palem.zakyshadra.workers.dev';
const OUT = process.env.E2E_OUT || '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = process.env.PLAYWRIGHT_EXE || '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

fs.mkdirSync(OUT, { recursive: true });

async function dwlKlinik() {
  const res = await fetch(`${API}/api/stock`);
  const products = await res.json();
  const p = products.find((x) => x.id === 'dwl-palem-jerigen');
  return { klinik: p.stock.klinik, total: Object.values(p.stock).reduce((a, b) => a + b, 0) };
}

async function logCount() {
  const res = await fetch(`${API}/api/log`);
  const log = await res.json();
  return log.length;
}

const before = await dwlKlinik();
const logBefore = await logCount();
console.log(`SEBELUM: DWL Palem Jerigen klinik=${before.klinik} total=${before.total}, baris log=${logBefore}`);

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'],
  // Browser headless di sandbox tidak bisa keluar internet langsung;
  // pakai proxy egress VM (dibaca dari env, tidak ditulis di file).
  proxy: process.env.HTTPS_PROXY
    ? (() => {
        const u = new URL(process.env.HTTPS_PROXY);
        return { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), bypass: 'localhost,127.0.0.1' };
      })()
    : undefined,
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

// Login sebagai Staff.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Staff/ }).first().click();
await page.getByRole('button', { name: 'Masuk', exact: true }).click();
await page.waitForURL(`${BASE}/`, { timeout: 8000 });
await page.waitForTimeout(800);

// Scan keluar lewat Cari Manual (kamera tidak bisa dites headless).
await page.goto(`${BASE}/scan/keluar`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Cari Manual' }).click();
await page.waitForTimeout(500);
await page.getByPlaceholder('Ketik nama produk...').fill('DWL Palem');
await page.waitForTimeout(500);
await page.getByRole('button', { name: /DWL Palem Jerigen/ }).first().click();
await page.waitForTimeout(800);

// Cek default: lokasi Gudang Klinik, keterangan Jualan Magang, qty 1.
const shown = await page.locator('text=Di Gudang Klinik').count();
console.log(`Lokasi default Gudang Klinik tampil: ${shown > 0 ? 'ya' : 'TIDAK'}`);
if (shown === 0) errors.push('lokasi default bukan Gudang Klinik');
await page.screenshot({ path: path.join(OUT, 'e2e-scan-found.png') });

await page.getByRole('button', { name: 'Simpan Barang Keluar' }).click();
await page.getByText('Berhasil dicatat').waitFor({ timeout: 15000 });
await page.waitForTimeout(500);
const newTotalText = await page.locator('text=Stok sekarang').locator('..').innerText();
console.log(`Layar sukses: ${newTotalText.replace(/\n/g, ' ')}`);
await page.screenshot({ path: path.join(OUT, 'e2e-scan-success.png') });
await browser.close();

// Verifikasi lewat API.
await new Promise((r) => setTimeout(r, 2000));
const after = await dwlKlinik();
const logAfter = await logCount();
console.log(`SESUDAH: DWL Palem Jerigen klinik=${after.klinik} total=${after.total}, baris log=${logAfter}`);

if (after.klinik !== before.klinik - 1) errors.push(`stok klinik ${before.klinik} -> ${after.klinik}, harus berkurang 1`);
if (after.total !== before.total - 1) errors.push(`stok total ${before.total} -> ${after.total}, harus berkurang 1`);
if (logAfter !== logBefore + 1) errors.push(`baris log ${logBefore} -> ${logAfter}, harus bertambah 1`);

// Ambil tx id transaksi terakhir dari log, lalu batalkan lewat undo.
const logRes = await fetch(`${API}/api/log`);
const log = await logRes.json();
const last = log[0];
console.log(`Transaksi terakhir: ${last.id} ${last.productId} ${last.type} ${last.qty} ${last.location} ${last.note} sisa=${last.stockAfter}`);
// Sisa berjalan harus sama dengan total stok produk setelah scan.
if (last.stockAfter !== after.total) errors.push(`sisa log terbaru ${last.stockAfter}, harus ${after.total}`);
// Log terbaru harus transaksi yang baru dibuat (sheet terbaru di atas).
if (last.productId !== 'dwl-palem-jerigen' || last.type !== 'keluar' || last.qty !== 1) errors.push('log terbaru bukan transaksi scan barusan');
const undoRes = await fetch(`${API}/api/scan/undo`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ txId: last.id }),
});
console.log(`Undo: HTTP ${undoRes.status} ${await undoRes.text()}`);

await new Promise((r) => setTimeout(r, 2000));
const restored = await dwlKlinik();
const logFinal = await logCount();
console.log(`SETELAH UNDO: klinik=${restored.klinik} total=${restored.total}, baris log=${logFinal}`);
if (restored.klinik !== before.klinik) errors.push(`stok klinik setelah undo ${restored.klinik}, harus kembali ${before.klinik}`);

if (errors.length > 0) {
  console.log('GAGAL:');
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('E2E LOLOS: scan menulis ke Sheet, stok berubah, undo mengembalikan.');
