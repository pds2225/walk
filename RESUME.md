# RESUME.md — 세션 재시작 시 이어하기 진입점

> 새 세션을 시작하면 이 파일을 가장 먼저 읽어라. (최종 갱신: 2026-08-01)
> Secret/API Key/.env 값 금지. 세부는 링크만.

## 0. 30초 컨텍스트
walk 앱(`D:\walk`) 로컬 루트 현황 확인 세션. **main = origin/main 동기화 확인됨** (`83aa91c`, 안드로이드 나침반 폴백 반영). 앱 코드 미커밋 변경 없음 — 세션/문서 잔여물만. 다음 제품 착수는 산책 기록 MVP.

## 1. 빠른 재개 (복붙용)
```powershell
cd D:\walk
git -C D:\walk status -sb
git -C D:\walk worktree list
python -m pytest streamlit_walk_engine\tests -q
```

## 2. 완료된 작업 ✅
- [x] 로컬 루트 현황 확인 (2026-07-30): main 동기화, worktree 4개, 미커밋=세션문서만
- [x] 최근 main 반영분: 나침반 폴백·목적지 입력 리셋·헤딩 진단·진단 로그 분석 (폰 확인은 남음)
- [x] 요청 원장·비전 문서 존재: `REQUESTS_LEDGER.md`, `VISION_SOCIAL.md`
- [x] 세션 마무리(2026-08-01): 위키·회고·이 RESUME 갱신

## 3. 남은 작업 ⬜ (다음 세션에서 이어서)
- [x] **환승 "도착" 수정 (결정 2-1, 2026-08-10)** — PR #100 `fix/transit-end-label`. rebase 후 584 passed.
- [ ] **사람: 클라우드 Secrets에 Naver 키 2줄 붙여넣기 (결정 1-1)** — 로컬 `.streamlit/secrets.toml`은 2026-08-04 설정·실동작 검증 완료(목적지 검색·현재위치 POI 주소 OK). 남은 건 배포 앱 Settings→Secrets 붙여넣기뿐. 코드 변경 없음. ※Streamlit 앱이라 Vercel 배포는 불가(서버리스·WebSocket 제약) — Streamlit Cloud 유지.
- [x] **Vercel 배포 완료(2026-08-04)** — https://walk-five.vercel.app 프로덕션 Ready(여분 도메인은 정리함). **단 2026-08-04 사용자 결정: 주력은 원래 쓰던 Streamlit Cloud 앱(walk-navi 계열)으로 유지, Vercel판은 보류.** Streamlit 앱 Secrets 에 TMAP+NAVER_MAPS 넣는 것이 다음 액션 — 로컬 secrets.toml 은 반영·검증 완료(경로엔진이 Valhalla→TMAP 승격, 출발지 POI 주소 표시). 폰 브라우저에서 바로 사용 가능(인증벽 해제됨). Env=`TMAP_APP_KEY` 3환경 등록. 리전 버그(icn→icn1) main 반영. ※CLI 직접 업로드 방식이라 git push 자동배포는 아직 미연결 — 원하면 Vercel 대시보드 Git 연동.
- [x] **TMAP 앱키 확보·검증 완료(2026-08-04)** — 로컬 서버로 `/api/places`(검색 8건)·`/api/route`(260m·회전안내) 실호출 통과. Vercel Env에 `TMAP_APP_KEY` 한 줄만 넣으면 됨. ※받은 `mwgqaj3qk6` 키는 네이버검색·NCP 양쪽 401이라 미사용(상호검색은 TMAP POI가 충분히 커버 — 대륭포스트타워8차 등 확인). 카카오 키는 현재 web 코드 미참조.
- [ ] **[제품] 산책 기록 MVP(사진 제외)** — `VISION_SOCIAL.md` §3. 격리 worktree+브랜치, `1_Navigation.py` 최소 변경.
- [ ] **폰 실기기 확인** — `REQUESTS_LEDGER.md` §7

## 4. 핵심 결정·제약 (되돌리지 말 것)
- 프로젝트명 `walk` 유지. `1_Navigation.py` 최소 변경. `.env*`·workflows 무단 수정 금지. 커밋/푸시 요청 있을 때만.
- streamlit 1.54.0 pin 변경 금지.
- 구현은 로컬 main 직접 말고 **격리 worktree + 브랜치** (과거: cwd에서 pull 하면 main stale 사고 있음 → 동기화는 `D:\walk`에서).
- 소셜 비전: 경험(걸은 길) 공유가 핵심 — 정본 `VISION_SOCIAL.md`.
- 사진 업로드는 MVP 1단계에서 **제외**(localStorage 용량).

## 5. 핵심 파일 인덱스
| 알고 싶은 것 | 파일 |
|---|---|
| 내비 화면 | `streamlit_walk_engine/pages/1_Navigation.py` |
| 소셜 비전·MVP | `VISION_SOCIAL.md` |
| 요청·폰확인 원장 | `REQUESTS_LEDGER.md` |
| 루트 현황(위키) | `.omc/wiki/walk-2026-07-30.md` |
| 프로젝트 규칙 | `AGENTS.md` |

## 6. 검증된 사실 (재확인 불필요, 2026-07-30)
- `D:\walk` = repo root, remote `origin` = github.com/pds2225/walk
- `main` @ `83aa91c` ↔ `origin/main` (ahead/behind 0)
- 활성 worktree 4: compass-fix, dest-reset, dest-reset-a, heading-debug (모두 `.claude/worktrees/`)
- **과거 “local main이 origin보다 26커밋 뒤”는 무효** — 이 체크포인트 기준으로 동기화됨

## 7. 재개 시 첫 행동
1. 이 RESUME §3 최우선(산책 기록 MVP) 확인
2. `git -C D:\walk status -sb` + `worktree list`로 루트/복사본 상태 재확인
3. 격리 worktree에서 MVP 착수 (또는 사용자가 폰 확인을 먼저 원하면 그쪽으로)

## 활성 worktree (참고)
- `D:/walk/.claude/worktrees/compass-fix` → `fix/android-compass-fallback`
- `D:/walk/.claude/worktrees/dest-reset` → `fix/dest-input-reset`
- `D:/walk/.claude/worktrees/dest-reset-a` → `fix/dest-reset-a`
- `D:/walk/.claude/worktrees/heading-debug` → `fix/heading-debug-panel`






