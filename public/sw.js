/*
 * Service worker del instrumento.
 *
 * Estrategia mixta, a proposito:
 * - Navegaciones (el index): red primero. Si el usuario tiene una version vieja
 *   cacheada, se le actualiza en cuanto hay red y nunca se queda pegado en un
 *   bundle que ya no existe.
 * - Recursos con hash en el nombre (assets/): cache primero, son inmutables.
 * - El worklet: red primero con copia en cache, porque es lo que hace sonar la
 *   app y queremos la version nueva antes que una copia corrupta.
 */
const VERSION = 'circulo-v2';
const CACHE = VERSION;
const SHELL = ['./', './index.html', './manifest.webmanifest', './worklet/synth-processor.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallback) {
      const shell = await caches.match(fallback);
      if (shell) return shell;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (url.pathname.endsWith('/worklet/synth-processor.js')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
