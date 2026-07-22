# PLAN.md

## 프로젝트
Walk - Milestone 1
Pedestrian Route Deviation Detection Engine

## 이 문서의 역할
이 문서는 Codex가 밤샘으로 작업할 때 따라야 하는 실행 계획서다.
`PROMPT.md`가 큰 방향을 정하는 문서라면, `PLAN.md`는 실제 작업 순서를 정하는 문서다.

## 비개발자용 짧은 용어 설명
- 타입(Type): 데이터의 모양을 정해두는 규칙이다. 예를 들어 좌표에는 위도와 경도가 꼭 있어야 한다는 식이다.
- 유틸리티(Utility): 여러 곳에서 공통으로 쓰는 작은 기능 함수다.
- 엔진(Engine): 핵심 판단 로직 묶음이다. 여기서는 경로 이탈 판정 로직을 뜻한다.
- 시뮬레이터(Simulator): 실제 GPS 대신 샘플 경로를 넣어 결과를 확인하는 테스트 도구다.
- 테스트(Test): 코드가 예상대로 동작하는지 자동으로 검사하는 장치다.
- 타입체크(Typecheck): 타입 규칙이 깨졌는지 검사하는 과정이다.
- 린트(Lint): 코드 실수나 일관성 문제를 검사하는 과정이다.

## 작업 원칙
1. 이번 마일스톤은 웹 UI가 아니라 "보행 경로 이탈 감지 엔진" 완성이 목표다.
2. `PROMPT.md` 범위를 벗어나는 기능은 만들지 않는다.
3. 이미 파일이 있으면 새로 만들기보다 내용을 점검하고 보완한다.
4. 한 단계가 끝날 때마다 검증 명령을 실행한다.
5. 구현 중 결정사항과 막힌 점은 `docs/progress-notes.md`에 남긴다.
6. 완료 판단은 반드시 `DONE.md` 기준으로 한다.

## 현재 핵심 파일 위치
- `package.json`
- `tsconfig.json`
- `eslint.config.js`
- `README.md`
- `docs/progress-notes.md`
- `packages/route-engine/src/index.ts`
- `packages/route-engine/src/types/models.ts`
- `packages/route-engine/src/types/index.ts`
- `packages/route-engine/src/config/walkingConfig.ts`
- `packages/route-engine/src/config/index.ts`
- `packages/route-engine/src/geometry/geo.ts`
- `packages/route-engine/src/geometry/index.ts`
- `packages/route-engine/src/domain/routeAnalysis.ts`
- `packages/route-engine/src/domain/index.ts`
- `packages/route-engine/src/engine/evaluateDeviation.ts`
- `packages/route-engine/src/engine/routeDeviationEngine.ts`
- `packages/route-engine/src/engine/index.ts`
- `packages/route-engine/src/simulator/scenarios.ts`
- `packages/route-engine/src/simulator/runSimulator.ts`
- `packages/route-engine/tests/geometry.test.ts`
- `packages/route-engine/tests/routeAnalysis.test.ts`
- `packages/route-engine/tests/engine.test.ts`

---

# Step 1. 프로젝트 기반 점검

## 목표
실행, 테스트, 타입 검사, 린트, 시뮬레이터가 돌아가는 최소 작업 기반을 확인한다.

## 필요한 파일
- `package.json`
- `tsconfig.json`
- `eslint.config.js`
- `packages/route-engine/src/index.ts`

## 해야 할 내용
1. npm 스크립트가 아래 명령을 포함하는지 확인한다.
   - `test`
   - `test:run`
   - `lint`
   - `typecheck`
   - `simulate`
2. TypeScript strict 모드가 켜져 있는지 확인한다.
3. 엔진 진입점 파일(`src/index.ts`)이 필요한 기능을 내보내고 있는지 확인한다.
4. 폴더 구조가 문서와 실제 코드가 어긋나지 않는지 확인한다.

## 완료 기준
- `npm run typecheck` 성공
- `npm run lint` 성공
- `npm run test:run` 실행 가능
- `npm run simulate` 실행 가능 또는 실행 가능한 상태로 정리됨

---

# Step 2. 타입 설계 고정

## 목표
엔진이 사용하는 데이터 구조를 명확하게 고정한다.

## 필요한 파일
- `packages/route-engine/src/types/models.ts`
- `packages/route-engine/src/types/index.ts`

## 해야 할 내용
1. 아래 타입이 실제 엔진 입력/출력에 쓰이도록 정리한다.
   - `Coordinate`
   - `PositionSample`
   - `TurnDirection`
   - `TurnPoint`
   - `RoutePolyline`
   - `RouteModel`
   - `DeviationState`
   - `SuggestedAction`
   - `EngineConfig`
   - `EngineMetrics`
   - `EngineResult`
2. `any` 사용을 없애고, 선택값과 필수값을 구분한다.
3. 다른 모듈에서 import 하기 쉽게 `index.ts` 내보내기를 정리한다.

## 완료 기준
- 타입 이름만 보고 역할이 이해된다.
- 엔진 입력과 결과가 모두 타입으로 보장된다.
- strict mode에서 오류가 없다.

---

# Step 3. 거리/방향 계산 유틸리티 완성

## 목표
경로 이탈 판단의 기초 수학 계산을 정확히 만든다.

## 필요한 파일
- `packages/route-engine/src/geometry/geo.ts`
- `packages/route-engine/src/geometry/index.ts`
- `packages/route-engine/tests/geometry.test.ts`

## 해야 할 내용
1. 두 좌표 사이 거리 계산 함수 구현 또는 보완
2. 진행 방향 각도 계산 함수 구현 또는 보완
3. heading 정규화 함수 구현 또는 보완
4. 두 방향 차이를 0~180도로 계산하는 함수 구현 또는 보완
5. 점과 선분 사이 거리 계산 함수 구현 또는 보완
6. 점과 polyline 전체 사이 최단 거리 함수 구현 또는 보완

## 완료 기준
- 거리 계산 결과가 상식적인 미터 단위로 나온다.
- 방향 차이가 항상 0~180 범위다.
- 여러 선분으로 된 경로에서도 최단 거리 계산이 가능하다.
- 관련 테스트가 모두 통과한다.

---

# Step 4. 경로 맥락 분석 레이어 정리

## 목표
단순 거리 계산을 넘어, "현재 사용자가 경로의 어느 부분에 있는지" 파악할 수 있게 한다.

## 필요한 파일
- `packages/route-engine/src/domain/routeAnalysis.ts`
- `packages/route-engine/src/domain/index.ts`
- `packages/route-engine/tests/routeAnalysis.test.ts`

## 해야 할 내용
1. 현재 샘플과 가장 가까운 경로 구간 찾기
2. 현재 구간의 기대 진행 방향 구하기
3. 다음 회전 지점 찾기
4. 회전 지점까지 남은 거리 구하기
5. 회전 지점 전/후 여부를 판단하기 위한 보조값 만들기

## 완료 기준
- 엔진이 현재 구간 방향을 참조할 수 있다.
- 다음 회전 지점 관련 정보가 구조화되어 나온다.
- turn point 관련 테스트가 통과한다.

---

# Step 5. 기본 이탈 판정 로직 완성

## 목표
`on_route`, `drifting`, `deviated` 상태를 안정적으로 판단하는 핵심 규칙을 만든다.

## 필요한 파일
- `packages/route-engine/src/config/walkingConfig.ts`
- `packages/route-engine/src/engine/evaluateDeviation.ts`
- `packages/route-engine/tests/engine.test.ts`

## 해야 할 내용
1. 기본 보행 임계값 설정을 정리한다.
2. 아래 요소를 종합해서 점수 또는 판정 규칙을 만든다.
   - 경로와의 거리
   - 방향 차이
   - 연속 위반 샘플 수
   - 일정 시간 이상 지속 여부
3. `state`, `score`, `reasons`, `metrics`, `suggestedAction`을 포함한 결과를 반환한다.
4. GPS 한 번 튄 값만으로 즉시 `deviated`가 되지 않도록 방어 로직을 둔다.

## 완료 기준
- 정상 샘플은 `on_route`
- 애매한 이탈은 `drifting`
- 지속된 이탈은 `deviated`
- 근거 정보가 결과 객체에 포함됨

---

# Step 6. 회전 지점 통과 감지 완성

## 목표
길을 꺾어야 하는 지점을 지나쳤는지 판단하는 `passed_turn` 로직을 완성한다.

## 필요한 파일
- `packages/route-engine/src/engine/evaluateDeviation.ts`
- `packages/route-engine/src/engine/routeDeviationEngine.ts`
- `packages/route-engine/tests/engine.test.ts`

## 해야 할 내용
1. 회전 지점 접근 구간에 들어왔는지 판단한다.
2. 회전 지점을 지난 뒤에도 기대 방향으로 돌지 않았는지 확인한다.
3. 통과 후 진행 방향이 잘못되면 `passed_turn` 상태를 반환한다.
4. 왜 `passed_turn` 인지 이유와 수치를 결과에 남긴다.

## 완료 기준
- 회전 놓침 시 `passed_turn` 테스트가 통과한다.
- 정상 회전 시 잘못 경고하지 않는다.
- 직선 경로에서 오탐지가 심하지 않다.

---

# Step 7. 상태 유지형 엔진 완성

## 목표
샘플 1개씩 보는 계산이 아니라, 연속 샘플 흐름을 반영하는 엔진으로 만든다.

## 필요한 파일
- `packages/route-engine/src/engine/routeDeviationEngine.ts`
- `packages/route-engine/src/engine/index.ts`
- `packages/route-engine/tests/engine.test.ts`

## 해야 할 내용
1. 엔진 인스턴스를 만들 수 있게 한다.
2. 샘플을 순서대로 넣을 수 있게 한다.
3. 연속 위반 횟수, drift 시작 시점, turn 접근 상태를 내부적으로 추적한다.
4. 사용자가 다시 정상 경로로 복귀하면 카운터를 적절히 초기화한다.

## 완료 기준
- 외부에서 엔진을 생성하고 샘플을 순서대로 주입할 수 있다.
- 결과가 샘플 누적 상태를 반영한다.
- 복귀 후 상태 리셋이 정상 동작한다.

---

# Step 8. 시뮬레이터 시나리오 완성

## 목표
사람이 직접 샘플 데이터를 넣어보지 않아도, 대표 상황을 한 번에 재현할 수 있게 한다.

## 필요한 파일
- `packages/route-engine/src/simulator/scenarios.ts`
- `packages/route-engine/src/simulator/runSimulator.ts`

## 해야 할 내용
1. 정상 보행 시나리오 작성
2. 서서히 벗어나는 시나리오 작성
3. 명확히 이탈하는 시나리오 작성
4. 회전 지점 놓침 시나리오 작성
5. 콘솔 출력이 상태 변화를 읽기 쉽게 보이도록 정리한다.

## 완료 기준
- `npm run simulate` 실행 가능
- 각 시나리오에서 상태 변화가 눈으로 확인된다.

---

# Step 9. 테스트 보강

## 목표
핵심 실패 상황까지 자동 검사해서, 밤샘 작업 뒤에도 망가진 부분을 빠르게 찾을 수 있게 한다.

## 필요한 파일
- `packages/route-engine/tests/geometry.test.ts`
- `packages/route-engine/tests/routeAnalysis.test.ts`
- `packages/route-engine/tests/engine.test.ts`

## 반드시 포함할 테스트
1. geometry correctness
2. on_route scenario
3. drifting scenario
4. deviated scenario
5. passed_turn scenario
6. noisy GPS scenario
7. counter reset scenario
8. config override scenario

## 완료 기준
- 모든 테스트 통과
- 상태별 최소 1개 이상 테스트 존재
- 의미 없는 형식적 테스트가 아니라 실제 실패를 잡아낼 수 있음

---

# Step 10. 문서 정리

## 목표
비개발자도 실행할 수 있게 프로젝트 문서를 정리한다.

## 필요한 파일
- `README.md`
- `docs/progress-notes.md`
- `DONE.md`

## 해야 할 내용
1. 프로젝트 목적 설명
2. 설치 방법 설명
3. 테스트 실행 방법 설명
4. 시뮬레이터 실행 방법 설명
5. 상태값 의미 설명
6. 설정값 의미 설명
7. 진행 내용과 결정 사항 기록
8. 남은 이슈가 있으면 명확히 기록

## 완료 기준
- README만 보고 실행 가능
- progress-notes가 실제 작업 내용과 일치함
- DONE 체크 판단에 필요한 정보가 문서에 남아 있음

---

# Step 11. 최종 검증

## 목표
실제로 마일스톤을 닫아도 되는 상태인지 마지막으로 확인한다.

## 필수 실행 명령
```bash
npm run test:run
npm run lint
npm run typecheck
npm run simulate
```

## 최종 점검 항목
1. 모바일 UI, 지도 SDK, 백엔드 등 범위 밖 기능이 섞이지 않았는지 확인
2. TODO만 있고 실제 구현 없는 파일이 남지 않았는지 확인
3. 외부에서 쓸 수 있는 엔진 진입점이 정리되어 있는지 확인
4. 모듈 경계가 읽기 쉬운지 확인
5. 미완료 사항이 있으면 `docs/progress-notes.md`에 남겼는지 확인
6. `DONE.md` 조건을 하나씩 다시 대조했는지 확인

## 종료 규칙
아래 둘 중 하나일 때만 작업을 멈춘다.
1. `DONE.md`의 필수 완료 조건을 모두 만족했다.
2. 실제 차단 이슈가 있고, 그 내용을 문서에 명확히 남겼다.

---

# 밤샘 실행 순서 요약
1. `PROMPT.md` 읽기
2. `PLAN.md` 읽기
3. `DONE.md` 읽기
4. `TASK_NIGHT_01.md` 읽기
5. Step 1부터 Step 11까지 순서대로 수행
6. 단계 사이마다 테스트, 타입체크, 린트, 시뮬레이터 실행
7. `README.md`와 `docs/progress-notes.md` 업데이트
8. `DONE.md`를 기준으로 완료 여부 판단
