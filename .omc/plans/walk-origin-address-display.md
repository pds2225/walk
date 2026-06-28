# Plan: 출발지 "현재 위치"를 좌표 대신 주소(POI 포함, 우편번호 제거)로 표시

상태: 계획만 (PENDING APPROVAL) — 구현·커밋·push 없음
대상 앱: walk / streamlit_walk_engine (보행 경로 이탈 감지 + Streamlit 내비)
작성 기준 코드: origin/main (로컬 D:\walk는 PR #22/#23 미반영 구버전이므로 origin/main 기준으로만 분석)
포맷: RALPLAN-DR (SHORT 모드)

---

## 0. 요구사항 (사용자)

1. 출발지 입력 영역의 "현재 위치" 표시가 지금은 좌표(`📍 37.50120, 127.03724`)로 나온다. 이를 역지오코딩 **주소**로 보이게 한다.
   - 원하는 형식 예시: `📍 No Brand Burger, 테헤란로, 역삼1동, 강남구, 서울특별시, 대한민국`
   - = Nominatim `display_name` 스타일, **POI명 포함**, 쉼표 구분.
2. 그 주소에서 **우편번호(예 06141)는 제거**한다.

---

## 1. 확인된 현재 동작 (origin/main, 코드 근거)

`streamlit_walk_engine/route_builder.py`
- `reverse_geocode(coord)` (266-281): `_naver_reverse(coord)`를 **먼저** 시도 → None 아니면 그대로 반환. 실패 시에만 Nominatim reverse 호출. Nominatim 호출 파라미터는 `{lat, lon, format:json}` (addressdetails 없음) → `data.get("display_name")` 반환. 이 `display_name`은 **쉼표 구분 + POI명 포함 + 5자리 우편번호 포함** 문자열(사용자 예시와 동일 스타일이되 우편번호가 끼어 있음). Nominatim 경로에는 `resp.raise_for_status()`가 있어 403/429 시 **예외 발생**.
- `_naver_reverse(coord)` (230-261): region area1~4 + 도로명 + 건물번호를 **공백 구분**으로 이어붙임. **POI명 없음, 우편번호 없음** (예: `서울특별시 강남구 역삼동 테헤란로 152`). 형식이 사용자 예시와 다름.
- `_naver_headers()` (53-85): NCP 키를 환경변수 → `st.secrets` → `D:\_secure\.env.shared` 순으로 로드. 키 없으면 None → `_naver_reverse`가 None → Nominatim 폴백.

`streamlit_walk_engine/pages/1_Navigation.py`
- `_reverse_geocode_cached(lat, lon)` (749-751): `@st.cache_data(ttl=600)` 래퍼.
- main() "현재 위치" 섹션 (1092-1106): origin이 있고 캐시 좌표에서 100m 초과 이동 시에만 `_reverse_geocode_cached(round(lat,5), round(lon,5))` 호출 → 결과를 `nav_origin_address` / `nav_origin_address_coord`에 저장. **이 호출은 `try/except Exception: pass`로 감싸짐(1096-1101)** → Nominatim 예외가 조용히 삼켜져 `nav_origin_address`가 미설정으로 남을 수 있음. 표시: addr 있으면 `st.success(f"📍 {addr}")`, 없으면 `st.caption(f"📍 {lat:.5f}, {lon:.5f}")` 좌표 폴백.
- `_sidebar_destination()` (760-794): `cur_hint` = `nav_origin_address`(주소) 있으면 주소, 없으면 `f"{lat:.5f}, {lon:.5f}"` 좌표 폴백, 둘 다 없으면 "현재 위치 취득 중…". `cur_hint`는 text_input placeholder와 `📍 현재 위치를 출발지로 사용: {cur_hint}` 캡션 **양쪽**에 쓰임. 두 곳 모두 같은 `nav_origin_address`를 읽으므로, 소스에 저장되는 주소를 바로잡으면 양쪽이 자동으로 같이 고쳐짐.

핵심 결론(2가지 별개 문제):
- (A) **표시 자체가 안 됨**: 화면에 주소가 아니라 좌표만 보인다면, 형식 문제 이전에 `nav_origin_address`가 애초에 채워지지 않는 것이 원인일 가능성이 큼.
- (B) **형식 불일치**: Naver 키가 동작하면 주소가 채워지더라도 공백 구분·POI 없음 형식이라 사용자 예시(쉼표·POI 포함)와 다름. + Nominatim 경로일 때는 우편번호가 포함됨.

---

## 2. Principles (3-5)

1. **진단 우선, 구현 나중**: "좌표만 보인다"의 원인(주소 미설정 vs 형식 불일치)을 먼저 증거로 확정한 뒤에만 형식·우편번호 작업을 진행한다.
2. **코어 비침습 + 최소 변경**: `engine.py` 코어와 안전기능(accuracy 게이팅·is_fix_usable·도착판정·재경로)은 절대 건드리지 않는다. 변경은 표시·포맷 레이어에 가둔다.
3. **순수함수 + 단위테스트**: 우편번호 제거·표시 포맷팅은 네트워크 없이 테스트 가능한 순수함수로 분리한다(기존 test_route_builder.py 패턴 재사용).
4. **좌표 폴백 불가침**: 주소가 없을 때의 `{lat:.5f}, {lon:.5f}` 폴백 문자열은 절대 변형하지 않는다(우편번호 정규식이 좌표 토큰을 건드리면 안 됨).
5. **클라우드/로컬 차이 명시**: 로컬(Naver 키 있음→공백·POI없음)과 사용자 클라우드(키 없을 수 있음→Nominatim·POI·우편번호)에서 결과가 다를 수 있음을 전제로 두고, 클라우드에서만 확인 가능한 항목을 분리 표기한다.

---

## 3. Decision Drivers (top 3)

1. **사용자가 원하는 형식 = Nominatim display_name(POI 포함) 스타일.** 그런데 현재는 Naver-first라 키가 있으면 그 형식이 절대 안 나온다. → "어느 소스/형식으로 표시할지"가 가장 큰 결정.
2. **변경 폭(blast radius) — 정정됨.** `reverse_geocode()`는 **출발지 표시 전용으로 격리된 단일 호출자 체인**이다(`1_Navigation.py:1097` → `_reverse_geocode_cached :751` → `route_builder.py:266`). 목적지 지오코딩·검색 히스토리는 **별개 함수**(`geocode_address`·`geocode_suggestions`, 호출 위치 `1_Navigation.py:646/647/691/692/1157`)라 영향받지 않는다. → 소스에서 우편번호 제거/표시 정규화를 해도 blast radius는 **출발지 캡션 한정**. (이전 버전은 "목적지·히스토리와 공유"라고 잘못 서술 → Principle #1(증거기반 진단)에 위배되어 코드 근거로 정정.)
3. **검증 가능성.** 우편번호 제거·포맷은 로컬 pytest로 100% 검증 가능하지만, "실제 화면에 POI 주소가 뜬다"는 사용자 클라우드(모바일·st.secrets 키 유무)에서만 확정 가능.

---

## 4. 원인 진단 계획 (구현 전 필수 — 경쟁 가설) — ★ HARD GATE

> 구현 코드 작성 없이, 아래를 먼저 확인한다(Step 1 = Step 2~5의 차단 선행조건). H1(주소 미충전)이면 형식/우편번호 작업만으로 사용자 증상이 안 고쳐지므로, H1 경로 처리(Step 4)가 필수 deliverable로 승격된다. 가설별 검증 방법 포함.

| # | 가설 | 검증 방법 | 비고 |
|---|------|----------|------|
| H1 | Nominatim reverse가 클라우드 IP에서 403/429 → `raise_for_status()` 예외 → 1096-1101 `try/except`가 삼킴 → `nav_origin_address` 미설정 → 좌표만 표시 | 로컬에서 `python -c "from route_builder import reverse_geocode, ...; print(reverse_geocode(Coordinate(...)))"` 직접 호출 / 클라우드는 Streamlit 로그(있으면) 확인. Nominatim 경로만 강제하려면 `_naver_headers`가 None을 반환하는 상태에서 테스트 | **가장 유력한 "표시 안 됨" 원인** |
| H2 | Naver reverse는 동작하나(키 있음) 형식이 공백·POI없음이라 사용자가 "원하는 주소가 아님"으로 인식 | 로컬(키 있음)에서 `reverse_geocode` 호출 → 공백 구분 문자열 확인 | 로컬에서 재현됨 |
| H3 | 클라우드 st.secrets에 Naver 키 없음 → Nominatim 경로 → 정상 동작 시 POI·우편번호 포함 주소가 나와야 함. 그런데 안 보이면 H1로 귀결 | `_naver_headers()`가 클라우드에서 키를 찾는지(=secrets 설정 여부) 확인. **키 값 자체는 출력 금지**, 존재 여부(bool)만 확인 | Secret 출력 금지 |
| H4 | 100m 이동 게이팅(1095) + ttl=600 캐시로 첫 fix에서 주소가 안 갱신됨 → 한동안 좌표만 | 코드상 첫 진입 시 `cached_coord is None`이면 호출되므로 1회는 시도됨. 모바일 GPS 지터로 round(lat,5) 캐시키가 매번 바뀌면 과호출 가능성도 점검 | 부차 가설 |

진단 산출물: 위 표의 각 가설에 대해 "재현됨/배제됨" 판정 + 근거 1줄. (실기기/클라우드 의존 항목은 "사용자 확인 필요"로 표기)

---

## 5. Viable Options — 표시 소스/형식 결정 (사용자 선택 필요)

> 모든 옵션 공통: 우편번호 제거는 순수함수로 분리하고, 좌표 폴백 문자열은 건드리지 않는다.

### 옵션 A — Nominatim 우선으로 표시 형식 통일 (사용자 예시에 가장 부합)
- 방식: 출발지 표시용 주소는 Nominatim display_name(POI 포함, 우편번호 제거) 형식으로 맞춘다. (소스 reorder가 아니라, 표시 레이어에서 Nominatim 결과를 우선 사용하거나, reverse 함수에 "표시용 포맷" 옵션을 추가하는 방식 중 택1 — 결정은 설계 단계에서.)
- Pros: 사용자 예시(쉼표·POI)와 정확히 일치. 우편번호만 빼면 끝.
- Cons: Nominatim은 클라우드 공유 IP에서 403/429·rate-limit 위험(H1) → "POI 주소가 안정적으로 뜬다" 보장 약함. POI는 좌표에 POI가 있을 때만 나옴(중간 도로면 POI 없음 — best-effort). Naver의 한국 정확도 이점을 표시에서 포기.

### 옵션 B — 현재 reverse 결과 그대로 두고 "우편번호만 제거" (형식은 소스대로) [최소 변경]
- 방식: `reverse_geocode`가 무엇을 반환하든(Naver 공백형 or Nominatim 쉼표형) 표시 직전에 우편번호만 제거. 소스/형식은 안 바꿈.
- Pros: 변경 폭 최소, 안전기능·목적지·히스토리 영향 적음(표시 전용으로 한정 가능). pytest로 100% 검증.
- Cons: Naver 키가 동작하는 환경에서는 **POI가 안 나옴** → 사용자 예시 형식과 다름(요구사항 1번 "POI 포함" 부분 미충족 가능). 환경에 따라 형식이 달라짐(로컬≠클라우드).

### 옵션 C — Naver 결과를 POI 포함 형식으로 보강
- 방식: Naver reverse 결과에 POI(장소명)를 덧붙여 쉼표 형식으로 재구성.
- Pros: 한국 주소 정확도(Naver) 유지 + POI 표시.
- Cons: Naver reverse 응답에는 POI명이 없음 → POI를 얻으려면 별도 POI 검색(Naver/TMAP POI) 필요 → **PR #8을 BLOCK시킨 TMAP POI 영역과 충돌 위험**(project memory: route_builder/Navigation 안전기능 의미충돌, 자동병합 금지). 범위·위험 큼. 권장하지 않음.

### 권장 — Architect synthesis: provider-agnostic 표시 정규화 (채택)

> 정정 사항(5번 Driver #2)으로 옵션 B의 "디폴트" 근거였던 *소스 변경 위험*이 사라졌다(`reverse_geocode`는 출발지 표시 전용 단일 호출자라 소스에서 바꿔도 출발지 캡션만 영향). 따라서 위 A/B/C를 그대로 권고하지 않고, **provider에 무관한 표시 정규화**를 기본으로 채택한다:
>
> (a) `reverse_geocode` 결과가 무엇이든 **항상 `strip_postcode` 적용**.
> (b) 결과가 **Naver 공백형이면 그대로 수용** — POI는 없지만 한국 주소 신뢰도가 높음.
> (c) 결과가 **Nominatim 쉼표형이면 사용자 선호 형식(POI 포함)이 자연 출현** — 우편번호만 제거됨.
> (d) **provider reorder(Naver-first → Nominatim-first)는 하지 않는다** — 한국 정확도 회귀 위험 + 불필요(선호 형식은 키 없는 환경에서 이미 Nominatim 경로로 나옴).
>
> 즉 코드 한 곳에서 정규화하면 환경(키 유무)에 따라 자동으로 최선의 형식이 나오며, 어느 옵션을 "고르는" 결정 부담 자체가 사라진다.

옵션 A/B/C는 아래 비교표로 보존하되, **권고는 synthesis**다.

| 옵션 | 방식 | Pros | Cons / 권고 |
|------|------|------|-------------|
| A | Nominatim 우선으로 표시 형식 통일(표시 레이어에서 Nominatim 우선 사용 or reverse에 표시용 포맷 인자) | 사용자 예시(쉼표·POI)와 정확히 일치 | Nominatim 클라우드 403/429 위험(H1)·POI는 좌표에 있을 때만(best-effort)·Naver 한국 정확도 표시에서 포기 |
| B | reverse 결과 그대로 + 우편번호만 제거(형식 소스대로) | 변경 폭 최소 | Naver 키 동작 시 POI 없음→예시 형식과 다름. (소스 변경 위험은 정정으로 소멸) |
| C | Naver 결과에 POI 보강 | 한국 정확도 + POI | Naver reverse엔 POI 없음→별도 POI 검색 필요→**PR #8 BLOCK된 TMAP POI 영역과 충돌**. 권장하지 않음 |
| **★ synthesis** | **provider-agnostic 정규화(항상 strip_postcode, reorder 없음)** | **환경별 자동 최선 형식·결정 부담 0·소스 단일점 정규화** | POI는 여전히 best-effort(키 있는 환경은 POI 없는 공백형 수용) |

> 단일 옵션으로 좁히지 않은 이유: 형식 요구(POI 포함)는 "사용자 클라우드에 Naver 키가 있는가"(H3)에 달려 있고, synthesis는 그 분기를 코드에서 흡수하므로 진단 전에도 안전하게 채택 가능. 단, H1(주소 자체 미충전, 4번·Step 1 참조)이 참이면 형식 작업만으로는 증상이 안 고쳐지므로 진단이 선행조건이다.

---

## 6. 단계별 구현 계획 (파일·함수 단위, 구현 코드는 작성하지 않음)

> 작업 브랜치에서 진행. main 직접 push 금지.

### Step 0 — 최신 코드에서 분기 (필수 주의)
- 로컬 `D:\walk`는 PR #22/#23 미반영 **구버전**이라 라인 번호·일부 함수가 이 계획(origin/main 기준)과 불일치한다. 실제 작업은 **origin/main에서 브랜치를 분기**해 시작한다(`git -C D:\walk fetch origin main` 후 origin/main 기준 작업 브랜치 생성).
- 이 계획의 모든 라인 번호(`:1097`, `:266` 등)는 origin/main 기준이다.

### Step 1 — 원인 진단 (코드 변경 없음) — ★ HARD GATE: Step 2~5의 차단 선행조건
- 4번 표의 H1~H4를 로컬에서 검증: `route_builder.reverse_geocode`를 강남 좌표로 직접 호출(Naver 키 있음/없음 두 상태), 반환 형식·예외 여부 기록.
  - H2 로컬 강제 방법: `_naver_headers`를 None 반환으로 monkeypatch → Nominatim 경로 강제(기존 `test_route_builder.py` monkeypatch 패턴 재사용). `_naver_headers()` 존재 여부(bool)만 확인(키 값 출력 금지).
- 산출: 가설별 판정 + 사용자 환경(클라우드 키 유무)에 대한 "사용자 확인 필요" 목록.
- **게이트 규칙(필수)**: 진단으로 1차 원인을 H1 vs H2로 확정하기 전에는 Step 2~5(형식·우편번호 코드 작업)를 시작하지 않는다.
  - **H1이 원인이면**(클라우드 Nominatim 403/429 예외를 `1_Navigation.py:1096-1101`의 `try/except: pass`가 삼켜 `nav_origin_address=None` → 좌표만 표시): 우편번호/형식 작업만으로는 **사용자 증상이 안 고쳐진다**. → Step 4(예외 표면화/처리)가 **필수 deliverable**가 된다.
  - **H2가 원인이면**(주소는 채워지나 형식이 사용자 예시와 다름): Step 2~3(정규화)이 핵심 deliverable.
- 수용 기준: "좌표만 보임"의 1차 원인이 H1인지 H2인지 증거로 확정되고, 그에 따라 Step 4 필수/선택 여부가 결정됨.

### Step 2 — 우편번호 제거 순수함수 추가 (route_builder.py)
- 위치: `route_builder.py`에 `strip_postcode(address: str) -> str`(또는 별도 util) 신규. 코어 `engine.py` 미접촉.
- 동작(타이트화): **쉼표 경계 5자리 우편번호만 제거.**
  - Nominatim 쉼표형: `, 06141,` 같이 **쉼표로 둘러싸인 단독 5자리 세그먼트**만 제거 + dangling 쉼표/공백 정리. (예: `"A, 06141, B"` → `"A, B"`)
  - **공백형 `\b\d{5}\b` 분기는 제거한다.** 근거: `_naver_reverse`(`route_builder.py:230-261`)는 area1~4 + 도로명 + 건물번호만 만들고 **우편번호를 출력하지 않는다**. 공백형 5자리 제거는 건물번호(예: 5자리가 될 수 있는 번지/우편 외 숫자) 오삭제 위험만 남고 이득이 없다.
  - 입력이 None/빈 문자열이면 그대로 반환(빈 `📍 ` 방지). 멱등성 보장(우편번호 0개여도 안전).
- 수용 기준(추가): "쉼표로 둘러싸이지 않은 5자리 토큰은 **보존**" 케이스 포함(예: 공백형 문자열 내 임의 5자리, 좌표성 토큰 등은 안 건드림). 단위테스트 통과(아래 검증 계획 참조).

### Step 3 — 표시 적용 (pages/1_Navigation.py) — Interpretation A 고정
- **적용 위치(고정)**: main() "현재 위치" 섹션(`1092-1106`)에서 **`nav_origin_address`에 저장하기 직전 1회** `strip_postcode(addr)` 적용. `_sidebar_destination`과 현재위치 캡션은 **같은 `nav_origin_address` 값을 읽으므로 자동 전파**된다(두 곳에 중복 적용하지 않음).
  - (정정으로 단순화) `reverse_geocode`는 출발지 표시 전용 단일 호출자라, 소스(`reverse_geocode`)에서 정규화해도 blast radius는 출발지 캡션 한정이다. 다만 본 계획은 **저장 직전 1회 적용(Interpretation A)** 을 기본 위치로 고정해 변경점을 한 곳으로 못박는다.
- **provider reorder 없음**(synthesis 권고): Naver 공백형이면 그대로 수용(POI 없음·신뢰), Nominatim 쉼표형이면 POI 포함 선호 형식이 자연 출현. reverse 함수의 provider 우선순위는 건드리지 않는다.
- 좌표 폴백 분기(`st.caption(f"📍 {lat:.5f}, {lon:.5f}")`, `1106` / `_sidebar_destination :768`)는 **변경 금지** — `strip_postcode`에 좌표 문자열을 넘기지 않는다.
- 수용 기준: addr 있을 때 우편번호 없는 주소가 `📍`로 표시(POI는 best-effort — 중도 도로상이면 POI 없을 수 있음, 9번 R2). addr 없을 때 좌표 폴백 동작 불변.

### Step 4 — H1 경로 처리 (H1이 원인이면 필수 deliverable / 아니면 생략)
- **H1 확정 시 필수**: `1_Navigation.py:1096-1101`의 `except Exception: pass`가 주소 미충전(=좌표만 표시)을 숨기는 문제를 처리한다. 처리 방향은 "표시·안전기능에 영향 없는 선"에서 설계 단계에 1개 택1(예: 예외 종류/메시지를 표면화해 진단 가능하게, 또는 실패 시 명시적 폴백 경로 보강). 좌표 폴백 자체는 이미 동작하므로 기능 회귀 없음.
- (참고) H1이 R3 상황(클라우드 키 없음 + Nominatim 차단)으로 귀결되면 코드 형식 수정 범위를 넘어선다 → 9번 R3의 escalation(키 주입)으로 처리.
- H4가 참이면 첫 fix 시 1회 시도되는지 재확인(코드상 `cached_coord is None`이면 호출됨).
- 안전기능(게이팅·재경로) 미접촉 원칙 유지. 변경 최소.
- 수용 기준: 추가 변경이 안전기능·기존 테스트에 회귀 없음. (H2만 원인이면 이 Step은 생략 가능)

### Step 5 — 검증 + PR
- 아래 검증 계획 전부 수행 → 작업 브랜치 커밋 → PR 생성(설명에 진단 결과·synthesis 채택·검증 로그). **자동 병합 금지 대상 여부 확인**(route_builder/Navigation 안전기능 의미충돌 가능성 — project memory PR#8 사례) → 충돌·실패 시 병합하지 말고 사용자 보고.

---

## 7. 검증 계획

| 레벨 | 방법 | 대상/통과 기준 |
|------|------|----------------|
| 단위(pytest) | `streamlit_walk_engine/tests/test_route_builder.py`에 `strip_postcode` 케이스 추가(기존 monkeypatch/순수함수 패턴 재사용) | (1) Nominatim 쉼표형 `"A, 06141, B"` → `"A, B"`(세그먼트 제거·dangling 쉼표/공백 없음) (2) **쉼표로 둘러싸이지 않은 5자리 토큰은 보존**(공백형 임의 5자리·건물 관련 숫자 안 건드림) (3) 건물번호 `152`/`152-3` 보존 (4) 우편번호 없는 문자열 불변(멱등) (5) None/빈 문자열 안전 (6) 좌표 폴백 문자열 `37.50120, 127.03724` 비대상(애초 함수에 안 넘김) — 전부 green |
| 컴파일 | `python -m py_compile streamlit_walk_engine/route_builder.py streamlit_walk_engine/pages/1_Navigation.py` | 에러 0 |
| 회귀 | `python -m pytest streamlit_walk_engine -q` | 기존 테스트 전부 green(안전기능·route 테스트 무회귀) |
| 렌더(가능 시) | Streamlit AppTest로 1_Navigation 렌더 → 출발지 캡션/플레이스홀더 문자열에 우편번호 미포함, 좌표 폴백 분기 정상 | 예외 없이 렌더, 단정 통과 |
| 수동(로컬) | `python -m streamlit run streamlit_walk_engine/...` → 위치 설정 후 출발지 캡션 확인 | 주소 표시(키 있으면 공백형, 없으면 POI형) + 우편번호 없음 |
| 수동(클라우드/실기기) — **사용자 확인 필요** | 모바일 Streamlit Cloud에서 현재 위치 잡고 출발지 "현재 위치" 캡션 확인 | `📍 ...POI..., ..., 대한민국`(우편번호 없음) 표시. **POI는 best-effort** — 좌표가 중도 도로상이면 POI 없이 도로/행정구역만 나올 수 있음(정상). 주소 자체가 안 뜨면 H1 재진단 |

---

## 8. 안전 제약 (불변)

- `engine.py` 코어 비침습. `1_Navigation.py`는 표시 레이어 최소변경.
- 기존 안전기능(accuracy 게이팅·is_fix_usable·도착판정·재경로) 미접촉.
- 좌표 폴백 문자열(`{lat:.5f}, {lon:.5f}`) 변형 금지.
- pytest green 유지(회귀 0).
- main 직접 push 금지 → 작업 브랜치 + PR. 안전기능 의미충돌·검증 실패 시 자동병합 금지·사용자 보고(PR#8 선례).
- Secret/Naver 키 값 출력·하드코딩 금지(존재 여부 bool만 확인).
- 요청 범위(출발지 "현재 위치" 표시 + 우편번호 제거) 밖 리팩토링·기능추가 금지.

---

## 9. 위험 · 미해결 (실기기/클라우드 의존)

- **R1 (형식 보장)**: 사용자가 원하는 "POI 포함 쉼표 형식"은 Nominatim 경로일 때만 자연 충족. 사용자 클라우드에 Naver 키가 있으면(H2) 공백·POI없음 형식이 나옴. → synthesis는 이를 "그대로 수용"으로 흡수하지만, "POI를 반드시"가 요구라면 별도 결정 필요. **클라우드 키 유무 미확정 = 미해결.**
- **R2 (POI best-effort)**: Nominatim도 좌표에 POI가 없으면(중간 도로) POI 미표시. "항상 POI"는 보장 불가. POI 검색 확대는 PR#8 충돌 영역이라 범위 밖.
- **R3 (클라우드 Nominatim 차단) + escalation**: 공유 IP 403/429 가능(H1). 그러면 주소 자체가 안 뜸 → 좌표 폴백. 이 경우 코드 형식 수정만으로 해결 안 됨 → **escalation: 클라우드에 Naver 키를 주입해 Naver reverse 경로를 살린다**(이미 머지된 `d17c67d` "Streamlit Cloud에서 Naver 키 주입" 경로 재사용 = st.secrets에 NAVER_MAPS_CLIENT_ID/SECRET 설정). 키 주입은 비밀값 설정이라 코드 PR이 아니라 배포 설정 작업이며 사용자/운영 승인 필요(키 값 출력 금지).
- **R4 (로컬 재현 한계)**: 개발자 로컬(키 있음)과 사용자 화면(키 없을 수 있음) 결과가 달라 로컬에서 사용자 증상을 그대로 재현 못 할 수 있음.
- **롤백**: 변경은 순수함수 추가 + 저장 직전 1회 호출의 **추가형(additive)** 이라, 문제 시 작업 브랜치 revert로 즉시 원복된다. 좌표 폴백 분기와 안전기능은 미접촉이므로 revert 시 회귀 없음.
- **미해결/사용자 확인 필요 항목**은 `.omc/plans/open-questions.md`에 별도 기록.
