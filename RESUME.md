# RESUME.md - D:\walk checkpoint

> Updated: 2026-07-02 13:20 KST
> Purpose: `/clear` 후에도 walk 작업을 바로 이어가기 위한 압축 체크포인트. Secret/API Key/.env 값 금지.

## Latest (2026-07-09) — PC 위치 미취득 수정

- 증상: PC에서 위치 권한 허용해도 "신호 약함"으로 위치가 안 잡힘(walknavi.streamlit.app).
- 근본원인: PC는 GPS 없음 → Wi-Fi/네트워크 위치라 accuracy가 항상 `USABLE_ACCURACY_M=50m` 초과 → `is_fix_usable` False로 origin 확정 실패, "더 정확한 위치 기다리는 중"에서 정지. 오류 시엔 권한 허용했는데도 "권한 허용" 메시지만 반복.
- 수정: `streamlit_walk_engine/pages/1_Navigation.py` — 정확 fix 없으면 대략 위치라도 부트스트랩(`nav_origin_coarse` 플래그, 폴링 유지해 정밀 fix로 자동 교체) + 오류코드별 메시지(권한차단 vs 신호없음+Windows 위치설정 안내) + geolocation `maximumAge:0→3000`. gps_filter.py·engine.py 미수정.
- 검증: py_compile OK. **완료: origin/main 기준 워크트리에서 최신 파일에 재적용 → pytest 181 passed → PR #33 병합(main=327b4ff)**. Streamlit Cloud 자동 재배포로 walknavi.streamlit.app 반영.
- ⚠️ 로컬 D:\walk main 은 여전히 origin보다 뒤처짐 — 직접 편집 말고 origin/main 워크트리 사용.

## 진행 중 (2026-07-09) — UI/UX 재설계 계획 (계획만, 코드변경 금지)

- 요청: Navigation 화면을 **TMAP 자동차용 내비 스타일**(풀스크린 지도·플로팅 원형 버튼·큰 잔여시간 바텀시트·턴 배지·헤딩 퍽)로. 폰 캡처 4장 제공(안내중/경로미리보기/홈/검색).
- 상태: **계획만** 작성 단계. 코드·구현 금지. 실제사용승인루프는 계획 승인 후 실행.
- 구현 방식 후보: A) Streamlit+CSS 오버레이(저비용) B) 커스텀 지도 컴포넌트(Leaflet/MapLibre, 진짜 몰입형) C) 하이브리드(A 먼저→B). 스코프 주의: PROMPT.md Milestone1=엔진, UI 대개편은 범위 확대 → 사용자 확인 필요.

## Current State

- Repo root verified: `D:\walk` (`git -C D:\walk rev-parse --show-toplevel` -> `D:/walk`).
- Shell location can drift to `D:\`; use explicit commands such as `git -C D:\walk ...` or `cd D:\walk` before running project commands.
- Local repo has non-code/session artifacts: `.claude/settings.json` modified plus untracked `.claude/`, `.omc/`, `.vscode/`, `RESUME.md`. Do not revert user/session changes without explicit request.
- Local `main` is behind `origin/main` by 26 commits. Do not implement directly in `D:\walk`; use a fresh worktree from `origin/main`.
- Repo rules from `D:\walk\AGENTS.md`: keep project name `walk`, preserve Streamlit page structure, minimize changes to `streamlit_walk_engine/pages/1_Navigation.py`, do not edit `.env*` or workflows unless explicitly requested, do not commit/push unless requested.

## Recent Completed Context

- Search UX improvements are already recorded as completed and merged through PR #31: candidate labels refined, `streamlit-searchbox` autocomplete added with fallback, and destination/origin suggestions display distance from current location and sort nearest first.
- Validation previously recorded for that work: `pytest 181 passed`, `py_compile` OK, reviewer approved. Real-device/mobile rendering still needs manual confirmation.
- Pending product direction from earlier planning: transit + walking route in one walk screen, with GPS deviation detection only on walking legs; transit leg is display/manual-progress only. API keys must be optional so the app falls back to walking-only behavior.

## This Turn

- User ran `/skills`; response listed available high-value skills.
- User invoked `omc-auto-router` via `C:\Users\ekth3\.agents\skills\omc-auto-router\SKILL.md`.
- `omc-auto-router` was read. It is a hook/router skill for SessionStart/UserPromptSubmit/PostToolUse/PreToolUse behavior: injected OMC rules, everyday phrase to harness routing, turn recap hints, wiki auto-reference, and git/PR sync reminders.
- User invoked `session-closeout-auto` via `C:\Users\ekth3\.agents\skills\session-closeout-auto\SKILL.md`.
- `session-closeout-auto` was read. It installs/removes/status-checks Codex closeout hooks for automatic 4-part session saving: skill harvest, wiki capture, `SESSION_RECAP.md`, and `RESUME.md`.
- User invoked `oh-my-claudecode:autopilot` via `C:\Users\ekth3\.codex\plugins\cache\omc\oh-my-claudecode\4.15.1\skills\autopilot\SKILL.md`.
- `autopilot` was read. It is a full autonomous lifecycle skill: expand idea, plan, execute, QA, multi-review, cleanup. In Plan Mode, use it to create an execution plan only; do not implement code until Plan Mode ends.
- Autopilot precheck: `.omc\plans` exists, but no `ralplan-*.md` or `consensus-*.md` was found, so a future autopilot run would need a concrete target or use an existing non-consensus plan as input by explicit choice.
- Closeout precheck: global closeout auto is `ON`; `D:\walk` project-local closeout auto is `OFF`; recent active-session detector returned `d:\auto_write`.
- User approved implementation of the Korean plan: add transit+walking journey support to walk, with GPS guidance only on walking legs and transit legs shown as manual cards.
- Executing-plans and using-git-worktrees skills were read. Work must happen in an isolated worktree/branch, not local `main`.
- Implementation has not yet touched app code at this checkpoint; only this `RESUME.md` checkpoint was updated in `D:\walk`.

## Resume Commands

```powershell
cd D:\walk
git -C D:\walk status --short
git -C D:\walk fetch --prune
python -m pytest streamlit_walk_engine\tests -q
```

## Next Actions

1. Create a fresh worktree from latest `origin/main`, likely `D:\walk-transit-journey` on branch `codex/transit-walk-journey`.
2. Implement only the approved transit+walk scope: new `transit_builder.py`, minimal `1_Navigation.py` additions, tests, no `engine.py`/`route_builder.py` edits.
3. Validate with `python -m pytest streamlit_walk_engine\tests -q` and `python -m py_compile streamlit_walk_engine\transit_builder.py streamlit_walk_engine\pages\1_Navigation.py`.
4. Do not install local `session-closeout-auto`; global is already ON.
