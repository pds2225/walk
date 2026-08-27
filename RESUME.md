# RESUME.md — 세션 재시작 시 이어하기 진입점

> 새 세션을 시작하면 이 파일을 가장 먼저 읽어라. (최종 갱신: 2026-08-27)
> Secret/API Key/.env 값 금지. 세부는 링크만.

## 0. 30초 컨텍스트
walk 앱(`D:\walk`)의 Production `Ready` 상태와 `k-walk.vercel.app` 도메인을 재확인 완료했다. Vercel의 `Deployment Settings`는 Root Directory `.`, Next.js, `npm run next:build`, Output `web/.next`, Install `npm install`, Node 24.x로 확인됐고 현재 배포와 일치한다. `4 Recommendations`는 연결·분석·성능 관련 선택형 운영 권고이며 오류가 아니다. `To update your Production Deployment, push to the main branch.`도 현재 Production을 갱신하려면 `main` 브랜치에 변경사항을 push하라는 일반 안내다. Vercel의 `github/pds2225`는 연결된 GitHub 저장소 소유자/조직 표기이고, `Source`의 `main`은 기본 배포 브랜치, `5e2cfff`는 배포에 사용된 Git 커밋 식별자다. 커밋 제목 `feat(web): wire deviation reroute into navigation`은 웹 앱에 경로 이탈 시 재탐색 기능을 연결한 변경을 뜻한다. `6h ago by pds2225`는 배포 생성 시각·생성 주체이며 오류가 아니다. Preview 실패는 `backup/WIN-K20QOC29TOB` 브랜치의 별도 빌드 문제로 Production에는 영향이 없다. 로컬 `main=83aa91c`, 실제 원격·배포 기준 `main=5e2cfff`이며 동기화·리셋은 하지 않았다.

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
0. 이번 재개 확인: `Production Checklist 2/5`는 5개 점검 중 2개 완료라는 뜻이며, `4 Recommendations`와 함께 오류가 아닌 선택형 출시·운영 점검이다. `Connect Git Repository`는 `github/pds2225/walk`가 이미 연결되어 있어 별도 조치가 필요 없다. `Add Custom Domain`은 별도 구매한 개인 도메인을 연결하는 항목이며, 현재 `k-walk.vercel.app` 주소는 정상 사용 중이다. `Preview Deployment`는 작업 브랜치·PR을 Production 반영 전에 확인하는 임시 배포이며, 일부 백업 브랜치의 빌드 실패는 Production과 별개다. `Enable Web Analytics`는 방문자·페이지 조회 통계를 보는 선택 기능이며 서비스 동작에는 필수가 아니다. `Upgrade to Speed Insights Plus`는 선택적인 유료 성능 분석 업그레이드이며 현재 서비스 사용에 필요하지 않다. `Observability`는 요청 수·함수 실행·오류율을 보는 모니터링 영역이며, 현재 0건 표시는 사용량이 없다는 뜻일 수 있다. Observability 옆 `6h`는 최근 6시간 관측 범위 또는 배포 후 경과 시간을 나타내는 표시이며 오류 코드가 아니다. `Edge Requests`는 Vercel 엣지 서버로 들어온 웹 요청 횟수이며 `0`은 해당 관측 시간에 기록된 요청이 없다는 뜻이다. `Function Invocations`는 API·서버 함수가 실행된 횟수이며 `0`은 선택된 기간에 집계된 실행이 0회라는 뜻이다. `Error Rate`는 전체 요청 중 오류가 발생한 비율이며 현재 `0%`는 선택된 관측 기간에 감지된 오류가 없다는 뜻이다. `Analytics`는 방문자 수·페이지 조회·유입 흐름을 보는 통계 메뉴이며 앱 기능과는 별개다. `Track Visitors and Page Views`는 방문자 수와 페이지 조회 수를 기록·분석한다는 안내다. `See real-time traffic, top pages, and audience trends`는 실시간 방문 흐름·인기 페이지·방문자 추세를 확인한다는 Analytics 안내다. `Active Branches`는 최근 배포·활동이 있는 Git 브랜치 목록이며 각 `Preview`는 해당 브랜치의 테스트용 배포다. `Search`는 Active Branches 목록에서 브랜치명·배포를 찾는 필터 입력창이다. `backup/WIN-K20QOC29TOB`는 백업용 Git 브랜치이며, 확인된 Preview 빌드 실패는 Production과 별개다. `Preview` 표시는 해당 브랜치의 임시 테스트 배포라는 뜻이며 Production 주소가 아니다. `EaHGJrdRB`는 해당 Preview 배포를 식별하는 짧은 배포 ID이며 오류 코드가 아니다. `Source`는 해당 배포의 GitHub 저장소·브랜치·커밋 정보를 표시하는 영역이다. `github/pds2225`는 연결된 GitHub 계정·소유자 표기이며 실제 저장소는 `pds2225/walk`다. `pds2225` 단독 표시는 GitHub 사용자명 또는 해당 배포 커밋 작성자 표시다. `12m ago`는 해당 Preview 배포 또는 브랜치 활동이 12분 전에 발생했다는 상대 시간 표시다. `task/kn-20260826-01-20260827`는 특정 작업용 Git 개발 브랜치이며 해당 Preview는 Production과 별개다.
0. 현재 재확인: `Preview`는 Production 전 테스트용 임시 배포다. `Ban9SutYw`는 Preview 배포 ID이며 옆의 `#110`은 관련 PR 번호다. `#110`은 GitHub Pull Request 번호로, 해당 작업 브랜치 변경사항의 검토·병합에 사용된다. PR 화면의 `github/pds2225`도 GitHub 저장소 소유자·연결 계정 표기다.
0. `pds2225`는 GitHub 사용자명이며 배포·PR 작성자 표기로도 사용된다.
0. `6h ago`는 해당 Preview 배포 또는 브랜치 활동이 6시간 전에 생성·발생했다는 상대 시간 표시다.
0. `task/k-navi-task-refresh-20260827`는 내비게이션 새로고침 작업용 Git 브랜치이며 연결된 Preview는 Production과 별개다.
0. 방금 확인한 `Preview`도 Production 반영 전 테스트용 임시 배포다.
0. `CC6o9bazu`는 해당 Preview 배포를 식별하는 짧은 Vercel 배포 ID이며 오류 코드가 아니다.
0. `#109`는 해당 Preview와 연결된 GitHub Pull Request 번호다.
0. `#109` 화면의 `github/pds2225`도 연결된 GitHub 계정·저장소 소유자 표기다.
0. `pds2225`는 해당 PR의 작성자 또는 GitHub 사용자명으로 표시될 수 있다.
0. `13h ago`는 해당 Preview·PR 활동이 13시간 전에 발생했다는 상대 시간 표시다.
0. `cursor/cloud-agent-1787756290065-ub3dw`는 Cursor Cloud Agent가 생성한 작업 브랜치명으로 보이며 연결된 Preview는 Production과 별개다.
0. 해당 Cursor 브랜치의 `Preview`도 Production 반영 전 테스트용 임시 배포다.
0. `X8hJCEJ39`는 해당 Cursor Preview 배포를 식별하는 짧은 Vercel 배포 ID다.
0. Cursor Preview 화면의 `Source`도 생성 브랜치·GitHub 저장소·커밋 정보를 뜻한다.
0. Cursor Preview의 `github/pds2225`도 연결된 GitHub 계정·저장소 소유자 표기다.
0. Cursor Preview의 `pds2225`는 표시된 GitHub 사용자명·작성자 정보다.
0. `20h ago`는 해당 Cursor Preview 배포 또는 브랜치 활동이 20시간 전에 발생했다는 상대 시간 표시다.
0. `claude/destination-search-input-bug-asbhp2`는 Claude가 생성한 목적지 검색 입력 버그 수정용 작업 브랜치명이며 끝의 문자열은 작업 식별자다.
0. 해당 Claude 브랜치의 `Preview`도 Production 전 테스트용 임시 배포다.
0. `5otN8qjAV`는 해당 Claude 브랜치 Preview를 식별하는 짧은 Vercel 배포 ID다.
0. `#108`은 해당 Preview와 연결된 GitHub Pull Request 번호다.
0. `github/claude`는 Claude가 만든 작업 브랜치의 GitHub 연동 출처 표기로 보이며 오류가 아니다.
0. `claude` 단독 표기는 Claude가 생성한 작업·배포임을 나타내는 표시다.
0. `Aug 24`는 해당 Preview·브랜치·PR 활동 날짜가 8월 24일이라는 뜻이다.
0. `ci/merge-gate-20260813`는 병합 전 CI 점검용 브랜치명이며 `20260813`은 2026년 8월 13일을 뜻한다.
0. 해당 CI 브랜치의 `Preview`도 Production 전 검증용 임시 배포다.
0. `89otMePf1`는 해당 CI Preview 배포를 식별하는 짧은 Vercel 배포 ID다.
0. `#106`은 해당 CI Preview와 연결된 GitHub Pull Request 번호다.
0. `#106` 화면의 `github/pds2225`도 연결된 GitHub 계정·저장소 소유자 표기다.
0. `#106` 화면의 `pds2225`는 표시된 GitHub 사용자·작성자 정보다.
0. `Aug 13`은 해당 CI Preview·PR 활동 날짜가 8월 13일이라는 뜻이다.
0. `docs/task-git-ahead-push-20260813`는 Git 상태·push 안내 문서 작업용 브랜치명이며 `20260813`은 8월 13일을 뜻한다.
0. 해당 문서 브랜치의 `Preview`도 Production 전 검토용 임시 배포다.
1. 다음 작업은 `VISION_SOCIAL.md` §3 기준 산책 기록 MVP를 격리 worktree에서 착수한다.
2. 폰 실기기 확인이 먼저 필요하면 `REQUESTS_LEDGER.md` §7을 갱신한다.

## 활성 worktree (참고)
- `D:/walk/.claude/worktrees/compass-fix` → `fix/android-compass-fallback`
- `D:/walk/.claude/worktrees/dest-reset` → `fix/dest-input-reset`
- `D:/walk/.claude/worktrees/dest-reset-a` → `fix/dest-reset-a`
- `D:/walk/.claude/worktrees/heading-debug` → `fix/heading-debug-panel`
- `D:/walk/.claude/worktrees/web-vercel` → `worktree-web-vercel` (locked)
- `D:/walk/.worktrees/transit-end-label` → `fix/transit-end-label`






