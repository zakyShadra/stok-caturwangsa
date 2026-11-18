// Screenshot QA aplikasi gabungan (absensi + stok): login, beranda
// staf + manager, absensi, karyawan, laporan, scan, stok, riwayat.
// Desktop + mobile, cek overflow-x dan posisi pill navigasi.
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

const errors = [];

async function checkOverflow(page, label) {
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${label}: overflow-x = ${ox}px`);
  if (ox > 0) errors.push(`${label}: overflow-x ${ox}px`);
}

async function checkPill(page, label) {
  const diff = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navigasi utama"]');
    if (!nav) return 'no bottom nav';
    const pill = nav.querySelector('div[aria-hidden="true"]');
    const active = nav.querySelector('a[aria-current="page"]');
    if (!pill || !active) return 'pill/active missing';
    const p = pill.getBoundingClientRect();
    const a = active.getBoundingClientRect();
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

async function checkSidebarPill(page, label) {
  const diff = await page.evaluate(() => {
    const pill = document.querySelector('.sidebar-pill');
    if (!pill) return 'no sidebar pill';
    const pr = pill.getBoundingClientRect();
    if (pr.height === 0) return 'pill hidden';
    const active = document.querySelector('aside nav a[aria-current="page"]');
    if (!active) return 'no active link';
    const ar = active.getBoundingClientRect();
    const topDiff = Math.abs(pr.top - ar.top);
    const heightDiff = Math.abs(pr.height - ar.height);
    return `top diff ${topDiff.toFixed(1)}px, height diff ${heightDiff.toFixed(1)}px`;
  });
  console.log(`${label}: sidebar pill ${diff}`);
  if (typeof diff === 'string' && diff.includes('diff')) {
    const nums = diff.match(/[\d.]+/g).map(Number);
    if (nums[0] > 2 || nums[1] > 2) errors.push(`${label}: sidebar pill misaligned (${diff})`);
  }
}

async function shot(page, name) {
  await page.waitForTimeout(1300); // tunggu entrance selesai
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

  // Login
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} login`);
  await shot(page, `${vp.name}-login.png`);

  // Beranda staf
  await loginAs(page, 'Staff');
  await checkOverflow(page, `${vp.name} home-staff`);
  if (vp.name === 'mobile') await checkPill(page, `${vp.name} home-staff`);
  else await checkSidebarPill(page, `${vp.name} home-staff`);
  await shot(page, `${vp.name}-home-staff.png`);

  // Absen masuk (staf) -> tombol hijau
  await page.getByRole('button', { name: 'Absen Masuk' }).click();
  await page.waitForTimeout(600);
  await shot(page, `${vp.name}-home-staff-checkedin.png`);

  // Absensi (staf: riwayat sendiri + kartu bukti kerja sebelum absen)
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} absensi-staff`);
  if (vp.name === 'mobile') await checkPill(page, `${vp.name} absensi-staff`);
  else await checkSidebarPill(page, `${vp.name} absensi-staff`);
  await shot(page, `${vp.name}-absensi-staff.png`);

  // Upload bukti kerja (staf sudah absen masuk di beranda tadi)
  const uploadBtn = page.getByRole('button', { name: '+ Lampirkan File' });
  if (await uploadBtn.count()) {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('/tmp/bukti-test.png');
    await page.waitForTimeout(800);
    await checkOverflow(page, `${vp.name} absensi-upload`);
    await shot(page, `${vp.name}-absensi-upload.png`);
    const uploaded = await page.getByText('bukti-test.png').count();
    console.log(`${vp.name} upload bukti: ${uploaded > 0 ? 'OK (file muncul)' : 'GAGAL (file tidak muncul)'}`);
    if (uploaded === 0) errors.push(`${vp.name}: file bukti tidak muncul setelah upload`);
  } else {
    errors.push(`${vp.name}: tombol Lampirkan File tidak ditemukan (staf sudah absen)`);
  }

  // Scan (kamera palsu)
  await page.goto(BASE + '/scan/keluar', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await checkOverflow(page, `${vp.name} scan`);
  await shot(page, `${vp.name}-scan.png`);

  // Cari Manual -> pilih produk -> kartu produk
  await page.getByRole('button', { name: 'Cari Manual' }).click();
  await page.waitForTimeout(600);
  await page.getByPlaceholder('Ketik nama produk...').fill('jelly');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Jelly 130gr/ }).first().click();
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

  // Stok
  await page.goto(BASE + '/stok', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} stok`);
  if (vp.name === 'mobile') await checkPill(page, `${vp.name} stok`);
  else await checkSidebarPill(page, `${vp.name} stok`);
  await shot(page, `${vp.name}-stok.png`);

  // Riwayat
  await page.goto(BASE + '/riwayat', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} riwayat`);
  if (vp.name === 'mobile') await checkPill(page, `${vp.name} riwayat`);
  else await checkSidebarPill(page, `${vp.name} riwayat`);
  await shot(page, `${vp.name}-riwayat.png`);

  // Staff mencoba buka /karyawan -> dialihkan ke beranda
  await page.goto(BASE + '/karyawan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const staffUrl = page.url();
  console.log(`${vp.name} staff /karyawan redirect: ${staffUrl.endsWith('/stok-caturwangsa/') ? 'OK (ke beranda)' : 'GAGAL: ' + staffUrl}`);
  if (!staffUrl.endsWith('/stok-caturwangsa/')) errors.push(`${vp.name}: staff bisa buka /karyawan`);

  // Keluar, login sebagai Manager
  await page.evaluate(() => localStorage.removeItem('sabunpalem-user'));
  await loginAs(page, 'Manager');
  await checkOverflow(page, `${vp.name} home-manager`);
  if (vp.name === 'mobile') await checkPill(page, `${vp.name} home-manager`);
  else await checkSidebarPill(page, `${vp.name} home-manager`);
  await shot(page, `${vp.name}-home-manager.png`);

  // Absensi (manager: semua karyawan + bukti kerja)
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} absensi-manager`);
  await shot(page, `${vp.name}-absensi-manager.png`);

  // Lightbox: klik thumbnail bukti kerja pertama
  const thumb = page.getByRole('button', { name: /Lihat foto-packing-pagi/ }).first();
  if (await thumb.count()) {
    await thumb.click();
    await page.waitForTimeout(600);
    await shot(page, `${vp.name}-absensi-lightbox.png`);
    await page.getByRole('button', { name: 'Tutup' }).click();
    await page.waitForTimeout(300);
  } else {
    errors.push(`${vp.name}: thumbnail bukti kerja tidak ditemukan di absensi manager`);
  }

  // Tandai Izin/Cuti (manager)
  await page.getByRole('button', { name: 'Tandai Izin / Cuti' }).click();
  await page.waitForTimeout(600);
  await shot(page, `${vp.name}-absensi-mark.png`);

  // Karyawan (manager)
  await page.goto(BASE + '/karyawan', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} karyawan`);
  if (vp.name === 'desktop') await checkSidebarPill(page, `${vp.name} karyawan`);
  await shot(page, `${vp.name}-karyawan.png`);

  // Laporan (manager)
  await page.goto(BASE + '/laporan', { waitUntil: 'networkidle' });
  await checkOverflow(page, `${vp.name} laporan`);
  if (vp.name === 'desktop') await checkSidebarPill(page, `${vp.name} laporan`);
  await shot(page, `${vp.name}-laporan.png`);

  await ctx.close();
}

await browser.close();

console.log('\n=== ERRORS ===');
if (errors.length === 0) console.log('none');
else errors.forEach((e) => console.log('-', e));
