// Service worker Sabun Palem: cache app shell supaya aplikasi tetap
// terbuka saat sinyal gudang jelek. Strategi:
// - Navigasi (halaman): network-first, jatuh ke index.html cache saat
//   offline, supaya refresh di halaman dalam tetap membuka aplikasi.
// - Aset statis same-origin (JS/CSS/gambar/manifest): cache-first,
//   diisi saat pertama dimuat.
// - API (/api/*) dan request lain: tidak pernah di-cache, selalu ke
//   jaringan (data stok dan absensi harus selalu terbaru).
// Versi cache dinaikkan setiap ada perubahan besar pada shell, supaya
// HP staf tidak terjebak di versi lama.
const CACHE = 'sabun-palem-v1';
const SHELL = ['index.html', 'manifest.webmanifest', 'logo.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API dan domain lain: selalu jaringan, tanpa cache.
  if (url.pathname.includes('/api/') || url.origin !== self.location.origin) return;

  // Navigasi: coba jaringan dulu, offline pakai index.html cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('index.html', copy));
          return res;
        })
        .catch(() => caches.match('index.html')),
    );
    return;
  }

  // Aset statis: cache dulu, kalau belum ada ambil jaringan + simpan.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});
