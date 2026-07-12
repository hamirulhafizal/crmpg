// Service Worker for PWA
// Bump when caching strategy changes so old HTML/documents are dropped.
const CACHE_NAME = 'public-gold-crm-v9';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
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

  // Never intercept full document loads: Next.js needs fresh HTML after deploy,
  // and cache-first here caused stale /customers (etc.) until hard reload.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
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
    url.pathname.startsWith('/test-pwa') ||
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

// Push fallback — Rms-compatible. iOS 18.4+ handles declarative push in OS;
// this ensures Chrome/Android and edge cases still show a notification.
self.addEventListener('push', (event) => {
  let notificationData = {
    title: 'PG CRM',
    body: 'New notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'pg-crm-notification',
    data: { url: '/dashboard' },
  };

  if (event.data) {
    try {
      const data = event.data.json();
      if (data.web_push === '8030' || data.web_push === 8030) {
        if (data.notification) {
          const notif = data.notification;
          notificationData = {
            title: notif.title || notificationData.title,
            body: notif.body || notificationData.body,
            icon: notif.icon || notificationData.icon,
            badge: notif.badge || notificationData.badge,
            tag: notif.tag || notificationData.tag,
            data: {
              url: notif.navigate_url || notif.navigate || notificationData.data.url,
            },
          };
        }
      } else if (data.title || data.body) {
        notificationData = {
          title: data.title || notificationData.title,
          body: data.body || notificationData.body,
          icon: data.icon || notificationData.icon,
          badge: data.badge || notificationData.badge,
          tag: data.tag || notificationData.tag,
          data: data.data || notificationData.data,
        };
      } else {
        notificationData.body = event.data.text() || notificationData.body;
      }
    } catch (e) {
      const text = event.data.text();
      if (text) notificationData.body = text;
    }
  }

  event.waitUntil(
    self.registration
      .showNotification(notificationData.title, {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        tag: notificationData.tag,
        data: notificationData.data,
        requireInteraction: false,
        silent: false,
      })
      .catch((error) => {
        console.error('[PG SW] showNotification failed:', error);
      })
  );
});

// Local test + push fallback click handling.
self.addEventListener('notificationclick', (event) => {
  const data = event.notification?.data || {};
  event.notification.close();

  const rawUrl = data.url || '/dashboard';

  /** Same-origin path (or full external URL) for navigation. */
  let targetUrl = rawUrl;
  try {
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      const parsed = new URL(rawUrl);
      if (parsed.origin === self.location.origin) {
        targetUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } else if (!rawUrl.startsWith('/')) {
      targetUrl = `/${rawUrl}`;
    }
  } catch (_) {
    targetUrl = '/dashboard';
  }

  const absoluteUrl =
    targetUrl.startsWith('http://') || targetUrl.startsWith('https://')
      ? targetUrl
      : new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if ('navigate' in client) {
          try {
            await client.navigate(absoluteUrl);
            if ('focus' in client) {
              return client.focus();
            }
            return undefined;
          } catch (_) {
            // try next client or openWindow
          }
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteUrl);
      }
      return undefined;
    })
  );
});

