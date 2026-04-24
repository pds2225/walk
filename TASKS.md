# TASKS.md — walk
> 대상 프로젝트: D:/walk
> 생성일: 2026-04-22
> 생성 기준: Milestone 1/2 완료 상태 기반 정적 분석

---

## Active

### Day 1 - Python 엔진 테스트 (P1)

- [ ] [TASK-01] streamlit_walk_engine/tests/ 폴더 생성 및 geometry 함수 단위 테스트 작성 — distance_meters, bearing_degrees, angular_difference, point_to_polyline_distance
- [ ] [TASK-02] streamlit_walk_engine/engine.py 상태 엔진 테스트 작성 — on_route, drifting, deviated, passed_turn 각 1개 이상 + 커스텀 config 주입

### Day 2 - TypeScript 엔진 엣지 케이스 보강 (P2)

- [ ] [TASK-03] packages/route-engine/tests/engine.test.ts 에 빈 경로(0개 좌표) 및 단일 좌표 경로 방어 테스트 추가
- [ ] [TASK-04] packages/route-engine/tests/routeAnalysis.test.ts 에 회전 지점 없는 직선 경로 케이스 테스트 추가

### Day 3 - Python 포팅 정확성 검증 (P2)

- [ ] [TASK-05] streamlit_walk_engine/tests/test_scenarios.py 작성 — TypeScript 시뮬레이터와 동일한 4가지 시나리오에서 Python 엔진이 동일한 상태 전환을 생성하는지 검증

### Day 4 - streamlit_task_organizer 보강 (P2)

- [ ] [TASK-06] streamlit_task_organizer/tests/ 에 services 레이어 테스트 추가 — 파싱 실패 케이스(빈 입력, 날짜 없음, 연락처 없음) 방어 테스트

## Waiting On

- (없음)

## Done

- [x] Milestone 1 완료 — TypeScript 경로 이탈 감지 엔진 (21 tests, typecheck, lint, simulate 통과)
- [x] Milestone 2 완료 — Streamlit 웹 데모 (engine.py, scenarios.py, app.py, web:install, web:demo 통과)

---

## 태스크 상세

### TASK-01 — Python geometry 함수 단위 테스트

**심각도:** P1
**파일:** 신규 `streamlit_walk_engine/tests/__init__.py`, `streamlit_walk_engine/tests/test_geometry.py`
**의존성:** 없음

**문제:**
`streamlit_walk_engine/engine.py`의 684줄 중 geometry 함수(distance_meters, bearing_degrees, normalize_heading, angular_difference, point_to_segment_distance, point_to_polyline_distance)에 자동화 테스트가 없다. TypeScript 쪽은 geometry.test.ts 6개 케이스가 있으나 Python 포팅은 무검증 상태.

**수락 기준:**
- [ ] `streamlit_walk_engine/tests/test_geometry.py` 파일 생성
- [ ] distance_meters: 두 좌표 간 거리 계산 정확도 검증 (오차 1m 이내)
- [ ] angular_difference: 0~180 범위 반환 검증
- [ ] point_to_polyline_distance: 다중 선분 최솟값 반환 검증
- [ ] `cd streamlit_walk_engine && python -m pytest tests/ -v` 통과

---

### TASK-02 — Python 엔진 상태 테스트

**심각도:** P1
**파일:** 신규 `streamlit_walk_engine/tests/test_engine.py`
**의존성:** TASK-01 (tests/ 폴더)

**문제:**
RouteDeviationEngine.process_sample() 의 4가지 상태(on_route, drifting, deviated, passed_turn)에 대한 pytest 테스트가 없다.

**수락 기준:**
- [ ] on_route 시나리오 1개 이상
- [ ] drifting 시나리오 1개 이상
- [ ] deviated 시나리오 1개 이상
- [ ] passed_turn 시나리오 1개 이상
- [ ] 커스텀 EngineConfig 주입 테스트 1개
- [ ] `python -m pytest streamlit_walk_engine/tests/ -v` 통과

---

### TASK-03 — TypeScript 엔진 빈 경로 방어 테스트

**심각도:** P2
**파일:** `packages/route-engine/tests/engine.test.ts`
**의존성:** 없음

**문제:**
RouteDeviationEngine에 빈 경로(waypoints 0개)나 단일 좌표 경로를 입력했을 때 어떻게 동작하는지 테스트가 없다. 실제 앱에서 잘못된 경로 데이터가 들어오면 undefined 접근으로 크래시 가능성 있음.

**수락 기준:**
- [ ] 빈 waypoints 배열 입력 시 throws 또는 on_route 반환 (명시적 처리)
- [ ] 단일 좌표 경로 입력 시 크래시 없이 결과 반환
- [ ] `npm run test:run` 통과

---

### TASK-04 — TypeScript 회전 지점 없는 직선 경로 테스트

**심각도:** P2
**파일:** `packages/route-engine/tests/routeAnalysis.test.ts`
**의존성:** 없음

**문제:**
현재 routeAnalysis 테스트는 회전 지점이 있는 경로만 다룬다. turnPoints 배열이 빈 직선 경로에서 getNextTurnPoint, distanceToTurnPoint 호출 시 동작 미검증.

**수락 기준:**
- [ ] turnPoints 빈 배열 경로에서 getNextTurnPoint → null 반환 검증
- [ ] turnPoints 빈 배열 경로에서 distanceToTurnPoint → null/Infinity 반환 검증
- [ ] `npm run test:run` 통과

---

### TASK-05 — Python 시나리오 정확성 검증 테스트

**심각도:** P2
**파일:** 신규 `streamlit_walk_engine/tests/test_scenarios.py`
**의존성:** TASK-01, TASK-02

**문제:**
TypeScript CLI 시뮬레이터 출력과 Python 엔진 출력이 실제로 일치하는지 자동화된 검증이 없다. progress-notes.md에 "matches exactly"라고 기록돼 있으나 회귀 방지 테스트 부재.

**수락 기준:**
- [ ] normal_walking: 전체 on_route 확인
- [ ] mild_drift: 마지막 샘플이 drifting 상태 확인
- [ ] strong_deviation: deviated 상태 최소 1회 등장 확인
- [ ] missed_turn: passed_turn 상태 최소 1회 등장 확인
- [ ] `python -m pytest streamlit_walk_engine/tests/ -v` 통과

---

### TASK-06 — streamlit_task_organizer 방어 테스트

**심각도:** P2
**파일:** `streamlit_task_organizer/tests/` 신규 파일 추가
**의존성:** 없음

**문제:**
현재 7개 테스트는 정상 케이스만 다룬다. 빈 입력, 날짜 없는 텍스트, 연락처 없는 텍스트 등 비정상 입력에 대한 방어 테스트 없음.

**수락 기준:**
- [ ] 빈 문자열 입력 시 각 파서가 None/빈값 반환 (크래시 없음)
- [ ] 날짜 패턴 없는 텍스트 → due_date=None 반환 검증
- [ ] 연락처 없는 텍스트 → contacts=[] 반환 검증
- [ ] `cd streamlit_task_organizer && python -m pytest tests/ -v` 통과
