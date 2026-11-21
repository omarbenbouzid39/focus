/* Offline cache for the Study Focus PWA: everything is bundled, so the app works without a connection. */
const CACHE = 'study-focus-1.6.0-2d7bbb08', FILES = ["./", "assets/icons/apple-touch-icon.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/icon-maskable-512.png", "assets/icons/icon128.png", "assets/icons/icon16.png", "assets/icons/icon48.png", "background/service-worker.js", "dashboard/dashboard.css", "dashboard/dashboard.html", "dashboard/dashboard.js", "dashboard/sounds.js", "dashboard/stats.js", "index.html", "manifest.webmanifest", "pwa-shim.js", "settings/settings.css", "settings/settings.html", "settings/settings.js", "shared/core.js", "shared/sounds.js", "shared/ui.css"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Freesound etc. always go to the network
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.length ? l[0].focus() : clients.openWindow('./dashboard/dashboard.html'))); });
