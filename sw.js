/* TradeLog Service Worker
   ─────────────────────────
   전략: App shell 캐시 + stale-while-revalidate
   - HTML/아이콘/매니페스트는 설치 시 프리캐시
   - 외부 폰트·CDN은 fetch 시 캐시 (runtime)
   - API (KIS/Finnhub/프록시) 는 절대 캐시하지 않음
*/
const VERSION = 'tl-v8.0.4';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const SHELL_ASSETS = [
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

// 안정 버전: arrayBuffer로 바디를 완전히 읽어서 새 Response로 저장.
// Content-Type만 남기고 다른 헤더는 다 버려서 Cloudflare의 Content-Encoding/chunked 전송 간섭 제거.
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
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    for (const url of SHELL_ASSETS) {
      await precacheAsset(cache, url);
    }
    await self.skipWaiting();
  })());
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

  // 2) 내비게이션 요청 (HTML) — 네트워크 우선, 오프라인 시 precache된 HTML로 폴백
  //    ※ 내비게이션 응답은 캐시에 저장 안 함 (Cloudflare가 chunked/redirect로 보낼 때 빈 바디 우려)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        return res;
      } catch (err) {
        console.log('[SW] navigate offline, falling back to precached HTML');
        // 폴백 순서: 정확히 일치하는 URL → precache된 메인 HTML
        const exact = await caches.match(request, { ignoreSearch: true });
        if (exact) return exact;
        const main = await caches.match('./TradeLog_Final_v8.html');
        if (main) return main;
        // 최후: 빈 응답이라도 반환해서 공룡 페이지는 막기
        return new Response(
          '<!DOCTYPE html><html><body><h1>Offline</h1><p>캐시에서 HTML을 찾을 수 없습니다. 온라인 상태에서 앱을 한 번 열어주세요.</p></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
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

  // 4) same-origin 에셋 — 캐시 우선, 없으면 네트워크 (runtime 저장은 안 함: precache만 신뢰)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }
});

// 메시지 제어 (수동 업데이트 트리거)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
