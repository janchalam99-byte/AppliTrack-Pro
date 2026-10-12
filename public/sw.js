// Service Worker for ระบบรับ-ส่งของ (PWA)
const CACHE_NAME = 'transfer-app-v1'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon.svg',
  '/manifest.json'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    }).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  // Only cache GET requests and avoid caching Supabase API / Storage requests directly in SW
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin.includes('supabase.co')) return

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse
      return fetch(event.request).then((networkResponse) => {
        // Cache successful local assets
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic' &&
          (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.svg'))
        ) {
          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
        }
        return networkResponse
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html')
        }
      })
    })
  )
})
