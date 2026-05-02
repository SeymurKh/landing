/* Service Worker: Enables offline functionality and cache management */
/* ═══════════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'esskey-v2';

const CACHE_ASSETS = [
  './',
  './index.html',
  './styles.min.css',
  './script.min.js',
  './manifest.json',
  './yt-channel-logo-circle.webp',
  './yt-channel-favicon-circle.webp',
  './assets/noise.svg'
  // Note: Video files are too large for cache (11MB+)
  // Users will stream them on demand
];

/* Install event - cache essential assets */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

/* Fetch event - serve from cache, fallback to network */
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip YouTube API calls - always fresh
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('youtube.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then((fetchResponse) => {
            // Don't cache non-successful responses
            if (!fetchResponse || fetchResponse.status !== 200) {
              return fetchResponse;
            }
            
            // Clone the response
            const responseToCache = fetchResponse.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return fetchResponse;
          });
      })
      .catch(() => {
        // Offline fallback for HTML pages
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      })
  );
});

/* Activate event - clean up old caches */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});
