/**
 * Service Worker for AI Model Selector PWA
 * Caches static assets for offline access
 * Compatible with SvelteKit static adapter and GitHub Pages deployment
 */

const CACHE_NAME = 'model-selector-v2';

// Assets to cache on install
// Note: SvelteKit generates hashed filenames, so we cache dynamically
const PRECACHE_ASSETS = [
  './',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './favicon.png'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v2...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching core assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.warn('[SW] Pre-cache failed (non-critical):', error);
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v2...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('model-selector-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network-first with cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome extensions and non-HTTP protocols
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Skip external resources that should always be fetched fresh
  // - HuggingFace CDN (ML models - too large to cache, browser handles caching)
  // - Analytics/tracking
  const hostname = url.hostname;
  const isHost = (host) => hostname === host || hostname.endsWith('.' + host);
  if (isHost('huggingface.co') ||
      isHost('jsdelivr.net')) {
    return;
  }

  // For same-origin requests, use network-first strategy
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone response before caching
          const responseClone = response.clone();

          // Cache successful responses
          if (response.status === 200) {
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseClone);
              });
          }

          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(event.request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                console.log('[SW] Serving from cache:', event.request.url);
                return cachedResponse;
              }

              // If it's a navigation request, serve the app shell
              if (event.request.mode === 'navigate') {
                return caches.match('./');
              }

              // Otherwise return a simple offline response
              return new Response('Offline', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
  }
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
