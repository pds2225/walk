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
- [ ] **실행: 환승 "도착" 수정 (결정 2-1)** — `REQUESTS_LEDGER.md` §결정잠금 TASK B. 다음 구간 start명·마지막만 도착. 격리 worktree.
- [ ] **사람: 클라우드 Naver 키 (결정 1-1)** — Secrets에 키 변수만. 코드 변경 없음.
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
