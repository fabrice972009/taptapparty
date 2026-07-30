const CACHE = 'taptap-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/events.html',
  '/about.html',
  '/community.html',
  '/contact.html',
  '/manifest.json',
  '/logo.png',
  '/emblem.png',
  '/og-image.png',
  '/flyer-london.jpg',
  '/hero.mp4',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Install — cache core assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
