# Walk

`walk`는 보행 내비게이션에서 사용자가 정해진 경로를 잘 따라가고 있는지 판단하는 프로젝트입니다.

쉽게 말하면, 사용자의 현재 위치 샘플을 하나씩 받아서 다음 상태를 판정합니다.

- 정상 경로 위에 있음
- 경로에서 조금 벗어나기 시작함
- 확실히 경로를 이탈함
- 회전해야 할 지점을 지나침

현재 저장소에는 TypeScript 기반 경로 이탈 판정 엔진과 Streamlit 기반 로컬 화면이 함께 들어 있습니다.

## 현재 진행 상태

### 완료된 작업

- 보행 경로 이탈 판정 엔진 구현
- 경로 선, 회전 지점, 현재 위치 샘플 모델 구현
- 경로까지 거리 계산
- 진행 방향 차이 계산
- 회전 지점 통과 여부 판정
- GPS 정확도 기반 알림 필터 추가
- Streamlit 로컬 데모 화면 구성
- Navigation 페이지에서 경로, 현재 위치, 거리, 예상 시간, 회전 안내 표시
- 자동 테스트 구성
- `main` 브랜치를 `origin/main` 최신 상태로 동기화

### 검증 완료

아래 검증은 `D:\walk` 기준으로 통과했습니다.

```powershell
cd D:\walk
python -m pytest "D:\walk\streamlit_walk_engine\tests" -q
python -m pytest "D:\walk\streamlit_task_organizer\tests" -q
npm run test:run
npm run typecheck
```

검증 결과:

- `streamlit_walk_engine` 테스트: 97개 통과
- `streamlit_task_organizer` 테스트: 20개 통과
- TypeScript/Vitest 테스트: 81개 통과
- TypeScript 타입 검사: 통과

### 진행 중인 브랜치

`worktree-visual-verdict-nav-ui` 브랜치는 아직 `main`에 병합되지 않았습니다.

이 브랜치의 기능:

- 경로를 만들기 전에도 Navigation 화면에 기본 지도를 표시
- 현재 위치가 있으면 현재 위치 중심으로 지도 표시
- 현재 위치가 없으면 서울시청 기준 기본 지도 표시

수정 파일:

```text
streamlit_walk_engine/pages/1_Navigation.py
```

현재 판단:

- 기능 자체는 유용한 화면 개선입니다.
- 이미 브랜치 커밋은 존재합니다.
- 다만 `main`에는 아직 들어가지 않았으므로, 나중에 PR 또는 병합 여부를 따로 결정해야 합니다.

## 프로젝트 구조

```text
packages/route-engine/
  src/
    config/
    domain/
    engine/
    geometry/
    simulator/
    types/
  tests/

streamlit_walk_engine/
  app.py
  engine.py
  gps_filter.py
  route_builder.py
  scenarios.py
  pages/
  tests/

streamlit_task_organizer/
  tests/
```

주요 진입점:

- TypeScript 엔진: `packages/route-engine/src/index.ts`
- Streamlit 데모: `streamlit_walk_engine/app.py`
- Navigation 화면: `streamlit_walk_engine/pages/1_Navigation.py`

## 설치 방법

Windows PowerShell 기준입니다.

```powershell
cd D:\walk
npm install
```

Python 데모 실행에 필요한 패키지도 설치합니다.

```powershell
cd D:\walk
npm run web:install
```

## 실행 방법

### 전체 테스트 실행

```powershell
cd D:\walk
npm run test:run
```

### 타입 검사

```powershell
cd D:\walk
npm run typecheck
```

### 린트 검사

```powershell
cd D:\walk
npm run lint
```

### 시뮬레이터 실행

```powershell
cd D:\walk
npm run simulate
```

### Streamlit 로컬 화면 실행

```powershell
cd D:\walk
npm run web:demo
```

실행 후 브라우저에서 아래 주소를 엽니다.

```text
http://localhost:8501
```

## 엔진 상태 값

- `on_route`: 경로를 정상적으로 따라가는 상태
- `drifting`: 경로에서 조금 벗어나기 시작한 상태
- `deviated`: 경로 이탈이 확실한 상태
- `passed_turn`: 회전해야 할 지점을 지나친 상태

## 추천 행동 값

- `none`: 별도 알림 없음
- `monitor`: 조금 더 지켜봄
- `warn_user`: 사용자에게 경고
- `reroute_candidate`: 재경로 탐색 후보

## 기본 기준값

엔진에서 사용하는 기본 보행 기준입니다.

- 경로 이탈 주의 거리: `10 m`
- 경로 이탈 확정 거리: `15 m`
- 강한 이탈 거리: `25 m`
- 진행 방향 차이 기준: `45 deg`
- 회전 지점 통과 거리: `8 m`
- 회전 접근 거리: `12 m`
- 이탈 확정 최소 샘플 수: `3`
- 이탈 확정 최소 지속 시간: `4000 ms`

## TypeScript 사용 예시

```ts
import { RouteDeviationEngine } from "./packages/route-engine/src/index.js";

const engine = new RouteDeviationEngine({
  polyline: [
    { latitude: 37.5665, longitude: 126.9780 },
    { latitude: 37.5665, longitude: 126.9790 },
  ],
  turnPoints: [],
});

const result = engine.processSample({
  latitude: 37.5665,
  longitude: 126.9785,
  headingDegrees: 90,
  speedMetersPerSecond: 1.4,
  timestampMs: Date.now(),
});

console.log(result.state);
console.log(result.metrics.distanceFromRouteMeters);
```

## 테스트 범위

현재 테스트는 다음을 확인합니다.

- 거리 계산
- 진행 방향 각도 계산
- 가장 가까운 경로 구간 찾기
- 회전 지점 탐색
- 정상 보행 시나리오
- 약한 이탈 시나리오
- 강한 이탈 시나리오
- 회전 지점 통과 시나리오
- GPS 노이즈 회복
- 상태 카운터 초기화
- 설정값 변경
- Streamlit 보조 기능

## 시뮬레이터 시나리오

시뮬레이터에는 다음 흐름이 들어 있습니다.

- 정상 보행
- 약한 경로 이탈
- 강한 경로 이탈
- 회전 지점 통과

각 샘플은 다음 값을 출력합니다.

- 엔진 상태
- 추천 행동
- 점수
- 경로까지 거리
- 진행 방향 차이
- 회전 지점 관련 거리

## 문제가 생겼을 때

`npm run web:demo`가 실패하면 아래 순서로 확인합니다.

```powershell
cd D:\walk
npm run web:install
python --version
python streamlit_walk_engine/run_demo.py
```

Streamlit이 실행 중인데 `localhost:8501`이 열리지 않으면, 자동화 터미널이 아니라 일반 PowerShell 창에서 같은 명령어를 다시 실행합니다.

## Git 정리 메모

현재 `main` 브랜치는 `origin/main`과 동기화되어 있습니다.

커밋에 넣지 말아야 할 로컬 파일 예시:

- `.env`, `.env.*`
- `.omc/`
- `.claude/settings.local.json`
- `*.log`
- 개인 작업용 복사본 폴더

README처럼 문서만 수정할 때도 커밋 전에는 아래 명령으로 포함 파일을 확인합니다.

```powershell
cd D:\walk
git status --short
```
