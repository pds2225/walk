# walk 멀티 provider 지도 (검색·지도·공유) — 설계 스펙

- 날짜: 2026-07-09
- 상태: 설계 확정(구현 대기). Milestone 1(엔진) **범위 확장** — 구현은 사용자 승인 후, origin/main 워크트리에서.
- 관련: `streamlit_walk_engine/route_builder.py`(기존 provider 체인), `pages/1_Navigation.py`(UI).

## 1. 목표 / 동기

한국 지도 데이터는 네이버·카카오·TMAP로 갈려 있고, 외국인 사용자는 구글맵이 익숙하다.
walk는 이미 Naver+TMAP+OSM를 "자동 폴백"으로 합쳐 쓰지만, 카카오·구글이 없고 사용자가 provider를 고를 수 없다.
사용자가 **검색 소스를 직접 고르고**, **지도 라벨 언어를 바꾸고**, **목적지를 네이버/카카오/구글맵 링크로 공유**할 수 있게 한다.

## 2. 스코프

### 포함 (3기능)
- A. **검색·주소 provider 선택**: 자동(합침)/네이버/카카오/TMAP/구글.
- B. **지도 1개 + 언어 토글**: 기본 한글, 버튼으로 영문 전환.
- C. **장소 공유 링크**: 목적지의 네이버·카카오·구글맵 URL 생성 + 복사.

### 불포함 (안 함)
- 카카오/네이버 **진짜 JS 지도 임베드**(무거움, 라이선스).
- 유료 쿼터 최적화, 결제.
- `engine.py`·`gps_filter.py` 변경(엔진 코어 불변).

## 3. 아키텍처

얇은 공통 인터페이스 + provider 어댑터. 새 모듈 `streamlit_walk_engine/map_providers.py` 신설.
`route_builder.py`의 기존 검색/역지오코딩 함수는 이 레지스트리를 호출하도록 얇게 연결(기존 자동 폴백 동작 보존, 회귀 방지).

```
Place(dataclass): name, lat, lon, address?, provider, provider_place_id?, category?, distance_m?

class MapProvider(Protocol):
    name: str                                  # "naver" | "kakao" | "tmap" | "google"
    def available() -> bool                    # 키 존재 여부
    def search(query, near: Coordinate|None, limit) -> list[Place]
    def reverse(coord) -> str | None
    def place_url(place: Place) -> str         # 해당 provider 장소 URL

registry:
    all() -> list[MapProvider]
    available() -> list[MapProvider]           # 키 있는 것만
    get(name) -> MapProvider
    search(query, near, provider="auto") -> list[Place]   # auto=폴백체인, else 지정 어댑터
    share_links(place) -> dict[str,str]        # {naver, kakao, google} URL (구글은 항상)
```

- 어댑터: `NaverProvider`, `KakaoProvider`, `TmapProvider`, `GoogleProvider`.
- 카카오 검색 = Kakao Local REST: 키워드 `https://dapi.kakao.com/v2/local/search/keyword.json`, 주소 `.../search/address.json`, 헤더 `Authorization: KakaoAK {KAKAO_REST_API_KEY}`.
- 구글 검색 = Google Places Text Search/Geocoding(키 필요). 없으면 provider 비활성.

## 4. 기능별 상세

### A. 검색 소스 선택
- UI: 검색창 근처 셀렉트박스 `검색 소스` = `["자동"] + registry.available()의 라벨`. 키 없는 provider는 미표시.
- `자동` = 기존 폴백 체인(Naver→TMAP POI→Kakao→Google→Nominatim, 순서 상수화). 특정 provider 선택 시 그 어댑터만 사용, 실패하면 안내 메시지 + 폴백 제안.
- 기존 `geocode_address`/`geocode_suggestions`/`reverse_geocode`는 내부적으로 registry 사용하되 **기존 시그니처·반환형 유지**(1_Navigation.py 최소 변경).

### B. 지도 1개 + 언어 토글
- 기본 타일: 한글(VWorld 또는 현행 OSM). `_build_map`에 `lang`/`tile` 파라미터 추가.
- UI: `지도 언어` 토글 `한국어(기본) / English`. 영문 선택 시 영문 라벨 타일로 swap.
- 영문 타일: **Mapbox 토큰(`MAPBOX_TOKEN`) 있을 때만** 활성(`language=en`). 토큰 없으면 English 옵션 숨김/비활성 → 한글만.
- Plotly mapbox raster layer의 source 교체로 구현(지도 렌더러 교체 아님).

### C. 공유 링크
- 목적지 확정 시 `registry.share_links(place)` → 3개 URL 생성, 목적지/경로 요약 아래에 "🔗 네이버 / 카카오 / 구글맵으로 열기" + 복사 버튼.
- URL 규칙(구체):
  - 네이버: place_id 있으면 `https://map.naver.com/p/entry/place/{id}`, 없으면 `https://map.naver.com/p/search/{quote(name)}`.
  - 카카오: kakao place_id 있으면 `https://place.map.kakao.com/{id}`, 없으면 `https://map.kakao.com/link/map/{quote(name)},{lat},{lon}`.
  - 구글(키 불필요, 항상): `https://www.google.com/maps/search/?api=1&query={lat},{lon}` (+ 이름 병기). place_id 있으면 `&query_place_id={pid}`.
- provider가 준 place_id가 있으면 정확 링크, 없으면 좌표·이름 기반(그래도 열림).

## 5. 설정 / 키 (전부 optional, Secrets에만)

| 키 | 용도 | 없을 때 |
|---|---|---|
| KAKAO_REST_API_KEY | 카카오 검색·주소 | 카카오 검색 옵션 숨김 (발급 완료됨) |
| GOOGLE_MAPS_API_KEY | 구글 검색 | 구글 검색 옵션 숨김 (공유 링크는 키 없이 동작) |
| MAPBOX_TOKEN | 영문 라벨 지도 | English 토글 숨김 |
| TMAP_APP_KEY / NAVER(ncp) / ODSAY_API_KEY | 기존 | 기존 폴백 |

원칙: 키 없으면 조용히 비활성 + 폴백(walk의 "API 키 optional" 원칙 유지). 코드/깃/로그에 키 값 금지.

## 6. 오류 처리 / 폴백
- 각 어댑터는 실패 시 None/[] 반환 → 다음 provider. 최후 OSM/Nominatim, 그래도 없으면 수동 입력.
- 선택 provider 실패 시: 사용자에게 1줄 안내 + "자동으로 전환" 제안.

## 7. 테스트 (핵심만 — feature-first)
- `tests/test_map_providers.py`:
  - URL 빌더(순수 함수) — place_id 유무, 유니코드/공백 이름 quote, 좌표 포맷 등 결정론적 검증(가치 높음).
  - registry.available() 키 유무 분기(env/secrets mock).
  - `자동` vs 지정 provider 라우팅(어댑터 mock).
- 기존 `engine.py`/`gps_filter.py` 테스트 불변(회귀 없음 확인).
- 스모크(수동): 앱 실행 → 키 설정된 provider로 검색 1회 + 공유 3링크 열기 + 지도 언어 토글 확인.

## 8. 리스크 / 메모
- 카카오/네이버/구글 **웹 지도 타일 raw 사용은 ToS 제약** → B는 VWorld/OSM/Mapbox만 사용(각사 지도는 "링크로 열기"로 우회 = C).
- 구글 Places는 결제수단 등록 필요(무료 크레딧 내). → optional로 두어 미설정 시 영향 없음.
- 구현은 로컬 main(origin 뒤처짐) 아닌 **origin/main 워크트리**에서, `1_Navigation.py` 최소 변경, 엔진 불변.

## 9. 오픈 이슈
- 없음(결정 완료). 영문 타일을 Mapbox 대신 다른 무료 소스로 할지는 구현 시 재검토 가능(대안 부재 시 Mapbox).
