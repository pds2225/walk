# K-Navi 망원시장 리얼데이터 데모 — Autonomous Execution Spec

> Repository: `pds2225/walk`
> Active branch: `feat/mangwon-realdata-demo`
> Purpose: 제안용 리얼데이터 Demo를 사용자 중간 개입 없이 코드 범위에서 최대한 완성한다.
> Scope override: 이 문서는 **이번 망원시장 데모에 한해** 기존 TASK의 Roadview/Street View 관련 비목표보다 우선한다. 그 외 기존 K-Navi 동작·아키텍처 보호 원칙은 유지한다.

---

## 0. 최상위 실행 원칙

이번 실행의 목적은 완성형 관광 플랫폼 개발이 아니다.

망원시장 실제 구간에서 아래 흐름을 **실제 데이터로 동작시키는 제안용 Demo**를 만든다.

시장 모바일 지도
→ 실제 점포 확인
→ 점포 선택
→ 실제 점포 상세정보 확인
→ Google Street View에서 현장 확인
→ 현재 위치 획득
→ 선택 점포의 검증된 도착지점까지 K-Navi 보행안내 시작

절대 원칙:
- Mock 점포 금지
- Mock 메뉴/가격 금지
- 가짜 GPS 좌표 금지
- 임의 영업시간 금지
- 임의 점포사진 생성 금지
- 확인되지 않은 사실을 AI가 추정하여 채우지 않는다.
- 확인되지 않은 값은 `null`, `UNKNOWN`, `FIELD_CHECK_REQUIRED` 등 상태값으로 관리한다.
- 기존 정상 기능을 이유 없이 제거하거나 대규모 리팩터링하지 않는다.
- 이번 Demo와 관계없는 기능을 추가하지 않는다.

---

# 1. AUTONOMOUS EXECUTION MODE

사용자는 본 작업에 대해 다음을 사전 승인했다.

- 코드 조사
- 필요한 최소 코드 수정
- 신규 파일 추가
- 테스트 추가/수정
- 의존성 설치
- build / lint / test 실행
- 로컬 브라우저 검증 가능한 범위의 확인
- Git commit
- 현재 작업 브랜치로 push

따라서 중간 단계마다 사용자에게 `진행할까요?`, `계속할까요?`, `승인해 주세요`를 묻지 않는다.

## 자동 진행 규칙

1. FEASIBILITY GATE 수행
2. `GO` 또는 `PARTIAL GO`이면 사용자 승인 대기 없이 구현 진행
3. 구현 → 테스트 → 수정 → 재테스트 반복
4. 코드로 해결 가능한 blocker는 스스로 해결
5. 외부 계정/결제/비밀키/실제 현장 이동 등 사람만 할 수 있는 항목만 `EXTERNAL_ACTION_REQUIRED` 또는 `FIELD_VALIDATION_PENDING`으로 분리
6. 해당 외부 항목이 전체 구현을 막지 않는다면 나머지 작업은 계속 진행
7. 코드 범위 완료 후 commit + push
8. 최종 상태를 `AUTO_CODE_COMPLETE`, `PARTIAL_COMPLETE`, `BLOCKED_EXTERNAL` 중 하나로 보고

사용자가 중간에 응답하지 않는 것은 중단 사유가 아니다.

---

# 2. 병렬 작업 원칙

가능하면 작업을 독립 단위로 분해하여 병렬 처리한다.

권장 역할:

- **Orchestrator**: 전체 범위, 의존성, 통합, 최종 판정
- **Data/Verification**: 실제 점포/좌표/출처/verification
- **Street View/UI**: Street View probe, 상세페이지, 모바일 UX
- **Navigation Integration**: Geolocation → navigationTarget → 기존 K-Navi 연결
- **QA**: 회귀 테스트, lint/build/test, 실사용 플로우 검증

병렬 작업은 서로 같은 파일을 동시에 무리하게 수정하지 않는다.
필요 시 독립 worktree/branch를 사용하고 Orchestrator가 통합한다.

---

# 3. 구현 대상 범위

망원시장 내 아래 구간만 Demo v1 대상으로 한다.

START: `훈훈호떡`

END: `우이락 망원본점`

두 점포 사이 시장 통로의 좌우 점포를 대상으로 한다.

하지 말 것:
- 핵심점포 5개 선정
- 추천점포 선정
- 인기점포 선정

실제 존재가 확인되는 점포를 가능한 한 전부 표현한다.
단, 데이터가 일부만 확보되면 검증된 점포부터 구현하고 나머지는 verification 상태로 둔다.

---

# 4. FEASIBILITY GATE — 반드시 먼저 수행

전체 구현부터 시작하지 않는다.

샘플 점포:
1. 훈훈호떡
2. 맛있는집
3. 부산대원어묵
4. 큐스닭강정
5. 우이락 망원본점

각 점포에 대해 실제로 확인:

A. 실제 점포 존재
B. Google Maps 장소 식별 가능 여부
C. 실제 점포 대표 좌표 확보 가능 여부
D. navigationTarget 설정 가능 여부
E. 점포 또는 인접 위치 Google Street View/Panorama 존재 여부
F. 상세페이지 내부에 interactive Street View 표시 가능 여부
G. 모바일/브라우저 Geolocation 사용 가능 여부
H. 현재 위치 → navigationTarget → 기존 K-Navi routing 연결 가능 여부

Gate 종료 전에는 전체 점포 DB 구축, 전체 UI 구현, 대규모 리팩터링을 하지 않는다.
허용되는 것은 조사, 최소 probe, 최소 테스트 코드, 연결 지점 확인뿐이다.

---

# 5. FEASIBILITY 판정

## GO
핵심 구조가 모두 구현 가능하고 구조적 blocker가 없음.

## PARTIAL GO
일부 점포에서 Street View/Google Place 등 데이터가 부족하지만 다음 흐름 자체는 구현 가능:

점포 선택
→ 상세페이지
→ 실제 현장정보
→ 현재 위치
→ K-Navi 길안내

## BLOCK
다음과 같이 핵심 구조 자체가 기술/정책적으로 구현 불가능:
- Street View 핵심 구현 자체 불가
- 기존 K-Navi routing 연결 자체 불가
- Geolocation 사용 자체 불가
- 정책상 핵심 기능 구현 불가

단순 API key 미설정, billing 미설정, 특정 점포 Street View 미존재는 곧바로 전체 BLOCK으로 판정하지 않는다.

---

# 6. Gate 보고 형식

| 점포 | 실제 존재 | Google Place | Store 좌표 | Navigation Target | Street View | SV 품질 | 상세삽입 | K-Navi 연결 | 판정 |
|---|---|---|---|---|---|---|---|---|---|

추가 기록:
- 검증 소스
- 검증 일자
- 좌표 출처
- Street View panorama와 점포 거리
- Street View 판정 근거
- 문제사항

Gate 결과는 repo 내 적절한 검증 문서 또는 기존 TASK completion record에 남긴다.
별도 task source-of-truth를 새로 만들지 않는다.

GO/PARTIAL GO이면 자동 구현 계속.
BLOCK이면 코드로 해결 가능한 범위를 먼저 모두 소진한 뒤 최종 보고.

---

# 7. 데이터 수집 원칙

1순위:
- 망원시장 공식 홈페이지
  - https://www.mangwonmarket.com/stores-kr?hl=ko-KR

보조 검증:
- Google Maps
- Kakao Map / Roadview
- Naver Map / 거리뷰
- 점포 공식 홈페이지/SNS
- 최근 공개 웹자료

원칙:
- 하나의 지도 서비스만 믿지 않는다.
- 점포 존재, 상호, 주소, 좌우 관계, 출입구, 영업 상태를 가능한 한 교차 검증한다.
- 팩트체크에는 Google/Kakao/Naver를 모두 사용할 수 있다.
- 사용자에게 노출되는 360도 현장 화면은 Google Street View로 통일한다.

---

# 8. 위치 모델 — 반드시 3개를 분리

점포 좌표 하나로 모두 처리하지 않는다.

## storeLocation
점포 자체의 대표 위치.

## navigationTarget
실제 보행 안내 종료점. 가능하면 점포 출입구 또는 점포 앞 시장 통로의 검증된 좌표.

## streetViewLocation
실제로 사용 가능한 Street View panorama의 위치.

세 값은 동일하다고 가정하지 않는다.

navigationTarget 우선순위:
1. 검증된 출입구 좌표
2. 검증된 점포 앞 통로 좌표
3. 현장자료로 확인된 접근점
4. 최후 수단으로 점포 대표 좌표

검증 불가 시 `FIELD_CHECK_REQUIRED`.

---

# 9. Google Street View 구현

이번 Demo는 가능하면 다음 조합을 우선 사용한다.

- Google Maps JavaScript API
- StreetViewService
- StreetViewPanorama

목적:
- panorama 존재 여부 조회
- 주변 panorama 탐색
- 좌표/거리 확인
- heading/pitch 제어
- 상세페이지 내 interactive panorama 표시

다른 서비스 Roadview를 캡처하여 Google 화면처럼 쓰지 않는다.
Street View 이미지 파일을 별도로 캡처/저장하지 않는다.

## 검색 반경 권장

1차: 10m
2차: 25m
3차: 50m

반경은 필요 시 합리적으로 조정 가능하나, 멀리 떨어진 panorama를 무조건 성공 처리하지 않는다.

## 품질 값

- `EXACT_FRONTAGE`
- `NEARBY_VISIBLE`
- `CORRIDOR_VISIBLE`
- `AVAILABLE_BUT_NOT_USEFUL`
- `NOT_AVAILABLE`

Street View 존재 여부와 Demo에 실제 유용한지를 분리한다.

## heading
가능하면 panorama 위치 → navigationTarget/storeLocation bearing을 계산해 초기 heading으로 사용.
필요 시 `headingOverride` 허용.

## panoId / captureDate
- pano ID를 영구 식별자로 가정하지 않는다.
- `lastResolvedPanoId` 수준의 캐시로만 취급.
- 좌표 기반 재조회 가능 구조 유지.
- `captureDate`는 nullable.

---

# 10. Google API / 환경 문제 자동 처리

에이전트는 API 관련 blocker가 나오면 곧바로 사용자에게 멈추지 않는다.

먼저 자동으로 확인:
1. 기존 코드에 사용 가능한 Google Maps 관련 환경변수/설정이 있는지
2. 필요한 API 목록
3. 현재 dependency로 구현 가능한지
4. localhost에서 key 없이 가능한 probe와 key가 필요한 probe 분리
5. Vercel/배포 설정과 코드상 env 이름 일치 여부
6. domain restriction 필요사항
7. billing/API enablement 필요사항

자동으로 해결 가능한 설정/코드 문제는 최대한 해결한다.

### 절대 금지
- API key를 생성한 척하기
- 비밀값을 코드에 하드코딩하기
- `.env`, `.env.*` 내용을 출력하기
- 권한 없는 계정 설정을 우회하기

사람이 Google Cloud Console에서 해야 하는 일이 남는 경우 다음처럼 **한 항목만 명확히 분리**한다.

`EXTERNAL_ACTION_REQUIRED: Google Maps API key/billing/domain restriction`

그 상태에서도 mock adapter/fallback으로 사실상 완료했다고 속이지 않는다.
그러나 key 없이도 개발 가능한 UI/schema/navigation 작업은 계속한다.

---

# 11. Geolocation

모바일 브라우저 기준으로 확인한다.

필수 상태:
- 정상 위치 획득
- 권한 거부
- timeout
- 위치 획득 실패
- low accuracy

예시 상태:
- `LOCATION_PERMISSION_DENIED`
- `LOCATION_TIMEOUT`
- `LOCATION_LOW_ACCURACY`

오류 시 앱 crash 금지.

---

# 12. K-Navi 연결

`여기로 가기` 클릭:

현재 위치 획득
→ navigationTarget 확인
→ 기존 K-Navi routing 입력
→ 경로 생성
→ navigation 상태 시작

외부 Google Maps 길찾기로 넘긴 것을 완료로 인정하지 않는다.

Google = 현장 시각정보
K-Navi = 실제 보행안내

기존 상태기계 유지:

`ON_ROUTE → DRIFTING → DEVIATED → REROUTE`

이번 Demo 때문에 상태기계를 대규모 리팩터링하지 않는다.

---

# 13. Store 데이터 모델 최소 요구사항

```ts
Store {
  id
  nameKo
  nameEn
  category
  address

  storeLocation {
    latitude
    longitude
    source
    verifiedAt
  }

  navigationTarget {
    latitude
    longitude
    source
    verificationStatus
  }

  corridorSide
  corridorOrder

  descriptionKo
  descriptionEn
  businessHours
  closedDays
  products[]
  storeImages[]

  google {
    placeId
    mapsUrl
    lastCheckedAt
  }

  streetView {
    available
    latitude
    longitude
    distanceFromStore
    headingAuto
    headingOverride
    pitch
    lastResolvedPanoId
    captureDate
    quality
    lastCheckedAt
  }

  verification {
    storeExistence
    location
    navigationTarget
    businessHours
    products
    prices
    images
    officialSource
    lastVerifiedAt
    memo
  }
}
```

현재 구현 언어/구조에 맞게 타입은 변환 가능하나 의미를 임의 축소하지 않는다.

---

# 14. Verification

필드별 verification을 사용한다.

- `OFFICIAL_VERIFIED`
- `MULTI_SOURCE_VERIFIED`
- `SINGLE_SOURCE_VERIFIED`
- `FIELD_CHECK_REQUIRED`
- `UNKNOWN`

예:
- 점포 존재 = OFFICIAL_VERIFIED
- 가격 = UNKNOWN
- 영업시간 = SINGLE_SOURCE_VERIFIED

점포 하나에 단일 verification 하나만 붙여 전체 사실을 모두 검증된 것으로 만들지 않는다.

---

# 15. 시장 모바일 지도

망원시장 전체를 구현하지 않는다.
훈훈호떡 ↔ 우이락 구간만 우선 구현한다.

지도 표현에는:
- 실제 latitude/longitude
- corridorSide
- corridorOrder

를 사용한다.

UI에서 마커가 겹치지 않도록 시각적 보정은 가능하나 실제 navigation 계산에는 시각적 배치 좌표를 절대 사용하지 않는다.

`display layout`과 `navigationTarget`을 분리한다.

---

# 16. 점포 카드 / 상세페이지

점포 카드 최소:
- 점포명
- 실제 대표사진(권리/출처 확인 가능 시)
- 업종
- 대표상품/메뉴
- 짧은 소개

상세페이지 우선순위:
1. 점포명
2. 대표사진
3. 한줄 소개
4. 대표 메뉴/상품
5. 가격
6. 영업시간
7. 위치
8. Google Street View
9. `여기로 가기`

정보 미확인 시 임의 생성 금지.
예: `가격 정보 확인 중`, `영업시간 확인 중`.

가상의 점포 사진 금지.

---

# 17. 이미지 권리 관리

최소 구조:

```ts
StoreImage {
  url
  sourceType
  sourceUrl
  attribution
  usageStatus
}
```

usageStatus:
- APPROVED
- OFFICIAL_SOURCE
- ATTRIBUTION_REQUIRED
- RIGHTS_CHECK_REQUIRED
- DO_NOT_USE

권리 불명확 이미지는 `RIGHTS_CHECK_REQUIRED`.

---

# 18. 이번 Demo에서 하지 않는 것

- 추천 AI
- 개인화 추천
- 결제
- 쿠폰
- 구매전환 분석
- 복잡한 관광코스 생성
- 전체 망원시장 구현
- 제주 기능
- B2G 관리자 대시보드
- CRM
- AI Agent 기능 추가
- 새로운 navigation algorithm
- 기존 상태기계 전면 리팩터링
- UI 전면 리디자인

---

# 19. 개발 순서

1. 기존 K-Navi 코드/테스트/실행경로 파악
2. Street View / Store Detail / Navigation 연결 지점 확인
3. 5개 점포 FEASIBILITY probe
4. GO / PARTIAL GO / BLOCK 판정
5. GO/PARTIAL GO면 자동으로 Store schema 구현
6. 검증된 실제 점포 데이터 입력
7. 망원시장 모바일 지도 구현
8. 점포 카드/선택 interaction 구현
9. 상세페이지 구현
10. Street View 구현
11. 현재 위치 → navigationTarget → K-Navi 연결
12. build/lint/test/브라우저 검증
13. 가능한 모바일 검증
14. 훈훈호떡 → 우이락 구간 Demo 검증
15. commit + push
16. 최종 보고

`1기능 = 1작업 = 1검증` 원칙을 유지한다.

---

# 20. Self-healing / blocker 규칙

오류가 발생하면 다음 기능으로 무시하고 넘어가지 않는다.

코드/패키지/설정 오류는 다음 순서로 해결:
1. 원인 재현
2. 기존 구현/문서 확인
3. 최소 수정
4. 재검증
5. 필요 시 대체 구현 검토

같은 blocker에서 의미 없는 동일 시도를 반복하지 않는다.

다음 유형만 외부 blocker로 인정:
- Google Cloud 사용자 계정에서만 가능한 API enable/billing
- 새 비밀키 발급/복사
- OAuth/서비스 약관에 대한 사용자 승인
- 실제 망원시장 현장 보행
- 사람이 직접 확인해야 하는 점포 출입구/폐업 여부 등

외부 blocker 하나 때문에 독립적으로 가능한 나머지 개발을 중지하지 않는다.

---

# 21. 테스트 / 회귀 방지

각 작업 후 가능한 범위에서:
- 기존 test
- 신규 unit test
- lint
- build 또는 앱 startup
- 실제 브라우저 흐름

을 확인한다.

기존 AGENTS.md의 빠른 테스트 지침을 우선 참고한다.

기존 정상 K-Navi navigation 기능이 깨지면 완료가 아니다.

---

# 22. Git 규칙 — 이번 작업에 대한 명시적 승인

이번 작업에서는 사용자가 commit + push를 명시적으로 승인했다.

단:
- `main`에 직접 작업하지 않는다.
- `feat/mangwon-realdata-demo`에서 작업한다.
- `.env`, secret, runtime log, cache는 커밋 금지.
- commit 전 `git status --short` 확인.
- 가능한 작은 단위 commit을 사용한다.
- 최종 상태가 테스트 기준을 만족하면 branch에 push한다.

main merge는 자동으로 하지 않는다.

---

# 23. 현장 검증

에이전트가 실제 망원시장을 걸을 수 없으므로 다음은 `FIELD_VALIDATION_PENDING`으로 허용한다.

- 점포 출입구의 최종 현장 좌표 검증
- GNSS 오차가 실제 시장 통로에서 미치는 영향
- 실제 걸어서 선택 점포 근처 도착 여부
- Street View 화면과 눈앞 점포의 최종 시각 일치

현장 검증 미실시를 코드 실패로 숨기지 않는다.

코드/자동 테스트/브라우저 범위가 완료되면:

`AUTO_CODE_COMPLETE + FIELD_VALIDATION_PENDING`

으로 종료 가능하다.

---

# 24. 최종 완료 시나리오

코드 레벨 완료 기준:

1. K-Navi 접속
2. 망원시장 Demo 선택
3. 훈훈호떡~우이락 구간 표시
4. 검증된 실제 점포 표시
5. 점포 선택
6. 실제 상세정보 표시
7. Google Street View 표시 또는 명시적 실제 fallback
8. 사용자가 Street View 회전 가능
9. `여기로 가기` 선택
10. 위치 획득
11. navigationTarget으로 K-Navi 경로 생성
12. K-Navi 보행안내 시작
13. 기존 핵심 navigation 회귀 테스트 통과

실제 현장 도착은 FIELD validation로 분리 가능.

---

# 25. 매 응답 보고 형식

응답에는 다음 4개만 간결하게 표시한다.

## 한일
완료 작업.

## 하고있는일
현재 작업 1개.

## 할일
다음 작업 1개.

## 문제
없음 / blocker / external action.

긴 콘솔 로그, 내부 추론, 저수준 코드 dump는 기본 노출하지 않는다.

---

# 26. 최종 보고

반드시 다음을 포함한다.

- 최종 상태: `AUTO_CODE_COMPLETE` / `PARTIAL_COMPLETE` / `BLOCKED_EXTERNAL`
- FEASIBILITY 결과표
- 구현된 실제 점포 수
- Street View 가능 점포 수
- fallback 점포 수
- 테스트 결과
- 수정 파일 요약
- commit SHA
- push branch
- `EXTERNAL_ACTION_REQUIRED` 목록
- `FIELD_VALIDATION_PENDING` 목록

다음 작업은 최대 1개만 제시한다.

---

# 27. 지금 시작할 단일 명령

이 문서를 전부 읽고 현재 repository 상태를 audit한 뒤, **Autonomous Execution Mode로 망원시장 Real Data Demo를 끝까지 수행한다.**

5개 실제 점포 FEASIBILITY GATE부터 시작한다.

GO/PARTIAL GO이면 중간 승인 없이 구현·테스트·수정·commit·push까지 계속한다.

사람만 할 수 있는 일은 `EXTERNAL_ACTION_REQUIRED` 또는 `FIELD_VALIDATION_PENDING`으로 분리하고, 그 항목이 다른 작업을 막지 않는 한 계속 진행한다.
