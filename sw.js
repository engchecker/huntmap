/* Hunt Access NZ service worker: app shell + map tile caching for offline use. */
const SHELL = 'shell-v2';
const TILES = 'tiles-v1';      // tiles saved deliberately via "Offline maps"
const RT = 'tiles-rt';         // tiles seen while browsing (trimmed)
const RT_MAX = 4000;
const ASSETS = ['./', 'index.html', 'app.css', 'app.js', 'data.js', 'manifest.webmanifest',
  'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function normKey(u) {
  try { const x = new URL(u); x.searchParams.delete('api'); x.searchParams.sort(); return x.toString(); } catch (e) { return u; }
}
let puts = 0;
async function trim() {
  const c = await caches.open(RT); const keys = await c.keys();
  if (keys.length > RT_MAX) for (const k of keys.slice(0, keys.length - RT_MAX)) await c.delete(k);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // LINZ basemaps: cache-first (saved areas, then browsing cache), network fallback.
  if (url.hostname === 'basemaps.linz.govt.nz') {
    e.respondWith((async () => {
      const key = normKey(req.url);
      const hit = (await caches.match(key, { cacheName: TILES })) || (await caches.match(key, { cacheName: RT }));
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(RT).then(c => c.put(key, copy)).then(() => { if (++puts % 200 === 0) trim(); });
        }
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  // App shell (same origin): stale-while-revalidate.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || (req.mode === 'navigate' ? cache.match('index.html') : new Response('', { status: 504 }));
    })());
  }
  // Everything else (DOC/LINZ queries, Open-Meteo) goes to the network; the app falls back to saved data.
});
