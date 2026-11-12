# K-Navi ↔ AI하우스 | 월드컵시장 PoC 연동 명세

- 문서일: 2026-11-12
- 문서 상태: **협력사 전달·협의용 명세 (실서비스 API 승인/배포 완료 아님)**
- 대상: K-Navi / K-Trip 망원동 월드컵시장 / AI하우스 Here Me·관제
- 보존 정책: 기존 방문객 화면, 인쇄 QR, 식별자, 원본 DB, 이용자 동의·철회 기능 유지. 운영 DB 파괴적 변경·미동의 개인 GPS 외부 제공 금지.
- 구현 SSOT: 저장소 루트 `TASK.md`. 이 문서는 외부 협력사와의 연동 계약·상태를 설명하며 구현 완료를 뜻하지 않음.

## 0. AI하우스 측 필수 제공 요청 — 이 문서만으로 요청 완료

**필수 연동 조건: AI하우스가 자체 구축한 QR 방문 기록 서버의 데이터를 K-Navi가 직접 조회할 수 있도록 읽기 전용 HTTPS API를 제공해 주십시오.** 관제 화면을 열람하는 권한이나 CSV 화면 다운로드만으로는 이 요구사항을 충족하지 않습니다.

K-Navi는 월드컵시장 이후 다른 시장까지 통합 관리하고, 방문객의 **QR 기반 점포 이동 순서와 인기 경로**를 자체적으로 분석·보존해야 합니다. AI하우스가 개발하는 대시보드를 중복 개발하지는 않지만, 데이터에 대한 지속적인 조회 권한과 재조회 가능한 규격은 필요합니다.

**제공 요청 범위(필수):**
1. **QR 방문·스캔 순서 조회 API** — 입구·점포 이벤트를 동일 방문 단위로 시간순 연결할 수 있는 기록(적법한 제공 범위에서). 제공할 수 없는 경우에는 최소 집계 기준을 갖춘 **점포 간 이동구간 통계 API**를 필수 대안으로 제공.
2. **점포 고정 위치·변경이력 조회 API** — 점포별 확정 좌표·측정 정확도·수정 시각 및 출처.
3. **일별 QR 통계 조회 API** — 관제 7개 지표의 산식·집계 기준·일별 결과·데이터 기준시각.

AI하우스는 위 3종의 **실제 HTTPS 기반 주소, API 인증·권한, 요청/응답 JSON 스키마, 샘플 응답(가상 데이터), 오류 코드, 데이터 조회·보존 가능 기간, 연동 테스트 방법**을 K-Navi 측에 문서로 회신해 주십시오. 아래 6A절은 **K-Navi가 요청하는 최소 API 계약안**이며, 현재 AI하우스 서버에 이 경로가 이미 구현되어 있다는 의미는 아닙니다.

**완료 판정:** 해당 조회 API에 대해 K-Navi 서버가 인증하여 실제 QR 기록과 점포 좌표를 조회하고, 동일 스캔의 중복 수집 없이 방문 순서/일별 통계를 재구성하고, 삭제·정정 및 재조회까지 검증한 때 연동 완료로 판단합니다. **GPS 개인기록 제공 API는 별도 의무가 아니며, 법적·동의 요건이 갖춰질 때까지 비활성화합니다.**

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
| 월드컵시장 입구 | `/worldcup-market?lang=ko` | 기존 화면 경로 |
| 점포 01 | `/worldcup-market?lang=ko&store=worldcup-market-01` | 기존 점포 ID 형식 |
| 기존 인쇄 QR | `/q/01` 등 | 기존 QR 동작 보존. AI하우스가 제작한 QR 실제 인코딩 주소는 인쇄 전에 별도 대조 |
| 방문객용 시장·점포 URL | `https://k-navi-eight.vercel.app/worldcup-market?lang=ko` | K-Navi Vercel 프로젝트의 현재 도메인 |

AI하우스 매뉴얼에는 `https://k-navi.vercel.app/worldcup-market?lang=ko` 사용이 기재되어 있으며, 2026-11-12 조회 시 양쪽 호스트의 월드컵시장 HTML은 응답함. **그러나 `k-navi.vercel.app`은 별도 `walk` Vercel 프로젝트에 연결되어 있음.** PoC 공식 호스트는 양측이 선택·확정하고, 기존 발행/인쇄 QR은 변경하지 않음. HTTP 200만으로 방문객 측 QR·선택점포 실제 화면 E2E가 완료되었다고 판단하지 않음.

실제 앱의 점포 ID는 `worldcup-market-01`처럼 2자리 이상 번호 문자열. 협력사 문서의 축약 표기 `worldcup-market-N`을 구현 시 그대로 대입하지 말고 K-Navi 원본 점포 ID와 1:1 대조할 것.

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

관제는 AI하우스가 운영하므로 K-Navi 측 신규 관제 대시보드 개발은 범위 밖. QR 서버의 ID·브라우저 쿠키와 K-Navi `ktrip_vid`는 자동으로 동일인이 아님. 무단 교차 식별·재식별 금지.

## 4. 선택 연동: K-Navi 점포별 익명 *웹 조회* 집계 API

이 기능은 `pds2225/walk`의 **Draft PR #202에 구현된 코드**이며 **현재 K-Navi 운영에 배포·활성화·인증키 발급·실데이터 E2E 미확인**. 지금 AI하우스에 “사용 가능한 운영 API”라고 안내하지 않음.

- 메서드: `GET`
- 예정 경로: `/api/v1/poc/store-aggregates`
- 인증: 서버 간 `Authorization: Bearer <별도 전달된 키>`
- 질의: `from`, `to` — 완료된 **UTC 날짜 1일(00:00~익일 00:00)**만 허용
- 원천: K-Navi `public.events` 중 `app=worldcup-market`, `event=store_view` (QR 전용 기록 아님)
- 응답: `from`, `to`, `metric=store_view`, `minimum_group_size=5`, `stores[].store_id`, `stores[].unique_qr_or_web_visitors`, `stores[].store_view_events` (기존 코드의 필드명을 그대로 기재)
- 보호: 점포별 방문자 5명 미만 미노출, 공개 수치 5단위 내림, 5,000 이벤트 초과 시 부분집계 없이 실패; visitor_id·GPS·세션·쿠키·IP 반환 금지
- 오류: 400 잘못된 기간/필터, 401 인증 실패, 422 집계 상한 초과, 502 저장소 오류, 503 미활성/미설정

**예시 (가상 값, 현재 운영 결과가 아님):**

```http
GET /api/v1/poc/store-aggregates?from=2026-11-09T00%3A00%3A00Z&to=2026-11-10T00%3A00%3A00Z
Authorization: Bearer <별도 보안채널로 수령한 전용 키>
Accept: application/json
```

```json
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
```

현 PR 코드의 변수명: `POC_AGGREGATE_API_ENABLED`, `POC_LOCATION_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. **키 값은 이 문서·채팅·Git에 기록하지 않음.** 두 서비스의 독립 키·접근 범위·교체 절차는 별도 합의. 현 K-Navi 프로젝트에 필요한 DB 연동 변수가 모두 설정됐다는 근거가 없음.

관련 코드 명세(미병합): [PR #202](https://github.com/pds2225/walk/pull/202), [집계 API 초안](https://github.com/pds2225/walk/blob/feat/poc-location-read-api-20261110/docs/poc-store-aggregates-api.md).

## 5. 개인 GPS API: 별도 동의 및 법적 검증 전 외부 제공 불가

PR #202에는 `GET /api/aihows-consent`, `POST /api/aihows-consent`, `GET /api/v1/poc/aihows-location-records`의 **개발 중 코드**가 있으나 모두 현재 운영 API로 확정·제공하지 않음.

외부 제공이 필요해지는 경우: 실제 수령 법인명·목적·항목·보유기간·철회·파기·통지 의무 확인, 선택적 제3자 제공 동의/감사기록 검증, 동의 후 데이터만 조회, 철회 즉시 차단, 실제 E2E를 선행. 위치정보 제공사실 통지 기능 미구현 및 법적 검토 미완료 시 외부 GPS 조회 기능을 활성화하지 않음. 기존 K-Navi 내부 지도·길찾기/GPS 테스트는 별개로 유지 가능.

## 6. 원천 데이터 반환·소유·인증

- K-Navi에 이미 보관 중인 `public.events` 및 `qr_scans`는 그대로 유지하며 파괴적 마이그레이션을 하지 않음.
- 협력 개발계획서의 “PoC 관련 원천데이터 권리 K-Navi 귀속 원칙”을 실제 운영에서 이행하려면, **AI하우스 자체 QR 서버의 원천·집계 데이터에 K-Navi가 지속적으로 접근하고 조회·백업할 수 있어야 함.** 권리 귀속·제공 범위·보유기간은 최종 계약서에서 확정.
- AI하우스의 QR 방문기록과 K-Navi의 웹 조회기록은 별개. 두 시스템의 방문 식별자를 임의 병합하거나 개인별 GPS와 무단 결합하지 않음.
- 서버 간 인증은 **HTTPS + 개별 발급된 읽기 전용 Bearer 키**(또는 이에 준하는 서버 간 인증). 접근 대상 시장 제한, 키 폐기·교체, 조회 감사로그, 최소 권한 적용. **HTTP로 인증키/QR 방문기록 전송 금지.**
- 기존 점포·QR 코드·시장 경로를 변경하지 않고 응답에 안정적인 `market_id`·`store_id`를 포함.
- 샘플 HTML·임시 데이터와 실제 운영 데이터를 혼동하지 않음.

## 6A. AI하우스 → K-Navi 필수 조회 API 규격 (제안 계약 / AI하우스 회신 필요)

**중요:** 아래 `/api/v1/partners/k-navi/...` 경로는 **AI하우스에 요청하는 명세 예시**이며, 제공사 실제 API 엔드포인트가 아닙니다. AI하우스는 실제 제공 경로 및 스키마의 호환 여부를 문서로 확정해 회신해 주십시오.

### A. QR 스캔 원천 및 이동 순서 조회 — 필수

```http
GET {AIHOUSE_HTTPS_BASE_URL}/api/v1/partners/k-navi/qr-events?market_id=worldcup-market&from=2026-11-10T00%3A00%3A00Z&to=2026-11-11T00%3A00%3A00Z&limit=100
Authorization: Bearer <별도 보안채널에서 발급한 조회 전용 키>
Accept: application/json
```

**필수 필드:** `scan_id`(중복 방지 고유 ID), `market_id`, `qr_type`(`entrance`/`store`), `store_id`(입구인 경우 null), `scanned_at`(ISO 8601 UTC), `visit_id`(동일 방문의 이벤트 연결용 비예측 임시 식별자), `sequence_no`(방문 내 순서), `updated_at`(정정 반영 기준). 응답에는 `next_cursor`(다음 페이지; 마지막은 null) 포함. 정정·삭제 시 해당 이벤트를 식별해 반영할 수 있는 메커니즘 제공.

**가상 응답 예시 — 실제 방문 기록 아님:**

```json
{
  "items": [
    {
      "scan_id": "example-scan-001",
      "market_id": "worldcup-market",
      "qr_type": "entrance",
      "store_id": null,
      "scanned_at": "2026-11-10T01:00:00Z",
      "visit_id": "example-visit-001",
      "sequence_no": 1,
      "updated_at": "2026-11-10T01:00:00Z"
    },
    {
      "scan_id": "example-scan-002",
      "market_id": "worldcup-market",
      "qr_type": "store",
      "store_id": "worldcup-market-01",
      "scanned_at": "2026-11-10T01:07:00Z",
      "visit_id": "example-visit-001",
      "sequence_no": 2,
      "updated_at": "2026-11-10T01:07:00Z"
    }
  ],
  "next_cursor": null
}
```

- `visit_id`는 실명·전화·기기 ID·IP와 무관하고 시장·방문 단위로 제한되는 난수 식별자를 요청. 다만 이런 ID와 방문 시각·순서의 조합도 개인정보에 해당할 수 있어 **제공 목적·법적 근거·최소화·보유기간·접근권한 검토를 먼저 완료해야 함**.
- 법적 근거가 확인되기 전에는 위 **방문별 이벤트 반환을 금지**하며, 바로 아래 대체 API로 **점포 간 익명 집계 경로**만 제공하는 방식을 필수 대안으로 검토.
- K-Navi 쿠키 `ktrip_vid`와 AI하우스 `visit_id`는 서로 다른 값이며, 사용자의 별도 적법한 근거 없이 동일인 매핑을 하지 않음.

**개별 방문 순서 조회를 제공할 수 없는 경우 필수 대체:**

```http
GET {AIHOUSE_HTTPS_BASE_URL}/api/v1/partners/k-navi/route-aggregates?market_id=worldcup-market&from=2026-11-10T00%3A00%3A00Z&to=2026-11-11T00%3A00%3A00Z
Authorization: Bearer <별도 조회 전용 키>
```

필수 반환: `market_id`, `from_store_id`(입구 가능), `to_store_id`, `transition_count`, `period_start`, `period_end`, `aggregation_method`, `minimum_group_size`. 소규모 집단 노출 방지(예: 5건 미만 비공개)를 적용하고 중복 방문 계산 기준을 명시. 이는 **QR 체크인 사이의 이동 추정**이며 실제 연속 GPS 동선이 아님.

### B. 점포 좌표 및 정정 이력 조회 — 필수

```http
GET {AIHOUSE_HTTPS_BASE_URL}/api/v1/partners/k-navi/stores?market_id=worldcup-market&updated_since=2026-11-10T00%3A00%3A00Z&limit=100
Authorization: Bearer <별도 조회 전용 키>
```

필수 필드: `market_id`, `store_id`, `lat`, `lng`, `accuracy_m`(측정 정확도), `coordinate_source`(`app_measurement` 또는 `admin_correction` 등), `measured_at`, `updated_at`, `verification_status`(미측정/현장미확인/확인 등), `next_cursor`. 좌표가 확인되지 않은 점포는 null로 반환하고 가짜 좌표를 만들지 않음. 수정 전·후 이력과 변경 시각 조회 방법을 제공하고 관제 보정이 실제 서버에 저장되는지 실데이터로 검증.

### C. QR 일별 통계 조회 — 필수

```http
GET {AIHOUSE_HTTPS_BASE_URL}/api/v1/partners/k-navi/daily-stats?market_id=worldcup-market&date=2026-11-10
Authorization: Bearer <별도 조회 전용 키>
```

필수 반환: `market_id`, `date`, `timezone`(집계 기준 시간대), `unique_entrance_visitors`, `scan_count`, `store_visitors`(점포별 `store_id`·중복제외·스캔건수), `visit_count`, `estimated_dwell_minutes`(측정 불가 시 null), `calculation_version`, `data_as_of`. 집계 수치의 **QR 기반 실측/추정 여부**, 무방문, 재방문, 시간 경계, 동일 스캔 중복 제거 산식 공개. 방문당 점포 수·QR 이동 순위는 위 A의 합법적 원천 또는 익명 이동집계에서 도출 가능해야 함.

### 공통 운용·납품 기준

1. **연동 정보 회신(필수):** 실제 HTTPS `base_url`, 3종 엔드포인트/메서드, 인증 발급·회전 방법(키 값은 공개 문서·메신저 금지), 요청 제한, 샘플 JSON, 오류 응답, 운영 담당자, 테스트 가능 날짜를 문서로 제공.
2. **증분 조회:** `from/to` 또는 `updated_since`와 `cursor` 기반 페이징, 동일 `scan_id` 재수신 시 중복 저장되지 않는 멱등성(idempotency), 누락 복구를 위한 재조회·과거 데이터 제공 범위 협의.
3. **운영 상태:** 실측값·추정값·테스트 샘플 구분, `data_as_of` 표시. 응답 상태는 최소 200 정상, 400 잘못된 필터, 401 인증 실패, 403 접근 범위 초과, 429 제한 초과, 5xx 서버 장애 구분.
4. **개인정보:** 필요 이상의 식별자·원시 GPS·IP·전화번호를 반환하지 않음. 방문별 데이터 반출은 적법성 검토 전 비활성 유지. 계약상 이용 목적·접근 범위·권리·보관·파기·재제공 제한 확정.
5. **검수:** K-Navi 측에서 실제 데이터로 입구→점포 A→점포 B 순서 복원(개인별 기록이 허용되는 경우), 대체 집계 API로 A→B 경로 빈도 조회, 점포 좌표 갱신 이력 검증, 일별 관제 지표 대사, 중복·정정·오류 재처리 확인.
6. **납품 완료 조건:** API 명세만 전달하거나 관제 페이지가 열린 상태는 완료가 아니며, K-Navi의 서버 간 읽기 권한·실데이터 조회·재조회·집계 검증이 통과해야 AI하우스 → K-Navi 연동 완료로 판정.

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
