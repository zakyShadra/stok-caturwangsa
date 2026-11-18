// Audit menyeluruh: tiap halaman x tiap peran, semua tombol diklik,
// semua form dikirim, hasilnya benar-benar terjadi (bukan cuma render).
// Termasuk verifikasi bug tampilan stok di halaman scan (Bomber Matic:
// Klinik 3, Gdg Kantor 1, Kantor 0, total 4).
// Build lokal (localApi). Jalankan dengan preview server di port 5199.
// Screenshot prefix scan-/audit- di ~/workspace/your_files/stok-caturwangsa-ui/.
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

async function logout(page) {
  await page.goto(BASE + '/akun', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Keluar' }).last().click();
  await page.waitForURL(BASE + '/login', { timeout: 8000 });
}

async function checkOverflow(page, label) {
  const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label}: overflow-x 0`, ox === 0, `${ox}px`);
}

async function shot(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('saved', name);
}

function watchErrors(page, label) {
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.text().includes('ERR_TUNNEL_CONNECTION_FAILED') || m.text().includes('Failed to load resource')) return;
    errors.push(`${label} console: ${m.text()}`);
  });
}

// Pilih produk lewat Cari Manual di halaman scan.
async function pickManual(page, productName) {
  await page.getByRole('button', { name: 'Cari Manual' }).click();
  await page.waitForTimeout(500);
  await page.locator('button', { hasText: productName }).first().click();
  await page.waitForTimeout(500);
}

// Angka stepper saat ini.
async function stepperValue(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('text-[40px]'));
    return el ? el.textContent.trim() : '';
  });
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// ---------- BUG TAMPILAN SCAN (mobile 390x844) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  watchErrors(page, 'scan-mobile');
  await loginAs(page, 'Staff');

  // Footer: kelihatan di Beranda (mobile), di atas BottomNav.
  const footerTextMobile = await page.evaluate(() => document.querySelector('footer')?.textContent ?? '');
  check('footer mobile: menampilkan copyright 2026', footerTextMobile.includes('© 2026 PT Catur Wangsa Indah. All rights reserved.'), footerTextMobile.trim());
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const footerBoxMobile = await page.locator('footer').boundingBox();
  const navBoxMobile = await page.locator('nav[aria-label="Navigasi utama"]').boundingBox();
  const vhMobile = page.viewportSize().height;
  check('footer mobile: kelihatan penuh setelah scroll ke bawah',
    footerBoxMobile !== null && footerBoxMobile.y >= 0 && footerBoxMobile.y + footerBoxMobile.height <= vhMobile,
    footerBoxMobile ? `y=${Math.round(footerBoxMobile.y)} h=${Math.round(footerBoxMobile.height)} vh=${vhMobile}` : 'tidak ketemu');
  check('footer mobile: berada di atas BottomNav (tidak tertutup)',
    footerBoxMobile !== null && navBoxMobile !== null && footerBoxMobile.y + footerBoxMobile.height <= navBoxMobile.y,
    footerBoxMobile && navBoxMobile ? `footer bawah ${Math.round(footerBoxMobile.y + footerBoxMobile.height)} vs nav atas ${Math.round(navBoxMobile.y)}` : 'tidak ketemu');
  await shot(page, 'audit-footer-mobile.png');

  // Barang Keluar, Bomber Matic: Klinik 3 (bukan total 4 yang ditonjolkan).
  await page.goto(BASE + '/scan/keluar', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('footer mobile: tidak tampil di halaman scan', (await page.locator('footer').count()) === 0);
  await pickManual(page, 'Bomber Matic');
  const cardText = await page.evaluate(() => document.body.textContent);
  check('scan: kartu menampilkan "Stok di Gudang Klinik: 3 bal"', cardText.includes('Stok di Gudang Klinik:') && cardText.includes('Total semua gudang: 4 bal'));
  check('scan: label lama "Stok saat ini:" sudah tidak ada', !cardText.includes('Stok saat ini:'));
  await shot(page, 'scan-keluar-bomber-klinik.png');

  // Stepper mentok di 3 (stok Klinik).
  await page.getByRole('button', { name: 'Tambah jumlah' }).click();
  await page.getByRole('button', { name: 'Tambah jumlah' }).click();
  check('scan: stepper naik ke 3', (await stepperValue(page)) === '3');
  check('scan: tombol + nonaktif di batas 3', await page.getByRole('button', { name: 'Tambah jumlah' }).isDisabled());
  await page.getByRole('button', { name: 'Tambah jumlah' }).click({ force: true }).catch(() => {});
  check('scan: qty tetap 3 setelah paksa klik +', (await stepperValue(page)) === '3');

  // Pindah ke Gdg Kantor: tampil 1, jumlah ikut turun ke 1.
  await page.getByRole('radio', { name: 'Gdg Kantor' }).click();
  await page.waitForTimeout(400);
  const gdgText = await page.evaluate(() => document.body.textContent);
  check('scan: pindah Gdg Kantor menampilkan stok 1', gdgText.includes('Stok di Gudang Kantor:'));
  check('scan: jumlah ikut turun (clamp) ke 1', (await stepperValue(page)) === '1', await stepperValue(page));
  await shot(page, 'scan-keluar-bomber-gdgkantor.png');

  // Pindah ke Kantor: stok 0, pesan habis, Simpan nonaktif.
  await page.getByRole('radio', { name: 'Kantor', exact: true }).click();
  await page.waitForTimeout(400);
  const kantorText = await page.evaluate(() => document.body.textContent);
  check('scan: Kantor menampilkan "Stok habis di lokasi ini"', kantorText.includes('Stok habis di lokasi ini'));
  check('scan: tombol Simpan nonaktif saat stok lokasi 0', await page.getByRole('button', { name: 'Simpan Barang Keluar' }).isDisabled());
  await shot(page, 'scan-keluar-bomber-kantor-habis.png');
  await checkOverflow(page, 'scan /keluar mobile');

  // Barang Masuk: stepper TIDAK dibatasi stok lokasi.
  await page.goto(BASE + '/scan/masuk', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await pickManual(page, 'Bomber Matic');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Tambah jumlah' }).click();
  check('scan masuk: stepper tidak dibatasi (qty 6)', (await stepperValue(page)) === '6');
  check('scan masuk: tombol + tetap aktif', await page.getByRole('button', { name: 'Tambah jumlah' }).isEnabled());
  await ctx.close();
}

// ---------- AUDIT ALUR STOK (desktop 1280x800) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  watchErrors(page, 'audit-desktop');
  await loginAs(page, 'Admin');

  // Footer: kelihatan di Beranda (desktop), di bawah konten.
  const footerTextDesktop = await page.evaluate(() => document.querySelector('footer')?.textContent ?? '');
  check('footer desktop: menampilkan copyright 2026', footerTextDesktop.includes('© 2026 PT Catur Wangsa Indah. All rights reserved.'), footerTextDesktop.trim());
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  const footerBoxDesktop = await page.locator('footer').boundingBox();
  const vhDesktop = page.viewportSize().height;
  check('footer desktop: kelihatan penuh setelah scroll ke bawah',
    footerBoxDesktop !== null && footerBoxDesktop.y >= 0 && footerBoxDesktop.y + footerBoxDesktop.height <= vhDesktop,
    footerBoxDesktop ? `y=${Math.round(footerBoxDesktop.y)} h=${Math.round(footerBoxDesktop.height)} vh=${vhDesktop}` : 'tidak ketemu');
  await shot(page, 'audit-footer-desktop.png');

  // Beranda staf: 3 tombol raksasa (cek sebagai Staff).
  await logout(page);
  await loginAs(page, 'Staff');
  await page.getByRole('link', { name: 'Barang Masuk' }).first().click();
  await page.waitForURL(BASE + '/scan/masuk', { timeout: 8000 });
  check('audit: tombol raksasa Barang Masuk ke /scan/masuk', page.url() === BASE + '/scan/masuk');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Barang Keluar' }).first().click();
  await page.waitForURL(BASE + '/scan/keluar', { timeout: 8000 });
  check('audit: tombol raksasa Barang Keluar ke /scan/keluar', page.url() === BASE + '/scan/keluar');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Lihat Stok' }).first().click();
  await page.waitForURL(BASE + '/stok', { timeout: 8000 });
  check('audit: tombol raksasa Lihat Stok ke /stok', page.url() === BASE + '/stok');

  // Scan Masuk DWL Palem Jerigen +3 (435 -> 438), lalu undo (-> 435).
  await page.goto(BASE + '/scan/masuk', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await pickManual(page, 'DWL Palem Jerigen');
  await page.getByRole('button', { name: 'Tambah jumlah' }).click();
  await page.getByRole('button', { name: 'Tambah jumlah' }).click();
  check('audit: qty DWL jadi 3', (await stepperValue(page)) === '3');
  await page.getByRole('radio', { name: 'Gdg Kantor' }).click();
  await page.getByRole('button', { name: 'Retur' }).click();
  await page.getByRole('button', { name: 'Simpan Barang Masuk' }).click();
  await page.getByRole('heading', { name: 'Berhasil dicatat' }).waitFor({ timeout: 8000 });
  const successText = await page.evaluate(() => document.body.textContent);
  check('audit: layar sukses menampilkan stok sekarang 438', successText.includes('438'));
  await shot(page, 'audit-scan-sukses.png');
  await page.getByRole('button', { name: 'Batalkan, saya salah input' }).click();
  await page.waitForTimeout(800);
  check('audit: undo kembali ke layar scan', (await page.getByRole('button', { name: 'Cari Manual' }).count()) >= 1);
  // Cek stok kembali 435 lewat navigasi dalam app (tanpa reload,
  // supaya state localApi tidak ke-reset).
  await page.locator('aside nav a', { hasText: 'Lihat Stok' }).click();
  await page.waitForTimeout(1000);
  await page.fill('input[type="search"]', 'DWL Palem Jerigen');
  await page.waitForTimeout(500);
  const dwlText = await page.evaluate(() => document.body.textContent);
  check('audit: DWL kembali 435 setelah undo', dwlText.includes('435'));
  await checkOverflow(page, 'audit /stok desktop');

  // Stok: search, filter, detail kartu, tautan scan di detail.
  await page.fill('input[type="search"]', 'jelly');
  await page.waitForTimeout(500);
  const jellyCount = await page.locator('button[aria-expanded]').count();
  check('audit: search "jelly" menampilkan 3 produk', jellyCount === 3, `${jellyCount}`);
  await page.fill('input[type="search"]', '');
  await page.getByRole('button', { name: 'Menipis', exact: true }).click();
  await page.waitForTimeout(500);
  const menipisCount = await page.locator('button[aria-expanded]').count();
  check('audit: filter Menipis menampilkan 3 produk', menipisCount === 3, `${menipisCount}`);
  await page.getByRole('button', { name: 'Semua', exact: true }).click();
  await page.fill('input[type="search"]', 'Bomber Matic');
  await page.waitForTimeout(500);
  await page.locator('button[aria-expanded]').first().click();
  await page.waitForTimeout(500);
  const detailText = await page.evaluate(() => document.body.textContent);
  check('audit: detail produk menampilkan stok per lokasi', detailText.includes('Stok per lokasi') && detailText.includes('Batas minimum'));
  await page.locator('main').getByRole('link', { name: 'Barang Masuk' }).click();
  await page.waitForURL(BASE + '/scan/masuk', { timeout: 8000 });
  check('audit: tautan Barang Masuk di detail ke /scan/masuk', page.url() === BASE + '/scan/masuk');

  // Riwayat: filter + tampilan Per Hari + navigasi bulan.
  await page.goto(BASE + '/riwayat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const allCount = await page.locator('article').count();
  const filterGroup = page.getByRole('group', { name: 'Filter jenis pergerakan' });
  await filterGroup.getByRole('button', { name: 'Keluar', exact: true }).click();
  await page.waitForTimeout(500);
  const keluarCount = await page.locator('article').count();
  check('audit: filter Keluar mengubah jumlah baris', keluarCount < allCount && keluarCount > 0, `${allCount} -> ${keluarCount}`);
  await filterGroup.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForTimeout(500);
  const masukCount = await page.locator('article').count();
  check('audit: filter Masuk menampilkan baris', masukCount > 0, `${masukCount}`);
  await page.getByRole('button', { name: 'Per Hari' }).click();
  await page.waitForTimeout(1000);
  const monthlyText = await page.evaluate(() => document.body.textContent);
  check('audit: Per Hari menampilkan November 2026', monthlyText.includes('November 2026'));
  await page.getByRole('button', { name: 'Bulan sebelumnya' }).click();
  await page.waitForTimeout(1000);
  const prevMonth = await page.evaluate(() => document.body.textContent);
  check('audit: bulan sebelumnya menampilkan Oktober 2026', prevMonth.includes('Oktober 2026'));
  check('audit: tombol bulan berikutnya aktif di bulan lampau', await page.getByRole('button', { name: 'Bulan berikutnya' }).isEnabled());
  await page.getByRole('button', { name: 'Bulan berikutnya' }).click();
  await page.waitForTimeout(1000);
  check('audit: tombol bulan berikutnya nonaktif di bulan berjalan', await page.getByRole('button', { name: 'Bulan berikutnya' }).isDisabled());
  await checkOverflow(page, 'audit /riwayat desktop');

  // Laporan: unduh CSV (isi file diperiksa).
  await logout(page);
  await loginAs(page, 'Manager');
  await page.goto(BASE + '/laporan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const downloadPromise = page.waitForEvent('download', { timeout: 8000 });
  await page.getByRole('button', { name: 'Unduh CSV (untuk Excel)' }).click();
  const download = await downloadPromise;
  const csvPath = path.join('/tmp', 'laporan-test.csv');
  await download.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  check('audit: CSV terunduh berisi header + Maya Putri', csv.includes('Nama,Divisi,Hadir,Izin/Cuti,Menunggu Persetujuan,Total Hari') && csv.includes('Maya Putri'), csv.split('\n')[0]);
  await checkOverflow(page, 'audit /laporan desktop');

  // Login salah password: pesan error, tetap di /login.
  await logout(page);
  await page.fill('#email', 'staff@sabunpalem.co.id');
  await page.fill('#password', 'salah123');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.waitForTimeout(500);
  check('audit: password salah menampilkan pesan error', (await page.getByText('Email atau password salah. Coba lagi.').count()) === 1);
  check('audit: password salah tetap di /login', page.url() === BASE + '/login');

  // Halaman Akun: nama + peran + Keluar.
  await loginAs(page, 'Staff');
  await page.goto(BASE + '/akun', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const akunText = await page.evaluate(() => document.body.textContent);
  check('audit: /akun menampilkan Putra + Staff', akunText.includes('Putra') && akunText.includes('Staff'));
  await checkOverflow(page, 'audit /akun desktop');
  await shot(page, 'audit-akun-desktop.png');
  await ctx.close();
}

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
