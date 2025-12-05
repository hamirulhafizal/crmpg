// Service Worker for PWA
const CACHE_NAME = 'public-gold-crm-v2';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/favicon.ico',
];
// Note: We don't cache /dashboard, /login, /register, etc. because:
// 1. They require authentication checks (middleware redirects)
// 2. They're dynamic and shouldn't be cached
// 3. Service worker bypasses them to avoid redirect issues

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

  // CRITICAL: Skip routes that require authentication or handle redirects
  // These routes must go directly to network to avoid interfering with middleware redirects
  const url = new URL(event.request.url);
  if (
    // Auth routes (OAuth callbacks, login, etc.)
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/api/auth/') ||
    url.pathname === '/login' ||
    url.pathname === '/register' ||
    url.pathname === '/forgot-password' ||
    url.pathname === '/reset-password' ||
    // Protected routes (may redirect based on auth status)
    url.pathname.startsWith('/dashboard') ||
    url.pathname.startsWith('/profile') ||
    url.pathname.startsWith('/pwa-test') ||
    url.pathname.startsWith('/excel-processor') ||
    // API routes (should always go to network)
    url.pathname.startsWith('/api/')
  ) {
    // Let these routes bypass service worker completely
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

