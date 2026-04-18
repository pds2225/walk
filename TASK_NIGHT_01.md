# TASK_NIGHT_01.md
## walk — 1차 밤샘 작업 지시서
## Milestone 1 : Pedestrian Route Deviation Detection Engine

---

## 시작 전 필독 (반드시 이 순서대로 읽는다)

1. `PROMPT.md` — 무엇을 만드는지, 어디까지 만드는지
2. `PLAN.md` — 단계별 작업 순서
3. `DONE.md` — 완료 기준 체크리스트
4. `TASK_NIGHT_01.md` — 지금 이 파일 (오늘 밤 구체적 지시)
5. `RUNBOOK.md` — 명령어·트러블슈팅·파일 구조

---

## 이번 작업의 목표
보행 경로 이탈 감지 엔진을 완성한다.
`DONE.md`의 A~G 섹션 전체를 만족하는 상태로 만든다.

---

## 구현 대상 파일 목록

아래 파일 전체를 구현하거나 보완한다.
파일이 이미 있으면 내용을 점검하고 누락된 부분을 추가한다.

### 타입 정의
| 파일 | 해야 할 일 |
|------|-----------|
| `packages/route-engine/src/types/models.ts` | `Coordinate`, `PositionSample`, `TurnDirection`, `TurnPoint`, `RoutePolyline`, `RouteModel`, `DeviationState`, `SuggestedAction`, `EngineConfig`, `EngineMetrics`, `EngineResult` 타입 정의 |
| `packages/route-engine/src/types/index.ts` | 위 타입 전체 re-export |

### 설정
| 파일 | 해야 할 일 |
|------|-----------|
| `packages/route-engine/src/config/walkingConfig.ts` | 기본 임계값 상수 정의 (거리·방향·연속횟수·시간) |
| `packages/route-engine/src/config/index.ts` | re-export |

### 거리·방향 계산
| 파일 | 해야 할 일 |
|------|-----------|
| `packages/route-engine/src/geometry/geo.ts` | `distanceMeters`, `bearingDegrees`, `normalizeHeading`, `angularDifference`, `pointToSegmentDistanceMeters`, `pointToPolylineDistanceMeters` 구현 |
| `packages/route-engine/src/geometry/index.ts` | re-export |

### 경로 맥락 분석
| 파일 | 해야 할 일 |
|------|-----------|
| `packages/route-engine/src/domain/routeAnalysis.ts` | 최근접 구간 탐색, 기대 heading 산출, 다음 turn point 탐색, 회전 지점까지 거리 계산 |
| `packages/route-engine/src/domain/index.ts` | re-export |

### 판정 엔진
| 파일 | 해야 할 일 |
|------|-----------|
| `packages/route-engine/src/engine/evaluateDeviation.ts` | 단일 샘플 기반 이탈 점수·이유·상태 계산 (순수 함수) |
| `packages/route-engine/src/engine/routeDeviationEngine.ts` | 상태 유지형 엔진 클래스 — 연속 샘플 흐름 처리 |
| `packages/route-engine/src/engine/index.ts` | re-export |

### 시뮬레이터
| 파일 | 해야 할 일 |
|------|-----------|
| `packages/route-engine/src/simulator/scenarios.ts` | 정상 보행, 서서히 이탈, 명확한 이탈, 회전 지점 놓침 4가지 샘플 데이터 |
| `packages/route-engine/src/simulator/runSimulator.ts` | 4개 시나리오 순서 실행 + 콘솔 출력 |

### 테스트
| 파일 | 반드시 포함해야 할 테스트 케이스 |
|------|----------------------------------|
| `packages/route-engine/tests/geometry.test.ts` | `distanceMeters` 정확도, `angularDifference` 0~180 범위, `pointToPolylineDistanceMeters` 다중 선분 |
| `packages/route-engine/tests/routeAnalysis.test.ts` | 최근접 구간 탐색, 기대 heading, turn point 거리 |
| `packages/route-engine/tests/engine.test.ts` | `on_route`, `drifting`, `deviated`, `passed_turn` 각 1개 이상, GPS 노이즈 방어, 복귀 후 카운터 리셋, 커스텀 config 주입 |

### 패키지 진입점
| 파일 | 해야 할 일 |
|------|-----------|
| `packages/route-engine/src/index.ts` | 외부에서 쓸 수 있도록 엔진·타입·config 공개 진입점으로 re-export |

### 문서
| 파일 | 해야 할 일 |
|------|-----------|
| `README.md` | 프로젝트 목적, 설치법, 테스트 실행법, 시뮬레이터 실행법, 상태값 설명, 설정값 설명 |
| `docs/progress-notes.md` | 완료 항목, 미완료 항목, 발생한 이슈, 다음 마일스톤 제안 |

---

## 실행 루프 (반복 순서)

PLAN.md의 Step 단위로 아래 루프를 돌린다.

```
[Step N 구현]
      ↓
npm run typecheck    ← 타입 오류 없으면 통과
      ↓
npm run test:run     ← 테스트 통과 여부 확인
      ↓
(실패 시) 원인 파악 → 수정 → 다시 루프
      ↓
(통과 시) docs/progress-notes.md 업데이트
      ↓
[Step N+1 구현]
```

의미 있는 변경이 쌓이면 전체 검증 루프도 돌린다.

```bash
npm run test:run && npm run typecheck && npm run lint && npm run simulate
```

---

## 완료 판단 기준

아래 명령이 전부 오류 없이 통과해야 한다.

```bash
npm run test:run     # 전체 통과
npm run lint         # 오류 0개
npm run typecheck    # 오류 0개
npm run simulate     # 4개 시나리오 상태 변화 출력
```

그 다음 `DONE.md`를 위에서 아래로 항목별로 대조한다.
A1~G 전체를 만족하면 완료다.

---

## 예상 최종 출력 (시뮬레이터 기준)

```
=== Scenario: normal_walking ===
  [1] state: on_route    dist:  2.1m  hdg_diff:  3°
  [2] state: on_route    dist:  1.8m  hdg_diff:  2°

=== Scenario: mild_drift ===
  [1] state: on_route    dist:  4.2m  hdg_diff:  8°
  [3] state: drifting    dist: 11.5m  hdg_diff: 22°

=== Scenario: strong_deviation ===
  [3] state: drifting    dist: 13.1m  hdg_diff: 38°
  [5] state: deviated    dist: 27.4m  hdg_diff: 61°

=== Scenario: missed_turn ===
  [4] state: drifting    dist:  9.8m  hdg_diff: 48°
  [6] state: passed_turn dist: 19.2m  hdg_diff: 72°
```

수치는 정확히 위와 같을 필요 없으나, 각 시나리오에서 예상 상태값이 최소 1번 이상 등장해야 한다.

---

## 종료 조건

아래 둘 중 하나일 때만 멈춘다.

1. `DONE.md` A~G 섹션 전체를 만족했다.
2. 실제 해결 불가능한 차단 이슈가 발생했고, 이유와 현재 상태를 `docs/progress-notes.md`에 명확히 기록했다.
