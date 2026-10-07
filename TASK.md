# K-Navi / 케이네비 — Active Development TASK

> Repository: `pds2225/walk`  
> Product name: **K-Navi / 케이네비**  
> Canonical task SSOT: **`origin/main:TASK.md` only**  
> Updated: **2026-09-23**  
> Status: **ACTIVE**


# GLOBAL DEFAULT GUARDRAILS — 모든 TASK 기본 안전장치

> 아래 규칙은 이 저장소의 **모든 현재/미래 TASK와 실행 프롬프트에 자동 적용**한다.
> 새 TASK마다 같은 문구를 반복 복사할 필요는 없다.
> TASK별로 더 강한 안전조건을 추가할 수는 있지만, 사용자의 명시적 승인 없이 아래 기본값을 약화하지 않는다.

## 1) 자율수행 / 사용자 개입 최소화
- 조사 → 분석 → 구현 → 테스트 → 회귀검증 → 문서화 → commit → push → PR → Checks 확인 → 허용된 자동병합까지 안전하게 가능한 범위는 AI가 연속 수행한다.
- 중간 진행상황 확인만을 이유로 사용자를 호출하지 않는다.
- 코드·테스트·데이터·기존 아키텍처 근거로 안전하게 결정 가능한 선택은 AI가 스스로 결정한다.
- 사용자 판단/입력이 정말 필요한 항목만 `HUMAN_BATCH`에 누적해 가능한 한 한 번에 요청한다.
- 개발자가 스스로 해결할 수 있는 Git 상태, 테스트 실패, 일반 오류는 HUMAN_BATCH에 넣지 않는다.

## 2) 즉시 사용자 승인이 필요한 예외
- 데이터 손실 위험
- Secret/보안/개인정보 문제
- 실제 비용 발생
- 외부 시스템의 되돌리기 어려운 운영 변경
- 제품/사업정책을 바꾸는 결정
- 법적·계약상 명시적 승인 필요 작업

## 3) 중단/재개 안전성
- 장시간·다단계 TASK는 단계별 CHECKPOINT를 남긴다.
- CHECKPOINT에는 최소 TASK_ID, 기준 base/code SHA, 완료 단계, 다음 단계, 핵심 산출물 위치를 재구성할 수 있는 정보가 있어야 한다.
- 세션 만료, 컨텍스트 손실, PC 종료 후에도 최신 remote 상태와 TASK.md만 읽고 안전하게 재개 가능해야 한다.
- 가능한 경우 의미 있는 단계 완료마다 이번 TASK 관련 파일만 commit/push한다.

## 4) 재실행 / 중복 방지
- 반복 실행 가능성이 있는 작업은 가능한 한 idempotent하게 구현한다.
- 동일 입력을 다시 실행해 데이터 중복 추가, 지표 이중계산, 규칙 중복적용, 동일 파일 중복생성이 발생하지 않게 한다.
- 필요한 경우 input snapshot/fingerprint, code/config SHA, run_id를 기록한다.
- 이미 완료·검증된 단계를 발견하면 재사용하고 불필요하게 처음부터 다시 하지 않는다.

## 5) 무한루프 / 과도한 자동개발 방지
- retry/agent loop/자동개선은 반드시 종료조건을 둔다.
- TASK에 수치가 없으면 합리적인 bounded retry/cycle을 정해 기록한다.
- 동일 실패를 근거 없이 무한 반복하지 않는다.
- 한 후보/한 실험의 실패 때문에 이미 검증된 전체 checkpoint를 되돌리지 않는다. 가능한 경우 실패 단위만 폐기한다.

## 6) Git / 사용자 데이터 보존
- 사용자 변경 삭제 금지.
- `git reset --hard`, force push, `git clean -fd`, 무단 stash/drop 금지.
- `git add -A` 금지. 이번 TASK에 필요한 파일만 stage한다.
- 위험한 main 직접수정보다 작업 브랜치 + PR을 기본으로 한다.
- 원격 main이 작업 중 바뀌면 최신 상태를 확인하고 안전하게 통합한 뒤 필요한 검증을 다시 한다.
- 충돌을 무조건 ours/theirs로 해결하지 않는다.
- 기존 사용자 데이터·정답 데이터·운영 설정은 명시적 근거 없이 덮어쓰거나 삭제하지 않는다.

## 7) Secret / 외부효과 / 비용
- Secret, 토큰, 비밀번호, 개인정보를 출력·커밋하지 않는다.
- 실제 이메일 발송, 삭제, 결제, 유료 API, production 데이터 변경 등 외부효과가 있는 작업은 명시적으로 허용되지 않은 한 dry-run/preview/staging을 우선한다.
- 비용이 발생하거나 되돌리기 어려운 외부 작업은 사용자 승인 전에 실행하지 않는다.

## 8) 검증 / DONE 기준
- 코드 작성, 테스트 PASS, build PASS, PR 생성만으로 DONE 처리하지 않는다.
- 사용자 요청이 실제로 해결됐는지 USER_E2E 또는 그에 준하는 실제 경로로 확인한다.
- 정상경로, 주요 경계값, 오류상태, 관련 회귀를 검증한다.
- 데이터/평가/모델 성능 TASK는 가능한 범위에서 tuning 데이터와 최종 평가 데이터를 분리해 leakage를 방지한다.
- 수치 개선은 동일 기준 데이터/동일 조건에서 변경 전후를 비교한다.
- 실패·목표 미달 수치를 숨기거나 유리한 표본만 골라 보고하지 않는다.

## 9) 부분 장애
- CI 실패, 외부 사이트 일시 오류, 일부 데이터 미접근 등 부분 장애가 발생해도 안전하게 가능한 독립 작업은 계속한다.
- 이미 검증된 산출물과 checkpoint를 보존한다.
- 정말 사용자 입력이 필요한 항목만 `HUMAN_BATCH` 또는 `BLOCKED_INPUT`으로 분리한다.
- 한 의존성의 실패 때문에 관련 없는 독립 작업까지 전부 중단하지 않는다.

## 10) 새 TASK 생성 규칙
- 모든 새 TASK/실행 프롬프트는 이 전역 안전장치를 자동 상속한다.
- TASK 특성상 필요한 추가 안전장치(checkpoint/resume, idempotency, bounded retry, rollback, HUMAN_BATCH, dry-run, reproducibility)를 DETAILS/VERIFY/DONE에 필요한 만큼만 보강한다.
- 단순 문서 수정처럼 특정 안전장치가 의미 없으면 억지 구현하지 않고 N/A로 판단한다.
- 전역 안전장치를 약화하거나 예외 처리하려면 사용자의 명시적 요청과 이유를 TASK에 남긴다.

---

# 0. TASK GOVERNANCE — SINGLE SOURCE OF TRUTH

이 repository의 개발 할 일·후속작업·결함·검증·완료기록은 **`origin/main:TASK.md` 하나만 공식 SSOT**로 관리한다. 작업 브랜치의 TASK 변경은 main에 머지된 뒤 공식 상태가 된다.

세션/자동개발 시작 시 `git fetch origin --prune` 후 **`origin/main:TASK.md`를 가장 먼저 읽는다.** 사용자의 새 요청은 이 파일에 등록한 뒤 실행한다.

Dashboard·RESUME·HANDOFF·실행로그·파생 큐·외부 Drive/문서 미러는 표시/체크포인트/실행용일 뿐 TASK 상태·우선순위를 만들거나 덮어쓸 수 없다.

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

1. 사용자의 최신 명시적 요청을 `TASK.md`에 등록한 최신 상태
2. `origin/main:TASK.md`
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

## 2026-09-23 SSOT 통일 완료

- 사용자 요청: `v_up walk mail marketgate도 TASK.md 단일 SSOT로 통일해`
- 공식 작업 SSOT: `origin/main:TASK.md` 하나
- 시작 순서: `git fetch origin --prune` → TASK 확인 → 작업
- 작업 브랜치의 TASK 변경은 main 머지 후 공식화
- Dashboard/RESUME/HANDOFF/실행로그/외부 미러는 파생정보이며 TASK를 덮어쓰지 않음
- 별도 TASK 파일 생성 금지

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

### [~] KN-KTRIP-MARKET-20261007 — 케이트립 시장 지도 첫 화면·개별 핀·다국어 수정

`STATUS = IN_PROGRESS` · `REQUEST_SOLVED = NO`

`TASK_START_SHA = 20fe13906ca7be190c9d49126a24223438b492bc`

`TASK_BLOB_SHA = 8146118ba63fd9e80465a770de4fa4887aeb9322`

`WORK_BRANCH = feat/ktrip-market-map-home-20261007`

- **MUST:** `/worldcup-market` 첫 화면에 NAVER 전체 시장 지도와 45개 점포 핀, 데이터 기반 업종 필터, 하단 카드/목록, 상세 및 지도 복귀, `?store=` 상세 딥링크를 제공한다. 키가 없으면 목록으로 대체한다.
- **MUST:** 공식 안내도와 블로그 매장 번호를 조사하고 출처를 기록한다. 매칭 불가 점포는 원래 건물 좌표와 근거를 보존한 별도 표시 좌표에 ID 기준 고정 배치하며, 임의 배치에 approximate 및 대략 위치 안내를 표시한다.
- **MUST:** 지도/상세/주변·360의 JA 문제를 재현·수정하고 EN/ZH도 검증한다. UI를 번역하되 점포 사실은 기존 공식 블로그 자료를 보존한다.
- **MUST:** 서비스 표시명은 KO 케이트립, EN/JA/ZH K-Trip, 시장명은 요청한 4개 언어로 통일한다. 공식 색을 확인하면 적용하고, 확인할 수 없으면 기존 색을 유지한다.
- **KEEP:** 기존 레이아웃·톤, `/` 동작, 점포 사실/원본 좌표/근거, 코드 식별자·패키지명·Vercel 프로젝트명·도메인, 기존 stash/worktree/미추적 폴더를 유지한다.
- **REMOVE:** 간단한 기능 플래그로 시장 화면의 길찾기 버튼만 기본 숨김 처리한다. 기능 코드는 유지한다.
- **FORBIDDEN:** `.env` 계열 수정/출력, 키 커밋, main 병합, force push, 기존 사용자 작업 변경, 관련 없는 TASK 실행.
- **VERIFY:** npm ci, lint, next:build, test:run, typecheck 및 web typecheck; 지도·배치·언어 회귀 테스트; 실제 Chrome 390×844 KO/JA 흐름과 지도/필터/상세/JA 스크린샷.
- **DONE:** 검증 근거와 남은 한계를 아래에 기록하고 작업 브랜치 push 후 main 대상 draft PR을 생성한다. 실제 NAVER 검증이 불가능하면 완료로 과장하지 않는다.
- **CHECKPOINT:** 2026-10-07 재개 시 `git fetch origin --prune` 및 공식 TASK 재확인. 기존 지정 브랜치/미커밋 구현을 보존해 이어서 진행한다. 사용자 추가 지시에 따라 논리 단위 commit → 최종 검증 → push → main 대상 draft PR까지 수행한다. `npm ci` PASS. NAVER 지도 연결·핀 겹침 처리·Chrome 화면 검증이 남아 있다. 사용자의 원본 명세는 `C:\Users\ekth3\ktrip-codex\prompt.md`.

---

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

### [ ] KN-MANGWON-DEMO-01 — 망원시장 리얼데이터 모바일 Demo (별도 경로)

`PRIORITY = P1`

`STATUS = IN_PROGRESS`

`BRANCH = feat/mangwon-realdata-demo`

`PR = #136 (draft, do not merge until the owner reviews open questions)`

**Goal**

망원시장 점포 상세·주변 점포·지도 Demo를 `/mangwon`에서만 제공한다. 프로덕션 홈(`/`)의 기존 도보 안내와 4개 언어 선택(ko/en/ja/zh, `KN-20260826-04`)은 유지한다.

**Constraints**

- 홈 화면을 Demo로 바꾸지 않는다. Demo는 기본값이 꺼진 별도 경로다.
- 키 없는 `google.com/maps/embed?pb=` URL은 사용하지 않는다. 소유자 결정으로, `streetView.available`인 점포는 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`가 있을 때 문서화된 Maps Embed API streetview(`/maps/embed/v1/streetview`)를 점포 위치의 거리뷰로 보여 준다. pano ID가 있으면 그 pano를 쓰고, 없으면 점포 좌표와 heading을 쓴다. 정면 확인은 요구하지 않는다. 네 언어 문구는 점포 근처 거리뷰라고 밝히고 확인된 정면이라고 하지 않는다. 키가 없거나 영상이 없으면 기존 미표시 문구를 유지한다.
- 확인되지 않은 대표 메뉴 가격을 다른 상품 가격으로 채우지 않는다. 가격이 없으면 미확인으로 표시한다.
- 점포 위치 검증 상태는 점포별 `storeLocation.verificationStatus`를 따른다. 일괄 `MULTI_SOURCE_VERIFIED`로 올리지 않는다.
- `cdn.imweb.me` 점포 이미지 사용권은 이 저장소에서 확인되지 않았다. `usageStatus = RIGHTS_CHECK_REQUIRED`는 법적 판단이 아니라 권리 근거가 없다는 표시다. 사용 여부는 소유자 확인이 필요하다.

**Acceptance**

- [ ] `/` 홈이 main과 같고 언어 선택이 ko/en/ja/zh를 유지한다
- [ ] `/mangwon`에서 점포 상세와 주변 점포 흐름을 연다
- [ ] 기존 navigation 회귀 테스트(TEST A–F)가 실행되고 통과한다
- [ ] 미검증 가격·위치를 확인된 것처럼 표시하지 않는다. 거리뷰는 확인된 점포 정면이라고 부르지 않는다
- [ ] 이미지 권리 질문은 소유자 확인 전까지 열어 둔다
- [ ] `/mangwon` 헤더와 데모 UI 문자열이 ko/en/ja/zh를 모두 지원한다

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
- 시장 overview / 점포카드 / 점포상세 / menu UI
- QR → 점포/POI 매핑
- storeLocation / entrance / navigationTarget / streetViewLocation 분리 여부
- 다국어 점포·메뉴·주재료·알레르기 정보
- place/menu/QR/navigation 이벤트 연결 가능 여부
- verified visit(location + QR 등) 판정 가능 여부
- multi-store journey 연결 가능 여부
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

- `market_overview_view`
- `store_card_view`
- `place_view`
- `place_select`
- `qr_scan`
- `store_detail_view`
- `menu_view`
- `route_start`
- `next_place_select`
- `verified_visit` — 위치 + QR 등 별도 검증수단이 있을 때만

**Acceptance**

- [ ] 기존 UI에 tracker를 최소 침습으로 연결
- [ ] 관련 poi/store/content ID 연결
- [ ] QR이 정확한 store_id/poi_id와 연결되고 동일 QR 재스캔 중복폭증 방지
- [ ] rerender로 `place_view`/`store_card_view` 중복 폭증 방지
- [ ] `verified_visit`은 GNSS 위치만으로 확정하지 않고 QR/쿠폰/별도 인증 신호와 결합
- [ ] `next_place_select` 후 새 `route_start`와 동일 session으로 연결
- [ ] 한 session 안에서 점포1 → 점포2 → 점포3 이동을 재구성 가능
- [ ] 언어 변경이 session을 끊지 않음

---

## [ ] TASK-009 — Journey reconstruction + export

`PRIORITY = P1`

`STATUS = READY`

`DEPENDS = TASK-003 ~ TASK-008`

**Goal**

한 익명 사용자의 Journey를 시간순으로 재구성한다.

목표 sequence:

`market_overview_view`
→ `store_card_view`
→ `place_view / place_select`
→ `qr_scan 또는 route_start`
→ `movement`
→ `route_deviation`
→ `reroute`
→ `poi_approach`
→ `arrival`
→ `dwell`
→ `store_detail_view / menu_view`
→ 조건 충족 시 `verified_visit`
→ `next_place_select`
→ `new route_start`
→ 다점포 Journey

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
→ `market_overview_view`
→ `store_card_view`
→ `place_view / place_select`
→ `qr_scan`
→ `store_detail_view / menu_view`
→ 필요 시 `route_start`
→ `movement samples`
→ `route_deviation`
→ `reroute`
→ `poi_approach`
→ `arrival`
→ `dwell`
→ 조건 충족 시 `verified_visit`
→ `next_place_select`
→ `new route_start`
→ 두 번째 점포까지 동일 session으로 연결

**Acceptance**

- [ ] session_id 중간 변경 없음
- [ ] GNSS raw sample 저장
- [ ] Movement Bearing / Route Progress / Cross-track / Navigation State 저장
- [ ] false route_deviation 억제
- [ ] arrival 1회
- [ ] dwell 계산
- [ ] 다음 장소 이동 연결
- [ ] QR/점포상세/메뉴 이벤트와 이동·방문 이벤트 연결
- [ ] verified_visit은 별도 검증수단이 없으면 미확정 상태로 남김
- [ ] 최소 2개 점포의 multi-store Journey 재구성
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

## 2026-09-20 TASK REVIEW

검토 결론:

- 현재 TASK-002~010의 데이터 파이프라인 순서는 유지한다.
- 단, 기존 문서는 도보 내비게이션 로그 중심이라 실제 사용자 흐름인 시장 overview → 점포 탐색 → QR → 점포/메뉴 정보 → 필요 시 길안내 → 실제 방문 → 다음 점포 흐름이 부족했다.
- TASK-002 audit 범위를 점포/QR/다국어/좌표 분리/verified visit/multi-store까지 확장했다.
- TASK-008~010에 QR, 점포상세, verified_visit, multi-store Journey를 반영했다.
- 구매는 위치만으로 추정하지 않는다. 쿠폰/QR 구매인증/POS 등 별도 검증수단이 있을 때만 구매 전환으로 기록한다.
- 기존 navigation state machine과 GNSS 데이터 수집 TASK는 그대로 유지한다.
- 별도 신규 TASK를 남발하지 않고 기존 데이터 TASK에 사용자 행동 흐름을 통합한다.

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
12. `KN-MANGWON-DEMO-01` — 망원시장 Demo on `/mangwon` (draft PR #136). Does not replace the next auto task. Nearby Street View uses the documented Embed API when imagery and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` exist, and is labeled as a view near the store.

## Next auto task

**`TASK-002 — 데이터 수집 capability audit`**

별도 TASK 문서를 만들지 말고 이 파일에 Audit 결과와 후속 상태를 계속 기록한다.

---

# 16. HISTORICAL NOTE

2026-08-26~2026-09-09의 상세 구현·테스트·PR 기록은 Git commit/PR history에 남아 있다. 이 파일은 **현재 실행할 할 일과 현재 상태를 빠르게 읽을 수 있는 active source of truth**로 유지한다.

과거 상세 기록이 필요하면 해당 PR/commit을 조회한다. 완료된 과거 TASK의 장문 로그를 다시 이 파일에 중복 누적하지 않는다.

## [x] KN-MAIN-SYNC-20261005 — 기존 개발 통합 및 모든 로컬 위치 동기화

`STATUS = VERIFIED_LOCAL — 최종 Git 완료 조건은 통합 PR CI PASS 및 모든 유효 HEAD=origin/main` / `BRANCH = integrate/all-development-20261005` / `BASE = 404c5a8`

- 최신 사용자 요청: 테스트를 최소화하고 지금까지 개발한 내용을 main에 반영하여 모든 walk 로컬 작업 위치를 동기화한다. 이번 명시 요청은 과거 작업의 main 병합·Ready 전환 금지를 대체한다.
- 열린 PR·미커밋 개발·로컬 브랜치·worktree·독립 clone·stash를 대조한다. 백업/중복 이력 및 기능 없는 대량삭제는 무조건 통합하지 않고 보존하며, 독립 개발 내용만 통합한다.
- 기존 navigation 홈·4언어·월드컵시장 45개 원본 점포·근거 좌표/파노 및 망원 데모를 함께 유지한다. 충돌은 양쪽 기능을 읽고 해결하며 Secret/.env/workflow와 사용자 설정을 임의 수정하지 않는다.
- 기존 PASS 증거를 재사용하고 통합 과정의 새 변경/충돌에 필요한 영향 테스트만 수행한다. 필수 GitHub CI는 통과해야 하며 검사를 약화하거나 skip하지 않는다.
- 작업 브랜치+통합 PR로 main에 반영한다. 일반 push만 사용하며 force push·main history rewrite·reset --hard·git clean·무단 stash/drop·사용자 변경 삭제는 금지한다.
- 동기화 전 각 위치의 변경을 확인·보존한다. 각 유효 작업 위치의 code HEAD와 원격 main을 실제 대조하며 로컬 환경 파일/세션 기록 및 과거 stash는 보존한다. 미검증 현장/배포 상태는 별도로 기록한다.

**현재 근거**

- 원격 main404c5a8, 열린 PR7개(#100/#101/#130/#135/#136/#142/#143), 유효 로컬 작업 위치12개 확인. 손상된 root 원격 캐시 참조(41NUL)는 별도 백업/hash 대조 후 제거·재fetch하여 복구했다.
- #143 기존169테스트/build/typecheck/실제Chrome 증거, #130 CI 및simulate4시나리오 증거를 재사용한다. #135는 #136에 포함되어 중복 구현하지 않는다. 최종 통합 범위·최소검증·PR/main SHA·동기화 대조 결과를 이 항목에 기록한다.

**통합 결과 / 최소 검증 (2026-10-06)**

- #143 월드컵시장(기존45점포·근거 좌표45/45·NAVER 근처 파노45/45), #130 정확도 이탈 gate/진단로그, #142 표시 GPS smoothing, #136 망원시장(#135 포함), #100 및 후속 대중교통 도착 라벨을 함께 통합했다. main의 기존 홈4언어와 layout/globals는 유지하고 망원 CSS는 해당 라우트로 격리했다.
- 원본 로컬 회전 미이행·재탐색 gate/테스트를 보존했다. 독립 cursor 브랜치의 Python 경로 점수화·Kakao bridge10파일을 통합하고 이미 대체된 옛 웹 provider, 생성 fixture, env 예제는 재적용하지 않았다.
- 영향 web7파일은75 PASS/디버그 초기화 테스트1 FAIL이었다. 모듈을 읽기 전에 플래그를 설정하도록 해당 테스트만 바로잡아11 PASS(두 debug flag 포함), 다른6파일은66 PASS를 재사용한다. Python 영향5파일292 PASS, web typecheck PASS, production build PASS. 기존 전체 반복 실행 및 geocoding 재조회는 생략했다.
- 설치된 실제 Google Chrome390×844에서 /, /mangwon, /worldcup-market 모두 HTTP200/가로넘침0/pageerror0을 확인했고 홈4언어 및 월드컵45점포/길찾기 버튼을 확인했다. 기존 월드컵 실제 NAVER/TMAP 검증은 재사용하며 현장 GPS·배포 env·점포 정면 실측은 별도 제한이다.
- 원본 로컬 개발7파일은 backup/local-main-sync-20261006=2325b22, production ignore는 backup/production-local-main-sync-20261006=87c3b8a에 보존했다. 기존 stash4개와 env/사용자 설정·세션 기록은 유지한다. 기능 없이 기존 모듈35파일만 삭제하는 #101은 이번 기능 통합에서 제외하고 보존한다.
- 통합 PR의 기존 test/docs-gate CI를 약화 없이 한 번 통과한 뒤 merge commit 방식으로 main에 반영한다. 원격 main의 최종 SHA와 유효12곳 HEAD/보존 상태는 Git/PR 및 로컬 RESUME와 main-sync 보고서에서 대조한다.

---

## [ ] KN-WORLDCUP-DEMO-CLEANUP-01 — 월드컵시장 데모 브랜치 정리

`STATUS = VERIFIED (LOCAL_PRODUCTION_SMOKE)`

`BRANCH = feat/worldcup-market-demo`

`PR = #143 (draft 유지, main 병합 금지)`

`BASE_COMMIT = 404c5a8c2d3e70a1e808e1d0f3410fd65234f37d`

`ORIGINAL_HEAD = 6200e12fbc3e49bde8e5c9d2834003829bec51c4`

`BACKUP_BRANCH = backup/worldcup-market-demo-20261004`

**Goal / Scope**

- 최신 main에서 `/worldcup-market` 라우트·점포 UI·필수 공통 코드만 몇 개의 커밋으로 재구성한다.
- 망원 전용 라우트·점포 데이터·스트리트뷰 및 과거 데모/배포 이력은 포함하지 않는다. 기존 TASK 본문과 망원 항목은 수정하지 않는다.
- `/` 홈, 기본 layout/globals.css와 ko/en/ja/zh 선택기를 main 그대로 보존한다. 데모 CSS는 월드컵시장 라우트에서만 가져온다.
- `worldCupMarketStores.ts`의 45개 점포 내용은 원래 head와 동일하게 유지한다. 소유자 블로그 `https://m.blog.naver.com/mwwdc`의 각 출처 글 URL을 보존하고 미확인 좌표·가격·pano를 만들지 않는다.
- 사용자 요청으로 이 브랜치에 한해 백업 확인 후 원래 head를 지정한 force-with-lease를 허용한다. 다른 브랜치 수정·main 병합·PR Ready 전환은 금지한다.

**Verification / Acceptance**

- [x] web 폴더에서 `npm ci`, `npm ci --include-workspace-root --include=dev`, `npm run build` 통과; lockfile 변경 없음
- [x] web에서 `npm --prefix .. run lint`, `npm --prefix .. run test:run`(150 PASS), `npm --prefix .. run simulate`(4개 시나리오 설명과 실제 상태 일치) 통과
- [x] root/web `npm run typecheck` 통과. main의 CommonJS 스크립트 lint 오류는 `scripts/**/*.cjs`에 한해 타입 규칙을 비활성화하고 일반 JS 검사를 유지하여 해결
- [x] 로컬 production 127.0.0.1:3114 + 실제 Chrome(390×844): 홈·45개 점포 선택·4개 언어·주변/뒤로·deep link 통과, pageerror 0. 외부 이미지 요청은 smoke에서 차단했고 이미지/현장 검증과 구분
- [x] 점포 데이터 blob `d81739601f0795a68aea4ac57386742aceb8742f` 원본 동일. 홈/layout/globals.css blob main 동일
- [x] TASK는 이 항목 1개만 추가, 기존 본문 동일; 독립 정적 안전 검토 PASS, Secret/보호파일 변경 없음
- [x] 원격 백업 head 원본 동일 확인; force-with-lease의 expected head는 ORIGINAL_HEAD로 고정. 외부 반영 결과는 PR #143 최신 head/본문에서 확인하며 draft를 유지한다

**Known limitations**

45개 점포의 좌표·navigation target·파노라마 ID·상품 가격은 미확인이다. 지도 핀·길찾기 시작·실제 스트리트뷰는 제공되지 않으며 검증 성공과 구분한다. 이미지 사용 권리 확인 및 실기기/현장 검증은 미완료 상태로 유지한다.

## [ ] KN-WORLDCUP-COORDINATES-01 — 출처 주소 기반 45개 점포 위치 확인

`STATUS = VERIFIED (LOCAL_PRODUCTION; CONTROLLED_GEOLOCATION)`

`BRANCH = feat/worldcup-market-demo` / `START_HEAD = b8bfdfce264350a83b27248086c0c91411685d94` / `PR = #143 (draft)`

- 소유자 블로그 45개 출처 글의 주소·호수만 수집하고 주소 지오코딩 결과가 망원동 월드컵시장 근처인지 확인한다. 근거 없는 위치는 null/미확인 유지한다.
- 점포 ID·목록·이름·기존 출처 URL과 비위치 정보는 유지한다. 좌표마다 coordSource·근거 주소·출처 URL·확인 날짜를 기록한다. 같은 건물 좌표는 임의 분산하지 않고 공유 사실을 표시한다.
- 가능하면 Street View 메타데이터로 파노를 확인하며 미확인 파노·정면 점포 품질을 추정하지 않는다. 위치/파노 상태에 맞춰 지도·도보·거리뷰와 fallback 안내를 검증한다.
- 좌표 범위/출처 필수 테스트, web npm ci·lint·build·test:run·typecheck·simulate와 Chrome 390×844 실제 API/화면 검증을 수행한다. 제어한 브라우저 위치와 현장 GPS 확인은 구분한다.
- API 키는 기존 로컬 설정에서 프로세스 env로만 사용하며 파일·커밋·로그에 기록하지 않는다. 일반 commit/push만 허용하고 force push·main 병합·PR Ready 전환은 금지한다.

**결과 / 검증 (2026-10-04)**

- 블로그 본문 17개와 첨부 정보 이미지 28개의 실제 픽셀에서 주소·호수를 확인했다. Naver Geocoding 실응답의 도로명·건물번호·마포구 망원동을 대조한 좌표 45/45, 건물 좌표 18개, 공유 좌표 12그룹(39점포)이며 범위 밖/주소 불일치 결과는 기록하지 않았다. 45개 기존 stall 입력은 시작 head와 전 필드 동일하다.
- NAVER Panorama SDK의 실제 파노 ID·촬영 위치·촬영일을 확인했다. 근처 파노 45/45(고유 ID 13개), 건물에서 최대 29.08m로 50m 이내이며 provider/metadataSource/확인 날짜를 기록했다. Google 키는 미설정이며 Google 파노로 혼용하지 않는다. 점포 정면·출입구·실내 위치 실측은 미완료다.
- 시장 라우트에서 기존 NaverPanoramaAdapter를 재사용한다. 키/영상 실패 시 실제 지도·도보 가용 상태별 안내를 유지하고, 공유 좌표는 그대로 두고 점포 목록 선택을 제공한다. 홈·기본 layout/globals·공유 roadview 코드는 main과 동일하다.
- web에서 `npm ci --include-workspace-root --include=dev --no-audit`, `npm --prefix .. run lint`, `npm run build`, `npm --prefix .. run test:run`, root/web `typecheck`, `npm --prefix .. run simulate`가 통과했다. 최종 기본 병렬 테스트 20파일/169개 PASS이며 worker 2개 제한 실행도 동일하게 PASS다. 테스트 timeout/검사 생략 없이 검증했고 simulate 4개 시나리오 상태/행동을 확인했다.
- 실제 Chrome 390×844, 로컬 production: 부부야채/장터국밥 핀 선택·공유 안내·NAVER 주변 영상·도보 안내 시작/중지를 확인했다. 실제 TMAP HTTP 200(132m/7점, 99m/5점), 실제 지도 타일/파노 영상, pageerror 0. 브라우저 위치는 출처 기반 좌표로 제어한 입력이며 현장 GPS 검증이 아니다.
- 실행 환경은 `TMAP_APP_KEY`, `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`를 로컬 env로 제공한다. 로컬 검증과 배포 환경 설정·현장 방문 검증은 구분한다. 키 값은 기록하지 않는다.


---

## TASK REGISTRATION — PR #130 deviation accuracy hardening (2026-10-03)

`TASK_ID = WALK-PR130-DEVIATION-ACCURACY-HARDENING-20261003`

`STATUS = IN_PROGRESS`

`PR = #130 (draft 유지, merge 금지, PR 본문 수정 금지)`

`BRANCH = claude/path-deviation-logs-jq8h4o`

`BASE_INTEGRATION = 최신 origin/main을 rebase 없이 merge 방식으로 통합`

`SCOPE = (1) PR #130에서 useSmoothedFix/display smoothing 변경 분리 (2) distanceFromRouteMeters < GNSS accuracy일 때 deviated를 drifting으로 완화하되 확정 이탈은 유지 (3) 기존 30m deviation accuracy gate 유지 (4) passed_turn이 distance-vs-accuracy 규칙 때문에 정상 missed-turn 감지가 지연/차단되지 않도록 검증·보완 (5) [walk:tick] console 진단 로그를 production 기본 OFF debug flag로 제한 (6) 관련 테스트 및 전체 회귀 검증`

`SEPARATE_PR = display smoothing은 main 기준 별도 branch/draft PR로 관리`

`ACCEPTANCE = deviated: distance < accuracy => drifting/monitor; deviated: distance >= accuracy + reliable fix => 확정 유지; accuracy > 30m => hard deviation/reroute 억제; passed_turn: reliable fix에서는 distance < accuracy만으로 downgrade하지 않음; [walk:tick] 기본 미출력; smoothing diff는 PR #130에서 제거; 요구 validation commands 및 CI 확인`

`FORBIDDEN = PR #130 merge; draft 해제; PR #130 body 수정; force push; .github/workflows 수정; unrelated refactor`


## [ ] TASK-012 — passed_turn 억제 수정 및 tick 디버그 로그

`PRIORITY = P0`

`STATUS = VERIFIED — LOCAL_CONTROLLED; FIELD_TEST_REQUIRED`

- 사용자 요청 (2026-10-03): `passed_turn` 억제 문제 해결, `[walk:tick]` 로그는 디버그 플래그 뒤로, TASK.md 작업 등록.
- 작업 브랜치: `fix/passed-turn-debug-20261003`; base `40daf37`.
- 최신 원격 main은 `404c5a8`이며 base 이후 TASK/웹 소스 변경은 없다. fetch는 기존 손상된 백업 ref로 실패해 GitHub API로 최신성을 확인했다.
- 재사용: 열린 PR [#130](https://github.com/pds2225/walk/pull/130), head `5b657f1`의 GPS 정확도 보정·표시 위치 smoothing 코드를 유지한다.
- 범위: `web/lib/useNavigation.ts`의 회전 미이행 정확도 gate 및 tick 로그, `web/app/page.tsx`의 보정된 상태 기준 재탐색 gate, 관련 hook/사용자 흐름 회귀 테스트.
- 제약: `deviated`의 횡거리/정확도 비교, 저정확도 fix 억제, 음성·재탐색·도착 정책 유지. Streamlit 페이지, `.env*`, workflow, 사용자 데이터 변경 금지.
- Git: 이번 요청은 로컬 수정/검증/작업 등록까지. commit/push/PR/merge는 실행하지 않는다. main 공식 SSOT 반영은 후속 병합 시점이다.

**Acceptance / Verify**

- [x] 신뢰 가능한 GPS에서 `passed_turn`은 횡거리가 accuracy보다 작아도 유지한다.
- [x] GPS 정확도가 기존 gate보다 나쁘면 `passed_turn` 확정을 계속 억제한다.
- [x] `deviated`는 횡거리/accuracy 비교를 유지하며 실제 이탈 재탐색은 작동한다.
- [x] 기본값에서 tick 로그 없음; `NEXT_PUBLIC_WALK_DEBUG=true`일 때만 진단 로그 출력.
- [x] 실제 엔진 회전 미이행과 사용자 UI/재탐색 흐름, 정상 회전·저정확도·기존 기능 회귀 확인.
- [x] 웹 typecheck/lint/build 및 `python -m pytest streamlit_walk_engine\tests -q` 결과 기록.
- [x] 실제 현장 GPS/배포 검증은 자동화 입력 검증과 구분한다.

**검증 기록 (2026-10-03)**

- 수정 전 실제 엔진/hook 입력으로 accuracy 25/30m의 `passed_turn → drifting` 오류와 debug 비활성 로그 출력을 재현했다.
- `npm run test:run -- --reporter=dot`: 16 files, 149 PASS. 신규 13개 회귀는 회전 미이행 음성·UI·재탐색, 저정확도, 정상 회전, 횡거리 오차 및 플래그를 검증한다.
- `npm run build --workspace @walk/route-engine`, `npm run typecheck`, `npm run typecheck --workspace web`, `npm run lint`, `npm run next:build`: PASS. 기존 lint 설정은 web을 제외하므로 웹 정적 검증은 자체 typecheck/Next build로 확인했다.
- `python -m pytest streamlit_walk_engine\tests -q`: 597 PASS, 1 기존 환경 의존 실패(`test_missing_everywhere_returns_none`은 로컬 secrets가 없다고 가정).
- 로컬 secrets를 테스트 프로세스에서만 격리한 회귀: `python -c "import streamlit as st, pytest; st.secrets = {}; raise SystemExit(pytest.main(['streamlit_walk_engine/tests', '-q', '--tb=no']))"`: 598 PASS. 설정 파일은 수정하지 않았다.
- 로컬 production server `http://127.0.0.1:3108` + 실제 Chromium(390×844): 회전 미이행/저정확도/정상 좌회전/GPS 오차 안 횡거리 4개 시나리오 PASS. 회전 미이행은 경로 API 2회(최초+재탐색), 나머지는 1회. 모든 시나리오 tick 로그 0, page error 0, 안내 중지 PASS.
- 브라우저 GPS·경로 API·지도 배경은 통제 입력이다. 실기기 현장 GPS, 운영 배포, 공유기 외부 접속은 미검증. 테스트 서버는 검증 후 종료한다.
- 브라우저 smoke 재현 스크립트: `C:\Users\ekth3\AppData\Local\Temp\walk-passed-turn-20261003.cjs` (Playwright npm 캐시 사용). `git diff --check`: PASS.
- 유사 문제: 보정 후 `drifting`인데 raw `reroute_candidate`가 남아 재탐색하던 경계도 수정했다. Streamlit에는 이미 passed_turn 횡거리 예외가 있어 변경하지 않았다.
- 디버그 실행: PowerShell에서 `$env:NEXT_PUBLIC_WALK_DEBUG='true'` 후 `npm run next:dev`. production은 같은 플래그를 **빌드 전에** 설정한다. 미설정/false/1에서는 로그를 출력하지 않는다.

## [x] KN-SHARED-SESSION-CONTEXT-20261006 — 다른 작업 환경에서 회고·재개 기록 사용

`STATUS = VERIFIED_REMOTE_CLONE — 최종 공유 조건: PR CI PASS 및 main에서 문서 조회 가능` / `BRANCH = docs/shared-session-context-20261006` / `BASE = 87f890f`

- 사용자 후속 요청: 회고와 재개가 로컬에만 있어 다른 위치/PC에서 작업하기 어렵다. 두 기록을 GitHub 기본 브랜치에서도 읽을 수 있도록 공유한다.
- 기존 SESSION_RECAP 이력과 로컬 원본을 보존하고, 개인 절대경로·로컬 산출물 의존·Secret을 제거한다. RESUME는 TASK를 대체하지 않는 파생 체크포인트다.
- 공유용 RESUME.md·SESSION_RECAP.md 및 GitHub/추적 소스로 이어지는 근거 문서를 일반 commit/push+PR로 반영한다. 제품코드·env·workflow는 수정하지 않는다.
- 확인: 문서 내부 링크/경로·Secret 검사, 원격 branch에서 실제 새 clone으로 두 파일 복원, 기존 필수 CI. 반복 제품 테스트는 로컬에서 수행하지 않는다.
- 결과: 문서3개/상대 링크11개 검증, 새 문서의 개인 절대경로/Secret 패턴0. GitHub 원격 branch를 다른 임시 경로에 실제 shallow clone하여 회고·재개·공유근거3파일 및 과거회고를 확인했다. 원래PC의 .worktrees/위키/학습스킬 없이 시작할 수 있다. 기존 로컬원본은 별도백업했다.
