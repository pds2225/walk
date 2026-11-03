# Issue #200 P0 수집·관리자 분석 운영 안내

이 변경은 기존 Next.js 앱에서 이벤트 수집과 관리자 조회를 연결한다. 별도 서비스나 통계 서버를 만들지 않는다.
상태·우선순위는 `origin/main:TASK.md`가 정본이다. 이번 결과는 `KN-DATA-054 / KN-ANL-001~010`에 통합한다.

## 저장 경로와 기존 변경 통합

다른 `installation-db` worktree에서 준비하던 `storageDeployment`와 수집 어댑터 및 빈 시장 DB용 SQL을 재사용했다.
원본 worktree의 미커밋 코드·공간 체류 모델·샘플 수집 기능은 변경하거나 포함하지 않았다.
이전 대화의 app별 `WALK_SUPABASE_URL` 분리 초안은 이 PR에서 중복 도입하지 않는다.

- 기존 WALK 배포는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 사용한다. 이 연결의 기존 혼재 기록은 원본 보존 대상이며 물리적 이전 완료라고 주장하지 않는다.
- 시장 배포는 `KNAVI_SUPABASE_URL`, `KNAVI_SUPABASE_SERVICE_ROLE_KEY`, `KNAVI_DATABASE_PROJECT_REF`, `KNAVI_INSTALLATION_ID`를 요구한다. 일반 WALK 연결로 fallback하지 않는다.
- 서버의 기존 Vercel 프로젝트 ID로 제품을 고정한다. Vercel 외에서는 `STORAGE_PRODUCT=walk` 또는 `STORAGE_PRODUCT=knavi`와 구축 ID를 명시한다. 요청의 app/경로/점포 ID/헤더로 DB를 고르지 않는다.
- 시장 저장 전 `deployment_identity`를 읽어 `knavi / mangwon-worldcup-market`인지 확인한다. 불일치·미설정·접근 실패는 저장하지 않는다. QR 이동은 DB 저장과 독립적으로 유지한다.
- 시장에서 시작한 보행도 시장 DB의 `app=worldcup-market`에 귀속하며, 일반 WALK 배포의 보행은 `app=walk`다. 점포 ID는 보행·재탐색·도착·중지·실패에서만 허용하며 점포 번호는 서버에서 계산한다.

## 적용 준비 — 운영에서는 미실행

1. 운영 관리자가 대상 프로젝트·권한·현재 스키마와 백업을 확인한다. 기존 원본을 삭제·초기화·복사하지 않는다.
2. 승인된 **빈 시장 전용 DB**에만 `supabase/installations/mangwon-worldcup-market/001_identity_events_qr.sql`을 적용한다. 기존 테이블이 있으면 이 스크립트는 중단한다. 기존 혼재/WALK DB에 실행하지 않는다.
3. 기존 WALK DB와 준비된 시장 DB 각각에 `supabase/migrations/20261103010000_analytics_navigation.sql`을 적용한다. 이 파일은 기존 이벤트/QR 스키마를 전제로 한다. 임의의 다른 DB에 적용하지 않는다.
4. nullable `navigation_id`, `ingest_id`, 트래픽 근거 필드와 인덱스를 추가한다. 레거시 값은 채우지 않는다. `NOT VALID` 제약으로 기존 좌표·동의를 날조하거나 지우지 않고 신규 무동의 좌표 쓰기를 차단한다.
5. `pg_cron` 권한과 `wcm-geo-retention`, `walk-geo-retention` 작업을 확인한다. 좌표·정확도만 365일 후 비우며 이벤트 자체는 유지한다. 로컬 PostgreSQL 호환 검사에서는 cron 확장을 실행하지 않았다.
6. 배포의 서버 전용 비밀 저장소에서 필요한 연결을 준비한다. 관리자용 `ANALYTICS_ADMIN_PASSWORD`는 최소 32자다. 값은 채팅·코드·로그·클라이언트 환경변수에 넣지 않는다. 이 작업에서 `.env`와 운영 설정은 열람/변경하지 않았다.
7. 운영 배포는 별도 승인 후 수행하고 실제 이벤트→DB 행→관리자 KPI/CSV를 확인한다. PR 생성·CI·로컬 성공은 운영 배포/실제 이용 증명이 아니다.

## 동의와 식별자

일반 WALK의 `walk:geo-consent`와 시장의 기존 `wcm:geo-consent`를 분리한다. 기본은 미동의다.
길안내는 저장 동의와 무관하게 동작하고, 매 이벤트 전송 때 현재 동의를 다시 읽는다.
철회하면 이후 좌표 전송을 중단하고 서버도 `geo_consent=true`인 허용 이벤트에서만 좌표를 저장한다.
철회는 이미 동의 아래 저장된 과거 행의 삭제를 의미하지 않는다. 정책·법률 적합성 최종 검토는 별도다.

GPS 기반 길찾기 시도마다 `navigation_id`를 발급하고 진행/재탐색/도착/중지/실패에 유지한다.
다른 목적지·재시도는 별도 ID이며, 수동 출발지의 경로 미리보기는 실제 보행 시작으로 집계하지 않는다.
탭의 `session_id`와 방문자 쿠키 계약은 유지한다. 과거 결측 ID를 추측해서 복원하지 않는다.

## 관리자 조회와 해석

관리자 화면은 `/admin/analytics`, 조회는 `/api/admin/analytics`, 로그인/로그아웃은 `/api/admin/session`이다.
서명된 8시간 HttpOnly·SameSite=Strict 쿠키와 요청 origin 검사를 사용한다. 비밀번호 교체는 기존 세션을 무효화한다.
관리자는 현재 배포에 묶인 DB만 읽는다. 두 운영 DB를 한 화면에서 자동 합치지 않는다.
최소 감사 로그에는 허용/거부·작업·시각만 남긴다. 개인별 계정/SSO가 아닌 공유 관리자 비밀 방식이며, 로그인 속도 제한과 저장 진단 카운터는 서버 인스턴스 범위다.

날짜는 KST 기준 최대 93일, 이벤트·QR 합산 최대 10,000행이다. 더 많으면 필터를 좁히도록 오류를 반환하며 일부 데이터로 전체 KPI를 만들지 않는다.
로그는 50행씩 표시하고 CSV는 최대 5,000행이다. DB가 1,000행씩 반환해도 끝까지 읽는다.
CSV는 UTC/KST를 각각 명시하고 정밀좌표·정확도·UA·리퍼러·원본 방문자/세션 ID를 선택하지 않는다.
방문자/탭 세션은 서버 키로 만든 별칭이며 실제 사람 수가 아니다. CSV 수식 접두사와 따옴표도 방어한다.

트래픽은 서버의 배포 근거로만 `production/test/unknown`을 기록한다. 테스트는 서버의 명시적 `ANALYTICS_TRAFFIC_TYPE=test` 또는 비운영 Vercel 배포로 식별한다.
`production`은 운영 배포에서 왔다는 뜻이며 실사용자·현장 방문을 보장하지 않는다. 레거시는 근거가 없으면 `unknown`이다.
QR 45건/약 0.7초는 테스트로 확정하거나 삭제할 근거가 아니다. QR 링크 요청과 `src=qr` 점포조회는 분리하고 실제 카메라 스캔은 미확인으로 둔다.
도착은 이벤트다. 같은 보행 ID·앱·점포의 시작과 연결된 경우만 이벤트 도착 비율에 사용하며 실제 방문·구매 성과라고 표시하지 않는다.
누락 보행 ID, 중복 시작, 시작 없는 도착을 별도로 표시한다. 조회 기간 밖의 시작도 미확인으로 남는다.

202 응답은 저장 대기 상태다. `ingest_id`로 POST 후 DB 재조회를 수행한 경우만 확인 카운터에 넣는다.
설정/DB/스키마 조회 실패를 0건으로 표시하지 않는다. 저장 진단은 현재 서버 인스턴스 범위이며 전역 영구 이력이 아니다.

## 이번 검증 경계

- 직접 관련 Vitest, root/web TypeScript, root lint, 변경 web 파일의 ESLint 비교 및 Next production build를 수행했다. 전체 로컬 테스트는 실행하지 않았다.
- 로컬 Chromium 모바일 390×844/데스크톱 1440×1000에서 시장 23→05, 별도 nav ID, 동의/철회, 관리자 차단/로그인, API→DB 대역 재조회→KPI/CSV 일치를 확인했다.
- 일반 WALK도 점포 ID 없이 시작하고 합성 도착 이벤트가 같은 nav ID와 KPI로 연결되는 것을 확인했다.
- 위 브라우저 검증은 합성 GPS·경로와 인메모리 PostgREST 대역이다. 실제 TMAP·Supabase·실외 보행·운영 E2E는 미검증이다.
- PostgreSQL 호환 PGlite에서 기존 이력 보존·신규 동의 제약·점포 보행·중지·트래픽 제약·RLS/구축 식별 보호를 검사했다. 운영 SQL 적용·pg_cron 실행은 미검증이다.
- 실행 환경에 운영 DB 자격증명이 없고 연결된 Supabase 관리 도구도 없어 운영 스키마/행/전용 프로젝트 존재를 조회하지 못했다. 비용 발생 프로젝트 생성·운영 키 설정·데이터 이관·배포는 수행하지 않았다.
