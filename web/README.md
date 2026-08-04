# web — Next.js 도보 내비게이션 (Vercel 배포용)

Streamlit 프로토타입(`streamlit_walk_engine/`)과 **같은 판정 엔진**을 쓰는 모바일 웹 화면입니다.
Streamlit 으로는 할 수 없던 것 — 지도 위에 경로를 겹쳐 그리고, 화면 재생성 없이 위치만
갱신하는 것 — 을 위해 따로 만들었습니다.

## 왜 따로 만들었나

| | Streamlit | 여기(Next.js) |
|---|---|---|
| 위치 갱신 | 1초마다 **스크립트 전체 재실행** | `watchPosition` 구독, 바뀐 부분만 다시 그림 |
| 지도 | rerun 마다 컴포넌트 재생성 → 확대·이동 초기화 | 지도 인스턴스 1개, GeoJSON 데이터만 교체 |
| 경로 오버레이 | 정적 이미지 수준 | 경로선·회전점·도착지·내 위치를 지도 위에 |
| 배포 | 상시 켜진 서버 필요 | Vercel(서버리스) |

판정 자체는 `@walk/route-engine` 이 그대로 합니다. 그 패키지는 파이썬 `engine.py` 와
`golden_trace.json` 으로 묶여 있어 같은 입력에 같은 결과를 냅니다.

## 로컬 실행

```bash
# 저장소 루트에서
npm install
cp web/.env.local.example web/.env.local   # 발급받은 키를 채워 넣는다(커밋 금지)
npm run next:dev
```

`http://localhost:3000` — 단, **위치 기능은 https 또는 localhost 에서만** 동작합니다.
폰에서 테스트하려면 Vercel 프리뷰 배포 주소로 접속하세요.

## 필요한 키

| 이름 | 없으면 | 발급처 |
|---|---|---|
| `TMAP_APP_KEY` | **경로 탐색 불가** (앱이 동작하지 않음) | [openapi.sk.com](https://openapi.sk.com/) |
| `KAKAO_REST_API_KEY` | 가게·상호 이름 검색 안 됨 | 카카오 developers → 앱 키 → **REST API 키** |
| `NAVER_SEARCH_CLIENT_ID` / `_SECRET` | 네이버쪽 상호 검색만 빠짐 | developers.naver.com |

상호 검색(카카오·네이버)은 **둘 중 하나만 있어도** 됩니다 — 둘 다 넣으면 한쪽이 못
찾는 가게를 다른 쪽이 찾습니다. 둘 다 없으면 주소·큰 장소만 검색됩니다.

카카오는 반드시 **REST API 키**입니다. JavaScript 키·네이티브 앱 키는 401 이 납니다.

## Vercel 배포

1. Vercel 에서 이 저장소를 import 합니다. `vercel.json` 이 빌드 명령을 지정하므로
   **Root Directory 는 저장소 루트 그대로** 둡니다(`web` 으로 바꾸면 워크스페이스가 깨집니다).
2. Settings → Environment Variables 에 위 키들을 넣습니다.
   Production / Preview 양쪽에 넣어야 프리뷰에서도 검색·경로가 됩니다.
3. 배포 후 폰 브라우저로 접속 → 위치 권한 허용.

Git 을 나중에 연결하면 **그 시점의 커밋은 소급 배포되지 않습니다** — 다음 push 부터
자동 배포됩니다. 바로 올리려면 대시보드에서 Redeploy 를 누르세요.

키는 서버(API 라우트)에서만 읽습니다. 브라우저 번들에 들어가지 않으므로
`NEXT_PUBLIC_` 접두어를 붙이면 **안 됩니다**.

## 구조

```
web/
  app/
    page.tsx              첫 화면(목적지 입력·최근 목적지) + 안내 화면
    api/places/route.ts   장소 검색 프록시 (TMAP POI + 주소)
    api/route/route.ts    도보 경로 프록시 (TMAP 보행자)
  components/MapView.tsx  MapLibre 지도 + 경로 오버레이
  lib/
    tmap.ts               TMAP 호출·응답 파싱 (회전 30° 필터 포함)
    useGeolocation.ts     watchPosition / 나침반
    useNavigation.ts      엔진 구동 + 음성 안내 시점
```

## 지도 배경

무료 CARTO 타일을 쓰므로 지도 키가 따로 필요 없습니다. 타일을 못 받으면
(지하도·약전계) 배경만 단색으로 떨어지고 **경로선과 현재 위치는 그대로 보입니다** —
배경이 없다고 안내가 멈추면 안 되기 때문입니다.

## 아직 없는 것

Streamlit 판에 있고 여기 없는 것들입니다. 필요해지면 옮깁니다.

- 대중교통(환승) 여정, 예약 경로, 즐겨찾기 관리
- 랜드마크 음성 안내("CU편의점 지나 좌회전")와 후보 수집
- 자동 재탐색(현재는 이탈을 알리기만 하고 경로를 다시 만들지 않습니다)
- 진단 로그 수집·요약
- 개인정보 동의 화면 — 지금은 최근 목적지만 이 브라우저에 저장합니다
