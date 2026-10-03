# RESUME.md — walk 현재 작업 체크포인트

> 갱신: 2026-10-03 09:52 KST. 작업 기준은 TASK.md이며 이 파일은 재개용이다.

## 0. 30초 컨텍스트
`passed_turn` 억제 문제 해결, `[walk:tick]` 로그 디버그 플래그 적용, TASK.md 등록을 진행 중이다.
기존 PR #130의 웹 GPS 보정 코드를 재사용한다. 회전 미이행을 횡거리/정확도 비교로 완화하는 것이 재현 대상이다.

## 1. 작업 위치와 재개
- Root: `D:\walk`; origin: `https://github.com/pds2225/walk.git`.
- Branch: `fix/passed-turn-debug-20261003`; base: `40daf37` (origin/main 캐시).
- 원격 main 실측: `404c5a8` (2026-10-03). 캐시 이후 차이는 Vercel 격리 설정 2개뿐이며 TASK/웹 소스는 동일하다.
- 재사용 코드: PR #130, head `5b657f1`; 웹 파일 4개를 작업 브랜치로 가져왔다.

```powershell
Set-Location -LiteralPath D:\walk
.\scripts\maintenance\git-change-monitor.ps1 -Once
npm run test:run
```

## 2. 완료된 것
- repo root/origin/main, 규칙, worktree/stash, 열린 PR과 기존 구현을 확인했다.
- 근본 원인 후보는 `useNavigation.ts`의 `passed_turn` 횡거리 gate와 상시 tick 로그다.
- 최신 main TASK는 GitHub API와 origin/main 캐시로 교차 확인했다.

## 3. 남은 작업
- TASK.md에 사용자 요청·범위·검증·PR #130 재사용 관계를 등록한다.
- 실제 엔진 회전 미이행 재현 테스트로 현재 실패를 확인하고 최소 수정한다.
- tick 로그는 명시적인 디버그 플래그가 켜질 때만 출력한다.
- 관련 웹 사용자 흐름, typecheck/lint/build 및 Streamlit 회귀를 확인하고 결과를 TASK에 기록한다.

## 4. 결정·제약
- 프로젝트 walk, 기존 화면/엔진/음성·재탐색 구조를 유지한다. Streamlit 페이지는 변경하지 않는다.
- `.env*`, `.github/workflows/*`, 사용자 미추적 파일·worktree·stash는 보존한다.
- commit/push/PR/merge는 이번 요청에서 별도 실행하지 않는다.
- `git fetch`는 손상된 원격 백업 ref 때문에 실패했다. 기존 ref 삭제/복구는 수행하지 않는다.
- 테스트 입력 GPS/API 대체 성공과 실제 현장 GPS·배포 검증을 구분한다.

## 5. 핵심 파일
- `TASK.md`: 작업 등록 및 검증 결과.
- `web/lib/useNavigation.ts`: 정확도 보정, tick 로그, 음성 상태.
- `web/app/page.test.tsx`: GPS→UI→재탐색 사용자 흐름 회귀.
- `web/lib/useGeolocation.ts`: 기존 fix 품질 및 화면 위치 보정.

## 6. 이전 작업 보존사항
- 망원 점포/메뉴·모바일 UI 데이터와 기존 worktree를 보존한다. `4c8a7cf`로 rollback 금지.
- Street View provider 설정/Cloud 비용·키 작업, 실제 Chrome 위치→navigation→RoadviewViewer 및 현장 검증은 미완료다.
- 이전 관련 상세는 `SESSION_RECAP.md`, `.omc/wiki/`, 기존 PR #135/#136을 참조한다. 이번 작업 범위 밖이다.
