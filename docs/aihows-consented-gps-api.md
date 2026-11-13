# AIHows 동의자 GPS 연동 API — 운영 승인 전 명세

**상태: 구현 PR / 미배포·운영 미검증.** 실서비스 API라고 안내하지 않음.

## 별도 동의 및 철회
- 시장 화면 하단의 별도 선택 동의 UI. 동의 거부해도 지도·길찾기 사용 가능.
- `GET /api/aihows-consent`: 방문객 서명 쿠키 발급 및 서버 동의 상태 조회.
- `POST /api/aihows-consent`: `{"action":"grant","notice_version":"aihows-poc-2026-11-v1"}` 또는 `{"action":"revoke"}`.
- `aihows_location_consents` 현재 동의 상태 및 `aihows_location_consent_audit` 변경 이력 기록.
- 기존 위치 수집 동의와 독립. 서버 서명된 쿠키로 기존 방문객 ID 위조 방지.
- 동의 이전 수집 이벤트, 철회한 방문객, 365일 초과 이벤트는 DB 보안 뷰에서 제외.

## GPS 조회 API
```http
GET /api/v1/poc/aihows-location-records?from=2026-11-10T00%3A00%3A00Z&to=2026-11-10T01%3A00%3A00Z&limit=100
Authorization: Bearer <AIHows 전용 비밀키>
Accept: application/json
```
- 응답: `{"records":[{"created_at":"...","event":"location_fix","visitor_id":"...","store_id":null,"lat":37.0,"lng":126.0,"accuracy_m":10}],"limit":100}` (가상 예시)
- 24시간 이내 기간·최대 100건. 조회 범위 초과/미인증/미설정은 거부.
- `public.events` 직접 접근 금지. 오직 `aihows_shareable_location_events` 보안 뷰에서만 조회.
- 보유기간: AIHows 수령 후 최대 1년. 목적 달성·철회 시 조기 파기 및 재제공 금지 약정 필요.
- 집계 API는 `docs/poc-store-aggregates-api.md` 참고.

## 운영 적용 선행조건
1. AIHows의 실제 계약상 법인명과 사업자정보를 확인하고, 수령기관·목적·항목·기간·철회·파기·법적 지위 등 제3자 제공 및 위치정보 관련 고지를 확정.
2. Supabase migration `20261110080000_aihows_location_consent.sql` 적용 및 RLS/권한/뷰 조회 확인.
3. Vercel 서버 환경변수: `AIHOWS_LEGAL_NAME`(확인된 법인명), `AIHOWS_CONSENT_SIGNING_KEY`(32자 이상 난수), `AIHOWS_GPS_API_KEY`(별도 강력한 난수), `AIHOWS_GPS_API_ENABLED=true`. 기존 `SUPABASE_URL` 및 `SUPABASE_SERVICE_ROLE_KEY` 필요.
4. 개인정보 보호법 제17조 제2항의 제3자 제공 고지사항을 확인하고, 위치정보법 제19조 제2~4항의 개인위치정보주체가 지정한 제3자 제공 서비스 해당 여부 및 제공사실 통지 의무를 법률 검토. 해당되는 경우 매회 즉시 통지 또는 제4항의 별도 동의 및 최대 30일 범위 모아서 통지 기능을 구현·검증할 것. **현재 제공사실 통지 기능은 미구현이며, 법률 검토 및 해당 기능 검증 전 GPS 운영 활성화 금지.**
5. 동의 상태와 동일한 현재 동의 이후의 grant 감사 이력이 DB 뷰에서 확인되는지 검증. 감사 기록 저장 실패 시 DB 상태만 변경됐더라도 GPS 공유를 차단.
6. 운영환경에서 선택 동의→서버 기록→동의 이후 GPS 수집→API 조회→철회→API 즉시 제외 E2E, 기존 시장 화면 회귀 검증.
7. 상대방 인증키는 채팅·Git에 기재하지 않고 별도 보안채널로 전달. 실제 위치기록은 공개 저장소·문서에 남기지 않음.

**현재 환경에서는 Vercel 프로젝트가 연결된 계정에서 404/403으로 조회되어 운영 환경변수·배포·Supabase 실데이터 검증을 수행할 수 없음.**
