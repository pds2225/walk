# TASK_NIGHT_02.md
## bobora-walkguard — 2차 밤샘 작업 지시서
## Milestone 2 : Streamlit 로컬 웹 데모 완성

---

## 시작 전 필독 (반드시 이 순서대로 읽는다)

1. `PROMPT.md` — 마일스톤 현황과 전체 범위
2. `PLAN.md` — 단계별 작업 순서 (Step 1~11: Milestone 1 참조용)
3. `DONE.md` — Milestone 1 완료 확인 + Milestone 2 완료 기준
4. `TASK_NIGHT_02.md` — 지금 이 파일
5. `RUNBOOK.md` — 명령어·트러블슈팅·파일 구조

---

## Milestone 1 상태 확인 (작업 전 먼저 실행)

```bash
npm run test:run && npm run typecheck && npm run lint && npm run simulate
```

4개 명령이 모두 통과하는지 확인한다. 실패 시 Milestone 1 복구부터 먼저 진행한다.

---

## 이번 작업의 목표

`streamlit_walk_engine/` 폴더의 Streamlit 웹 데모를 완성한다.
TypeScript 엔진을 Python으로 정확히 포팅한 `engine.py`를 기반으로,
브라우저에서 경로 이탈 판정을 시각화하는 로컬 데모를 동작 가능한 상태로 만든다.

---

## 구현 대상 파일 목록

### Streamlit 웹 데모 (`streamlit_walk_engine/`)

| 파일 | 해야 할 일 |
|------|-----------|
| `streamlit_walk_engine/engine.py` | TypeScript 엔진과 동일한 로직 Python 포팅 완성 — `RouteDeviationEngine`, `EngineConfig`, `EngineResult` 포함 |
| `streamlit_walk_engine/scenarios.py` | TypeScript 시뮬레이터 4가지 시나리오와 동일한 좌표 데이터 Python으로 구현 |
| `streamlit_walk_engine/app.py` | Streamlit UI — 시나리오 선택, 슬라이더, 지도(Plotly), 상태 배지, 결과 테이블 |
| `streamlit_walk_engine/requirements.txt` | streamlit, plotly, pandas 버전 고정 |

### 문서
| 파일 | 해야 할 일 |
|------|-----------|
| `README.md` | "웹 데모 실행" 섹션 추가 — `npm run web:install` → `npm run web:demo` 순서 |
| `docs/progress-notes.md` | Milestone 2 작업 내용 추가 |

---

## 엔진 포팅 요구사항 (`engine.py`)

TypeScript `packages/route-engine/src/` 와 완전히 동일한 로직을 Python으로 구현한다.

### 필수 타입/클래스
```python
@dataclass(frozen=True)
class Coordinate:
    latitude: float
    longitude: float

@dataclass(frozen=True)
class PositionSample:
    latitude: float
    longitude: float
    heading_degrees: float
    speed_meters_per_second: float
    timestamp_ms: int

@dataclass(frozen=True)
class TurnPoint: ...

@dataclass(frozen=True)
class RouteModel: ...

@dataclass
class EngineConfig: ...   # 기본 임계값 포함

@dataclass(frozen=True)
class EngineMetrics: ...

@dataclass(frozen=True)
class EngineResult:
    state: DeviationState
    score: float
    reasons: list[str]
    metrics: EngineMetrics
    suggested_next_action: SuggestedAction

class RouteDeviationEngine:
    def __init__(self, route: RouteModel, config: EngineConfig = ...) -> None: ...
    def process_sample(self, sample: PositionSample) -> EngineResult: ...
```

### 필수 geometry 함수
```python
def distance_meters(a: Coordinate, b: Coordinate) -> float: ...
def bearing_degrees(a: Coordinate, b: Coordinate) -> float: ...
def normalize_heading(h: float) -> float: ...
def angular_difference(a: float, b: float) -> float: ...
def point_to_segment_distance(p, a, b): ...
def point_to_polyline_distance(p, polyline): ...
```

### 기본 임계값 (TypeScript와 동일)
| 항목 | 기본값 |
|------|--------|
| route_drift_distance_threshold_meters | 10.0 |
| route_deviation_distance_threshold_meters | 15.0 |
| strong_deviation_distance_threshold_meters | 25.0 |
| heading_threshold_degrees | 45.0 |
| pass_by_post_turn_distance_threshold_meters | 8.0 |
| minimum_consecutive_samples_for_deviation | 3 |
| minimum_drift_duration_ms | 4000 |

---

## Streamlit UI 요구사항 (`app.py`)

### 좌측 사이드바
- 시나리오 선택 selectbox (4가지)
- 표시할 샘플 수 slider (0 ~ max)
- 엔진 임계값 실시간 조절 sliders

### 중앙 메인 영역
- Plotly 지도: 기준 경로(파랑), 회전 지점(주황 삼각형), 샘플 경로(점선), 샘플 점(상태별 색)
- 상태별 색상: on_route=#27ae60, drifting=#f39c12, deviated=#e74c3c, passed_turn=#8e44ad
- 샘플 hover 시 상태·거리·heading 차이 표시

### 우측 패널
- 현재 상태 배지 (색상 있는 박스)
- 권장 액션 배지
- 주요 수치 metrics (거리, heading 차이, 연속 위반 횟수, drift 지속 시간)
- 판정 이유 목록

### 하단
- 샘플별 결과 DataFrame 테이블

---

## 4가지 시나리오 요구사항 (`scenarios.py`)

TypeScript `scenarios.ts` 와 동일한 4가지 시나리오:

| 시나리오 | 예상 상태 변화 |
|----------|---------------|
| `normal_walking` | 전체 on_route |
| `mild_drift` | on_route → drifting |
| `strong_deviation` | on_route → drifting → deviated |
| `missed_turn` | on_route → drifting → passed_turn |

각 시나리오는 최소 6개 이상의 위치 샘플을 포함한다.

---

## 실행 루프

```bash
# 1. Python 패키지 설치
npm run web:install

# 2. 앱 실행
npm run web:demo
# → 브라우저에서 http://localhost:8501 접속

# 3. 수정 후 재실행 (Streamlit은 파일 변경 시 자동 리로드)
```

---

## 완료 판단 기준

```bash
npm run web:install   # 오류 없이 완료
npm run web:demo      # http://localhost:8501 접속 가능
```

추가 확인 항목:
- [ ] 4가지 시나리오 모두 선택 가능
- [ ] 슬라이더로 샘플 단계별 진행 가능
- [ ] 각 시나리오에서 예상 상태값이 최소 1번 이상 등장
- [ ] 임계값 슬라이더 변경 시 결과가 즉시 반영
- [ ] 콘솔 오류 없이 실행

---

## 종료 조건

아래 둘 중 하나일 때만 멈춘다.

1. 위 완료 판단 기준을 전부 만족했다.
2. 실제 해결 불가능한 차단 이슈가 발생했고, 이유와 현재 상태를 `docs/progress-notes.md`에 명확히 기록했다.
