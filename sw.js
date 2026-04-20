/* TradeLog Service Worker
   ─────────────────────────
   전략: App shell 캐시 + stale-while-revalidate
   - HTML/아이콘/매니페스트는 설치 시 프리캐시
   - 외부 폰트·CDN은 fetch 시 캐시 (runtime)
   - API (KIS/Finnhub/프록시) 는 절대 캐시하지 않음
*/
const VERSION = 'tl-v8.0.1';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const SHELL_ASSETS = [
  './',
  './TradeLog_Final_v8.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// 절대 캐시하면 안 되는 호스트 (실시간 데이터)
const NO_CACHE_HOSTS = [
  'finnhub.io',
  'openapi.koreainvestment.com',
  'openapivts.koreainvestment.com',
  'workers.dev',
  'news.google.com',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'api.stock.naver.com',
  'm.stock.naver.com'
];

// 런타임 캐시 대상 (CDN·폰트 등)
const RUNTIME_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(err => {
        // 일부 에셋이 없어도 설치는 진행
        console.warn('[SW] shell precache partial:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // 1) 실시간 데이터 — 네트워크 전용
  if (NO_CACHE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    return; // 기본 브라우저 동작
  }

  // 2) 내비게이션 요청 (HTML) — 네트워크 우선, 실패 시 캐시
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(()=>{});
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('./TradeLog_Final_v8.html')))
    );
    return;
  }

  // 3) Runtime 캐시 (CDN/폰트) — stale-while-revalidate
  if (RUNTIME_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request).then((res) => {
            if (res && res.status === 200) cache.put(request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // 4) same-origin — 캐시 우선, 폴백 네트워크
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(()=>{});
        return res;
      }).catch(() => cached))
    );
    return;
  }
});

// 메시지 제어 (수동 업데이트 트리거)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
