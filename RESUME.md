# RESUME.md — walk 현재 작업 체크포인트

> 갱신: 2026-10-03 10:06 KST. 작업 기준은 TASK.md이며 이 파일은 재개용이다.

## 0. 30초 컨텍스트
TASK-012의 `passed_turn` 억제 수정, `[walk:tick]` 디버그 플래그 적용, TASK.md 등록을 로컬에서 완료했다.
기존 PR #130의 웹 GPS 보정 코드를 재사용했고 신뢰 가능한 회전 미이행을 횡거리 gate에서 제외했다.

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
- 정확도 25/30m에서 회전 미이행이 drifting으로 낮아지고 debug 비활성에서도 로그가 출력되는 것을 실제 엔진/hook 테스트로 재현·수정했다.
- 최신 main TASK는 GitHub API와 origin/main 캐시로 교차 확인했다.
- 재탐색도 보정된 상태를 확인하게 수정했다. GPS 오차 안의 이탈은 raw candidate만으로 재탐색하지 않는다.
- 웹 149개 PASS, engine/web typecheck·기존 lint·Next production build PASS.
- Streamlit 기본 회귀는 597 PASS + 로컬 secrets 존재 때문에 1 기존 실패. 테스트 프로세스의 secrets만 격리하면 598 PASS.
- 실제 Chromium(390×844) + 로컬 production에서 4개 통제 입력 시나리오 PASS: 회전 미이행 재탐색 1회, 나머지 재탐색 없음, tick 로그/page error 각 0, 안내 중지 정상.
- `git diff --check` PASS. 테스트 서버 3108은 종료했다. commit/push/PR/merge 없음.

## 3. 남은 작업
- 현장 GPS·실기기와 운영 배포는 미검증. TASK-012는 VERIFIED(LOCAL_CONTROLLED), FIELD_TEST_REQUIRED다.
- Git 반영 요청 시 기존 PR #130 head와 최신 main을 다시 확인하고 이번 수정·TASK 등록만 안전하게 반영한다.
- debug는 `$env:NEXT_PUBLIC_WALK_DEBUG='true'` 후 `npm run next:dev`; production에는 빌드 전에 설정한다. 기본값은 꺼짐.

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
- `web/lib/useNavigation.test.tsx`: 회전 미이행 음성·정확도 gate·플래그 회귀.
- `web/lib/useGeolocation.ts`: 기존 fix 품질 및 화면 위치 보정.
- `C:\Users\ekth3\AppData\Local\Temp\walk-passed-turn-20261003.cjs`: 로컬 production 브라우저 smoke. 상세 명령·조건은 TASK-012 참조.

## 6. 이전 작업 보존사항
- 망원 점포/메뉴·모바일 UI 데이터와 기존 worktree를 보존한다. `4c8a7cf`로 rollback 금지.
- Street View provider 설정/Cloud 비용·키 작업, 실제 Chrome 위치→navigation→RoadviewViewer 및 현장 검증은 미완료다.
- 이전 관련 상세는 `SESSION_RECAP.md`, `.omc/wiki/`, 기존 PR #135/#136을 참조한다. 이번 작업 범위 밖이다.
