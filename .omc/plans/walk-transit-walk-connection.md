# 구현 계획 — walk "대중교통+도보 연결" (옵션1)

> 상태: **APPROVED** (ralplan 합의 3라운드, Critic 최종 0 blocking). 실행 전 사용자 승인/키 결정 대기.
> 합의 방향: 옵션1 + Architect "Option D"(sub-journey 활성화) + **단일 route-소유 불변식**.
> 검증 베이스라인: `cd streamlit_walk_engine && python -m pytest tests -q` → **124 passed**(실측). 게이트 = `124 + N`.

## 한 줄 요약
출발→대중교통(지하철/버스)→도착 전체 "여정(Journey)"을 leg 단위로 한 화면에 표시하되, **실시간 GPS 이탈감지(기존 엔진)는 도보 leg에서만** 작동. 대중교통 leg는 외부 API에서 받아 정적 표시만. 키 없어도 도보 전용으로 우아하게 강등(앱 안 깨짐).

---

## 핵심 불변식 (이 계획의 중심 — 절대 위반 금지)
**"`nav_dest`가 여정에 속함  ⇔  `nav_journey is not None`"**

`nav_dest`/`nav_route`/`nav_engine`를 쓰는 **네 사이트 전부**가 이 불변식을 지킨다:
1. 액션버튼-비대중교통(토글 OFF) → `_clear_journey_state()`
2. 검색기록 재생 → `_clear_journey_state()`
3. 예약 자동활성화(`_try_activate_booking`) → 가드에 `nav_journey is not None` 추가(여정 중 발동 금지)
4. c3 리셋 → `_clear_journey_state()`
- **여정 활성화 사이트(`_activate_journey`)만** `nav_journey`를 채운다.
- 결과: pre-도착판정 leg-진행 가드는 `nav_journey is not None`일 때만 발동 → 그 순간 `nav_dest`=활성 leg 끝임이 **보장**(비여정 경로 오발동 불가).

## 비침습 제약 (Principle)
- `engine.py` **0줄** 변경. 도보 leg의 `RouteModel`을 그대로 먹이는 재사용만.
- `1_Navigation.py` **GPS 핫루프(1135–1201) 본문 0줄** 변경. leg 활성화는 **기존 `_activate_route`(185-208) 재사용**으로만.
- 어떤 외부 키 없어도/도보 재라우팅 실패해도 안전 상태(도보 강등 또는 비추적 수동 진행)로 수렴.
- 파서 순수성: `fetch_*`=I/O, `parse_*`=순수. 좌표 변환은 파서 경계에서 1회만(`Coordinate(latitude, longitude)` 단일 표현).
- transit/퇴화 leg는 **안전엔진에 절대 바인딩 금지**(직선 2점 polyline 만들지 않음).

---

## 데이터 모델 (`transit_builder.py` 신규)
```python
from engine import Coordinate, RouteModel
from route_builder import RouteInfo
LegMode = Literal["walk", "subway", "bus", "transfer"]

@dataclass(frozen=True)
class TransitInfo:               # 대중교통 leg 표시정보 (RouteModel 없음)
    mode: LegMode               # "subway"|"bus"
    line_name: str; board_station: str; alight_station: str
    station_count: int
    distance_meters: int | None; time_seconds: int | None
    display_polyline: tuple[Coordinate, ...]   # 정적 표시용. ODsay는 빈 tuple 가능.

@dataclass(frozen=True)
class JourneyLeg:
    mode: LegMode
    start: Coordinate; end: Coordinate
    start_label: str; end_label: str
    tracked: bool = False        # True=활성 시 엔진 바인딩(유효 RouteModel 보유)
    route: RouteModel | None = None
    route_info: RouteInfo | None = None
    walk_engine_label: str | None = None
    transit: TransitInfo | None = None

@dataclass(frozen=True)
class Journey:                    # 렌더·진행 기록 전용 메타 (라이브 내비 객체 아님)
    legs: tuple[JourneyLeg, ...]
    source: str                  # "TMAP 대중교통"/"ODsay"/"도보 강등(키 없음)"
    total_distance_meters: int | None = None
    total_time_seconds: int | None = None
```
- walk leg의 `route`는 파서가 만들지 않음. `_hydrate_walk_legs`가 `fetch_walking_route_with_engine`로 채움(성공=tracked/route, **실패=tracked=False·route=None**).

## 모듈 함수 (`transit_builder.py`)
```python
def fetch_transit_journey(origin, dest) -> Journey   # 폴백 오케스트레이션(예외 비전파)
def parse_tmap_transit(payload: dict) -> Journey     # 순수(PROVISIONAL 계약)
def parse_odsay_transit(payload: dict) -> Journey    # 순수(PROVISIONAL, display_polyline 빈 tuple 허용)
def _fetch_tmap_transit_raw(origin, dest, app_key) -> dict   # POST apis.openapi.sk.com/transit/routes
def _fetch_odsay_transit_raw(origin, dest, api_key) -> dict  # GET api.odsay.com searchPubTransPathT
def _odsay_api_key() -> str | None    # ODSAY_API_KEY → st.secrets → 마스터 .env (키 노출 금지)
def _hydrate_walk_legs(journey) -> Journey   # walk leg 재라우팅(성공=tracked, 실패=비추적·직선 금지)
def build_walking_only_journey(origin, dest) -> Journey       # 도보 강등(단일 walk leg)
def advance_leg(journey, active_index, origin, accuracy_m) -> int  # 순수. walk(tracked)+끝근접+not last → +1
def is_last_leg(journey, active_index) -> bool
```
### 3단계 우아한 폴백 (`fetch_transit_journey`)
```
TMAP 키 있으면 parse_tmap_transit(...) 시도 → 실패 None
None이고 ODsay 키 있으면 parse_odsay_transit(...) 시도 → 실패 None
None이면 build_walking_only_journey(...)          # 강등
return _hydrate_walk_legs(journey)                # walk leg 재라우팅
```

---

## UI 변경 (`pages/1_Navigation.py`, 가산·최소)
### 새 세션키 (`_init`)
- `nav_journey: Journey | None` (불변식 신호), `nav_active_leg_index: int = 0`, `nav_transit_enabled: bool = True`.

### 불변식 헬퍼
```python
def _clear_journey_state():
    st.session_state["nav_journey"] = None
    st.session_state["nav_active_leg_index"] = 0
```
### 예약 가드 (AC-12) — `_try_activate_booking` 조기반환(672)에 한 줄 추가
```python
if origin is None or st.session_state["nav_running"] or st.session_state.get("nav_journey") is not None:
    return   # ★ 여정 중엔 예약 자동활성화 금지
```
### 분기 진입 (c1 "경로 탐색")
```python
if nav_transit_enabled:
    journey = transit_builder.fetch_transit_journey(start_coord, dest)
    _activate_journey(journey)            # nav_journey 채우는 유일한 곳
else:
    _clear_journey_state()                # 불변식
    route = _fetch_route(start_coord, dest)
    _activate_route(start_coord, dest, dest_display, route, start_now=True)
```
### `_activate_journey` / `_activate_leg` (Option D — GPS 루프 밖)
- `_activate_journey`: `nav_journey`=journey, index=0, `_activate_leg(journey, 0, start_now=True)`.
- `_activate_leg`: walk+tracked+route → 기존 `_activate_route` 재사용. transit/비추적 → `nav_route=None, nav_engine=None, nav_running=False` + `_reset()`.
- transit/비추적 leg는 `nav_running=False`로 **autorefresh 의도적 정지**(배터리·무의미 GPS 차단; 버그 아님). "내렸어요"→다음 walk leg `_activate_route start_now=True`로 재개.

### leg 진행 — 도착판정 직전 가로채기 (1138 직전, 가산 한 블록)
```python
if st.session_state.get("nav_journey") is not None and st.session_state["nav_running"] and origin is not None:
    j = st.session_state["nav_journey"]; idx = st.session_state["nav_active_leg_index"]
    if not transit_builder.is_last_leg(j, idx):
        new_idx = transit_builder.advance_leg(j, idx, origin, _accuracy())
        if new_idx != idx:
            _activate_leg(j, new_idx, start_now=True)
            st.rerun()      # 이번 틱 도착판정/엔진 진입 안 함
# 이후 기존: arrived_now = _maybe_finish_arrival(origin)   ← 마지막 leg만 도달
```
- `nav_journey is None`이면 가드 미발동 → 기존 도보/예약 흐름 100% 그대로.
- 중간 leg 끝 → 다음 leg 활성화(절대 finish 안 함). 마지막 leg만 `_maybe_finish_arrival`.
- transit leg → 자동 진행 안 함, "내렸어요" 수동 버튼.

### 기타 UI
- `_render_journey(journey, active_index)`: leg 카드 세로 리스트(🚶/🚇/🚌, start→end, 거리/시간, 활성 강조). 활성 walk=기존 지도/판정, 활성 transit=정적 카드+"내렸어요" 버튼, 활성 비추적 walk="실시간 어려움" 안내+"다음 구간".
- "대중교통 포함" 토글(기본 ON, 설정 패널). OFF면 `fetch_transit_journey` 미호출 + `_clear_journey_state()`.
- `journey.source`가 "도보 강등"이면 `st.info("대중교통 경로를 사용할 수 없어 도보로 안내합니다 (API 키 미설정).")`.
- 검색기록 재생(909-927) = **의도적 도보 전용 유지**(journey화 아님) + 재생 직전 `_clear_journey_state()`.
- c3 초기화(1126-1133)에 `_clear_journey_state()` 추가.

---

## 인수 기준 ↔ 테스트
| AC | 내용 | 테스트 |
|---|---|---|
| AC-1/2 | TMAP/ODsay 목 JSON 파싱(PROVISIONAL), leg 순서·메타·좌표변환 | `test_parse_tmap_transit_*`, `test_parse_odsay_transit_*` |
| AC-3/7 | 3단계 폴백 + source 라벨 + 키 없을 때 강등 | `test_fetch_transit_journey_fallback` |
| AC-4/11 | walk=route有/transit=route無/실패=tracked False·직선 금지 | `test_journey_models`, `test_hydrate_walk_legs`(raise 포함) |
| AC-5 | advance_leg: 끝근접+not last→+1, 마지막=진행안함, transit=자동안함 | `test_advance_leg` |
| AC-6 | 토글 OFF=기존 도보 경로(회귀0)+nav_journey None | `test_navigation_smoke` |
| AC-8 | AppTest 토글 ON/OFF 렌더 무예외 | `test_navigation_smoke` |
| AC-9 | 좌표 lon/lat 1회 변환·Coordinate 단일표현 | 파서 테스트 |
| AC-10 | 기존 안전기능·**124 green** 유지 | 기존 테스트 전체 |
| AC-12 | 여정 중 예약 자동활성화 금지 | `test_booking_blocked_during_journey` |
| AC-13 | 비여정 3사이트 모두 nav_journey=None | `test_journey_invariant_cleared` |
- 모든 파서 테스트 네트워크 0회(목 dict). 신규 `tests/test_transit_builder.py` + `tests/test_navigation_smoke.py`.
- **AppTest 사전 확인**: 실행 첫 스텝에 `python -c "from streamlit.testing.v1 import AppTest"` 1회 — "항상 skip" 방지.
- 파서 테스트는 도크스트링에 "PROVISIONAL CONTRACT — 실제 응답 1건 확보 시 재검증" 명시.

## 파일별 변경
| 파일 | 신규/수정 | 규모 |
|---|---|---|
| `transit_builder.py` | 신규 | ~270–340줄 |
| `pages/1_Navigation.py` | 수정(가산) | +120–175줄, **GPS 루프 본문 0줄** |
| `route_builder.py` / `engine.py` | 변경 없음 | 0줄 |
| `tests/test_transit_builder.py` | 신규 | ~290–380줄 |
| `tests/test_navigation_smoke.py` | 신규 | ~70–120줄 |

## 단계 경계
- **이번 PR**: 위 전체(파서는 PROVISIONAL, 목 테스트 + 우아한 강등으로 회귀 0).
- **후속(범위 아님)**: ①2단계 GPS 없는 하차 알림(역 ETA 카운트다운+진동) ②예약/검색기록 journey화 ③실제 응답 확보 후 파서 확정·ODsay polyline 2차 호출 ④환승 실내/출구 안내.

## Open Questions (실행 전/중 확인)
- [ ] TMAP 대중교통(transit/routes)이 현재 `TMAP_APP_KEY` 콘솔에서 활성화돼 있나? (미활성=1순위 항상 실패→ODsay)
- [ ] ODsay 무료키 발급/주입 위치(`ODSAY_API_KEY`/secrets/마스터 .env)?
- [ ] ODsay `searchPubTransPathT` 1차 응답이 sub-path 좌표를 담나, 별도 `loadLane`/graphic 2차 호출 필요?
- [ ] TMAP transit·ODsay 실제 응답 JSON 샘플 1건 → 파서 PROVISIONAL→확정.
- [ ] `from streamlit.testing.v1 import AppTest` 현 환경 import 가능?

## ADR (요약)
- **Decision**: 옵션1 + Option D(sub-journey, `_activate_route` 재사용) + 단일 route-소유 불변식. 실시간 추적은 유효 RouteModel 도보 leg 한정, 대중교통은 정적 표시. PROMPT.md M1 out-of-scope였던 대중교통을 사용자 명시 승인으로 범위 확장.
- **Alternatives**: A(Journey 라이브+핫루프 rebind) 기각/ B(단일 합성 RouteModel) 기각(지하 오탐)/ C(외부 앱 딥링크) 기각(한 화면 여정 상실)/ **D 채택**/ E(예약을 진행엔진 재사용) 기각(예약 순서 무개념) — 단 "모든 proximity 쓰기자 route 소유 합의" 통찰은 불변식으로 흡수.
- **안전 불변**: engine 0줄·GPS 루프 본문 0줄·토글 OFF 기존동작·키 없으면 도보 강등·main push 금지(작업 브랜치+PR)·격리 워크트리.
