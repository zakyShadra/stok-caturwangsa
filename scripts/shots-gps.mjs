// QA verifikasi GPS + selfie: di dalam radius (flow penuh sampai
// absen tercatat), di luar radius (ditolak), izin lokasi ditolak.
// Playwright mock geolocation lewat context.setGeolocation.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5199/stok-caturwangsa';
const OUT = '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const OFFICE = { latitude: -6.93789, longitude: 107.59914 };
const FAR = { latitude: -6.90389, longitude: 107.61861 }; // pusat kota, ~4 km

fs.mkdirSync(OUT, { recursive: true });
const errors = [];

async function checkOverflow(page, label) {
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${label}: overflow-x = ${ox}px`);
  if (ox > 0) errors.push(`${label}: overflow-x ${ox}px`);
}

async function shot(page, name) {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log('saved', name);
}

async function loginAs(page, role) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(role) }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 5000 });
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// ---------- 1. DI DALAM RADIUS: flow penuh + manager melihat selfie ----------
// Semua navigasi lewat React Router (tanpa reload halaman), karena
// data absen masih di memori dan hilang kalau halaman di-refresh.
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['geolocation'],
    geolocation: OFFICE,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`inside pageerror: ${e.message}`));

  await loginAs(page, 'Staff');
  await page.getByRole('button', { name: 'Absen Masuk' }).click();
  await page.getByText('Anda di area pabrik').waitFor({ timeout: 10000 });
  console.log('inside: GPS lolos (di area pabrik)');
  await checkOverflow(page, 'inside selfie-step');
  await shot(page, 'desktop-gps-selfie-step.png');

  const fileInput = page.locator('input[aria-label="Ambil foto selfie"]');
  await fileInput.setInputFiles('/tmp/selfie-test.jpg');
  await page.getByRole('button', { name: 'Ini Foto Saya' }).waitFor({ timeout: 5000 });
  console.log('inside: preview selfie tampil');
  await checkOverflow(page, 'inside selfie-preview');
  await shot(page, 'desktop-gps-selfie-preview.png');

  await page.getByRole('button', { name: 'Ini Foto Saya' }).click();
  await page.getByRole('button', { name: 'Absen berhasil' }).waitFor({ timeout: 5000 });
  console.log('inside: absen masuk tercatat setelah selfie');
  await shot(page, 'desktop-gps-checkedin.png');

  // Keluar lewat tombol sidebar (tanpa reload), masuk sebagai Manager.
  await page.getByRole('button', { name: 'Keluar' }).click();
  await page.waitForURL(BASE + '/login', { timeout: 5000 });
  await page.getByRole('button', { name: /Manager/ }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 5000 });
  await page.waitForTimeout(800);
  const homeText = await page.evaluate(() => document.body.innerText);
  if (!homeText.includes('Semua karyawan sudah absen.')) {
    errors.push('inside: Putra masih di Belum absen setelah absen masuk');
  }
  console.log('inside: beranda manager, Putra sudah tidak di Belum absen');
  await shot(page, 'desktop-gps-home-manager.png');

  // Daftar absensi lewat sidebar (tanpa reload): kartu Putra + selfie.
  await page.getByRole('link', { name: 'Absensi' }).first().click();
  await page.waitForTimeout(800);
  await checkOverflow(page, 'inside absensi-manager');
  const absText = await page.evaluate(() => document.body.innerText);
  if (!absText.includes('Selfie absen')) errors.push('inside: bagian Selfie absen tidak muncul');
  if (!absText.includes('selfie-test.jpg')) errors.push('inside: selfie Putra tidak muncul di daftar absensi');
  if (!absText.includes('Putra')) errors.push('inside: kartu Putra tidak muncul di daftar absensi');
  console.log('inside: kartu Putra + selfie tampil di daftar absensi manager');
  await shot(page, 'desktop-gps-absensi-manager.png');
  await ctx.close();
}

// ---------- 1b. DI DALAM RADIUS (HP): screenshot flow ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['geolocation'],
    geolocation: OFFICE,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`mobile-inside pageerror: ${e.message}`));

  await loginAs(page, 'Staff');
  await page.getByRole('button', { name: 'Absen Masuk' }).click();
  await page.getByText('Anda di area pabrik').waitFor({ timeout: 10000 });
  await checkOverflow(page, 'mobile inside selfie-step');
  await shot(page, 'mobile-gps-selfie-step.png');

  const fileInput = page.locator('input[aria-label="Ambil foto selfie"]');
  await fileInput.setInputFiles('/tmp/selfie-test.jpg');
  await page.getByRole('button', { name: 'Ini Foto Saya' }).waitFor({ timeout: 5000 });
  await checkOverflow(page, 'mobile inside selfie-preview');
  await shot(page, 'mobile-gps-selfie-preview.png');

  await page.getByRole('button', { name: 'Ini Foto Saya' }).click();
  await page.getByRole('button', { name: 'Absen berhasil' }).waitFor({ timeout: 5000 });
  await shot(page, 'mobile-gps-checkedin.png');
  await ctx.close();
}

// ---------- 2. DI LUAR RADIUS: ditolak ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['geolocation'],
    geolocation: FAR,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`outside pageerror: ${e.message}`));

  await loginAs(page, 'Staff');
  await page.getByRole('button', { name: 'Absen Masuk' }).click();
  await page.getByText('Anda di luar area pabrik.').waitFor({ timeout: 10000 });
  console.log('outside: pesan di luar area tampil');
  const noSelfieBtn = await page.getByRole('button', { name: 'Ambil Foto Selfie' }).count();
  if (noSelfieBtn > 0) errors.push('outside: tombol selfie muncul padahal di luar radius');
  const retryBtn = await page.getByRole('button', { name: 'Coba Lagi' }).count();
  if (retryBtn === 0) errors.push('outside: tombol Coba Lagi tidak ada');
  await checkOverflow(page, 'outside rejected');
  await shot(page, 'mobile-gps-outside.png');

  // Batal: kembali ke beranda, tidak ada absen tercatat.
  await page.getByRole('button', { name: 'Batal' }).click();
  await page.waitForTimeout(500);
  const stillThere = await page.getByRole('button', { name: 'Absen Masuk' }).count();
  if (stillThere === 0) errors.push('outside: tombol Absen Masuk hilang setelah batal');
  console.log('outside: batal kembali ke beranda, tidak ada absen tercatat');
  await ctx.close();
}

// ---------- 3. IZIN LOKASI DITOLAK ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    // tanpa permissions geolocation = ditolak
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`denied pageerror: ${e.message}`));

  await loginAs(page, 'Staff');
  await page.getByRole('button', { name: 'Absen Masuk' }).click();
  await page.getByText('Izin lokasi belum diberikan.').waitFor({ timeout: 10000 });
  console.log('denied: pesan izin lokasi tampil');
  await checkOverflow(page, 'denied permission');
  await shot(page, 'mobile-gps-denied.png');
  await ctx.close();
}

await browser.close();

console.log('\n=== HASIL ===');
if (errors.length === 0) {
  console.log('SEMUA CEK LOLOS');
} else {
  console.log(`${errors.length} MASALAH:`);
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
