# RESUME.md - D:\walk checkpoint

> Updated: 2026-06-28

## 📋 2026-06-28 — 출발지 주소표시 계획 합의완료(구현 대기)
- **요구:** 출발지 '현재 위치'를 좌표→주소(사용자 예시 = Nominatim POI 포함 형식), 우편번호 제거.
- **ralplan 합의 APPROVE**(Planner→Architect→Critic). 계획: `.omc/plans/walk-origin-address-display.md` / 미해결: `.omc/plans/open-questions.md`.
- **핵심 진단:** 좌표만 보이는 진짜 원인이 '형식'이 아니라 '주소 미충전' 가능성(클라우드 Nominatim 403/429 예외를 `1_Navigation.py` try/except:pass가 삼켜 nav_origin_address=None) → **진단 hard gate 선행** 후 strip_postcode(쉼표 경계 5자리만, route_builder 순수함수) + provider-agnostic 표시 정규화.
- **변경 후보:** route_builder.py(strip_postcode)·1_Navigation.py(저장 직전 1회 strip)·test 1. engine 비침습·좌표 폴백 불변.
- **사용자 확인 필요(구현 전):** ①클라우드 Naver 키 유무(H3 — 있으면 주소 신뢰O·형식 도로명/POI없음, 없으면 POI형식이나 차단 위험) ②'POI(가게명) 포함' 필수 vs best-effort. **구현 미착수(승인 대기).**

## ✅ 2026-06-28 — GPS 정확도·속도·UI 개선 1·2차 완료 (PR #22·#23 머지)
- **사용자 목표:** GPS 위치 정확도·속도·쉬운 UI — 1차 9건 + 2차 5건 = **14건 구현·머지 완료**(실제사용승인루프).
- **2차(PR #23):** GPS 최초취득 다중샘플(gps-1)·정지 median/가중 blend 스무딩(gps-3/5, 큰 이동은 raw로 코너링 지연 방지), 동선 재배열(nav-2 즐겨찾기·예약을 핵심동선 아래로)·예약 섹션 접기(nav-3). pytest 150 passed(순수함수 신규 11). code-reviewer APPROVE(🔴0).
- **1차(PR #22):** ①GPS 위치 정확도 ②속도 ③쉽고 단순한 UI — 9건 구현·머지 완료(실제사용승인루프 모드).
- **머지됨(PR #22 → origin/main):**
  - GPS: `gps_filter.py` 순수함수 2종(`is_plausible_step` 점프제거+고착방지 escape, `sanitize_motion` 모션 신뢰) +단위테스트 15건, `1_Navigation.py` 점프가드 배선·`_make_sample` 교체.
  - 속도: 지도 트레이스 N→1 병합, 역지오코딩 캐시, 샘플 상한 500, 경로 타임아웃 15→8초.
  - UI: 민감도 슬라이더 '고급 설정' 접기, 토글 쉬운 말, 즐겨찾기·최근검색 묶기. +도착 소요시간 '여정 시작' 기준(trim 영향 제거, reviewer 지적 fast-follow).
- **검증:** pytest 139 passed(기존 124+신규 15) · py_compile · AppTest 렌더 OK. code-reviewer APPROVE(🔴 0).
- **감사 전체결과:** `tasks/wian3sb04.output` (15건 중 14건 구현 완료 — gps-1~5·perf-1~4·nav-1~5).
- **⚠️ 실기기 QA 미완(필수, 다음 액션):** GPS watchPosition(gps-1)·nav_origin 스무딩(gps-3/5)·점프가드는 브라우저 전용 → pytest 미커버. 실폰 보행에서 ①최초위치 정확·취득속도 ②정지 핀 안정 ③코너링 시 이탈감지 지연無 ④동선(목적지→탐색→시작) 확인 권장.
- **정리 잔재:** `D:\walk-improve`·`D:\walk-gps2` 워크트리 폴더가 파일잠금으로 물리삭제 실패(git 등록·브랜치는 정리완료). PC 재시작 후 수동 삭제.
- **gsync:** behind(#16 settings.json, 실사용 영향 0)은 로컬 유지 보류(사용자 선택). origin/main은 PR #22·#23 포함 → 로컬 `D:\walk` main은 그만큼 더 behind(미pull, 사용자 선택대로).
- **안전 불변(유지됨):** engine.py 코어 비침습 / 안전기능(accuracy 게이팅·is_fix_usable·재경로 워밍업·is_arrival·decide_alert) 보존 / 1_Navigation.py 최소변경 / pytest green.

## 🧹 2026-06-25 세션정리 — 닫아도 안전 ✅
- 코드 변경 0·로컬 main=origin/main(0/0) 동기화 확인. 이 창은 **지금 닫거나 /clear 해도 손실 없음**.
- 미정리(선택, 안전가드 승인 후): ①워크트리 2개(naver-maps-api·visual-verdict-nav-ui, 둘 다 별도 브랜치) ②잔재 검증폴더 5개 `D:\walk-{fix,nav,pr13,qa,ui}` ③streamlit-*.log 11개(~30KB) ④DRAFT PR #16 처리 결정.

## Current State

- Repo root: `D:\walk`, branch `main`. ⚠️ 같은 repo·main에 다른 세션 활동 중 → 메인 워킹트리 보호(직접 편집/pull 자제, 격리 워크트리 사용).
- **로컬 main = origin/main = `0ac7045`** (PR #13~#21 중 #16 제외 전부 병합). 2026-06-25 재확인: `ahead/behind = 0/0` 완전 동기화. 미커밋은 `.claude/settings.json`(M) 1건 + untracked 로그/`.omc`/`.codex`/`.vscode`/RESUME.md(전부 git 비추적).
- 열린 PR: #16(DRAFT 자동테스트 훅 chore) 1건. 코드 변경·신규 작업 없음(이번 세션=세션 정리만).

## 이번 세션 완료 (PR 3건 병합)

1. **PR #13** — 내비 GPS 재폴링 + 도착 판정 화면 연결.
2. **PR #14** (/ultraqa+/autopilot 감사) — 슬라이더 비정상 config 클램프(drift<=dev<=strong), docs/progress-notes.md 신규(DONE E2/H6 필수 산출물), README 테스트수 97→116.
3. **PR #15** — **메인 화면을 네비게이션으로**: app.py에 세션 1회 `st.switch_page("pages/1_Navigation.py")`. 앱 진입 시 내비가 메인.
4. **PR #17 + #18** — **모바일 UI**: 1_Navigation.py 사이드바·햄버거 제거(CSS+collapsed), 컨트롤 본문 이동(`with st.sidebar:`→`with st.container():`). 알림/재경로/임계값은 #17에서 가로 스크롤로 했다가 **#18에서 세로 스택으로 변경**(사용자 요청). 트레이드오프: 사이드바 숨김으로 시뮬레이터 페이지 전환 메뉴도 안 보임.
5. **PR #19** — **목적지 검색 전 후보 미리보기**: route_builder `geocode_suggestions`(Naver 다중후보→Nominatim 폴백), 1_Navigation에 `@st.cache_data` 미리보기(✅검색됨 N곳+selectbox/❌못찾음), 경로 탐색이 선택 후보 사용. 테스트 5건 추가(121 passed). code-reviewer APPROVE.
6. **PR #20** — **출발지 입력**(도착지 위): 기본 현재 위치(GPS)·비우면 현재위치 사용·입력하면 도착지와 동일 미리보기. 경로 탐색이 `_fetch_route(start_coord, dest)`로 출발지 사용(비움=기존동작).
7. **PR #21** — **Cloud 주소 검색 실패 해결**: Cloud에서 합정동·합정역 등 검색 실패 원인 = `_naver_headers`가 st.secrets를 안 읽어 Naver 비활성→Nominatim(클라우드 IP 차단). `_naver_headers`에 st.secrets 경로 추가(env→st.secrets→.env.shared), secrets.toml.example에 NAVER 키 문서화. 테스트 3건(124 passed). **사용자 액션 필요**: Cloud Settings→Secrets에 NAVER_MAPS_CLIENT_ID/SECRET 넣고 Reboot.

## 검증 (현재 코드 00171e4~381fe7f 기준)

- pytest streamlit_walk_engine 116 / task_organizer 20 passed. npm test:run 81 / typecheck OK / lint exit0 / simulate exit0(TS 미변경). py_compile exit0.
- PR #15: AppTest로 app.py 무예외 실행 + switch_page 경로 유효성 대조군 확인(정상경로 통과/오경로 Could not find page). ⚠️ 브라우저 실측 전환은 환경상 미수행.
- /ultraqa 재검증(현재 코드 기준 3축+적대): 전부 CLEAN, 실사용 파괴 0건.

## 미해결 1건 (deferred, 미반영)

- engine.py EngineConfig에 `__post_init__` 검증 없음 — UI 슬라이더가 유일 enforcement라 실사용 영향 0. 비-UI 호출자 생길 때만 추가 권고(low).

## Next Actions

1. 다른 세션 정리 후 로컬 main `git pull --ff-only`로 origin(0ac7045) 동기화. 로컬 425acc3 = 8커밋 behind, 0 ahead → 무손실 회수 가능.
2. 실시간 GPS 내비·메인화면 리다이렉트는 **실기기/브라우저 실측 QA** 권장(progress-notes에 기록).
3. 검증용 잔여 폴더(D:\walk-{pr13,fix,qa,nav,8})는 git 등록 해제됨·파일 잠금으로 폴더만 남음 → PC 재시작 후 수동 삭제 또는 folder-cleanup.

## 2026-06-24 현황 점검 (조회만, 수정 없음)

- M1(TS 엔진)·M2(Streamlit 데모) DONE 기준 충족 완료. 이후 내비 UX 개편(#13~#21, #16 제외) 전부 origin/main 병합. 6/18 이후 신규 병합 없음.
- 열린 PR: **#16**(DRAFT, streamlit_walk_engine 자동 테스트 훅 chore) 1건. 열린 이슈: #3(PWA+FastAPI MVP 설계), #1(자동개발 운영 세팅).
- 사용자 지정 방향: **"위치 부정확 개선 + 출발지/목적지 검색 UI/UX 개선"**. 단 #19/#20으로 후보 미리보기·출발지 입력·즐겨찾기·히스토리·예약은 이미 구현됨(동기화로 로컬 반영).
- **다음 기능 1개(쪼개기 완료, 구현 대기):** 검색 후보에 "현재 위치 기준 거리" 표시 + 가까운 순 정렬 — 같은 이름 동명 장소 중 엉뚱한 곳 선택 방지(위치 부정확 ↓) + selectbox 라벨로 어느 후보가 맞는지 직관화(검색 UX ↑). 쪼개기: ①`_label_with_distance(suggestions, origin)` 헬퍼(거리계산·포맷·가까운순 정렬·origin None 폴백)+단위테스트(15분) ②`_sidebar_destination` 출발지/목적지 selectbox 라벨 교체(15분) ③pytest+py_compile(10분).
- 보류 후보: (B) 검색 실패 사유 구분 안내(키없음/0건/네트워크), (C) 임계값 슬라이더 strong·heading 노출, (D) engine.py EngineConfig `__post_init__` 검증(low).

## 왜 로컬이 origin보다 뒤처졌나 (2026-06-24 원인 진단)

- `.git-auto-backup.log` 자동백업 스킬은 **push(올리기) 전용** — origin→로컬 pull(내려받기)을 안 함. 게다가 **2026-05-01 22:07 이후 멈춤**(미실행), 실행 시에도 `git stash failed` 다수.
- 개발이 전부 별도 브랜치→GitHub PR→main 병합 흐름(커밋 작성자 pds2225). 로컬 main을 직접 안 건드려서 수동 pull 없으면 계속 behind.
- `.claude/settings.json` 자동 훅은 session-guard(guard_pregit.py)뿐 — **자동 pull/sync 훅 없음**. `pull.ff=false`.
- 워크트리 2개 잔존: naver-maps-api(9e04a33), visual-verdict-nav-ui(966cde3) — 별도 브랜치라 main과 무관.
- → 결론: "연동 고장"이 아니라 **내려받기 자동화 부재 + 올리기 백업마저 5/1 정지**. 재발 방지책(1=SessionStart 자동 pull 훅 / 2=양방향 자동백업 수리 / 3=수동 gsync) 사용자 선택 대기 — 1번 추천.
- ⚠️ 2026-06-24 세션가드: 다른 클로드 세션(f312d1d3) 같은 repo·main 동시 활동 중. 양방향 자동백업(2번)은 갈라짐(divergence) 충돌 위험 → 1번(pull만) 권장. main 직접 편집 자제·격리 워크트리 권장.
