/*
 * Service Worker für die iOS-PWA des Hebel-Vermögensrechners.
 * Die App-Shell und Chart.js werden vorgehalten, damit die App nach dem
 * ersten Online-Laden auch offline startet. (Offline-Fallback der App
 * zeichnet notfalls die Diagramme selbst.)
 */
const CACHE_VERSION = 'hebel-rechner-ios-v14';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png'
];
const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    // Chart.js optional vorhalten; falls das CDN gerade nicht erreichbar ist,
    // funktioniert die App trotzdem mit ihrem eigenen Canvas-Fallback.
    try {
      await cache.add(new Request(CHART_JS, { mode: 'cors' }));
    } catch (error) {
      // kein harter Fehler
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isChartJs = request.url === CHART_JS;

  // Navigationen: zuerst Netz (Updates), bei Offline aus dem Cache.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', response.clone());
        return response;
      } catch (error) {
        return (await caches.match('./index.html')) ||
          (await caches.match('./')) ||
          new Response('Die App ist offline noch nicht vollständig gespeichert.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  // Eigene Dateien und Chart.js: Cache zuerst, sonst Netz.
  if (sameOrigin || isChartJs) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
  }
});
