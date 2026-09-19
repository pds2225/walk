# K-Navi / 케이네비 — Active Development TASK

> Repository: `pds2225/walk`  
> Canonical task file: **repository root `TASK.md` only**  
> Updated: **2026-09-16**  
> Status: **ACTIVE — OVERNIGHT AUTONOMOUS MODE**  
> Target branch: `feat/mangwon-realdata-demo`

---

# 0. SOURCE OF TRUTH

개발 할 일·우선순위·검증·완료기록은 이 루트 `TASK.md` 하나를 기준으로 한다.

충돌 시 우선순위:

1. 사용자의 가장 최근 명시 지시
2. 이 `TASK.md`
3. 현재 repository의 실제 코드·테스트·배포 상태
4. 최신 QA/재현 결과
5. 최신 프로젝트 자료
6. 과거 자료
7. 추론

신규 사용자 노출 명칭은 **K-Navi / 케이네비**로 통일한다.

기본 개발 원칙:

`AUDIT → REUSE → FIX → EXTEND → NEW → TEST`

- 이미 구현된 기능을 중복 구현하지 않는다.
- 정상 기능을 이유 없이 제거하지 않는다.
- `1 기능 = 1 TASK = 1 검증`을 기본으로 한다.
- build/test 성공만으로 DONE 처리하지 않는다.
- 실제 사용자 흐름과 Acceptance Criteria로 완료 판단한다.
- mock 점포·메뉴·가격·좌표·점포사진을 신규 생성하지 않는다.
- 확인되지 않은 데이터는 명시 상태값으로 처리한다.

---

# 1. OVERNIGHT AUTONOMOUS EXECUTION CONTRACT

사용자는 실행 중 확인하거나 승인할 수 없다고 가정한다.

## 절대 원칙

**작업 중 사용자에게 승인·선택·확인을 요청하지 않는다.**

일반적인 구현 판단은 repository의 기존 패턴과 최소변경 원칙을 기준으로 스스로 결정한다.

불확실성이 있어도 작업 전체를 멈추지 않는다.

판단 우선순위:

1. 기존 구현 재사용
2. 최소 변경
3. 기존 사용자 흐름 보존
4. 데이터 무결성 보존
5. 되돌리기 쉬운 구현
6. 실패 시 graceful fallback

## 외부 작업으로 막힌 경우

다음은 `BLOCKED_EXTERNAL`로 기록만 하고 즉시 다음 독립 TASK로 진행한다.

- 로그인/2FA
- API key 신규 발급
- billing/결제 승인
- 약관 동의
- 도메인/Cloud Console 수동 설정
- 외부 조사 handoff 파일 미도착
- GitHub/Vercel 일시 네트워크 장애

**외부 blocker 때문에 밤샘 실행 전체를 중단하지 않는다.**

## 실패 처리

한 단계가 실패하면:

1. 원인 파악
2. 최대 3회까지 수정·재검증
3. 여전히 실패하면 `PARTIAL / BLOCKED` 기록
4. 현재 변경이 다른 정상 기능을 깨뜨리면 안전하게 해당 TASK 변경만 되돌림
5. 다음 독립 TASK 진행

같은 명령/API를 무한 재시도하지 않는다.

## 금지

- `git reset --hard`
- `git clean -fd`
- force push
- main history rewrite
- 사용자/다른 agent의 unrelated 변경 삭제
- secret commit
- 근거 없는 데이터 생성
- 실패한 TASK 때문에 전체 작업 중단
- 중간 진행보고를 기다리며 멈춤

---

# 2. PATH / PC INDEPENDENCE

집 PC·노트북·다른 PC에서 동일하게 실행되어야 한다.

**`D:\walk` 같은 절대경로를 가정하지 않는다.**

작업 시작 시 현재 repository root를 자동 확인한다.

```powershell
$repo = git rev-parse --show-toplevel
Set-Location $repo
```

shell이 다르면 동등한 명령을 사용한다.

모든 repository 파일은 root 기준 상대경로를 사용한다.

Street View 조사 handoff는 아래 순서로만 찾는다.

1. `K_NAVI_HANDOFF_DIR` 환경변수
2. repository root 기준 `handoff/streetview_frontage_report.md`
3. repository 부모/형제의 `k-navi-handoff/streetview_frontage_report.md`
4. 없으면 `BLOCKED_HANDOFF` 기록 후 다음 TASK 진행

전체 디스크 무차별 탐색은 하지 않는다.

---

# 3. CURRENT NORMALIZED STATUS

| Capability | 상태 |
|---|---|
| 기존 K-Navi navigation core | **IMPLEMENTED — 보존** |
| 망원시장 실제 점포 데이터 | **13개 구현 — 보존** |
| Screen 01 Shop Detail(Main) | **IMPLEMENTED — FINAL QA 필요** |
| Screen 01 KO/EN | **IMPLEMENTED — 누락 Audit 필요** |
| 대표이미지/점포정보/CTA/Popular Menu/About | **IMPLEMENTED** |
| 기존 Map / Roadview 구현 파일 | **PRESERVED** |
| 점포별 Google Street View 정면 설정 | **조사 handoff 통합 대기** |
| Screen 02 Nearby + 360 + Map | **NEXT** |
| Screen 01 ↔ Screen 02 연결 | **NEXT** |
| Market Overview / Explore | **P1** |
| Store Deep Link / QR 진입구조 | **P1** |
| Funnel analytics / Journey data | **P2** |

현재 최우선 목표는 **망원시장 모바일 Demo를 하나의 end-to-end 사용자 흐름으로 완성**하는 것이다.

---

# 4. 변경 금지 핵심 기술 원칙

## Navigation

단일 GPS 좌표나 단말 Heading 하나만으로 경로이탈을 판단하지 않는다.

주요 신호:

- GNSS Accuracy
- Movement Bearing
- Route Bearing
- Route Progress
- Cross-track Distance
- 이동거리/시간 연속성
- route geometry

상태 흐름:

`On-route → Drifting → Deviated → Reroute`

Device Heading은 Movement Bearing 대체값으로 사용하지 않는다.

## Street View

망원시장 Demo 사용자-facing 360은 **Google Street View** 기준으로 구현한다.

점포별로 가능하면 다음을 분리한다.

- `storeLocation`
- `navigationTarget`
- `streetViewLocation`
- `resolvedPanoId`
- `headingOverride`
- `pitch`
- `quality`

규칙:

- 검증된 pano/heading이 있으면 nearest pano 재탐색보다 우선
- 점포 선택 시 해당 점포 정면이 첫 POV 중심
- same pano는 정면이 heading으로 명확히 구분될 때만 허용
- 적합한 pano가 없으면 `STOREFRONT_VIEW_UNAVAILABLE`
- 다른 점포 pano로 대체 금지
- Street View 실패가 navigation 실패로 이어지지 않음

## Real-data integrity

- 가격·메뉴·영업시간·좌표·점포사진은 기존 검증 데이터 유지
- 영어는 기존 한국어 데이터의 의미만 번역
- 숫자·사실 변경 금지

---

# 5. NIGHT RUN — P0 EXECUTION ORDER

밤샘 실행 순서:

`MW-01 → MW-02 → MW-03(if handoff) → MW-04 → MW-05 → MW-06`

MW-03 handoff가 없어도 멈추지 않고 MW-04로 진행한다.

각 TASK 종료 시:

1. 관련 구현 완료
2. 관련 test
3. typecheck
4. lint
5. build 또는 가능한 runtime 검증
6. 실패 수정
7. PASS 가능한 수준까지 재검증
8. completion record 작성
9. 안전한 local commit
10. 다음 TASK 즉시 진행

GitHub/Vercel 연결이 되면 push/preview까지 수행한다. 네트워크가 실패하면 local commit은 유지하고 다음 TASK로 진행한다.

---

## [ ] MW-01 — Screen 01 Final Visual QA

`PRIORITY = P0`

**Goal**

승인된 모바일 Shop Detail 목업과 현재 구현의 시각적 정합성을 최종 마감한다.

**Viewport**

- `390 × 844`
- `412 × 915`

**Required hierarchy**

`Header`
→ `Large shop image`
→ `Shop name`
→ `Category`
→ `Description`
→ `Signature Menu / Price / Hours`
→ `Start Walking Guide`
→ `Save / Share`
→ `Popular Menu`
→ `About this shop`

**FAIL**

- 점포 switcher가 대표이미지보다 먼저 보임
- 기존 목적지 검색 UI가 Shop Detail 아래 다시 노출됨
- 360/Map이 Screen 01 첫 화면을 지배함
- 개발자용 상태/좌표/source URL 노출
- Google Maps clone 인상
- KO/EN 전환 시 overflow/레이아웃 파손

**Acceptance**

- [ ] 두 viewport 실제 Chromium 확인
- [ ] 대표이미지가 첫 시선 중심
- [ ] CTA가 가장 강함
- [ ] Popular Menu horizontal scroll 자연스러움
- [ ] Save/Share 보조 위계
- [ ] About 과하지 않음
- [ ] KO → EN → KO 클릭 확인
- [ ] MAJOR/FAIL 0개 또는 남은 이슈가 명확한 MINOR뿐
- [ ] test/typecheck/lint/build 가능한 항목 PASS

완벽한 픽셀 동일성이 아니어도 사용자 흐름과 시각 위계가 충족되면 완료하고 다음으로 진행한다.

---

## [ ] MW-02 — 13개 점포 English Audit

`PRIORITY = P0`
`DEPENDS = MW-01`

이미 구현된 영어를 전부 갈아엎지 않는다.

점검:

- name/category
- description
- representative menu
- menu items
- hours
- takeout/dine-in
- order note
- Screen UI text

**Acceptance**

- [ ] 13개 점포 KO→EN smoke test
- [ ] 비정상 한국어 fallback 최소화
- [ ] 가격·시간·전화번호 불변
- [ ] 긴 영어 title/button overflow 없음
- [ ] 새로운 사실 생성 없음

---

## [ ] MW-03 — Storefront Street View Handoff Integration

`PRIORITY = P0`
`STATUS = RUN_IF_HANDOFF_EXISTS`

handoff 파일을 자동 검색해 존재하면 직접 읽고 통합한다.
사용자에게 복사/승인을 요청하지 않는다.

우선 대상:

1. 훈훈호떡
2. 부산대원어묵
3. 큐스
4. 망원닭강정
5. 우이락 망원본점

반영 후보:

- streetViewLocation
- resolvedPanoId
- headingOverride
- pitch
- quality

**Acceptance**

- [ ] 검증된 pano 우선
- [ ] headingOverride 첫 POV 적용
- [ ] same pano 규칙 준수
- [ ] unavailable에 다른 점포 pano 사용 금지
- [ ] Screen 01 회귀 없음
- [ ] navigation 회귀 없음

handoff가 없으면 `BLOCKED_HANDOFF`만 기록하고 즉시 MW-04로 이동한다.

---

## [ ] MW-04 — Screen 02 Nearby Shops + 360 + Map

`PRIORITY = P0`
`DEPENDS = MW-01`

**Goal**

Screen 01을 재설계하지 않고 두 번째 소비자 화면을 구현한다.

사용 흐름:

`Nearby Shops`
→ `점포 선택`
→ `선택 점포 요약`
→ `Storefront 360`
→ `Location Map`
→ `Start Walking Guide`

**UI rules**

- MANGWON_STORES 단일 데이터 소스
- 실제 대표이미지 thumbnail 사용
- Nearby horizontal rail
- 선택 점포 상태 명확
- 360은 선택 점포와 일치
- Map은 보조 정보
- Google Maps clone처럼 만들지 않음
- K-Navi white + blue 소비자 관광앱 톤
- KO/EN
- CTA는 기존 K-Navi navigationTarget 호출
- Google walking directions redirect 금지

**Minimum stores**

- 훈훈호떡
- 부산대원어묵
- 큐스
- 망원닭강정
- 우이락 망원본점

**Acceptance**

- [ ] 390×844
- [ ] 412×915
- [ ] 점포 전환 시 요약/360/Map/CTA 동일 점포
- [ ] 360 unavailable graceful fallback
- [ ] KO→EN→KO
- [ ] 기존 Screen 01 회귀 없음

Street View handoff가 없어도 Screen 02 구조와 fallback까지 구현하고 멈추지 않는다.

---

## [ ] MW-05 — Screen 01 ↔ Screen 02 연결

`PRIORITY = P0`
`DEPENDS = MW-04`

**Goal**

두 화면을 하나의 실제 사용자 흐름으로 연결한다.

**Acceptance**

- [ ] selectedStore 유지
- [ ] locale 유지
- [ ] 뒤로가기 정상
- [ ] 새로고침 시 안전한 fallback
- [ ] Screen 02 선택점포 ↔ 360 ↔ Map ↔ CTA 일치
- [ ] 기존 navigationTarget 사용
- [ ] 불필요한 전역 상태 라이브러리 추가 없음

---

## [ ] MW-06 — Full Regression / Release Candidate QA

`PRIORITY = P0`
`DEPENDS = MW-01 ~ MW-05 가능한 범위`

신규 기능 추가 금지. 회귀만 수정한다.

검증:

- Screen 01
- Screen 02
- 13개 점포 smoke test
- KO/EN
- 대표이미지
- Popular Menu
- Save/Share
- Street View/fallback
- Map
- Start Walking Guide
- 기존 K-Navi navigation

Real-data integrity:

- mock store 없음
- fake menu/price 없음
- fake coordinate 없음
- fake store image 없음
- wrong-store pano 없음

가능하면 full test/typecheck/lint/production build를 수행한다.

테스트 하나가 환경 문제로 불가능하면 그 사실을 기록하고 나머지 검증을 계속한다.

---

# 6. P1 — P0가 일찍 끝나면 자동 진행

P0가 모두 가능한 범위에서 완료되고 시간이 남으면 **사용자 승인 없이** 아래를 순서대로 진행한다.

## [ ] MW-07 — Market Overview / Explore

목표:

`Market Overview → Store Detail → Screen 02 → Walking Guide`

- 검색창 중심이 아니라 시장 전체 탐색 중심
- 실제 13개 점포만 사용
- 대표이미지/업종/점포명 중심
- 간단 카테고리 필터 가능
- Map은 보조
- KO/EN
- 기존 Screen 01/02 재사용

---

## [ ] MW-08 — Store Deep Link / QR-ready URL

점포별 직접 진입 가능한 URL 구조를 만든다.

예:

`/mangwon/store/{storeId}` 또는 현재 구조에 가장 적합한 동등 구현.

Acceptance:

- [ ] URL 직접 접속 시 해당 점포 Screen 01
- [ ] 잘못된 storeId safe fallback
- [ ] 새로고침 유지
- [ ] Share가 가능하면 deep link 사용
- [ ] 13개 점포 automated smoke test

QR 이미지 제작 자체보다 **deep-link routing**을 우선한다.

---

## [ ] MW-09 — Navigation entry/return UX

`Store Detail → Walking Guide → 종료/도착 → Store context` 흐름을 정리한다.

- 선택 점포명 유지
- navigation 중 store context 보존
- 종료 시 안전한 복귀
- navigation state machine 자체는 재설계하지 않음

---

# 7. P2 — DATA PIPELINE (기존 설계 유지, UI 통합 후 진행)

P0/P1이 끝나기 전 데이터 파이프라인 때문에 밤샘 작업을 선점하지 않는다.

## DATA-01 — Capability Audit

현재 코드에서 이미 가능한 것을 먼저 분류:

`ALREADY_DONE / PARTIAL / BROKEN / NOT_IMPLEMENTED / NOT_APPLICABLE / BLOCKED_EXTERNAL`

대상:

- session/client state
- geolocation
- GNSS accuracy/speed
- Movement Bearing
- Route Progress
- Cross-track Distance
- navigation state
- deviation/reroute
- arrival
- POI/store model
- backend/API/storage
- analytics/logging

## DATA-02 — Anonymous Session

- session_id 1회 생성
- 동일 Journey 유지
- language/session_started_at 연결
- 직접 식별정보 사용 금지

## DATA-03 — Event Log

우선 이벤트:

- place_view
- menu_view
- route_start
- streetview_open
- map_view
- route_deviation
- reroute
- poi_approach
- arrival
- dwell
- next_place_select
- save/share

## DATA-04 — Movement Log

- timestamp
- session_id
- route_id
- latitude/longitude
- gnss_accuracy
- speed
- movement_bearing
- route_progress
- cross_track_distance
- navigation_state

## DATA-05 — Journey Reconstruction

`탐색 → 선택 → 이동 → 이탈 → 재안내 → 접근 → 도착 → 체류 → 다음 이동`

을 session_id 기준으로 재구성하고 최소 JSON/CSV export 가능하게 한다.

Data 저장 실패는 navigation fatal error가 되면 안 된다.

---

# 8. CHECKPOINT / RESUME CONTRACT

중간에 context reset, reconnect, PC/CLI 재시작이 발생해도 재개 가능하게 한다.

repository root의 `RESUME.md`가 이미 있으면 덮어쓰기보다 기존 형식을 존중해 갱신한다.

각 TASK 종료 시 최소 기록:

```text
[완료]
[현재 작업]
[다음 작업]
[Blocker]
[마지막 검증]
[마지막 local commit]
```

**RESUME.md 갱신을 위해 사용자 승인을 요청하지 않는다.**

---

# 9. GIT / NETWORK CONTRACT

작업 시작 시:

- 현재 branch 확인
- git status 확인
- unrelated dirty/untracked 파일 보존

현재 branch가 `feat/mangwon-realdata-demo`가 아니면 기존 변경을 손상시키지 않는 범위에서 해당 branch/worktree를 확인한다.

각 TASK가 안정화되면 local commit을 남긴다.

인터넷이 가능하면 push한다.

GitHub/Vercel 실패 시:

- 최대 2회 재시도
- local commit 유지
- `BLOCKED_NETWORK` 기록
- 다음 TASK 진행
- 밤샘 종료 직전 한 번 더 push 시도

main에 직접 merge하지 않는다.

---

# 10. NIGHT RUN FINAL OUTPUT

밤샘 실행은 중간 보고를 기다리며 멈추지 않는다.

**가능한 P0를 모두 끝내고, 시간이 남으면 P1까지 진행한 뒤에만 종료한다.**

마지막에 repository root에 `NIGHT_REPORT.md`를 생성/갱신한다.

형식:

```markdown
# K-Navi Overnight Report

## 완료
- ...

## Partial / 미완료
- ...

## External / Network blockers
- ...

## Commits
- ...

## Verification
- test:
- typecheck:
- lint:
- build:
- browser QA:

## Preview
- ...

## 다음 작업
1. ...
2. ...
3. ...
```

완벽하지 않아도 **사용자 승인 대기로 멈춘 상태보다, 안전한 best-effort 결과 + 명확한 보고서**를 우선한다.
