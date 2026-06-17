# 현재위치(GPS) 정확도 향상 — 실행 계획 (RALPLAN-DR short mode, 4차 개정판)

대상 프로젝트: `D:\walk` / 핵심 파일: `streamlit_walk_engine/pages/1_Navigation.py`(최소 변경), 신규 `streamlit_walk_engine/gps_filter.py`(예정), 신규 테스트 `streamlit_walk_engine/tests/test_gps_filter.py` / **변경 금지 코어**: `streamlit_walk_engine/engine.py`, `packages/route-engine/*`(TS 엔진)

> 본 산출물은 **코드를 수정하지 않는 계획 수립 단계** 결과물이다. 모든 file:line 근거는 실제 파일을 직접 열어 확인했다(4차 개정에서 `_init()`(83~114), `_reset()`(117~127), `↺ 초기화` 버튼(869~875), 알림 게이트(890~893), reroute update dict(907~916), `engine.py:44~53`(임계값)·`63~86`(EngineMetrics/EngineResult)·`503~510`(breach 산식)·`565~578`(deviated/drifting 산출)을 재대조).
>
> **4차 개정 핵심 — Architect APPROVE-with-iterations 잔여 지적 + Critic ITERATE(CRITICAL 1·MAJOR 2~4) 전량 흡수:**
> 1. **[CRITICAL 1 — 실행 차단·사실 오류] 세션 키 리셋 위치를 실제 코드 구조에 맞게 재기술.** 3차 개정은 "init 96~102", "reset 125~126", "↺ 초기화 버튼 869~875의 키 목록에 `nav_last_weak_toast_ts_ms` 포함"이라 했으나 **실파일 확인 결과 틀렸다**: `nav_raw_gps` init은 86행, `nav_last_alerted_state`는 96행, `nav_last_reroute_ts_ms`는 102행이며, **`↺ 초기화` 버튼(869~875)은 알림 상태 키를 전혀 리셋하지 않는다**(튜플 `("nav_route","nav_dest","nav_engine","nav_results","nav_samples","nav_prev_coord","nav_prev_ts_ms")` + `nav_running`만). 알림 상태 리셋은 **별도 함수 `_reset()`(117~127, 125·126행)**에만 있다. → Step 2를 `_init()`/`_reset()`/reroute dict 3곳 + "버튼은 의도적으로 제외" 결정으로 재작성한다.
> 2. **[MAJOR 2 — `nav_alert_enabled=False` 회복-누락(신규, Critic 발견)] `decide_alert`에 `alert_enabled` 인자를 추가해 순수 함수 내부에서 일관 처리.** 3차 개정 Step 4는 실행은 `if nav_alert_enabled and decision.fire_full:` 가드 안에서, 기록(`nav_last_alerted_state = decision.new_last_alerted`)은 가드 **밖**에서 무조건 수행하게 했다. 이러면 **알림 OFF 상태에서도 전이가 '소비'되어** 나중에 알림을 다시 켰을 때 그 이탈 알림이 영영 안 울리는 회복-누락(이 계획이 막으려던 CRITICAL과 같은 클래스)이 발생한다. → `alert_enabled=False`면 `decide_alert`가 **아무것도 발화 안 하고 상태도 미갱신**(현재 동작 보존)하도록 계약을 못박고 pytest로 단언한다.
> 3. **[MAJOR 3 — heading 노이즈 게이팅 사각지대(Architect 긴장 B = Critic 확인)] ADR에 명시적 결정 기록.** `engine.py:507~510` `threshold_breach = drift_breach OR (heading_conflict AND distance >= route_drift_threshold*0.6 = 6m)`이라, poor accuracy 구간에서 raw 두 점 bearing-heading(`_make_sample` 308~314)이 튀면 거리 6m 경계에서도 breach가 누적되어 `drifting`(`engine.py:578`)으로 갈 수 있다. 그런데 `alert_level`의 weak 조건은 `engine_state in ("deviated","passed_turn")`만 잡으므로 **heading 노이즈로 `drifting`까지 간 경우는 `mute`로 떨어진다.** → 이것이 **의도된 안전 측 동작**임(drifting은 아직 "확정 이탈"이 아니며, poor 구간의 heading-only drift는 노이즈일 확률이 높음)을 ADR에 명문화하고, 그 사각지대(드물게 진짜 heading 이탈 초기 신호를 mute)를 명시적 trade-off로 기록한다.
> 4. **[MAJOR 4 — Architect 필수 ADR 보강 2건] (a) "표시 평활화 부재 = 사용자 체감 정확도 미개선" trade-off, (b) 호출부 배선("마지막 1cm")이 순수 함수 밖 미검증 영역**임을 ADR Consequences에 명시. 과제명("현재위치 정확도 향상")과 Phase 1 실제 산출물("부정확함에 대한 알림 강건성")의 간극을 사용자 기대관리 차원에서 정직하게 남긴다.
> 5. **[MINOR] enableHighAccuracy raw-JS 우회 1줄 실험을 Step 1에 명시**(Architect S-B·Critic MINOR). 채택 강제는 아니나 모바일 Chrome의 가장 직접적 정확도 레버이므로 착수 시 시도를 권고한다. 게이트 상수 슬라이더 Phase 1 노출(Architect S-D)도 Follow-up→**Step 5 선택지로 격상**.
>
> (3차 개정에서 흡수한 항목 — MAJOR 1 거리 출처 단일화, MAJOR 2 `decide_alert` 순수 함수, MAJOR 3 weak 쿨다운 Phase 1 격상, MINOR 4 옵션 E ADR 신설, S-1 평행상수 제거 — 은 유지한다. 2차 개정 항목(영구 누락 미갱신, 3단계 알림, `_trigger_alert` 전제 정정, 게이팅 독립 상수, 배지·억제 경계 일치)도 유지.)

---

## 1. Principles (지배 원칙)

1. **엔진 코어 불가침**: `engine.py`(이탈 판정 상태머신 `evaluate_deviation_step` 등, `EngineConfig` 임계값 `:46~53` = 10/15/25m, heading 45°)와 TS 엔진(`packages/route-engine`)은 이중 유지보수 관계다. 판정 정확도는 "엔진에 들어가기 전 입력값(GPS)을 정제·게이팅"하거나 "엔진이 이미 산출한 결과(`result.state`, `result.metrics`)를 페이지에서 신뢰도로 강등"하는 방식으로만 개선한다. `EngineConfig`/`evaluate_deviation_step`는 건드리지 않는다(수락기준 6으로 구조 검증).
2. **신규 로직은 별도 모듈로 격리 + 결정 로직까지 순수화**: 정확도 분류·게이팅·**알림 결정(`decide_alert`)**·(조건부) 스무딩은 신규 `gps_filter.py`에 **부수효과 없는 순수 함수**로 모은다. `1_Navigation.py`는 "순수 함수를 호출해 받은 결정을 실행만" 하는 얇은 호출부로 최소 변경한다(AGENTS.md "1_Navigation.py 최소 변경" 준수). **단, 호출부 배선 자체(반환값을 올바른 세션 키에 기록·`alert_enabled` 전달)는 순수 함수 밖이며 단위테스트로 증명되지 않는 "마지막 1cm"임을 인정한다(ADR 명시).**
3. **GPS 정확도 정보를 버리지 않되, "낮춘다(reduce)"는 "끈다(mute)"가 아니다**: 현재 무시되는 `accuracy`(미터 단위 오차 반경, `geo["coords"]["accuracy"]`)를 취득·표시·판정 신뢰도에 반영한다. 정확도가 나쁜 좌표는 **무조건 묵음이 아니라 3단계로 대응**한다 — 오차 범위 내 흔들림은 묵음(`mute`), 엔진이 이미 **확정 이탈**(`deviated`/`passed_turn`)로 본 것 중 정확도가 나쁜 것은 약한 경고(`weak`, toast 위주), 정확도 양호 구간은 정상 알림(`full`). 이로써 "정확도 나쁜 구간 = 길 잃기 쉬운 구간"에서 유일한 알림을 통째로 끄는 미탐 위험을 차단한다.
4. **판정용 좌표와 표시용 좌표를 분리한다**: 엔진(`process_sample`)에는 **항상 raw 좌표**를 넣어 거리·heading 판정의 정직성을 보존한다. 스무딩(EMA)은 **지도 표시용 좌표에만** 적용한다(Phase 2). 이로써 스무딩이 `distance_from_route`나 bearing-heading을 교란하는 것을 원천 차단한다.
   - **긴장 인정(Architect 긴장 A·B 명시)**: Principle 1(엔진 불가침)과 Principle 4(raw 투입)를 합치면, 본 계획은 "raw로 엔진을 정직하게 돌린 뒤 그 정직한 결과를 페이지에서 accuracy로 다시 깎는" 구조가 된다. 회피 불가능한 트레이드오프다. **더 날카로운 잔여 긴장(B)**: raw 좌표 흔들림은 거리뿐 아니라 **heading에도** 들어가, `engine.py:507~510`에서 거리 6m 경계만 넘어도 heading_conflict(45°+)로 breach가 누적된다. 즉 "raw 투입 = 판정 정직성"이 heading 경로에서는 항상 참이 아니다(poor 구간 raw heading은 노이즈일 수 있음). 본 계획은 이 사각지대를 **의도적으로 mute 처리**하되 ADR에 명문화한다(MAJOR 3). 봉합 방향은 Phase 1 1차안에서 **페이지 평행 상수를 새로 만들지 않고 엔진 결과(`result.state`)를 신뢰도로 한 단계 강등**(Synthesis S-1).
5. **검증 가능성 + 비개발자 친화 + 안전 측 기본값**: 모든 신규 로직은 `pytest`로 단위 검증 가능한 순수 함수로 쓴다. **가장 중요한 안전 계약(회복-재발화·mute 미갱신·weak 쿨다운·`alert_enabled=False` 보존)을 세션상태 부수효과 블록이 아니라 `decide_alert` 순수 함수에 담아 pytest로 직접 단언**한다. 정확도 상태는 숫자가 아닌 색·문구(🟢🟡🔴⚪)로 보여준다. **단, 단위테스트는 로직 정합성만 증명한다 — (a) 게이트 상수의 현장 적합성, (b) autorefresh rerun 경로의 실제 발현, (c) 호출부 배선(올바른 세션 키·`alert_enabled` 전달)은 모두 단위테스트 밖이며 실기기 시나리오(D-1~D-4)로만 최종 검증된다**는 한계를 명시한다.

---

## 2. Decision Drivers (상위 3개)

1. **지속적 큰 accuracy 오차 구간의 이탈 오탐**: 이탈 시작 임계값 10m / 확정 15m(`engine.py:46~47`)보다 GPS 오차가 **지속적으로** 더 큰 도심·건물 사이 구간에서, `engine.py:503~505`가 raw distance(`nearest_segment.distance_meters`)를 이 고정 임계값과 직접 비교하므로 연속 3샘플이 모두 임계값을 넘으면(`minimum_consecutive_samples_for_deviation=3`, `engine.py:52`) 또는 drift 지속 4초(`minimum_drift_duration_ms=4000`, `:53`)면 가만히 있어도 이탈로 확정될 수 있다. → **정확도 게이팅**이 최우선 동인.
   - *정정(검증 완료)*: "가만히 있으면 무조건 이탈 알림"은 과장이다. `engine.py:512`에서 비-breach 샘플 하나만 들어와도 `consecutive`가 0으로 리셋되므로 **단발 노이즈는 기존 구조가 흡수**한다. 오탐은 "**지속적으로** 큰 오차(연속 3+ 샘플 또는 4초+ 지속 breach)" 구간에 한정된다 — 바로 이 구간이 게이팅의 정확한 표적이다.
   - *추가 정정(4차 — heading 경로)*: breach는 거리뿐 아니라 **heading_conflict**로도 발화한다(`:507~510`, 거리 6m + heading 45°). poor 구간 raw heading 노이즈가 이 경로로 `drifting`을 만들 수 있다 — 이는 Driver 1의 한 변종이며 게이팅 설계에서 의식적으로 다룬다(MAJOR 3).
2. **미탐(진짜 이탈 누락)이 보행 내비에서 오탐보다 치명적**: poor accuracy 구간(건물 사이·실내 근처)이야말로 사용자가 실제로 길을 잃기 가장 쉬운 구간이고, Android 보행 사용자는 화면을 계속 보지 않으므로 소리/진동이 사실상 유일한 실효 알림 채널이다. 따라서 "정확도 나쁘면 통째로 묵음"은 위험하며, **엔진이 이미 확정 이탈(`deviated`/`passed_turn`)로 본 큰 이탈은 약한 경고라도 유지**해야 한다. → **3단계 알림(`full`/`weak`/`mute`)**이 Phase 1 필수 동인.
3. **변경 최소화·동기화 부담 회피 + 기존 노이즈 내성·결정 검증가능성과의 정합**: `1_Navigation.py` 최소 변경 + 엔진 코어 불변 제약. 엔진은 이미 **3중 노이즈 내성**을 가진다 — (1) 1m 이동 게이트(`1_Navigation.py:881`), (2) 연속 3샘플 요구(`engine.py:512`·`565~567`), (3) drift 지속시간 4초 요구(`engine.py:568`). 신규 게이팅은 이 내성을 **대체가 아니라 추가**한다. 또한 알림 결정의 안전 계약(회복-재발화·mute 미갱신·weak 쿨다운·`alert_enabled` 보존)은 **순수 함수로 추출해 검증 가능**해야 한다(P5).

---

## 3. Viable Options (대안 비교)

### 옵션 A — 브라우저 옵션 강화 (enableHighAccuracy 등) — best-effort + raw-JS 우회 1줄 실험으로 격상
`get_geolocation()` 호출에 고정밀 옵션을 시도한다. 래퍼가 인자를 노출하지 않으면 `streamlit_js_eval(js_expressions="...getCurrentPosition({enableHighAccuracy:true})...")` raw JS 우회를 **1줄 실험**으로 착수 시 검증한다(Architect S-B).
- 장점: 변경량 극소, 코어 무관, **모바일 Chrome에서 GPS 칩 사용을 강제하는 가장 직접적·저렴한 좌표 개선 레버**. 성공 시 "진짜 정확도 향상"이라 게이팅보다 체감 효과가 클 수 있음.
- 단점: `streamlit_js_eval.get_geolocation()`이 옵션 인자를 노출하지 않을 가능성이 높고(로컬 미설치로 사전검증 불가), raw-JS 우회도 권한 프롬프트/반환 형식 차이로 실패할 수 있음. 옵션을 줘도 지속적 도심 오차는 소프트웨어 측에서 보정되지 않음 → 오탐 근본 해결은 불가. **단독으로는 무효화**(B-minimal의 best-effort 1단계로 흡수, 단 3차 개정의 "거의 폐기"는 과소평가였음을 인정하고 1줄 실험을 Step 1에 명시).

### 옵션 B-minimal — 3단계 게이팅 (accuracy 분류 + `decide_alert(alert_enabled 포함)`로 `full`/`weak`/`mute` 결정) ✅ **Phase 1 (필수)**
신규 `gps_filter.py`에 `accuracy_quality`, `alert_level`, **`decide_alert`(순수 결정 함수, `alert_enabled` 인자 포함)**를 구현. **EMA·점프 제거 없이 raw 좌표를 그대로 엔진에 투입**하되, `decide_alert`가:
- `alert_enabled=False` → **아무것도 발화 안 함 + 상태·ts 전부 미갱신**(현재 동작 보존, MAJOR 2 차단),
- `mute`(정확도 나쁘고 엔진이 확정 이탈로 안 봤거나 오차 범위 내) → 소리/진동/toast 모두 억제 + **알림 상태 미갱신**,
- `weak`(정확도 나쁘지만 엔진이 이미 `deviated`/`passed_turn`으로 판정) → toast 경고만(소리/진동 없이) + **15초 쿨다운**,
- `full`(정확도 양호) → 기존 정상 알림 + 상태 갱신.
사이드바에 정확도 배지(+선택적 게이트 슬라이더) 추가.
- 장점: Decision Driver 1·2를 **단독으로** 해결. 신규 버그 표면 최소(EMA·heading·드롭 로직 불필요). 기존 1m 게이트·연속3·drift타이머와 결합 시 단발 점프도 상당 부분 흡수. **알림 결정 전체(`alert_enabled` 포함)가 순수 함수 → pytest 완전 검증(P5)**. poor 구간에서도 엔진이 본 큰 이탈은 weak 경고로 안전 공백 메움(미탐 차단). weak 쿨다운으로 toast 폭주 차단.
- 단점: *지속적* 점프(드문 경우)·표시 마커 흔들림은 미흡 → Phase 2/Follow-up. 게이트 상수(`ALERT_ACCURACY_GATE_M`)·heading 사각지대 동작은 실기기로만 검증 가능(D-3). **표시 좌표를 바꾸지 않으므로 "체감 정확도"는 개선되지 않음**(ADR 명시).

### 옵션 B-full — 3단계 게이팅 + EMA 스무딩 + 점프 제거 (Phase 2, **조건부**)
Phase 1을 실기기에서 검증해 "게이팅만으로 흡수되지 않는 잔여 오탐/점프"가 **실제 관측될 때만** 추가. EMA·점프 로직 도입 시 **결함 C/D·멱등성·신규 state의 reroute/reset 리셋 연동을 명시적 설계 항목으로 흡수**(5장 Phase 2).
- 장점: 드문 지속적 점프·노이즈까지 대응 + **표시 마커 안정화로 사용자 체감 정확도 향상**.
- 단점: 파라미터 증가(현장 적합성 단위테스트 증명 불가), `GpsFilterState` 도입 시 reroute/reset 리셋 연동 필요. **효용이 실기기로 입증되기 전에는 도입하지 않는다.**

### 옵션 D — 게이팅 대신 임계값 동적 확장 (accuracy만큼 이탈 임계값↑)
- 장점: 알림을 끄지 않아 미탐 위험이 낮다.
- 단점: 입력 좌표 정제가 아니라 **임계값 조작**이라 `EngineConfig`/`evaluate_deviation_step` 경유 필요 → **코어 인접·TS 엔진 이중 유지보수**(Principle 1·AGENTS.md 위반 소지). 큰 오차일수록 진짜 이탈도 둔감. **무효화 → 장점(미탐 방지)은 B-minimal의 `weak`로 코어 밖에서 흡수**.

### 옵션 E — `PositionSample`에 `accuracy_m` 필드 추가
`_make_sample`(297~325)이 GPS accuracy를 `PositionSample`에 싣고 엔진이 거리비교에서 참조.
- 장점: SSOT 봉합 — 오탐 근원("엔진이 좌표 ±오차를 구조적으로 모름")을 가장 정직하게 해소. 페이지 평행 로직 제거. 필드 추가 자체는 dataclass 확장이라 "코어 불가침"을 칼(옵션 C)만큼 위반하지 않음.
- 단점: **엔진이 accuracy를 *참조하게* 하려면 결국 `evaluate_deviation_step` 비교 로직을 손대야** 하고, 이는 **TS 엔진 이중 유지보수 동기화 부담**으로 직결(AGENTS.md 명시). **무효화 → 통찰(SSOT 봉합)은 weak 판정을 엔진 `result.state` 재사용으로 정의(S-1)해 부분 흡수. Follow-up.**

### 옵션 C — 칼만 필터(Kalman)
- 장점: 이론상 가장 매끄러운 추적.
- 단점: 3초 간격 드문 샘플·1회성 getCurrentPosition·비개발자 유지보수 맥락에서 **과도한 복잡도**. **무효화**(Follow-up).

**비교 요약**

| 옵션 | Pros | Cons | 판정 |
|---|---|---|---|
| A: 브라우저 옵션+raw-JS 1줄 실험 | 변경 극소·코어 무관·**진짜 좌표 개선 레버** | 래퍼 미지원/우회 실패 가능, 지속 오차 미해결 | best-effort 흡수 + **Step 1에 1줄 실험 명시** |
| **B-minimal: 3단계 게이팅+decide_alert(alert_enabled)** | Driver 1·2 단독 해결, **알림 결정 전부 순수함수(P5)**, 미탐 공백 weak로 메움, 쿨다운으로 폭주 차단, `alert_enabled=False` 보존 | 표시 마커 미개선(체감↓), heading 사각지대, 상수 현장검증 공백 | **✅ Phase 1 채택** |
| B-full: 3단계+EMA+점프 | 3대 원인 일괄 + **체감 정확도 향상** | 파라미터 현장검증, C/D·멱등성·state 리셋 비용 | **조건부 Phase 2** |
| D: 임계값 동적 확장 | 알림 유지(미탐↓) | 코어 인접·TS 이중유지보수, 진짜 이탈 둔감 | 무효화 → weak로 흡수 |
| E: PositionSample accuracy 필드 | SSOT 봉합·평행로직 제거 | 엔진 참조 시 TS 이중 유지보수 | 무효화 → S-1로 부분 흡수, Follow-up |
| C: 칼만 | 이론상 최적 | 드문 샘플·비개발자 과잉 | 무효화 → Follow-up |

---

## 4. 선택안과 근거

**옵션 B를 "Phase 1(B-minimal 3단계 게이팅 + `decide_alert` 순수함수(`alert_enabled` 포함) + weak 쿨다운) 필수 → Phase 2(B-full EMA/점프) 조건부"로 분할 채택**한다. 근거:

- **Root Cause 정합**: 오탐의 진짜 메커니즘은 `engine.py:503~505`가 **raw distance를 고정 임계값(10/15/25m)과 직접 비교**(+`:507~510` heading 경로)해, 큰 오차 좌표가 작은 임계값과 맞붙는 것이다. 이를 깨는 가장 직접적·저위험 수단이 **accuracy 게이팅**이며, 엔진을 전혀 건드리지 않고 알림 게이트(`890~893`)에 연결된다.
- **미탐 위험을 Phase 1에서 직접 흡수**: Architect Antithesis는 "오탐을 줄이려 진짜 이탈을 놓치기 가장 쉬운 순간에 유일한 알림을 끈다"를 가장 강한 반론으로 제기했다. 따라서 **옵션 D의 장점만 코어 밖에서 취한다** — `decide_alert`를 3단계로 만들어, accuracy가 나빠도 엔진이 이미 `deviated`/`passed_turn`으로 본 큰 이탈이면 `weak` 경고를 유지한다.
- **평행 상수 제거(Synthesis S-1)**: weak의 "큰 이탈" 판정을 `distance >= accuracy*2.5` 새 상수 대신 **엔진 `result.state in ("deviated","passed_turn")` + `accuracy > ALERT_ACCURACY_GATE_M`로 정의**한다. 페이지가 거리 임계값을 재발명하지 않고 엔진 판정을 신뢰도로 한 단계 강등시킨다.
- **`alert_enabled=False` 회복-누락 차단(4차 — MAJOR 2)**: 알림 OFF 상태에서 상태를 기록하면 전이가 '소비'되어 알림 재활성화 시 영구 누락이 생긴다. 따라서 `decide_alert`에 `alert_enabled`를 넣어 **OFF면 발화·기록 전부 건너뛰도록** 순수 함수 내부에서 처리하고 pytest로 단언한다. 이로써 실행/기록을 페이지 가드로 분리할 때 생기던 불일치를 원천 제거한다.
- **영구 알림 누락 버그 제거(CRITICAL 유지)**: 억제(mute) 시 `nav_last_alerted_state`를 **갱신하지 않는** 것을 안전 측 기본값으로 한다. 갱신하면 회복 후 동일 state에서 `state != last_alerted`가 False가 되어 알림이 영영 안 울린다(`890~893` 추적 확정). 미갱신이면 회복 즉시 정상 발화. 이 계약을 `decide_alert` 반환 `new_last_alerted`로 표현해 pytest로 직접 단언.
- **heading 노이즈 사각지대 의식적 결정(4차 — MAJOR 3)**: heading 노이즈로 `drifting`까지 간 경우는 `mute`로 둔다. `drifting`은 엔진이 아직 "확정 이탈"로 보지 않은 상태이고, poor 구간 raw heading drift는 노이즈일 확률이 높아 weak로 올리면 오탐을 다시 키운다. 진짜 heading 이탈이면 곧 거리도 벌어지거나 `consecutive`/`drift_duration`이 쌓여 `deviated`로 승격되고 그때 weak가 발화한다. 이 결정과 그 사각지대를 ADR에 명시.
- **weak toast 폭주 차단**: autorefresh 3000ms(`:702`)로 매 3초 재평가되므로 `decide_alert`가 `now_ms - last_weak_ts_ms <= cooldown_ms`이면 weak toast를 억제(쿨다운 15초, reroute 쿨다운 `:903`과 동일 패턴).
- **검증·배포 안전**: 알림 결정 전 로직이 순수 함수 → `pytest` 완전 검증. 신규 의존성 0(순수 Python) → `requirements.txt` 무변경 → Streamlit Cloud 영향 없음.

---

## 5. 단계별 구현 계획 (파일·함수 수준)

### ── Phase 1 (필수) ──

### Step 1 — accuracy 취득 + 브라우저 옵션(enableHighAccuracy) best-effort + raw-JS 1줄 실험
- 파일: `streamlit_walk_engine/pages/1_Navigation.py` (**741~746행 영역, 최소 변경**).
- `geo["coords"]`에서 `accuracy`를 읽어 세션에 보존. `nav_raw_gps`에 dict 전체가 이미 저장됨(`746`)이므로 다운스트림에서 `st.session_state["nav_raw_gps"]["coords"].get("accuracy")`로 접근 가능 → **취득은 사실상 0~1줄**(추가 JS 왕복 없음).
- 브라우저 고정밀 옵션은 **best-effort + 1줄 실험(Architect S-B·Critic MINOR)**: ① `streamlit_js_eval.get_geolocation`이 옵션 인자(`enableHighAccuracy`/`maximumAge`/`timeout`)를 받으면 전달; ② 안 받으면 착수 시 `streamlit_js_eval(js_expressions="navigator.geolocation.getCurrentPosition(p=>p,e=>e,{enableHighAccuracy:true})")` 형태 **raw-JS 우회를 1줄 실험으로 시도**해 반환 형식·권한 프롬프트가 정상인지 확인. ③ 둘 다 실패하면 옵션은 생략하되 accuracy 취득(주 효과)은 옵션과 무관하게 동작. 착수 시 시그니처·반환 형식 1줄 확인.

### Step 2 — 신규 세션 키 초기화 (init·reset·reroute 정합 — **4차 사실 정정**)
- 파일: `streamlit_walk_engine/pages/1_Navigation.py`.
- **실파일 구조(확정)**: `nav_raw_gps`=86행, `nav_last_alerted_state`=96행, `nav_last_reroute_ts_ms`=102행은 모두 **`_init()`(83~114)** 안. 알림 상태 리셋은 **`_reset()`(117~127, 125·126행)**. `↺ 초기화` 버튼(869~875)은 route/sample/prev만 리셋하고 **알림 상태 키는 건드리지 않음**.
- 따라서 신규 키 `nav_last_weak_toast_ts_ms`(초기값 `None`)를 **다음 3곳에만** 추가한다:
  - (a) **`_init()`(96행 `nav_last_alerted_state` 근처)** 에 `"nav_last_weak_toast_ts_ms": None` 항목 추가.
  - (b) **`_reset()`(125~126행 옆)** 에 `st.session_state["nav_last_weak_toast_ts_ms"] = None` 추가(`nav_last_alerted_state="on_route"`·`nav_last_reroute_ts_ms=None`과 동일 라인 그룹).
  - (c) **reroute update dict(907~916, `"nav_last_alerted_state": "on_route"` 옆)** 에 `"nav_last_weak_toast_ts_ms": None` 추가 — 재경로 직후 weak 쿨다운이 묶이지 않게.
- **(d) `↺ 초기화` 버튼(869~875)은 의도적으로 제외한다(결정 명문화)**: 이 버튼은 현재 `nav_last_alerted_state`·`nav_last_reroute_ts_ms`도 리셋하지 않는 자리다(기존 코드 구조). 여기에 weak ts만 끼워 넣으면 **패턴 불일치**(다른 알림 상태 키는 거기서 안 건드림)가 된다. 본 계획은 알림 상태 리셋을 **`_reset()`으로 통일**하고 버튼은 손대지 않는다. ※ 부수 관찰: `↺ 초기화` 버튼이 `nav_last_alerted_state`를 리셋하지 않는 것은 **기존 코드의 잠재 quirk**(초기화 후에도 직전 알림 상태가 남음)일 수 있으나, 본 과제 범위 밖이므로 수정하지 않고 Follow-up으로만 기록한다.
- ※ Phase 2에서 `GpsFilterState`(키 `nav_gps_filter_state`)를 도입하면 위 (a)(b)(c) 3곳에 `None`을 함께 추가해야 함(Step 7에서 명문화). 버튼(d)은 Phase 2에서도 동일 정책(제외/Follow-up).

### Step 3 — 신규 `gps_filter.py` 작성 (Phase 1: 분류 + 알림 결정, 전부 순수 함수)
- 신규 파일: `streamlit_walk_engine/gps_filter.py`. `engine.py`에서 **읽기 전용 import만**(`Coordinate`, `DeviationState` 등). 코어 수정 금지. 테스트 하네스는 `sys.path` 삽입 후 `from engine import` 패턴이므로 `from gps_filter import`도 동일하게 유효(확인됨).
- 모듈 상단 상수(노출):
  - `GOOD_ACCURACY_M = 15.0`, `FAIR_ACCURACY_M = 35.0` — 배지 경계.
  - `ALERT_ACCURACY_GATE_M = 15.0` — **억제 시작 실효 경계(슬라이더와 분리된 독립 상수)**. 배지 good(≤15m)과 일치시켜 사용자 인지·동작 정렬.
  - `WEAK_TOAST_COOLDOWN_MS = 15_000` — weak toast 쿨다운(reroute 쿨다운과 동일 값).
- 구현 함수(부수효과 없음):
  - `accuracy_quality(accuracy_m: float | None) -> Literal["good","fair","poor","unknown"]`: `None`→`unknown`, ≤`GOOD_ACCURACY_M`→`good`, ≤`FAIR_ACCURACY_M`→`fair`, 그 외→`poor`.
  - `alert_level(accuracy_m: float | None, engine_state: str, accuracy_gate_m: float = ALERT_ACCURACY_GATE_M) -> Literal["full","weak","mute"]` — **(S-1: 엔진 state 재사용)**:
    - `accuracy_m is None`(`unknown`, 수동 입력 등) → **`full`**(기존 동작 보존).
    - `accuracy_m <= accuracy_gate_m`(양호) → **`full`**.
    - `accuracy_m > accuracy_gate_m`(나쁨) **이고** `engine_state in ("deviated","passed_turn")`(확정 이탈) → **`weak`**.
    - 그 외(나쁨 + `on_route`/`drifting`) → **`mute`**. ※ **`drifting`을 mute로 두는 것은 의도된 결정**(MAJOR 3·ADR): heading 노이즈로 들어온 미확정 drift를 weak로 올리면 오탐이 재증가하기 때문. 진짜 이탈이면 `deviated`로 승격 시 weak 발화.
  - `decide_alert(state: str, last_alerted: str, level: str, now_ms: int, last_weak_ts_ms: int | None, alert_enabled: bool, cooldown_ms: int = WEAK_TOAST_COOLDOWN_MS) -> AlertDecision` — **(MAJOR 2: `alert_enabled` 인자 추가)**. 반환 `AlertDecision`(NamedTuple/dataclass) 필드:
    - `fire_full: bool` — `_trigger_alert(state)` 호출 여부.
    - `fire_weak_toast: bool` — `st.toast(...)` 경량 경고 호출 여부.
    - `new_last_alerted: str` — 호출부가 `nav_last_alerted_state`에 써야 할 값.
    - `new_last_weak_ts_ms: int | None` — 호출부가 `nav_last_weak_toast_ts_ms`에 써야 할 값.
    - 결정 규칙(상태 전이 게이트 `state != last_alerted`까지 함수 내부에 포함):
      - **`alert_enabled is False` → 최우선 분기**: `fire_full=False`, `fire_weak_toast=False`, **`new_last_alerted=last_alerted`(미갱신)**, `new_last_weak_ts_ms=last_weak_ts_ms`(불변). → 알림 OFF면 전이가 '소비'되지 않아, 재활성화 시 정상 발화(회복-누락 차단).
      - (이하 `alert_enabled is True`일 때만 평가)
      - `level == "full"` **그리고** `state != last_alerted` → `fire_full=True`, `new_last_alerted=state`, `new_last_weak_ts_ms=last_weak_ts_ms`(불변).
      - `level == "weak"` **그리고** `state != last_alerted` **그리고** (`last_weak_ts_ms is None` 또는 `now_ms - last_weak_ts_ms > cooldown_ms`) → `fire_weak_toast=True`, `new_last_alerted=state`, `new_last_weak_ts_ms=now_ms`.
      - `level == "weak"` 이지만 쿨다운 미경과(전이 있음) → 미발화, **`new_last_alerted=state`(동일 state 재토글 방지)**, `new_last_weak_ts_ms=last_weak_ts_ms`(불변).
      - `level == "mute"` → 미발화, **`new_last_alerted=last_alerted`(미갱신 — 안전 측 기본값)**, `new_last_weak_ts_ms=last_weak_ts_ms`(불변).
      - `state == last_alerted`(전이 없음, full/weak 공통) → 미발화, 상태·ts 불변.
- 이로써 **`alert_enabled` 보존·회복-재발화·mute 미갱신·weak 쿨다운 계약이 전부 `decide_alert` 반환값으로 표현**되어 pytest 입력→출력 단언 가능. `1_Navigation.py`는 이 함수를 호출해 받은 `AlertDecision`을 **그대로 실행·기록만** 한다.

### Step 4 — `1_Navigation.py` 알림 게이트를 `decide_alert` 호출로 교체 (최소 변경)
- 파일: `streamlit_walk_engine/pages/1_Navigation.py` (**878~893행 영역**).
- **엔진에는 raw `origin` 좌표를 그대로 투입**(`_make_sample` → `process_sample` 경로 무변경). 거리·heading 판정 정직성 보존(Principle 4).
- **거리·state 출처 단일화(MAJOR 1)**: `process_sample` 반환 `result`에서 **`result.metrics.distance_from_route_meters`**(engine.py:65)로 거리를, `result.state`로 엔진 판정을 읽는다. **"(없으면 raw distance 산출)" 폴백은 삭제**. (`EngineResult` engine.py:80~86에는 거리 필드가 없어 `result.distance_from_route` 접근은 `AttributeError`. 페이지는 이미 `373/384/440`행에서 동일 경로 사용 — 일관 확보.)
- **`_trigger_alert` 전제 정정(유지)**: `_trigger_alert`(`264~292`)는 `st.toast`+오디오+`navigator.vibrate`를 **한 함수에서 함께** 발생. "소리만 끄고 toast 유지"는 이 함수만으로는 불가. weak 경고는 `_trigger_alert` 미호출 + **`st.toast(...)`만 직접 호출**(소리/진동 없는 경량 화면 경고). "화면 표시 유지"의 실제 채널은 거리·상태·🔴배지 렌더링부.
- **`alert_enabled`를 `decide_alert`에 위임(MAJOR 2)**: 기존 `if st.session_state["nav_alert_enabled"] and ...:` 가드를 페이지에서 분기로 쓰지 않고, **`alert_enabled` 값을 `decide_alert` 인자로 넘긴다.** 페이지는 반환된 `fire_full`/`fire_weak_toast`/`new_last_*`를 그대로 실행·기록한다. → 기록이 가드 밖에서 무조건 일어나는 일이 없어진다.
- 게이트(`890~893`)를 다음 의미로 교체(동작 명세, 코드 아님):
  - `acc = (st.session_state["nav_raw_gps"] or {}).get("coords", {}).get("accuracy")` (Step 1 취득값, 수동 입력 시 `nav_raw_gps=None`→`acc=None`).
  - `lvl = gps_filter.alert_level(acc, result.state)`.
  - `now_ms = int(time.time()*1000)`.
  - `decision = gps_filter.decide_alert(result.state, st.session_state["nav_last_alerted_state"], lvl, now_ms, st.session_state["nav_last_weak_toast_ts_ms"], st.session_state["nav_alert_enabled"])`.
  - 실행: `if decision.fire_full: _trigger_alert(result.state)`; `if decision.fire_weak_toast: st.toast("⚠️ 경로 이탈 가능 — 위치 정확도 낮음, 확인 필요")`. (가드는 함수 안에서 이미 처리됨.)
  - 기록: `st.session_state["nav_last_alerted_state"] = decision.new_last_alerted`; `st.session_state["nav_last_weak_toast_ts_ms"] = decision.new_last_weak_ts_ms`. (`alert_enabled=False`·mute면 `new_last_alerted`가 기존값과 같아 미갱신 효과 — 안전 계약 보존.)
- **호출부 배선 한계 인정(MAJOR 4-b)**: 이 기록 라인(올바른 키에 올바른 반환값을 씀·`alert_enabled` 전달)은 **순수 함수 밖의 "마지막 1cm"이며 단위테스트로 증명되지 않는다.** 키 오타·인자 누락은 순수 함수가 옳아도 버그를 낸다 → 코드 리뷰(수락기준 7) + 실기기 D-4로만 검증됨을 ADR에 명시.
- 폴백 경로(`754~763` 수동 입력)는 accuracy `None`(`unknown`) → `alert_level=full` → `decide_alert`(alert_enabled=True 가정) → **기존 동작 그대로**.
- 변경 표면: GPS 취득부(Step 1) + 세션 키 3곳(Step 2) + 알림 게이트를 `decide_alert` 호출로 교체(`890~893` 영역) + 사이드바 배지(Step 5). `_make_sample`·`process_sample`·`engine.py`·`nav_prev_coord`/`nav_prev_ts_ms` 갱신(`887~888`)·재경로 분기 본체(`895~919`, 단 update dict에 weak ts 리셋 1줄 추가)는 **로직 무변경**.

### Step 5 — 사이드바 정확도 배지 (+ 선택적 게이트 슬라이더, 표시, 억제 경계와 일치)
- 파일: `streamlit_walk_engine/pages/1_Navigation.py`, "현재 위치" 섹션(`765~779행 근처`).
- 배지(억제 경계 `ALERT_ACCURACY_GATE_M`=15m와 일치): good(≤15m)=🟢 "정확도 좋음 — 알림 정상" / fair(≤35m)=🟡 "정확도 보통 — 알림 신뢰도 낮음" / poor(>35m)=🔴 "정확도 낮음 — 약한 경고만" / unknown=⚪ "수동 입력". 비개발자용 한 줄 설명 포함.
- **선택(Architect S-D — 게이트 상수 슬라이더 Phase 1 노출)**: 배지 옆에 "정확도 민감도(m)" 슬라이더 1개를 노출해 `accuracy_gate_m`를 런타임 조정 가능하게 하면, 현장 부적합 시 재실기기 검증 대신 즉시 튜닝 가능. 변경 표면이 작으므로 **Phase 1 선택지로 포함**(미채택 시 Follow-up). 단 이 슬라이더는 이탈 민감도 슬라이더(`dev_threshold`)와 **별개 축**(측정 신뢰도 vs 판정 민감도)임을 라벨로 구분.
- **`_build_map` accuracy 반경 원은 Phase 1에서 제외**(Follow-up): "정확도 향상" 본질과 무관한 표시 개선이며 `_build_map`(330행~) 변경은 최소 변경 표면을 넓힌다.

### Step 6 — Phase 1 테스트 작성 (`decide_alert` 순수함수 직접 단언)
- 신규 파일: `streamlit_walk_engine/tests/test_gps_filter.py` (기존 `tests/test_scenarios.py:21~58` 패턴 모델, `sys.path` 삽입 후 `from gps_filter import`).
- 케이스:
  - (a) `accuracy_quality` good/fair/poor/unknown 경계값(15/35m, None) 분류.
  - (b) `alert_level`: poor(40m) + `engine_state="on_route"` → `mute`.
  - (c) good(10m) + 임의 state → `full`.
  - (d) `unknown`(None) → `full`(기존 동작 보존).
  - (e) **weak 검증(S-1)**: poor(40m) + `engine_state="deviated"` → `weak`; `passed_turn`도 `weak`.
  - (e2) **heading 사각지대 결정 명문화(MAJOR 3)**: poor(40m) + `engine_state="drifting"` → `mute`(weak 아님). 의도된 동작임을 테스트로 고정.
  - (f) **`decide_alert` mute 미갱신(CRITICAL)**: `decide_alert(state="deviated", last_alerted="on_route", level="mute", alert_enabled=True, ...)` → `fire_full=False`, `fire_weak_toast=False`, **`new_last_alerted=="on_route"`(미갱신)**.
  - (g) **회복-재발화(CRITICAL)**: (f) 이후 동일 state·distance에서 accuracy만 10m로 회복 → `alert_level→"full"`, `decide_alert(state="deviated", last_alerted="on_route", level="full", alert_enabled=True, ...)` → `fire_full=True`, `new_last_alerted=="deviated"`.
  - (h) **weak 쿨다운(MAJOR 3-3차)**: `decide_alert(level="weak", last_alerted="on_route", state="deviated", now_ms=T, last_weak_ts_ms=None, alert_enabled=True)` → `fire_weak_toast=True`, `new_last_weak_ts_ms==T`. 직후 `now_ms=T+5000, last_weak_ts_ms=T`(전이 있음, 쿨다운 미경과) → `fire_weak_toast=False`. `now_ms=T+20000`(전이) → 재발화 가능.
  - (i) `state == last_alerted`(전이 없음) → full/weak 공통 미발화·상태 불변.
  - (j) `accuracy_gate_m`를 바꿔도(예 20m) `full`/`weak`/`mute` 경계가 올바르게 동작.
  - **(k) `alert_enabled=False` 보존(MAJOR 2 — 신규 필수)**: `decide_alert(state="deviated", last_alerted="on_route", level="full", alert_enabled=False, ...)` → `fire_full=False`, `fire_weak_toast=False`, **`new_last_alerted=="on_route"`(미갱신)**, `new_last_weak_ts_ms==last_weak_ts_ms`(불변). 이어서 같은 입력에 `alert_enabled=True`면 `fire_full=True`·`new_last_alerted=="deviated"`(재활성화 시 정상 발화 — 회복-누락 없음)를 단언.

### ── Phase 2 (조건부 — Phase 1 실기기 효용 입증 시에만 진입) ──

> **진입 조건**: Phase 1을 D-1~D-4로 검증한 뒤, **게이팅만으로 흡수되지 않는 잔여 오탐/지속적 점프/표시 마커 흔들림이 실제 관측될 때**에만 착수. (표시 마커 흔들림은 도심 Android에서 거의 확실히 관측되므로 — Architect Antithesis — 체감 개선이 필요하면 Phase 2의 "표시용 EMA만" 부분을 우선 도입할 수 있다.)

### Step 7 — `gps_filter.py`에 점프 제거 + 표시용 EMA + 멱등성 가드 + state 리셋 연동
- `GpsFilterState`(dataclass): 직전 **표시용** 스무딩 좌표·**직전 처리 timestamp**·직전 accuracy 보관. 세션 키 `nav_gps_filter_state`.
- **신규 state의 reroute/reset 리셋 연동**: 도입 시 **`_init()`·`_reset()`·reroute update dict 3곳에서 `nav_gps_filter_state=None`을 함께 처리**(Step 2의 3곳에 키 1개 추가; `↺ 초기화` 버튼은 Phase 1과 동일하게 제외/Follow-up). prev 좌표 오염 방지.
- **멱등성 가드**: EMA·드롭 로직은 **`nav_raw_gps`의 timestamp가 직전 처리분과 다를 때만 실행**. Streamlit은 위젯 조작으로도 rerun되므로 동일 좌표 중복 처리 시 EMA 과수렴/`dt_ms≈0` implied speed 폭발. timestamp 동일 시 직전 스무딩 좌표 반환·state 미갱신.
  - **사전 확인**: Phase 2 진입 시 `get_geolocation()`이 매 rerun 새 `timestamp`를 주는지 실기기로 확인(브라우저 캐시로 동일 timestamp 반복 시 멱등 가드가 정상 좌표까지 멈출 수 있음).
- `is_outlier_jump(prev, curr, dt_ms, accuracy_m) -> bool`: implied speed가 물리적 불가능(>12 m/s)하거나 accuracy 반경을 크게 벗어나면 True.
- `smooth_for_display(state, raw_coord, accuracy_m, alpha) -> Coordinate`: **표시용 좌표에만** EMA. accuracy 좋을수록 raw 반영↑.
- **결함 D — 드롭 샘플 엔진 계약(CRITICAL)**: 점프 샘플은 (a) **엔진 미투입**(`process_sample` 미호출), (b) **`nav_prev_coord`·`nav_prev_ts_ms` 미갱신**(`887~888` 미실행). speed 산출과 `engine.py:513~522` drift 타이머 시간 연속성 보존. 표시용 좌표만 직전값 유지.
- **결함 C — heading 둔감화 차단(MAJOR)**: EMA는 표시용 좌표에만, **엔진엔 끝까지 raw**. `_make_sample` bearing-heading 평활화 안 됨 → `engine.py:528~555` `passed_turn` 약화 방지.

### Step 8 — Phase 2 테스트 추가
- (l) 점프 좌표 입력 시 표시용만 직전값 유지·엔진 투입 신호 없음, (m) EMA 표시 좌표가 직전값과 raw 사이, (n) 드롭 시 prev 미갱신 계약, (o) 멱등성(동일 timestamp 재입력 시 state 미갱신·동일 좌표 반환), (p) `GpsFilterState` reroute/reset 리셋 후 prev 오염 없음, (q) 정지 노이즈가 게이팅+드롭으로 알림 미발생(회귀).

---

## 6. 테스트 가능한 수락 기준

1. **단위 테스트 통과**: `python -m pytest streamlit_walk_engine\tests -q` → 신규 `test_gps_filter.py`(Phase 1 케이스 a~k) 포함 전부 PASS, 기존 테스트 회귀 없음.
2. **정확도 분류 검증**: `accuracy_quality(10/30/50/None)` → 각각 `good/fair/poor/unknown`(단언).
3. **3단계 알림(거리 출처 단일화·S-1·heading 사각지대) 검증**: `alert_level(40,"on_route")`→`"mute"`, `alert_level(40,"deviated")`→`"weak"`, **`alert_level(40,"drifting")`→`"mute"`(MAJOR 3 결정 고정)**, `alert_level(10,"deviated")`→`"full"`, `alert_level(None,"deviated")`→`"full"`(단언). 거리값은 `result.metrics.distance_from_route_meters`로 읽고 `result.distance_from_route` 미접근(코드 리뷰+실행 무오류).
4. **`decide_alert` 안전 계약 직접 단언(MAJOR 2·CRITICAL)**:
   - mute(alert_enabled=True) → `fire_full=False`·`fire_weak_toast=False`·`new_last_alerted==last_alerted`(미갱신).
   - 회복(accuracy 40→10) 후 full → `fire_full=True`·`new_last_alerted==state`.
   - **`alert_enabled=False`(MAJOR 2)** → `fire_full=False`·`fire_weak_toast=False`·`new_last_alerted==last_alerted`·`new_last_weak_ts_ms` 불변; 직후 `alert_enabled=True` 동일 입력이면 `fire_full=True`(재활성화 시 정상 발화).
   - 전부 `gps_filter.decide_alert` 순수 함수 입출력으로 단언(세션상태 부수효과 의존 없음).
5. **weak 쿨다운 검증**: `decide_alert(level="weak", last_alerted="on_route", state="deviated", now_ms=T, last_weak_ts_ms=None, alert_enabled=True)` → `fire_weak_toast=True`·`new_last_weak_ts_ms==T`. 쿨다운 내(`T+5000`, 전이) → `fire_weak_toast=False`. 쿨다운 경과(`T+20000`, 전이) → 재발화 가능.
6. **코어 불변 검증**: `git diff --stat`에 `streamlit_walk_engine/engine.py`·`packages/route-engine/*` 변경 **없음**.
7. **`1_Navigation.py` 변경 최소성 + 세션 키 위치 정합(4차)**: diff가 GPS 취득부(`741~746`)·세션 키 **3곳**(`_init()` 96 근처·`_reset()` 125~126 옆·reroute update dict 907~916)·알림 게이트 교체(`890~893` 영역)·사이드바 배지(`765~779`)에 국한. **`↺ 초기화` 버튼(869~875)에는 `nav_last_weak_toast_ts_ms`를 추가하지 않음**(Step 2-d 결정). `_make_sample`·`process_sample` 호출부(`881~888`)·재경로 분기 로직 본체·`_build_map`(`330~`)은 로직 무변경. **호출부 배선(반환값→세션 키 기록·`alert_enabled` 전달)은 코드 리뷰로 확인**(단위테스트 밖, MAJOR 4-b).
8. **화면/소리 분리 검증**: `mute`/`alert_enabled=False`에서 `_trigger_alert`·`st.toast` 모두 미호출이나 거리·상태·🔴배지 렌더링부는 호출됨(코드 리뷰). weak에서 `st.toast`만 호출, `_trigger_alert`(소리/진동) 미호출.
9. **드롭 계약·멱등성·state 리셋 검증(Phase 2 진입 시)**: 점프 좌표 입력 시 표시용만 직전값 유지·prev 미갱신·엔진 미투입. 동일 timestamp 재입력 시 state 미갱신. reroute/reset 후 `nav_gps_filter_state` None화.
10. **수동 관찰(실기기)**: Android Chrome에서 정지 시 이탈 소리/진동 미발생(mute), poor 구간에서 엔진이 확정 이탈 판정 시 toast 경고(weak, 15초당 최대 1회) 표시, 정상 이동 시 경로 추종, 사이드바 배지 표시, **알림 토글 OFF→ON 후 진행 중 이탈이 정상 발화(MAJOR 2)**.

---

## 7. 검증 절차

**A. 자동 (필수)**
```powershell
cd D:\walk
python -m pytest streamlit_walk_engine\tests -q
python -m py_compile streamlit_walk_engine\gps_filter.py streamlit_walk_engine\pages\1_Navigation.py
```
- 신규 `test_gps_filter.py` 케이스(a~k, 특히 `decide_alert` 안전 계약 f/g/h/k) 포함 전부 통과 확인.

**B. 코어 불변 확인 (필수)**
```powershell
git status --short
git diff --stat
```
- `engine.py` / `packages/route-engine/*` 미변경 확인.

**C. 로컬 실행 (PC)**
```powershell
python -m streamlit run streamlit_walk_engine\pages\1_Navigation.py
```
- 위치 권한 허용 → 사이드바 정확도 배지(+선택 게이트 슬라이더) 표시 확인.

**D. 수동 시나리오 (Android 실기기 — 필수, 파라미터·rerun·호출부 배선 현장 검증의 유일한 수단)**
- **D-1 정지 테스트**: 가만히 서서 nav 실행 → 이탈 소리/진동 미발생(`mute`). autorefresh 3초에도 toast 폭주 없어야 함.
- **D-2 정상 이동**: 경로 따라 걸으며 현재 위치 마커 추종·정상 안내(`full`) 유지.
- **D-3 정확도 저하 + 진짜 큰 이탈(weak·쿨다운·heading 사각지대 검증)**: 건물 사이·실내 근처에서 배지 🟡/🔴 상태로 **경로를 크게 벗어나 엔진이 `deviated`로 판정했을 때 toast 약한 경고**가 뜨는지, 같은 구간 15초 안에 toast 미폭주, 화면 거리/상태 계속 표시. **추가**: poor 구간에서 가만히 있을 때 heading 노이즈로 `drifting`이 떠도 소리/진동/toast 미발생(mute 사각지대가 의도대로인지) 관찰.
- **D-4 회복-재발화 + 알림 토글(CRITICAL·MAJOR 2)**: ① poor 구간 이탈(mute로 소리 억제) → 정확도 좋은 곳으로 나왔을 때(여전히 이탈) **소리/진동 정상 재발화** 확인. ② 이탈 진행 중 알림 토글을 OFF→ON 했을 때 그 이탈이 **재활성화 후 정상 발화**하는지 확인(영구 누락 없음).
- ※ localhost와 공유기(같은 와이파이) 접속을 구분해 보고. 실기기 검증 불가 시 **"미검증"으로 명시**. **Phase 2 진입 여부는 D-1~D-4 결과로 결정.**

---

## 8. 리스크와 완화책

| 리스크 | 영향 | 완화책 |
|---|---|---|
| **[CRITICAL·4차] 세션 키 리셋 위치 사실 오류** — `↺ 초기화` 버튼(869~875)은 알림 상태 미리셋, `_reset()`(117~127)이 담당 | 실행자 오배치·CRITICAL 회복 계약 깨짐 | **Step 2를 `_init()`(96)·`_reset()`(125~126)·reroute dict(907~916) 3곳으로 재기술, 버튼은 의도적 제외**(결정 명문화). 수락기준 7로 확인. |
| **[MAJOR 2·4차] `alert_enabled=False` 시 상태 기록 → 재활성화 후 영구 누락** | 안전 기능 실패 | **`decide_alert`에 `alert_enabled` 인자 추가**, OFF면 발화·기록 전부 건너뜀(순수 함수 내부 처리). 테스트 (k)·수락기준 4·D-4②로 단언. |
| **[MAJOR 3·4차] heading 노이즈로 `drifting` 진입 시 mute(게이팅 사각지대)** | 드물게 진짜 heading 이탈 초기 신호 묵음 | **의도된 안전 측 결정으로 ADR 명문화**: `drifting`은 미확정, poor heading drift는 노이즈일 확률↑. 진짜 이탈이면 `deviated` 승격 시 weak 발화. 테스트 (e2)·수락기준 3·D-3로 고정. |
| **[MAJOR 4-a] 표시 평활화 부재 = 사용자 체감 정확도 미개선** | 과제명-산출물 간극, 사용자 기대 불일치 | ADR Consequences에 명시. 체감 개선 필요 시 Phase 2 "표시용 EMA만" 부분을 우선 도입(진입 조건 완화). |
| **[MAJOR 4-b] 호출부 배선("마지막 1cm") 미검증** | 순수 함수가 옳아도 키 오타·인자 누락 시 버그 | ADR 명시 + 코드 리뷰(수락기준 7) + 실기기 D-4로만 검증됨을 인정. |
| **[실행 차단] 거리 출처 오기** — `result.distance_from_route` 미존재(engine.py:80~86) | 실행자 `AttributeError` | `result.metrics.distance_from_route_meters`(engine.py:65) 단일 출처·폴백 삭제. 페이지 기존 `373/384/440` 동일 경로. 수락기준 3. |
| **[P5] 핵심 안전 계약이 세션상태 부수효과에 있어 pytest 불가** | 안전 기능 미검증 | `decide_alert` 순수 함수 추출, 회복-재발화·mute 미갱신·weak 쿨다운·`alert_enabled` 보존을 입출력 단언. 수락기준 4·5. |
| **[Phase 1 완결] weak toast 폭주** — autorefresh 3000ms 경계 진동 | UX 피로 | `nav_last_weak_toast_ts_ms` 15초 쿨다운(reroute 쿨다운 동일 패턴), `decide_alert` 내장. D-3 확인. |
| **[Tradeoff·핵심] accuracy 나쁜 구간 = 길 잃기 쉬운 구간** 알림 억제 시 미탐 | 안전성(핵심) | 엔진이 `deviated`/`passed_turn`으로 본 이탈은 accuracy 나빠도 `weak` 유지. `mute`는 엔진이 확정 이탈로 안 본 흔들림에만. accuracy 회복 즉시 `full`. D-3·D-4로 검증. |
| **[CRITICAL] 억제 시 `nav_last_alerted_state` 갱신 → 영구 누락** | 안전 기능 실패 | `decide_alert`가 mute/`alert_enabled=False` 시 `new_last_alerted=last_alerted`(미갱신) 반환. 수락기준 4·D-4①. |
| **[긴장 A·B] 엔진 불가침 vs raw 투입(특히 heading 노이즈)** | 설계 인지 부담 | Principle 4에서 명시 인정. 페이지 평행 상수 미생성, 엔진 `result.state` 강등(S-1). heading 사각지대는 MAJOR 3로 의식적 처리. |
| **[전제 정정] `_trigger_alert`가 toast+소리+진동 결합(264~292)** | "화면만 유지" 오구현 | 화면 유지 채널은 거리·상태·배지 렌더링부. weak는 `st.toast`만 직접 호출. 수락기준 8. |
| 게이팅 기준이 슬라이더(`dev_threshold`)와 엮이면 민감도↑ 시 게이팅 느슨 | 게이팅 신뢰도 저하 | `ALERT_ACCURACY_GATE_M`=15m 독립 상수(ADR). 선택적 별도 슬라이더로만 노출(Step 5·S-D). |
| 게이트 상수(15/35m) 현장 부적합 | 오탐/누락 | 단위테스트는 로직만 증명. 현장 적합성은 D-1~D-4로만 검증. **Step 5 선택 슬라이더로 런타임 튜닝 가능**(재실기기 사이클 절감). |
| `streamlit_js_eval.get_geolocation()` 고정밀 옵션 미지원 | Step 1 옵션 부분 무효 | accuracy 취득(주 효과)은 옵션 무관. raw-JS 1줄 실험으로 시도, 실패 시 옵션만 생략(best-effort). |
| `accuracy` 미제공/수동 입력 | unknown 처리 | `unknown`은 `alert_level=full`(게이팅 미적용)로 기존 동작 보존. |
| **[Phase 2] EMA 감지 지연/heading 둔감화·드롭 시간연속성 왜곡·rerun 중복 처리·신규 state 미리셋** | 이탈 지연·상태 손상 | EMA 표시용 한정·엔진 raw(결함 C), 드롭 시 엔진 미투입+prev 미갱신(결함 D), timestamp 멱등성 가드, reroute/reset 3곳 `nav_gps_filter_state=None` 연동. D로 timestamp 갱신 주기 확인. |
| Streamlit Cloud와 로컬 차이 | 배포 시 | 신규 의존성 0(순수 Python) → `requirements.txt` 무변경 → Cloud 영향 없음. |

---

## 9. ADR

- **Decision**: GPS 정확도 향상을 **2단계 점진 도입**으로 수행한다. **Phase 1(필수)**: 신규 `streamlit_walk_engine/gps_filter.py`(순수 함수)에 `accuracy_quality`·`alert_level(accuracy, engine_state, gate)`·**`decide_alert(state, last_alerted, level, now_ms, last_weak_ts_ms, alert_enabled, cooldown_ms) -> AlertDecision`**을 구현하고, `1_Navigation.py`의 알림 게이트(`890~893` 영역)를 이 순수 함수 호출로 교체한다 — `decide_alert`가 `alert_enabled=False`(전부 미발화·미갱신), `mute`(억제 + `nav_last_alerted_state` 미갱신), `weak`(`st.toast`만 + 15초 쿨다운), `full`(기존 `_trigger_alert` + 상태 갱신)을 결정해 반환하고 페이지는 실행·기록만 한다. 거리·state 출처는 **`result.metrics.distance_from_route_meters`·`result.state` 단일 출처**(폴백 삭제). weak 판정은 새 상수 대신 **엔진 `result.state(deviated/passed_turn)` + accuracy>gate 재사용**. 엔진엔 raw 좌표 그대로 투입, 화면 표시·`process_sample`·`engine.py`/TS 엔진·prev 갱신·재경로 분기 로직 무변경(신규 세션 키 리셋 1줄만 추가). 신규 세션 키 `nav_last_weak_toast_ts_ms`는 **`_init()`·`_reset()`·reroute update dict 3곳에만** 추가하고 `↺ 초기화` 버튼은 의도적으로 제외한다. **Phase 2(조건부)**: Phase 1을 실기기로 검증해 잔여 오탐/지속적 점프/표시 마커 흔들림이 관측될 때만 점프 제거 + **표시용 좌표 한정 EMA** + **timestamp 멱등성 가드** + **`GpsFilterState`의 reroute/reset 리셋 연동**을 추가하며, 드롭 샘플은 엔진 미투입·prev 미갱신으로 계약을 고정한다.
- **Drivers**: (1) `engine.py:503~510`이 raw distance(및 heading_conflict 6m 경로)를 고정 임계값과 직접 비교해 **지속적 큰 accuracy 구간**에서 발생하는 오탐, (2) **미탐(진짜 이탈 누락)이 보행 내비에서 오탐보다 치명적** — poor 구간에서 유일 알림을 통째로 끄면 안 됨, (3) `1_Navigation.py` 최소 변경·엔진 이중 유지보수 회피 + **알림 결정(`alert_enabled` 포함)의 pytest 검증가능성**(P5).
- **Alternatives considered**:
  - A) 브라우저 옵션 only — 단독 오탐 미해결, 래퍼 미지원 가능성. → B-minimal best-effort 1단계로 흡수하되, **3차의 "거의 폐기"는 과소평가였으므로 raw-JS `enableHighAccuracy` 1줄 실험을 Step 1에 명시**(Architect S-B).
  - **B-minimal(3단계 게이팅 + decide_alert(alert_enabled) + weak 쿨다운)** — 채택(Phase 1). 기존 3중 내성과 결합해 Driver 1 해결 + `weak`로 Driver 2(미탐) 해결, 알림 결정 전체가 순수 함수라 P5 충족, 버그 표면 최소.
  - B-full(3단계+EMA+점프) — Phase 2 조건부 유예. 효용이 실기기로 입증되기 전엔 도입 안 함. 단 **표시 마커 흔들림(체감 정확도)은 도심 Android에서 거의 확실히 관측되므로**, 체감 개선이 필요하면 "표시용 EMA만" 부분 도입을 진입 조건으로 허용.
  - D) 임계값 동적 확장 — **무효화**. 코어 인접·TS 이중 유지보수 + 진짜 이탈 둔감. 장점(미탐 방지)은 B-minimal `weak`로 코어 밖에서 흡수.
  - E) `PositionSample.accuracy_m` 필드 추가 — **무효화(분석 공백 보완으로 명시)**. dataclass 확장 자체는 코어 불가침을 칼만큼 위반하지 않고 SSOT를 가장 정직하게 봉합하나, 엔진이 *참조하게* 하려면 `evaluate_deviation_step`를 손대야 하고 이는 TS 엔진 이중 유지보수 동기화 부담(AGENTS.md)으로 직결. 통찰은 S-1(weak=엔진 state 재사용)로 부분 흡수, Follow-up (4).
  - C) 칼만 — 드문 샘플·비개발자 맥락 과잉으로 무효화(Follow-up).
- **Why chosen**: 코어를 건드리지 않고 오탐의 Root Cause(고정 임계값 직접 비교)를 입력단 게이팅으로 차단하면서, **미탐 위험까지 `weak` 단계로 Phase 1에서 함께 해소**하는 최저위험 경로다. 알림 결정 전체를 `decide_alert` 순수 함수로 추출하고 **`alert_enabled`까지 함수 인자로 흡수**해, 가장 중요한 안전 계약(영구 누락 방지·회복 재발화·weak 쿨다운·알림 OFF 보존)을 **pytest로 직접 검증**한다(P5 자기모순·MAJOR 2 동시 제거). 거리·state 출처를 엔진 기존 필드 단일 출처로 못박아 평행 상수와 `AttributeError`를 동시에 제거한다. EMA를 Phase 1에서 빼면 결함 B/C/D·멱등성·state 리셋 함정이 애초에 발생하지 않는다. 신규 의존성 0으로 Cloud 영향 없음.
- **명시적 정책 결정(게이팅 독립 상수)**: `alert_level`의 비교 기준 `accuracy_gate_m`는 사이드바 이탈 민감도 슬라이더(`dev_threshold`)와 연동하지 않고 독립 상수(`ALERT_ACCURACY_GATE_M`=15m)로 고정한다. 이유: 슬라이더는 "얼마나 벗어나면 이탈로 볼지"(판정 민감도), 게이팅 기준은 "GPS를 얼마나 믿을지"(측정 신뢰도)로 의미 축이 다르다. 묶으면 민감도를 올릴 때 게이팅이 의도치 않게 느슨해진다. **별도 "정확도 민감도" 슬라이더 노출은 Step 5 선택지로 Phase 1에 포함 가능**(Architect S-D).
- **명시적 정책 결정(heading 노이즈 사각지대 — MAJOR 3)**: `engine.py:507~510`의 heading_conflict 경로(거리 6m + heading 45°)로 poor 구간 raw heading 노이즈가 `drifting`을 만들 수 있으나, **`alert_level`은 `drifting`을 `weak`로 올리지 않고 `mute`로 둔다.** 근거: `drifting`은 엔진이 아직 확정 이탈로 보지 않은 상태이고, poor 구간의 heading-only drift는 노이즈일 확률이 높아 weak로 올리면 오탐이 재증가한다. 진짜 heading 이탈이면 거리가 벌어지거나 `consecutive`/`drift_duration`이 쌓여 `deviated`로 승격되고 그때 weak가 발화한다. **사각지대(드물게 진짜 heading 이탈 초기 신호를 mute)는 의식적으로 수용**하며, 거리·상태·🔴배지는 화면에 계속 표시되어 화면을 보는 사용자에게는 단서가 남는다.
- **Consequences**:
  - 신규 모듈 1개(`gps_filter.py`) + 테스트 1개. `1_Navigation.py`에 accuracy 취득·세션 키 1개(`nav_last_weak_toast_ts_ms`, **3곳** 추가)·알림 게이트의 `decide_alert` 호출 교체·정확도 배지(+선택 슬라이더)가 추가됨(최소, 결정 로직은 모듈로 이전). 변경 표면이 "한 곳"은 아니고 **분산 3~4지점이나 각각 1~2줄**임을 정직하게 기술한다.
  - **(MAJOR 4-a) 표시 좌표 미개선 = 사용자 체감 정확도 미개선**: Phase 1은 raw 좌표를 그대로 지도에 표시하므로 도심에서 마커는 여전히 흔들린다. 본 계획은 "정확도 향상"이라기보다 정확히는 **"부정확함에 대한 알림 강건성(robustness) 향상"**이다. 사용자가 화면을 보면 "위치가 여전히 튄다"고 느낄 수 있다. 체감 개선(표시 평활화)은 Phase 2 또는 enableHighAccuracy(Step 1 실험)에 의존한다.
  - **(MAJOR 4-b) 호출부 배선 미검증**: `decide_alert` 반환값을 올바른 세션 키에 기록하고 `alert_enabled`를 전달하는 "마지막 1cm"은 순수 함수 밖이라 단위테스트로 증명되지 않는다. 키 오타·인자 누락은 순수 함수가 옳아도 버그를 낸다 → 코드 리뷰 + 실기기 D-4로만 검증된다.
  - poor 구간에서 엔진이 이탈로 안 본 흔들림(및 heading 노이즈 `drifting`)은 묵음(`mute`)이라 화면 미시청 시 그 흔들림은 놓치나, 이는 오탐이므로 의도된 동작이다. **엔진이 확정 이탈로 본 큰 이탈은 `weak`(15초당 최대 1회)로 유지**되어 미탐 안전 공백이 메워지고 toast 폭주도 막힌다. `mute`·`alert_enabled=False` 시 상태 미갱신으로 회복/재활성화 후 정상 재발화 보장. 페이지가 엔진 `result.state`를 재사용하므로 평행 상수가 줄지만, 엔진 임계값과 게이트(15m)의 의미가 미래에 어긋날 가능성은 잔존(Follow-up E). Phase 2 진입 시에만 EMA·점프·멱등성·state 리셋 로직과 파라미터 검증 부담 발생.
- **Follow-ups**: (1) `_build_map` accuracy 반경 원 표시(표시 개선, 본 과제와 분리). (2) `ALERT_ACCURACY_GATE_M`·good/fair/poor 경계·`WEAK_TOAST_COOLDOWN_MS`·EMA alpha를 사이드바 슬라이더로 노출(게이트 슬라이더는 Step 5에서 Phase 1 선택). (3) Phase 2 EMA 효용이 실기기로 입증되면 도입(체감 개선 필요 시 표시용 EMA 우선). (4) **옵션 E(`PositionSample.accuracy_m` + 엔진 참조) 재검토** — 페이지 게이팅이 엔진 임계값과 어긋나는 일관성 문제가 실제로 드러나면 TS 동기화 비용 감수하고 SSOT 봉합. (5) 효용 추가 입증 시 칼만 재검토. (6) **`↺ 초기화` 버튼이 `nav_last_alerted_state`를 리셋하지 않는 기존 quirk** 정합화(본 과제 범위 밖, 별도 검토). (7) heading 노이즈 사각지대가 실기기에서 진짜 이탈 누락을 일으키면 `drifting+poor+거리 근접`을 weak 후보로 재검토. (8) `get_geolocation()` 매 rerun timestamp 갱신 주기 실기기 확인(Phase 2 멱등성 가드 전제). (9) 다른 OS/브라우저 호환성 점검(현재 Windows·Android 우선).

---

**참고 — 검토자(Architect/Critic)용 4차 개정 변경 요약 (Critic CRITICAL 1·MAJOR 2~4 + Architect 잔여 지적 전량 흡수)**
- **[CRITICAL 1 — 세션 키 리셋 위치 사실 정정]** Step 2·수락기준 7을 실파일 구조에 맞게 재기술. `↺ 초기화` 버튼(869~875)은 알림 상태 미리셋 → 신규 키는 `_init()`(96)·`_reset()`(125~126)·reroute dict(907~916) **3곳에만** 추가, 버튼은 의도적 제외(결정 명문화). init 행 표기(86/96/102) 정정.
- **[MAJOR 2 — `alert_enabled=False` 회복-누락]** `decide_alert` 시그니처에 `alert_enabled` 추가, OFF면 발화·기록 전부 건너뜀(순수 함수 내부 처리). Step 3·4, 테스트 (k), 수락기준 4, D-4②로 단언.
- **[MAJOR 3 — heading 노이즈 게이팅 사각지대]** `drifting`을 mute로 두는 것이 의도된 안전 측 결정임을 ADR에 명문화. 테스트 (e2)·수락기준 3·D-3로 고정. engine.py:507~510 heading_conflict 경로 명시.
- **[MAJOR 4 — ADR 보강 2건]** (a) "표시 평활화 부재 = 체감 정확도 미개선" trade-off, (b) 호출부 배선("마지막 1cm") 미검증을 ADR Consequences에 명시.
- **[MINOR]** enableHighAccuracy raw-JS 1줄 실험을 Step 1에 명시(Architect S-B). 게이트 상수 슬라이더를 Step 5 Phase 1 선택지로 격상(Architect S-D). reroute dict가 `nav_prev_ts_ms` 미리셋하는 quirk를 Phase 2 인지 항목으로 기록.
- (3차 흡수분 — 거리 출처 단일화, `decide_alert` 순수 함수, weak 쿨다운 Phase 1, 옵션 E ADR, S-1 평행상수 제거 — 및 2차 흡수분 전부 유지.)