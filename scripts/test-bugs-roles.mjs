// Uji 3 bug (selfie rusak, absen nyatu semua role, Beranda stok 0)
// + matriks peran + workflow persetujuan absensi.
// Mobile 390x844 dan desktop 1280x800. Build lokal (localApi):
// total stok yang diharapkan 3.227 barang, 24 produk, 3 menipis.
// Jalankan dengan preview server aktif di port 5199.
// Screenshot prefix bug1-/bug2-/bug3-/approval-/roles- di
// ~/workspace/your_files/stok-caturwangsa-ui/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5199/stok-caturwangsa';
const OUT = '/home/hatch/workspace/your_files/stok-caturwangsa-ui';
const EXE = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const SELFIE = '/home/hatch/workspace/stok-caturwangsa/public/logo.png';
const OFFICE = { latitude: -6.93789, longitude: 107.59914 };
const TOMORROW = '2026-11-19';

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

// Alur absen lengkap: klik tombol, tunggu GPS lolos, pilih foto
// selfie, konfirmasi preview. successLabel = teks tombol setelah sukses.
async function doCheckFlow(page, buttonName, successLabel) {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  await page.locator('input[type="file"]').first().waitFor({ state: 'attached', timeout: 15000 });
  await page.setInputFiles('input[type="file"]', SELFIE);
  await page.getByRole('button', { name: 'Ini Foto Saya' }).click({ timeout: 10000 });
  await page.getByRole('button', { name: successLabel }).waitFor({ timeout: 8000 });
}

// Apakah gambar dengan alt tertentu tampil utuh (tidak rusak)?
async function imgOk(page, alt) {
  return page.evaluate((a) => {
    const img = document.querySelector(`img[alt="${a}"]`);
    return img !== null && img.complete && img.naturalWidth > 0;
  }, alt);
}

function watchErrors(page, label) {
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Font Google tidak bisa dijangkau dari VM (tidak ada internet
    // eksternal): kegagalan muat resource itu lingkungan, bukan bug app.
    if (m.text().includes('ERR_TUNNEL_CONNECTION_FAILED') || m.text().includes('Failed to load resource')) return;
    errors.push(`${label} console: ${m.text()}`);
  });
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// ---------- MOBILE 390x844 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: OFFICE, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  watchErrors(page, 'mobile');

  // BUG 1 + 2: Budi absen masuk + pulang dengan selfie asli.
  await loginAs(page, 'Staff');
  await doCheckFlow(page, 'Absen Masuk', 'Absen berhasil');
  check('mobile: tombol Absen Masuk jadi "Absen berhasil"', await page.getByRole('button', { name: 'Absen berhasil' }).count() === 1);
  await doCheckFlow(page, 'Absen Pulang', 'Pulang tercatat');
  check('mobile: tombol Absen Pulang jadi "Pulang tercatat"', await page.getByRole('button', { name: 'Pulang tercatat' }).count() === 1);

  // Koma menempel ke badge (tidak ada spasi sebelum koma).
  const statusText = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find((p) => p.textContent.includes('Anda absen masuk pukul'));
    return el ? el.textContent : '';
  });
  const budiTime = (statusText.match(/pukul (\d{2}:\d{2})/) ?? [])[1] ?? '';
  check('mobile: status absen "Hadir, pulang" tanpa spasi sebelum koma dan tanpa kata Telat', /Hadir, pulang/.test(statusText) && !/Hadir\s+,/.test(statusText) && !statusText.includes('Telat'), statusText);

  // Bukti kerja: lampirkan file, harus muncul di daftar.
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '+ Lampirkan File' }).click();
  await page.setInputFiles('input[type="file"]', SELFIE);
  await page.waitForTimeout(600);
  check('mobile: bukti kerja terlampir (logo.png muncul)', await page.getByText('logo.png').count() >= 1);
  await checkOverflow(page, 'mobile /absensi staf');

  // BUG 1: selfie tampil di Absensi (sebagai Manager), tahan reload.
  await logout(page);
  await loginAs(page, 'Manager');
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('mobile: selfie masuk Budi tampil (tidak rusak)', await imgOk(page, 'Selfie absen masuk Budi Santoso'));
  check('mobile: selfie pulang Budi tampil (tidak rusak)', await imgOk(page, 'Selfie absen pulang Budi Santoso'));
  check('mobile: bukti kerja Budi terlihat Manager (1 file)', (await page.getByText('Bukti kerja (1)').count()) >= 1);
  check('mobile: antrean menunggu persetujuan (1) tampil', (await page.getByText('Menunggu persetujuan (1)').count()) >= 1);
  check('mobile: Manager tidak melihat tombol Setujui', (await page.getByRole('button', { name: 'Setujui', exact: true }).count()) === 0);
  check('mobile: Manager tidak melihat tombol Tolak', (await page.getByRole('button', { name: 'Tolak', exact: true }).count()) === 0);

  // Lightbox: ketuk selfie, labelnya "Selfie absen", bukan "Foto bukti kerja".
  await page.locator('img[alt="Selfie absen masuk Budi Santoso"]').first().click();
  await page.waitForTimeout(500);
  const lbAlt = await page.evaluate(() => document.querySelector('[role="dialog"] img')?.getAttribute('alt') ?? '');
  check('mobile: lightbox selfie berlabel "Selfie absen"', lbAlt.startsWith('Selfie absen'), lbAlt);
  await page.getByRole('button', { name: 'Tutup' }).click();
  await page.waitForTimeout(400);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('mobile: selfie masuk Budi tetap tampil setelah reload', await imgOk(page, 'Selfie absen masuk Budi Santoso'));
  check('mobile: selfie pulang Budi tetap tampil setelah reload', await imgOk(page, 'Selfie absen pulang Budi Santoso'));
  await shot(page, 'bug1-selfie-setelah-reload-mobile.png');
  await checkOverflow(page, 'mobile /absensi manager');

  // BUG 2: Manager melihat "Absen saya" miliknya sendiri (belum absen).
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const absenSaya = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((e) => e.textContent === 'Absen saya');
    return h?.closest('div')?.innerText ?? '';
  });
  check('mobile: kartu "Absen saya" Manager belum absen (bukan data Budi)',
    absenSaya.includes('Anda belum absen masuk.') && !absenSaya.includes('Masuk pukul'), absenSaya.replace(/\n/g, ' | '));
  await shot(page, 'bug2-absen-saya-manager-mobile.png');

  // Route guard: Manager tidak bisa ke /karyawan, bisa ke /laporan.
  await page.goto(BASE + '/karyawan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('mobile: Manager /karyawan dialihkan ke Beranda', page.url() === BASE + '/', page.url());
  await page.goto(BASE + '/laporan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('mobile: Manager bisa membuka /laporan', page.url() === BASE + '/laporan', page.url());
  const reportText1 = await page.evaluate(() => document.body.textContent);
  check('mobile: Laporan menampilkan Menunggu persetujuan 1', reportText1.includes('Menunggu persetujuan'), reportText1.slice(0, 200));
  await checkOverflow(page, 'mobile /laporan');

  // BUG 3: Beranda Manager menampilkan total stok asli (localApi).
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const homeText = await page.evaluate(() => document.body.textContent);
  check('mobile: Beranda menampilkan total 3.227 barang', homeText.includes('Total 3.227 barang di gudang'));
  check('mobile: Beranda menampilkan 24 jenis produk', homeText.includes('24 jenis produk'));
  check('mobile: Beranda tidak menampilkan "Total 0 barang"', !homeText.includes('Total 0 barang'));
  check('mobile: Stok menipis (3)', homeText.includes('Stok menipis (3)'));
  check('mobile: panel perhatian menampilkan Menunggu persetujuan 1', homeText.includes('Menunggu persetujuan:') && homeText.includes('1'));
  await shot(page, 'bug3-beranda-total-mobile.png');
  await checkOverflow(page, 'mobile / manager');

  // Bos menyetujui absen Budi: status + rekap berubah.
  await logout(page);
  await loginAs(page, 'Bos');
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('mobile: Bos melihat tombol Setujui', (await page.getByRole('button', { name: 'Setujui', exact: true }).count()) >= 1);
  await page.getByRole('button', { name: 'Setujui', exact: true }).first().click();
  await page.waitForTimeout(600);
  check('mobile: setelah disetujui, badge "Disetujui" tampil', (await page.getByText('Disetujui', { exact: true }).count()) >= 1);
  check('mobile: antrean menunggu persetujuan hilang setelah disetujui', (await page.getByText('Menunggu persetujuan (').count()) === 0);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const bosHome = await page.evaluate(() => document.body.textContent);
  check('mobile: Bos tidak punya kartu Absen saya', !bosHome.includes('Absen saya'));
  // Rekap hari ini (tanpa Telat): Budi sudah disetujui = Hadir 1,
  // Maya belum absen = Belum absen 1.
  const bosStats = await page.evaluate(() => {
    const label = [...document.querySelectorAll('div')].find((d) => d.textContent === 'Total karyawan');
    const grid = label?.closest('.grid');
    const out = {};
    grid?.querySelectorAll(':scope > div').forEach((cell) => {
      const n = cell.querySelector('div:first-child')?.textContent?.trim();
      const l = cell.querySelector('div:last-child')?.textContent?.trim();
      if (l && n) out[l] = n;
    });
    return out;
  });
  check('mobile: rekap Hadir 1, Belum absen 1 setelah persetujuan', bosStats.Hadir === '1' && bosStats['Belum absen'] === '1', JSON.stringify(bosStats));
  check('mobile: tidak ada kata Telat di Beranda Bos', !bosHome.includes('Telat'));
  check('mobile: panel perhatian tidak lagi menampilkan Menunggu persetujuan', !bosHome.includes('Menunggu persetujuan:'));

  // Izin/Cuti: Budi mengajukan Cuti besok, Bos menolak.
  await logout(page);
  await loginAs(page, 'Staff');
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.fill('#req-date', TOMORROW);
  await page.getByRole('button', { name: 'Cuti', exact: true }).click();
  await page.getByRole('button', { name: 'Kirim Pengajuan' }).click();
  await page.waitForTimeout(600);
  check('mobile: pengajuan Cuti terkirim (notifikasi tampil)', (await page.getByText(/Pengajuan Cuti untuk .* terkirim/).count()) >= 1);
  await page.fill('#tanggal', TOMORROW);
  await page.waitForTimeout(600);
  check('mobile: pengajuan Cuti tampil "Menunggu persetujuan"', (await page.getByText('Menunggu persetujuan', { exact: true }).count()) >= 1);
  await logout(page);
  await loginAs(page, 'Bos');
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('mobile: Bos melihat pengajuan Cuti di antrean', (await page.getByText('Pengajuan Cuti.').count()) >= 1);
  await page.getByRole('button', { name: 'Tolak', exact: true }).first().click();
  await page.waitForTimeout(600);
  // Pengajuan Cuti itu untuk besok: pindah tanggal dulu untuk melihat
  // badge "Ditolak" di kartunya.
  await page.fill('#tanggal', TOMORROW);
  await page.waitForTimeout(600);
  check('mobile: setelah ditolak, badge "Ditolak" tampil', (await page.getByText('Ditolak', { exact: true }).count()) >= 1);

  // Laporan: Cuti yang ditolak tidak masuk hitungan.
  await page.goto(BASE + '/laporan', { waitUntil: 'networkidle' });
  await page.fill('#from', '2026-11-18');
  await page.fill('#to', TOMORROW);
  await page.waitForTimeout(600);
  const totals = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find((e) => e.textContent === 'TOTAL');
    const card = h?.closest('div');
    return [...(card?.querySelectorAll('.tabular-nums') ?? [])].map((n) => n.textContent);
  });
  // TOTAL baru: Hadir, Izin/Cuti, Total (tanpa kolom Telat).
  // Budi Hadir 1 (disetujui), Cuti ditolak tidak masuk hitungan.
  check('mobile: Laporan TOTAL Hadir 1, Izin/Cuti 0, Total 1', totals.join(',') === '1,0,1', totals.join(','));

  // BUG 2 (kembali): data Budi utuh setelah ganti-ganti akun.
  await logout(page);
  await loginAs(page, 'Staff');
  await page.waitForTimeout(800);
  const budiHome = await page.evaluate(() => document.body.textContent);
  check('mobile: Budi kembali, status absennya utuh', budiHome.includes(`Anda absen masuk pukul ${budiTime}`), budiTime);
  await shot(page, 'bug2-absen-saya-budi-utuh-mobile.png');
  await checkOverflow(page, 'mobile / staf');
  await ctx.close();
}

// ---------- DESKTOP 1280x800 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, geolocation: OFFICE, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  watchErrors(page, 'desktop');

  // Sidebar: Manager tanpa nav Karyawan; Admin punya.
  await loginAs(page, 'Manager');
  const managerNav = await page.evaluate(() => [...document.querySelectorAll('aside nav a')].map((a) => a.textContent.trim()));
  check('desktop: sidebar Manager tanpa Karyawan', !managerNav.includes('Karyawan'), managerNav.join(', '));
  check('desktop: sidebar Manager punya Laporan', managerNav.includes('Laporan'));
  await logout(page);
  await loginAs(page, 'Admin');
  const adminNav = await page.evaluate(() => [...document.querySelectorAll('aside nav a')].map((a) => a.textContent.trim()));
  check('desktop: sidebar Admin punya Karyawan', adminNav.includes('Karyawan'), adminNav.join(', '));
  await shot(page, 'roles-sidebar-admin-desktop.png');

  // Admin mengelola karyawan: tambah, ubah, hapus (aksi nyata).
  await page.goto(BASE + '/karyawan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('desktop: Admin bisa membuka /karyawan', page.url() === BASE + '/karyawan', page.url());
  const countBefore = await page.locator('article').count();
  await page.getByRole('button', { name: '+ Tambah Karyawan' }).click();
  await page.fill('#emp-name', 'Uji Coba');
  await page.fill('#emp-pos', 'Staf Gudang');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await page.waitForTimeout(500);
  const countAfter = await page.locator('article').count();
  check('desktop: tambah karyawan menambah daftar', countAfter === countBefore + 1, `${countBefore} -> ${countAfter}`);
  check('desktop: karyawan baru tampil di daftar', (await page.locator('article', { hasText: 'Uji Coba' }).count()) === 1);
  await page.locator('article', { hasText: 'Uji Coba' }).getByRole('button', { name: 'Ubah' }).click();
  await page.fill('#emp-name', 'Uji Coba Dua');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await page.waitForTimeout(500);
  check('desktop: ubah karyawan mengubah nama', (await page.locator('article', { hasText: 'Uji Coba Dua' }).count()) === 1);
  page.once('dialog', (d) => d.accept());
  await page.locator('article', { hasText: 'Uji Coba Dua' }).getByRole('button', { name: 'Hapus' }).click();
  await page.waitForTimeout(500);
  check('desktop: hapus karyawan menghilangkan kartu', (await page.locator('article', { hasText: 'Uji Coba Dua' }).count()) === 0);
  await checkOverflow(page, 'desktop /karyawan');

  // Staff tidak bisa ke /karyawan dan /laporan.
  await logout(page);
  await loginAs(page, 'Staff');
  await page.goto(BASE + '/karyawan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('desktop: Staff /karyawan dialihkan ke Beranda', page.url() === BASE + '/', page.url());
  await page.goto(BASE + '/laporan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('desktop: Staff /laporan dialihkan ke Beranda', page.url() === BASE + '/', page.url());

  // Bos tidak bisa ke /karyawan dan tidak melihat nav Karyawan.
  await logout(page);
  await loginAs(page, 'Bos');
  await page.goto(BASE + '/karyawan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('desktop: Bos /karyawan dialihkan ke Beranda', page.url() === BASE + '/', page.url());
  const bosNav = await page.evaluate(() => [...document.querySelectorAll('aside nav a')].map((a) => a.textContent.trim()));
  check('desktop: sidebar Bos tanpa Karyawan', !bosNav.includes('Karyawan'), bosNav.join(', '));

  // Tolak + absen ulang: Budi absen, Bos menolak, Budi absen ulang.
  await logout(page);
  await loginAs(page, 'Staff');
  await doCheckFlow(page, 'Absen Masuk', 'Absen berhasil');
  await logout(page);
  await loginAs(page, 'Bos');
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Tolak', exact: true }).first().click();
  await page.waitForTimeout(600);
  await logout(page);
  await loginAs(page, 'Staff');
  await page.waitForTimeout(800);
  const rejectHome = await page.evaluate(() => document.body.textContent);
  check('desktop: Budi melihat pemberitahuan absen ditolak', rejectHome.includes('Absen Anda hari ini ditolak Bos. Silakan absen ulang.'));
  check('desktop: tombol Absen Masuk aktif lagi setelah ditolak', await page.getByRole('button', { name: 'Absen Masuk', exact: true }).isEnabled());
  await shot(page, 'approval-absen-ditolak-desktop.png');
  await doCheckFlow(page, 'Absen Masuk', 'Absen berhasil');
  check('desktop: absen ulang berhasil (tombol jadi "Absen berhasil")', (await page.getByRole('button', { name: 'Absen berhasil' }).count()) === 1);
  await logout(page);
  await loginAs(page, 'Manager');
  await page.goto(BASE + '/absensi', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('desktop: absen ulang Budi kembali pending di antrean', (await page.getByText('Menunggu persetujuan (1)').count()) >= 1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('desktop: selfie tetap tampil setelah reload', await imgOk(page, 'Selfie absen masuk Budi Santoso'));
  await shot(page, 'bug1-selfie-setelah-reload-desktop.png');
  await checkOverflow(page, 'desktop /absensi');

  // Beranda Admin desktop: total stok asli.
  await logout(page);
  await loginAs(page, 'Admin');
  await page.waitForTimeout(1000);
  const adminHome = await page.evaluate(() => document.body.textContent);
  check('desktop: Beranda Admin total 3.227 / 24 produk', adminHome.includes('Total 3.227 barang di gudang') && adminHome.includes('24 jenis produk'));
  check('desktop: Beranda Admin tidak menampilkan "Total 0 barang"', !adminHome.includes('Total 0 barang'));
  await shot(page, 'bug3-beranda-total-desktop.png');
  await checkOverflow(page, 'desktop / admin');
  await ctx.close();
}

await browser.close();

console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) {
  errors.forEach((e) => console.log(' -', e));
  process.exit(1);
}
console.log('SEMUA CEK LOLOS');
