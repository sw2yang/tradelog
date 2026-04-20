/* TradeLog Service Worker — DEBUG v8.0.5
   ──────────────────────────────────────────
   모든 주요 이벤트에 console.log 추가해서 오프라인 실패 원인 추적
*/
const VERSION = 'tl-v8.0.5';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

console.log('[SW] script loaded, VERSION:', VERSION);

const SHELL_ASSETS = [
  './TradeLog_Final_v8.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

const NO_CACHE_HOSTS = [
  'finnhub.io',
  'openapi.koreainvestment.com',
  'openapivts.koreainvestment.com',
  'workers.dev',
  'news.google.com',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'api.stock.naver.com',
  'm.stock.naver.com',
  'polling.finance.naver.com',
  'corsproxy.io'
];

const RUNTIME_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

async function precacheAsset(cache, url) {
  try {
    console.log('[SW] precache start:', url);
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const ct = res.headers.get('content-type') || 'application/octet-stream';
    const clean = new Response(buf, {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': ct }
    });
    await cache.put(url, clean);
    console.log('[SW] precache OK:', url, '(' + buf.byteLength + ' bytes)');
  } catch (err) {
    console.warn('[SW] precache FAIL:', url, err.message || err);
  }
}

self.addEventListener('install', (event) => {
  console.log('[SW] INSTALL event fired');
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    for (const url of SHELL_ASSETS) {
      await precacheAsset(cache, url);
    }
    await self.skipWaiting();
    console.log('[SW] INSTALL done, skipWaiting called');
  })());
});

self.addEventListener('activate', (event) => {
  console.log('[SW] ACTIVATE event fired');
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => {
            console.log('[SW] deleting old cache:', k);
            return caches.delete(k);
          })
    );
    await self.clients.claim();
    console.log('[SW] ACTIVATE done, claiming clients. Current cache:', SHELL_CACHE);
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 모든 fetch 이벤트 로깅 (디버그)
  console.log('[SW FETCH]', request.method, request.mode, request.url);

  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch { return; }

  // 1) 실시간 데이터 — 네트워크 전용
  if (NO_CACHE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    console.log('[SW FETCH] → pass-through (API):', url.hostname);
    return;
  }

  // 2) 내비게이션 요청 (HTML) — 네트워크 우선, 오프라인 시 precache된 HTML로 폴백
  if (request.mode === 'navigate' || request.destination === 'document') {
    console.log('[SW FETCH] → navigation handler');
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        console.log('[SW FETCH] navigation: network OK');
        return res;
      } catch (err) {
        console.log('[SW FETCH] navigation: network FAILED, trying cache. err:', err.message);
        const exact = await caches.match(request, { ignoreSearch: true });
        if (exact) {
          console.log('[SW FETCH] navigation: served exact cache match');
          return exact;
        }
        const main = await caches.match('./TradeLog_Final_v8.html');
        if (main) {
          console.log('[SW FETCH] navigation: served fallback cache (main HTML)');
          return main;
        }
        console.warn('[SW FETCH] navigation: NO CACHE FOUND, returning offline page');
        return new Response(
          '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>Offline</title></head><body style="font-family:system-ui;padding:2rem"><h1>📡 오프라인</h1><p>캐시에서 앱을 찾을 수 없습니다.</p><p>온라인 상태에서 한 번 접속한 뒤 다시 시도해주세요.</p></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // 3) Runtime 캐시 (CDN/폰트)
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

  // 4) same-origin 에셋 — 캐시 우선, 없으면 네트워크
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          console.log('[SW FETCH] → served from cache:', request.url);
          return cached;
        }
        return fetch(request);
      })
    );
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
