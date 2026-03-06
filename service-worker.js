/**
 * Service Worker - Meu Bloco PWA
 * Faz cache de todos os ficheiros para uso 100% offline
 */
const CACHE_NAME = 'meu-bloco-v2';
const BASE = new URL('.', self.location.href).href;

const ASSETS_TO_CACHE = [
  'index.html',
  'manifest.json',
  'tailwind.css',
  'chart.js',
  'fonts/Inter/Inter-Regular.woff2',
  'fonts/Inter/Inter-Medium.woff2',
  'fonts/Inter/Inter-SemiBold.woff2',
  'fonts/Inter/Inter-Bold.woff2',
  'clique.mp3',
  'som-acao.mp3',
  'som%20de%20deletar%20tudo.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE.map(p => new Request(BASE + p, { cache: 'reload' })));
    }).catch((err) => {
      console.warn('[SW] Pré-cache parcial:', err);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.includes('Meu%20Bloco') && !url.pathname.includes('Meu Bloco')) return;

  const isStatic = /\.(css|js|woff2?|ttf|mp3|m4a|png|jpg|jpeg|gif|svg|ico|html|json)(\?|$)/i.test(url.pathname) ||
    url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');

  if (isStatic) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          });
        });
      })
    );
  }
});
