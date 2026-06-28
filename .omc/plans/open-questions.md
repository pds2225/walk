# Open Questions

## 출발지 "현재 위치" 주소 표시(POI 포함)+우편번호 제거 - 2026-06-28
- [ ] 사용자 클라우드(Streamlit Cloud) 배포에 Naver 키가 st.secrets로 들어가 있는가? — 결과 형식이 Naver 공백형(POI 없음)인지 Nominatim 쉼표형(POI 포함)인지를 결정. "POI 형식" 충족 가능성 자체가 여기에 달림. (키 값은 출력 금지, 존재 여부 bool만)
- [x] (정정·해소됨) "공유 `reverse_geocode()` 소스에 적용하면 목적지·히스토리까지 영향"은 **사실 오류**였음. 코드상 `reverse_geocode`는 출발지 표시 전용 단일 호출자(`1_Navigation.py:1097`→`_reverse_geocode_cached:751`→`route_builder.py:266`)이고 목적지/히스토리는 `geocode_address`/`geocode_suggestions` 별개 함수라 영향 없음. → 계획은 "저장 직전 1회 strip(Interpretation A)"으로 위치 고정해 해소.
- [ ] POI 표시가 필수(hard)인가 best-effort인가? — Nominatim도 임의 좌표에 POI를 보장 못 함. 필수면 POI 검색으로 범위 확대(=PR#8 충돌 영역) 위험.
- [ ] 우편번호 제거 후 주소가 빈 문자열이 되면 무엇을 표시? — 좌표 폴백 권장(빈 `📍 ` 방지).
- [ ] 현재 ">100m 이동 + ttl=600" 갱신 정책 유지 vs 첫 GPS fix에서 즉시 주소 해석? — "주소가 안 보임" 증상에 독립적으로 기여 가능.
- [~] (권고 재도출) 표시 형식: Architect synthesis(**provider-agnostic 정규화** — 항상 strip_postcode, reorder 없음)를 기본 채택. 옵션 A/B/C는 비교표로 보존. → 환경(키 유무) 분기를 코드가 흡수하므로 "옵션 고르기" 부담 소멸. 단 H1(주소 미충전)이면 Step 4 필수.
- [ ] R3 escalation 승인: 클라우드 키 없음 + Nominatim 차단 시 st.secrets에 Naver 키 주입(이미 머지된 d17c67d 경로)으로 escalation — 배포 설정 작업이라 사용자/운영 승인 필요(키 값 출력 금지).
