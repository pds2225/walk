# PLAN_TMAP_SERVICE.md — Walk 도보 내비게이션 서비스화 기획안

## 프로젝트

Walk - Milestone 3
TMAP API 기반 "실제 쓸 수 있는 도보 길찾기" 완성

## 이 문서의 역할

`PLAN.md`가 Milestone 1(이탈 감지 엔진)의 실행 계획서였다면,
이 문서는 그 엔진을 **실제 도보 길찾기 서비스로 키우는 단계별 실행 계획서**다.
AI(Claude/Codex)가 한 세션에 Phase 하나씩 수행할 수 있는 크기로 나눴다.

핵심 방향: **"경로를 따라가는지 판단하는 두뇌"는 이미 있다.
경로를 만들고 → 안내하고 → 벗어나면 다시 찾고 → 지도에 보여주는 몸통을
TMAP API(앱 이름 `walk_navi`, 앱키 1개)로 채운다.**

## 비개발자용 짧은 용어 설명

- polyline: 경로를 이루는 좌표(위도/경도) 목록. 지도 위에 그리면 선이 된다.
- 지오코딩(Geocoding): "강남역" 같은 글자를 좌표로 바꾸는 일. 반대(좌표→주소)는 역지오코딩.
- POI: 역, 가게, 건물처럼 이름으로 검색하는 장소(Point of Interest).
- ETA: 도착 예상 시간(Estimated Time of Arrival).
- 폴백(fallback): 1순위 방법이 실패했을 때 자동으로 쓰는 2순위 방법.
- secrets: 앱키처럼 공개하면 안 되는 값을 코드 밖에 보관하는 곳.

---

# 현황 진단 — 제안 ①~④ 대비 실제 구현 상태

루트 README의 "범위 밖(out of scope)" 선언(모바일 UI, 지도 SDK, 네이티브 GPS,
백엔드, DB, 인증)은 Milestone 1 기준이다. 이후 `streamlit_walk_engine/`
MVP가 그 빈 곳의 일부를 이미 채웠으므로, 제안된 우선순위 ①~④를
실제 코드와 대조하면 다음과 같다.

| 우선순위 | 제안 내용 | 현재 상태 | 근거 (파일) |
|---|---|---|---|
| ① 경로 생성 | TMAP 보행자 경로로 polyline + 회전 지점 생성 | ✅ **완료** (PR #6) | `route_builder.py` — TMAP 우선, Valhalla 폴백. turnType→회전 지점 매핑 |
| ② 재경로 탐색 | 이탈 확정 시 현재 위치 기준 재호출 | 🔶 **기본 구현** | `pages/1_Navigation.py` — `deviated`/`passed_turn` 시 자동 재탐색(15초 쿨다운). 도착 판정은 없음 |
| ③ 목적지 검색·좌표 변환 | 키워드/주소 → 좌표, 좌표 → 주소 | 🔶 **부분 구현** | Nominatim(OSM) 사용 중. 한국 POI 정확도·출구 검색이 약해 TMAP POI 전환 가치 큼 |
| ④ 지도 표시 | 실 지도 위에 경로·현재 위치 표시 | 🔶 **부분 구현** | Plotly `Scattermap` + OSM 타일(실 지도임). TMAP 지도 고도화는 선택지 비교 필요 |
| (보너스) 실 GPS | 합성 샘플 대신 실제 위치 | ✅ **완료** | `streamlit-js-eval` 브라우저 geolocation 사용 중 |

따라서 이 기획안의 남은 일은:
**① 고도화(ETA·안내문) → ② 마무리(도착 판정) → ③ 전환(TMAP POI) → ④ 고도화(지도) → ⑤ 제품화 트랙** 순서다.

> 진행 현황 (2026-06): Phase A~D 구현 완료 — 각 Phase 절의 ✅ 표시와
> 부록 1 연동 상태 참조. 남은 것은 Phase D 2단계(JS SDK 실험)와 Phase E.

## 현재 핵심 파일 위치

- `streamlit_walk_engine/route_builder.py` — 지오코딩 + 경로 생성 (TMAP/Valhalla/Nominatim)
- `streamlit_walk_engine/pages/1_Navigation.py` — 내비게이션 화면 (최소 수정 원칙 적용 대상)
- `streamlit_walk_engine/engine.py` — 이탈 감지 엔진 (Python 포트)
- `streamlit_walk_engine/gps_filter.py` — GPS 정확도 기반 알림 게이팅
- `streamlit_walk_engine/tests/` — pytest 단위 테스트 (현재 89건)
- `packages/route-engine/` — 엔진 TypeScript 원본 (이번 마일스톤에서는 수정하지 않음)
- `.streamlit/secrets.toml.example` — 앱키 주입 템플릿

---

# Phase A. 경로 안내 정보 고도화 (ETA·총거리·안내문) — ✅ 완료

## 목표

TMAP 응답에 이미 들어 있지만 버리고 있는 정보 —
총거리(`totalDistance`), 소요시간(`totalTime`), 지점별 한국어 안내문(`description`,
예: "시청역 5번출구에서 좌회전 후 세종대로를 따라 102m 이동") — 를
화면에 보여줘서 "안내" 경험을 만든다.

## 필요한 파일

- `streamlit_walk_engine/route_builder.py`
- `streamlit_walk_engine/pages/1_Navigation.py`
- `streamlit_walk_engine/tests/test_route_builder.py`

## 해야 할 내용

1. `route_builder`에 경로 부가정보 자료형(RouteInfo: 총거리 m, 소요시간 초,
   지점별 안내문 목록)을 추가하고, `fetch_walking_route_with_engine`이
   엔진 라벨과 함께 반환하도록 확장한다.
   - `engine.py`의 `RouteModel`은 TS 원본과 짝이므로 **건드리지 않는다.**
   - Valhalla 폴백 경로는 RouteInfo 없이도 동작해야 한다(None 허용).
2. Navigation 페이지는 세션 상태(`nav_route_info`)에 보관하고:
   - 경로 생성 직후 "총 435m · 도보 약 6분" 형태로 표시
   - 판정 패널의 "다음 회전 N m" 옆에 해당 지점 TMAP 안내문 표시
3. 회전 지점과 안내문 연결: TMAP Point 피처의 안내문을 회전 지점
   생성 시 함께 보관한다 (turn id ↔ 안내문 매핑).
4. 파서 단위 테스트에 totalDistance/totalTime/description 추출 케이스를 추가한다.

## 완료 기준

- 경로 생성 시 총거리·도보 ETA가 화면에 보인다.
- 내비게이션 중 다음 회전 지점의 한국어 안내문이 보인다.
- Valhalla 폴백 시에도 화면이 깨지지 않는다 (부가정보만 생략).
- `python -m pytest streamlit_walk_engine/tests -q` 전체 통과.

---

# Phase B. 도착 판정 + 재경로 마무리 — ✅ 완료

## 목표

지금은 목적지에 도착해도 아무 일도 일어나지 않는다.
"도착"을 감지해서 안내를 끝내고, 재경로 동작의 남은 구멍을 막는다.

## 필요한 파일

- `streamlit_walk_engine/pages/1_Navigation.py`
- `streamlit_walk_engine/gps_filter.py` (도착 반경 게이팅 재사용 검토)

## 해야 할 내용

1. 도착 판정: 내비게이션 실행 중 현재 위치~목적지 거리가 도착 반경
   (기본 20 m, GPS 정확도 낮으면 보수적으로) 이내면:
   - 도착 알림(토스트 + 기존 `_trigger_alert` 패턴의 완료음)
   - `nav_running` 종료, "도착 완료 — 총 N분, 재경로 M회" 요약 표시
2. 출발 직후 가드: 경로 시작 30초(또는 첫 5샘플)는 재경로를 발동하지
   않는다 — GPS 워밍업 중 오탐으로 즉시 재탐색되는 문제 방지.
3. 재경로 발생 시 어떤 엔진(TMAP/Valhalla)으로 다시 찾았는지 토스트에 표시
   (Phase A의 엔진 라벨 재사용).
4. 예약 경로(`nav_route_bookings`)로 시작된 안내도 도착 판정 시
   `nav_active_booking_id`를 해제해 다음 예약이 다시 발동 가능하게 한다.

## 완료 기준

- 목적지 도착 시 자동으로 안내가 종료되고 요약이 보인다.
- 출발 직후 불필요한 재경로가 발생하지 않는다.
- 기존 이탈 감지/알림 테스트가 그대로 통과한다.

---

# Phase C. 목적지 검색을 TMAP POI 통합검색으로 전환 — ✅ 완료

## 목표

Nominatim은 한국 상호·지하철 출구 검색이 약하다.
TMAP **POI 통합검색** + **역지오코딩**으로 바꿔 "강남역 10번출구",
가게 이름 검색이 한 번에 되게 한다. Nominatim은 폴백으로 유지한다.

## 필요한 파일

- `streamlit_walk_engine/route_builder.py`
- `streamlit_walk_engine/pages/1_Navigation.py` (검색 결과 선택 UI — 최소 수정)
- `streamlit_walk_engine/tests/test_route_builder.py`

## 해야 할 내용

1. `geocode_address`를 엔진 디스패처와 같은 패턴으로 재구성:
   - 앱키 있으면 TMAP POI 통합검색
     `GET https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=...`
     (헤더 `appKey`) → 상위 결과의 좌표(`frontLat/frontLon` 우선)와 표시명 사용
   - 실패/키 없음 → 기존 Nominatim 흐름 그대로
2. 검색 후보 노출: 상위 1건 자동 선택 대신 상위 3~5건을 라디오/선택지로
   보여주고 사용자가 고르게 한다 (동명 장소 오선택 방지).
3. 역지오코딩(`reverse_geocode`)도 TMAP
   `GET /tmap/geo/reversegeocoding?version=1&lat=..&lon=..&coordType=WGS84GEO`
   우선 + Nominatim 폴백으로 전환한다.
4. 지하철 출구 표기 변형 로직(`_subway_candidates`)은 TMAP 검색이
   직접 처리하는지 확인 후, TMAP 경로에서는 시도 횟수를 줄인다
   (Nominatim 폴백용으로는 유지).
5. POI 검색 모킹 단위 테스트 추가 (응답 파싱, 폴백 분기).

## 완료 기준

- "강남역 10번출구", 상호명 검색이 TMAP로 한 번에 좌표를 찾는다.
- 후보가 여러 개면 사용자가 고를 수 있다.
- 앱키가 없어도 기존 Nominatim 검색이 그대로 동작한다.
- 신규 테스트 포함 전체 통과.

---

# Phase D. 지도 표시 고도화 — ✅ 1단계 완료 (Static Map)

## 목표

현재 지도는 Plotly + OSM 타일로 "실 지도 위 표시"는 이미 된다.
한국 지도 품질(라벨·건물·보행로)을 올리는 선택지를 비교하고 단계적으로 적용한다.

## 선택지 비교 (구현 전 필독)

| 선택지 | 장점 | 단점/리스크 |
|---|---|---|
| (a) 현행 Plotly+OSM 유지 | 추가 작업 0, 이미 동작 | 한국 라벨/보행로 표현이 TMAP보다 약함 |
| (b) TMAP Static Map (서버측 호출) | 키가 브라우저에 노출되지 않음, 경로 미리보기 카드에 적합 | 정적 이미지라 실시간 추적 화면으론 부적합 |
| (c) TMAP Vector/Raster JS SDK embed | 진짜 TMAP 지도 | `components.html`에 키가 들어가 **브라우저에 키 노출**. 공개 Streamlit 앱에서는 위험. 도메인 제한 설정 가능한지 콘솔에서 확인 필요 |

## 해야 할 내용 (권장 순서)

1. 1단계: 실시간 추적 화면은 (a) 유지. 대신 경로 생성 직후
   (b) Static Map으로 "경로 미리보기" 이미지를 표시한다 — 서버에서
   `requests`로 받아 `st.image`로 출력하므로 키가 새지 않는다.
2. 2단계(선택): TMAP 콘솔에서 referer/도메인 제한을 걸 수 있으면
   (c)를 실험 페이지(`pages/2_MapLab.py` 등 신규 페이지)로 검증한다.
   본 화면(`1_Navigation.py`)은 검증 전까지 바꾸지 않는다.

## 완료 기준

- 경로 생성 시 TMAP 지도 이미지 미리보기가 보인다.
- 앱키가 HTML/JS/네트워크 탭 어디에도 노출되지 않는다 (1단계 기준).
- 실시간 추적 지도는 기존 동작 그대로다.

---

# Phase E. 제품화 트랙 (후순위 — 착수 조건 있음)

A~D 완료 + 실사용 피드백 이후에만 시작한다. 한 번에 하나씩.

1. **대중교통 연계**: TMAP 대중교통 API로 "도보+지하철/버스+도보" 복합 경로.
   동일 포털에서 사용 가능함은 확인됨(2026-06) — 착수 시 호출 한도만 콘솔에서 점검.
2. **PWA/모바일 개선**: 홈 화면 추가, 백그라운드 위치 갱신 한계 정리.
   네이티브 앱 전환 판단은 이 단계에서.
3. **백엔드/DB/인증**: 즐겨찾기·예약을 localStorage 대신 서버 보관.
   다중 사용자 전제가 생길 때만 진행한다.

---

# 부록 1. TMAP API 매핑표 (앱키 1개로 전부 호출)

| 용도 | 엔드포인트 | 사용 Phase | 상태 |
|---|---|---|---|
| 보행자 경로 | `POST /tmap/routes/pedestrian?version=1` | ①②, A, B | ✅ 연동 완료 |
| POI 통합검색 | `GET /tmap/pois?version=1` | C | ✅ 연동 완료 |
| 역지오코딩 | `GET /tmap/geo/reversegeocoding?version=1` | C | ✅ 연동 완료 |
| Static Map | `GET /tmap/staticMap?version=1` | D | ✅ 연동 완료 |
| 대중교통 | TMAP 대중교통 상품 (별도 신청 불필요 확인) | E | 사용 가능 — 미연동 |

공통: 요청 헤더 `appKey`에 앱키. 베이스 URL `https://apis.openapi.sk.com`.

# 부록 2. 앱키·한도 운영 원칙

1. 앱키는 **코드/문서/로그에 절대 쓰지 않는다.**
   환경변수 `TMAP_APP_KEY` 또는 Streamlit secrets로만 주입한다
   (로컬: `.streamlit/secrets.toml`, 배포: Streamlit Cloud → Settings → Secrets).
2. Free(무료체험) 요금제는 API별 일일 호출 한도가 있다 — 정확한 잔여량은
   TMAP 콘솔에서 확인. 한도 초과/오류 시 Valhalla(경로)·Nominatim(검색)
   폴백으로 앱이 멈추지 않게 유지한다 (경로 쪽은 구현 완료, 검색 쪽은 Phase C).
3. 브라우저로 키가 나가는 방식(JS SDK, 클라이언트 타일 URL)은
   도메인 제한 확인 전까지 금지한다 (Phase D 참고).

# 부록 3. 공통 검증 명령

```powershell
python -m pytest streamlit_walk_engine/tests -q     # 전체 테스트 (현재 89건)
python -m streamlit run streamlit_walk_engine/app.py # 로컬 실행 후 Navigation 페이지 수동 확인
```

수동 확인 시나리오: 경로 탐색("경복궁") → 캡션의 엔진 표시 확인 →
시작 → (Phase B 이후) 도착 처리 확인. 키를 빼고 한 번 더 돌려 폴백도 확인.

# 부록 4. 작업 규칙 (AGENTS.md 요약)

- 프로젝트명은 `walk` 유지, 기존 페이지 구조 유지.
- `streamlit_walk_engine/pages/1_Navigation.py`는 항상 최소 수정.
- `.env`·secrets 파일은 수정/출력 금지, 앱키는 답변·로그에도 출력 금지.
- 한 Phase = 한 세션. Phase 완료마다 테스트 실행 후 커밋.

# 실행 순서 요약

1. 이 문서와 `AGENTS.md` 읽기
2. Phase A → B → C → D 순서대로, 한 세션에 하나씩
3. 각 Phase의 완료 기준을 모두 만족하면 커밋/푸시/PR
4. Phase E는 A~D 완료 + 사용 피드백 확보 후 별도 결정
