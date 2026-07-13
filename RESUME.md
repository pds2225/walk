# RESUME.md - D:\walk checkpoint

> **[2026-07-12 PR #51 MERGED, main=ef21484, 259 passed]** ①GPS 폴링 3초→**1초**(안내 중, 유휴 10초 유지: `interval=1000 if nav_running`), `_GPS_POLL_BUCKET_SEC=1`, 연속 감지 기본 2→**3회**(1초×3회≈3초 확정, 슬라이더·툴팁 일치) ②검색 후보를 **TMAP 거리순**(searchtypCd=R+centerLat/Lon)으로 요청 — `_tmap_poi_results(query, limit, center)`·`geocode_suggestions(…, center)`·`_suggest_destinations(query, lat3, lon3)`(캐시 키=현위치 소수3자리)·`_origin_round3()`, 목적지 searchbox/폴백·출발지 3곳 배선. ③주의: 이전 세션에서 `git pull`을 워크트리(cwd)에서 실행해 **D:\walk main이 stale였던 사고** — 동기화는 반드시 D:\walk에서. ④음성: **[PR #52·#53 MERGED, main=b058ec5, 260 passed] 회전 예고 음성** — "잠시 후 좌/우회전입니다"(TTS+토스트, 회전점당 1회, 재탐색 리셋, 직진 생략). **예고 거리 = 10m**: 실제 엔진+GPS노이즈 σ6m+1초폴링 L자 720회 보행 시뮬 실측(10m=보통걸음 시속5km 평균 9.2초 전/천천 14.5/빠름 6.6, p10 3.6s, 미발화 0; 30m는 24초 전이라 사용자 "너무 미리" 피드백으로 하향). 시뮬 스크립트=scratchpad turn_timing_sim.py(세션 임시). ⑤**[PR #54 MERGED, main=efda906, 263 passed] 도보 시간 기준 시속 4km(분당 67m, 사용자 지정)** — route_builder `WALKING_SPEED_KMH=4.0`+`estimate_walking_seconds()`. API totalTime 우선, 없을 때만 추정(전엔 표시가 비었음). 판정용 `gps_filter.WALK_SPEED_DEFAULT=1.4m/s`와 용도 구분(위키 walk-4km-67m.md). 폰 재확인 목록: 소리테스트·출발지검색·1초폴링 배터리 체감.

> **[2026-07-12 PR #50 MERGED, main=7fa1423, 257 passed]** 실기기 피드백 11건 일괄 수정: ①폰 알림 무반응 근본원인=iframe WebAudio 모바일 suspended → **st.audio(최상위, autoplay) 이동**+🔔소리·진동 테스트 버튼 ②출발지 바꾸기 사용불가=st_searchbox가 expander 안 모바일에서 드롭다운 잘림 → 네이티브 text_input+selectbox 교체(목적지는 searchbox 유지) ③'대중교통 포함' 토글 삭제 → 출발 버튼 2개(🚶 걷기/🚇 대중교통+걷기)가 nav_transit_enabled 직접 설정 ④TMAP A10 fullAddress 주소 3개 이어붙음 → 구조필드 도로명 조립(route_builder._tmap_reverse) ⑤지도 범례 글자색 명시(다크테마 흰바탕 흰글씨)·회전마커 보라(#8e44ad)·현재위치 마커에 8방향 진행 화살표 ⑥걷는 중 판정+지도 최상단, 목적지바꾸기/중지는 지도 아래(defer_controls, 여정화면은 기존) ⑦경로까지 거리·이탈 지속 → 상세 지표 안 ⑧쉬운 문구(삐1/2/3, 경고 시작 거리/이탈 확정 거리/연속 감지 횟수+툴팁, 헤더 '도보 내비게이션'). **폰 재확인 필요: 소리·진동이 실제 나는지(테스트 버튼), 출발지 검색 동작.**

> Updated: 2026-07-10 (**UX 접근1 전 단계(1~5) 완료·병합**: PR #37 UX토대[시각토큰·검색1탭칩·실기기 이미지 3건: 위치경고 중복→한줄·PC문구→기기중립·대중교통 375m 오해→전체여정] / PR #38 걷는화면[안내중 지도 560→640·다음회전 큰 화살표 ↰↱↑·로딩문구 목적지포함·_DIR_ARROW 상수화] / PR #39 단계병합[**'경로찾기+시작'→'🚶 바로 출발' 1탭**, 미리보기'경로만보기' 보존, 안내중 탐색버튼 숨김, st.rerun()을 try 밖으로, 도보강등 안내 세션플래그, _run_activation DRY] + 기존 flaky 스모크 timeout 10→30s. 로컬 main=origin 0/0·pytest 207·code-reviewer APPROVE 3회(🔴0). 1_Navigation.py만 수정, engine/gps_filter/route_builder/transit_builder 비침습. **핵심 안전근거: start_now=True는 예약 자동활성화가 이미 쓰던 검증 경로 재사용, _reset()이 '▶시작'의 상위집합 초기화.** 남은 것: **①폰 실기기 재확인(UX 1~5 전체) ②멀티 provider 6~9단계**(설계=.omc/plans/2026-07-09-multi-provider-maps-design.md, 고급설정 접기+공유링크 위치로 합의). TMAP 4API 실호출 5/5 PASS. **+PR #40 한국식 주소·목적지 UI**: format_korean_address()/`_address_tokens()` 신설 — 국가명 숨김·우편번호 `(21518)` 맨앞·Nominatim 역순(세부→광역)을 한국식으로 뒤집기(역순 판별=마지막 토큰이 국가명, Nominatim 전용 전제). format_place_label도 한국식 순서(광역시도·우편번호 생략). TMAP POI display=`{addr} {name}`. UI: '바로 출발'을 목적지 입력칸 바로 밑(_sidebar_destination 안에서 렌더, main 호출 제거), '주소 또는 장소명'을 제목 우측(1.05rem)·입력칸 라벨 collapsed, 헤더 🗺️→🚶 '도보 내비게이션 (대중교통 포함)'. 리뷰 재현버그 2건 병합 전 수정: 국가명 substring 치환→단어경계 `_COUNTRY_RE`('대한민국역사박물관' 보존), 공백형 5자리 번지 우편번호 오인→우편번호는 쉼표형에서만 추출. pytest **215 passed**, 로컬 main=origin 0/0. **+PR #41 버그헌트 확정 6건 수정**: 6렌즈 병렬탐색+적대적반증(반증자+도달가능성심판) 워크플로 → 13건 발견 중 **6건 확정/7건 기각**(기각=재현되나 실사용 도달 불가: GPS ts 역행·banker's rounding·reverse_geocode null 등). 수정: ①**[HIGH] `nav_transit_enabled`를 위젯 key로 써서 running 중 미렌더→Streamlit이 위젯키 GC→`_init()`이 True 복구** = '대중교통 포함' OFF가 매 주행마다 소실 → `value=`+세션대입 패턴(위젯키 미사용) ②**ODsay 폴백 사실상 사망**(실제 응답의 도보 구간엔 좌표 없음→파서 ValueError→항상 도보강등) → look-ahead 좌표보간(연속 도보 구간도 수렴; '고정점 반복'은 순환이라 수렴X), `parse_odsay_transit(payload, origin=None, dest=None)` ③최근검색 칩이 대중교통 설정 무시 ④**⚠️'초기화에서 `nav_active_booking_id`=None'은 새 회귀**(반경 안이면 5초 뒤 예약 자동재시작→초기화 무력화) → 초기화는 건드리지 않고 **`_try_activate_booking`이 출발 반경 이탈 시 재무장** ⑤대중교통 배너 `📌 도착`→실제 목적지명 ⑥강등 사유 구분(`DOWNGRADE_NO_KEY`/`DOWNGRADE_FAILED`). 회귀테스트 8건. code-reviewer APPROVE(🔴0), 1차 리뷰어는 600s 스톨→범위 좁혀 재실행. **pytest 223 passed, 로컬 main=origin 0/0**. **+PR #42 출발지 인식 속도 개선(다른 세션 DRAFT를 검증·완성·병합)**: autopilot 타깃 '출발지 인식 속도'가 이 DRAFT와 동일 → 중복 생성 대신 #42 검증·병합. 내용(1_Navigation.py만 +179/-25): ①콜드스타트 다중샘플 완화(JS watchPosition n>=3·1.2s → n>=4·soft2.5s·hard6s: 콜드 GPS 첫 fix가 1.2s 전 못 와 timeout→저정밀 폴백 문제) ②IP 폴백 `_get_ip_geolocation`(브라우저 error 확정 시만 ipapi.co→ipwho.is 무키, source='ip') ③마지막위치 캐시 `_save/_restore_last_fix`(실측 gps만 LS저장·100m 스로틀, 재방문 부트스트랩 source='cache') ④점프가드 우회 from_bootstrap(source∈ip/cache일 때만 → **부트스트랩 1회성**, gps→gps 방어 무손상) + nav_origin_source(gps/ip/cache/manual) 소스별 문구. code-reviewer APPROVE(🔴0, engine/gps_filter 무수정 확인). ⚠️실기기 확인: IP fetch·localStorage·콜드스타트 타이밍은 브라우저 동작이라 폰 확인 권장. **pytest 223 passed, main=origin 0/0**)
> Purpose: `/clear` 후에도 walk 작업을 바로 이어가기 위한 압축 체크포인트. Secret/API Key/.env 값 금지.
> **최근(2026-07-11) 튜닝 병합**: PR #43 이탈 음성 문구 "경로를 이탈하였습니다." / PR #44 이탈 확정 빨리(연속 3→2샘플·지속 4초→2초, engine 무수정·1_Navigation EngineConfig 기본값만) / PR #45 재탐색 쿨다운 15초→8초(`_REROUTE_COOLDOWN_MS` 상수화). **전체 기능 실사용 E2E 통과**(이탈감지 4시나리오·GPS필터·한국식주소·대중교통폴백·TTS = 20/20, AppTest 5, 앱 헤드리스 부팅 HTTP200, pytest 226). **현재 이탈 설정: 시작 10m / 확정 15m·2샘플·2초 / 강한 25m / 방향45°면 6m / 재탐색 쿨다운 **3초**(PR#46; 시뮬레이션상 쿨다운 2~12초는 재탐색 빈도에 무의미·폭주방지 안전벨트일 뿐, 워밍업·재중심화가 지배) / 워밍업 5샘플&30초.** **근본 개선=맵매칭/스냅투루트(미개발): '길을 따라 진행 중이면 옆으로 벌어져도 경로 위로 스냅' → 시뮬 재탐색 10회→0회. 위치평균(중앙값)은 지속편향에 거의 무효(10→9). **설계·테스트·리스크 정본=`.omc/plans/2026-07-12-snap-router-mapmatching-design.md`(+위키 decision). 신규 snap_router.py 상태머신(engine 비침습), 평행도로/교차로는 도로망 데이터 없어 범위 밖. 다음 액션='평행도로 빼고 되는 것부터 개발'.** **[PR #47 OPEN·머지대기]** Mapbox Map Matching 확인층 구현·검증 완료(브랜치 feat/mapbox-map-matching, 워크트리 .worktrees/mapbox). 신규 `mapbox_matcher.py`(순수판정+얇은HTTP, engine 비침습)+1_Navigation 재탐색 게이트에 veto 1항. MAPBOX_TOKEN은 env/st.secrets에서만(키없으면 휴면=기존 동작). 전체 **237 passed**(226+11), py_compile OK. **머지는 하네스 자기승인 차단으로 사용자 승인 필요**: `gh pr merge 47 --merge --delete-branch`. 실 Mapbox API 대조는 토큰 주입 후 1회 필요(현재 mock 검증만). **[PR #47·#48 둘 다 MERGED, main=7850e78] snap_router 무료 진행도 필터** — 적대검증(워크플로 5에이전트 4렌즈+실측)으로 초안 false-negative 결함 잡아 재설계(정지=순변위/방향성, 코리도어veto의 Mapbox우회 제거, U자점프·저정확도=DEFER). 실측 12시드: A오탐 119→0·C2정지 14→3·B 96→88·E 24→24(보존)·D 20→0(Mapbox꺼짐시 억제). 248 passed, engine 비침습. 머지=`gh pr merge 48 --merge`. **토큰 없어도 이 무료층만으로 헛 재탐색 해결**(Mapbox는 평행도로용 선택). snap 워크트리 .worktrees/snaprouter. **[PR #49 MERGED, main=9e0ab32] 오류 재발방지 하드닝 완료** — 8차원 감사 31건→적대적 도달성 검증 **21건 확정/8건 기각/2건 불확실 보류**→전부 수정+회귀 9테스트(`test_nav_hardening.py`), **257 passed**. 핵심: 저정확도 재탐색 보류·passed_turn 억제면제·Mapbox 3상 폴백·억제 90초 상한·이탈확정 지속성·백그라운드 갭 엔진리셋·median flush·신선도표시·단일시계(워밍업/소요)·여정 수동탈출구('다음 구간'/'도착했어요')·여정종료 시 journey정리·예약 유휴폴링+rerun·여정 전체집계·초기화 배너·deprecated width 17건. engine.py 비침습. **불확실 2건(보류): route_builder `_tmap_poi_results` null AttributeError 가능성 / transfer 모드 leg 막다른길** — 다음 세션 검토 후보. **night-autodev-walk 등록됨**(매일 01:15, D:\_night_pilot\run_night_walk.ps1, 격리 walk-copy, push/삭제/네트워크 차단) — 아침에 `어젯밤 walk 야간개발 결과 보여줘`로 NIGHT_REPORT 확인. **[2026-07-12 22:20 수동 즉시기동]** 사용자 지시로 지금 실행 중(로그 walk_20260712_222024.log, 마감 02:20 4시간, CYCLE 1 진행). 결과=D:\_night_pilot\walk-copy\NIGHT_REPORT.md. 로컬 main=origin 0/0. 남은 것: 폰 실기기 최종 확인(음성·위치·지도·이탈→재탐색 흐름).

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
