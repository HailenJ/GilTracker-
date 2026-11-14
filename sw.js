// Gil Ledger service worker: opens instantly and works offline.
// App files and game data: serve from cache, refresh in the background. Prices (Universalis) always go to the network.
const VERSION = 'gl-v11';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'vendor/sim.js', 'vendor/solver.js', 'manifest.webmanifest', 'icons/icon-192.png', 'data/game.json', 'data/strategies.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Universalis, icons, fonts: browser default
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || fresh;
  }));
});
