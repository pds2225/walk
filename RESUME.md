# walk — 다른 환경에서도 사용하는 재개 기록

> 공유 체크포인트: 2026-10-06. 공식 작업 SSOT는 `origin/main:TASK.md` 하나다.
> 이 파일과 `SESSION_RECAP.md`는 Git으로 공유한다. 아래 검증 시점의 상태와 현재 원격 상태를 구분한다.

**필수 시작 규칙:** 모든 PC·clone·worktree·새 세션은 [AGENTS.md](AGENTS.md)의 작업 시작 게이트를 따른다. 같은 원격 main SHA의 TASK → RESUME → SESSION_RECAP를 모두 읽고 시작 확인을 보고하기 전에는 구현·파일 수정·테스트·Git 반영을 시작하지 않는다. 이미 받은 실행 승인은 유지한다.

## 현재 상태

- 기존 개발 통합은 [PR #144](https://github.com/pds2225/walk/pull/144)로 완료했다. **검증한 제품 코드 기준**은 `87f890ffc8d8d1277fd41fd3542b485c4e02a33f`이며, 이후 문서 변경 때문에 현재 HEAD는 달라질 수 있다.
- 홈 네 언어, 망원·월드컵시장 데모, GPS 표시 smoothing, 경로 이탈·회전 미이행·재탐색 보정, 대중교통 도착 라벨, Python 경로 점수화/Kakao bridge를 함께 반영했다.
- 공유 회고·재개는 [PR #145](https://github.com/pds2225/walk/pull/145)로 main에 반영했고 새 main clone과 병합 후 test/docs-gate를 확인했다.
- 진행 중: `KN-STARTUP-CONTEXT-20261006`. 다른 PC/새 세션에서도 TASK·재개·회고 필수 선독을 AGENTS에 규정하고 원격 clone의 실제 Codex 입력을 검증한 뒤 PR로 공유한다.
- 기존 PC의 유효한 12개 작업 위치는 당시 같은 main 커밋으로 동기화했다. 이 사실은 다른 PC의 자동 동기화를 의미하지 않는다. 새 환경에서는 아래 절차로 원격을 확인한다.

## 다른 PC에서 처음 시작할 때

원하는 작업 폴더에서 실행한다. 설치 위치나 사용자 계정 이름에 의존하지 않는다.

```powershell
git clone https://github.com/pds2225/walk.git
if ($LASTEXITCODE -ne 0) { throw 'clone 실패: 작업 시작 금지' }
Set-Location -LiteralPath walk
Get-Content -LiteralPath AGENTS.md -Raw
```

새 clone과 기존 clone 모두 아래 공통 절차를 반드시 실행한다. 미커밋 변경을 먼저 확인하고, 현재 브랜치를 자동 전환하거나 사용자 파일을 덮어쓰지 않는다.

```powershell
$walkRepoRoot = git rev-parse --show-toplevel
git -C $walkRepoRoot status --short --branch
git -C $walkRepoRoot -c gc.auto=0 -c maintenance.auto=false fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw 'fetch 실패: 작업 시작 금지' }
$walkStartMain = git -C $walkRepoRoot rev-parse origin/main
if ($LASTEXITCODE -ne 0) { throw 'main 확인 실패: 작업 시작 금지' }
foreach ($walkContextDoc in @('TASK.md', 'RESUME.md', 'SESSION_RECAP.md')) {
    git -C $walkRepoRoot show ($walkStartMain + ':' + $walkContextDoc)
    if ($LASTEXITCODE -ne 0) { throw ('필수 문서 읽기 실패: ' + $walkContextDoc) }
}
```

작업할 위치와 브랜치를 확인한 뒤 새 작업 브랜치를 만든다. linked worktree가 detached HEAD라면 수정 전에 새 브랜치를 만든다.

## 완료·검증 근거

- 영향 web 77개/Python 292개, web typecheck/build, 설치 Chrome 390×844의 홈·두 시장 확인 PASS. 기존 실제 NAVER/TMAP 및 simulate 4개 시나리오 증거는 재사용했다.
- PR와 병합 후 main의 `test`·`docs-gate` 모두 PASS. [환경 독립적인 근거와 코드 위치](docs/session-evidence/2026-10-06-main-sync.md), [누적 회고](SESSION_RECAP.md)를 참고한다.
- 원본 개발은 `backup/local-main-sync-20261006`(`2325b22`), production ignore는 `backup/production-local-main-sync-20261006`(`87c3b8a`)에 원격 보존했다. 기존 PC의 stash 4개·개인 설정도 유지했지만, stash와 환경 설정 자체는 clone으로 옮겨지지 않는다.

## 남은 확인

- 개발 통합·동기화 요청의 필수 작업은 완료했다. 사용자가 요청하면 점포 출입구, 현장 GPS와 운영 배포 환경을 별도로 확인한다.
- 월드컵시장 45개 원본 점포의 근거 좌표 45개는 건물 18개를 가리킨다. 공유 좌표 12그룹/39점포를 임의 분산하지 않는다. NAVER 근처 파노 45개는 점포 정면·실내 실측을 보증하지 않는다.
- 도보 경로에는 `TMAP_APP_KEY`, 이번 NAVER 주변 영상에는 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`가 필요하다. 실제 값은 각 환경에서 따로 설정하고 문서·코드·로그에 저장하지 않는다. 로컬 성공을 운영 배포 완료로 해석하지 않는다.

## 기록 유지 규칙

- 새 작업의 우선순위·상태는 최신 원격 TASK를 따른다. RESUME나 오래된 회고가 TASK를 덮어쓰지 않는다.
- 중요한 작업/세션 마무리 후 두 문서를 갱신하고, 공유할 내용만 일반 commit/push와 PR로 반영한다. 로컬에만 수정해 두면 다른 PC에는 전달되지 않는다.
- 개인 절대경로, 키 값, 로컬 캐시/실행 로그를 추가하지 않는다. 공유할 근거는 Git으로 추적되는 코드·문서와 GitHub 링크를 사용한다.
- 이전 세션의 main 병합 금지는 최신 사용자 통합 요청으로 대체되었고 해당 작업은 완료했다. force push·reset·clean·사용자 작업 삭제는 계속 금지한다.
