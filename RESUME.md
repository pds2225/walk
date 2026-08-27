# RESUME.md — 세션 재시작 시 이어하기 진입점

> 새 세션을 시작하면 이 파일을 가장 먼저 읽어라. (최종 갱신: 2026-08-27)
> Secret/API Key/.env 값 금지. 세부는 링크만.

## 0. 30초 컨텍스트
walk 앱(`D:\walk`)의 Production `Ready` 상태와 `k-walk.vercel.app` 도메인을 재확인 완료했다. Preview 실패는 `backup/WIN-K20QOC29TOB` 브랜치의 별도 빌드 문제로 Production에는 영향이 없다. 로컬 `main=83aa91c`, 실제 원격·배포 기준 `main=5e2cfff`이며 동기화·리셋은 하지 않았다.

## 1. 빠른 재개 (복붙용)
```powershell
cd D:\walk
git -C D:\walk status -sb
git -C D:\walk worktree list
python -m pytest streamlit_walk_engine\tests -q
```

## 2. 완료된 작업 ✅
- [x] 사용자 제공 Vercel Production 화면 확인: `walk-c7cs2wakr-ekth3691-8902s-projects.vercel.app`, `k-walk.vercel.app`, `Ready`, 소스 `main/5e2cfff`, 오류율 `0%`.
- [x] `Production Checklist 2/5`와 “This checklist…” 문구가 배포 실패가 아닌 선택형 출시 점검 안내임을 확인.
- [x] 로컬 루트·브랜치·worktree·stash 사전점검 완료. 기존 변경은 보존 중.
- [x] 배포 URL 실측: 첫 화면 HTTP 200, `/api/places` HTTP 200, 정상 `/api/route` HTTP 200, 잘못된 `/api/route` 요청 HTTP 400.
- [x] 로컬 테스트가 실제 Streamlit Secrets에 의존하던 문제를 테스트 격리로 수정: `streamlit_walk_engine/tests/test_route_builder.py`; 전체 `448 passed`.
- [x] `k-walk.vercel.app` alias를 현재 배포에 연결하고 HTTPS·앱/API 응답을 확인했다.
- [x] 최신 Preview 실패 로그 확인: `No Next.js version detected`; 실패 브랜치는 `backup/WIN-K20QOC29TOB`, 커밋은 `7b3a773`.
- [x] `Status` 재확인: Production `walk-c7cs2wakr...`는 `Ready`, `k-walk.vercel.app`은 HTTP 200 및 검색 API HTTP 200.

## 3. 남은 작업 ⬜ (다음 세션에서 이어서)
- [x] 배포 URL의 실제 첫 화면과 `/api/places`, `/api/route` 응답 확인. 현재 재현되는 Vercel 배포 오류 없음.
- [ ] Preview가 필요한 경우에만 오래된 백업 브랜치의 Vercel 빌드 대상을 정리한다. Production 수정은 하지 않는다.
- [ ] 산책 기록 MVP(사진 제외)는 별도 작업으로 착수한다 — `VISION_SOCIAL.md` §3.
- [ ] Streamlit Cloud Secrets 입력과 폰 실기기 확인 — `REQUESTS_LEDGER.md` §7.

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

## 6. 확인된 사실
- `D:\walk` = repo root, remote `origin` = github.com/pds2225/walk.
- `git ls-remote origin refs/heads/main` 결과는 `5e2cfff`; 로컬 `main`은 `83aa91c`이다.
- 사용자 캡처 기준 Vercel 배포는 `Ready`, 오류율 `0%`; URL 실측도 첫 화면·장소검색·경로·입력오류 처리 모두 통과했다.
- `vercel ls walk` 기준 `walk-c7cs2wakr...` Production은 `Ready`; 최신 Preview 여러 건은 별도 브랜치 빌드 오류다.
- 최신 재확인에서도 `k-walk.vercel.app` 첫 화면·장소 검색은 정상이고 HTTPS HSTS가 적용되어 있다.
- 최신 Preview 로그의 근본 원인은 `package.json`에 Next.js가 없는 백업 브랜치가 루트 빌드 설정으로 배포된 것이다.
- Vercel 연결 도구에서는 이 프로젝트/배포를 조회하지 못했고, 이전 직접 요청은 로컬 Schannel TLS 오류로 실패했다.

## 7. 재개 시 첫 행동
1. 다음 작업은 `VISION_SOCIAL.md` §3 기준 산책 기록 MVP를 격리 worktree에서 착수한다.
2. 폰 실기기 확인이 먼저 필요하면 `REQUESTS_LEDGER.md` §7을 갱신한다.

## 활성 worktree (참고)
- `D:/walk/.claude/worktrees/compass-fix` → `fix/android-compass-fallback`
- `D:/walk/.claude/worktrees/dest-reset` → `fix/dest-input-reset`
- `D:/walk/.claude/worktrees/dest-reset-a` → 