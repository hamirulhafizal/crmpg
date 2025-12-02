// Service Worker for PWA
const CACHE_NAME = 'public-gold-crm-v2';
const urlsToCache = [
  '/',
  '/dashboard',
  '/login',
  '/register',
  '/manifest.json',
  '/favicon.ico',
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache addAll failed:', error);
      })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip external requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // CRITICAL: Skip auth callback routes - they must go directly to network
  // These routes handle OAuth redirects and must not be intercepted
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/api/auth/') ||
    url.pathname === '/login' ||
    url.pathname === '/register' ||
    url.pathname === '/forgot-password' ||
    url.pathname === '/reset-password'
  ) {
    // Let auth routes bypass service worker completely
    return;
  }

  event.respondWith(
    caches
      .match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return (
          response ||
          fetch(event.request, { redirect: "follow" }).then((response) => {
            // Don't cache non-successful responses
            if (
              !response ||
              response.status !== 200 ||
              response.type !== "basic"
            ) {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });

            return response;
          })
        );
      })
      .catch(() => {
        // If both cache and network fail, return offline page
        if (event.request.destination === "document") {
          return caches.match("/");
        }
      })
  );
  
});

