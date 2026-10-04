# RESUME.md — walk 작업 체크포인트

> 2026-10-04 10:31 KST. 공식 개발 SSOT는 origin/main:TASK.md.

## 현재 목표
feat/worldcup-market-demo / draft PR #143를 최신 main에서 월드컵시장 변경만 재구성한다. 홈 /는 main 동일, 4개 언어 유지. 데이터 45개 점포는 원문 그대로 유지.
main 병합·Ready 전환·다른 기존 브랜치 수정 금지. 원래 head를 backup/worldcup-market-demo-20261004로 보존한 뒤 대상 브랜치만 force-with-lease 및 PR 본문 갱신 허용.

## 확인된 상태
- 원본 D:\walk: fix/passed-turn-debug-20261003 / 40daf37, 이전 TASK-012 미커밋 변경 7개 보존. root TASK.md는 이번 작업에서 수정하지 않는다.
- 원격 main: 404c5a8c2d3e70a1e808e1d0f3410fd65234f37d.
- 원격/PR #143 head: 6200e12fbc3e49bde8e5c9d2834003829bec51c4, draft/open, 37커밋·23파일. 별도 fetch 결과 일치. 대상 로컬 브랜치/ref는 원본에 없음. 목록에서 10:23 이후 추가 커밋 없음.
- 원본 fetch는 기존 bad object refs/remotes/origin/backup/WIN-K20QOC29TOB로 실패. 삭제/복구하지 않고 독립 clone 사용.
- 작업 clone: D:\walk\.worktrees\worldcup-market-clean-20261004. origin/main 및 origin/feat/worldcup-market-demo fetch 완료, 아직 재구성 전.

## 다음 액션
1. 원래 head 백업 → main에서 새 cleanup 브랜치 → 월드컵 전용 파일/필수 공통 변경만 재구성 → TASK 항목 1개 추가.
2. web npm ci/lint/build, 기존 테스트, simulate, 홈/데모 smoke 및 데이터 blob 동일 검증.
3. 원격 SHA 변동 없을 때만 대상 branch force-with-lease → PR 본문 갱신, draft 유지 확인.

## 제약·데이터
m.blog.naver.com/mwwdc 블로그에 있는 점포만, 각 출처 글 URL, 없는 정보 미확인. 점포 데이터 내용 수정 금지. 좌표/pano 없음은 남은 제한으로 보고한다.
.env* / .github/workflows/* 값 출력·수정 금지. 사용자 worktree/stash/망원 데이터 보존.

## 이전 기록
PR #130 head 3e1dcef simulate 4개 PASS, 코드 수정·commit·push·merge 없음. 로그: .worktrees/pr130-simulate-3e1dcef.log.
TASK-012 이전 로컬 검증은 웹149/Streamlit secrets격리598/production 통제GPS4개 PASS. 현장 GPS·실기기·운영 검증은 미완료. TASK.md·SESSION_RECAP.md·.omc/wiki/ 참조.
