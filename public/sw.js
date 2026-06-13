const CACHE_NAME = 'wellfed-app-shell-v3'
const APP_SCOPE = self.registration.scope
const APP_SHELL_URL = new URL('./', APP_SCOPE).toString()
const CORE_ASSETS = [
  APP_SHELL_URL,
  new URL('manifest.webmanifest', APP_SCOPE).toString(),
  new URL('apple-touch-icon.png', APP_SCOPE).toString(),
  new URL('icon-192.png', APP_SCOPE).toString(),
  new URL('icon-512.png', APP_SCOPE).toString(),
  new URL('wellfed-icon.svg', APP_SCOPE).toString(),
]

const canCache = (response) =>
  response && response.ok && (response.type === 'basic' || response.type === 'cors')

const cacheResponse = async (request, response) => {
  if (!canCache(response)) return
  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response.clone())
}

const networkFirst = async (request) => {
  try {
    const response = await fetch(request)
    await cacheResponse(request, response)
    return response
  } catch {
    return (
      (await caches.match(request)) ||
      (await caches.match(APP_SHELL_URL)) ||
      Response.error()
    )
  }
}

const staleWhileRevalidate = async (request) => {
  const cached = await caches.match(request)
  const refresh = fetch(request)
    .then(async (response) => {
      await cacheResponse(request, response)
      return response
    })
    .catch(() => cached)

  return cached || refresh
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request))
    return
  }

  event.respondWith(staleWhileRevalidate(event.request))
})
