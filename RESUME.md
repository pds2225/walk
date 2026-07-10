# RESUME.md - D:\walk checkpoint

> Updated: 2026-07-10 (**UX 접근1 전 단계(1~5) 완료·병합**: PR #37 UX토대[시각토큰·검색1탭칩·실기기 이미지 3건: 위치경고 중복→한줄·PC문구→기기중립·대중교통 375m 오해→전체여정] / PR #38 걷는화면[안내중 지도 560→640·다음회전 큰 화살표 ↰↱↑·로딩문구 목적지포함·_DIR_ARROW 상수화] / PR #39 단계병합[**'경로찾기+시작'→'🚶 바로 출발' 1탭**, 미리보기'경로만보기' 보존, 안내중 탐색버튼 숨김, st.rerun()을 try 밖으로, 도보강등 안내 세션플래그, _run_activation DRY] + 기존 flaky 스모크 timeout 10→30s. 로컬 main=origin 0/0·pytest 207·code-reviewer APPROVE 3회(🔴0). 1_Navigation.py만 수정, engine/gps_filter/route_builder/transit_builder 비침습. **핵심 안전근거: start_now=True는 예약 자동활성화가 이미 쓰던 검증 경로 재사용, _reset()이 '▶시작'의 상위집합 초기화.** 남은 것: **①폰 실기기 재확인(UX 1~5 전체) ②멀티 provider 6~9단계**(설계=.omc/plans/2026-07-09-multi-provider-maps-design.md, 고급설정 접기+공유링크 위치로 합의). TMAP 4API 실호출 5/5 PASS. **+PR #40 한국식 주소·목적지 UI**: format_korean_address()/`_address_tokens()` 신설 — 국가명 숨김·우편번호 `(21518)` 맨앞·Nominatim 역순(세부→광역)을 한국식으로 뒤집기(역순 판별=마지막 토큰이 국가명, Nominatim 전용 전제). format_place_label도 한국식 순서(광역시도·우편번호 생략). TMAP POI display=`{addr} {name}`. UI: '바로 출발'을 목적지 입력칸 바로 밑(_sidebar_destination 안에서 렌더, main 호출 제거), '주소 또는 장소명'을 제목 우측(1.05rem)·입력칸 라벨 collapsed, 헤더 🗺️→🚶 '도보 내비게이션 (대중교통 포함)'. 리뷰 재현버그 2건 병합 전 수정: 국가명 substring 치환→단어경계 `_COUNTRY_RE`('대한민국역사박물관' 보존), 공백형 5자리 번지 우편번호 오인→우편번호는 쉼표형에서만 추출. pytest **215 passed**, 로컬 main=origin 0/0. **+PR #41 버그헌트 확정 6건 수정**: 6렌즈 병렬탐색+적대적반증(반증자+도달가능성심판) 워크플로 → 13건 발견 중 **6건 확정/7건 기각**(기각=재현되나 실사용 도달 불가: GPS ts 역행·banker's rounding·reverse_geocode null 등). 수정: ①**[HIGH] `nav_transit_enabled`를 위젯 key로 써서 running 중 미렌더→Streamlit이 위젯키 GC→`_init()`이 True 복구** = '대중교통 포함' OFF가 매 주행마다 소실 → `value=`+세션대입 패턴(위젯키 미사용) ②**ODsay 폴백 사실상 사망**(실제 응답의 도보 구간엔 좌표 없음→파서 ValueError→항상 도보강등) → look-ahead 좌표보간(연속 도보 구간도 수렴; '고정점 반복'은 순환이라 수렴X), `parse_odsay_transit(payload, origin=None, dest=None)` ③최근검색 칩이 대중교통 설정 무시 ④**⚠️'초기화에서 `nav_active_booking_id`=None'은 새 회귀**(반경 안이면 5초 뒤 예약 자동재시작→초기화 무력화) → 초기화는 건드리지 않고 **`_try_activate_booking`이 출발 반경 이탈 시 재무장** ⑤대중교통 배너 `📌 도착`→실제 목적지명 ⑥강등 사유 구분(`DOWNGRADE_NO_KEY`/`DOWNGRADE_FAILED`). 회귀테스트 8건. code-reviewer APPROVE(🔴0), 1차 리뷰어는 600s 스톨→범위 좁혀 재실행. **pytest 223 passed, 로컬 main=origin 0/0**)
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
