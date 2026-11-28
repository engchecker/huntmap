/* Fish Access NZ service worker: app shell and open data offline, map tiles cached as you view them. */
const SHELL = 'fish-shell-v2';
const RT = 'fish-tiles', RT_MAX = 4000;
const ASSETS = ['./', 'index.html', 'app.js', 'rules.js', 'fish.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  '../config.js', '../app.css', '../vendor/maplibre-gl.js', '../vendor/maplibre-gl.css',
  'data/manifest.json', 'data/reserves.geojson', 'data/cpz.geojson', 'data/slipways.geojson'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(ASSETS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('fish-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const normKey = u => { try { const x = new URL(u); x.searchParams.delete('api'); return x.toString(); } catch { return u; } };
let puts = 0;
async function trim() { const c = await caches.open(RT), k = await c.keys(); if (k.length > RT_MAX) for (const r of k.slice(0, k.length - RT_MAX)) await c.delete(r); }

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'basemaps.linz.govt.nz') {
    e.respondWith((async () => {
      const key = normKey(req.url), hit = await caches.match(key); if (hit) return hit;
      try { const res = await fetch(req); if (res.ok) { const copy = res.clone(); caches.open(RT).then(c => c.put(key, copy)).then(() => { if (++puts % 200 === 0) trim(); }); } return res; }
      catch { return new Response('', { status: 504 }); }
    })());
    return;
  }
  // same origin (app files and data): network first so updates arrive, saved copy when offline or slow
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const net = fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
      const slow = new Promise(r => setTimeout(r, 3500, null));
      try { const res = await Promise.race([net, slow]); if (res) return res; } catch {}
      const hit = await cache.match(req, { ignoreSearch: true }); if (hit) return hit;
      try { return await net; } catch {}
      return req.mode === 'navigate' ? (await cache.match('index.html')) : new Response('', { status: 504 });
    })());
  }
});
