# K-Navi ↔ AI하우스 | 월드컵시장 PoC 연동 명세

- 문서일: 2026-11-12
- 문서 상태: **협력사 전달·협의용 명세 (실서비스 API 승인/배포 완료 아님)**
- 대상: K-Navi / K-Trip 망원동 월드컵시장 / AI하우스 Here Me·관제
- 보존 정책: 기존 방문객 화면, 인쇄 QR, 식별자, 원본 DB, 이용자 동의·철회 기능 유지. 운영 DB 파괴적 변경·미동의 개인 GPS 외부 제공 금지.
- 구현 SSOT: 저장소 루트 \`TASK.md\`. 이 문서는 외부 협력사와의 연동 계약·상태를 설명하며 구현 완료를 뜻하지 않음.

## 1. 역할·데이터 경계

| 구성요소 | 책임 | 외부로 나가는 데이터 |
|---|---|---|
| K-Navi | 여러 시장 통합 관리·계약·데이터 관리 주체 | 승인된 범위만 |
| K-Trip (월드컵시장) | 방문객용 지도·점포 정보·길찾기·QR 랜딩 | 기존 방문객 화면 |
| WALK | K-Trip이 재사용하는 GPS·경로 탐색 엔진 | 엔진 내부 구현은 별도 제공하지 않음 |
| AI하우스 | 입구·점포 QR 방문 기록, Here Me 점포 앱, 관제·SOS 대시보드 | 자체 QR 통계 및 합의된 결과 데이터 |

AI하우스의 2026-11-10 개발계획서에는 입구 QR→시장 화면, 점포 QR→점포 상세, 점포 앱, 관제·QR 통계를 AI하우스 측 개발 범위로 기재함. K-Navi가 같은 관제 대시보드를 중복 개발하지 않음.

**서로 다른 지표를 섞지 않음:** AI하우스의 *QR 체크인 방문객 수*와 K-Trip의 *점포 상세화면 조회 수(store_view)*는 수집 기준·식별자가 다름. GPS 위치 측정값은 어느 쪽도 QR 체크인과 같지 않음.

## 2. 확정된 방문객 URL·점포 식별자

PoC에서 기존 URL·점포 식별 계약 유지:

| 용도 | 경로 또는 예시 | 상태 |
|---|---|---|
| 월드컵시장 입구 | \`/worldcup-market?lang=ko\` | 기존 화면 경로 |
| 점포 01 | \`/worldcup-market?lang=ko&store=worldcup-market-01\` | 기존 점포 ID 형식 |
| 기존 인쇄 QR | \`/q/01\` 등 | 기존 QR 동작 보존. AI하우스가 제작한 QR 실제 인코딩 주소는 인쇄 전에 별도 대조 |
| 방문객용 시장·점포 URL | \`https://k-navi-eight.vercel.app/worldcup-market?lang=ko\` | K-Navi Vercel 프로젝트의 현재 도메인 |

AI하우스 매뉴얼에는 \`https://k-navi.vercel.app/worldcup-market?lang=ko\` 사용이 기재되어 있으며, 2026-11-12 조회 시 양쪽 호스트의 월드컵시장 HTML은 응답함. **그러나 \`k-navi.vercel.app\`은 별도 \`walk\` Vercel 프로젝트에 연결되어 있음.** PoC 공식 호스트는 양측이 선택·확정하고, 기존 발행/인쇄 QR은 변경하지 않음. HTTP 200만으로 방문객 측 QR·선택점포 실제 화면 E2E가 완료되었다고 판단하지 않음.

실제 앱의 점포 ID는 \`worldcup-market-01\`처럼 2자리 이상 번호 문자열. 협력사 문서의 축약 표기 \`worldcup-market-N\`을 구현 시 그대로 대입하지 말고 K-Navi 원본 점포 ID와 1:1 대조할 것.

## 3. AI하우스가 자체 제공하는 QR 데이터

계획서·매뉴얼 기준 PoC 핵심 7개 지표는 우선 AI하우스 QR 서버에서 산출:

1. 입구 QR을 스캔한 중복 제외 방문객 수
2. 방문객별 방문 시작 시각 (해당일 첫 스캔)
3. 방문객별 방문 종료 시각 (마지막 스캔 후 활동 종료 판단)
4. 방문객별 총 체류 (정의된 시작·종료 시각의 차이; 실제 물리적 체류를 확정하지 않음)
5. 점포별 방문객 수 (점포 QR 스캔 기준)
6. QR 스캔으로 확인한 점포 방문 **순서·횟수** (실제 GPS 궤적과 구분)
7. 마지막 QR 스캔 시각에 따른 점포별 현재 방문객 **추정치**

AI하우스 PDF의 활동 종료 기준은 마지막 스캔 후 **60분**, 점포 체류 추정 기준은 **15분 이내**임. AI하우스 제공 샘플 HTML에는 활동 종료 **120분** 표기가 있어 상충됨. 운영판 산식은 PDF 기준으로 맞추는 안을 제시하되 **AI하우스 최종 확인 필수**.

관제는 AI하우스가 운영하므로 K-Navi 측 신규 관제 대시보드 개발은 범위 밖. QR 서버의 ID·브라우저 쿠키와 K-Navi \`ktrip_vid\`는 자동으로 동일인이 아님. 무단 교차 식별·재식별 금지.

## 4. 선택 연동: K-Navi 점포별 익명 *웹 조회* 집계 API

이 기능은 \`pds2225/walk\`의 **Draft PR #202에 구현된 코드**이며 **현재 K-Navi 운영에 배포·활성화·인증키 발급·실데이터 E2E 미확인**. 지금 AI하우스에 “사용 가능한 운영 API”라고 안내하지 않음.

- 메서드: \`GET\`
- 예정 경로: \`/api/v1/poc/store-aggregates\`
- 인증: 서버 간 \`Authorization: Bearer <별도 전달된 키>\`
- 질의: \`from\`, \`to\` — 완료된 **UTC 날짜 1일(00:00~익일 00:00)**만 허용
- 원천: K-Navi \`public.events\` 중 \`app=worldcup-market\`, \`event=store_view\` (QR 전용 기록 아님)
- 응답: \`from\`, \`to\`, \`metric=store_view\`, \`minimum_group_size=5\`, \`stores[].store_id\`, \`stores[].unique_qr_or_web_visitors\`, \`stores[].store_view_events\` (기존 코드의 필드명을 그대로 기재)
- 보호: 점포별 방문자 5명 미만 미노출, 공개 수치 5단위 내림, 5,000 이벤트 초과 시 부분집계 없이 실패; visitor_id·GPS·세션·쿠키·IP 반환 금지
- 오류: 400 잘못된 기간/필터, 401 인증 실패, 422 집계 상한 초과, 502 저장소 오류, 503 미활성/미설정

**예시 (가상 값, 현재 운영 결과가 아님):**

\`\`\`http
GET /api/v1/poc/store-aggregates?from=2026-11-09T00%3A00%3A00Z&to=2026-11-10T00%3A00%3A00Z
Authorization: Bearer <별도 보안채널로 수령한 전용 키>
Accept: application/json
\`\`\`

\`\`\`json
{
  "from": "2026-11-09T00:00:00.000Z",
  "to": "2026-11-10T00:00:00.000Z",
  "metric": "store_view",
  "minimum_group_size": 5,
  "stores": [
    {
      "store_id": "worldcup-market-01",
      "unique_qr_or_web_visitors": 10,
      "store_view_events": 15
    }
  ]
}
\`\`\`

현 PR 코드의 변수명: \`POC_AGGREGATE_API_ENABLED\`, \`POC_LOCATION_API_KEY\`, \`SUPABASE_URL\`, \`SUPABASE_SERVICE_ROLE_KEY\`. **키 값은 이 문서·채팅·Git에 기록하지 않음.** 두 서비스의 독립 키·접근 범위·교체 절차는 별도 합의. 현 K-Navi 프로젝트에 필요한 DB 연동 변수가 모두 설정됐다는 근거가 없음.

관련 코드 명세(미병합): [PR #202](https://github.com/pds2225/walk/pull/202), [집계 API 초안](https://github.com/pds2225/walk/blob/feat/poc-location-read-api-20261110/docs/poc-store-aggregates-api.md).

## 5. 개인 GPS API: 별도 동의 및 법적 검증 전 외부 제공 불가

PR #202에는 \`GET /api/aihows-consent\`, \`POST /api/aihows-consent\`, \`GET /api/v1/poc/aihows-location-records\`의 **개발 중 코드**가 있으나 모두 현재 운영 API로 확정·제공하지 않음.

외부 제공이 필요해지는 경우: 실제 수령 법인명·목적·항목·보유기간·철회·파기·통지 의무 확인, 선택적 제3자 제공 동의/감사기록 검증, 동의 후 데이터만 조회, 철회 즉시 차단, 실제 E2E를 선행. 위치정보 제공사실 통지 기능 미구현 및 법적 검토 미완료 시 외부 GPS 조회 기능을 활성화하지 않음. 기존 K-Navi 내부 지도·길찾기/GPS 테스트는 별개로 유지 가능.

## 6. 원천 데이터 반환·소유·인증

- 원본 \`public.events\` 및 \`qr_scans\`는 K-Navi DB에 보존하고, 파괴적 마이그레이션 금지.
- 계약서의 “PoC 원천데이터 권리 K-Navi 귀속 원칙”을 실무화하려면 **AI하우스가 자체 수집한 QR 원천/집계 데이터의 K-Navi 반환 형식·주기·권한·파기·반출 절차**를 별도 확정해야 함. 소유권 조항만으로 K-Navi DB에 자동 저장되는 것이 아님.
- 반환 가능 항목의 초안: \`market_id\`, \`store_id\`, \`qr_type\`, \`scan_at\`, \`metric_definition_version\`, 일별 점포 집계. 개별 방문자 식별자는 계약·법적 근거 확정 전 별도 반출 금지.
- 서버 간 연동에는 **HTTPS** 및 별도 Bearer 키, 키 교체, 호출 로그·최소 권한 적용. 외부 관리자 화면이 HTTP로 제공되는 사실과 API 인증 전송 보안은 별도 검증 필요. HTTP로 인증키 전송 금지.
- 미실측 값·임시 샘플·추정치·API 비활성 상태는 관제에 명확하게 구분 표시. 현 샘플 HTML은 목업 데이터임.

## 7. 연동 검수 기준 (운영 변경 전 게이트)

| 항목 | 검수방법 | 현재 판정 |
|---|---|---|
| 기존 월드컵시장 URL | 입구/점포 ID URL HTTP 및 모바일 화면 | HTML 응답 확인, 화면 E2E 미확인 |
| 실물 QR 호환 | AI하우스 인쇄 QR의 실제 링크/입구/점포 매핑 대조 | 미검증 |
| QR 7개 지표 | QR 서버 실데이터/중복 산식/15·60분 경계값 확인 | 협력사 실검증 필요 |
| 웹 조회 집계 API | PR 배포 후 503/401/400/422/200·응답 필드 검증 | Draft PR, 운영 미배포 |
| 개인정보 최소화 | 개인 GPS·방문자 ID 반환 차단, 시장 간 데이터 혼합 방지 | GPS 외부 제공 차단 유지 |
| 원천자료 반환 | AI하우스 데이터의 K-Navi 수령·대사·보존 확인 | 반환 계약 및 연동 미정 |
| 원본 서비스 회귀 | 지도·점포·QR·길찾기 유지 | 구조 변경 없음 / 배포 회귀 미실행 |

**상태 구분:** 위 항목이 완료되기 전에는 AI하우스 관제 UI가 있다는 사실만으로 K-Navi↔AI하우스 API 연동 완료라고 보고하지 않음.
