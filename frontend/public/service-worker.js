// service-worker.js
// RespondAI Offline Engine — caches app shell + handles background sync

const CACHE_NAME    = 'respondai-v1';
const OFFLINE_URL   = '/offline.html';

// Files to cache for offline app shell
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      // Cache each file individually — don't fail if one is missing
      return Promise.allSettled(
        APP_SHELL.map(url => cache.add(url).catch(() => console.warn('[SW] Could not cache:', url)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache when offline ─────────────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Don't intercept Firebase or external API calls
  const url = event.request.url;
  if (url.includes('firebaseio.com') ||
      url.includes('googleapis.com') ||
      url.includes('localhost:3001')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response && response.status === 200 && response.type !== 'opaque') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => {
        // Network failed — serve cached version or offline page
        if (event.request.mode === 'navigate') {
          return caches.match('/') || caches.match('/index.html');
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});

// ── Background Sync: fires when internet returns ──────────────
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  if (event.tag === 'respondai-offline-sync') {
    event.waitUntil(
      // Notify all open tabs to run sync
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'BACKGROUND_SYNC_TRIGGERED' });
        });
      })
    );
  }
});

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || '🚨 RespondAI Alert', {
      body:    data.body || 'Emergency notification',
      icon:    '/logo192.png',
      badge:   '/favicon.ico',
      vibrate: [200, 100, 200],
      tag:     'respondai-alert',
    })
  );
});