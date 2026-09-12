# K-Navi / 케이네비 — Active Development TASK

> Repository: `pds2225/walk`  
> Product name: **K-Navi / 케이네비**  
> Canonical task file: **repository root `TASK.md` only**  
> Updated: **2026-09-10**  
> Status: **ACTIVE**

---

# 0. TASK GOVERNANCE — SINGLE SOURCE OF TRUTH

이 repository의 개발 할 일·후속작업·결함·검증·완료기록은 **루트 `TASK.md` 하나만** 기준으로 관리한다.

사용자가 `TASK 읽어`, `task 봐`, `할 일 뭐야`라고 하면 **현재 작업 중인 repository의 루트 `TASK.md`를 가장 먼저 읽는다.**

다음 파일을 별도 기준 문서로 새로 만들지 않는다.

- `TASK_DATA_COLLECTION.md`
- `CURRENT_TASK.md`
- `NEW_TASK.md`
- `NEXT_TASK.md`
- `TODO.md`
- 기능별 별도 TASK 문서

새 할 일이 생기면 반드시 이 파일에 추가한다.

## Source of truth

내용 충돌 시:

1. 현재 대화에서 사용자가 명시적으로 확정한 최신 지시
2. 현재 repository 루트 `TASK.md`
3. 현재 repository의 실제 코드·테스트·배포 상태
4. 최신 현장 테스트/재현 결과
5. 최신 프로젝트 자료
6. 과거 사업계획서·발표자료
7. 추론

과거 명칭 `K-Walk`, `케이워크`, `도보네비`, `K-네비`가 코드·과거 문서에 남아 있을 수 있으나 신규 사용자 노출 명칭은 **K-Navi / 케이네비**로 통일한다.

서비스명 변경만을 이유로 코드 identifier를 대규모 rename하지 않는다.

## 개발 원칙

`AUDIT → REUSE → FIX → EXTEND → NEW → TEST`

- 기존 구현을 먼저 조사한다.
- 같은 기능을 다른 이름으로 중복 구현하지 않는다.
- 기존 정상 기능을 이유 없이 제거하지 않는다.
- `1 기능 = 1 TASK = 1 검증`을 기본으로 한다.
- build/unit test 성공만으로 DONE 처리하지 않는다.
- 실제 사용자 흐름과 Acceptance Criteria를 기준으로 완료 판단한다.

---

# 1. CURRENT PRODUCT GOAL

K-Navi를 실제 사용자가 휴대폰을 들고 이동하면서 테스트할 수 있는 도보 내비게이션 PoC 수준으로 유지·고도화하고, 동시에 그 이동과 관광행동을 익명 Journey 데이터로 축적한다.

핵심 사용자 흐름:

`장소 탐색`
→ `목적지 선택`
→ `목적지 좌표 확정`
→ `길안내 시작`
→ `현재 위치 수신`
→ `위치 신뢰도 판단`
→ `실제 이동방향 판단`
→ `경로 진행`
→ `경로 이탈 판정`
→ `재탐색/재안내`
→ `목적지 접근`
→ `Roadview 보조 안내`
→ `도착`
→ `체류`
→ `다음 장소 선택`

동시에 같은 익명 `session_id`로:

`탐색 → 선택 → 이동 → 이탈 → 재안내 → 접근 → 도착 → 체류 → 콘텐츠 조회 → 다음 이동`

을 시간순으로 재구성할 수 있어야 한다.

---

# 2. CURRENT VERIFIED / RECORDED STATUS

아래는 기존 TASK completion record와 사용자 보고를 기준으로 정리한 현재 상태다. 과거 `CURRENT INITIAL STATUS`의 `TODO` 값은 더 이상 최신 상태로 사용하지 않는다.

| Capability / TASK | 현재 상태 | 근거 |
|---|---|---|
| `KN-20260826-01` Navigation 전체 흐름 | **IMPLEMENTED** | PR #110 merged |
| `KN-20260826-02` 경로·위치·이탈·재탐색 | **IMPLEMENTED** | PR #111/#112 merged |
| `KN-20260826-03` 실제 보행 UI/방향 분리 | **IMPLEMENTED** | PR #113 merged |
| `KN-20260826-04` 4개 언어 + TTS | **IMPLEMENTED** | PR #114 merged |
| `KN-20260826-05` Kakao Roadview | **IMPLEMENTED** | PR #115 merged |
| `KN-20260826-06` 랜드마크 사진 의존성 정리 | **IMPLEMENTED** | PR #116 |
| `KN-20260826-07` 통합 E2E | **FIELD_VERIFIED** | 2026-08-30 사용자 실외 테스트 종합 보고 |
| Pre-field hardening | **VERIFIED** | PR #120 merged |
| `K-NAVI-RV-01` Kakao 운영설정 | **DONE — USER_REPORTED** | 2026-08-30 배포 도메인 등록 보고 |
| `K-NAVI-RV-02` Roadview follow-up | **IMPLEMENTED** | PR #124 merged |
| `K-NAVI-TRANSIT-01` 대중교통 딥링크 + 도보 TMAP 유지 | **DONE** | PR #129 merged |
| `TASK-001` 지하철 승·하차 최적 출입구 선택 | **IMPLEMENTED — FIELD_TEST_REQUIRED** | PR #132 merged |

## Current status normalization

`KAKAO_DEVELOPER_APP = DONE`

`KAKAO_MAP_API = ENABLED`

`KAKAO_JS_DOMAINS = CONFIGURED (USER_REPORTED)`

`KAKAO_ROADVIEW_CODE = IMPLEMENTED`

`NAVIGATION_CORE = IMPLEMENTED`

`DESTINATION_COORDINATE_FLOW = IMPLEMENTED`

`NAVIGATION_UI = IMPLEMENTED`

`MULTILINGUAL_TTS = IMPLEMENTED`

`LANDMARK_PHOTO_DEPENDENCY = AUDITED / PRIMARY FLOW EXCLUDED`

`FULL_NAVIGATION_E2E = FIELD_VERIFIED (USER_REPORTED, 2026-08-30)`

`SUBWAY_EXIT_AUTO_SELECTION = IMPLEMENTED / FIELD_TEST_REQUIRED`

`DATA_COLLECTION_PIPELINE = NOT_YET_AUDITED`

`JOURNEY_RECONSTRUCTION = NOT_YET_IMPLEMENTED`

## Important limitation

`KN-20260826-07`의 FIELD_VERIFIED는 사용자의 종합 보고를 근거로 한다. Scenario A~G 개별 결과가 모두 항목화된 것은 아니므로, 향후 재현되는 결함은 새 TASK로 등록한다.

---

# 3. CURRENT TECHNICAL PRINCIPLES

## 3.1 Navigation 판단

단일 GPS 좌표나 단말 Heading 하나만으로 경로이탈을 판단하지 않는다.

사용 신호:

- GNSS Accuracy
- 위치 history
- Movement Bearing
- Route Bearing
- Route Progress
- Cross-track Distance
- 이동거리
- 시간 연속성
- route geometry
- navigation state

상태 개념:

`On-route → Drifting → Deviated`

- `Drifting`: 실제 이탈인지 불확실한 중간 상태. 사용자 음성 경고를 즉시 발생시키지 않는다.
- `Deviated`: 복수 신호가 실제 이탈을 지지할 때 확정.

Heading은 보조 신호로만 사용한다.

## 3.2 방향값 분리

- **Map Bearing**: DeviceOrientation 기반, 사용자가 휴대폰으로 보는 방향
- **Movement Bearing**: 실제 GNSS 이동궤적 기반 이동방향
- **Route Bearing**: active route의 진행방향

세 값을 같은 값처럼 사용하지 않는다.

## 3.3 Roadview

PoC primary provider는 **Kakao Roadview**.

장기 구조는:

`Kakao → NAVER → Google`

을 고려하되, NAVER/Google 실제 연동은 현재 필수 범위가 아니다.

별도 대규모 랜드마크 사진 DB를 신규 구축하지 않는다.

Roadview 실패 시 navigation은 계속되어야 한다.

## 3.4 SBAS / KASS

구현·검증 증거 없이 다음을 완료처럼 기록하지 않는다.

- KASS 정밀 보정 완료
- SBAS 적용 완료
- m/cm급 정확도
- 기존 지도 대비 정확도 우월

현재 핵심은 GNSS 위치 신뢰도, 실제 이동궤적, 경로이탈 판단, reroute, 사용자 안내다.

---

# 4. CURRENT ACTIVE QUEUE

## P0 — 현장검증 잔여

### [ ] TASK-001-FIELD — 지하철 승·하차 최적 출입구 실기기 현장검증

`SOURCE = TASK-001 completion record`

`STATUS = FIELD_TEST_REQUIRED`

**Goal**

실제 지하철역 1곳 이상에서 승차·하차 각각 선택된 출입구가 실제 보행 관점에서 적절한지 확인한다.

**Acceptance**

- [ ] 실제 역에서 승차 출입구 선택 확인
- [ ] 실제 역에서 하차 출구 선택 확인
- [ ] 출구번호 UI 확인
- [ ] 후보 없음 시 기존 역좌표 fallback 확인
- [ ] 기존 deviation/reroute/TTS 흐름 회귀 없음 확인

---

# 5. DATA COLLECTION — NEW ACTIVE TASKS

## 공통 아키텍처

사용자 행동 이벤트와 GNSS 이동 샘플을 별도 저장하되 **동일한 익명 `session_id`로 연결**한다.

### Session

세션 시작 시 1회 생성/확정:

- `session_id`
- `session_started_at`
- `language`

`session_id`는 매 이벤트마다 새로 생성하지 않는다. 단, 각 event/movement row는 동일 세션을 연결하기 위해 같은 `session_id`를 참조한다.

### Event common fields

- `session_id`
- `event_timestamp`
- `event_type`
- `poi_id` nullable
- `route_id` nullable
- `payload_json` nullable

### Movement sample

- `session_id`
- `sample_timestamp`
- `route_id`
- `latitude`
- `longitude`
- `gnss_accuracy`
- `speed`
- `movement_bearing`
- `route_progress`
- `cross_track_distance`
- `navigation_state`

### Target event set

P0:

- `route_start`
- `route_deviation`
- `reroute`
- `poi_approach`
- `arrival`
- `dwell`

P1:

- `place_view`
- `place_select`
- `menu_view`
- `next_place_select`

P2:

- `coupon_click`
- `coupon_use`

구매 여부를 GNSS만으로 추정하지 않는다. 실제 소비전환은 쿠폰/주문/결제/POS 등 별도 데이터가 있어야 한다.

---

## [ ] TASK-002 — 데이터 수집 capability audit

`PRIORITY = P0`

`STATUS = READY`

**Goal**

현재 repository에서 이미 생성·저장 가능한 데이터와 신규 Gap을 먼저 확정한다.

**Audit 대상**

- session/client state
- geolocation / watchPosition
- GNSS accuracy
- speed
- movement bearing
- route progress
- cross-track distance
- navigation state
- deviation/reroute lifecycle
- arrival lifecycle
- POI/destination model
- place/menu UI
- backend/API
- DB/storage
- existing analytics/logging
- 위치정보 동의/권한 UI

**Acceptance**

- [ ] 각 항목을 `ALREADY_DONE / PARTIAL / BROKEN / NOT_IMPLEMENTED / NOT_APPLICABLE`로 분류
- [ ] 재사용할 파일/module 근거 기록
- [ ] 새 DB 도입이 필요한지 여부 판정
- [ ] 기존 기능 중 재작성 금지 대상 명시
- [ ] 별도 Audit 문서 생성 금지 — 결과는 이 `TASK.md` completion record에 기록

---

## [ ] TASK-003 — 익명 Session foundation

`PRIORITY = P0`

`STATUS = READY`

`DEPENDS = TASK-002`

**Goal**

익명 session을 1회 생성하고 같은 관광 Journey 전체에서 유지한다.

**Acceptance**

- [ ] session 시작 시 `session_id` 1회 생성
- [ ] rerender로 session_id 변경되지 않음
- [ ] 같은 Journey 내 다음 장소 이동까지 동일 session 유지
- [ ] language / session_started_at 연결
- [ ] 실명·전화번호·이메일을 session key로 사용하지 않음
- [ ] 테스트로 동일 session 유지 검증

---

## [ ] TASK-004 — Event Tracker + `event_log`

`PRIORITY = P0`

`STATUS = READY`

`DEPENDS = TASK-003`

**Goal**

사용자 행동과 navigation 상태 이벤트를 공통 형식으로 서버에 저장한다.

권장 시작 구조:

`event_log`

```text
id
session_id
event_timestamp
event_type
poi_id
route_id
payload_json
created_at
```

기존 DB/ORM이 있으면 재사용한다. Audit 전에 Supabase/Prisma/Drizzle 등 새 스택을 임의 확정하지 않는다.

**Acceptance**

- [ ] 공통 `trackEvent()` 또는 동등한 capability 존재
- [ ] timestamp/type 자동 기록
- [ ] poi_id/route_id/payload 선택적 저장
- [ ] 중복 이벤트 억제
- [ ] 저장 실패가 navigation fatal error로 이어지지 않음
- [ ] 실제 서버 저장 검증
- [ ] 직접 식별정보와 raw movement를 결합하지 않음

---

## [ ] TASK-005 — GNSS `movement_log`

`PRIORITY = P0`

`STATUS = READY`

`DEPENDS = TASK-002, TASK-003`

**Goal**

navigation 중 실제 이동데이터와 K-Navi 분석값을 시계열로 저장한다.

권장 구조:

```text
id
session_id
sample_timestamp
route_id
latitude
longitude
gnss_accuracy
speed
movement_bearing
route_progress
cross_track_distance
navigation_state
created_at
```

**Acceptance**

- [ ] 기존 geolocation/navigation 계산값 재사용
- [ ] Device Heading을 Movement Bearing으로 저장하지 않음
- [ ] navigation 활성 구간에서만 합리적 cadence로 저장
- [ ] sample timestamp + route_id 연결
- [ ] 동일 값 무한 중복 저장 방지
- [ ] UI/navigation 성능저하 여부 검증
- [ ] 실제 서버 저장 확인

Sampling 주기나 거리 기준은 PoC에서 조정 가능한 설정값으로 둔다. 근거 없이 확정 성능값처럼 고정하지 않는다.

---

## [ ] TASK-006 — `route_deviation` / `reroute` 이벤트 연결

`PRIORITY = P0`

`STATUS = READY`

`DEPENDS = TASK-004, TASK-005`

**Goal**

기존 navigation state machine을 그대로 활용해 경로이탈·재안내 이벤트를 자동 생성한다.

**Acceptance**

- [ ] `Deviated` 확정 시 `route_deviation` 1회 기록
- [ ] `Drifting`에서는 `route_deviation` 생성 금지
- [ ] 실제 reroute 실행 시 `reroute` 기록
- [ ] duplicate reroute 이벤트 억제
- [ ] deviation 확정부터 정상복귀/새 경로 진입까지 recovery time 산출 가능
- [ ] replay test로 event sequence 검증

---

## [ ] TASK-007 — POI 접근·도착·체류 자동 판정

`PRIORITY = P0`

`STATUS = READY`

`DEPENDS = TASK-004, TASK-005`

**Goal**

클릭이 아니라 실제 공간행동인 `poi_approach → arrival → dwell`을 측정한다.

### `poi_approach`

목적지 좌표와 현재 위치 거리로 자동 판정.

초기 예시 20m는 **PoC 조정값 / 확정 성능값 아님**.

### `arrival`

단순 거리 1개로 판정하지 않는다.

최소 고려:

- destination distance
- route progress
- GNSS accuracy
- repeated samples / temporal stability
- navigation state

### `dwell`

POI 반경 내 연속 체류시간 계산.

예시 3분 역시 **PoC 조정값 / 확정값 아님**.

**Acceptance**

- [ ] `distance_to_poi` 계산
- [ ] approach threshold configurable
- [ ] jitter로 approach 이벤트 반복 폭증 없음
- [ ] `NEAR_DESTINATION`과 실제 `arrival` 분리
- [ ] arrival 1회만 기록
- [ ] 조기 arrival false positive 테스트
- [ ] dwell_seconds 계산
- [ ] GPS jitter로 체류가 과도하게 끊기지 않음
- [ ] visibility/background 변화 처리방식 기록

---

## [ ] TASK-008 — 관광행동 이벤트 연결

`PRIORITY = P1`

`STATUS = READY`

`DEPENDS = TASK-004`

**Goal**

사용자가 무엇을 보고, 무엇을 선택하고, 다음 어디로 가려 했는지 실제 이동데이터와 연결한다.

필수:

- `place_view`
- `place_select`
- `menu_view`
- `next_place_select`

**Acceptance**

- [ ] 기존 UI에 tracker를 최소 침습으로 연결
- [ ] 관련 poi/content ID 연결
- [ ] rerender로 `place_view` 중복 폭증 방지
- [ ] `next_place_select` 후 새 `route_start`와 동일 session으로 연결
- [ ] 언어 변경이 session을 끊지 않음

---

## [ ] TASK-009 — Journey reconstruction + export

`PRIORITY = P1`

`STATUS = READY`

`DEPENDS = TASK-003 ~ TASK-008`

**Goal**

한 익명 사용자의 Journey를 시간순으로 재구성한다.

목표 sequence:

`place_view`
→ `place_select`
→ `route_start`
→ `movement`
→ `route_deviation`
→ `reroute`
→ `poi_approach`
→ `arrival`
→ `dwell`
→ `menu_view`
→ `next_place_select`
→ `new route_start`

**Acceptance**

- [ ] session_id 기준 event + movement 조회
- [ ] timestamp 순 정렬
- [ ] route 변경 구분
- [ ] 주요 이벤트와 이동구간 연결
- [ ] 최소 CSV 또는 JSON export 제공
- [ ] 대형 BI dashboard는 이번 TASK에서 만들지 않음
- [ ] 실제 sample Journey 재구성 검증

---

## [ ] TASK-010 — Data-enabled PoC E2E

`PRIORITY = P1 / Integration`

`STATUS = READY`

`DEPENDS = TASK-003 ~ TASK-009`

**Goal**

실제 한 사용자 Journey가 처음부터 끝까지 저장·재구성되는지 종단 검증한다.

필수 시나리오:

`session_start`
→ `place_view`
→ `place_select`
→ `route_start`
→ `movement samples`
→ `route_deviation`
→ `reroute`
→ `poi_approach`
→ `arrival`
→ `dwell`
→ `menu_view`
→ `next_place_select`
→ `new route_start`

**Acceptance**

- [ ] session_id 중간 변경 없음
- [ ] GNSS raw sample 저장
- [ ] Movement Bearing / Route Progress / Cross-track / Navigation State 저장
- [ ] false route_deviation 억제
- [ ] arrival 1회
- [ ] dwell 계산
- [ ] 다음 장소 이동 연결
- [ ] Journey 완전 재구성
- [ ] 데이터 저장 실패 시 navigation 계속
- [ ] 직접 식별정보와 raw movement 미결합
- [ ] 기존 navigation 실사용 흐름 회귀 없음

---

## [ ] TASK-011 — 쿠폰/소비전환 event hook

`PRIORITY = P2`

`STATUS = READY — CONDITIONAL`

**Goal**

향후 `coupon_click`, `coupon_use`를 방문 Journey와 연결할 수 있도록 실제 쿠폰 기능이 존재할 때만 hook을 추가한다.

**Acceptance**

- [ ] 실제 쿠폰 UI/기능이 존재할 때만 이벤트 연결
- [ ] 존재하지 않으면 이번 cycle에서 구현하지 않아도 됨
- [ ] 구매 발생을 GNSS 위치만으로 추정하지 않음
- [ ] POS/결제 연동은 별도 후속 TASK

---

# 6. ACTIVE TASK EXECUTION ORDER

기본 순서:

`Repository sync`
→ `TASK.md 확인`
→ `git status`
→ `TASK-002 Audit`
→ `TASK-003 Session`
→ `TASK-004 Event Log`
→ `TASK-005 Movement Log`
→ `TASK-006 Deviation/Reroute Event`
→ `TASK-007 Approach/Arrival/Dwell`
→ `TASK-008 Tourism Events`
→ `TASK-009 Journey Reconstruction`
→ `TASK-010 Data E2E`
→ 필요 시 `TASK-011`

`TASK-001-FIELD`는 실제 현장 테스트가 가능한 시점에 수행한다.

Audit에서 이미 구현된 capability는 새로 만들지 않고 검증 후 넘어간다.

---

# 7. DATA PRIVACY / COLLECTION BOUNDARY

- 이동데이터는 **익명 session 단위**를 기본으로 한다.
- raw 위치는 navigation 또는 사용자가 명시적으로 동의한 수집구간에서만 수집한다.
- navigation 종료, arrival 완료, 명시적 stop, timeout 등에서 tracking을 종료한다.
- 실명·전화번호·이메일 등 직접 식별정보를 raw movement row와 직접 결합하지 않는다.
- 위치권한 거부 시 navigation이 가능한 범위에서 명확한 fallback을 제공한다.
- 개인별 장기 이동이력 계정화는 현재 cycle의 범위가 아니다.

---

# 8. DEVELOPMENT AUDIT MATRIX

TASK-002 수행 시 실제 코드 근거로 갱신한다.

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
| On-route / Drifting / Deviated | TBD | | | |
| Reroute | TBD | | | |
| Arrival | TBD | | | |
| Kakao Roadview | TBD | | | |
| Localization / TTS | TBD | | | |
| Session Manager | TBD | | | |
| Event Tracker | TBD | | | |
| Event Log Storage | TBD | | | |
| Movement Log Storage | TBD | | | |
| POI Approach | TBD | | | |
| Dwell | TBD | | | |
| Tourism Behavior Events | TBD | | | |
| Journey Reconstruction | TBD | | | |
| Export | TBD | | | |
| Data E2E | TBD | | | |

Allowed audit status:

- `ALREADY_DONE`
- `PARTIAL`
- `BROKEN`
- `NOT_IMPLEMENTED`
- `NOT_APPLICABLE`
- `BLOCKED_EXTERNAL`

코드를 확인하지 않고 추측해서 채우지 않는다.

---

# 9. FALSE DONE POLICY

다음만으로 완료 처리하지 않는다.

- process exit code 0
- build success
- lint success
- unit test success
- component 생성
- API route 생성
- DB table 생성
- tracker 함수 생성
- mock data 저장
- 화면 렌더
- AGENT_DONE

실제 Acceptance Criteria + regression + 필요한 runtime/E2E + completion record가 기준이다.

---

# 10. GIT / WORK SAFETY

기존 repository 운영계약을 유지한다.

- 작업 시작 전 최신 `origin/main` 확인
- 사용자/다른 agent의 dirty change 보존
- 기능 변경은 독립 branch/worktree 사용
- `git reset --hard` 금지
- `git clean -fd` 금지
- force push 금지
- main history rewrite 금지
- 사용자 변경 삭제 금지
- unrelated 파일 대량수정 금지
- secret commit 금지
- `git add -A` 금지
- 작업 파일만 명시적으로 stage
- CI 실패 상태로 merge 금지
- 문서 변경도 repository의 `docs-gate`를 통과해야 함

TASK pinning 시 최소:

```text
TASK_ID =
TASK_START_SHA =
TASK_BLOB_SHA =
WORKTREE =
WORK_BRANCH =
LEASE =
```

---

# 11. NON-GOALS THIS CYCLE

- 자체 지도 구축
- 자체 Roadview 촬영
- 대규모 랜드마크 사진 DB 신규 구축
- NAVER Panorama 실제 연동
- Google Street View 실제 연동
- 대규모 출입구 DB 구축
- AR navigation
- computer vision 출입구 자동인식
- native Android/iOS 전면 재개발
- SBAS/KASS 상용 정밀보정 구현
- 대형 BI dashboard
- 개인 계정 기반 장기 이동이력
- POS/결제 연동
- 광고/CPA 과금

필요성이 실제 PoC에서 확인되면 이 `TASK.md`에 신규 TASK로 등록한다.

---

# 12. TASK STATUS RULES

사용 상태:

- `READY`
- `PINNED`
- `IN_PROGRESS`
- `BLOCKED`
- `IMPLEMENTED`
- `VERIFIED`
- `DONE`
- `SUPERSEDED`
- `FIELD_TEST_REQUIRED` — 구현과 현장 실기기 검증을 분리 표시할 때 보조 표기

---

# 13. TASK COMPLETION RECORD TEMPLATE

각 TASK 완료 시 이 `TASK.md`에 기록한다.

```text
TASK_ID =
STATUS =
BRANCH =
BASE_COMMIT =
END_COMMIT =
FILES_CHANGED =
AUDIT_RESULT =
IMPLEMENTATION =
TEST_COMMANDS =
TEST_RESULT =
RUNTIME_RESULT =
MOBILE_RESULT =
DATA_RESULT =
ACCEPTANCE =
KNOWN_LIMITATIONS =
NEW_TASKS =
INDEPENDENT_VERIFY =
PR =
```

---

# 14. CURRENT POC READY DEFINITION

기존 navigation PoC는 사용자 종합 field-test 보고 기준으로 `K_NAVI_POC_READY = YES`가 기록되어 있다.

그러나 **데이터 수집형 PoC**는 별도로 아래가 충족되어야 한다.

`K_NAVI_DATA_POC_READY = YES`

조건:

- [ ] 익명 session 생성/유지
- [ ] `event_log` 실제 저장
- [ ] `movement_log` 실제 저장
- [ ] `route_start`
- [ ] `route_deviation`
- [ ] `reroute`
- [ ] `poi_approach`
- [ ] `arrival`
- [ ] `dwell`
- [ ] `place_view`
- [ ] `place_select`
- [ ] `menu_view`
- [ ] `next_place_select`
- [ ] 한 session Journey 재구성
- [ ] CSV 또는 JSON export
- [ ] 기존 navigation flow 회귀 없음
- [ ] 데이터 저장 실패가 navigation을 중단하지 않음
- [ ] 직접 식별정보와 raw movement 미결합

일부만 충족:

`K_NAVI_DATA_POC_READY = PARTIAL`

핵심 데이터 flow 불가:

`K_NAVI_DATA_POC_READY = NO`

---

# 15. CURRENT TASK SUMMARY

## Completed / implemented

- `KN-20260826-01 ~ 06`
- `KN-20260826-07` — FIELD_VERIFIED, user-reported
- `K-NAVI-RV-01`
- `K-NAVI-RV-02`
- `K-NAVI-TRANSIT-01`
- `TASK-001` — code implemented, field verification pending

## Active

1. `TASK-001-FIELD` — 지하철 출입구 실기기 현장검증
2. `TASK-002` — Data capability audit
3. `TASK-003` — Anonymous session
4. `TASK-004` — Event log
5. `TASK-005` — Movement log
6. `TASK-006` — Deviation/Reroute events
7. `TASK-007` — Approach/Arrival/Dwell
8. `TASK-008` — Tourism behavior events
9. `TASK-009` — Journey reconstruction/export
10. `TASK-010` — Data-enabled E2E
11. `TASK-011` — Coupon hooks, conditional P2

## Next auto task

**`TASK-002 — 데이터 수집 capability audit`**

별도 TASK 문서를 만들지 말고 이 파일에 Audit 결과와 후속 상태를 계속 기록한다.

---

# 16. HISTORICAL NOTE

2026-08-26~2026-09-09의 상세 구현·테스트·PR 기록은 Git commit/PR history에 남아 있다. 이 파일은 **현재 실행할 할 일과 현재 상태를 빠르게 읽을 수 있는 active source of truth**로 유지한다.

과거 상세 기록이 필요하면 해당 PR/commit을 조회한다. 완료된 과거 TASK의 장문 로그를 다시 이 파일에 중복 누적하지 않는다.
