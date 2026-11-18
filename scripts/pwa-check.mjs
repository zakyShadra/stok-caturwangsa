// Cek PWA + Beranda live di host production (pages.dev).
// - manifest ter-link + termuat (name Sabun Palem, 3 ikon)
// - service worker terdaftar (production)
// - ikon 192/512 termuat (HTTP 200)
// - Beranda menampilkan total live 3.232 + 24 produk
import { chromium } from 'playwright-core';

const BASE = process.env.TEST_BASE ?? 'https://caturwangsa.pages.dev';
const EXE = process.env.TEST_EXE ?? '/home/ice/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';

const errors = [];
const ok = [];
function check(name, cond, detail = '') {
  if (cond) { ok.push(name); console.log(`LOLOS: ${name}${detail ? ` (${detail})` : ''}`); }
  else { errors.push(name); console.log(`GAGAL: ${name}${detail ? ` (${detail})` : ''}`); }
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(BASE + '/login', { waitUntil: 'networkidle' });

// Manifest
const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href').catch(() => null);
check('pwa: link manifest ada di index.html', !!manifestHref, manifestHref ?? '');
let manifest = null;
if (manifestHref) {
  const res = await page.request.get(new URL(manifestHref, BASE).toString());
  check('pwa: manifest termuat HTTP 200', res.status() === 200, `status ${res.status()}`);
  manifest = await res.json().catch(() => null);
  check('pwa: manifest name Sabun Palem', manifest?.name === 'Sabun Palem', manifest?.name ?? '');
  check('pwa: manifest display standalone', manifest?.display === 'standalone', manifest?.display ?? '');
  check('pwa: manifest punya 3 ikon', Array.isArray(manifest?.icons) && manifest.icons.length === 3, `${manifest?.icons?.length ?? 0} ikon`);
  for (const icon of manifest?.icons ?? []) {
    const r = await page.request.get(new URL(icon.src, BASE).toString());
    check(`pwa: ikon ${icon.sizes} termuat`, r.status() === 200, `status ${r.status()}`);
  }
}

// Service worker terdaftar
await page.waitForTimeout(2000);
const swState = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'no-sw-api';
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? (reg.active ? 'active' : 'installing/waiting') : 'none';
});
check('pwa: service worker terdaftar + aktif', swState === 'active', swState);

// Beranda live: login Staff, cek total 3.232 + 24 produk
await page.getByRole('button', { name: /Staff/ }).first().click();
await page.getByRole('button', { name: 'Masuk', exact: true }).click();
await page.waitForURL(BASE + '/', { timeout: 8000 });
await page.waitForTimeout(2500);
const homeText = (await page.textContent('body')) ?? '';
check('beranda: total 3.232 tampil', homeText.includes('3.232'), '');
check('beranda: 24 produk tampil (grid statistik staf)', /24Produk/.test(homeText), '');
check('beranda: tidak ada kata Telat', !homeText.includes('Telat'), '');
check('beranda: tidak ada error backend', !/gagal memuat|tidak tersambung/i.test(homeText), '');

await browser.close();
console.log(`\n=== HASIL: ${ok.length} lolos, ${errors.length} gagal ===`);
if (errors.length > 0) { console.log('GAGAL: ' + errors.join(', ')); process.exit(1); }
console.log('SEMUA CEK LOLOS');
