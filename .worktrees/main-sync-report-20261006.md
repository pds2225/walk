# walk main 반영·동기화 완료 (2026-10-06)

- main: `87f890ffc8d8d1277fd41fd3542b485c4e02a33f`; [통합 PR #144](https://github.com/pds2225/walk/pull/144) merged.
- root 및 독립 clone은 main, 나머지10 linked worktree는 동일 main 커밋의 detached HEAD. 기존 작업 브랜치 이력은 보존한다.
- 포함: #143 월드컵45점포/근거좌표45/파노45, #130 이탈 gate, #142 표시 GPS, #136/#135 망원 데모, #100/후속 transit label, 원본 로컬 회전 미이행 수정, 독립 Python route scoring/Kakao bridge.
- 제외·보존: #101 기존 모듈35파일 삭제 전용, 중복/백업 이력, 생성 fixture, 이미 대체된 옛 웹 provider.
- 보호: 백업브랜치 backup/local-main-sync-20261006=2325b22, backup/production-local-main-sync-20261006=87c3b8a를 정상 push했다. 기존 stash4개 SHA 동일. env실파일/세션/사용자설정 보존 확인. 이전 worktree의 Git 추적 예제3파일은 최신 main 버전으로 맞춰졌다.

## 최소 검증

| 명령/경로 | 결과 |
|---|---|
| npm run test:run (영향7파일; 실패 파일만 재실행) | 77 PASS |
| pytest (transit/route-builder/route-score/kakao/navigation-smoke 5파일) | 292 PASS |
| npm run typecheck --workspace web | PASS |
| web npm run build | PASS |
| 설치 Chrome390×844: 홈/망원/월드컵 | HTTP200, 홈4언어, 월드컵45점포·도보버튼, 가로넘침0/pageerror0 |
| 기존 #143 실제 NAVER/TMAP 및 #130 simulate4 | 기존PASS 증거 재사용; 반복 실행 없음 |
| PR CI npm ci/tests/lint/typecheck/packages build/web build | [test PASS](https://github.com/pds2225/walk/actions/runs/37333707245) |
| PR 문서 gate | [docs-gate PASS](https://github.com/pds2225/walk/actions/runs/37333707294) |
| main push CI | [test PASS](https://github.com/pds2225/walk/actions/runs/37334017105), [docs-gate PASS](https://github.com/pds2225/walk/actions/runs/37334017074) |

## 위치별 최종 대조

| 위치 | branch 상태 | HEAD | 추적파일 변경 |
|---|---|---|---|
| D:\walk | main | 87f890f | 0 |
| D:\walk-streetview | detached main snapshot | 87f890f | 0 |
| D:\walk\.worktrees\k-navi-production | detached main snapshot | 87f890f | 0 |
| D:\walk\.worktrees\task-k-navi-rv-02 | detached main snapshot | 87f890f | 0 |
| D:\walk\.worktrees\transit-end-label | detached main snapshot | 87f890f | 0 |
| D:\walk\.worktrees\worldcup-market-clean-20261004 | main | 87f890f | 0 |
| D:\walk\.claude\worktrees\compass-fix | detached main snapshot | 87f890f | 0 |
| D:\walk\.claude\worktrees\dest-reset | detached main snapshot | 87f890f | 0 |
| D:\walk\.claude\worktrees\dest-reset-a | detached main snapshot | 87f890f | 0 |
| D:\walk\.claude\worktrees\heading-debug | detached main snapshot | 87f890f | 0 |
| D:\walk\.claude\worktrees\web-vercel | detached main snapshot | 87f890f | 0 |
| C:\Users\ekth3\AppData\Local\v_up\dashboard_worktrees\walk\dashboard-main | detached main snapshot | 87f890f | 0 |

## 변경 파일 (55개)

- .gitignore
- TASK.md
- eslint.config.js
- streamlit_walk_engine/components/kakao_roadview/index.html
- streamlit_walk_engine/kakao_js_key.py
- streamlit_walk_engine/kakao_roadview_component.py
- streamlit_walk_engine/pages/1_Navigation.py
- streamlit_walk_engine/route_builder.py
- streamlit_walk_engine/route_score.py
- streamlit_walk_engine/tests/test_kakao_roadview.py
- streamlit_walk_engine/tests/test_navigation_smoke.py
- streamlit_walk_engine/tests/test_route_builder.py
- streamlit_walk_engine/tests/test_route_score.py
- streamlit_walk_engine/tests/test_transit_builder.py
- streamlit_walk_engine/transit_builder.py
- web/app/mangwon-mobile-overrides.css
- web/app/mangwon-storefront.css
- web/app/mangwon.css
- web/app/mangwon/page.tsx
- web/app/page.test.tsx
- web/app/page.tsx
- web/app/worldcup-market-mobile-overrides.css
- web/app/worldcup-market-streetview.css
- web/app/worldcup-market.css
- web/app/worldcup-market/page.tsx
- web/components/DestinationWalk.tsx
- web/components/MangwonDemo.test.tsx
- web/components/MangwonDemo.tsx
- web/components/MangwonMarketMap.tsx
- web/components/MangwonStorefront360.test.tsx
- web/components/MangwonStorefront360.tsx
- web/components/WorldCupMarketDemo.test.tsx
- web/components/WorldCupMarketDemo.tsx
- web/components/WorldCupMarketMap.tsx
- web/components/WorldCupMarketStreetView.test.tsx
- web/components/WorldCupMarketStreetView.tsx
- web/lib/i18n.ts
- web/lib/mangwonStoreCopy.test.ts
- web/lib/mangwonStoreCopy.ts
- web/lib/mangwonStoreTranslations.ts
- web/lib/mangwonStorefrontEmbed.test.ts
- web/lib/mangwonStorefrontEmbed.ts
- web/lib/mangwonStores.test.ts
- web/lib/mangwonStores.ts
- web/lib/useGeolocation.test.ts
- web/lib/useGeolocation.ts
- web/lib/useNavigation.test.ts
- web/lib/useNavigation.test.tsx
- web/lib/useNavigation.ts
- web/lib/worldCupMarketStoreCopy.test.ts
- web/lib/worldCupMarketStoreCopy.ts
- web/lib/worldCupMarketStores.test.ts
- web/lib/worldCupMarketStores.ts
- web/lib/worldCupMarketStreetView.test.ts
- web/lib/worldCupMarketStreetView.ts

## 남은 확인

- 공유좌표12그룹39점포는 임의 분산하지 않았다. 건물좌표/근처거리 파노이므로 개별 출입구·실내 및 점포정면은 현장 확인이 필요하다.
- 현장 GPS 및 운영 배포 환경 설정은 자동화 localhost 검증과 별도다. 외부 PC는 이번 로컬12곳 확인 범위에 포함되지 않는다.
- 원본 사용자 설정/로컬 기록은 untracked 상태로 보존한다. old invalid worktree metadata는 삭제하지 않았다.
