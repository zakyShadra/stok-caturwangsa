// QA pembersihan data: beranda staf/manager/bos, absensi, karyawan,
// laporan. Desktop + mobile, cek overflow-x + asersi konten.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5199/stok-caturwangsa';
const OUT = '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

const DELETED = ['Siti', 'Dewi Lestari', 'Rudi', 'Andi Pratama', 'Rina Kusuma', 'Joko Susilo'];
const errors = [];

async function checkOverflow(page, label) {
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${label}: overflow-x = ${ox}px`);
  if (ox > 0) errors.push(`${label}: overflow-x ${ox}px`);
}

async function checkNoDeletedNames(page, label) {
  const text = await page.evaluate(() => document.body.innerText);
  for (const name of DELETED) {
    if (text.includes(name)) errors.push(`${label}: nama terhapus masih muncul: ${name}`);
  }
  console.log(`${label}: tidak ada nama terhapus`);
}

async function shot(page, name) {
  await page.waitForTimeout(1300);
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

async function logout(page) {
  await page.evaluate(() => {
    localStorage.removeItem('sabunpalem-user');
    localStorage.removeItem('sabunpalem-absen-hari-ini');
  });
}

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox'],
});

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.name === 'mobile',
    hasTouch: vp.name === 'mobile',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${vp.name} console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${vp.name} pageerror: ${e.message}`));

  // Beranda staf
  await loginAs(page, 'Staff');
  await checkOverflow(page, `${vp.name} home-staff`);
  await checkNoDeletedNames(page, `${vp.name} home-staff`);
  await shot(page, `${vp.name}-home-staff.png`);

  // Absensi staf (Budi belum absen: kartu bukti kerja minta absen dulu)
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} absensi-staff`);
  await checkNoDeletedNames(page, `${vp.name} absensi-staff`);
  await shot(page, `${vp.name}-absensi-staff.png`);

  // Manager
  await logout(page);
  await loginAs(page, 'Manager');
  await checkOverflow(page, `${vp.name} home-manager`);
  await checkNoDeletedNames(page, `${vp.name} home-manager`);
  const homeText = await page.evaluate(() => document.body.innerText);
  if (!homeText.includes('Total karyawan')) errors.push(`${vp.name} home-manager: ringkasan tidak muncul`);
  if (!homeText.includes('Budi Santoso')) errors.push(`${vp.name} home-manager: Budi tidak muncul di Belum absen`);
  if (!homeText.includes('Maya Putri')) errors.push(`${vp.name} home-manager: Maya tidak muncul di Telat`);
  if (!homeText.includes('1 dari 1')) errors.push(`${vp.name} home-manager: hitungan bukti kerja bukan 1 dari 1`);
  console.log(`${vp.name} home-manager: angka dicek (Budi belum absen, Maya telat, bukti 1 dari 1)`);
  await shot(page, `${vp.name}-home-manager.png`);

  // Absensi manager: hanya 1 kartu (Maya)
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} absensi-manager`);
  await checkNoDeletedNames(page, `${vp.name} absensi-manager`);
  const cards = await page.locator('article').count();
  console.log(`${vp.name} absensi-manager: ${cards} kartu absen + rekap`);
  await shot(page, `${vp.name}-absensi-manager.png`);

  // Lightbox bukti kerja Maya
  const thumb = page.getByRole('button', { name: /Lihat foto-admin/ }).first();
  if (await thumb.count()) {
    await thumb.click();
    await page.waitForTimeout(600);
    await shot(page, `${vp.name}-absensi-lightbox.png`);
    await page.getByRole('button', { name: 'Tutup' }).click();
    await page.waitForTimeout(300);
  } else {
    errors.push(`${vp.name}: thumbnail foto-admin tidak ditemukan`);
  }

  // Karyawan: hanya 2
  await page.goto(BASE + '/karyawan', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} karyawan`);
  await checkNoDeletedNames(page, `${vp.name} karyawan`);
  const empText = await page.evaluate(() => document.body.innerText);
  if (!empText.includes('Total 2 karyawan')) errors.push(`${vp.name} karyawan: total bukan 2`);
  console.log(`${vp.name} karyawan: Total 2 dicek`);
  await shot(page, `${vp.name}-karyawan.png`);

  // Laporan: total 1 catatan, telat 1
  await page.goto(BASE + '/laporan', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} laporan`);
  await checkNoDeletedNames(page, `${vp.name} laporan`);
  const repText = await page.evaluate(() => document.body.innerText);
  if (!repText.includes('1 catatan absen')) errors.push(`${vp.name} laporan: total catatan bukan 1`);
  console.log(`${vp.name} laporan: total 1 catatan dicek`);
  await shot(page, `${vp.name}-laporan.png`);

  // Bos: beranda tanpa tombol absen dan tanpa kartu "Absen saya"
  await logout(page);
  await loginAs(page, 'Bos');
  await checkOverflow(page, `${vp.name} home-bos`);
  await checkNoDeletedNames(page, `${vp.name} home-bos`);
  const bosText = await page.evaluate(() => document.body.innerText);
  const absenMasukBtn = await page.getByRole('button', { name: 'Absen Masuk' }).count();
  if (absenMasukBtn > 0) errors.push(`${vp.name} home-bos: tombol Absen Masuk masih ada`);
  if (bosText.includes('Absen saya')) errors.push(`${vp.name} home-bos: kartu Absen saya masih ada`);
  if (!bosText.includes('Perlu perhatian hari ini')) errors.push(`${vp.name} home-bos: panel perhatian tidak muncul`);
  console.log(`${vp.name} home-bos: tanpa tombol absen, panel perhatian ada`);
  await shot(page, `${vp.name}-home-bos.png`);

  // Absensi bos: bisa lihat daftar hadir + bukti
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} absensi-bos`);
  await checkNoDeletedNames(page, `${vp.name} absensi-bos`);
  await shot(page, `${vp.name}-absensi-bos.png`);

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
