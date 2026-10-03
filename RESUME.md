# RESUME.md — walk 현재 작업 체크포인트

> 갱신: 2026-10-03 21:27 KST. 작업 SSOT는 origin/main:TASK.md이며 이 파일은 재개용이다.

## 0. 30초 컨텍스트
PR #130의 claude/path-deviation-logs-jq8h4o head 3e1dcef6b240c16bda521975ce3eac50c7e42917에서 npm run simulate를 실제 실행했다.
4개 시나리오 모두 설명과 일치하여 PASS. 사용자 요청에 따라 코드 수정·commit·push·merge 없음. 이번 검증 요청의 실행과 판정 완료.

## 1. 빠른 재개
```powershell
Set-Location -LiteralPath D:\walk\.worktrees\pr130-simulate-3e1dcef
npm run simulate
```
- 원본 root: D:\walk; origin: https://github.com/pds2225/walk.git.
- 원본 branch: fix/passed-turn-debug-20261003, base 40daf37. 기존 dirty 변경은 그대로 보존.
- 검증 clone: D:\walk\.worktrees\pr130-simulate-3e1dcef. 독립 clone이며 linked worktree가 아니다.

## 2. 완료된 작업
- GitHub 커넥터로 PR #130 OPEN/unmerged 및 정확한 head 확인. 실행 후 ls-remote도 같은 SHA.
- npm run simulate exit 0. normal walking: on_route/none, mild drift: drifting/monitor, strong deviation: deviated/warn_user, missed turn: passed_turn/reroute_candidate.
- simulator는 assertion/자동 PASS·FAIL 출력을 하지 않는다. 판정은 시나리오 설명과 실제 상태 전이를 대조한 결과이며 웹 GPS wrapper·실기기 검증은 포함하지 않는다.
- simulator는 clone의 상대경로 engine 소스를 사용하고 실행 도구 tsx는 기존 D:\walk\node_modules에서 재사용했다. 의존성/lockfile 수정 없음.
- 검증 clone의 Git 변경 없음. 원본 기존 수정 7개 파일의 SHA256 전후 동일 확인.

## 3. 남은 작업
- 현재 요청에서 추가 실행할 작업 없음. 실패 원인 없음. 코드 수정·PR 병합은 명시적으로 금지되어 있다.
- 이전 TASK-012는 VERIFIED(LOCAL_CONTROLLED), FIELD_TEST_REQUIRED. 현장 GPS·실기기·운영 배포는 여전히 미검증.
- Street View provider/Cloud 비용·키 및 실제 Chrome 위치→navigation→RoadviewViewer 검증은 이전 범위의 미완료 항목이다.

## 4. 핵심 결정·제약
- 기존 사용자 변경·worktree·stash·망원 점포/메뉴 데이터를 보존. rollback/reset/clean 금지.
- .env* 및 .github/workflows/* 수정·값 출력 금지. 실제 발송·비용·운영변경 금지.
- 원본 git fetch origin --prune는 refs/remotes/origin/backup/WIN-K20QOC29TOB bad object로 실패. ref 복구/삭제 없이 별도 clone으로 검증했다.
- gh 조회는 HTTP 401. GitHub 커넥터로 최신 main TASK와 PR을 확인했다. 읽기 전용 검증이므로 TASK 등록/수정 없음.

## 5. 핵심 파일 인덱스
- D:\walk\.worktrees\pr130-simulate-3e1dcef.log: 이번 npm run simulate 원본 출력.
- 검증 clone의 packages/route-engine/src/simulator/runSimulator.ts 및 scenarios.ts: 실행과 판정 기준.
- 원본 TASK.md: 이전 TASK-012 등록·상세 검증.
- 원본 web/lib/useNavigation.ts 및 useNavigation.test.tsx: 이전 passed_turn/디버그 수정(미커밋).
- SESSION_RECAP.md, .omc/wiki/, 기존 PR #135/#136: 이전 작업 상세.

## 6. 이전 작업 보존 기록
TASK-012는 당시 PR #130 head 5b657f1을 재사용해 웹 GPS 보정·passed_turn gate·debug 플래그·재탐색을 로컬 수정했다.
이전 검증: 웹 149 PASS, typecheck/lint/build PASS, Streamlit secrets 격리 시 598 PASS, 로컬 production Chromium 통제 GPS 4개 시나리오 PASS. 현장/운영 검증과 구분한다.
이전 3108 테스트 서버는 종료됐으며 commit/push/PR/merge 없이 변경이 원본 작업 폴더에 남아 있다.
