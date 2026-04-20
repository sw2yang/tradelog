# TradeLog — PWA 배포 가이드 (Cloudflare Pages)

## 📂 현재 폴더에 생성된 파일

```
새 폴더/
├── TradeLog_Final_v8.html     ← PWA 메타 + SW 등록 완료
├── manifest.webmanifest        ← 앱 매니페스트
├── sw.js                       ← Service Worker (오프라인 캐시)
├── icon.svg                    ← 벡터 아이콘 (원본)
├── icon-build.html             ← PNG 아이콘 생성 도우미
├── icon-192.png                ← (생성 필요)
├── icon-512.png                ← (생성 필요)
├── icon-maskable-512.png       ← (생성 필요)
├── _headers                    ← Cloudflare Pages 응답 헤더
├── _redirects                  ← 루트 → v8 리다이렉트
├── .gitignore
└── DEPLOY.md                   ← 이 문서
```

---

## ① PNG 아이콘 생성 (1분)

1. `icon-build.html` 파일을 **Chrome/Edge** 로 더블클릭해서 엽니다.
2. 3개 캔버스가 보이면 각 **다운로드** 버튼을 눌러 저장:
   - `icon-192.png`
   - `icon-512.png`
   - `icon-maskable-512.png`
3. 다운로드된 파일 3개를 `새 폴더` 안으로 이동합니다.

> 💡 파일이 보이지 않으면 `file://` CORS 차단입니다. 페이지 상단의 **🔁 Fallback** 버튼을 누르세요.

---

## ② 로컬 테스트 (PWA 동작 확인)

Service Worker는 `file://` 에서 안 돕니다. 로컬 HTTP 서버가 필요합니다.

### 옵션 A — Python (Windows 기본 설치)
```powershell
cd "C:\Users\JE&SW\Desktop\새 폴더"
python -m http.server 8080
```
→ 브라우저에서 http://localhost:8080/ 접속

### 옵션 B — Node.js
```powershell
npx serve -p 8080 .
```

### 확인 사항 (Chrome DevTools → Application 탭)
- **Manifest**: TradeLog 이름·아이콘·색상 로드됨
- **Service Workers**: `sw.js` activated, running
- **Install 앱 버튼**: 주소창 우측 ⊕ 아이콘 클릭 → 독립 창으로 실행
- **오프라인**: Network 탭 "Offline" 체크 후 새로고침 → 여전히 열림

---

## ③ Cloudflare Pages 배포 (무료, 커스텀 도메인 가능)

### 1단계: GitHub 레포 생성

```powershell
cd "C:\Users\JE&SW\Desktop\새 폴더"
git init
git add TradeLog_Final_v8.html manifest.webmanifest sw.js icon.svg icon-192.png icon-512.png icon-maskable-512.png _headers _redirects .gitignore DEPLOY.md
git commit -m "chore: PWA v8 initial commit"
git branch -M main
# GitHub에서 repo 생성 후:
git remote add origin https://github.com/<your-name>/tradelog.git
git push -u origin main
```

### 2단계: Cloudflare Pages 연결

1. https://dash.cloudflare.com/ 로그인 → **Workers & Pages → Create → Pages → Connect to Git**
2. GitHub 레포 선택
3. 빌드 설정:
   - **Framework preset**: None
   - **Build command**: (비워둠)
   - **Build output directory**: `/`
4. **Save and Deploy** 클릭

~1분 후 `https://tradelog-xxxx.pages.dev` 로 접근 가능.

### 3단계: 커스텀 도메인 (선택)

Pages 프로젝트 → **Custom domains → Set up a custom domain** → 원하는 도메인 입력.
Cloudflare가 관리하는 도메인이면 자동으로 DNS 연결됩니다.

---

## ④ PWA 설치 (사용자 관점)

### 데스크톱 (Chrome/Edge)
- 주소창 우측 **⊕ (Install app)** 클릭
- 독립 창으로 실행, 작업표시줄에 고정 가능

### Android
- 메뉴 → **홈 화면에 추가**

### iOS (Safari)
- 공유 → **홈 화면에 추가** (아이콘이 apple-touch-icon으로 노출됨)

---

## ⑤ 업데이트 반영

1. `TradeLog_Final_v8.html` 수정
2. `sw.js` 상단 `VERSION` 값을 올림 (예: `tl-v8.0.2`)
3. `git commit && git push`
4. Cloudflare Pages가 자동 재배포
5. 사용자 브라우저는 다음 방문 시 새 SW 설치 → 자동 새로고침

> ⚠ `VERSION`을 올리지 않으면 기존 캐시가 잔존할 수 있습니다.

---

## ⑥ 주의사항

| 항목 | 설명 |
|---|---|
| **Finnhub/KIS 프록시** | SW가 `workers.dev` 를 우회하도록 `NO_CACHE_HOSTS` 에 등록됨 → 항상 실시간 |
| **localStorage** | SW와 무관하게 origin별 격리, Pages 도메인으로 이전 시 데이터는 **새로 시작** |
| **데이터 이관** | 기존 `file://` 사용자는 설정 → **내보내기(JSON)** → Pages 버전에서 **가져오기** 로 이관 |
| **Dark Reader** | `<meta name="darkreader-lock">` 으로 차단됨, 그대로 유지 |

---

## 🚀 다음 단계 — Tauri 데스크톱 앱 (2단계)

Pages 배포가 안정되면 동일 소스를 Tauri 로 번들링해 **.exe / .dmg / .AppImage** 를 만들 수 있습니다.
그때 별도 가이드 드릴게요.
