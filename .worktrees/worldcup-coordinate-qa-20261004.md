# 월드컵시장 좌표 QA

## 2026-10-04 검증 2 — Naver 실제 파노라마 추가 회귀

## 1. 검증 범위
- 저장소: `D:\walk\.worktrees\worldcup-market-clean-20261004`, 브랜치 `feat/worldcup-market-demo`, 기준 `b8bfdfc`.
- 현재 변경 10개 파일과 소비자 `DestinationWalk.tsx`, `/worldcup-market/page.tsx`, `/api/route/route.ts`, `tmap.ts`, `types.ts`, 기존 `NaverPanoramaAdapter/openNaverPanorama`를 읽기 전용 검토했다.
- 기준: 사용자 요청과 `origin/main:TASK.md`, 현재 작업 항목. 별도 기획/디자인/구현 로그가 없어 디자인 토큰·설계서 대비 평가는 제외했다.
- 구현 변경·Git mutation·env 열람·외부 키 출력 없음. 본 QA 문서만 저장소 밖에 기록했다.

## 2. 통합 정합성 — 양쪽 동시 읽기

### 2-1. 데이터/API 응답 ↔ 호출부
| 생산자 | 소비자 | 결과 |
|---|---|---|
| `verifiedBlogLocation`의 `latitude/longitude` 및 출처/날짜 | `storeLocation` 지도와 `navigationTarget` 도보 | 일치. 45개 전부 같은 검증 위치를 전달 |
| `/api/route` POST의 `{origin, dest}` | `DestinationWalk` 초기 경로·재탐색 호출 | 일치. 서버가 읽는 키와 좌표 모양이 동일 |
| TMAP 변환 `RouteResponse {route,totalDistanceMeters,totalSeconds,turnDescriptions,source}` | `DestinationWalk`/`useNavigation`/`MapView` | 일치. 별도 wrapper 없음 |
| 거리뷰 `provider=NAVER`, `available`, `streetViewLocation`, pano ID | `WorldCupMarketStreetView` → 기존 `NaverPanoramaAdapter.open` | 일치. 기록된 SDK 파노 위치에서 조회하며 runtime ID가 바뀌면 변경 안내. 잘못된 provider ID 혼용 없음 |
| 로컬 Naver env 설정과 SDK `pano_status=OK` | component loading/ready/failed + session.close | 일치. Google 키 없이 Naver 분기로 실제 사진을 연다. 키/조회 실패에는 위치 상태별 fallback |
| 선택 provider의 Google metadata/키 | 기존 Google embed helper | Google 분기 유지. Google 키 미설정은 Naver 거리뷰의 blocker가 아님 |

### 2-2. 파일 경로 ↔ 링크
`web/app/worldcup-market/page.tsx` ↔ `/worldcup-market?store=<기존 ID>` 일치. API 실제 파일 `/api/route/route.ts` ↔ fetch `/api/route` 일치. 원래 홈 `page.tsx`·root `layout.tsx`·`globals.css`는 main과 Git diff 없음(CRLF 정규화 후 내용 동일).

### 2-3. 상태 전이 ↔ 코드
도보 상태 `acquiring_location → routing → navigating → arrived`, 위치/경로 실패 `→ failed`, 재시도 `→ acquiring_location`, 중단 시 라우트 부모 target null 전이가 코드에 존재한다. 기존 lifecycle의 이번 변경 없음. 좌표 null이면 도보 버튼 비활성, 거리뷰는 4개 위치/도보 조합별 fallback을 제공한다. Naver loading → ready/failed 전이와 지연 세션 cleanup을 확인했다. 기존 NearbyScreen의 점포 ID key가 전환 remount를 보장하고, 추가 inner key는 단독 컴포넌트의 좌표/파노 변경도 새 인스턴스로 처리한다.

### 2-4. API ↔ 호출 1:1
이번 작업이 활성화한 POST `/api/route`는 `DestinationWalk` 초기/재탐색에서 호출한다. Naver Geocoding은 수집 시점에만 실행하고 결과를 데이터로 기록하여 브라우저에서 credential API를 호출하지 않는다. 신규 미호출 API 없음.

## 3. 발견한 문제
### 🔴 치명적
현재 미해결 0건. 처음 발견한 테스트 fixture의 `sourceUrl:string|null` ↔ `VerifiedLocation.sourceUrl:string` 불일치는 UI 담당이 두 파일에 null guard를 추가했고, 최신 `web npm run typecheck` PASS 로그와 소스를 교차 확인했다. Naver 실패 후 단독 컴포넌트 rerender 우려는 실제 NearbyScreen에서 이미 점포 ID key로 방지된다. 단독 계약도 견고하게 하기 위한 inner key 추가를 확인했다.

### 🟡 개선 필요
1. `web/components/WorldCupMarketMap.tsx:113` — 390px 지도에서 같은 건물 및 인접 건물의 점포 라벨이 많이 겹친다. 두 점포 캡처 모두 선택된 라벨은 z-index와 파란 테두리로 보이고 점포 목록 선택이 가능하다. 좌표 임의 분산 금지 요구를 준수한 현재 동작을 유지하되, 후속 개선 시 위치를 바꾸지 않는 건물별 묶음 표시/라벨 축약을 고려할 수 있다. 이번 좌표 데이터 검증의 blocker는 아니다.

### 🟢 제안
없음. 요청 범위 밖 코드 변경을 권고하지 않았다.

## 4. 남은 의존성/미완료 항목
- Naver 주변 파노 45/45(13개 고유 ID), 실제 Chrome Naver 사진 01/45 점포 두 곳 PASS. Google Maps 로컬 키는 없으므로 선택 Google provider는 미설정/미검증 상태다. Naver 목표를 더 이상 Google 부재로 BLOCKED라고 분류하지 않는다.
- 건물 주소를 지오코딩한 위치이며 개별 점포 입구·층/실내 위치는 실측하지 않았다. 파노/정면 품질을 추정하지 않는다.
- Chrome 위치 입력은 출처 지오코딩된 07 점포 위치로 제어했다. 휴대폰 실제 GPS/현장 보행 검증이 아니다.

## 5. 통과 항목
- 직접 감사 스크립트: 기준 b8bfdfc의 45개 `stall` 입력 전체 JSON이 현재와 동일. ID/이름/URL뿐 아니라 모든 원래 입력 필드 보존.
- 현재 evidence/좌표 상수 ↔ `worldcup-coordinate-evidence-20261004.json`: 좌표·근거 주소·출처 URL·이미지 URL 45/45 일치, 지번 모두 서울특별시 마포구 망원동, bounding box 통과.
- SDK metadata 18건 ↔ 저장 `BUILDING_PANORAMAS` ↔ 각 점포의 `panoramaMetadata`: 위경도·pano ID·촬영일·거리 45/45 일치. 독립 haversine 계산에서도 최대 29.08m, 전부 50m 이내·시장 bbox 내부. 근거 `worldcup-naver-panorama-probe-20261004.json`. [Naver 공식 Panorama API](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Panorama.html#getLocation)의 `getLocation/getPanoId/getPosition` 계약과 맞는다.
- 본문 근거 17개·이미지 근거 28개, 건물 좌표 18개, 공유 좌표 12그룹. 같은 건물 점포의 실제 좌표가 동일하고 층/호수 단서는 근거에 보존.
- source/날짜 필수 및 범위 외·NaN/Infinity·위경도 역전 거부 테스트 존재. 미확인 좌표/파노의 UI 조건도 테스트한다.
- 실제 캡처 직접 픽셀 확인: map/nearby/navigation의 01 부부야채 및 45 장터국밥에 이어 `worldcup-coordinate-panorama-01/45-20261004.png` 두 장. 실제 시장 거리사진·NAVER 로고·주변 영상/정면 미확인 캡션을 확인했다. 지도 선택된 핀, 공유 안내(2개/6개), 파란 도보 경로·빨간 목적지도 확인했다.
- 변경된 UI 문자열은 월드컵시장 i18n 블록에 한정. 변경 파일 목록에 보호파일/env/workflow 없음. 마커 이름은 textContent로 표시하며 TMAP credential은 서버 env에서만 읽는다.

## 6. 빌드/실행 검증
부모 실행 로그를 확인했으며 중복 전체 suite 실행은 하지 않았다.
- build PASS: Next 빌드와 `/`, `/worldcup-market`, `/api/route` 라우트 생성 확인.
- Naver 및 inner key 변경 후 최종 full test:run PASS: 20 files / 169 tests, 최신 로그 시작 12:09:25. 첫 파노 로딩 실패 뒤 다른 점포에서 재조회·ready 회복하는 테스트도 통과했다. 병렬 빌드 중의 이전 단일 timeout은 PASS로 간주하지 않았으며 빌드 완료 뒤 full 재실행 로그를 확인했다.
- lint, root typecheck PASS. web typecheck 초기 실패 수정 후 PASS(동일 로그 최신본).
- 실제 Chrome 390×844: API interception 없음, 지도 타일 실응답 34개, page error 0. Naver SDK·metadata·이미지의 실응답 HTTP200과 두 점포 파노사진 PASS. TMAP HTTP200 두 건(01:132m/7좌표, 45:99m/5좌표). 실제 휴대폰 GPS 이동과 현장 점포 입구 확인은 별도 미검증.
- 근거 로그: `.worktrees/worldcup-coordinates-{build,tests,lint,root-typecheck,web-typecheck,chrome}-20261004.log`.

## 7. 권장 조치
1. 정적/데이터 경계면 및 실제 Chrome 지도·도보·Naver 주변 거리뷰 두 점포 PASS로 보고한다. 45개 전체 사진을 수동으로 현장 비교한 것으로 보고하지 않는다.
2. Google은 선택 provider 미설정으로 분리하고, 실제 사용환경에도 로컬/배포 Naver env와 허용 도메인 설정이 필요함을 기록한다. API 키를 코드/로그/커밋에 넣지 않는다.
3. 일반 커밋/push와 draft PR만 유지한다. main merge/Ready/force push는 수행하지 않는다.
