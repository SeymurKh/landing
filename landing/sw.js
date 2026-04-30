/* Service Worker: Enables offline functionality and cache management */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('v1').then((cache) => {
      return cache.addAll([
        '/landing/index.html',
        '/landing/styles.css',
        '/landing/script.js',
        '/landing/video.mp4',
        '/landing/manifest.json'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== 'v1') {
            return caches.delete(key);
          }
        })
      );
    })
  );
});