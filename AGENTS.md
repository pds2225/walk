## TASK SSOT — 세션 시작 규칙

- 공식 개발 작업 SSOT는 `origin/main:TASK.md` 하나다.
- 세션/자동개발 시작 시 `git fetch origin --prune` 후 원격 main의 TASK.md → RESUME.md → SESSION_RECAP.md를 순서대로 모두 읽는다. 아래 필수 게이트를 생략하지 않는다.
- 사용자의 새 개발 요청은 TASK.md에 등록한 뒤 실행한다.
- 작업 브랜치에서 갱신한 TASK는 main 머지 후 공식 상태가 된다.
- Dashboard·RESUME·HANDOFF·실행로그·외부 미러는 파생정보이며 TASK 상태·우선순위를 덮어쓰지 않는다.
- 별도 CURRENT_TASK.md / NEW_TASK.md / NEXT_TASK.md / 기능별 TASK 파일을 만들지 않는다.

## 작업 시작 필수 게이트 — 모든 PC·clone·worktree·새 세션

`CONTEXT_STARTUP_REQUIRED`

- 새 작업, 재개, /clear 이후 새 세션, 다른 PC/폴더/clone/worktree에서의 시작에 모두 적용한다. 아래 확인을 마치기 전에는 구현·파일 수정·테스트·commit/push/merge를 시작하지 않는다. 저장소 확인·문서 선독을 위한 읽기 전용 조회와 fetch는 준비 단계로 허용한다.
- 먼저 실제 repo root·origin·현재 브랜치·미커밋 변경·worktree·stash를 확인하고 기존 작업을 보존한다. `git -c gc.auto=0 -c maintenance.auto=false fetch origin --prune` 후 `origin/main` SHA를 한 번 고정한다.
- 고정한 같은 main SHA에서 **TASK.md → RESUME.md → SESSION_RECAP.md 전체를 순서대로 읽는다.** TASK가 작업 상태·우선순위의 유일한 SSOT이며 재개·회고는 상태와 근거를 보완하는 파생 기록이다. 새 요청은 기존 규칙대로 TASK에 등록한 뒤 실행한다.
- 현재 작업 위치의 세 문서에 원격과 다른 미반영 내용이 있으면 그것도 추가로 읽고 보존한다. 선독을 이유로 자동 pull/checkout하거나 로컬 문서를 원격 버전으로 덮어쓰지 않는다.
- 첫 작업 보고에 `시작 확인: repo root / 기준 main SHA / TASK ID 또는 없음 / TASK·RESUME·SESSION_RECAP 선독 완료 / 남은 작업·핵심 제약`을 한 줄로 제시한다. 내용이 길면 3줄 이내로 압축하고 원문·긴 로그를 반복 출력하지 않는다.
- fetch 실패, 필수 문서 누락/읽기 실패, SSOT와 작업 지시의 해결되지 않은 충돌이 있으면 선독 완료를 주장하지 않는다. 원인을 보고하고 파일 수정·테스트·Git 반영을 시작하지 않는다.
- 사용자에게 이미 받은 실행 승인은 유지한다. 선독 완료 후에는 기존 승인 범위 안에서 바로 진행하며 재개 확인을 반복해서 묻지 않는다.
- 이 규칙은 저장소와 함께 GitHub에서 공유한다. 개인 PC의 hook·절대경로·전역 스킬 설치에 의존하지 않는다.



# walk 프로젝트별 한 줄 지침

- 프로젝트명은 항상 `walk`로 유지한다.
- Streamlit 화면 수정은 기존 페이지 구조를 유지하고, 특히 `streamlit_walk_engine/pages/1_Navigation.py` 변경은 최소 범위로 한다.
- 빠른 검증은 `python -m pytest streamlit_walk_engine\tests -q`를 우선 사용한다.
## 프로젝트별 작업 지침

### 1. 프로젝트 목적

- 이 프로젝트는 walk 앱의 Streamlit 기반 기능을 관리하는 저장소다.
- AI는 프로젝트명을 `walk`로 유지하고, 앱 구조를 임의로 바꾸지 않는다.
- 요구사항이 애매하면 새 기능을 만들지 말고, 기존 페이지 구조를 깨지 않는 최소 수정으로 처리한다.

### 2. 절대 수정 금지

- `.env`, `.env.*` 파일은 절대 수정하거나 내용을 출력하지 않는다.
- `.github/workflows/*`는 사용자가 명시적으로 요청하지 않으면 수정하지 않는다.
- API Key, Token, 비밀번호, 쿠키 값은 답변이나 로그에 출력하지 않는다.
- 사용자 변경사항은 임의로 되돌리지 않는다.

### 3. 수정 허용 범위

- 요청과 직접 관련된 파일만 수정한다.
- `streamlit_walk_engine/pages/1_Navigation.py` 작업은 특히 최소 변경으로 처리한다.
- 단순 버그 수정에서 전면 리팩토링을 하지 않는다.
- 문서 수정은 실행 방법, 현재 상태, 검증 결과처럼 사용자에게 직접 필요한 내용만 반영한다.

### 4. 실행/검증 기준

최초 1회 테스트 환경을 구성한다.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

```powershell
$repoRoot = git rev-parse --show-toplevel
Set-Location $repoRoot
.\.venv\Scripts\python.exe -m pytest streamlit_walk_engine\tests -q
```

- 로컬 실행 확인이 필요한 경우 localhost와 같은 공유기 접속 가능 여부를 구분해서 보고한다.
- 실행 확인을 못 했으면 "미검증"이라고 명확히 말한다.

### 5. Git 규칙

- 사용자가 요청하지 않으면 커밋하지 않는다.
- 사용자가 요청하지 않으면 push하지 않는다.
- 커밋 전에는 `git status --short`로 포함 파일을 확인한다.
- 런타임 데이터, 캐시, 로그, `.env`, 개인 설정 파일은 커밋하지 않는다.
- 변경 상태를 반복 확인할 때는 읽기 전용 `scripts/maintenance/git-change-monitor.ps1`을 사용한다.
- 자동 `stash`/`pull`/`add`/`commit`/`push` 백업 스크립트를 만들거나 실행하지 않는다.

### 6. 보고 형식

```text
상태: 정상 실행 확인됨 / 수정만 완료 / 미검증 / 실행 막힘

수정 파일:
- <저장소 경로>\path\file.py: 수정 이유

검증:
- 실행 명령어:
- 결과:

주의:
- 남은 리스크 또는 사람이 확인할 항목
```

### 7. 자주 하는 실수 방지

- 프로젝트명을 다른 이름으로 바꾸지 않는다.
- Streamlit Cloud 동작과 로컬 실행 동작을 구분한다.
- Windows에서는 Bash 명령어 대신 PowerShell 명령어를 쓴다.
- 포트가 열렸다는 것과 앱이 정상 동작한다는 것을 구분한다.

