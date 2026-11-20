// v2 — Minimal service worker so the pages can be installed to the home screen. Always uses the live network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
