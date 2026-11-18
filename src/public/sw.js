const CACHE_PREFIX = 'fragancia-y-miel-pwa';
const CACHE_NAME = `${CACHE_PREFIX}-v1`;
const APP_SHELL_URL = new URL('./index.html', self.registration.scope);
const STATIC_URLS = [
  new URL('./manifest.webmanifest', self.registration.scope).href,
  new URL('./icons/icon.svg', self.registration.scope).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(APP_SHELL_URL, { cache: 'reload' });
    if (!response.ok) throw new Error(`No se pudo precargar la aplicación: ${response.status}`);
    await cache.put(APP_SHELL_URL, response.clone());
    const html = await response.text();
    const appAssets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/gi)]
      .map((match) => new URL(match[1], APP_SHELL_URL).href);
    await cache.addAll([...STATIC_URLS, ...appAssets]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);
  const appScope = new URL(self.registration.scope);
  const cacheableDestination = ['script', 'style', 'font', 'image', 'manifest'].includes(request.destination);
  if (request.method !== 'GET' || requestUrl.origin !== appScope.origin
    || !requestUrl.href.startsWith(appScope.href)
    || (request.mode !== 'navigate' && !cacheableDestination)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;
      if (request.mode === 'navigate') {
        const cachedShell = await caches.match(APP_SHELL_URL);
        if (cachedShell) return cachedShell;
      }
      throw error;
    }
  })());
});
