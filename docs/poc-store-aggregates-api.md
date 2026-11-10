# K-Navi → 외부 PoC: 점포별 익명 집계 API 연동 명세

상태: 구현 및 CI 검증 대상. 운영 인증키 발급·실제 DB 호출 성공 전에는 **실사용 가능으로 표기하지 않음**.

## 제공 범위
- GET `/api/v1/poc/store-aggregates`
- 원본 데이터는 K-Navi Supabase `public.events`에 유지. 읽기 전용 조회.
- `app=worldcup-market`, `event=store_view`의 점포별 고유 브라우저 방문자 수와 화면 방문 이벤트 수를 제공.
- 방문객 ID는 서버 내부 중복 계산에만 사용하며 외부 응답에 포함하지 않음. GPS 좌표·정밀 이동 궤적·개별 세션·쿠키·IP는 제공하지 않음.
- 방문객이 5명 미만인 점포는 결과에서 제외. 노출 숫자는 5단위 절사. **완료된 UTC 날짜 단위**만 조회하여 시간대별 차분 공격을 줄임.
- 이는 웹 이벤트 기반 통계이며 실제 입장 인원, 실측 체류, 위치 동선, QR만의 유입 수를 의미하지 않음.

## 연동 요청
```http
GET /api/v1/poc/store-aggregates?from=2026-11-09T00%3A00%3A00Z&to=2026-11-10T00%3A00%3A00Z HTTP/1.1
Host: <K-Navi 운영 도메인>
Authorization: Bearer <별도 보안채널로 전달받은 API 키>
Accept: application/json
```

성공 예시(가상 값이며 실측 데이터가 아님):
```json
{
  "from": "2026-11-09T00:00:00.000Z",
  "to": "2026-11-10T00:00:00.000Z",
  "metric": "store_view",
  "minimum_group_size": 5,
  "stores": [
    { "store_id": "worldcup-market-01", "unique_qr_or_web_visitors": 10, "store_view_events": 15 }
  ]
}
```

응답: 200 성공, 400 날짜·필터 오류, 401 인증 실패, 422 조회 이벤트 5,000건 초과, 502 저장소 오류, 503 API 비활성 또는 설정 미완료. 모든 응답은 캐시 금지.

## 운영 설정 (K-Navi 측)
- `POC_AGGREGATE_API_ENABLED=true` (집계 API만 활성화)
- `POC_LOCATION_API_KEY`: 충분히 긴 난수 인증키. Git·문서·대화에 기재하지 않음. 상대방에게 별도 보안채널로 전달.
- 기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 운영 프로젝트에 설정되어 있어야 함.
- 개인별 GPS 조회 API는 **제공하지 않음**. `POC_LOCATION_API_ENABLED` 설정 금지.
- PR 병합/운영 배포 후 ① 미인증 401 ② 인증 200 ③ 저장소 이벤트 실조회 ④ 기존 시장 모바일웹 smoke를 확인.

## 제공·이용 조건
- 외부 업체에 전달되는 것은 점포별 최소 인원 기준의 집계 결과에 한정.
- K-Navi 원본 DB와 데이터 관리권은 K-Navi에 유지.
- 재식별, 타 데이터와 결합한 개인 추적, 원본 좌표 요구 및 제3자 재제공 금지.
- 실제 제3자 제공/위탁의 법적 성격과 처리방침 반영 필요성은 운영자 검토 대상. 집계값만이라는 이유로 자동 법적 면제가 보장되는 것은 아님.
- 키 유출 시 즉시 교체하고 접근 차단.
