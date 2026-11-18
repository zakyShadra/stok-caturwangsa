// Uji perbaikan tombol Keluar: sidebar menempel di viewport (desktop),
// item Akun di nav bawah (HP), dan aksi keluar-masuk yang sesungguhnya.
// Mobile 390x844 dan desktop 1280x800. Screenshot prefix logout- di
// ~/workspace/your_files/stok-caturwangsa-ui/.
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
  await page.waitForTimeout(800);
}

async function checkOverflow(page, label) {
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label}: overflow-x 0`, ox === 0, `${ox}px`);
}

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, name), fullPage });
  console.log('saved', name);
}

// Apakah tombol Keluar kelihatan di dalam viewport tanpa scroll?
async function keluarVisibleInViewport(page, label) {
  const box = await page.getByRole('button', { name: 'Keluar' }).first().boundingBox();
  const vh = page.viewportSize().height;
  const visible = box !== null && box.y >= 0 && box.y + box.height <= vh;
  check(`${label}: tombol Keluar kelihatan tanpa scroll`, visible, box ? `y=${Math.round(box.y)} h=${Math.round(box.height)} viewport=${vh}` : 'tidak ketemu');
  return box;
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// ---------- DESKTOP 1280x800 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`desktop pageerror: ${e.message}`));
  await loginAs(page, 'Staff');

  // Halaman panjang (Stok, 24 produk): Keluar harus kelihatan tanpa scroll.
  await page.goto(BASE + '/stok', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await keluarVisibleInViewport(page, 'desktop /stok');
  await checkOverflow(page, 'desktop /stok');

  // Pill sidebar sejajar dengan item aktif (Lihat Stok).
  const pillDiff = await page.evaluate(() => {
    const pill = document.querySelector('.sidebar-pill');
    const active = document.querySelector('aside nav a[aria-current="page"]');
    if (!pill || !active) return null;
    const p = pill.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    return { top: Math.abs(p.top - a.top), height: Math.abs(p.height - a.height) };
  });
  check('desktop: pill sidebar sejajar item aktif', pillDiff !== null && pillDiff.top <= 2 && pillDiff.height <= 2,
    pillDiff ? `selisih top ${pillDiff.top.toFixed(1)}px tinggi ${pillDiff.height.toFixed(1)}px` : 'pill/link tidak ketemu');
  await shot(page, 'logout-desktop-stok-pinned.png');

  // Scroll halaman sampai bawah: Keluar harus TETAP kelihatan (sticky).
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await keluarVisibleInViewport(page, 'desktop /stok setelah scroll ke bawah');

  // Halaman pendek (Beranda): Keluar kelihatan tanpa scroll.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await keluarVisibleInViewport(page, 'desktop /');
  await shot(page, 'logout-desktop-home-pinned.png');

  // Aksi sesungguhnya: klik Keluar di sidebar, harus sampai di /login.
  await page.getByRole('button', { name: 'Keluar' }).first().click();
  await page.waitForURL(BASE + '/login', { timeout: 8000 });
  check('desktop: klik Keluar sidebar sampai di /login', page.url() === BASE + '/login', page.url());

  // Masuk lagi sebagai Staff.
  await page.getByRole('button', { name: /Staff/ }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 8000 });
  check('desktop: masuk lagi setelah keluar', page.url() === BASE + '/');

  // Halaman /akun di desktop: tidak error, tidak overflow.
  await page.goto(BASE + '/akun', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('desktop: /akun menampilkan nama Putra', (await page.getByText('Putra').count()) >= 1);
  await checkOverflow(page, 'desktop /akun');
  await ctx.close();
}

// ---------- MOBILE 390x844 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
  await loginAs(page, 'Staff');

  // Nav bawah: 5 item.
  const navCount = await page.locator('nav[aria-label="Navigasi utama"] a').count();
  check('mobile: nav bawah punya 5 item', navCount === 5, `${navCount} item`);
  const navLabels = await page.locator('nav[aria-label="Navigasi utama"] a span').allTextContents();
  check('mobile: item ke-5 adalah Akun', navLabels[4] === 'Akun', navLabels.join(', '));
  await checkOverflow(page, 'mobile /');
  await shot(page, 'logout-mobile-bottomnav.png');

  // Pill nav bawah sejajar item aktif (Beranda).
  const pillDiff = await page.evaluate(() => {
    const grid = document.querySelector('nav[aria-label="Navigasi utama"] > div');
    const pill = grid?.querySelector('div[aria-hidden="true"]');
    const link = grid?.querySelectorAll('a')[0];
    if (!pill || !link) return null;
    const p = pill.getBoundingClientRect();
    const l = link.getBoundingClientRect();
    return { left: Math.abs(p.left - (l.left + 6)), width: Math.abs(p.width - (l.width - 12)) };
  });
  check('mobile: pill nav bawah sejajar Beranda', pillDiff !== null && pillDiff.left <= 2 && pillDiff.width <= 2,
    pillDiff ? `selisih kiri ${pillDiff.left.toFixed(1)}px lebar ${pillDiff.width.toFixed(1)}px` : 'pill/link tidak ketemu');

  // Ketuk Akun: halaman akun tampil dengan nama + peran + tombol Keluar.
  await page.locator('nav[aria-label="Navigasi utama"] a', { hasText: 'Akun' }).click();
  await page.waitForURL(BASE + '/akun', { timeout: 8000 });
  await page.waitForTimeout(900);
  check('mobile: ketuk Akun sampai di /akun', page.url() === BASE + '/akun', page.url());
  check('mobile: /akun menampilkan nama Putra', (await page.getByText('Putra').count()) >= 1);
  check('mobile: /akun menampilkan peran Staff', (await page.getByText('Staff', { exact: true }).count()) >= 1);
  const keluarBox = await page.getByRole('button', { name: 'Keluar' }).boundingBox();
  check('mobile: tombol Keluar di /akun tingginya >= 48px', keluarBox !== null && keluarBox.height >= 48,
    keluarBox ? `${Math.round(keluarBox.height)}px` : 'tidak ketemu');
  await checkOverflow(page, 'mobile /akun');
  await shot(page, 'logout-mobile-akun.png');

  // Pill nav bawah pindah ke Akun (item ke-5).
  const pillAkun = await page.evaluate(() => {
    const grid = document.querySelector('nav[aria-label="Navigasi utama"] > div');
    const pill = grid?.querySelector('div[aria-hidden="true"]');
    const link = grid?.querySelectorAll('a')[4];
    if (!pill || !link) return null;
    const p = pill.getBoundingClientRect();
    const l = link.getBoundingClientRect();
    return { left: Math.abs(p.left - (l.left + 6)), width: Math.abs(p.width - (l.width - 12)) };
  });
  check('mobile: pill nav bawah pindah ke Akun', pillAkun !== null && pillAkun.left <= 2 && pillAkun.width <= 2,
    pillAkun ? `selisih kiri ${pillAkun.left.toFixed(1)}px lebar ${pillAkun.width.toFixed(1)}px` : 'pill/link tidak ketemu');

  // Aksi sesungguhnya: ketuk Keluar di halaman Akun, harus sampai di /login.
  await page.getByRole('button', { name: 'Keluar' }).click();
  await page.waitForURL(BASE + '/login', { timeout: 8000 });
  check('mobile: ketuk Keluar di /akun sampai di /login', page.url() === BASE + '/login', page.url());

  // Masuk lagi sebagai Staff.
  await page.getByRole('button', { name: /Staff/ }).first().click();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForURL(BASE + '/', { timeout: 8000 });
  check('mobile: masuk lagi setelah keluar', page.url() === BASE + '/');
  await ctx.close();
}

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
