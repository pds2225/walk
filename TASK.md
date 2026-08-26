# K-Navi PoC Active Tasks

> Repository: `pds2225/walk`  
> Product name: **K-Navi / 케이네비**  
> Task series: `KN-20260826-*`  
> Created: 2026-08-26  
> Status: ACTIVE

---

## 0. TASK GOVERNANCE

이 섹션은 기존 `TASK.md`의 Git 안전규칙, TASK PINNING, lease, worktree, branch, PR, CI, 상태관리 규칙을 **대체하지 않는다**.

기존 규칙을 모두 유지하고, 본 섹션은 K-Navi의 현재 개발 요구사항과 Acceptance Criteria를 정의한다.

### Source of truth

내용 충돌 시 다음 순서로 판단한다.

1. 현재 TASK.md의 명시적 사용자 요구사항
2. 현재 repository의 실제 코드 및 테스트
3. 최신 사용자 승인사항
4. 최신 프로젝트 문서
5. 과거 사업계획서·발표자료
6. 추론

과거 명칭인:

- K-Walk
- 케이워크
- 도보네비
- K-네비

가 코드·문서에 존재할 수 있으나 신규 사용자 노출 명칭은 **K-Navi / 케이네비**를 사용한다.

단, 코드 내부 identifier를 서비스명 변경만을 이유로 대규모 rename하지 않는다.

---

# 1. CURRENT PRODUCT GOAL

이번 개발 사이클의 목표는:

> **K-Navi를 실제 사용자가 휴대폰을 들고 이동하면서 테스트할 수 있는 도보 내비게이션 PoC 수준으로 만든다.**

단순 기능 존재 여부가 아니라 아래 흐름이 실제 navigation state로 연결되어야 한다.

`출발지/목적지 결정`
→ `목적지 좌표 확정`
→ `도보 경로 생성`
→ `현재 위치 수신`
→ `위치 신뢰도 판단`
→ `실제 이동방향 판단`
→ `경로 진행`
→ `경로 이탈 판정`
→ `재탐색/재안내`
→ `목적지 접근`
→ `Roadview 보조 안내`
→ `도착`

각 컴포넌트가 따로 존재하는 것만으로 PoC READY 또는 TASK DONE 처리하지 않는다.

---

# 2. CURRENT VERIFIED ENVIRONMENT

## Kakao Maps

Kakao Developers 사전 설정은 완료된 상태다.

### Existing Kakao application

- Application: `walk`
- App ID: `1508720`
- Category: 지도/내비게이션
- 신규 Kakao App 생성 금지
- Kakao Map API: ON
- 해당 앱이 현재 Kakao Maps 일간 무료 쿼터 대상 앱

### Web SDK

Roadview에는 Kakao JavaScript SDK를 사용한다.

사용 Key 종류:

`Default JS Key`

다음 키와 혼동 금지:

- Admin Key
- REST API Key
- Native App Key

기존 `KAKAO_REST_API_KEY`는 장소검색 등 REST API 용도이며 Roadview SDK Key로 대체하지 않는다.

### Registered JavaScript SDK origins

- `http://localhost:8501`
- `http://127.0.0.1:8501`
- `http://localhost:3000`
- `https://walknavi.streamlit.app`

경로(path)가 아니라 origin 기준이다.

### Environment variables

Streamlit:

`KAKAO_JAVASCRIPT_KEY`

Next.js/browser:

`NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`

### Secret policy

- 실제 Key 값을 TASK.md에 기록하지 않는다.
- source code 하드코딩 금지.
- git commit 금지.
- console/log/test output에 full key 노출 금지.
- 기존 secret file을 임의 삭제·교체 금지.

### Current Roadview status

Kakao Developers 콘솔 설정:

**DONE**

실제 앱 코드 Roadview 연동:

**NOT YET VERIFIED**

따라서 콘솔 설정을 반복 수행하지 않는다.

---

# 3. CURRENT TECHNICAL PRINCIPLES

## 3.1 Navigation 판단

단일 GPS 좌표 또는 단말 Heading 하나만으로 경로이탈을 판단하지 않는다.

가능한 기존 구현을 우선 조사하고 다음 신호를 활용한다.

- GNSS Accuracy
- 위치 history
- Movement Bearing
- Route Bearing
- Route Progress
- Cross-track Distance
- 이동거리
- 시간 연속성
- route geometry
- 현재 navigation state

기본 판정 개념:

`On-route`
→ 정상 이동

`Drifting`
→ 이상신호가 있으나 실제 이탈 확정 불가

`Deviated`
→ 복수 신호가 지속적으로 실제 이탈을 나타냄

Heading은 보조 신호로만 취급한다.

순간적인 GPS 튐이나 Heading 회전을 실제 경로이탈로 즉시 판단하지 않는다.

---

## 3.2 Reuse-first

모든 TASK에서:

`REUSE → FIX → EXTEND → NEW`

순서를 따른다.

기존 구현을 조사하지 않고 동일 기능을 새 모듈로 중복 구현하지 않는다.

---

## 3.3 Roadview principle

PoC에서는 자체 랜드마크 사진 DB를 새로 구축하지 않는다.

우선:

**Kakao Roadview**

를 사용한다.

장기 확장을 고려한 Provider 구조는:

`Kakao`
→ `NAVER`
→ `Google`

순서를 염두에 두되, 이번 TASK에서 NAVER/Google 실제 API 연결은 필수가 아니다.

---

# 4. TASK PRIORITY

## P0

1. `KN-20260826-01` — Navigation 전체 실사용 흐름
2. `KN-20260826-02` — 경로·위치·방향·이탈·재탐색 정확도

## P1

3. `KN-20260826-03` — 실제 보행용 Navigation UI/UX
4. `KN-20260826-04` — 다국어 화면·음성 안내
5. `KN-20260826-05` — Kakao Roadview 목적지 시각안내

## P2

6. `KN-20260826-06` — 랜드마크 사진 기능 정리

## Integration

7. `KN-20260826-07` — 통합 E2E·회귀·PoC Ready 판정

dependency가 확인되면 실제 실행 순서는 조정할 수 있다.

단순 구현 편의를 이유로 P0보다 P2를 먼저 완료하지 않는다.

---

# KN-20260826-01
## K-Navi 실제 Navigation 전체 흐름

**Priority:** P0  
**Status:** READY  
**Type:** Integration / Product Core

### Goal

기존 기능들을 실제 하나의 navigation session으로 연결한다.

### Required user flow

1. 목적지 선택
2. 목적지 좌표 결정
3. 현재 위치 확보
4. 도보 경로 생성
5. navigation 시작
6. 실시간 또는 주기적 위치 update
7. 현재 이동상태 update
8. 다음 행동 안내
9. 경로이탈 발생 시 상태변경
10. 필요 시 reroute
11. 새 경로 안내
12. 목적지 접근
13. 도착

### Audit first

먼저 실제 repository에서 다음을 찾는다.

- application entrypoint
- Streamlit app
- Next.js/web app
- Navigation page
- routing provider
- route model
- GPS/geolocation
- navigation state
- deviation engine
- reroute
- arrival
- tests
- fixtures
- simulation/replay
- logging

각 요소를:

- `ALREADY_DONE`
- `PARTIAL`
- `BROKEN`
- `NOT_IMPLEMENTED`

중 하나로 분류한다.

### Acceptance Criteria

- [ ] 실제 목적지가 navigation session에 전달된다.
- [ ] route가 navigation state와 연결된다.
- [ ] current position update가 navigation state에 반영된다.
- [ ] 이동에 따라 route progress가 변경된다.
- [ ] navigation 상태가 화면에 반영된다.
- [ ] deviation 결과가 사용자 흐름에 연결된다.
- [ ] reroute 결과가 실제 active route를 갱신한다.
- [ ] arrival 상태가 navigation 종료와 연결된다.
- [ ] mock-only 흐름이 아니다.
- [ ] 기존 정상 기능을 불필요하게 제거하지 않는다.

### NOT DONE

다음만으로 완료 처리하지 않는다.

- route polyline만 화면에 표시
- navigation state class만 생성
- backend 함수만 존재
- mock 위치 1개만 성공
- build 성공
- unit test 성공
- UI만 연결
- API만 연결

### Evidence required

완료 기록에는 최소 다음을 남긴다.

- 주요 entrypoint
- 핵심 수정파일
- 사용자 flow 연결 위치
- 실행 또는 test command
- 결과
- 남은 제한사항

---

# KN-20260826-02
## 경로 추천·위치 추적·이동방향·경로이탈·재탐색 정확도

**Priority:** P0  
**Status:** READY  
**Type:** Navigation Engine

### Goal

GPS/GNSS 흔들림 때문에 정상 사용자를 이탈자로 오판하지 않으면서 실제 잘못된 이동은 감지한다.

---

## 02-A. Destination coordinate reliability

목적지 좌표가 잘못되면:

- route
- arrival
- Roadview
- 거리 계산

이 모두 잘못되므로 경로 엔진의 선행 입력으로 취급한다.

### Audit

현재 장소검색이 어떤 Provider와 좌표를 사용하는지 확인한다.

확인 대상:

- query → place result
- place result → lat/lng
- 표시 좌표
- 실제 route destination
- arrival destination
- Roadview destination

가능하면 동일 canonical destination coordinate를 사용한다.

### Acceptance

- [ ] 화면에서 선택한 목적지와 route destination이 일치한다.
- [ ] route destination과 arrival 판단 좌표가 일치한다.
- [ ] Roadview도 동일 canonical destination을 받을 수 있다.
- [ ] 다른 Provider 좌표를 혼용해 destination drift가 발생하지 않는다.
- [ ] 검색결과 ambiguity 처리 방식이 존재한다.

복수 지도 API 교차검증은 현재 코드와 API 가용성을 조사한 뒤 필요할 경우 후속 TASK로 분리한다.

---

## 02-B. GNSS accuracy

확인:

- latitude
- longitude
- accuracy
- timestamp

위치 정확도가 나쁜 샘플을 고신뢰 deviation 증거로 사용하지 않는다.

---

## 02-C. Movement Bearing

직전 한 점과 현재 한 점만으로 방향을 과신하지 않는다.

조사 대상:

- 최소 이동거리
- sample history
- jitter filtering
- stationary 상태
- stale location

Movement Bearing 기존 구현이 있으면 재사용한다.

---

## 02-D. Route Bearing

현재 route segment 또는 앞으로 진행할 segment의 진행방향과 실제 이동방향을 비교한다.

route geometry가 복잡한 곡선·교차로에서 잘못된 segment를 선택하지 않는지 확인한다.

---

## 02-E. Route Progress

시간에 따라:

- 진행 중
- 정체
- 역행

을 구분할 수 있는지 확인한다.

단일 위치 update로 역행을 확정하지 않는다.

---

## 02-F. Cross-track Distance

사용자 위치와 active route 간 횡방향 이격을 계산한다.

GNSS Accuracy와 함께 해석한다.

예:

정확도 ±10m인데 route에서 7m 떨어진 좌표

→ 강한 이탈 증거로 간주하지 않음.

---

## 02-G. State machine

현재 실제 state model을 우선한다.

가능하면 의미상 다음 세 상태를 유지한다.

### On-route

정상적인 route progression.

### Drifting

일부 이상신호가 존재하나 이탈 불확실.

사용자에게 즉시 경고하지 않는다.

### Deviated

복수 이상신호가 시간/횟수 기준 이상 지속.

reroute 또는 re-guidance 가능.

---

## 02-H. False Positive suppression

반드시 고려:

- GNSS 순간 jump
- accuracy 악화
- 휴대폰 회전
- 일시 정지
- 횡단보도 대기
- 교차로
- route segment 전환
- 좁은 평행도로
- 건물 밀집구간
- 위치 update 지연

---

## 02-I. Reroute

Deviated라고 판단되었다고 무조건 매 tick마다 reroute하지 않는다.

확인:

- reroute cooldown
- 중복 요청 억제
- pending state
- 동일 route 반복 생성
- network failure
- fallback behavior

---

## 02-J. Arrival

목적지 접근 판정은 단일 좌표 거리만 보지 말고 현재 코드 구조에 맞춰 안정적으로 처리한다.

최소 고려:

- destination distance
- GNSS Accuracy
- 이동상태
- arrival threshold
- repeated arrival event suppression

---

### Acceptance Criteria

- [ ] 정상 route trace에서 false deviation이 불필요하게 반복되지 않는다.
- [ ] 실제 route 이탈 trace에서 Deviated로 전환된다.
- [ ] Heading 단독으로 Deviated가 발생하지 않는다.
- [ ] GPS accuracy 저하가 판단 신뢰도에 반영된다.
- [ ] progress가 navigation state에 실제 사용된다.
- [ ] cross-track 정보가 실제 판정에 사용되거나, 미사용 시 이유가 기록된다.
- [ ] reroute storm 방지 로직이 존재한다.
- [ ] arrival 중복 이벤트가 억제된다.
- [ ] threshold를 변경했다면 변경 전/후 결과를 비교한다.

### Threshold rule

기존 threshold를 근거 없이 임의 조정하지 않는다.

변경 시 반드시 기록:

`OLD`
→ `NEW`
→ `WHY`
→ `BEFORE RESULT`
→ `AFTER RESULT`

---

# KN-20260826-03
## 실제 보행용 Navigation UI/UX

**Priority:** P1  
**Status:** READY  
**Type:** Frontend / Navigation UX

### Goal

개발자 테스트 화면이 아니라 걷는 사용자가 한눈에 다음 행동을 이해할 수 있는 화면을 만든다.

### Information priority

화면 우선순위:

1. 다음 행동
2. 현재 위치/진행방향
3. 추천 경로
4. 목적지/남은 상태
5. deviation/reroute
6. secondary information
7. debug information

### Must show

- 현재 위치
- 목적지
- route
- 현재 이동방향 또는 사용자 방향 표현
- 다음 행동
- 남은 거리 또는 진행 상태
- 정상/주의/이탈 상태
- rerouting 상태
- arrival

### Mobile-first

주요 테스트 viewport는 모바일이다.

확인:

- 지도와 안내 카드 충돌
- 작은 글씨
- 버튼 터치영역
- 화면 하단 브라우저 UI 간섭
- 세로 viewport
- 지도 controls 중복
- 화면 스크롤 필요 여부

### Debug separation

다음 값은 개발자용 영역으로 분리한다.

예:

- raw lat/lng
- accuracy
- bearing raw values
- cross-track raw
- threshold
- internal state counters
- API response

최종 navigation primary UI를 차지하지 않는다.

### Navigation state binding

UI는 mock 문구가 아니라 실제 navigation state에 연결한다.

예:

정상
→ normal guidance

Drifting
→ 필요하면 내부/약한 UI

Deviated
→ 명확한 재안내

Rerouting
→ 재탐색 중

Arrived
→ 도착

### Acceptance Criteria

- [ ] navigation core state와 UI가 실제 연결됨.
- [ ] 실제 destination/route가 표시됨.
- [ ] 다음 행동을 우선적으로 읽을 수 있음.
- [ ] mobile viewport에서 핵심정보가 한 화면에 들어옴.
- [ ] debug 값이 primary UI를 방해하지 않음.
- [ ] reroute 중 사용자에게 현재 상태가 보임.
- [ ] arrival UI 존재.
- [ ] navigation이 없는 상태/오류 상태도 처리.

---

# KN-20260826-04
## 다국어 화면·음성 길안내

**Priority:** P1  
**Status:** READY  
**Type:** Localization / TTS

### Required languages

- Korean
- English
- Japanese
- Chinese

현재 프로젝트에 존재하는 locale scheme을 우선 사용한다.

중국어는 기존 코드가 Simplified/Traditional을 구분하고 있다면 기존 정책 유지.

---

## Navigation events

현재 코드의 실제 event/state 이름을 먼저 확인한다.

개념적으로 최소 다음 상황을 음성안내와 연결한다.

- navigation start
- 다음 행동
- 방향 전환
- wrong direction
- deviation
- rerouting
- route updated
- destination approaching
- arrival

없는 event를 프롬프트 문구만 보고 억지로 추가하지 않는다.

---

## TTS

기존 TTS 모듈이 있으면 재사용한다.

확인:

- browser speech API
- server TTS
- external provider
- existing abstraction

### Duplicate suppression

같은 상태 update마다 동일 문장을 반복 재생하지 않는다.

필요한 경우:

- event id
- utterance hash
- cooldown
- state transition

등 현재 architecture와 맞는 방식으로 방지한다.

### Failure behavior

TTS 실패가 navigation 자체를 중단시키지 않는다.

음성이 없어도 화면 안내는 계속되어야 한다.

### Acceptance Criteria

- [ ] 4개 언어 resource가 navigation UI에 실제 적용됨.
- [ ] TTS와 navigation event가 실제 연결됨.
- [ ] 동일 안내 무한 반복 없음.
- [ ] 언어 변경 후 이후 안내가 선택 언어로 나옴.
- [ ] TTS 실패 시 navigation 유지.
- [ ] untranslated key가 primary UI에 그대로 노출되지 않음.
- [ ] mock 버튼만 존재하는 상태로 DONE 금지.

---

# KN-20260826-05
## Kakao Roadview 기반 목적지 시각안내

**Priority:** P1  
**Status:** READY  
**Type:** External API / Frontend Integration

### Goal

목적지에 가까워진 사용자가 실제 주변 도로·건물 외관을 보고 목적지를 식별할 수 있도록 한다.

Roadview는 navigation을 대체하지 않는다.

**목적지 확인 보조 기능**이다.

---

## Trigger

Roadview를 navigation 시작부터 계속 표시하지 않는다.

목적지 접근 시점 또는 사용자의 명시적 요청에 의해 표시한다.

기본 접근 조건 예시:

`distanceToDestination <= ROADVIEW_TRIGGER_DISTANCE`

초기 default 후보:

`50m`

단 실제 코드 구조에 맞게 configurable constant로 둔다.

하드코딩된 magic number를 여러 위치에 복제하지 않는다.

---

## Canonical destination

Roadview는 KN-02에서 사용되는 동일 destination coordinate를 사용한다.

별도 좌표를 다시 검색해 서로 다른 목적지로 표시하지 않는다.

---

## Kakao Roadview flow

`destination coordinate`
→ `RoadviewClient`
→ `nearest pano search`
→ `Roadview available`
→ `Roadview load`
→ `destination direction`
→ `destination marker/overlay`
→ `K-Navi viewer`

목적지 주변 검색반경은 configurable하게 한다.

초기 후보:

- 30m
- 50m

필요한 경우 단계적 fallback radius를 설계할 수 있다.

---

## Camera

가능하면 Roadview 초기 진입 시 destination 방향이 보이도록 한다.

Kakao API가 제공하는 viewpoint / coordinate 관련 기능을 활용한다.

사용자가 수동으로 360° 탐색하는 기능은 유지한다.

---

## Destination identification

로드뷰에서 사용자가 최소한:

> “어느 방향/어느 건물이 목적지인가”

를 알 수 있어야 한다.

가능한 방법:

- marker
- custom overlay
- K-Navi 상단 안내
- destination name
- 방향 정보

---

# Unified Roadview architecture

K-Navi 공통 UI와 Provider SDK를 분리한다.

개념:

`UnifiedRoadviewViewer`

`RoadviewProvider`

`KakaoRoadviewAdapter`

향후:

`NaverPanoramaAdapter`

`GoogleStreetViewAdapter`

공통 interface 후보:

- `isAvailable(destination)`
- `open(destination)`
- `lookAt(destination)`
- `setView(...)`
- `close()`

실제 repository architecture에 더 자연스러운 interface가 있으면 그것을 우선한다.

---

## Provider scope

이번 TASK:

### REQUIRED

Kakao 실제 연결.

### OPTIONAL STRUCTURAL PREPARATION

NAVER/Google adapter interface 또는 placeholder.

### NOT REQUIRED

NAVER 실제 API 호출.

Google 실제 API 호출.

---

## One-session provider

향후 multi-provider가 구현되더라도:

> 하나의 destination navigation session에서는 가능하면 동일 Provider 유지.

이 원칙을 architecture에 반영할 수 있으면 반영한다.

---

## Failure cases

반드시 처리:

- JavaScript Key 없음
- SDK loading 실패
- unauthorized domain
- destination coordinate 없음
- 주변 pano 없음
- timeout/network error
- Roadview load error
- marker failure

### Critical rule

Roadview 실패가 navigation session 전체를 죽이면 안 된다.

실패 시:

`Roadview unavailable`
→ 기존 지도 navigation 계속

---

## Attribution

지도 Provider가 요구하는:

- logo
- copyright
- attribution

을 임의 제거하거나 가리지 않는다.

---

## Secrets

사용:

Streamlit:
`KAKAO_JAVASCRIPT_KEY`

Next.js:
`NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY`

실제 architecture에서 어느 UI가 Roadview를 담당하는지 조사한 뒤 필요한 환경변수만 사용한다.

---

### Acceptance Criteria

- [ ] Kakao JavaScript SDK가 환경변수 기반으로 load됨.
- [ ] destination coordinate가 Roadview module로 전달됨.
- [ ] 주변 pano 검색 가능.
- [ ] pano 없음 상태 처리.
- [ ] 실제 Roadview container가 열림.
- [ ] 목적지를 식별할 수 있는 marker/overlay/UI 존재.
- [ ] 목적지 방향을 초기 view로 설정 가능한 범위까지 구현.
- [ ] mobile 화면을 고려한 container.
- [ ] Roadview 닫기/지도 복귀 가능.
- [ ] Roadview 실패 시 navigation 정상 유지.
- [ ] key가 source/git/log에 노출되지 않음.

### NOT DONE

- 빈 Roadview component만 생성
- Kakao SDK import만 성공
- API wrapper만 작성
- mock panorama
- 정적 screenshot
- hard-coded 테스트 위치 하나만 표시
- destination과 연결되지 않은 Roadview

---

# KN-20260826-06
## 기존 랜드마크 사진 기능 정리

**Priority:** P2  
**Status:** READY  
**Dependency:** KN-20260826-05

### Goal

PoC 핵심 흐름에서 Roadview로 대체 가능한 자체 랜드마크 사진 기능을 정리한다.

### Important

기존 관련 코드와 asset을 즉시 삭제하지 않는다.

먼저 dependency를 조사한다.

확인:

- route instruction에서 사진 사용 여부
- navigation state dependency
- UI dependency
- fixtures/tests
- external data
- user-upload
- production asset

### Decision

Roadview가 목적지 식별 UX를 담당할 수 있으면 PoC primary flow에서 랜드마크 사진 DB 신규 구축을 제외한다.

기존 구현은 상황에 따라:

- 유지
- feature flag off
- deprecated
- fallback
- PoC flow 제외

중 가장 안전한 방식을 선택한다.

### Fallback

Roadview 미지원 지역을 위한 자체 사진 fallback은 향후 필요할 수 있으므로 기존 유용한 기능을 이유 없이 파괴하지 않는다.

### Acceptance Criteria

- [ ] 기존 사진 기능의 실제 dependency 파악.
- [ ] PoC primary flow에 새 사진 DB 구축 dependency 없음.
- [ ] Roadview와 중복되는 불필요한 새 개발 없음.
- [ ] 기존 자산 파괴적 삭제 없음.
- [ ] 향후 fallback 가능성 유지.
- [ ] 변경 이유 기록.

---

# KN-20260826-07
## 통합 E2E · 회귀 · PoC Ready 판정

**Priority:** Integration  
**Status:** BLOCKED_BY_DEPENDENCIES

Dependencies:

- KN-01
- KN-02
- KN-03
- KN-04
- KN-05

KN-06은 필수 dependency가 아니다.

---

## Scenario A — Normal navigation

`목적지 선택`
→ `route`
→ `navigation start`
→ `위치 update`
→ `정상 진행`
→ `다음 행동 안내`
→ `목적지 접근`
→ `Roadview`
→ `도착`

Expected:

- 불필요한 deviation 없음.
- 안내 progression 정상.
- 도착 이벤트 1회.
- Roadview 실패 시에도 도착 가능.

---

## Scenario B — Wrong initial direction

`navigation start`
→ `route 반대 방향 이동`

Expected:

- 단말 Heading만으로 즉시 오판하지 않음.
- 실제 이동 trace가 반대방향이면 상태 변화.
- 필요 시 사용자 재안내.

---

## Scenario C — Route deviation

`정상 진행`
→ `route에서 실제 이탈`
→ `Drifting 또는 대응 상태`
→ `Deviated`
→ `rerouting`
→ `new route`
→ `navigation continues`

Expected:

- reroute 완료 후 active route 갱신.
- old route가 계속 UI에 남지 않음.
- reroute loop 없음.

---

## Scenario D — GNSS jitter

정상 route에서 GPS 좌표를 일시적으로 흔든다.

Expected:

- 단일 위치 jump로 즉시 Deviated 처리하지 않음.
- accuracy가 낮은 위치는 신뢰도가 낮게 취급됨.
- 실제 이동이 정상이라면 On-route 복귀.

---

## Scenario E — Multilingual

각 언어를 선택하고 navigation을 수행한다.

Expected:

- UI 언어 정상.
- 핵심 navigation event TTS 정상.
- 반복 음성 없음.

---

## Scenario F — Roadview unavailable

pano가 없는 destination 또는 failure fixture 사용.

Expected:

- 사용자에게 Roadview 미지원 상태 표시.
- navigation 자체는 정상.
- fatal exception 없음.

---

## Scenario G — Roadview destination

Roadview 지원 destination.

Expected:

- destination 근처 pano.
- 목적지 marker/식별 표시.
- 지도 navigation으로 복귀 가능.

---

# TRACE REPLAY

가능하면 repository에 존재하는 실제 위치 trace 또는 fixture를 사용한다.

새 trace를 만들 때는 목적을 명확하게 한다.

필수 관찰값:

- false deviation count
- state transition
- time/update count to deviation
- reroute count
- duplicated reroute
- arrival count
- error

기존 로그 format이 있으면 재사용한다.

---

# REGRESSION

최소 확인:

- destination search
- route generation
- current location
- navigation start/stop
- deviation
- reroute
- localization
- TTS
- Roadview
- arrival

Roadview 추가 때문에 기존 navigation이 깨지지 않아야 한다.

---

# POC READY DEFINITION

`K_NAVI_POC_READY = YES`

는 다음이 모두 충족될 때만 가능하다.

- [ ] 실제 목적지 선택 가능
- [ ] 실제 route 생성 가능
- [ ] 위치 update가 navigation에 연결
- [ ] 실제 진행상태 반영
- [ ] 방향 착오/이탈 판단 작동
- [ ] reroute 작동
- [ ] mobile navigation UI 사용 가능
- [ ] 핵심 4개 언어 화면안내 작동
- [ ] 핵심 navigation event 음성 연결
- [ ] 목적지 접근 시 Roadview 또는 명시적 fallback 작동
- [ ] arrival 작동
- [ ] fatal P0 defect 없음

일부만 충족:

`K_NAVI_POC_READY = PARTIAL`

핵심 navigation 흐름 불가:

`K_NAVI_POC_READY = NO`

---

# 5. DEVELOPMENT AUDIT MATRIX

개발 시작 전에 아래 상태표를 실제 코드 근거로 채운다.

| Component | Status | Evidence | Main file/module | Gap |
|---|---|---|---|---|
| Destination Search | TBD | | | |
| Destination Coordinate | TBD | | | |
| Route Generation | TBD | | | |
| Location Tracking | TBD | | | |
| GNSS Accuracy | TBD | | | |
| Movement Bearing | TBD | | | |
| Route Bearing | TBD | | | |
| Route Progress | TBD | | | |
| Cross-track Distance | TBD | | | |
| On-route State | TBD | | | |
| Drifting State | TBD | | | |
| Deviated State | TBD | | | |
| Reroute | TBD | | | |
| Arrival | TBD | | | |
| Mobile Navigation UI | TBD | | | |
| Localization KO | TBD | | | |
| Localization EN | TBD | | | |
| Localization JA | TBD | | | |
| Localization ZH | TBD | | | |
| TTS | TBD | | | |
| Kakao Roadview | TBD | | | |
| Landmark Photo | TBD | | | |
| Trace Replay | TBD | | | |
| E2E | TBD | | | |

Allowed status:

- `ALREADY_DONE`
- `PARTIAL`
- `BROKEN`
- `NOT_IMPLEMENTED`
- `NOT_APPLICABLE`

코드를 확인하지 않고 상태를 추측하지 않는다.

---

# 6. TASK STATUS RULES

각 TASK 상태는 다음만 사용한다.

`READY`

작업 가능.

`PINNED`

현재 agent가 수행 대상으로 고정.

`IN_PROGRESS`

실제 변경 진행 중.

`BLOCKED`

외부 조치 또는 dependency 때문에 진행 불가.

`IMPLEMENTED`

코드 구현 완료. 아직 검증 완료 아님.

`VERIFIED`

Acceptance Criteria와 필요한 검증 완료.

`DONE`

기존 repository workflow상 필요한 merge/record까지 끝난 최종 상태.

`SUPERSEDED`

다른 TASK로 대체.

---

# 7. FALSE DONE POLICY

다음 상태만으로 TASK 완료 금지.

- process exit code 0
- build success
- lint success
- unit test success
- component 생성
- API client 생성
- 화면 렌더
- mock success
- AGENT_DONE
- provider success message
- code review 통과

각 TASK의 실제 Acceptance Criteria를 만족해야 한다.

---

# 8. EXTERNAL ACTION POLICY

다음은 사용자 조치가 필요할 수 있다.

- API key 신규 발급
- 외부 콘솔 본인인증
- 결제수단 등록
- production 배포 승인
- 외부 서비스 약관 승인

다만 한 TASK가 `USER_ACTION_REQUIRED`라고 해서 다른 독립 TASK까지 중단하지 않는다.

현재 Kakao Developers:

**설정 완료**

따라서 Kakao 앱 생성/Map 활성화/도메인 등록을 다시 요청하지 않는다.

---

# 9. GIT SAFETY

기존 TASK.md의 Git 정책이 우선한다.

추가 금지:

- `git reset --hard`
- `git clean -fd`
- force push
- main history rewrite
- 사용자 미커밋 변경 삭제
- 다른 agent branch 변경
- unrelated file 대량수정
- secret commit

`git add -A`는 사용하지 않는다.

작업한 파일만 명시적으로 stage한다.

기존 사용자 변경을 발견하면 보존한다.

---

# 10. CHANGE SCOPE

기능 구현을 이유로 다음을 임의 수정하지 않는다.

- 사업계획서
- IR
- 서비스 BM
- KCT 제안내용
- 서비스의 최종 한 줄 정의
- 관광 특화 여부
- 마케팅 페이지 전체
- 관련 없는 디자인
- repository 대규모 구조

현재 K-Navi의 관광 중심 포지셔닝은 별도 사업 의사결정 사항이며 이번 개발 TASK가 임의 확정하지 않는다.

---

# 11. SBAS / KASS SCOPE

현재 구현 증거가 없는 경우 다음을 개발 완료처럼 취급하지 않는다.

- KASS 정밀 보정 완료
- SBAS 적용 완료
- m/cm급 정확도
- 기존 지도 대비 정확도 우월

이번 PoC 핵심은 우선:

- GNSS 위치 신뢰도
- 실제 이동궤적
- 경로이탈 판단
- reroute
- 사용자 안내

이다.

SBAS/KASS 신규 구현은 별도 TASK 승인이 없는 한 본 TASK 범위 밖이다.

---

# 12. NON-GOALS FOR THIS CYCLE

이번 cycle에서 기본적으로 하지 않는다.

- 자체 지도 구축
- 자체 Roadview 촬영
- 대규모 랜드마크 사진 DB 구축
- NAVER Panorama 실제 통합
- Google Street View 실제 통합
- 건물 출입구 DB 대규모 구축
- AR navigation
- computer vision 기반 출입구 자동인식
- native Android/iOS 앱 전면 재개발
- 신규 BM 개발
- KCT 전용 production deployment
- SBAS/KASS 상용 위치보정 구현

실제 P0 해결에 필수로 판명되면 신규 TASK로 근거와 함께 등록한다.

---

# 13. NEW DEFECT RULE

작업 중 결함 발견 시:

### 현재 TASK 완료에 직접 필요

현재 TASK scope에서 수정 가능.

### 독립 결함

신규 TASK 등록.

신규 TASK에는 반드시:

- reproduction
- evidence
- expected
- actual
- severity
- acceptance criteria

가 있어야 한다.

아이디어만으로 무한 TASK 생성 금지.

---

# 14. NIGHT DEVELOPMENT EXECUTION ORDER

기본 순서:

`Repository sync`
→ `TASK.md 확인`
→ `git 상태 확인`
→ `코드 감사`
→ `Audit Matrix 작성`
→ `KN-01`
→ `KN-02`
→ `KN-03`
→ `KN-04`
→ `KN-05`
→ `KN-06`
→ `KN-07`

dependency상 필요한 경우 순서를 변경할 수 있다.

예:

KN-02의 destination canonicalization이 Roadview보다 먼저 필요하면 선행한다.

독립성이 명확한 작업만 병렬화한다.

navigation core/state를 동시에 여러 branch에서 수정하는 병렬 작업은 피한다.

---

# 15. TASK COMPLETION RECORD

각 TASK 완료 시 TASK.md 또는 기존 task history 규칙에 다음을 기록한다.

## Required record

`TASK_ID =`

`STATUS =`

`BRANCH =`

`BASE_COMMIT =`

`END_COMMIT =`

`FILES_CHANGED =`

`IMPLEMENTATION =`

`TEST_COMMANDS =`

`TEST_RESULT =`

`RUNTIME_RESULT =`

`ACCEPTANCE =`

`KNOWN_LIMITATIONS =`

`NEW_TASKS =`

`PR =`

---

# 16. MORNING RESULT

최종 보고 형식:

`K_NAVI_OVERNIGHT_RESULT = SUCCESS | PARTIAL | BLOCKED`

`START_MAIN =`

`END_MAIN =`

`TASK_ATTEMPTED =`

`TASK_VERIFIED =`

`TASK_BLOCKED =`

`PR_CREATED =`

`PR_MERGED =`

## Tasks

`KN-20260826-01 =`

`KN-20260826-02 =`

`KN-20260826-03 =`

`KN-20260826-04 =`

`KN-20260826-05 =`

`KN-20260826-06 =`

`KN-20260826-07 =`

## Core capability

`DESTINATION_COORDINATE =`

`ROUTE =`

`LOCATION_TRACKING =`

`GNSS_ACCURACY =`

`MOVEMENT_BEARING =`

`ROUTE_PROGRESS =`

`CROSS_TRACK =`

`DEVIATION =`

`REROUTE =`

`NAVIGATION_UI =`

`LOCALIZATION =`

`MULTILINGUAL_TTS =`

`ROADVIEW =`

`ARRIVAL =`

## Verification

`UNIT =`

`INTEGRATION =`

`REGRESSION =`

`TRACE_REPLAY =`

`MOBILE_UI =`

`REAL_E2E =`

`INDEPENDENT_VERIFY =`

## PoC judgement

`K_NAVI_POC_READY = YES | PARTIAL | NO`

## USER_ACTION_REQUIRED

없으면:

`NONE`

있으면 사용자가 직접 수행해야 하는 항목만 번호로 작성한다.

## Remaining P0/P1

-

## PR to review

-

## Next task

-

---

# 17. CURRENT INITIAL STATUS

현재 사용자 승인 기준:

`KAKAO_DEVELOPER_APP = DONE`

`KAKAO_MAP_API = ENABLED`

`KAKAO_JS_DOMAINS = CONFIGURED`

`KAKAO_JS_KEY_TYPE = CONFIRMED`

`KAKAO_ROADVIEW_CODE = NOT_YET_VERIFIED`

`NAVIGATION_CORE_AUDIT = TODO`

`DESTINATION_COORDINATE_AUDIT = TODO`

`NAVIGATION_UI_AUDIT = TODO`

`MULTILINGUAL_TTS_AUDIT = TODO`

`LANDMARK_PHOTO_DEPENDENCY_AUDIT = TODO`

`FULL_E2E = TODO`

다음 실행은 **Kakao Developers 설정 재수행이 아니라 repository 코드 감사부터 시작한다.**

---

# 18. INHERITED REPOSITORY TASK OPERATING CONTRACT

이 절은 `origin/main`의 기존 TASK 운영계약을 보존하기 위한 것이다. 앞선 K-Navi 요구사항과 충돌하는 경우에는 이 파일의 명시적 사용자 요구사항을 우선하고, 그 외의 Git·작업 안전규칙은 계속 적용한다.

## 18.1 작업지시 출처와 분리

- repository의 정본 작업지시는 `TASK.md` 하나뿐이다.
- `CURRENT_TASK.md`, `NEW_TASK.md`, `NEXT_TASK.md`, 다른 repository의 TASK, 과거 채팅, Google Tasks를 임의로 실행하지 않는다.
- Google Tasks는 이 개발 TASK 시스템과 완전히 분리하며 조회·복사·등록·상태 동기화를 하지 않는다.

## 18.2 Git 동기화와 사용자 변경 보호

- 작업 시작·완료 전 `git fetch --all --prune` 후 최신 `origin/main`과 현재 branch를 다시 확인한다.
- `behind`면 최신 base에서 재시작하고, `ahead`면 현재 작업 branch의 PR/원격 상태를 확인하며, `diverged`면 임의 reset 없이 분리 worktree에서 충돌을 조사한다.
- dirty working tree를 발견하면 파일별 소유 범위를 확인하고 사용자·다른 agent 변경을 보존한다. 필요하면 최신 `origin/main` 기반의 독립 worktree를 사용한다.
- `git reset --hard`, `git clean -fd`, history rewrite, force push, 사용자 변경 삭제, 다른 agent branch/PR 수정, 무관 파일 대량수정, 실패 check를 무시하는 admin merge를 하지 않는다.
- `git add -A`를 사용하지 않고 작업 파일만 명시적으로 stage한다. 충돌을 무조건 `ours`/`theirs`로 해결하지 않는다.

## 18.3 TASK PINNING과 lease

TASK를 시작할 때 다음을 작업 기록에 고정한다.

```text
TASK_ID =
TASK_START_SHA =
TASK_BLOB_SHA =
WORKTREE =
WORK_BRANCH =
LEASE =
```

- 한 시점에 navigation core/state를 동시에 수정하는 active TASK는 하나만 둔다.
- 작업 중 TASK.md가 변경되어도 현재 TASK의 목적과 acceptance는 pinning snapshot을 기준으로 수행한다. 사용자의 명시적인 cancel/stop 또는 P0 안전중단 요구만 즉시 중단 사유다.
- 독립 READY TASK를 병렬 처리할 때도 TASK·lease·worktree·branch·Provider를 각각 분리하고, 동일 파일군·state contract·public API·선행 dependency는 병렬 처리하지 않는다.

## 18.4 Branch, worktree, PR, CI

- `main`에서 직접 기능 변경하지 않는다. 각 논리적 TASK는 최신 base에서 독립 branch/worktree로 수행한다.
- TASK 완료는 구현만을 뜻하지 않는다. targeted test, integration/regression, runtime 또는 trace replay, independent verification, 명시적 commit/push, PR 및 completion record가 필요하다.
- PR 전 최신 main과 충돌·변경범위·secret·금지범위를 확인한다.
- CI가 실패한 상태로 merge하지 않는다. 문서만 변경된 경우에도 repository가 정한 docs-gate가 초록인지 확인한다.
- merge 후에는 반드시 fetch하고 최신 `origin/main`, 최신 TASK.md, dependency, READY, lease를 다시 계산한다.

## 18.5 검증과 상태 기록

- build/lint/unit/component/mock 하나만 통과한 상태를 DONE으로 기록하지 않는다.
- 실제 entrypoint 연결, 사용자 flow, regression, runtime/E2E 및 independent verifier 결과를 기록한다.
- 상태는 `READY`, `PINNED`, `IN_PROGRESS`, `IMPLEMENTED`, `VERIFIED`, `DONE`, `BLOCKED`, `SUPERSEDED` 중 실제 상태에 맞게 사용한다. 외부 조치가 필요한 경우에도 독립 TASK를 계속 수행한다.
- TASK를 수정·삭제·취소할 때에는 해당 목록과 상세 정의가 모두 있는 구조라면 양쪽을 함께 갱신하고, ID 중복·목록/상세 불일치를 허용하지 않는다.
- 완료 기록에는 최소 `TASK_ID`, `STATUS`, `BASE_COMMIT`, `END_COMMIT`, `FILES_CHANGED`, `TEST_COMMANDS`, `TEST_RESULT`, `RUNTIME_RESULT`, `ACCEPTANCE`, `KNOWN_LIMITATIONS`, `PR`을 남긴다.

## 18.6 종료 조건

다음 중 하나일 때만 해당 overnight 실행을 종료한다.

- 실행 가능한 READY TASK가 모두 완료됨
- 남은 TASK가 모두 dependency wait, BLOCKED, FIELD_TEST_REQUIRED 또는 USER_ACTION_REQUIRED임
- 더 진행하면 사용자 데이터·Git 안전을 해칠 위험이 있음
- 최신 cancel/stop 지시가 확인됨

단일 TASK의 BLOCKED는 전체 종료 사유가 아니다.
