# RUNBOOK.md
## walk — 실행 매뉴얼

이 문서는 사람이든 Codex든 **그대로 따라 하면 실행되는** 절차 매뉴얼이다.
작업 전에 반드시 `PROMPT.md`, `PLAN.md`, `DONE.md`, `TASK_NIGHT_01.md`를 먼저 읽는다.

---

## 전제 조건 (Prerequisites)

작업 전에 아래 환경이 갖춰져 있어야 한다.

| 항목 | 최소 버전 | 확인 명령 |
|------|-----------|-----------|
| Node.js | 22 이상 | `node -v` |
| npm | 10 이상 | `npm -v` |
| TypeScript | 프로젝트 내 설치됨 | `npx tsc -v` |

---

## 최초 설치 (First Time Setup)

처음 이 저장소를 클론하거나 `node_modules`가 없는 상태라면 아래 명령을 실행한다.

```bash
npm install
```

설치 후 아래 명령으로 기본 동작 여부를 확인한다.

```bash
npm run typecheck
```

오류 없이 완료되면 준비 완료다.

---

## 핵심 명령 (Commands)

### 1. 테스트 실행
```bash
npm run test:run
```
- 모든 자동 테스트를 1회 실행하고 결과를 출력한다.
- `packages/route-engine/tests/` 하위의 `.test.ts` 파일 전체를 대상으로 한다.
- 모든 테스트가 통과해야 한다. 실패 시 다음 단계로 넘어가지 않는다.

### 2. 타입 검사
```bash
npm run typecheck
```
- TypeScript strict 모드로 전체 코드의 타입 오류를 검사한다.
- 오류가 0개여야 한다.

### 3. 린트 검사
```bash
npm run lint
```
- ESLint로 코드 스타일·실수·타입 규칙 위반을 검사한다.
- 경고(warning)가 있어도 계속 진행할 수 있다. 오류(error)는 반드시 수정한다.

### 4. 시뮬레이터 실행
```bash
npm run simulate
```
- 샘플 경로 시나리오 4가지를 순서대로 실행한다.
- 콘솔에 각 샘플의 상태값(`on_route`, `drifting`, `deviated`, `passed_turn`)과 수치가 출력되어야 한다.
- 오류 없이 완료되고, 각 시나리오에서 상태 변화가 보이면 통과다.

### 5. 웹 데모 패키지 설치
```bash
npm run web:install
```
- Python 기반 웹 데모에 필요한 패키지를 설치한다.
- 처음 한 번만 실행하면 된다.

### 6. 웹 데모 실행
```bash
npm run web:demo
```
- 로컬 웹 화면이 켜진다.
- 브라우저에서 `http://localhost:8501` 로 접속한다.
- 이 웹 화면은 실제 서비스 배포본이 아니라 로컬 시뮬레이터다.

`Streamlit`:
파이썬 코드로 간단한 웹 화면을 띄우는 도구다.
즉, 프론트엔드 프레임워크를 새로 만드는 대신 빠르게 확인용 화면을 띄울 수 있다.

### 7. 전체 검증 루프 (순서대로 실행)
```bash
npm run test:run && npm run typecheck && npm run lint && npm run simulate
```
- 4개 명령을 순서대로 실행해서 하나라도 실패하면 즉시 멈춘다.
- 의미 있는 코드 변경 후 반드시 이 루프를 돌린다.

---

## 파일 구조 요약

```
walk/                              ← 프로젝트 루트
├── PROMPT.md                      ← Codex 메인 지시서
├── PLAN.md                        ← 단계별 작업 계획
├── DONE.md                        ← 완료 조건 체크리스트
├── TASK_NIGHT_01.md               ← 오늘 밤 작업 지시서
├── RUNBOOK.md                     ← 이 파일 (실행 매뉴얼)
├── package.json                   ← npm 스크립트 정의
├── tsconfig.json                  ← TypeScript 설정 (strict 모드)
├── eslint.config.js               ← ESLint 설정
├── docs/
│   └── progress-notes.md         ← 작업 진행 기록
├── streamlit_walk_engine/
│   ├── app.py                    ← 로컬 웹 데모 진입점
│   ├── engine.py                 ← 파이썬 포팅 엔진
│   ├── scenarios.py              ← 웹 데모 시나리오
│   └── requirements.txt          ← 웹 데모 패키지 목록
└── packages/
    └── route-engine/
        ├── src/
        │   ├── index.ts           ← 패키지 공개 진입점
        │   ├── types/
        │   │   ├── models.ts      ← 전체 타입 정의
        │   │   └── index.ts
        │   ├── config/
        │   │   ├── walkingConfig.ts  ← 기본 임계값 설정
        │   │   └── index.ts
        │   ├── geometry/
        │   │   ├── geo.ts         ← 거리·방향 계산 순수 함수
        │   │   └── index.ts
        │   ├── domain/
        │   │   ├── routeAnalysis.ts  ← 경로 맥락 분석 헬퍼
        │   │   └── index.ts
        │   ├── engine/
        │   │   ├── evaluateDeviation.ts    ← 이탈 판정 로직
        │   │   ├── routeDeviationEngine.ts ← 상태 유지형 엔진
        │   │   └── index.ts
        │   └── simulator/
        │       ├── scenarios.ts   ← 4가지 시나리오 샘플
        │       └── runSimulator.ts
        └── tests/
            ├── geometry.test.ts
            ├── routeAnalysis.test.ts
            └── engine.test.ts
```

---

## 시뮬레이터 출력 읽는 법

`npm run simulate` 실행 시 아래와 같은 형태의 출력이 나온다.

```
[Scenario: normal_walking]
  sample 1 → state: on_route  | distanceFromRoute: 2.1m  | heading diff: 3°
  sample 2 → state: on_route  | distanceFromRoute: 1.8m  | heading diff: 2°
  ...

[Scenario: missed_turn]
  sample 5 → state: drifting      | distanceFromRoute: 12.3m
  sample 6 → state: passed_turn   | distanceFromRoute: 18.7m
  ...
```

각 줄의 의미:

| 항목 | 의미 |
|------|------|
| `state` | 현재 이탈 상태 (on_route / drifting / deviated / passed_turn) |
| `distanceFromRoute` | 기준 경로와의 현재 거리 (미터) |
| `heading diff` | 기대 방향과 실제 방향의 차이 (도) |

---

## DONE.md 검증 절차

작업 완료 여부를 확인할 때 아래 순서로 진행한다.

1. `npm run test:run` → 전체 통과 확인
2. `npm run lint` → 오류 0개 확인
3. `npm run typecheck` → 오류 0개 확인
4. `npm run simulate` → 4개 시나리오 모두 상태 출력 확인
5. `DONE.md` 섹션 A~G를 위에서 아래로 하나씩 대조
6. `docs/progress-notes.md`에 완료 내용 기록
7. 미완료 항목이 있으면 해당 항목과 이유를 `docs/progress-notes.md`에 명시

---

## 웹 데모 확인 절차

비개발자 기준으로 결과를 눈으로 확인하고 싶다면 아래 순서로 본다.

1. `npm run web:install`
2. `npm run web:demo`
3. 브라우저에서 `http://localhost:8501` 열기
4. 왼쪽에서 시나리오 선택
5. 슬라이더를 움직여 샘플을 한 개씩 확인
6. 오른쪽 패널에서 현재 상태와 경로 거리 확인

정상이라면:
- `정상 보행` 시나리오에서는 대부분 `경로 유지`
- `경미한 이탈` 시나리오에서는 `이탈 시작`
- `강한 이탈` 시나리오에서는 `경로 이탈`
- `회전 미이행` 시나리오에서는 `회전 미이행`

---

## 트러블슈팅 (Troubleshooting)

### `npm run simulate` 실패 — "Cannot find module"
```bash
npm install
npm run typecheck
```
타입 오류가 있으면 먼저 수정한다.

### `npm run typecheck` 실패 — strict 모드 오류
- `any` 타입 사용 여부 확인
- `noUncheckedIndexedAccess` 관련 오류: 배열 접근 시 undefined 체크 추가
- `exactOptionalPropertyTypes` 관련 오류: 선택 프로퍼티에 `undefined` 명시적 허용

### `npm run lint` 오류 — `no-floating-promises`
- `async` 함수 호출 앞에 `await` 추가
- 또는 `void` 키워드로 명시적 무시: `void someAsync()`

### `npm run test:run` 일부 실패
- 실패한 테스트 이름을 확인하고 해당 파일만 먼저 수정
- 수정 후 다시 `npm run test:run` 실행

### `npm run web:demo` 실패
- 먼저 `npm run web:install` 실행
- `python --version` 으로 파이썬 설치 확인
- 포트가 이미 사용 중이면:
  `python -m streamlit run streamlit_walk_engine/app.py --server.port 8502`
- 그래도 안 되면 `python -m pip install -r streamlit_walk_engine/requirements.txt`를 직접 실행

---

## 작업 규칙 (Rules)

1. 작업 전 `PROMPT.md`, `PLAN.md`, `DONE.md`, `TASK_NIGHT_01.md`, `RUNBOOK.md` 5개를 반드시 읽는다.
2. 범위(`PROMPT.md`의 In Scope/Out of Scope)를 임의로 넘지 않는다.
3. 명령이 실패하면 반드시 원인을 파악하고 수정한 뒤 다음 단계로 넘어간다.
4. 막히면 `docs/progress-notes.md`에 이유와 현재 상태를 기록한다.
5. `DONE.md` 조건을 모두 만족하지 않으면 완료라고 선언하지 않는다.
6. 이 저장소 밖 파일은 수정하지 않는다.
