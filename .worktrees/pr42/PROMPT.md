# PROMPT.md
## 프로젝트명
walk
Walk - Milestone 1 : Pedestrian Route Deviation Detection Engine

---

## 이 문서의 목적
이 문서는 Codex가 이 저장소에서 밤샘 자율 작업을 수행할 때 기준으로 삼는 **메인 지시서**다.
작업 시작 전에 반드시 아래 5개 파일을 이 순서대로 전부 읽고 그대로 따른다.

1. `PROMPT.md` ← 지금 이 파일
2. `PLAN.md`
3. `DONE.md`
4. `TASK_NIGHT_01.md`
5. `RUNBOOK.md`

---

## 한 줄 서비스 정의
> 보행자가 기준 경로에서 이탈하는 시점을 조기에 감지하는 TypeScript 기반 경로 이탈 판정 엔진

---

## 핵심 문제 / 해결 방식

### 문제
보행 내비게이션에서는 사용자가 아래 상황에서 길을 잘못 들어도 **뒤늦게** 알아차린다.

- 꺾어야 할 회전 지점을 그냥 직진으로 통과함
- 골목을 잘못 들어가 경로에서 조금씩 벗어남
- 한참 직진한 뒤에야 재탐색 알림이 뜸
- GPS 값이 한 번 튀어도 즉시 경고가 떠서 오탐지가 잦음

### 해결 방식
- 연속 위치 샘플(위도, 경도, 방향, 속도, 타임스탬프)을 실시간으로 받아
- 기준 경로(RouteModel)와의 거리, 방향 차이, 연속 위반 횟수, 경과 시간을 종합해서
- `on_route / drifting / deviated / passed_turn` 4가지 상태 중 하나를 즉시 반환한다.

---

## 마일스톤 현황

### ✅ Milestone 1 — 완료
> TypeScript 기반 경로 이탈 감지 엔진 패키지 완성

완료 기준 전체 충족 (docs/progress-notes.md 참조):
- 타입 정의, geometry 함수, 판정 엔진, 시뮬레이터, 테스트 전부 통과
- npm run test:run / typecheck / lint / simulate 전부 통과

### 🟡 Milestone 2 — 진행 중
> Streamlit 기반 로컬 웹 데모 완성 (`streamlit_walk_engine/`)

현재 상태:
- app.py, engine.py, scenarios.py, requirements.txt 존재
- npm run web:install / npm run web:demo 명령 등록됨
- 완성도 및 검증 미완료

완료 기준:
1. `npm run web:install` 오류 없이 통과
2. `npm run web:demo` 실행 시 브라우저에서 localhost:8501 접속 가능
3. 기준 경로 입력 → 샘플 주입 → 상태 시각화 흐름 동작
4. Milestone 1 엔진 로직을 재사용(복붙 금지, import 방식)
5. README.md에 웹 데모 실행법 추가

---

## Codex 역할 정의
너는 이 프로젝트의 **시니어 풀스택 개발자**다.

- 기획 의도보다 멋부린 추상화를 우선하지 않는다.
- 실제로 동작하고 검증 가능한 결과물을 만든다.
- 작업 범위를 임의로 넓히지 않는다.
- 비개발자도 결과를 이해할 수 있도록 문서와 로그를 남긴다.

---

## 구현 범위 (In Scope / Out of Scope)

### In Scope — 반드시 만들어야 하는 것
| 번호 | 항목 | 설명 |
|------|------|------|
| 1 | Route polyline model | 기준 경로 좌표 배열 타입 |
| 2 | Turn point model | 회전 지점 타입 |
| 3 | Position sample model | 연속 위치 샘플 타입 |
| 4 | Engine config model | 임계값 설정 타입 |
| 5 | Engine result model | 상태·점수·이유 포함 결과 타입 |
| 6 | Distance-from-route calculation | 경로와의 최단 거리 계산 |
| 7 | Heading difference calculation | 방향 차이 계산 (0~180°) |
| 8 | Pass-by detection for turn points | 회전 지점 통과 감지 |
| 9 | Alert decision logic | 상태 판정 규칙 (연속 샘플 기반) |
| 10 | Configurable threshold system | 외부에서 임계값 주입 가능 |
| 11 | Stateful engine instance | 샘플 누적 상태를 유지하는 엔진 |
| 12 | Unit tests | 상태별 최소 1개 이상 |
| 13 | Simulator script | 4가지 대표 시나리오 자동 실행 |
| 14 | README update | 설치·실행·테스트법 포함 |
| 15 | docs/progress-notes.md update | 진행 내용·결정사항·이슈 기록 |

### Out of Scope — 전체 마일스톤에서 만들지 않는 것
- 모바일 앱 패키징
- 실시간 GPS 권한 연동 (기기 연동)
- 지도 SDK 연동 (Google Maps, Kakao Maps 등)
- 백엔드 API 서버
- 데이터베이스
- 로그인 / 회원가입
- 결제
- 운영 배포 자동화 (클라우드 배포)
- 관리자 페이지
- 푸시 알림
- Next.js 프론트엔드 (Streamlit 로컬 데모로 대체)

> **참고:** Streamlit 기반 로컬 웹 데모(`streamlit_walk_engine/`)는 Milestone 2 범위로 포함됨.

---

## 사용자 흐름 (User Flow)
```
[기준 경로 좌표 배열 입력]
        ↓
[엔진 인스턴스 생성 + config 주입]
        ↓
[연속 위치 샘플 순서대로 주입]
        ↓
[각 샘플마다 EngineResult 반환]
        ↓
[상태: on_route / drifting / deviated / passed_turn]
        ↓
[추천액션: none / monitor / warn_user / reroute_candidate]
```

---

## 필수 데이터 구조

### 엔진 입력 — PositionSample
```typescript
{
  latitude: number       // 위도
  longitude: number      // 경도
  heading: number        // 진행 방향 (0~360°)
  speed: number          // 속도 (m/s)
  timestamp: number      // 타임스탬프 (ms)
}
```

### 엔진 결과 — EngineResult
```typescript
{
  state: 'on_route' | 'drifting' | 'deviated' | 'passed_turn'
  score: number
  reasons: string[]
  metrics: {
    distanceFromRoute: number    // 경로와의 거리 (m)
    headingDifference: number    // 방향 차이 (°)
    consecutiveViolations: number
    driftDurationMs: number
  }
  suggestedAction: 'none' | 'monitor' | 'warn_user' | 'reroute_candidate'
}
```

### 상태값 의미
| 상태 | 의미 | 추천 액션 |
|------|------|-----------|
| `on_route` | 정상 경로 이동 중 | `none` |
| `drifting` | 경미하게 벗어나는 중 (주의) | `monitor` |
| `deviated` | 명확하게 이탈함 | `warn_user` / `reroute_candidate` |
| `passed_turn` | 회전 지점을 놓치고 직진 | `warn_user` |

---

## 기본 판단 원칙
GPS가 한 번 튄 값만으로 즉시 `deviated` 판정을 내리면 안 된다.
아래 요소를 **종합**해서 판정한다.

1. 기준 경로와의 거리 (미터)
2. 기대 진행 방향과 실제 heading 차이 (도)
3. 연속 위반 샘플 수 (개)
4. drift 지속 시간 (ms)
5. 회전 지점 전후 맥락

---

## 기본 임계값 (EngineConfig 기본값)
| 항목 | 기본값 | 설명 |
|------|--------|------|
| driftDistanceThreshold | 10 m | 이 이상 벗어나면 drifting |
| deviationDistanceThreshold | 15 m | 이 이상 벗어나면 deviated 후보 |
| strongDeviationThreshold | 25 m | 이 이상이면 즉시 deviated 강화 |
| headingThreshold | 45 ° | 방향 차이가 이 이상이면 위반 |
| passByPostTurnThreshold | 8 m | 회전 지점 통과 후 이 안에서 미회전이면 passed_turn |
| minConsecutiveViolations | 3 회 | 이 횟수 이상 연속 위반 시 상태 격상 |
| minDriftDurationMs | 4000 ms | 이 시간 이상 drift 지속 시 상태 격상 |

---

## 파일 구조 (구현 대상)
```
packages/route-engine/
├── src/
│   ├── types/
│   │   ├── models.ts          # 전체 타입 정의
│   │   └── index.ts           # 타입 내보내기
│   ├── config/
│   │   └── walkingConfig.ts   # 기본 임계값 설정
│   ├── geometry/
│   │   ├── geo.ts             # 거리·방향 계산 순수 함수
│   │   └── index.ts
│   ├── domain/
│   │   ├── routeAnalysis.ts   # 경로 맥락 분석 헬퍼
│   │   └── index.ts
│   ├── engine/
│   │   ├── evaluateDeviation.ts    # 이탈 판정 로직
│   │   ├── routeDeviationEngine.ts # 상태 유지형 엔진 클래스
│   │   └── index.ts
│   ├── simulator/
│   │   ├── scenarios.ts       # 4가지 시나리오 샘플 데이터
│   │   └── runSimulator.ts    # 시뮬레이터 실행 진입점
│   └── index.ts               # 패키지 공개 진입점
└── tests/
    ├── geometry.test.ts
    ├── routeAnalysis.test.ts
    └── engine.test.ts
```

---

## 코드 품질 원칙
아래를 반드시 지킨다.

1. 계산 로직과 상태 판정 로직을 분리한다.
2. geometry 계산은 순수 함수(pure function)로 유지한다.
3. TypeScript strict 모드에서 오류 없이 컴파일된다.
4. `any` 타입 사용 금지.
5. 함수명·파일명만 보고 역할이 이해되어야 한다.
6. 조용히 실패(silent failure)하지 말고, 원인을 알 수 있는 형태로 처리한다.
7. 빈 catch 블록 금지.
8. 불필요한 추상화 금지.
9. 테스트 가능한 구조를 우선한다.

---

## 검증 명령 (반복 실행)
의미 있는 변경이 있을 때마다 아래 명령을 순서대로 실행한다.

```bash
npm run test:run    # 자동 테스트 (핵심 로직 검증)
npm run typecheck   # 타입 오류 검사
npm run lint        # 코드 스타일·실수 검사
npm run simulate    # 샘플 시나리오 실행 및 상태 변화 확인
```

---

## 문서 업데이트 규칙
작업하면서 아래 문서를 **계속** 갱신한다.

| 파일 | 내용 |
|------|------|
| `README.md` | 프로젝트 소개, 설치법, 실행법, 테스트법, 시뮬레이터 사용법, 상태값 설명, 설정값 설명 |
| `docs/progress-notes.md` | 오늘 한 일, 결정 사항, 실패 원인, 다음 작업, 막힌 이슈 |
| `DONE.md` | 완료 조건 충족 여부 확인 (항목별 체크) |

---

## 작업 실행 규칙
1. 한 번에 한 하위 작업(PLAN.md의 Step 단위)만 완성한다.
2. 의미 있는 변경 후 즉시 검증 명령을 실행한다.
3. 실패하면 원인을 파악하고 `docs/progress-notes.md`에 기록한다.
4. 추측으로 완료 처리하지 않는다.
5. 이 저장소 밖 파일은 건드리지 않는다.
6. 요청하지 않은 새 기능을 추가하지 않는다.
7. 막혔을 때 추측으로 넘기지 말고, 합리적인 기본값을 선택해 진행하고 결정 사항을 기록한다.

---

## 금지 사항
| 번호 | 금지 내용 |
|------|-----------|
| 1 | 웹 UI까지 만들기 (범위 초과) |
| 2 | 지도 API 연동 (범위 초과) |
| 3 | 임시 더미 결과만 넣고 완료 처리 |
| 4 | 테스트 없이 핵심 로직을 완료라고 주장 |
| 5 | README 업데이트 생략 |
| 6 | 동작하지 않는 예시 코드 방치 |
| 7 | `any` 타입 사용 |
| 8 | 빈 catch 블록 사용 |

---

## 최종 산출물 체크리스트
작업이 끝났을 때 **최소한** 아래가 존재해야 한다.

- [ ] TypeScript 기반 route deviation engine (packages/route-engine)
- [ ] 강한 타입 정의 세트 (Coordinate, PositionSample, RouteModel, EngineResult 등)
- [ ] geometry 유틸리티 함수 (거리, 방향, 최단거리 등)
- [ ] 상태 판정 엔진 (on_route / drifting / deviated / passed_turn)
- [ ] 상태 유지형 엔진 인스턴스 (연속 샘플 흐름 반영)
- [ ] 4가지 시나리오 시뮬레이터
- [ ] 핵심 테스트 세트 (상태별 최소 1개)
- [ ] npm run test:run 통과
- [ ] npm run typecheck 통과
- [ ] npm run lint 통과
- [ ] npm run simulate 통과
- [ ] 실행 가능한 README
- [ ] docs/progress-notes.md 업데이트 완료

---

## 완료 기준 (종료 조건)
아래 **둘 중 하나**일 때만 작업을 멈춘다.

1. `DONE.md`의 **모든 필수 조건**을 만족했다.
2. 실제 해결 불가능한 차단 이슈가 발생했고, 그 내용을 `docs/progress-notes.md`에 **명확히** 기록했다.

---

## Codex 웹 실행용 프롬프트 (복붙용)
Codex 웹에서 작업을 시작할 때 아래 텍스트를 그대로 붙여넣는다.

```
Read PROMPT.md, PLAN.md, DONE.md, TASK_NIGHT_01.md, and RUNBOOK.md first.
Work only in this repository.
Implement Milestone 1 exactly as defined in PLAN.md.
Follow PLAN.md step by step. Do not expand scope.
Run npm run test:run, typecheck, lint, and simulate repeatedly as implementation progresses.
Update README.md and docs/progress-notes.md as work progresses.
Stop only when DONE.md is fully satisfied, or a real blocker is documented clearly in docs/progress-notes.md.
```
