# RESUME.md — walk 현재 작업

> 2026-10-04 11:56 KST. 공식 SSOT는 origin/main:TASK.md.

## 목표·현재 상태
PR #143 / feat/worldcup-market-demo의 블로그 점포45개에 주소 근거 기반 좌표를 채우고 지도 핀·길찾기·거리뷰를 실제 검증한다.
원격 head b8bfdfce264350a83b27248086c0c91411685d94 확인. 원격 main404c5a8 유지. 과거 강제갱신 때문에 stale remote-tracking6200e12를 fetch로 최신화했다. 현재 force push 금지, 일반commit/push만 허용. main 병합·Ready 전환 금지.

## 위치
독립 clone D:\walk\.worktrees\worldcup-market-clean-20261004, 로컬 feat/worldcup-market-demo / b8bfdfc, 작업 시작 전clean.
원본 D:\walk의 fix/passed-turn-debug-20261003 dirty7개는 보존. root TASK는 수정하지 않고 clone TASK에 이번 항목1개 추가 예정.

## 진행·다음 액션
- AGENTS 및 main TASK 확인, remotehead gate 통과. 기존 45개 데이터·좌표null·UI·routeAPI 구조 확인.
- Naver Maps 로컬 설정과 TMAP 로컬 설정 존재(값 비출력). 추가 로컬 env 경로를 발견하여 Google키 유무 점검 예정. env에만 로드하고 소스/로그/커밋 금지.
- 블로그 실제 본문17개/첨부 정보이미지28개 주소 확인, Naver geocode45/45, 건물18좌표·공유12그룹 기록. 원본45개 stall JSON 전체 동일.
- 같은주소 같은좌표는 그대로 유지하며 임의분산 금지. 근거없으면null/미확인.
- Google 키 미설정이나 기존 Naver SDK로18좌표 모두 실제 파노 응답확보(45/45, 최대29.08m, 13개pano ID). NAVER provider 표시와 기존 어댑터 재사용 UI 구현 중. 원시metadata/probe artifact는 .worktrees에 보관.
- npm ci/lint/build/test161/typecheck/simulate PASS. Chrome390×844 01/45핀·TMAP HTTP200(132m/99m)·경로선 실제픽셀 PASS, 위치는 제어값(현장GPS 아님). Naver UI통합 후 재검증 → 일반commit/push·PR본문갱신.

## 이전 완료
PR #143정리:37커밋23파일→3커밋19파일. 데이터원본blob d817396 유지, 홈/layout/globals main동일. local150tests/4simulate/build/lint/typecheck/Chromesmoke 및 Actions test/docs-gatePASS.
backup/worldcup-market-demo-20261004=6200e12는 그대로 보존. 상세 .worktrees/worldcup-market-audit-20261004.md.
