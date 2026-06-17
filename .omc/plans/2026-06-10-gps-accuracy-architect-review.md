## Summary

계획은 4차 개정을 거치며 file:line 근거가 대부분 실제 코드와 일치하고(특히 4차에서 정정한 `_init`96/`_reset`125-126/버튼869-875/reroute915 위치 모두 검증됨), 코어 불가침·순수 함수 분리·미탐 우선 안전 설계라는 골격은 견고하다. 그러나 **두 가지 사실 기반 결함**을 발견했다: (1) **MAJOR 2의 전제가 현재 코드와 다르다** — 알림 기록(`nav_last_alerted_state` 갱신, 893행)은 이미 `if nav_alert_enabled` 가드 *안*에 있어, 계획이 막으려는 "OFF 상태에서 전이 소비" 버그는 **현재 존재하지 않는다**. (2) **MAJOR 3은 no-op이 아니라 현행 동작을 바꾼다** — `_ALERT` dict(258행)에 `drifting`이 포함되어 있어 현재 코드는 `drifting` 진입 시 **소리+진동을 실제로 발화**한다. 계획의 `mute(drifting+poor)`는 "의도된 안전 측 동작"이 아니라 **현재 울리는 알림을 끄는 동작 변경**이다. 이 두 가지는 ADR과 테스트 계약을 바꿔야 하는 사실 오류다.

## Analysis (검증된 ground truth)

직접 파일을 열어 계획의 핵심 주장을 대조했다.

**일치 확인된 주장 (4차 개정이 옳음):**
- `_init()` 83-114, `nav_raw_gps`=86, `nav_last_alerted_state`=96, `nav_last_reroute_ts_ms`=102 — 모두 정확. (`1_Navigation.py:86,96,102`)
- `_reset()` 117-127, 알림 상태 리셋 125-126행, reroute count 127 — 정확. (`1_Navigation.py:117-127`)
- `↺ 초기화` 버튼 869-875는 `("nav_route","nav_dest","nav_engine","nav_results","nav_samples","nav_prev_coord","nav_prev_ts_ms")` + `nav_running`만 리셋, **알림 상태 키 미건드림** — 계획 주장 정확. (`1_Navigation.py:871-874`)
- reroute update dict 907-916, `"nav_last_alerted_state": "on_route"`=915, **`nav_prev_ts_ms` 미리셋**(quirk) — 정확. (`1_Navigation.py:907-916`)
- `_trigger_alert` 264-292: `st.toast` + AudioContext + `navigator.vibrate`가 **한 함수에 결합** — 정확. (`1_Navigation.py:264-292`)
- engine breach: `threshold_breach = drift_breach OR (heading_conflict AND distance >= 10*0.6=6m)` — 정확. (`engine.py:507-510`)
- `deviated`/`drifting` 산출 565-578, `EngineMetrics.distance_from_route_meters`=65, `EngineResult`에 거리 필드 없음(80-86) — 정확. 계획의 "거리 출처 단일화(`result.metrics.distance_from_route_meters`), `result.distance_from_route` 미접근" 지적 타당. (`engine.py:65,80-86,503-510,565-578`)
- 테스트 하네스 `sys.path.insert` 후 `from engine import` 패턴 — 정확. (`tests/test_scenarios.py:15-18`)

**계획과 어긋나는 두 가지 사실:**

1. **알림 기록은 이미 가드 안에 있다.** 891-893행:
   ```
   if st.session_state["nav_alert_enabled"] and result.state != last_alerted:
       _trigger_alert(result.state)
       st.session_state["nav_last_alerted_state"] = result.state   # 893, 가드 안
   ```
   계획 MAJOR 2는 "3차 개정 Step 4가 기록을 가드 밖에서 무조건 수행하게 했다"고 하지만, **현행 코드(893)는 기록이 가드 안**이다. 즉 `alert_enabled=False`면 `_trigger_alert`도 기록도 둘 다 건너뛰므로, "OFF에서 전이 소비 → 재활성화 시 영구 누락" 버그는 **현재 코드에 없다**. 이 버그는 3차 개정 계획이 *도입하려던* 것을 4차가 *되돌린* 것이며, 현행 동작 대비 신규 위험이 아니다. (`1_Navigation.py:891-893`)

2. **`drifting`은 현재 소리+진동을 발화한다.** `_ALERT` dict(257-261)에 `drifting`(258), `deviated`(259), `passed_turn`(260) 세 state가 모두 등록되어 있고, `_trigger_alert`는 `_ALERT.get(state)`로 cfg를 찾는다(265). 현행 게이트(891)는 `result.state != last_alerted`만 보므로, **`on_route → drifting` 전이 시 660Hz 320ms 톤 + 150ms 진동이 실제로 울린다**. (`1_Navigation.py:257-261,265`) 따라서 계획의 `alert_level`이 `poor + drifting → mute`로 두는 것은 "엔진이 확정 이탈로 안 본 것을 묵음"이 아니라 **현재 울리는 "이탈 시작" 알림을 끄는 동작 변경**이다.

## Root Cause

계획의 두 결함은 같은 뿌리에서 나온다: **`_ALERT` dict의 실제 내용과 현행 가드(893행 기록 위치)를 4차 개정에서 재대조하지 않았다.** 계획은 "확정 이탈 = `deviated`/`passed_turn`만 알림 대상"이라는 모델을 전제로 3단계(full/weak/mute)를 설계했으나, **현행 코드의 알림 대상은 `drifting`까지 포함한 3개 state**다. 이 전제 불일치 때문에 (a) MAJOR 2가 존재하지 않는 버그를 막는 것으로 기술되고, (b) MAJOR 3가 "안전 측 무동작"으로 오기술된다(실제로는 기존 알림 제거). 근본 메커니즘 분석(고정 임계값 직접 비교로 인한 오탐)과 `result.metrics.distance_from_route_meters` 단일 출처 지적은 정확하므로, 결함은 설계 골격이 아니라 **알림 표면(_ALERT)의 현행 동작 매핑 누락**이다.

## Recommendations

1. **[CRITICAL] `_ALERT`에 `drifting` 포함 사실을 `alert_level` 설계에 반영** — 저비용 / 고영향. `alert_level`은 현재 `engine_state in ("deviated","passed_turn")`만 weak 후보로 잡는데, `drifting`도 현행 알림 대상임을 명시하고 결정을 재정렬하라. 두 선택지: (A) `poor+drifting → weak`(현행 소리를 toast로 강등, 오탐 위험 약간↑) 또는 (B) 현행처럼 `good+drifting → full`(소리 유지)·`poor+drifting → mute`(소리 제거)로 두되 **"이것은 안전 무동작이 아니라 기존 drifting 알림을 끄는 동작 변경"**임을 ADR에 정직히 기술. 어느 쪽이든 테스트 (e2)와 D-3 관찰 항목이 "현재 울리던 소리가 사라지는지"를 검증해야 한다.

2. **[CRITICAL] MAJOR 2를 "버그 수정"이 아니라 "현행 동작 보존 + 리팩토링 시 회귀 방지"로 재기술** — 저비용 / 중영향. 현행 893행은 이미 안전하다. `decide_alert`로 로직을 옮기는 것은 정당하나, 그 정당화 근거는 "영구 누락 버그 제거"가 아니라 "기록을 순수 함수로 옮길 때 가드를 빠뜨리면 *새로* 버그가 생기므로, `alert_enabled`를 함수 인자로 흡수해 그 회귀를 원천 차단"이다. 테스트 (k)와 수락기준 4의 `alert_enabled=False` 단언은 유지하되, "현행 코드에 이 버그가 있었다"는 서술을 제거하라. (`1_Navigation.py:891-893`)

3. **[MAJOR] `nav_origin` 미언급 점검** — 저비용 / 중영향. 계획은 accuracy 회복 후 재발화를 `nav_last_alerted_state` 미갱신으로 보장한다고 하나, GPS 취득부(741-746)는 매 rerun `nav_origin`을 갱신하고 1m 게이트(881)가 샘플 생성을 막으면 `result` 자체가 안 갱신된다. 정지 상태(<1m 이동)에서는 `process_sample`이 호출되지 않아 `decide_alert`도 호출되지 않는다 — D-1 "정지 테스트"의 mute는 게이팅이 아니라 **1m 게이트가 먼저 막는 것**일 수 있다. 계획은 이를 "기존 3중 내성 (1)"로 인지하나, accuracy 게이팅의 실효 발현 지점이 1m 게이트 뒤라는 점을 D-1 검증 설계에 명시하라. (`1_Navigation.py:881`)

4. **[MINOR] reroute의 `nav_prev_ts_ms` 미리셋 quirk가 Phase 2 멱등성에 미치는 영향 추적** — 저비용 / 저영향. reroute dict(907-916)는 `nav_prev_coord=None`은 설정하나 `nav_prev_ts_ms`는 그대로 둔다. Phase 2 timestamp 멱등 가드 도입 시 reroute 직후 `nav_prev_ts_ms`가 옛 값으로 남아 dt 계산이 꼬일 수 있다. 계획이 Phase 2 인지 항목으로 기록한 것은 적절하나, Step 7 리셋 3곳에 `nav_prev_ts_ms`도 후보로 검토하라.

## Trade-offs

| Option | Pros | Cons |
|--------|------|------|
| A: `poor+drifting → weak` (toast) | 현행 drifting 소리를 완전히 죽이지 않고 toast로 잔존 — 미탐 안전 공백 최소 | poor 구간 heading 노이즈 drifting이 toast 폭주 유발 가능(쿨다운으로 일부 완화), 오탐 체감↑ |
| B: `poor+drifting → mute` (계획 현안) | 오탐 최소, 설계 단순(weak는 deviated/passed_turn만) | **현행 drifting 알림을 무음화하는 동작 변경**인데 계획은 "무동작"으로 오기술 — 사용자가 "전엔 울리던 알림이 안 울린다"고 인지할 위험 |
| C: drifting 처리 자체를 Phase 1에서 제외(현행 유지) | 변경 표면 최소, 회귀 0 | `engine.py:507-510` heading 6m 경로 오탐(Driver 1 변종)을 방치 — 과제 목표 일부 미달 |

가장 날카로운 긴장은 **B(계획안)의 "오탐 최소화"와 "현행 동작 보존" 사이**다. 계획은 코어 불가침·최소 변경을 최우선 원칙으로 내세우면서도, `drifting` mute는 사용자가 체감하는 알림 동작을 조용히 바꾼다. 둘 다 타당하지만 양립 불가다.

## Consensus Addendum (ralplan review)

- **Antithesis (steelman):** 이 계획의 가장 강한 반론은 **"과제는 '현재위치 정확도 향상'인데, Phase 1 산출물은 raw 좌표를 그대로 지도에 표시·엔진 투입하므로 사용자가 보는 위치 정확도도, 엔진이 쓰는 좌표 정확도도 1mm도 안 변한다"**는 것이다. 계획 자신도 MAJOR 4-a에서 "정확히는 부정확함에 대한 알림 강건성 향상"이라 자백한다. 그렇다면 **사용자 기대와 산출물의 간극이 너무 커서, '정확도 향상' 과제로는 잘못된 해법**일 수 있다. 도심 Android에서 마커가 계속 튀는 한, 사용자는 "정확도가 좋아졌다"고 느끼지 않는다. 진짜 레버는 (1) Step 1의 `enableHighAccuracy`(좌표 자체 개선)와 (2) Phase 2의 표시용 EMA(체감 개선)인데, 계획은 (1)을 "best-effort 1줄 실험"으로, (2)를 "조건부"로 미뤘다 — **즉 과제명에 직접 답하는 두 레버를 모두 후순위로 빼고, 부차적인 알림 게이팅을 Phase 1 필수로 올렸다.** 만약 사용자의 진짜 불만이 "오탐 알림"이 아니라 "지도 위 내 위치가 틀리게 보임"이라면, 이 계획은 우선순위가 거꾸로다.

- **이 반론의 반박(왜 그래도 계획이 옳을 수 있는가):** 사용자는 "표시와 **이탈 판정**에 쓰이는 현재 위치 정확도"를 모두 언급했고, 보행 내비에서 오탐 이탈 알림은 즉각적 신뢰 파괴 요인이다. 오탐의 Root Cause(`engine.py:503-510` 고정 임계값 직접 비교)는 좌표를 매끄럽게 해도 **지속적 큰 오차 구간에서는 해소되지 않는다**(EMA는 지속 바이어스를 못 없앤다). 따라서 게이팅을 Phase 1에 두는 것은 방어 가능하다. 다만 이는 **"정확도 향상" vs "오탐 강건성"이 서로 다른 목표**라는 점을 사용자에게 명확히 확인받아야 정당화된다.

- **Tradeoff tension (핵심):** **코어 불가침/최소 변경 원칙 vs 과제 목표 직접 달성.** 계획은 AGENTS.md "1_Navigation.py 최소 변경"·엔진 이중 유지보수 회피를 절대 원칙으로 삼아, 가장 정직한 해법(옵션 E: `PositionSample.accuracy_m`을 엔진이 참조)을 TS 동기화 부담 때문에 무효화했다. 그 결과 **페이지가 엔진 판정을 사후에 신뢰도로 깎는 우회 구조**가 되고, "raw로 정직하게 돌린 뒤 결과를 다시 깎는" 자기긴장(계획 긴장 A)을 스스로 인정한다. 최소 변경이 옳을수록 SSOT 봉합은 멀어진다 — 회피 불가능한 긴장이며, 계획은 이를 정직하게 ADR에 남긴 점은 우수하다.

- **Synthesis (반론 흡수 개선 방향):** (1) **사용자에게 목표를 분리 확인하라** — "지도 위 위치가 튀는 게 불만인가(→ 표시 EMA/enableHighAccuracy 우선), 아니면 가만히 있는데 이탈 알림이 뜨는 게 불만인가(→ 게이팅 우선)". 둘은 다른 Phase다. (2) **Step 1의 `enableHighAccuracy` raw-JS 실험을 "1줄 실험"이 아니라 Phase 1 병렬 필수 시도로 격상** — 이것이 과제명에 가장 직접 답하는 유일한 진짜 좌표 개선 레버이고 변경 비용이 극소다. (3) **표시용 EMA를 Phase 2 전체가 아니라 "표시 좌표 한정 EMA만" 부분으로 Phase 1.5로 분리** — 계획도 진입 조건 완화로 허용했으니, 체감 개선이 과제 핵심이면 이 부분만 먼저 도입. 이렇게 하면 "알림 강건성(게이팅) + 좌표 개선(enableHighAccuracy) + 체감 개선(표시 EMA)"이 모두 과제명에 답하면서, 신규 버그 표면이 큰 점프 제거/멱등성/state 리셋은 여전히 Phase 2로 유예된다.

- **Principle violations (deliberate mode flags):**
  - **Principle 1 (엔진 코어 불가침): 위반 없음.** 모든 변경이 입력 게이팅·결과 강등으로 코어 밖. `EngineConfig`/`evaluate_deviation_step` 무변경. 수락기준 6(`git diff --stat`)으로 구조 검증. 적합.
  - **Principle 2 (1_Navigation.py 최소 변경): 경미한 긴장.** 계획 자신이 Consequences에서 "한 곳이 아니라 분산 3~4지점, 각각 1~2줄"이라 정직히 기술. AGENTS.md "최소 변경" 위반은 아니나, 알림 게이트 교체(890-893)·세션 키 3곳·배지·취득부로 표면이 분산됨. 경계선이며 정직하게 공시됨.
  - **Principle 3 (reduce ≠ mute, 3단계 대응): 사실 기반 위반 플래그.** `_ALERT`에 `drifting`이 있어 `poor+drifting → mute`는 **현행 알림을 끄는 것**인데 계획은 이를 "안전 측 무동작"으로 기술 → Principle 3가 천명한 "낮춘다 ≠ 끈다"를 **drifting 경로에서 스스로 위반**한다. 심각도: MAJOR. ADR 재기술 필요.
  - **Principle 4 (판정용 raw / 표시용 스무딩 분리): 위반 없음, 단 미실현.** Phase 1엔 스무딩이 없어 분리 원칙이 적용될 대상 자체가 없다. 적합하나 과제명-산출물 간극(Antithesis)을 남긴다.
  - **Principle 5 (검증 가능성): 적합.** `decide_alert` 순수 함수 + pytest 직접 단언 설계는 우수. 단 "현행 893행에 영구 누락 버그가 있다"는 P5 정당화 서술은 사실과 다르므로 수정.

## References
- `D:\walk\streamlit_walk_engine\pages\1_Navigation.py:257-261` — `_ALERT` dict에 `drifting`/`deviated`/`passed_turn` 모두 등록 → **현행 코드는 `drifting`에도 소리+진동 발화** (계획 MAJOR 3 전제 뒤집음)
- `D:\walk\streamlit_walk_engine\pages\1_Navigation.py:891-893` — 알림 기록(893)이 `if nav_alert_enabled` 가드 **안** → 계획 MAJOR 2의 "기록이 가드 밖" 전제가 현행 코드와 불일치
- `D:\walk\streamlit_walk_engine\pages\1_Navigation.py:264-292` — `_trigger_alert`가 toast+audio+vibrate 결합 (계획 전제 정확)
- `D:\walk\streamlit_walk_engine\pages\1_Navigation.py:83-114` — `_init`, `nav_raw_gps`=86·`nav_last_alerted_state`=96·`nav_last_reroute_ts_ms`=102 (계획 4차 정정 정확)
- `D:\walk\streamlit_walk_engine\pages\1_Navigation.py:117-127` — `_reset`, 알림 상태 리셋 125-126 (정확)
- `D:\walk\streamlit_walk_engine\pages\1_Navigation.py:869-875` — `↺ 초기화` 버튼이 알림 상태 미리셋 (계획 정확)
- `D:\walk\streamlit_walk_engine\pages\1_Navigation.py:907-916` — reroute dict, `nav_last_alerted_state`=915 리셋·`nav_prev_ts_ms` 미리셋 quirk (정확)
- `D:\walk\streamlit_walk_engine\pages\1_Navigation.py:881` — 1m 이동 게이트가 `process_sample`/`decide_alert` 호출을 선차단 → 정지 시 mute의 실제 원인 점검 필요
- `D:\walk\streamlit_walk_engine\engine.py:503-510` — `threshold_breach = drift_breach OR (heading_conflict AND distance>=6m)` (계획 정확, heading 경로 오탐 근거)
- `D:\walk\streamlit_walk_engine\engine.py:565-578` — `deviated`/`drifting` 산출 로직 (정확)
- `D:\walk\streamlit_walk_engine\engine.py:65,80-86` — 거리 필드는 `EngineMetrics.distance_from_route_meters`에만, `EngineResult`엔 없음 → 계획의 거리 출처 단일화·`AttributeError` 지적 정확
- `D:\walk\streamlit_walk_engine\tests\test_scenarios.py:15-18` — `sys.path.insert` 후 `from engine import` (계획의 `gps_filter` 임포트 전제 유효)
- `D:\walk\AGENTS.md:6,26` — `1_Navigation.py` 최소 변경 제약 (계획 준수, 단 분산 3-4지점 표면은 경계선)