// sw.js - 最小限の静的資産キャッシュ（本体から独立）
const CACHE_NAME = 'tickets-static-v2';
const ASSETS = [
  './',
  './index.html',
  './timeslot.html',
  './seats.html',
  './walkin.html',
  './styles.css',
  './sidebar.css',
  './seats.css',
  './walkin.css',
  './index-main.js',
  './timeslot-main.js',
  './seats-main.js',
  './walkin-main.js',
  './sidebar.js',
  './api.js',
  './config.js',
  './offline-sync.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))))
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 同一オリジンのGETリクエストのみキャッシュ
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          try { const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {}); } catch (_) {}
          return res;
        })
        .catch(() => cached || new Response('', { status: 504 }));
    })
  );
});


